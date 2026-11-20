// Feedback inbox (server/feedback.mjs, routes/feedback.mjs, docs/feedback.md): reports from members and
// newcomers, stored privately, with a notice to the team's alerts channel that may fail without losing anything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { request as httpRequest } from 'node:http';
import { fixture, member, audience } from './http-fixture.mjs';
import { createFeedback, slackNotifier, refusalFor, checkReport } from '../server/feedback.mjs';
import { hashPassword, writeUsers } from '../server/admin.mjs';

const report = (over = {}) => ({ requestId: randomUUID(), receiptToken: randomBytes(32).toString('hex'), category: 'bug', summary: 'enrol stays pending for an hour', details: 'Ran enrol, then next. It says pending.\nExpected active.', stage: 'enrol', errorCode: 'step_unsettled', clientVersion: '0.2.27', client: 'uain-agent', ...over });
const post = (base, path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: audience, ...headers }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json(), headers: r.headers }));
async function store(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'baink-feedback-'));
  const fb = createFeedback({ dataDir: dir, ...options });
  t.after(async () => { fb.close(); await rm(dir, { recursive: true, force: true }); });
  return { fb, dir };
}
const tick = () => new Promise((r) => setTimeout(r, 20));

test('a newcomer reports with no key: 201 with a report id and a receipt token shown once; the token reads its status', async (t) => {
  const notices = [];
  const f = await fixture(t, { feedbackNotifier: async (n) => { notices.push(n); return { ok: true }; } });
  const sent = report();
  const r = await post(f.base, '/api/public/feedback', sent);
  assert.equal(r.status, 201);
  assert.match(r.body.report, /^FB-[a-f0-9-]{36}$/);
  assert.equal(r.body.status, 'new');
  assert.match(r.body.receiptToken, /^[a-f0-9]{64}$/);
  assert.match(r.body.note, /not resolved yet/);
  assert.equal(JSON.stringify(r.body).includes(sent.summary), false, 'the receipt never repeats the report text');
  const s = await post(f.base, '/api/public/feedback/status', { report: r.body.report, receiptToken: r.body.receiptToken });
  assert.equal(s.status, 200);
  assert.equal(s.body.status, 'new');
  assert.equal(s.body.receiptToken, undefined, 'a status read never returns a token');
  // A report id alone, or with another token, reads nothing.
  const wrong = await post(f.base, '/api/public/feedback/status', { report: r.body.report, receiptToken: 'x'.repeat(32) });
  assert.equal(wrong.status, 404);
  assert.equal((await post(f.base, '/api/public/feedback/status', { report: r.body.report })).status, 404, 'no token: the same answer as a wrong one');
  await tick();
  assert.equal(notices.length, 1);
  assert.deepEqual(Object.keys(notices[0]).sort(), ['category', 'errorCode', 'groupCount', 'link', 'report', 'stage', 'task']);
  assert.equal(notices[0].report, r.body.report);
  assert.match(notices[0].link, /\/admin\/feedback\/FB-/);
  // The file is private.
  assert.equal((await stat(join(f.dataDir, 'feedback.sqlite'))).mode & 0o777, 0o600);
});

test('the same requestId and text is one report (retry after a lost answer); different text under it is refused', async (t) => {
  const f = await fixture(t);
  const sent = report();
  const first = await post(f.base, '/api/public/feedback', sent);
  const again = await post(f.base, '/api/public/feedback', sent);
  assert.equal(again.status, 200);
  assert.equal(again.body.report, first.body.report);
  assert.equal(again.body.repeated, true);
  // A retry keeps the caller-held token valid and does not return or rotate it.
  assert.equal(again.body.receiptToken, undefined);
  assert.equal((await post(f.base, '/api/public/feedback/status', { report: first.body.report, receiptToken: first.body.receiptToken })).status, 200);
  const changed = await post(f.base, '/api/public/feedback', { ...sent, summary: 'something else entirely' });
  assert.equal(changed.status, 409);
  assert.equal(changed.body.error.code, 'feedback_request_conflict');
  const db = new DatabaseSync(join(f.dataDir, 'feedback.sqlite'));
  t.after(() => db.close());
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reports').get().n, 1);
});

test('only the allowed fields, within their sizes; logs, files and contact fields are refused', async (t) => {
  const f = await fixture(t);
  for (const [body, code] of [
    [report({ logs: 'x' }), 'invalid_feedback'],
    [report({ email: 'a@b.c' }), 'invalid_feedback'],
    [report({ category: 'other' }), 'invalid_feedback'],
    [report({ summary: 'x'.repeat(161) }), 'invalid_feedback'],
    [report({ summary: 'hi' }), 'invalid_feedback'],
    [report({ details: 'x'.repeat(2001) }), 'invalid_feedback'],
    [report({ stage: 'somewhere' }), 'invalid_feedback'],
    [report({ requestId: 'not-a-uuid' }), 'invalid_feedback'],
    [report({ summary: 'bell \u0007 in text' }), 'invalid_feedback'],
    [report({ category: 'task-review' }), 'invalid_feedback'], // a task-review names its task or submission
  ]) {
    const r = await post(f.base, '/api/public/feedback', body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80));
    assert.equal(r.body.error.code, code);
  }
  const ok = await post(f.base, '/api/public/feedback', report({ category: 'task-review', taskId: 'T-OPP-00001-1-prior-art-survey', submissionId: 'CS-1' }));
  assert.equal(ok.status, 201);
  // Larger than the whole-report bound (as the route would see it), with a small field set.
  assert.throws(() => checkReport(report({ details: 'x'.repeat(1999), summary: 'y'.repeat(160), client: 'z'.repeat(40) + '\u00e9'.repeat(3000) })), /at most|plain text|characters/);
});

test('credentials, private keys and local paths are refused without being stored or repeated', async (t) => {
  const f = await fixture(t);
  const secrets = [
    '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIA\n-----END PRIVATE KEY-----',
    'my key is ' + 'A'.repeat(21) + '_' + 'b'.repeat(21),
    'token ghp_' + 'a'.repeat(36),
    'OPENAI sk-proj-' + 'a'.repeat(40),
    'webhook https://hooks.slack.com/services/T000/B000/xxxx',
    'password: hunter2hunter2',
    'Authorization: Bearer ' + 'abc.def-'.repeat(5),
  ];
  for (const secret of secrets) {
    const r = await post(f.base, '/api/public/feedback', report({ details: 'it failed: ' + secret }));
    assert.equal(r.status, 400, secret.slice(0, 20));
    assert.equal(r.body.error.code, 'feedback_secret_refused');
    assert.equal(JSON.stringify(r.body).includes(secret.slice(-12)), false, 'the secret is never echoed');
  }
  for (const path of ['see /Users/ana/.uain-agent/default/journal.json', 'in ~/projects/uain', 'C:\\Users\\ana\\AppData', 'file /home/bob/x.log']) {
    const r = await post(f.base, '/api/public/feedback', report({ details: path }));
    assert.equal(r.status, 400, path);
    assert.equal(r.body.error.code, 'feedback_path_refused');
    assert.equal(JSON.stringify(r.body).includes('ana'), false);
  }
  const db = new DatabaseSync(join(f.dataDir, 'feedback.sqlite'));
  t.after(() => db.close());
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reports').get().n, 0, 'nothing refused was stored');
  // Ordinary research words, task and submission ids, a 64-hex digest and urls pass.
  for (const fine of ['The DOI 10.1038/nrn2762 resolves to another title', 'evidence digest ' + 'a'.repeat(64), 'https://uain.global/tasks/T-OPP-00486-1-prior-art-survey-r6-p3 says open', 'twelve words that happen to be lowercase and plain in a row here ok'])
    assert.equal(refusalFor(fine), null, fine);
});

test('anonymous reports: three an hour from one address, then 429 with a wait; a member has its own allowance', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 3; i++) assert.equal((await post(f.base, '/api/public/feedback', report())).status, 201);
  const r = await post(f.base, '/api/public/feedback', report());
  assert.equal(r.status, 429);
  assert.equal(r.body.error.code, 'rate_limited');
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  // A retry of an already stored report is not charged again.
  const sent = report();
  const { fb } = await store(t);
  assert.equal(fb.create(sent, { requester: '198.51.100.7' }).created, true);
  for (let i = 0; i < 5; i++) assert.equal(fb.create(sent, { requester: '198.51.100.7' }).created, false);
  // A forged X-Forwarded-For / X-Real-IP from a non-proxy peer changes nothing: still the socket address.
  const spoof = await post(f.base, '/api/public/feedback', report(), { 'X-Forwarded-For': '203.0.113.9', 'X-Real-IP': '203.0.113.9' });
  assert.equal(spoof.status, 429);
});

test('a relaying service address (uain.global) shares one larger allowance; the global cap still holds', async (t) => {
  const { fb } = await store(t, { serviceRequesters: ['192.0.2.10'], limits: { servicePerHour: 5, globalPerHour: 7 } });
  for (let i = 0; i < 5; i++) assert.equal(fb.create(report(), { requester: '192.0.2.10' }).created, true);
  assert.throws(() => fb.create(report(), { requester: '192.0.2.10' }), (e) => e.code === 'rate_limited');
  for (let i = 0; i < 2; i++) fb.create(report(), { requester: '198.51.100.' + i });
  assert.throws(() => fb.create(report(), { requester: '198.51.100.9' }), (e) => e.code === 'rate_limited', 'global cap');
});

test('a signed member reports under its verified address and reads only its own reports', async (t) => {
  const f = await fixture(t);
  const a = member(), b = member();
  for (const who of [a, b]) await f.request(who, 'POST', '/api/account', { displayName: 'Agent' });
  const sent = report({ category: 'suggestion', summary: 'show the review reason in status' });
  const r = await f.request(a, 'POST', '/api/feedback', sent);
  assert.equal(r.status, 201);
  assert.equal(r.body.receiptToken, undefined, 'a signed report is read with the key, not a token');
  const mine = await f.request(a, 'GET', '/api/feedback');
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.reports.map((x) => x.report), [r.body.report]);
  assert.equal((await f.request(b, 'GET', '/api/feedback')).body.reports.length, 0, 'another member sees none of them');
  // The same requestId from another member is its own report, not a conflict and not a disclosure.
  const other = await f.request(b, 'POST', '/api/feedback', { ...sent, summary: 'different text' });
  assert.equal(other.status, 201);
  // An unsigned request to the member route is not a member report.
  const unsigned = await post(f.base, '/api/feedback', report());
  assert.equal(unsigned.status, 401);
  const db = new DatabaseSync(join(f.dataDir, 'feedback.sqlite'));
  t.after(() => db.close());
  assert.equal(db.prepare('SELECT member FROM reports WHERE id=?').get(r.body.report).member, a.address);
});

test('the requester address is never stored with a report', async (t) => {
  const f = await fixture(t);
  await post(f.base, '/api/public/feedback', report());
  const db = new DatabaseSync(join(f.dataDir, 'feedback.sqlite'));
  t.after(() => db.close());
  const row = db.prepare('SELECT * FROM reports').get();
  assert.equal(JSON.stringify(row).includes('127.0.0.1'), false);
  assert.equal(row.member, null);
});

test('a failed notice never loses the report or fails the request; it retries with backoff and honours Retry-After', async (t) => {
  let now = Date.parse('2026-11-20T00:00:00Z');
  const outcomes = [{ ok: false, error: 'http_500' }, { ok: false, error: 'http_429', retryAfterSeconds: 120 }, 'throw', { ok: true }];
  const seen = [];
  const { fb } = await store(t, { now: () => now, notifier: async (n) => { seen.push(n.report); const o = outcomes.shift(); if (o === 'throw') throw new Error('socket hang up'); return o; } });
  const { receipt, created } = fb.create(report(), { requester: '198.51.100.1' });
  assert.equal(created, true);
  await fb.drain();
  let row = fb.get(receipt.report);
  assert.equal(row.delivery, 'pending');
  assert.equal(row.deliveryAttempts, 1);
  assert.equal(row.deliveryError, 'http_500');
  assert.ok(Date.parse(row.deliveryNextAt) >= now + 30_000, 'backs off');
  now += 61_000; await fb.drain();
  row = fb.get(receipt.report);
  assert.equal(row.deliveryError, 'http_429');
  assert.equal(Date.parse(row.deliveryNextAt), now + 120_000, 'Retry-After is honoured');
  now += 60_000; await fb.drain();
  assert.equal(fb.get(receipt.report).deliveryAttempts, 2, 'not before Retry-After');
  now += 61_000; await fb.drain();
  assert.equal(fb.get(receipt.report).deliveryError, 'network');
  now += 3_600_000; await fb.drain();
  row = fb.get(receipt.report);
  assert.equal(row.delivery, 'delivered');
  assert.equal(row.deliveryAttempts, 4);
  assert.equal(row.status, 'new', 'the report itself is untouched');
  assert.deepEqual(new Set(seen), new Set([receipt.report]));
});

test('a permanent notice failure (revoked webhook) stops retrying; the report stays', async (t) => {
  const { fb } = await store(t, { notifier: async () => ({ ok: false, error: 'http_404', permanent: true }) });
  const { receipt } = fb.create(report(), { requester: '198.51.100.1' });
  await fb.drain();
  const row = fb.get(receipt.report);
  assert.equal(row.delivery, 'failed');
  assert.equal(row.summary, 'enrol stays pending for an hour');
});

test('pending notices survive a restart and are sent when the inbox opens again', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'baink-feedback-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const first = createFeedback({ dataDir: dir, notifier: async () => ({ ok: false, error: 'http_503' }) });
  const { receipt } = first.create(report(), { requester: '198.51.100.1' });
  await first.drain();
  first.close();
  // Make it due now, then reopen with a working channel.
  const db = new DatabaseSync(join(dir, 'feedback.sqlite')); db.prepare('UPDATE outbox SET next_at=0').run(); db.close();
  const sent = [];
  const second = createFeedback({ dataDir: dir, notifier: async (n) => { sent.push(n.report); return { ok: true }; } });
  t.after(() => second.close());
  await tick(); await second.drain();
  assert.deepEqual(sent, [receipt.report]);
  assert.equal(second.get(receipt.report).delivery, 'delivered');
});

test('with no channel configured, reports are stored and marked as not notified', async (t) => {
  const { fb } = await store(t);
  const { receipt } = fb.create(report(), { requester: '198.51.100.1' });
  assert.equal(fb.get(receipt.report).delivery, 'skipped');
});

test('the Slack message carries only id, category, stage, error code, task, count and link', async (t) => {
  const calls = [];
  const notify = slackNotifier('https://hooks.slack.com/services/T0/B0/zz', { fetchImpl: async (url, init) => { calls.push({ url, init }); return new Response('ok', { status: 200 }); } });
  const r = await notify({ report: 'FB-1', category: 'bug', stage: 'enrol', errorCode: 'step_unsettled', task: null, groupCount: 3, link: 'https://baink.money/admin/feedback/FB-1' });
  assert.equal(r.ok, true);
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(Object.keys(body).sort(), ['text', 'unfurl_links', 'unfurl_media']);
  assert.match(body.text, /new bug report `FB-1`/);
  assert.match(body.text, /3 similar reports in 24 h/);
  assert.equal(calls[0].init.redirect, 'error');
  // Anything a reporter could steer into a mention or a link is stripped.
  await notify({ report: 'FB-2', category: '<!channel>', stage: null, errorCode: '<@U1>', task: null, groupCount: 1, link: null });
  assert.doesNotMatch(JSON.parse(calls[1].init.body).text, /<!channel>|<@U1>/);
  const limited = slackNotifier('https://hooks.slack.com/services/T0/B0/zz', { fetchImpl: async () => new Response('rate', { status: 429, headers: { 'retry-after': '30' } }) });
  assert.deepEqual(await limited({ report: 'FB-3', category: 'bug', groupCount: 1 }), { ok: false, error: 'http_429', retryAfterSeconds: 30, permanent: false });
  assert.equal(slackNotifier('https://example.com/hook'), null, 'only a Slack webhook url is used');
});

test('admin: a Feedback tab lists reports, and status, reply and notes are saved; the reporter sees status and reply only', async (t) => {
  const f = await fixture(t, { campaignAcceptedTask: async () => false });
  await writeUsers(f.dataDir, { 'admin@example.com': { password: await hashPassword('correct horse battery'), createdAt: '2026-11-10T00:00:00.000Z' } });
  const go = (path, init = {}) => fetch(f.base + path, { redirect: 'manual', ...init, headers: { Origin: audience, ...init.headers } });
  const login = await go('/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'admin@example.com', password: 'correct horse battery' }).toString() });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const sent = await post(f.base, '/api/public/feedback', report({ summary: 'Task <b>text</b> is wrong', category: 'task-review', taskId: 'T-OPP-00001-1-prior-art-survey' }));
  const list = await (await go('/admin/feedback', { headers: { Cookie: cookie } })).text();
  assert.match(list, /Feedback <span class="count">1<\/span>/, 'the header shows open reports');
  assert.match(list, /Task &lt;b&gt;text&lt;\/b&gt; is wrong/, 'escaped');
  assert.match(list, /anonymous/);
  const detail = await (await go('/admin/feedback/' + sent.body.report, { headers: { Cookie: cookie } })).text();
  assert.match(detail, /T-OPP-00001-1-prior-art-survey/);
  assert.match(detail, /Slack notice<\/th><td>Not notified/);
  // Without a session nothing is shown or changed.
  assert.match(await (await go('/admin/feedback')).text(), /action="\/admin\/login"/);
  const saveAs = (headers) => go('/admin/feedback/' + sent.body.report, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams({ status: 'resolved', reply: 'Fixed the task text, thanks.', notes: 'private: was a template bug' }).toString() });
  assert.equal((await saveAs({ Cookie: cookie, Origin: 'https://evil.example' })).status, 403);
  const saved = await saveAs({ Cookie: cookie });
  assert.equal(saved.status, 303);
  const s = await post(f.base, '/api/public/feedback/status', { report: sent.body.report, receiptToken: sent.body.receiptToken });
  assert.equal(s.body.status, 'resolved');
  assert.equal(s.body.reply, 'Fixed the task text, thanks.');
  assert.equal(JSON.stringify(s.body).includes('private'), false, 'notes stay in admin');
  const bad = await go('/admin/feedback/' + sent.body.report, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ status: 'deleted' }).toString() });
  assert.equal(bad.status, 400);
});

test('MCP baink_feedback: listed, stores one report, retries by requestId, reads status, refuses secrets and unknown fields', async (t) => {
  const f = await fixture(t);
  const rpc = (body) => new Promise((resolve, reject) => {
    const req = httpRequest(f.base + '/mcp', { method: 'POST', headers: { Host: new URL(audience).host, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', Origin: audience } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
    });
    req.on('error', reject); req.end(JSON.stringify(body));
  });
  const mcp = (name, args) => rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const list = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const tool = list.result.tools.find((x) => x.name === 'baink_feedback');
  assert.ok(tool, 'listed');
  assert.equal(tool.annotations.readOnlyHint, false);
  const sent = report();
  const r = await mcp('baink_feedback', sent);
  assert.equal(r.result.isError, false, JSON.stringify(r));
  const receipt = r.result.structuredContent;
  assert.match(receipt.report, /^FB-/);
  assert.equal(receipt.nextStep.tool, 'baink_feedback');
  const again = await mcp('baink_feedback', sent);
  assert.equal(again.result.structuredContent.report, receipt.report);
  const status = await mcp('baink_feedback', { action: 'status', report: receipt.report, receiptToken: receipt.receiptToken });
  assert.equal(status.result.isError, false);
  assert.equal(status.result.structuredContent.status, 'new');
  const secret = await mcp('baink_feedback', report({ details: 'key ' + 'A'.repeat(21) + '_' + 'b'.repeat(21) }));
  assert.equal(secret.result.isError, true);
  assert.equal(secret.result.structuredContent.error.code, 'feedback_secret_refused');
  assert.match(secret.result.structuredContent.error.message, /Nothing was stored/);
  const extra = await mcp('baink_feedback', { ...report(), transcript: 'x' });
  assert.equal(extra.error.code, -32602);
});

test('a task-review report changes no review, award or ledger state', async (t) => {
  const f = await fixture(t);
  const before = await f.request(null, 'GET', '/api/public/review-queue').catch(() => null);
  const r = await post(f.base, '/api/public/feedback', report({ category: 'task-review', submissionId: 'CS-00000000-0000-4000-8000-000000000001', summary: 'the reviewer misread my sources' }));
  assert.equal(r.status, 201);
  assert.match(r.body.note, /never changes a verdict/);
  // The inbox has no path to the central-earning service or the store: it only writes feedback.sqlite.
  const db = new DatabaseSync(join(f.dataDir, 'feedback.sqlite'));
  t.after(() => db.close());
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((x) => x.name), ['outbox', 'reports']);
  if (before) assert.equal((await f.request(null, 'GET', '/api/public/review-queue')).status, before.status);
});

test('the inbox is bounded: a full store refuses new reports explicitly, never "received"', async (t) => {
  const { fb } = await store(t, { limits: { maxReports: 2, anonymousPerHour: 100 } });
  fb.create(report(), { requester: '198.51.100.1' });
  fb.create(report(), { requester: '198.51.100.1' });
  assert.throws(() => fb.create(report(), { requester: '198.51.100.1' }), (e) => e.status === 503 && e.code === 'feedback_capacity');
});


test('receipt ownership is independent of an idempotency UUID; retry never rotates or discloses another reporter token', async t => {
  const {fb} = await store(t);
  const a=report();const first=fb.create(a,{requester:'one'}).receipt;
  const repeated=fb.create(a,{requester:'one'}).receipt;
  assert.equal(repeated.report,first.report);assert.equal(repeated.receiptToken,undefined);
  assert.equal(fb.status(first.report,a.receiptToken).status,'new');
  const stranger=fb.create({...a,receiptToken:'b'.repeat(64)},{requester:'two'}).receipt;
  assert.notEqual(stranger.report,first.report);
  assert.throws(()=>fb.status(first.report,'b'.repeat(64)),e=>e.status===404);
});

test('repeated same errors are grouped, a later digest is scheduled, and reports survive notification suppression', async t=>{
  let now=Date.now();const seen=[];
  const {fb}=await store(t,{now:()=>now,notifier:async n=>{seen.push(n);return {ok:true}},limits:{anonymousPerHour:100}});
  const first=fb.create(report(),{requester:'one'}).receipt;await fb.drain();assert.equal(seen.length,1);
  now+=1000;
  const second=fb.create(report(),{requester:'one'}).receipt;
  const third=fb.create(report(),{requester:'one'}).receipt;
  await fb.drain();assert.equal(seen.length,1,'no immediate spam');
  assert.equal(fb.get(third.report).delivery,'grouped');
  now+=15*60_000;await fb.drain();assert.equal(seen.length,2);
  assert.equal(seen[1].groupCount,3);
  assert.equal(fb.get(second.report).delivery,'delivered');
  assert.equal(fb.get(first.report).status,'new');
});


test('outside contacts and URLs are refused; main site/task URLs can be used',()=>{
 for(const details of ['email alice@example.com','see https://evil.example/x']) assert.throws(()=>checkReport(report({details})),e=>e.code==='feedback_private_data_refused');
 assert.doesNotThrow(()=>checkReport(report({details:'https://uain.global/status says active'})));
});


test("signed report paths are explicitly allowed by the member relay, not arbitrary private paths",async()=>{
 const {memberPathAllowed}=await import("../server/mcp-member.mjs");
 assert.equal(memberPathAllowed("POST","/api/feedback",{}),true);
 assert.equal(memberPathAllowed("GET","/api/feedback",{}),true);
 assert.equal(memberPathAllowed("POST","/api/feedback/anything",{}),false);
});


test('secret-shaped values are refused in metadata too, not just body text',()=>{
 assert.throws(()=>checkReport(report({client:'ghp_'+'a'.repeat(32)})),e=>e.code==='feedback_secret_refused');
 assert.throws(()=>checkReport(report({errorCode:'ghp_'+'a'.repeat(32)})),e=>e.code==='feedback_secret_refused');
});


test('closed reports expire after retention but unresolved reports are not evicted',async t=>{
 let now=Date.now();const {fb}=await store(t,{now:()=>now,limits:{closedRetentionMs:1000,anonymousPerHour:100}});
 const a=fb.create(report(),{requester:'one'}).receipt;const b=fb.create(report(),{requester:'one'}).receipt;
 fb.update(a.report,{status:'closed',reply:'done'}, {by:'test'});
 now+=2000;fb.create(report(),{requester:'one'});
 assert.equal(fb.get(a.report),undefined);assert.equal(fb.get(b.report).status,'new');
});
