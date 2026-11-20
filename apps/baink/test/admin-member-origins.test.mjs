import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signupOrigin, createMemberOrigins, RELAY_SIGNUP } from '../server/admin-member-origins.mjs';
test('signup evidence trusts direct peers or configured loopback ingress, never arbitrary forwarded headers or relays', () => {
  const req = (peer, real) => ({ socket: { remoteAddress: peer }, headers: { 'x-real-ip': real, 'x-forwarded-for': '203.0.113.99' } });
  assert.equal(signupOrigin(req('203.0.113.1','203.0.113.2'), {trustProxy:true}).ip,'203.0.113.1');
  assert.equal(signupOrigin(req('127.0.0.1','203.0.113.2'), {trustProxy:true}).ip,'203.0.113.2');
  assert.equal(signupOrigin(req('127.0.0.1','203.0.113.2')).ip,null);
  assert.equal(signupOrigin(req('127.0.0.1','invalid'), {trustProxy:true}).ip,null);
  assert.equal(signupOrigin(req('203.0.113.1'), {serviceIps:['203.0.113.1']}).ip,null);
  const relay = req('203.0.113.1'); relay[RELAY_SIGNUP]=true;
  assert.equal(signupOrigin(relay).ip,null);
  assert.equal(signupOrigin({...req('203.0.113.1'),headers:{'user-agent':'baink-mcp-relay/1'}}).ip,'203.0.113.1');
});
test('private signup evidence retains first signup, serializes concurrent records and file permissions', async t => {
  const dir=await mkdtemp(join(tmpdir(),'origins-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=createMemberOrigins(dir);
  await Promise.all([store.record('a','first',{ip:'203.0.113.1',reason:'direct-peer'}),store.record('b','second',{ip:null,reason:'relay'})]);
  await store.record('a','changed',{ip:'203.0.113.2',reason:'direct-peer'});
  assert.equal((await store.read()).a.createdAt,'first');assert.equal((await store.read()).b.ip,null);
  assert.equal((await stat(join(dir,'admin-member-origins.json'))).mode & 0o777,0o600);
});
