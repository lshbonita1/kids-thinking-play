// GET /api/admin-stats — 관리자 통계 (Authorization: Bearer <ADMIN_TOKEN>)
import { sbSelectAll, VISITS_TABLE } from '../lib/supabase.js';
import { EXCLUDED_VISIT_IPS, looksLikeBotIsp, fetchIpGeo, CITY_NAME_KO } from '../lib/geo.js';
import { isAdmin } from '../lib/request.js';

const DAY_MS = 86400000;
const KEEP_DAYS = 180; // 통계에 쓰는 기간 (개인정보처리방침의 보관 기간과 같게)
const kstDay = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);

const distinct = (rows, key) => new Set(rows.map((r) => r[key]).filter(Boolean)).size;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAdmin(req)) {
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
    // IP별 지역 · 통신사 (최근에 들어온 IP부터 최대 1000개)
    const allIps = [...new Set(rows.map((r) => r.ip_address).filter(Boolean))].slice(0, 1000);
    const geo = await fetchIpGeo(allIps);
    // 빼는 기록: 관리자 기기 + 환경 변수로 정한 IP(내 접속), 클라우드 · 봇 통신사와 해외 IP(대부분 봇)
    const isBot = (r) => {
      const g = geo[r.ip_address];
      return looksLikeBotIsp(g) || (g && g.countryCode !== 'KR');
    };
    const mine = rows.filter((r) => !r.is_admin && !EXCLUDED_VISIT_IPS.includes(r.ip_address) && !isBot(r));
    const botRows = rows.filter((r) => !r.is_admin && isBot(r));
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

    // 이용 흐름 (최근 2주, 서로 다른 기기 기준): 방문 → 놀이 시작 → 끝까지 → 결과에서 다음 놀이
    const in2w = recent2w(mine);
    const ev = (name) => in2w.filter((r) => r.event === name);
    const starts = ev('start');
    const quits = ev('quit');
    const results = ev('result');
    const nexts = results.filter((r) => String(r.page || '').startsWith('next'));
    const funnel = {
      visitors: distinct(recent2w(visits), 'visitor_id'),
      started: distinct(starts, 'visitor_id'),
      finished: distinct(ev('play'), 'visitor_id'),
      next: distinct(nexts, 'visitor_id'),
      starts: starts.length,
      quits: quits.length,
      plays: ev('play').length,
      results: { next: nexts.length, again: results.filter((r) => r.page === 'again').length, home: results.filter((r) => r.page === 'home').length },
      // 어디서 시작했는지 (first: 첫 놀이 카드 · link: 놀이 소개 페이지 · next: 다음 놀이 · again: 다시 하기)
      via: ['first', 'link', 'next', 'again', 'rec'].reduce((o, k) => ({ ...o, [k]: starts.filter((r) => r.page === k).length }), {}),
      quitHow: { x: quits.filter((r) => r.page === 'x').length, close: quits.filter((r) => r.page === 'close').length },
      // 시작 기록을 넣은 날(버전 134)부터 의미가 있음
      since: starts.length ? starts[starts.length - 1].ts : null,
    };
    // 학습지 인쇄 버튼 (최근 2주): 종류별 · 들어온 곳별
    const sheetRows = ev('sheet');
    const sheets = {
      total: sheetRows.length,
      visitors: distinct(sheetRows, 'visitor_id'),
      byType: [...group(sheetRows, 'game')].map(([type, v]) => ({ type, count: v.length })).sort((a, b) => b.count - a.count),
      bySource: [...group(sheetRows, 'page')].map(([source, v]) => ({ source: source || 'home', count: v.length })).sort((a, b) => b.count - a.count),
    };

    // 놀이별 그만둔 횟수 · 평균 몇 번째 문제에서 그만뒀는지
    const quitGames = [...group(quits, 'game')].map(([game, v]) => ({
      game,
      starts: starts.filter((r) => r.game === game).length,
      quits: v.length,
      avgAt: Math.round((v.reduce((s, r) => s + (r.score || 0), 0) / v.length) * 10) / 10,
    })).sort((a, b) => b.quits - a.quits).slice(0, 12);

    // QR 코드 · 채널 링크로 들어온 방문 (page가 'qr-이름' 또는 'utm-출처-캠페인')
    const qrVisits = visits.filter((r) => /^(qr|utm)-/.test(String(r.page || '')));
    const qr = {
      today: qrVisits.filter((r) => r.day === today).length,
      week2: recent2w(qrVisits).length,
      total: qrVisits.length,
      visitors: distinct(qrVisits, 'visitor_id'),
      bySource: [...group(qrVisits, 'page')].map(([page, v]) => ({ source: page.startsWith('qr-') ? page.slice(3) : page, visits: v.length, visitors: distinct(v, 'visitor_id') }))
        .sort((a, b) => b.visits - a.visits),
      daily: [...group(recent2w(qrVisits), 'day')].map(([day, v]) => ({ day, visits: v.length })).sort((a, b) => (a.day < b.day ? 1 : -1)),
    };

    // 지역별 접속 분포 (최근 2주, 서로 다른 IP 기준 · ip-api.com으로 추정)
    const ipInfo = new Map(); // IP → { last, visits }
    for (const r of recent2w(visits)) {
      if (!r.ip_address) continue;
      const cur = ipInfo.get(r.ip_address) || { last: 0, visits: 0 };
      cur.visits += 1;
      cur.last = Math.max(cur.last, r.ts);
      ipInfo.set(r.ip_address, cur);
    }
    const regionCount = new Map();
    const ipList = [];
    for (const [ip, info] of ipInfo) {
      const g = geo[ip];
      const region = g ? g.region : '알 수 없음';
      regionCount.set(region, (regionCount.get(region) || 0) + 1);
      ipList.push({ ip, region, city: g ? (CITY_NAME_KO[g.city] || g.city) : '', isp: g?.isp || '', last: info.last, visits: info.visits });
    }

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
      regions: [...regionCount].map(([region, count]) => ({ region, count })).sort((a, b) => b.count - a.count),
      ipList: ipList.sort((a, b) => b.last - a.last).slice(0, 100),
      botIps: new Set(recent2w(botRows).map((r) => r.ip_address)).size,
      botToday: botRows.filter((r) => r.day === today).length,
      qr,
      funnel,
      quitGames,
      sheets,
      adminToday: rows.filter((r) => r.is_admin && r.day === today).length,
      keepDays: KEEP_DAYS,
    });
  } catch (e) {
    res.status(500).json({ error: '통계를 불러오지 못했어요.', detail: String(e.message || e) });
  }
}
