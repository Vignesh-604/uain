// Member and newcomer feedback (20 November 2026): a private report inbox.
//
// Anyone can send a short report (a bug, a task or review that looks wrong, a
// suggestion), before or after joining: through the kit (`uain-agent feedback`),
// the MCP tool baink_feedback (uain_feedback on uain.global/mcp), or
// POST /api/public/feedback. A signed member sends the same report through
// POST /api/feedback and reads its own reports' status with GET /api/feedback.
// Reports are never public, never create a GitHub issue, and never change a
// review verdict, an award or anything on the ledger: a task-review report is
// a note for the team. See docs/feedback.md.
//
// Storage: <dataDir>/feedback.sqlite (0600), its own bounded store, so report
// volume can never fill or slow the wallet metadata store. A report and its
// notification are written in one transaction; the reply ("received") is sent
// only after that commit. The notification (a short summary to the team's
// alerts channel) is delivered afterwards from the outbox, with retries; a
// failed or slow notification never loses a report or fails the request.
//
// What is kept: the fields below, nothing else. No logs, transcripts,
// attachments, stack traces or contact details are accepted, and text that
// looks like a credential, a private key or a local file path is refused
// without being stored or repeated. The requester's address is used only for
// rate limits in memory and is never stored.
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { fail } from "./http-errors.mjs";

export const FEEDBACK_CATEGORIES = ["bug", "task-review", "suggestion"];
export const FEEDBACK_STAGES = ["discover", "install", "account", "enrol", "tasks", "join", "submit", "review", "payment", "trade", "other"];
export const FEEDBACK_STATUSES = ["new", "investigating", "resolved", "closed"];
export const FEEDBACK_FIELDS = ["requestId", "category", "summary", "details", "stage", "errorCode", "taskId", "submissionId", "clientVersion", "client", "receiptToken"];
export const SUMMARY_MAX = 160, DETAILS_MAX = 2000, REPLY_MAX = 600, NOTES_MAX = 4000;
/** Whole JSON body of a report, in bytes. */
export const FEEDBACK_BODY_MAX = 8192;
// Any UUID form (an AI writing one by hand rarely sets the version bits right); it only has to be unguessable and kept.
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const ERROR_CODE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const TASK = /^T-[A-Za-z0-9][A-Za-z0-9._-]{0,94}$/;
const SUBMISSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const VERSION = /^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$/;
const CLIENT = /^[a-z0-9][a-z0-9 ._/-]{0,39}$/i;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

// Text that is refused rather than stored: credentials, private keys and local paths. A best-effort
// guard (a person can always describe a secret in words); what it catches is never written or echoed.
const SECRET_SHAPES = [
  /-----BEGIN [A-Z ]*(?:PRIVATE KEY|OPENSSH|PGP)/,
  /PRIVATE KEY/,
  /MC4CAQAwBQYDK2Vw|MI[IG][A-Za-z0-9+/]{2}IBADA|MHcCAQEE/, // unarmoured PKCS#8 / SEC1
  /"d"\s*:\s*"[A-Za-z0-9_-]{40,}"/, // a private JWK member
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/, // Stripe-style
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/, // OpenAI / Anthropic keys
  /\bgh[pousr]_[A-Za-z0-9]{30,}/, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{30,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/, // Slack tokens
  /hooks\.slack\.com\/services\//i,
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bAIza[0-9A-Za-z_-]{30,}/, // Google API key
  /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/, // Resend
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/, // JWT
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
  /\b(?:password|passwd|passphrase|secret|api[_-]?key|token|mnemonic|seed phrase)\s*[:=]\s*\S{6,}/i,
  // A raw base64url Ed25519 seed (the kit's key form), not one of the network's own ids.
  /(?:^|[^A-Za-z0-9_+/=-])(?!T-|CS-|FB-)[A-Za-z0-9_-]{43}(?![A-Za-z0-9_+/=-])/,
  /\b[0-9a-f]{64}\b(?=[^]*\b(?:private|secret|seed)\b)/i, // a 64-hex value beside the word private/secret/seed
];
// Local file paths: home folders and system locations. A report says what happened, not where files live.
const PATH_SHAPES = [
  /(?:^|[\s"'(=])\/(?:Users|home|root|private|var|etc|opt|tmp|mnt|srv|Volumes)\/[^\s"')]+/,
  /(?:^|[\s"'(=])~\/[^\s"')]+/,
  /\b[A-Za-z]:\\(?:Users|Documents and Settings|Windows|ProgramData)\\/i,
  /\\\\[A-Za-z0-9._-]+\\[A-Za-z0-9$._-]+/, // UNC
];
/** Why a text is refused, or null. Never returns the matched text. */
export function refusalFor(value) {
  if (typeof value !== "string" || !value) return null;
  if (SECRET_SHAPES.some((re) => re.test(value))) return "credential";
  if (PATH_SHAPES.some((re) => re.test(value))) return "path";
  if (/\b[^\s@]+@[^\s@]+\.[A-Za-z]{2,}\b/.test(value)) return "contact";
  for (const match of value.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    try { if (!['uain.global','baink.money'].includes(new URL(match[0]).hostname)) return "url"; }
    catch { return "url"; }
  }
  return null;
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const nowIso = (ms) => new Date(ms).toISOString();

/** The checked, trimmed report, or a 400 that names the field (never its value). */
export function checkReport(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "invalid_feedback", "Send a JSON object.");
  if (Buffer.byteLength(JSON.stringify(body)) > FEEDBACK_BODY_MAX) fail(413, "invalid_feedback", `A report is at most ${FEEDBACK_BODY_MAX} bytes. Keep it short: what you did, what happened, what you expected.`);
  const extra = Object.keys(body).filter((k) => !FEEDBACK_FIELDS.includes(k));
  if (extra.length) fail(400, "invalid_feedback", "Unsupported report fields. Logs, transcripts, files and contact details are not accepted.");
  const textOf = (key, max, { optional = false, min = 0 } = {}) => {
    const v = body[key];
    if (v === undefined || v === null || v === "") {
      if (optional) return null;
      fail(400, "invalid_feedback", `${key} is required.`);
    }
    if (typeof v !== "string" || CONTROL.test(v) || !v.isWellFormed()) fail(400, "invalid_feedback", `${key} must be plain text.`);
    const t = v.trim();
    if (t.length < min || t.length > max) fail(400, "invalid_feedback", `${key} must be ${min ? `${min} to ` : "at most "}${max} characters.`);
    return t;
  };
  const pick = (key, pattern, label) => {
    const v = body[key];
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" || !pattern.test(v)) fail(400, "invalid_feedback", `${key} must be ${label}.`);
    return v;
  };
  const requestId = body.requestId;
  if (typeof requestId !== "string" || !UUID.test(requestId.toLowerCase())) fail(400, "invalid_feedback", "requestId must be a fresh random UUID that you keep: repeat it to retry the same report without sending it twice.");
  const category = body.category;
  if (!FEEDBACK_CATEGORIES.includes(category)) fail(400, "invalid_feedback", `category is one of ${FEEDBACK_CATEGORIES.join(", ")}.`);
  const stage = body.stage === undefined || body.stage === null || body.stage === "" ? null : body.stage;
  if (stage !== null && !FEEDBACK_STAGES.includes(stage)) fail(400, "invalid_feedback", `stage is one of ${FEEDBACK_STAGES.join(", ")}.`);
  const report = {
    requestId: requestId.toLowerCase(),
    receiptToken: pick("receiptToken", /^[a-f0-9]{64}$/, "64 random hexadecimal characters, generated and kept before sending"),
    category,
    summary: textOf("summary", SUMMARY_MAX, { min: 5 }),
    details: textOf("details", DETAILS_MAX, { optional: true }),
    stage,
    errorCode: pick("errorCode", ERROR_CODE, "an error code as the reply gave it, like central_task_not_open"),
    taskId: pick("taskId", TASK, "a task id like T-OPP-00001-1-prior-art-survey"),
    submissionId: pick("submissionId", SUBMISSION, "a submission id"),
    clientVersion: pick("clientVersion", VERSION, "a version like 0.2.27"),
    client: pick("client", CLIENT, "a short client name, like uain-agent or claude-code"),
  };
  if (/[\r\n\t]/.test(report.summary)) fail(400, "invalid_feedback", "summary must be one line.");
  if (category === "task-review" && !report.taskId && !report.submissionId) fail(400, "invalid_feedback", "A task-review report names the taskId or the submissionId it is about.");
  for (const key of ["summary", "details", "client", "errorCode", "taskId", "submissionId"]) {
    const why = refusalFor(report[key]);
    if (why === "credential") fail(400, "feedback_secret_refused", `${key} looks like it holds a key, token or password, so nothing was stored or sent. Describe the problem without it. If a real secret was pasted, treat it as exposed and replace it.`);
    if (why === "contact" || why === "url") fail(400, "feedback_private_data_refused", "Remove contact details and outside URLs; use task/submission ids instead. Nothing was stored.");
    if (why === "path") fail(400, "feedback_path_refused", `${key} names a file path on a computer, so nothing was stored. Describe what happened without paths (they can name the person or the machine).`);
  }
  return report;
}
/** The same report, in one canonical form, to tell a retry from a different report under the same requestId. */
const payloadDigest = (r) => sha256(JSON.stringify([r.category, r.summary, r.details, r.stage, r.errorCode, r.taskId, r.submissionId, r.clientVersion, r.client]));
/** Reports with the same category, error code, stage and task are grouped for the team; never shared across reporters. */
const groupOf = (r) => sha256(JSON.stringify([r.category, r.errorCode, r.stage, r.taskId, r.clientVersion, (!r.errorCode && !r.taskId) ? r.summary : null])).slice(0, 16);

/** The public receipt: what the reporter may see. Never the body, never who sent it. */
function receipt(row, { token } = {}) {
  return {
    report: row.id,
    status: row.status,
    receivedAt: nowIso(row.created_at),
    ...(row.updated_at !== row.created_at ? { updatedAt: nowIso(row.updated_at) } : {}),
    ...(row.reply ? { reply: row.reply } : {}),
    ...(token ? { receiptToken: token } : {}),
    note: row.status === "new"
      ? "Received by the UAIN team, not resolved yet. It is private and changes nothing on the network (a task-review report never changes a verdict)."
      : row.status === "investigating" ? "The team is looking into it." : row.status === "resolved" ? "The team marked this resolved." : "The team closed this report.",
  };
}

export function createFeedback({ dataDir, enabled = true, notifier = null, now = Date.now, limits = {}, adminOrigin = null, serviceRequesters = [], onError = null } = {}) {
  // Reports relayed by uain.global/mcp all arrive from its server address: that address gets one larger
  // shared allowance here, and uain.global limits each of its own callers before relaying (never a header).
  const services = new Set(serviceRequesters);
  const L = {
    anonymousPerHour: 3, memberPerHour: 10, servicePerHour: 60, globalPerHour: 120,
    maxReports: 10_000, closedRetentionMs: 90 * 24 * 3600 * 1000,
    ...limits,
  };
  if (!enabled) {
    const off = () => fail(503, "feedback_unavailable", "Reports are not accepted on this server.");
    return { enabled: false, create: off, status: off, mine: off, list: () => [], get: () => null, update: off, drain: async () => {}, close: () => {} };
  }
  const path = join(dataDir, "feedback.sqlite");
  if (existsSync(path) && !lstatSync(path).isFile()) throw new Error("feedback storage is not a file");
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=2000; PRAGMA synchronous=FULL;");
  db.exec(`CREATE TABLE IF NOT EXISTS reports(
      id TEXT PRIMARY KEY, scope TEXT NOT NULL, request_id TEXT NOT NULL, digest TEXT NOT NULL,
      token_hash TEXT, member TEXT, category TEXT NOT NULL, summary TEXT NOT NULL, details TEXT,
      stage TEXT, error_code TEXT, task_id TEXT, submission_id TEXT, client_version TEXT, client TEXT,
      grp TEXT NOT NULL, status TEXT NOT NULL, reply TEXT, notes TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT,
      UNIQUE(scope, request_id));
    CREATE INDEX IF NOT EXISTS reports_created ON reports(created_at);
    CREATE INDEX IF NOT EXISTS reports_member ON reports(member, created_at);
    CREATE TABLE IF NOT EXISTS outbox(
      report TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL,
      state TEXT NOT NULL, last_error TEXT, delivered_at INTEGER, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS outbox_due ON outbox(state, next_at);`);
  const tx = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
  };
  const q = {
    byScope: db.prepare("SELECT * FROM reports WHERE scope=? AND request_id=?"),
    byId: db.prepare("SELECT * FROM reports WHERE id=?"),
    count: db.prepare("SELECT COUNT(*) AS n FROM reports"),
    open: db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status IN ('new','investigating')"),
    groupCount: db.prepare("SELECT COUNT(*) AS n FROM reports WHERE grp=? AND created_at>=?"),
    insert: db.prepare(`INSERT INTO reports(id,scope,request_id,digest,token_hash,member,category,summary,details,stage,error_code,task_id,submission_id,client_version,client,grp,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new',?,?)`),
    outboxAdd: db.prepare("INSERT INTO outbox(report,next_at,state,updated_at) VALUES(?,?,?,?)"),
    mine: db.prepare("SELECT * FROM reports WHERE member=? ORDER BY created_at DESC LIMIT 50"),
    list: db.prepare(`SELECT r.*, o.state AS delivery, o.attempts AS delivery_attempts, o.last_error AS delivery_error, o.next_at AS delivery_next, o.delivered_at AS delivered_at
      FROM reports r LEFT JOIN outbox o ON o.report=r.id ORDER BY r.created_at DESC LIMIT ? OFFSET ?`),
    one: db.prepare(`SELECT r.*, o.state AS delivery, o.attempts AS delivery_attempts, o.last_error AS delivery_error, o.next_at AS delivery_next, o.delivered_at AS delivered_at
      FROM reports r LEFT JOIN outbox o ON o.report=r.id WHERE r.id=?`),
    update: db.prepare("UPDATE reports SET status=?, reply=?, notes=?, updated_at=?, updated_by=? WHERE id=?"),
    pendingGroup: db.prepare("SELECT o.report FROM outbox o JOIN reports r ON r.id=o.report WHERE r.grp=? AND o.state='pending' LIMIT 1"),
    lastGroup: db.prepare("SELECT MAX(o.delivered_at) AS at FROM outbox o JOIN reports r ON r.id=o.report WHERE r.grp=?"),
    due: db.prepare("SELECT o.*, r.category, r.stage, r.error_code, r.grp, r.task_id FROM outbox o JOIN reports r ON r.id=o.report WHERE o.state='pending' AND o.next_at<=? ORDER BY o.next_at LIMIT 10"),
    nextDue: db.prepare("SELECT MIN(next_at) AS at FROM outbox WHERE state='pending'"),
    sent: db.prepare("UPDATE outbox SET state='delivered', attempts=attempts+1, delivered_at=?, last_error=NULL, updated_at=? WHERE report=?"),
    retry: db.prepare("UPDATE outbox SET attempts=attempts+1, next_at=?, last_error=?, state=?, updated_at=? WHERE report=?"),
    skip: db.prepare("UPDATE outbox SET state='skipped', last_error=?, updated_at=? WHERE report=?"),
    prune: db.prepare("DELETE FROM reports WHERE status='closed' AND updated_at<?"),
    pruneOutbox: db.prepare("DELETE FROM outbox WHERE report NOT IN (SELECT id FROM reports)"),
  };
  // Rate windows, in memory only: the requester's address is never stored with a report.
  const windows = new Map();
  function admit(key, limit) {
    const t = now(), hour = 3_600_000;
    const recent = (windows.get(key) ?? []).filter((x) => t - x < hour);
    if (recent.length >= limit) fail(429, "rate_limited", "Too many reports for now. Nothing was stored.", { retryAfterSeconds: Math.ceil((Math.min(...recent) + hour - t) / 1000) });
    windows.delete(key);
    if (windows.size >= 4096) windows.delete(windows.keys().next().value);
    windows.set(key, [...recent, t]);
  }

  /** Store one report (idempotent per requester scope and requestId). Returns {receipt, created}. */
  function create(body, { member = null, requester = "unknown" } = {}) {
    const report = checkReport(body);
    if (!member && !report.receiptToken) fail(400, "invalid_feedback", "Make and keep receiptToken (32 random bytes as 64 hex characters) before sending; use it with the same requestId to retry or read status.");
    const scope = member ? `member:${member}` : `anon:${sha256(report.receiptToken)}`;
    const digest = payloadDigest(report);
    const prior = q.byScope.get(scope, report.requestId);
    if (prior) {
      if (prior.digest !== digest) fail(409, "feedback_request_conflict", "This requestId was already used for a different report. Use a new requestId for a new report; nothing was stored.");
      return { created: false, receipt: { ...receipt(prior), repeated: true } };
    }
    if (member) admit(`member:${member}`, L.memberPerHour);
    else if (services.has(requester)) admit(`service:${requester}`, L.servicePerHour);
    else admit(`anon:${requester}`, L.anonymousPerHour);
    admit("all", L.globalPerHour);
    const t = now();
    q.prune.run(t - L.closedRetentionMs);
    q.pruneOutbox.run();
    if (q.count.get().n >= L.maxReports) fail(503, "feedback_capacity", "The report inbox is full right now, so nothing was stored. Please try again later.");
    const id = "FB-" + randomUUID();
    const token = member ? null : report.receiptToken;
    const grp = groupOf(report);
    const row = tx(() => {
      q.insert.run(id, scope, report.requestId, digest, token ? sha256(token) : null, member, report.category, report.summary, report.details,
        report.stage, report.errorCode, report.taskId, report.submissionId, report.clientVersion, report.client, grp, t, t);
      const pending = q.pendingGroup.get(grp);
      const last = q.lastGroup.get(grp)?.at;
      const due = Math.max(t, (last ?? 0) + 15 * 60_000);
      q.outboxAdd.run(id, due, !notifier ? "skipped" : pending ? "grouped" : "pending", t);
      return q.byId.get(id);
    });
    if (notifier) queueMicrotask(() => drain().catch((e) => onError?.(e)));
    return { created: true, receipt: receipt(row, { token }) };
  }
  /** An anonymous report's status: needs its receipt token (a report id alone reads nothing). */
  function status(id, token, requester = "unknown") {
    admit(`status:${requester}`, 120);
    if (typeof id !== "string" || !/^FB-[a-f0-9-]{36}$/.test(id) || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      fail(404, "feedback_missing", "No report matches this id and receipt token.");
    const row = q.byId.get(id);
    const ok = row?.token_hash && timingSafeEqual(Buffer.from(row.token_hash, "hex"), Buffer.from(sha256(token), "hex"));
    if (!ok) fail(404, "feedback_missing", "No report matches this id and receipt token.");
    return receipt(row);
  }
  /** A signed member's own reports, newest first (status and reply only). */
  function mine(member) {
    return { reports: q.mine.all(member).map((r) => ({ ...receipt(r), category: r.category, summary: r.summary })) };
  }

  // ---- notification outbox (the team's alerts channel)
  let draining = null, timer = null;
  const backoff = (attempts) => Math.min(6 * 3600_000, 30_000 * 2 ** Math.min(attempts, 10));
  const MAX_ATTEMPTS = 12;
  function schedule() {
    if (!notifier) return;
    clearTimeout(timer);
    const at = q.nextDue.get()?.at;
    if (at === null || at === undefined) return;
    timer = setTimeout(() => { drain().catch((e) => onError?.(e)); }, Math.max(1000, Math.min(at - now(), 3_600_000)));
    timer.unref?.();
  }
  async function deliverOne(item) {
    const t = now();
    const since = t - 24 * 3600_000;
    const count = q.groupCount.get(item.grp, since).n;
    const summary = { report: item.report, category: item.category, stage: item.stage, errorCode: item.error_code, task: item.task_id, groupCount: count, link: adminOrigin ? `${adminOrigin}/admin/feedback/${item.report}` : null };
    let outcome;
    try { outcome = await notifier(summary); }
    catch (e) { outcome = { ok: false, error: "network" }; }
    const at = now();
    if (outcome?.ok) { q.sent.run(at, at, item.report); return; }
    const attempts = item.attempts + 1;
    const wait = Number.isFinite(outcome?.retryAfterSeconds) ? Math.max(1000, Math.min(outcome.retryAfterSeconds * 1000, 6 * 3600_000)) : backoff(attempts);
    const err = String(outcome?.error ?? "failed").slice(0, 80);
    if (outcome?.permanent || attempts >= MAX_ATTEMPTS) q.retry.run(at, err, "failed", at, item.report);
    else q.retry.run(at + wait, err, "pending", at, item.report);
  }
  // One drain at a time. A drain asked for while one runs (a new report arriving) is not lost: the running
  // one goes round again before it finishes, so the caller's promise covers its own report too.
  let again = false;
  async function drain() {
    if (!notifier) return;
    if (draining) { again = true; return draining; }
    // Cleared by the outer promise, never inside the async body: with nothing due the body finishes before
    // `draining` is even assigned, and clearing it there would leave a settled promise blocking every drain.
    const run = (async () => {
      do {
        again = false;
        for (let round = 0; round < 10; round++) {
          const due = q.due.all(now());
          if (!due.length) break;
          for (const item of due) await deliverOne(item);
        }
      } while (again);
    })();
    draining = run.finally(() => { draining = null; schedule(); });
    return draining;
  }
  schedule();
  if (notifier) queueMicrotask(() => drain().catch((e) => onError?.(e)));

  // ---- admin
  const adminRow = (r) => r && ({
    id: r.id, category: r.category, summary: r.summary, details: r.details, stage: r.stage, errorCode: r.error_code,
    taskId: r.task_id, submissionId: r.submission_id, clientVersion: r.client_version, client: r.client,
    member: r.member, anonymous: !r.member, group: r.grp, status: r.status, reply: r.reply, notes: r.notes,
    createdAt: nowIso(r.created_at), updatedAt: nowIso(r.updated_at), updatedBy: r.updated_by,
    similarReports: q.groupCount.get(r.grp, now() - 24 * 3600_000).n,
    delivery: r.delivery ?? "none", deliveryAttempts: r.delivery_attempts ?? 0, deliveryError: r.delivery_error ?? null,
    deliveryNextAt: r.delivery === "pending" && r.delivery_next ? nowIso(r.delivery_next) : null,
    deliveredAt: r.delivered_at ? nowIso(r.delivered_at) : null,
  });
  return {
    enabled: true,
    create,
    status,
    mine,
    drain,
    list: (limit = 200, offset = 0) => q.list.all(Math.max(1, Math.min(500, limit)), Math.max(0, Math.floor(offset))).map(adminRow),
    count: () => q.count.get().n,
    get: (id) => adminRow(q.one.get(id)),
    openCount: () => q.open.get().n,
    /** Admin: set status, the short reply the reporter sees, and private notes. Never touches anything else. */
    update(id, { status, reply, notes }, { by }) {
      if (!FEEDBACK_STATUSES.includes(status)) fail(400, "invalid_feedback", `Status is one of ${FEEDBACK_STATUSES.join(", ")}.`);
      const clean = (v, max, label) => {
        if (v === undefined || v === null) return null;
        if (typeof v !== "string" || CONTROL.test(v) || v.length > max) fail(400, "invalid_feedback", `${label} is at most ${max} characters of plain text.`);
        return v.trim() || null;
      };
      const r = clean(reply, REPLY_MAX, "The reply"), n = clean(notes, NOTES_MAX, "Notes");
      if (r && refusalFor(r)) fail(400, "invalid_feedback", "The reply looks like it holds a secret or a file path; it was not saved.");
      const row = q.byId.get(id);
      if (!row) fail(404, "feedback_missing", "No such report.");
      q.update.run(status, r, n, now(), String(by ?? "").slice(0, 200), id);
      return adminRow(q.one.get(id));
    },
    async close() { clearTimeout(timer); await draining; clearTimeout(timer); db.close(); },
  };
}

/**
 * The team's alerts channel, through a Slack incoming webhook (the URL is private configuration).
 * The message carries the report id, category, stage, error code, task id, a repeat count and the
 * admin link: never the reporter's text, their address or anything they could put a mention in.
 */
export function slackNotifier(webhookUrl, { fetchImpl = globalThis.fetch, timeoutMs = 10_000, label = "UAIN feedback" } = {}) {
  let url;
  try { url = new URL(webhookUrl); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "hooks.slack.com") return null;
  const safe = (v) => String(v ?? "").replace(/[^A-Za-z0-9 ._:/-]/g, "").slice(0, 120);
  return async ({ report, category, stage, errorCode, task, groupCount, link }) => {
    const lines = [
      `*${safe(label)}*: new ${safe(category)} report \`${safe(report)}\``,
      [stage ? `stage ${safe(stage)}` : null, errorCode ? `error \`${safe(errorCode)}\`` : null, task ? `task ${safe(task)}` : null].filter(Boolean).join(" · ") || null,
      groupCount > 1 ? `${groupCount} similar reports in 24 h` : null,
      link ? `<${safe(link)}|Open in admin>` : null,
    ].filter(Boolean);
    const response = await fetchImpl(url.href, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n"), unfurl_links: false, unfurl_media: false }),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel?.().catch(() => {});
    if (response.ok) return { ok: true };
    const retry = Number(response.headers.get("retry-after"));
    // 4xx other than 429 (a revoked webhook, a bad request) will not succeed by retrying.
    return { ok: false, error: `http_${response.status}`, ...(Number.isFinite(retry) && retry > 0 ? { retryAfterSeconds: retry } : {}), permanent: response.status >= 400 && response.status < 500 && response.status !== 429 };
  };
}
