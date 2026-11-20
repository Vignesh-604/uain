#!/usr/bin/env node
/**
 * House kit MCP gate (19 November 2026): the only way a Codex house agent reaches its kit.
 *
 * Codex always has a shell tool, so unlike Claude (which runs with no file or shell tools)
 * a Codex model could read any file its own user can read. The house runner therefore keeps
 * the kit key under its own user and runs Codex as a different user (`uain-house-codex`)
 * that cannot read it. The runner serves the kit through this gate on a unix socket, and
 * Codex reaches the socket through `bridge`, a plain stdio pipe that needs no key.
 *
 * The gate imports the pinned kit and calls its exported `handleMcp` in this process. It
 * lists and runs only the allowed tools (read, join, submit; read only in a dry run).
 * Payment, trade, identity and key tools are neither listed nor callable, whether named
 * `uain_agent_*` or the earlier `baink_agent_*`. A shell command that talks to the socket
 * gets the same allowed tools as the model and nothing else.
 *
 *   node house-kit-mcp-gate.mjs bridge SOCKET      # stdio <-> socket, run by Codex
 *
 * `serveGate` is used by house-kit-agent.mjs; it is not a standalone daemon.
 */
import { createConnection, createServer } from 'node:net';
import { chmodSync, realpathSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PREFIX = 'uain_agent_';
const LEGACY = 'baink_agent_';
const MAX_LINE = 4 * 1024 * 1024;

/** `baink_agent_x` and `uain_agent_x` are the same tool; compare on the current name. */
export const canonical = (name) => (typeof name === 'string' && name.startsWith(LEGACY) ? PREFIX + name.slice(LEGACY.length) : name);

/**
 * One MCP message through the gate. `handle` is the kit's handleMcp bound to the agent's home;
 * `allowed` holds canonical tool names. Returns the reply, or null for a notification.
 */
export async function gateMessage(handle, allowed, message) {
  const { id, method, params = {} } = message ?? {};
  if (method === 'tools/call') {
    const name = canonical(params?.name);
    if (!allowed.has(name)) {
      return id === undefined ? null : { jsonrpc: '2.0', id, result: { isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: 'tool_not_available', message: 'This house agent cannot use that tool. Nothing was sent.' }) }] } };
    }
    return handle({ ...message, params: { ...params, name } });
  }
  const answer = await handle(message);
  if (method === 'tools/list' && answer?.result?.tools) {
    return { ...answer, result: { ...answer.result, tools: answer.result.tools.filter((t) => allowed.has(canonical(t.name))) } };
  }
  return answer;
}

/**
 * Serve the gate on a unix socket until the returned close() is called. The socket is made
 * group-readable and -writable so the Codex user (a member of the socket's group) can connect.
 */
export async function serveGate({ socketPath, kitPath, home, allowed, socketMode = 0o660 }) {
  const kit = await import(pathToFileURL(kitPath).href);
  if (typeof kit.handleMcp !== 'function') throw Object.assign(new Error('pinned kit has no handleMcp'), { code: 'house_kit_refused' });
  const allow = new Set([...allowed].map(canonical));
  const handle = (message) => kit.handleMcp({ home }, message);
  try { unlinkSync(socketPath); } catch { /* none left over */ }
  const server = createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let chain = Promise.resolve();
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > MAX_LINE) { socket.destroy(); return; }
      let at;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at).trim(); buffer = buffer.slice(at + 1);
        if (!line) continue;
        // Answer in order: one message at a time per connection, as the kit's own stdio loop does.
        chain = chain.then(async () => {
          let answer;
          try { answer = await gateMessage(handle, allow, JSON.parse(line)); } catch { answer = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }; }
          if (answer && !socket.destroyed) socket.write(JSON.stringify(answer) + '\n');
        });
      }
    });
  });
  await new Promise((ok, bad) => { server.once('error', bad); server.listen(socketPath, ok); });
  chmodSync(socketPath, socketMode);
  return {
    close: () => new Promise((ok) => { server.close(() => ok()); try { unlinkSync(socketPath); } catch { /* gone */ } }),
  };
}

/** stdio <-> socket. Holds no key and checks nothing: the gate on the other end decides. */
export function bridge(socketPath, input = process.stdin, output = process.stdout) {
  const socket = createConnection(socketPath);
  socket.on('error', (e) => { process.stderr.write('house-kit-mcp-gate bridge: ' + e.code + '\n'); process.exitCode = 1; input.destroy?.(); });
  input.pipe(socket);
  socket.pipe(output);
  input.on('end', () => socket.end());
  return socket;
}

const invokedPath = (() => { try { return realpathSync(resolve(process.argv[1] ?? '')); } catch { return null; } })();
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  const [mode, socketPath] = process.argv.slice(2);
  if (mode !== 'bridge' || !socketPath) { process.stderr.write('usage: house-kit-mcp-gate.mjs bridge SOCKET\n'); process.exitCode = 2; }
  else bridge(socketPath);
}
