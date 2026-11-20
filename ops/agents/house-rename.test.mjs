import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as kit from '../../apps/baink/agent-kit/uain-agent.mjs';
import { signRename, validName, CHAIN } from './house-rename.mjs';

async function agent() {
  const home = mkdtempSync(join(tmpdir(), 'house-rename-'));
  chmodSync(home, 0o700);
  const made = await kit.initIdentity({ home });
  return { home, address: made.address };
}
const command = (address, over = {}) => ({ version: 1, chain_id: CHAIN, member: address, sequence: '26', expires_height: '1861300', operation: 'member_rename', payload: { name: 'Nora Quill' }, ...over });

test('signs the exact rename with the agent key and journals it before returning', async () => {
  const { home, address } = await agent();
  const c = command(address);
  const e = await signRename({ kit, home, name: 'Nora Quill', command: c });
  assert.deepEqual(e.command, c);
  const identity = await kit.loadIdentity({ home });
  const ok = await crypto.subtle.verify('Ed25519', identity.publicKey, Buffer.from(e.signature, 'base64url'), kit.commandBytes(c));
  assert.equal(ok, true);
  const journal = JSON.parse(readFileSync(join(home, 'default', 'rename-journal.json'), 'utf8'));
  assert.deepEqual(journal.signed['26'].envelope, e);
  // The same command again returns the same envelope, and nothing new is signed.
  assert.deepEqual(await signRename({ kit, home, name: 'Nora Quill', command: c }), e);
});

test('a second, different command at a signed sequence is refused', async () => {
  const { home, address } = await agent();
  await signRename({ kit, home, name: 'Nora Quill', command: command(address) });
  await assert.rejects(signRename({ kit, home, name: 'Nora Quill', command: command(address, { expires_height: '1861400' }) }), /already signed another command/);
  await assert.rejects(signRename({ kit, home, name: 'Theo Marsh', command: command(address, { payload: { name: 'Theo Marsh' } }) }), /already signed another command/);
});

test('anything but this key renaming itself to the reviewed name is refused unsigned', async () => {
  const { home, address } = await agent();
  const bad = [
    command('uain1' + 'b'.repeat(40)),
    command(address, { operation: 'coin_transfer' }),
    command(address, { chain_id: 'other' }),
    command(address, { payload: { name: 'Nora Quill', extra: '1' } }),
    command(address, { payload: { name: 'Someone Else' } }),
    { ...command(address), instance: 'x' },
  ];
  for (const c of bad) await assert.rejects(signRename({ kit, home, name: 'Nora Quill', command: c }), /house_rename|not a member_rename|payload/);
  assert.equal(existsSync(join(home, 'default', 'rename-journal.json')), false);
});

test('names follow the chain rule and stay prompt-safe', () => {
  for (const n of ['Nora Quill', 'Théo', 'Al']) assert.equal(validName(n), true);
  for (const n of [' Nora', 'Nora ', 'N', 'a"b', 'x\ny', 'x'.repeat(121), 7]) assert.equal(validName(n), false);
});
