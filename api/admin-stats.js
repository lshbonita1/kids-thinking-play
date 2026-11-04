// GET /api/admin-stats — 관리자 통계 (Authorization: Bearer <ADMIN_TOKEN>)
import { sbSelectAll, VISITS_TABLE } from '../lib/supabase.js';

const DAY_MS = 86400000;
const KEEP_DAYS = 180; // 통계에 쓰는 기간 (개인정보처리방침의 보관 기간과 같게)
const kstDay = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);

// 시간 차이로 비밀번호를 알아내지 못하도록 끝까지 비교
function sameText(a = '', b = '') {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const distinct = (rows, key) => new Set(rows.map((r) => r[key]).filter(Boolean)).size;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!process.env.ADMIN_TOKEN || !sameText(token, process.env.ADMIN_TOKEN)) {
    res.status(401).json({ error: '비밀번호가 맞지 않아요.' });
    return;
  }
  try {
    const now = Date.now();
    const rows = await sbSelectAll(VISITS_TABLE, {
      select: 'visited_at,event,ip_address,visitor_id,device,page,referrer_host,game,level,score,is_admin',
      visited_at: `gte.${new Date(now - KEEP_DAYS * DAY_MS).toISOString()}`,
      order: 'visited_at.desc',
    });
    for (const r of rows) {
      r.ts = Date.parse(r.visited_at);
      r.day = kstDay(r.ts);
    }
    const today = kstDay(now);
    const yesterday = kstDay(now - DAY_MS);
    const since = kstDay(now - 13 * DAY_MS);
    const mine = rows.filter((r) => !r.is_admin); // 내 접속 제외
    const visits = mine.filter((r) => r.event === 'visit');
    const plays = mine.filter((r) => r.event === 'play');

    const dayMetrics = (day) => {
      const v = visits.filter((r) => r.day === day);
      return { visits: v.length, ips: distinct(v, 'ip_address'), visitors: distinct(v, 'visitor_id'), plays: plays.filter((r) => r.day === day).length };
    };
    const group = (list, key) => {
      const m = new Map();
      for (const r of list) m.set(r[key], (m.get(r[key]) || []).concat(r));
      return m;
    };
    const recent2w = (list) => list.filter((r) => r.day >= since);

    res.status(200).json({
      today,
      todayM: dayMetrics(today),
      yesterdayM: dayMetrics(yesterday),
      totals: {
        visits: visits.length,
        ips: distinct(visits, 'ip_address'),
        visitors: distinct(visits, 'visitor_id'),
        plays: plays.length,
        since: rows.length ? rows[rows.length - 1].ts : null,
      },
      daily: [...group(recent2w(visits), 'day')].map(([day, v]) => ({ day, visits: v.length, visitors: distinct(v, 'visitor_id') })),
      games: [...group(recent2w(plays), 'game')]
        .map(([game, v]) => ({ game, plays: v.length, avgScore: Math.round(v.reduce((s, r) => s + (r.score || 0), 0) / v.length) }))
        .sort((a, b) => b.plays - a.plays),
      devices: [...group(recent2w(visits), 'device')]
        .map(([device, v]) => ({ device, visits: v.length }))
        .sort((a, b) => b.visits - a.visits).slice(0, 8),
      referrers: [...group(recent2w(visits).filter((r) => r.referrer_host), 'referrer_host')]
        .map(([host, v]) => ({ host, visits: v.length }))
        .sort((a, b) => b.visits - a.visits).slice(0, 8),
      recent: mine.slice(0, 50).map((r) => ({
        ts: r.ts, type: r.event, device: r.device, page: r.page, game: r.game, level: r.level, score: r.score,
        ip: r.ip_address, visitor: r.visitor_id ? r.visitor_id.slice(0, 6) : null,
      })),
      adminToday: rows.filter((r) => r.is_admin && r.day === today).length,
      keepDays: KEEP_DAYS,
    });
  } catch (e) {
    res.status(500).json({ error: '통계를 불러오지 못했어요.', detail: String(e.message || e) });
  }
}
