// uain-agent 0.2.27: `feedback` sends a private report to the UAIN team through the real BAINK server code.
// Unsigned before a key exists (receipt token kept on this machine), signed after; saved before it is sent,
// so a lost answer is retried with the same requestId and never stored twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createBainkServer } from '../server/app.mjs';
import * as kit from './uain-agent.mjs';

async function server(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'uain-agent-feedback-bk-'));
  const app = await createBainkServer({ dataDir, publicOrigin: 'http://127.0.0.1', projectsSource: null, catalogueDir: null, tradeMode: 'open' });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  // The kit sends its origin as Origin; the fixture server accepts its own listening origin.
  await app.close();
  const app2 = await createBainkServer({ dataDir, publicOrigin: url, projectsSource: null, catalogueDir: null, tradeMode: 'open' });
  await new Promise((r) => app2.server.listen(Number(new URL(url).port), '127.0.0.1', r));
  t.after(async () => { await app2.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { url, dataDir, rows: () => { const db = new DatabaseSync(join(dataDir, 'feedback.sqlite')); try { return db.prepare('SELECT * FROM reports ORDER BY created_at').all(); } finally { db.close(); } } };
}
async function home(t) {
  const dir = await mkdtemp(join(tmpdir(), 'uain-agent-feedback-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('before a key: an unsigned report, its receipt token saved 0600 on this machine and never printed; status reads it', async (t) => {
  const s = await server(t);
  const o = { home: await home(t), url: s.url };
  const r = await kit.ops.feedback(o, { category: 'bug', summary: 'enrol said pending for an hour', details: 'next keeps saying wait', stage: 'enrol', errorCode: 'step_unsettled' });
  assert.match(r.report, /^FB-/);
  assert.equal(r.signed, false);
  assert.equal(r.receiptToken, undefined, 'the token is kept on disk, not shown');
  const file = join(o.home, 'default', 'feedback.json');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  const entry = Object.values(saved.reports)[0];
  assert.match(entry.receiptToken, /^[a-f0-9]{64}$/);
  assert.match(entry.fields.clientVersion, /^\d+\.\d+\.\d+$/);
  const rows = s.rows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].member, null);
  assert.equal(rows[0].client, 'uain-agent');
  const st = await kit.ops.feedbackStatus(o);
  assert.equal(st.reports[0].report, r.report);
  assert.equal(st.reports[0].status, 'new');
});

test('with a key: the report is signed and tied to the member address; status reads it with the key', async (t) => {
  const s = await server(t);
  const o = { home: await home(t), url: s.url, offline: true };
  const id = await kit.initIdentity(o);
  await kit.api(o, 'POST', '/api/account', { displayName: 'Agent' }, await kit.loadIdentity(o));
  const r = await kit.ops.feedback(o, { category: 'suggestion', summary: 'show the reviewer reason in status' });
  assert.equal(r.signed, true);
  assert.equal(s.rows()[0].member, id.address);
  const st = await kit.ops.feedbackStatus(o);
  assert.equal(st.reports[0].status, 'new');
});

test('a lost answer: --retry sends the saved report again with the same requestId, and it is stored once', async (t) => {
  const s = await server(t);
  const o = { home: await home(t), url: s.url };
  let drop = true;
  o.fetch = async (url, init) => {
    const response = await fetch(url, init);
    if (drop && new URL(url).pathname === '/api/public/feedback') { drop = false; throw new TypeError('socket hang up'); }
    return response;
  };
  await assert.rejects(kit.ops.feedback(o, { category: 'bug', summary: 'the task page 404s' }), (e) => e.code === 'outcome_unknown' && /--retry/.test(e.message));
  assert.equal(s.rows().length, 1, 'the server stored it; only the answer was lost');
  const r = await kit.ops.feedback(o, { retry: true });
  assert.match(r.report, /^FB-/);
  assert.equal(s.rows().length, 1, 'never stored twice');
  assert.equal((await kit.ops.feedbackStatus(o)).reports.length, 1);
  await assert.rejects(kit.ops.feedback(o, { retry: true }), /no unsent report/);
});

test('a refused report (a secret pasted in) is not kept on this machine and nothing is stored', async (t) => {
  const s = await server(t);
  const o = { home: await home(t), url: s.url };
  await assert.rejects(kit.ops.feedback(o, { category: 'bug', summary: 'it fails', details: 'token ghp_' + 'a'.repeat(36) }), (e) => e.code === 'feedback_secret_refused');
  const saved = JSON.parse(await readFile(join(o.home, 'default', 'feedback.json'), 'utf8').catch(() => '{"reports":{}}'));
  assert.deepEqual(saved.reports, {});
  assert.equal(s.rows().length, 0);
});

test('MCP uain_agent_feedback: a report needs confirm; reading status does not', async (t) => {
  const s = await server(t);
  const o = { home: await home(t), url: s.url };
  const call = (args) => kit.handleMcp(o, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'uain_agent_feedback', arguments: args } });
  const unconfirmed = JSON.parse((await call({ category: 'bug', summary: 'a short summary' })).result.content[0].text);
  assert.equal(unconfirmed.error, 'confirmation_required');
  assert.equal(s.rows().length, 0);
  const sent = JSON.parse((await call({ category: 'bug', summary: 'a short summary', confirm: true })).result.content[0].text);
  assert.match(sent.report, /^FB-/);
  const status = JSON.parse((await call({ status: true })).result.content[0].text);
  assert.equal(status.reports[0].report, sent.report);
  assert.ok(kit.MCP_TOOLS.some((x) => x.name === 'uain_agent_feedback'));
  assert.match(kit.MCP_INSTRUCTIONS, /uain_agent_feedback/);
});

test('CLI: feedback sends, feedback status lists; bad input names the flag', async (t) => {
  const s = await server(t);
  const h = await home(t);
  const out = [];
  const write = process.stdout.write.bind(process.stdout), err = process.stderr.write.bind(process.stderr);
  process.stdout.write = (x) => { out.push(String(x)); return true; };
  process.stderr.write = (x) => { out.push(String(x)); return true; };
  try {
    process.env.UAIN_AGENT_HOME = h;
    assert.equal(await kit.main(['feedback', '--category', 'bug', '--summary', 'join answered 500', '--stage', 'join', '--url', s.url]), 0);
    assert.equal(await kit.main(['feedback', 'status', '--url', s.url]), 0);
    assert.equal(await kit.main(['feedback', '--category', 'nope', '--summary', 'x', '--url', s.url]), 1);
  } finally { process.stdout.write = write; process.stderr.write = err; delete process.env.UAIN_AGENT_HOME; }
  const text = out.join('');
  assert.match(text, /"report": "FB-/);
  assert.match(text, /"status": "new"/);
  assert.match(text, /--category is one of bug, task-review, suggestion/);
  assert.equal(s.rows().length, 1);
});
