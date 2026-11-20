#!/usr/bin/env node
/**
 * House-agent rename signer: signs exactly one member_rename for one house agent, with
 * that agent's own key, and journals it before printing anything.
 *
 * The chain rule member-rename-v1 (uaind 0.4.3, chain/federation/member_rename.go) lets a
 * licensed member change its own public name up to five times; every change is a public,
 * immutable record member_rename/<address>/<n>. BAINK does not prepare this operation, so
 * the guardian launcher on the validator (ops/custody/member_rename_launch.py prepare)
 * builds the command from a fresh proof, this tool signs it on the agents' host, and the
 * launcher's relay step broadcasts the signed envelope and proves the receipt. Only the
 * signed envelope leaves this host; the key never does.
 *
 * Usage (as the agents' user, fleet stopped):
 *   node house-rename.mjs sign --home <agent-home> --name "<new name>" --kit <uain-agent.mjs> --kit-sha256 <hex>  < command.json
 *
 * Refuses unless the command is a member_rename for this key on the pinned chain, with
 * exactly {"name": <new name>}. Send-once: one signature per (member, sequence). The same
 * command again prints the same journalled envelope; a different command at a sequence
 * already signed is refused (after a proved expiry, archive the journal by hand first).
 */
import { readFileSync, writeFileSync, renameSync, existsSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CHAIN = 'uain-shadow-20261008-1';
export const OPERATION = 'member_rename';
const FIELDS = ['version', 'chain_id', 'member', 'sequence', 'expires_height', 'operation', 'payload'];
const JOURNAL_SCHEMA = 'uain-house-rename-journal-v1';
const need = (ok, message) => { if (!ok) throw Object.assign(new Error(message), { code: 'house_rename_refused' }); };
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/** Name rule of the chain (validMemberName) plus no double quotes, so it is safe in a prompt. */
export function validName(name) {
  return typeof name === 'string' && name.isWellFormed() && name === name.trim() && Buffer.byteLength(name) >= 2 && Buffer.byteLength(name) <= 120 && !/[\u0000-\u001f\u007f-\u009f"]/.test(name);
}

export function checkCommand(c, { address, name }) {
  need(exact(c, FIELDS) && c.version === 1 && c.chain_id === CHAIN && c.member === address && c.operation === OPERATION, 'not a member_rename for this key on the pinned chain');
  need(exact(c.payload, ['name']) && c.payload.name === name && validName(name), 'the payload is not exactly the reviewed new name');
  need(typeof c.sequence === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(c.sequence) && typeof c.expires_height === 'string' && /^[1-9][0-9]{0,18}$/.test(c.expires_height), 'bad sequence or expiry');
  return c;
}

function writeAtomic(file, text) {
  const tmp = join(dirname(file), '.' + Date.now() + '-' + process.pid + '.tmp');
  writeFileSync(tmp, text, { mode: 0o600, flag: 'wx' });
  const fd = openSync(tmp, 'r'); fsyncSync(fd); closeSync(fd);
  renameSync(tmp, file);
  const dir = openSync(dirname(file), 'r'); fsyncSync(dir); closeSync(dir);
}

/** Sign once and journal; returns the envelope. `kit` is the imported, pinned agent kit. */
export async function signRename({ kit, home, name, command, now = () => new Date().toISOString() }) {
  const identity = await kit.loadIdentity({ home });
  checkCommand(command, { address: identity.address, name });
  const file = join(dirname(identity.summary.file), 'rename-journal.json');
  const journal = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { schema: JOURNAL_SCHEMA, address: identity.address, signed: {} };
  need(journal.schema === JOURNAL_SCHEMA && journal.address === identity.address, 'journal belongs to another key');
  const bytes = kit.commandBytes(command);
  const prior = journal.signed[command.sequence];
  if (prior) {
    need(prior.commandDigest === sha256(bytes), `sequence ${command.sequence} already signed another command; prove it expired and archive ${file} first`);
    return prior.envelope;
  }
  const { subtle } = globalThis.crypto;
  const signature = new Uint8Array(await subtle.sign('Ed25519', identity.privateKey, bytes));
  need(await subtle.verify('Ed25519', identity.publicKey, signature, bytes), 'signature check failed');
  const raw = new Uint8Array(await subtle.exportKey('raw', identity.publicKey));
  const envelope = { command: structuredClone(command), public_key: Buffer.from(raw).toString('base64url'), signature: Buffer.from(signature).toString('base64url') };
  journal.signed[command.sequence] = { name, commandDigest: sha256(bytes), envelope, signedAt: now() };
  writeAtomic(file, JSON.stringify(journal, null, 1) + '\n');
  return envelope;
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) { need(argv[i]?.startsWith('--') && argv[i + 1] !== undefined, 'usage'); o[argv[i].slice(2)] = argv[i + 1]; }
  return o;
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  need(mode === 'sign', 'usage: house-rename.mjs sign --home <dir> --name <name> --kit <path> --kit-sha256 <hex> < command.json');
  const o = args(rest);
  need(isAbsolute(o.home ?? '') && isAbsolute(o.kit ?? '') && /^[a-f0-9]{64}$/.test(o['kit-sha256'] ?? ''), 'need absolute --home and --kit and a --kit-sha256 pin');
  need(sha256(readFileSync(o.kit)) === o['kit-sha256'], 'the agent kit does not match its pin');
  const kit = await import(pathToFileURL(o.kit).href);
  const command = JSON.parse(readFileSync(0, 'utf8'));
  const envelope = await signRename({ kit, home: o.home, name: o.name, command });
  process.stdout.write(JSON.stringify(envelope) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { process.stderr.write(`house-rename: ${e.message}\n`); process.exitCode = 1; });
}
