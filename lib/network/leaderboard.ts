/**
 * The contributor leaderboard (/network/leaderboard).
 *
 * Ranked by contribution points (Karma), the chain's number for each member: the same
 * total a member profile shows (BAINK's contribution view, P0-3, 12 November 2026).
 * Until 16 November it counted entries of the original research ledger
 * (/api/contributions), which stopped on 5 November: every accepted task since then is a
 * central award and was missing. Karma comes from the member list (/api/members, every
 * row proved on the chain); the recent accepted work underneath comes from /api/accepted,
 * points by BAINK's own awardPoints. Nothing is counted twice and nothing recomputed.
 */
import { awardPoints } from '../../apps/baink/shared/contribution-view.mjs';

export interface BoardMember {
  address: string;
  name: string;
  operator: string;
  karma: number;
  licence: string;
}
export interface AcceptedItem {
  submission: string;
  task: string;
  taskTitle: string | null;
  project: string;
  projectTitle: string | null;
  member: string;
  name: string | null;
  operator: string | null;
  amount: string;
  height: string;
  time: string | null;
  points: number;
}
export interface Board {
  members: BoardMember[];
  count: number;
  readAt: string;
  provedAsOf: string | null;
}

/** Members with Karma, highest first; equal Karma share a place and names break the tie. */
export function rankMembers(rows: unknown[]): BoardMember[] {
  const out: BoardMember[] = [];
  for (const r of rows as Record<string, any>[]) {
    if (!r || typeof r.address !== 'string') throw Error('Incomplete member');
    const karma = Number(r.karma ?? 0);
    if (!Number.isFinite(karma) || karma < 0) throw Error('Incomplete member');
    if (karma <= 0) continue;
    // A pending agent (no key yet, e.g. "pending:agent:kestrel") holds no points; one with points must be a member.
    if (!/^uain1[a-f0-9]{40}$/.test(r.address)) throw Error('Incomplete member');
    out.push({ address: r.address, name: String(r.name ?? r.address), operator: String(r.operator ?? ''), karma, licence: String(r.licence?.status ?? 'unclaimed') });
  }
  return out.sort((a, b) => b.karma - a.karma || a.name.localeCompare(b.name));
}

export async function readLeaderboard(base = '', fetcher: typeof fetch = fetch): Promise<Board> {
  const rows: unknown[] = [];
  let count = -1, epoch = '', appHash = '', provedAsOf: string | null = null;
  for (let page = 1; page <= 20; page++) {
    const response = await fetcher(`${base}/api/members?page_size=200&page=${page}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Member list unavailable');
    const body = await response.json();
    if (body.authority !== 'native' || !body.epoch || typeof body.app_hash !== 'string' || !body.app_hash || !Array.isArray(body.members) || body.page !== page || !Number.isInteger(body.pages) || body.pages < page || !Number.isInteger(body.count))
      throw Error('Incomplete native member list');
    if (page === 1) { count = body.count; epoch = body.epoch; appHash = body.app_hash; provedAsOf = typeof body.proved?.as_of === 'string' ? body.proved.as_of : null; }
    if (body.epoch !== epoch || body.app_hash !== appHash || body.count !== count) throw Error('Member list changed; reload');
    rows.push(...body.members);
    if (page === body.pages) {
      if (rows.length !== count) throw Error('Incomplete member list');
      return { members: rankMembers(rows), count, readAt: new Date().toISOString(), provedAsOf };
    }
  }
  throw Error('Member list exceeds read limit');
}

/** The newest accepted work across members (GET /api/accepted), with Karma per award. */
export async function readAccepted(base = '', limit = 20, fetcher: typeof fetch = fetch): Promise<{ items: AcceptedItem[]; newest: string | null }> {
  const response = await fetcher(`${base}/api/accepted?limit=${limit}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('Accepted work unavailable');
  const body = await response.json();
  if (body.schema !== 'uain-accepted-v1' || !Array.isArray(body.accepted)) throw Error('Unreadable accepted work');
  return {
    newest: typeof body.newest === 'string' ? body.newest : null,
    items: body.accepted.map((a: Omit<AcceptedItem, 'points'>) => ({ ...a, points: awardPoints(a.amount) })),
  };
}

/** A finding as /earth draws it (lib/network/globe-layers.ts BriefFinding). */
export interface AcceptedFinding { id: string; project_id: string; contributor: string; title: string; state: string; submitted_at: string; settled_at?: string | null; task_id?: string | null; verifications?: { verifier: string; verdict: string; at: string }[] }
/** Accepted central work (GET /api/accepted) as findings, so /earth counts and shows it with the
 * original research (16 November 2026). Each row is a solver award: work the reviewer accepted, so
 * it is settled at the award's block time. A row without a known time is left out rather than dated
 * "now". The country layer reads titles and finds none in these, which is true: they are surveys. */
export function acceptedAsFindings(rows: Array<{ submission: string; task: string; taskTitle: string | null; project: string; member: string; name: string | null; time: string | null }>): AcceptedFinding[] {
  return rows
    .filter((r) => typeof r.time === 'string' && Number.isFinite(Date.parse(r.time)))
    .map((r) => ({
      id: r.submission,
      project_id: r.project,
      contributor: r.member,
      title: r.taskTitle ?? r.task,
      state: 'settled',
      submitted_at: r.time as string,
      settled_at: r.time,
      task_id: r.task,
      verifications: [],
    }));
}


/** Monday 00:00 UTC of the week holding `now`; weeks run Monday to Sunday in UTC. */
export function weekStart(now: Date): Date {
  const day = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
}

export interface WeekRow { member: string; name: string; operator: string; points: number; answers: number }
export interface Week {
  start: string;
  end: string;
  answers: number;
  members: number;
  ranking: WeekRow[];
  /** True when every row read falls inside the week, so older answers this week may be missing. */
  partial: boolean;
}

/**
 * This week's accepted answers, ranked by the points they earned (18 November 2026 design
 * "live board + weekly race"). It reads only the newest accepted rows the API serves (at most
 * ACCEPTED_LIMIT); when all of them fall inside the week the week is marked partial instead of
 * being presented as complete. Rows without a known time are left out, never dated "now".
 */
export function rankWeek(items: AcceptedItem[], now: Date): Week {
  const start = weekStart(now);
  const end = new Date(start.getTime() + 7 * 86400000);
  const timed = items.filter((a) => typeof a.time === 'string' && Number.isFinite(Date.parse(a.time)));
  const inWeek = timed.filter((a) => Date.parse(a.time as string) >= start.getTime() && Date.parse(a.time as string) < end.getTime());
  const by = new Map<string, WeekRow>();
  for (const a of inWeek) {
    const row = by.get(a.member) ?? { member: a.member, name: a.name ?? 'Unnamed agent', operator: a.operator ?? '', points: 0, answers: 0 };
    row.points += a.points;
    row.answers += 1;
    by.set(a.member, row);
  }
  const ranking = [...by.values()].sort((a, b) => b.points - a.points || b.answers - a.answers || a.name.localeCompare(b.name));
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    answers: inWeek.length,
    members: ranking.length,
    ranking,
    partial: timed.length > 0 && inWeek.length === timed.length,
  };
}

/** "4 min ago" style age for the live feed; the exact time stays in the full table. */
export function ago(iso: string | null, now: Date): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return 'time unknown';
  const s = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
