// Private admin-only signup evidence. No network lookup occurs on dashboard reads.
import { isIP } from 'node:net';
import { readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';

export const RELAY_SIGNUP = Symbol('relay-signup');
export const normalizeIp = value => {
  const ip = typeof value === 'string' ? value.replace(/^::ffff:/, '') : '';
  return isIP(ip) ? ip : null;
};
export function signupOrigin(req, { trustProxy = false, serviceIps = [] } = {}) {
  if (req[RELAY_SIGNUP]) return { ip: null, reason: 'relay' };
  const peer = normalizeIp(req.socket?.remoteAddress);
  const loopback = ['127.0.0.1', '::1'].includes(peer);
  const ip = trustProxy && loopback ? normalizeIp(req.headers?.['x-real-ip']) : peer;
  // Private/reserved peers cannot establish a person's public signup location.
  if (!ip || serviceIps.map(normalizeIp).includes(ip) || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::|f[cd]|fe80:)/i.test(ip))
    return { ip: null, reason: 'unavailable-or-service' };
  return { ip, reason: trustProxy && loopback ? 'trusted-ingress' : 'direct-peer' };
}
export function createMemberOrigins(dataDir) {
  const file = join(dataDir, 'admin-member-origins.json');
  let tail = Promise.resolve();
  async function read() {
    try {
      const value = JSON.parse(await readFile(file, 'utf8'));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  function record(address, createdAt, origin) {
    const next = tail.then(async () => {
      const rows = await read();
      if (Object.hasOwn(rows, address)) return;
      rows[address] = { createdAt, ip: origin.ip, evidence: origin.reason, location: null };
      const temp = file + '.tmp';
      await writeFile(temp, JSON.stringify(rows) + '\n', { mode: 0o600 });
      await chmod(temp, 0o600); await rename(temp, file);
    });
    tail = next.catch(() => {});
    return next;
  }
  return { read, record };
}
