import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canonical, gateMessage, serveGate } from './house-kit-mcp-gate.mjs';

const ALLOWED = ['uain_agent_status', 'uain_agent_tasks', 'baink_agent_submit'];
const KIT = `
export const calls = [];
const TOOLS = ['uain_agent_status', 'uain_agent_tasks', 'uain_agent_submit', 'uain_agent_pay', 'uain_agent_init', 'uain_agent_backup'];
export async function handleMcp(o, m) {
  calls.push({ home: o.home, method: m.method, name: m.params?.name });
  if (m.id === undefined) return null;
  if (m.method === 'tools/list') return { jsonrpc: '2.0', id: m.id, result: { tools: TOOLS.map((name) => ({ name })) } };
  if (m.method === 'tools/call') return { jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify({ ran: m.params.name, home: o.home }) }] } };
  return { jsonrpc: '2.0', id: m.id, result: { method: m.method } };
}`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'house-gate-'));
  const kitPath = join(root, 'kit.mjs');
  writeFileSync(kitPath, KIT);
  return { root, kitPath, socketPath: join(root, 'gate.sock'), home: join(root, 'agent-home') };
}

/** Send messages over the socket and collect one reply per message that has an id. */
function talk(socketPath, messages) {
  return new Promise((ok, bad) => {
    const want = messages.filter((m) => m.id !== undefined).length;
    const replies = [];
    let buffer = '';
    const s = createConnection(socketPath);
    s.setEncoding('utf8');
    s.on('error', bad);
    s.on('data', (d) => {
      buffer += d;
      let at;
      while ((at = buffer.indexOf('\n')) >= 0) { replies.push(JSON.parse(buffer.slice(0, at))); buffer = buffer.slice(at + 1); }
      if (replies.length === want) { s.end(); ok(replies); }
    });
    for (const m of messages) s.write(JSON.stringify(m) + '\n');
  });
}

test('earlier and current tool names are the same tool', () => {
  assert.equal(canonical('baink_agent_pay'), 'uain_agent_pay');
  assert.equal(canonical('uain_agent_pay'), 'uain_agent_pay');
  assert.equal(canonical(undefined), undefined);
});

test('the gate lists only allowed tools and refuses every other call before the kit sees it', async () => {
  const { kitPath, socketPath, home } = fixture();
  const gate = await serveGate({ socketPath, kitPath, home, allowed: ALLOWED });
  try {
    assert.equal(statSync(socketPath).mode & 0o777, 0o660, 'the Codex group can connect; others cannot');
    const [init, list, status, submit, pay, legacyPay, init2] = await talk(socketPath, [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'uain_agent_status', arguments: {} } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'baink_agent_submit', arguments: { task: 'T' } } },
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'uain_agent_pay', arguments: { to: 'x' } } },
      { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'baink_agent_backup', arguments: {} } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'uain_agent_init', arguments: {} } },
    ]);
    assert.equal(init.result.method, 'initialize');
    assert.deepEqual(list.result.tools.map((t) => t.name), ['uain_agent_status', 'uain_agent_tasks', 'uain_agent_submit']);
    assert.deepEqual(JSON.parse(status.result.content[0].text), { ran: 'uain_agent_status', home });
    assert.equal(JSON.parse(submit.result.content[0].text).ran, 'uain_agent_submit', 'an earlier name reaches the current tool');
    for (const r of [pay, legacyPay, init2]) {
      assert.equal(r.result.isError, true);
      assert.equal(JSON.parse(r.result.content[0].text).error, 'tool_not_available');
    }
    const kit = await import(kitPath);
    assert.ok(!kit.calls.some((c) => ['uain_agent_pay', 'baink_agent_backup', 'uain_agent_backup', 'uain_agent_init'].includes(c.name)), 'forbidden calls never reach the kit');
  } finally {
    await gate.close();
  }
  assert.equal(existsSync(socketPath), false, 'the socket is removed on close');
});

test('a malformed line gets a parse error and the connection keeps working', async () => {
  const { kitPath, socketPath, home } = fixture();
  const gate = await serveGate({ socketPath, kitPath, home, allowed: ALLOWED });
  try {
    const replies = await new Promise((ok) => {
      const s = createConnection(socketPath); s.setEncoding('utf8');
      let buffer = ''; const out = [];
      s.on('data', (d) => { buffer += d; let at; while ((at = buffer.indexOf('\n')) >= 0) { out.push(JSON.parse(buffer.slice(0, at))); buffer = buffer.slice(at + 1); } if (out.length === 2) { s.end(); ok(out); } });
      s.write('{not json\n');
      s.write(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' }) + '\n');
    });
    assert.equal(replies[0].error.code, -32700);
    assert.equal(replies[1].id, 9);
  } finally { await gate.close(); }
});

test('gateMessage passes notifications through and answers nothing for them', async () => {
  const seen = [];
  const handle = async (m) => { seen.push(m.method); return null; };
  assert.equal(await gateMessage(handle, new Set(), { jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal(await gateMessage(handle, new Set(), { jsonrpc: '2.0', method: 'tools/call', params: { name: 'uain_agent_pay' } }), null);
  assert.deepEqual(seen, ['notifications/initialized'], 'a refused call is never handed to the kit');
});
