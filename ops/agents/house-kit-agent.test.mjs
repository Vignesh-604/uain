import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readdirSync, readFileSync, chmodSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { cycle, claudeArgs, validateConfig, housePrompt, inspect, MODEL, FORBIDDEN_TOOLS } from './house-kit-agent.mjs';

const fake = (o) => { const f = fakeRunner(o); return { runner: f.runner, listTasks: f.listTasks }; };
const sha = (s) => createHash('sha256').update(s).digest('hex');

function setup({ limits } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'house-kit-'));
  chmodSync(root, 0o700);
  writeFileSync(join(root, 'kit.mjs'), 'kit');
  writeFileSync(join(root, 'claude'), 'claude');
  const config = {
    schema: 'uain-house-kit-agent-config-v1', node: '/usr/bin/node', model: MODEL,
    kit: { path: join(root, 'kit.mjs'), sha256: sha('kit') }, claude: { path: join(root, 'claude'), sha256: sha('claude') },
    agents: [{ name: 'alpha', home: join(root, 'alpha') }, { name: 'beta', home: join(root, 'beta') }],
    stateDir: join(root, 'state'), stopFile: join(root, 'STOP'), timeoutMs: 600000, maxTurns: 40, ...(limits ? { limits } : {}),
  };
  return { root, config };
}

/** Fake kit and Claude: the kit answers status/history; Claude answers with the given result. */
function fakeRunner({ claudeResult, afterSubmit = true, claimable = 30 } = {}) {
  const calls = [];
  let submitted = false;
  const runner = async (command, args, { env, input }) => {
    calls.push({ command, args, env, input });
    if (args[1] === 'status') return { code: 0, stdout: JSON.stringify({ address: 'uain1' + 'a'.repeat(40), licence: 'active', earnedAI$: submitted ? '0' : '0' }) };
    if (args[1] === 'history') {
      const steps = submitted && afterSubmit ? [{ operation: 'central_submit', submission: 'CS-1', task: 'T-1', status: 'finalized', outcome: 'under_review', review: 'recorded; waiting' }] : [];
      return { code: 0, stdout: JSON.stringify({ address: 'uain1' + 'a'.repeat(40), steps }) };
    }
    submitted = true;
    return { code: 0, stdout: JSON.stringify({ type: 'system', subtype: 'init' }) + '\n' + JSON.stringify(claudeResult) + '\n' };
  };
  const listTasks = async () => ({ claimableCount: claimable, more: false,
    tasks: Array.from({ length: claimable }, (_, i) => ({ id: `T-OPP-${String(i).padStart(5, '0')}-1-prior-art-survey-r2-p1`, project: 'P', title: 't', level: i % 2 ? 'starter' : 'standard', survey: true })) });
  return { runner, calls, listTasks };
}

const ok = (models = { [MODEL]: { costUSD: 0.4 } }, outcome = 'submitted') => ({ type: 'result', subtype: 'success', is_error: false, num_turns: 12, total_cost_usd: 0.4,
  modelUsage: models, structured_output: { outcome, task: 'T-1', submission: 'CS-1', survey: outcome === 'dry_run' ? 'filled text' : '', notes: 'done' } });

test('config refuses any model but Sonnet', () => {
  const { config } = setup();
  assert.throws(() => validateConfig({ ...config, model: 'claude-opus-5-5' }), /claude-sonnet-5-5/);
  assert.equal(validateConfig(config), config);
});

test('a displayName is the name in the prompt; the slug stays the folder', async () => {
  const { config } = setup();
  config.agents[0].displayName = 'Nora Quill';
  assert.equal(validateConfig(config), config);
  for (const bad of [' Nora', 'N', 'a"b', 'x\ny', 7]) assert.throws(() => validateConfig({ ...config, agents: [{ ...config.agents[0], displayName: bad }] }), /displayName/);
  const f = fakeRunner({ claudeResult: ok() });
  const r = await cycle({ config, runner: f.runner, listTasks: f.listTasks, env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } });
  assert.equal(r.agent.name, 'alpha');
  const sent = f.calls.find((c) => c.command === config.claude.path);
  assert.match(String(sent.input ?? '') + sent.args.join(' '), /You are "Nora Quill"/);
});

test('the model never gets payment, trade, key or shell tools; a dry run cannot join or submit', () => {
  const { config } = setup();
  const live = claudeArgs({ config, agent: config.agents[0], dryRun: false });
  const dry = claudeArgs({ config, agent: config.agents[0], dryRun: true });
  const value = (args, flag) => args[args.indexOf(flag) + 1];
  assert.equal(value(live, '--tools'), 'WebSearch,WebFetch');
  assert.equal(value(live, '--model'), MODEL);
  assert.match(value(live, '--allowedTools'), /baink_agent_submit/);
  assert.doesNotMatch(value(dry, '--allowedTools'), /baink_agent_(submit|join)/);
  assert.match(value(dry, '--disallowedTools'), /baink_agent_submit/);
  for (const t of FORBIDDEN_TOOLS) {
    assert.doesNotMatch(value(live, '--allowedTools'), new RegExp(t + '(,|$)'));
    assert.match(value(live, '--disallowedTools'), new RegExp(t));
  }
  assert.doesNotMatch(value(live, '--allowedTools'), /Bash|Read|Write|Edit/);
  assert.match(value(live, '--allowedTools'), /mcp__uain-agent__uain_agent_submit/, 'kit 0.2.23+ names are allowed too');
  assert.doesNotMatch(value(dry, '--allowedTools'), /uain_agent_(submit|join)/);
  for (const t of FORBIDDEN_TOOLS.map((x) => x.replace('baink_agent_', 'uain_agent_'))) {
    assert.doesNotMatch(value(live, '--allowedTools'), new RegExp(t + '(,|$)'));
    assert.match(value(live, '--disallowedTools'), new RegExp(t + '(,|$)'));
  }
  assert.match(housePrompt({ name: 'a', dryRun: false, toolNames: 'uain' }), /Call uain_agent_status/);
  assert.match(housePrompt({ name: 'a', dryRun: false }), /Call baink_agent_status/, 'the default prompt is unchanged');
  const mcp = JSON.parse(value(live, '--mcp-config'));
  assert.equal(mcp.mcpServers['uain-agent'].env.UAIN_AGENT_HOME, join(config.agents[0].home, 'agent-home'));
  assert.match(housePrompt({ name: 'alpha', dryRun: true }), /DRY RUN: do not join or submit/);
});

test('a STOP file stops the cycle before any call', async () => {
  const { config } = setup();
  writeFileSync(config.stopFile, 'stop');
  const { runner, calls, listTasks } = fakeRunner({ claudeResult: ok() });
  const r = await cycle({ config, runner, listTasks, env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } });
  assert.equal(r.outcome, 'stopped');
  assert.equal(calls.length, 0);
});

test('a cycle reserves budget, runs Sonnet once, and writes a disclosed receipt', async () => {
  const { config } = setup();
  const { runner, calls, listTasks } = fakeRunner({ claudeResult: ok() });
  const r = await cycle({ config, runner, listTasks, env: { CLAUDE_CODE_OAUTH_TOKEN: 't', HOME: '/root' } });
  assert.equal(r.outcome, 'submitted');
  assert.equal(r.agent.name, 'alpha');
  assert.deepEqual(r.reportedModels, [MODEL]);
  assert.equal(r.controlledBySameOperator, true);
  assert.equal(r.outsideAdoption, false);
  assert.equal(r.after.newSubmissions[0].submission, 'CS-1');
  const claude = calls.find((c) => c.command === config.claude.path);
  assert.deepEqual(Object.keys(claude.env).sort(), ['ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', 'CLAUDE_CODE_OAUTH_TOKEN', 'DISABLE_AUTOUPDATER', 'HOME', 'LANG', 'PATH', 'TMPDIR']);
  assert.equal(claude.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, MODEL);
  assert.equal(readdirSync(join(config.stateDir, 'transcripts')).length, 1);
  assert.equal(readdirSync(join(config.stateDir, 'receipts')).length, 1);
  const status = inspect(config).budget;
  assert.equal(status.totalUsd, 0.4);
  assert.equal(status.openReservations, 0);
  // Round robin: the next cycle takes the second agent.
  const second = await cycle({ config, ...fake({ claudeResult: ok() }), env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } });
  assert.equal(second.agent.name, 'beta');
});

test('any other reported model holds every later cycle', async () => {
  const { config } = setup();
  const r = await cycle({ config, ...fake({ claudeResult: ok({ [MODEL]: {}, 'claude-opus-5-5': {} }) }), env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } });
  assert.equal(r.hold, 'model_mismatch');
  assert.ok(existsSync(join(config.stateDir, 'HOLD')));
  const { runner, calls, listTasks } = fakeRunner({ claudeResult: ok() });
  const next = await cycle({ config, runner, listTasks, env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } });
  assert.equal(next.reason, 'hold_file');
  assert.equal(calls.length, 0);
});

test('an exhausted daily cap pauses without calling the model', async () => {
  const { config } = setup({ limits: { perCallUsd: 1, dailyUsd: 1, totalUsd: 5 } });
  await cycle({ config, ...fake({ claudeResult: { ...ok(), total_cost_usd: 1 } }), env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } });
  const { runner, calls, listTasks } = fakeRunner({ claudeResult: ok() });
  const r = await cycle({ config, runner, listTasks, env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } });
  assert.equal(r.outcome, 'paused');
  assert.equal(r.reason, 'compute_budget');
  assert.equal(calls.filter((c) => c.command === config.claude.path).length, 0);
});

test('API credentials and a changed kit are refused', async () => {
  const { config } = setup();
  await assert.rejects(cycle({ config, ...fake({ claudeResult: ok() }), env: { CLAUDE_CODE_OAUTH_TOKEN: 't', ANTHROPIC_API_KEY: 'k' } }), /API credentials/);
  writeFileSync(config.kit.path, 'changed');
  await assert.rejects(cycle({ config, ...fake({ claudeResult: ok() }), env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } }), /pinned file changed/);
});

test('a dry run keeps the filled text owner-only and out of the receipt', async () => {
  const { config } = setup();
  const r = await cycle({ config, dryRun: true, ...fake({ claudeResult: ok(undefined, 'dry_run') }), env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } });
  assert.equal(r.mode, 'dry-run');
  assert.equal(r.surveySha256, sha('filled text'));
  assert.ok(!JSON.stringify(r).includes('filled text'));
  const files = readdirSync(join(config.stateDir, 'dry-run'));
  assert.equal(readFileSync(join(config.stateDir, 'dry-run', files[0]), 'utf8'), 'filled text');
});

test('a house agent leaves scarce paid work to members', async () => {
  const { config } = setup();
  const { runner, calls, listTasks } = fakeRunner({ claudeResult: ok(), claimable: 9 });
  const r = await cycle({ config, runner, listTasks, env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } });
  assert.equal(r.outcome, 'left_for_members');
  assert.equal(r.claimableBefore, 9);
  assert.equal(calls.filter((c) => c.command === config.claude.path).length, 0);
  assert.equal(inspect(config).budget.receipts, 0);
});

test('the prompt offers starter survey parts first, from the full list', async () => {
  const { config } = setup();
  const { runner, calls, listTasks } = fakeRunner({ claudeResult: ok(), claimable: 12 });
  const r = await cycle({ config, runner, listTasks, env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } });
  assert.equal(r.offered.length, 8);
  const prompt = calls.find((c) => c.command === config.claude.path).input;
  assert.match(prompt, /T-OPP-00001-1-prior-art-survey-r2-p1 \(project P, starter/);
  assert.ok(prompt.indexOf('starter') < prompt.indexOf('standard'));
});

test('a transient task-list failure is retried once', async () => {
  const { config } = setup();
  config.listRetryMs = 0;
  const f = fakeRunner({ claudeResult: ok() });
  let calls = 0;
  const flaky = async (a) => { calls++; if (calls === 1) throw Object.assign(new Error('x'), { code: 'central_proof_unavailable' }); return f.listTasks(a); };
  const r = await cycle({ config, runner: f.runner, listTasks: flaky, env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } });
  assert.equal(calls, 2);
  assert.equal(r.outcome, 'submitted');
  const g = fakeRunner({ claudeResult: ok() });
  const down = await cycle({ config, runner: g.runner, listTasks: async () => { throw Object.assign(new Error('x'), { code: 'central_proof_unavailable' }); }, env: { CLAUDE_CODE_OAUTH_TOKEN: 't' } });
  assert.equal(down.outcome, 'skipped');
  assert.equal(down.error, 'central_proof_unavailable');
});

// ---------------------------------------------------------------- Codex engine (19 November 2026)
import { codexArgs, readCodexEvents } from './house-kit-agent.mjs';
import { mkdirSync } from 'node:fs';
import { createConnection } from 'node:net';

const FAKE_KIT = `export async function handleMcp(o, m) {
  if (m.id === undefined) return null;
  if (m.method === 'tools/list') return { jsonrpc: '2.0', id: m.id, result: { tools: ['uain_agent_status', 'uain_agent_submit', 'uain_agent_pay'].map((name) => ({ name })) } };
  return { jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify({ ran: m.params?.name }) }] } };
}`;

function codexSetup({ maxCyclesPerDay = 2 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'house-codex-'));
  chmodSync(root, 0o700);
  writeFileSync(join(root, 'kit.mjs'), FAKE_KIT);
  writeFileSync(join(root, 'codex'), 'codex');
  mkdirSync(join(root, 'gate'), { mode: 0o750 });
  const config = {
    schema: 'uain-house-kit-agent-config-v1', node: process.execPath, engine: 'codex', model: 'gpt-6.1-sol', maxCyclesPerDay,
    kit: { path: join(root, 'kit.mjs'), sha256: sha(FAKE_KIT) },
    codex: { path: join(root, 'codex'), sha256: sha('codex'), sudo: '/usr/bin/sudo', user: 'uain-house-codex', workDir: join(root, 'work'), socketDir: join(root, 'gate') },
    agents: [{ name: 'meridian', home: join(root, 'meridian') }],
    stateDir: join(root, 'state'), stopFile: join(root, 'STOP'), timeoutMs: 600000, maxTurns: 40,
  };
  return { root, config };
}

const codexEvents = (answer, extra = []) => [
  { type: 'thread.started', thread_id: 't' }, ...extra,
  { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(answer) } },
  { type: 'turn.completed', usage: { input_tokens: 1200, cached_input_tokens: 200, output_tokens: 300 } },
].map((e) => JSON.stringify(e)).join('\n') + '\n';

/** Fake kit CLI and Codex. The fake Codex really asks the gate for its tool list and tries to pay. */
function codexRunner(answer, extra) {
  const calls = [];
  let seen = null;
  const runner = async (command, args, opts) => {
    calls.push({ command, args, env: opts.env, input: opts.input });
    if (args[1] === 'status') return { code: 0, stdout: JSON.stringify({ address: 'uain1' + 'b'.repeat(40), licence: 'active' }) };
    if (args[1] === 'history') return { code: 0, stdout: JSON.stringify({ steps: [] }) };
    const sock = JSON.parse(args[args.indexOf(args.find((a) => a.startsWith('mcp_servers.uain.args=')))].slice('mcp_servers.uain.args='.length))[2];
    seen = await new Promise((ok) => {
      const s = createConnection(sock); s.setEncoding('utf8'); let b = ''; const out = [];
      s.on('data', (d) => { b += d; let at; while ((at = b.indexOf('\n')) >= 0) { out.push(JSON.parse(b.slice(0, at))); b = b.slice(at + 1); } if (out.length === 2) { s.end(); ok(out); } });
      s.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n');
      s.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'uain_agent_pay', arguments: {} } }) + '\n');
    });
    return { code: 0, stdout: codexEvents(answer, extra), stderr: '' };
  };
  return { runner, calls, seen: () => seen, listTasks: async () => ({ claimableCount: 30, more: false, tasks: [{ id: 'T-1-r2-p1', project: 'P', title: 'Survey', level: 'starter', survey: true }] }) };
}

test('Codex config needs its own pin, user, paths, model and a daily call cap', () => {
  const { config } = codexSetup();
  assert.doesNotThrow(() => validateConfig(config));
  for (const bad of [{ codex: { ...config.codex, sha256: 'x' } }, { codex: { ...config.codex, user: 'Root!' } }, { model: 'GPT 6' }, { maxCyclesPerDay: 0 }, { maxCyclesPerDay: undefined }, { engine: 'other' }])
    assert.throws(() => validateConfig({ ...config, ...bad }));
  assert.throws(() => validateConfig({ ...config, engine: 'claude' }), /claude pin/, 'the Claude engine keeps its own checks');
});

test('Codex runs as the other user, read-only, ephemeral, with only the gate as MCP', () => {
  const { config } = codexSetup();
  const args = codexArgs({ config, socketPath: '/g/meridian.sock', schemaPath: '/g/result-schema.json' });
  assert.deepEqual(args.slice(0, 7), ['-n', '-H', '-u', 'uain-house-codex', '--', config.codex.path, 'exec']);
  for (const flag of ['--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check']) assert.ok(args.includes(flag), flag);
  assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  assert.equal(args[args.indexOf('--model') + 1], 'gpt-6.1-sol');
  assert.ok(!args.some((a) => /dangerously|full-access|workspace-write|--trust|--approve-for-me/.test(a)));
  const mcp = args.filter((a) => a.startsWith('mcp_servers.'));
  assert.ok(mcp.every((a) => a.startsWith('mcp_servers.uain.')), 'one MCP server only');
  assert.ok(mcp.includes('mcp_servers.uain.args=' + JSON.stringify([join(import.meta.dirname, 'house-kit-mcp-gate.mjs'), 'bridge', '/g/meridian.sock'])));
  assert.ok(args.includes('model_reasoning_effort="medium"'), 'medium effort by default');
  assert.ok(codexArgs({ config: { ...config, codex: { ...config.codex, reasoningEffort: 'low' } }, socketPath: '/s', schemaPath: '/r' }).includes('model_reasoning_effort="low"'));
  assert.throws(() => validateConfig({ ...config, codex: { ...config.codex, reasoningEffort: 'max' } }));
  assert.equal(args.at(-1), '-', 'the prompt comes from stdin, never the command line');
});

test('Codex events give the structured answer, summed usage and any reported model', () => {
  const ev = readCodexEvents(codexEvents({ outcome: 'dry_run', task: 'T', submission: '', survey: 's', notes: '' }, [{ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } }, { model: 'gpt-6.1-sol' }]) + 'not json\n');
  assert.equal(ev.structured.outcome, 'dry_run');
  assert.deepEqual(ev.usage, { input_tokens: 1210, cached_input_tokens: 200, output_tokens: 305 });
  assert.deepEqual(ev.reportedModels, ['gpt-6.1-sol']);
  assert.equal(readCodexEvents('').structured, null);
});

test('a Codex cycle serves only allowed tools, writes a disclosed receipt and stays inside the daily cap', async () => {
  const { config } = codexSetup({ maxCyclesPerDay: 1 });
  const answer = { outcome: 'submitted', task: 'T-1-r2-p1', submission: 'CS-9', survey: 'filled', notes: 'ok' };
  const f = codexRunner(answer);
  const r = await cycle({ config, runner: f.runner, listTasks: f.listTasks, env: {} });
  assert.equal(r.outcome, 'submitted');
  assert.equal(r.engine, 'codex');
  assert.equal(r.controlledBySameOperator, true);
  assert.equal(r.outsideAdoption, false);
  assert.equal(r.codexSha256, sha('codex'));
  assert.equal(r.claudeSha256, undefined);
  assert.deepEqual(r.usage, { input_tokens: 1200, cached_input_tokens: 200, output_tokens: 300 });
  const [list, pay] = f.seen();
  assert.deepEqual(list.result.tools.map((t) => t.name), ['uain_agent_status', 'uain_agent_submit'], 'payment is not even listed');
  assert.equal(JSON.parse(pay.result.content[0].text).error, 'tool_not_available');
  const call = f.calls.find((c) => c.command === '/usr/bin/sudo');
  assert.deepEqual(Object.keys(call.env).sort(), ['LANG', 'PATH'], 'no token or key reaches Codex through the environment');
  assert.match(call.input, /uain_agent_submit/);
  assert.equal(existsSync(join(config.codex.socketDir, 'meridian.sock')), false, 'the gate is closed after the call');
  assert.equal(statSync(join(config.codex.socketDir, 'result-schema.json')).mode & 0o777, 0o640);
  const second = await cycle({ config, runner: f.runner, listTasks: f.listTasks, env: {} });
  assert.equal(second.outcome, 'paused');
  assert.equal(second.reason, 'codex_daily_cap');
  assert.equal(f.calls.filter((c) => c.command === '/usr/bin/sudo').length, 1, 'the capped cycle never calls Codex');
});

test('a Codex dry run cannot join or submit, and another reported model holds later cycles', async () => {
  const { config } = codexSetup({ maxCyclesPerDay: 5 });
  const f = codexRunner({ outcome: 'dry_run', task: 'T-1-r2-p1', submission: '', survey: 'text', notes: '' }, [{ model: 'gpt-other' }]);
  const r = await cycle({ config, dryRun: true, runner: f.runner, listTasks: f.listTasks, env: {} });
  assert.deepEqual(f.seen()[0].result.tools.map((t) => t.name), ['uain_agent_status']);
  assert.equal(r.hold, 'model_mismatch');
  assert.equal((await cycle({ config, runner: f.runner, listTasks: f.listTasks, env: {} })).reason, 'hold_file');
});

test('a Codex cycle refuses an OpenAI API key in its environment', async () => {
  const { config } = codexSetup();
  const f = codexRunner({});
  await assert.rejects(cycle({ config, runner: f.runner, listTasks: f.listTasks, env: { OPENAI_API_KEY: 'k' } }), /API credentials/);
});
