// POST /api/visit — 방문 · 놀이 완료 기록 (뉴스런 api/dates.js?visit=1과 같은 방식)
// 사이트가 열릴 때 한 번(visit), 놀이를 끝까지 하면 한 번(play) 불림. 실패해도 사이트에는 영향 없음.
import { sbInsert, sbDelete, VISITS_TABLE } from '../lib/supabase.js';
import { getClientIp, readBody } from '../lib/request.js';

const KEEP_DAYS = 180; // 개인정보처리방침의 보관 기간 (6개월)

// 브라우저 정보는 기기 종류 · 브라우저 이름만 남김
function deviceOf(ua = '') {
  const os = /iPad/.test(ua) ? 'iPad'
    : /iPhone/.test(ua) ? 'iPhone'
    : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android 폰' : 'Android 태블릿')
    : /Macintosh/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows'
    : '기타';
  const browser = /KAKAOTALK/i.test(ua) ? '카카오톡'
    : /NAVER/.test(ua) ? '네이버'
    : /SamsungBrowser/.test(ua) ? '삼성 인터넷'
    : /Edg\//.test(ua) ? 'Edge'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /FxiOS|Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : '기타';
  return `${os} · ${browser}`;
}

// 검색엔진 · 링크 미리보기 · 자동 브라우저(봇)는 기록하지 않음
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|scrap|facebookexternalhit|yeti|daum|python|curl|wget|node-fetch|axios|vercel/i;
const SITE_HOST = /(^|\.)ssukssuknori\.app$/;
function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

const clean = (v, n = 60) => String(v ?? '').trim().replace(/[^\w.\-\/:%가-힣]/g, '').slice(0, n) || null;
const small = (v) => (Number.isFinite(Number(v)) ? Math.max(-32768, Math.min(32767, Math.round(Number(v)))) : null);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 돼요.' });
    return;
  }
  try {
    // sendBeacon은 글자(text/plain)로 보내서 직접 읽어 줌
    const body = readBody(req);
    const ua = req.headers['user-agent'] || '';
    const from = hostOf(req.headers.origin || req.headers.referer || '');
    if (BOT_UA.test(ua) || (from && !SITE_HOST.test(from))) {
      res.status(204).end();
      return;
    }
    const row = {
      event: body.t === 'play' ? 'play' : 'visit',
      ip_address: getClientIp(req),
      visitor_id: clean(body.vid, 100),
      device: deviceOf(req.headers['user-agent'] || ''),
      page: clean(body.page, 40),
      referrer_host: clean(body.ref, 120),
      game: clean(body.game, 20),
      level: small(body.level),
      score: small(body.score),
      is_admin: Boolean(body.admin),
    };
    await sbInsert(VISITS_TABLE, row);
    // 가끔(약 50번에 한 번) 보관 기간이 지난 기록을 지움
    if (Math.random() < 0.02) {
      await sbDelete(VISITS_TABLE, { visited_at: `lt.${new Date(Date.now() - KEEP_DAYS * 86400000).toISOString()}` });
    }
  } catch (e) { /* 방문 기록 실패는 무시 */ }
  res.status(204).end();
}
