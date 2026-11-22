// 인스타 · 스레드 게시물 조회수를 하루 한 번 ssuk_insta_posts에 적음 (게시 후 7일 동안)
// views: 인스타 릴스 조회수 · th_views: 스레드 조회수 · views_at: 마지막으로 적은 시각
// dry: true면 조회수만 읽어서 돌려주고 아무것도 저장하지 않음 (토큰 갱신도 안 함) — 미리보기 · 확인용
// 저장은 관리자가 '자동 기록 켜기'를 눌러야 시작 (ssuk_kv 'views_on' = '1'). 켤 때 조회수 칸이 있는지 먼저 확인
import { sbSelect, sbInsert, sbUpdate } from './supabase.js';
import { POSTS_TABLE, loadRows, getToken, graph as igGraph } from './insta.js';
import { threadsOn, getThreadsToken, graph as thGraph } from './threads.js';

const WINDOW_MS = 7 * 864e5 + 3600e3; // 게시 후 7일 (+1시간 여유: 7일째 갱신이 빠지지 않게)
const GAP_MS = 20 * 3600e3;           // cron이 하루 두 번 불러도 하루 한 번만 갱신

// 오류 글에 토큰처럼 보이는 긴 글자가 섞이면 가림
const safe = (e) => String(e?.message || e).replace(/\b(EAA|IGAA|TH)[A-Za-z0-9_-]{16,}/g, '***').slice(0, 300);

// 인사이트 응답에서 숫자 꺼내기 (values[0].value 또는 total_value.value)
function metricValue(data, name) {
  const m = (data.data || []).find((x) => x.name === name) || (data.data || [])[0];
  const v = m?.total_value?.value ?? m?.values?.[0]?.value;
  return Number.isFinite(Number(v)) ? Number(v) : null;
}

const KV_TABLE = 'ssuk_kv';

export async function viewsOn() {
  try {
    const [row] = await sbSelect(KV_TABLE, { select: 'value', key: 'eq.views_on' });
    return row?.value === '1';
  } catch { return false; }
}

// 켜기 전에 ssuk_insta_posts에 조회수 칸이 있는지 확인 (없으면 오류 → 005 SQL 안내)
export async function setViewsOn(on) {
  if (on) {
    try { await sbSelect(POSTS_TABLE, { select: 'views,th_views,views_at', limit: '1' }); }
    catch { throw new Error('조회수 칸이 아직 없어요. Supabase SQL Editor에서 005_ssuk_insta_views.sql을 먼저 실행해 주세요.'); }
  }
  const [row] = await sbSelect(KV_TABLE, { select: 'key', key: 'eq.views_on' });
  const patch = { value: on ? '1' : '0', updated_at: new Date().toISOString() };
  if (row) await sbUpdate(KV_TABLE, { key: 'eq.views_on' }, patch);
  else await sbInsert(KV_TABLE, { key: 'views_on', ...patch });
  return on;
}

const within = (at, now) => at && now - Date.parse(at) <= WINDOW_MS;

// force: 관리자가 '지금 적기'를 누른 경우 — 20시간 규칙과 상관없이 바로 읽음
export async function updateViews({ dry = false, force = false } = {}) {
  if (!dry && !(await viewsOn())) return { dry, off: true, checked: 0, results: [], message: '조회수 자동 기록이 꺼져 있어요. 관리자 화면에서 켜면 적기 시작해요.' };
  const now = Date.now();
  const rows = await loadRows();
  const targets = rows.filter((r) => {
    const ig = r.status === 'published' && r.media_id && within(r.posted_at, now);
    const th = r.th_status === 'published' && r.th_media_id && within(r.th_posted_at, now);
    // 20시간 안에 적었더라도, 읽어야 할 값(인스타 · 스레드) 중 비어 있는 게 있으면 다시 읽음
    const missing = (ig && r.views == null) || (th && threadsOn() && r.th_views == null);
    const fresh = r.views_at && now - Date.parse(r.views_at) < GAP_MS && !missing;
    return (ig || th) && (dry || force || !fresh);
  });
  if (!targets.length) return { dry, checked: 0, results: [], message: '최근 7일 안에 올린 게시물 중 오늘 갱신할 것이 없어요.' };

  const needIg = targets.some((r) => r.media_id && within(r.posted_at, now));
  const needTh = threadsOn() && targets.some((r) => r.th_media_id && within(r.th_posted_at, now));
  let igToken = null, thToken = null, igError = null, thError = null;
  if (needIg) { try { igToken = await getToken({ refresh: !dry }); } catch (e) { igError = safe(e); } }
  if (needTh) { try { thToken = await getThreadsToken({ refresh: !dry }); } catch (e) { thError = safe(e); } }

  const results = [];
  for (const r of targets) {
    const out = { id: r.id, views: null, th_views: null, before: { views: r.views ?? null, th_views: r.th_views ?? null }, errors: [] };
    if (r.media_id && within(r.posted_at, now)) {
      if (!igToken) out.errors.push(`인스타: ${igError || '토큰 없음'}`);
      else {
        try { out.views = metricValue(await igGraph(`/${r.media_id}/insights`, { params: { metric: 'views' }, token: igToken }), 'views'); }
        catch (e) { out.errors.push(safe(e)); }
      }
    }
    if (r.th_media_id && within(r.th_posted_at, now) && threadsOn()) {
      if (!thToken) out.errors.push(`스레드: ${thError || '토큰 없음'}`);
      else {
        try { out.th_views = metricValue(await thGraph(`/${r.th_media_id}/insights`, { params: { metric: 'views' }, token: thToken }), 'views'); }
        catch (e) { out.errors.push(safe(e)); }
      }
    }
    // 읽어 온 값만 고침 (못 읽은 쪽은 예전 값을 그대로 둠). 둘 다 못 읽으면 views_at도 그대로 → 다음 cron에서 다시 시도
    const patch = {};
    if (out.views !== null) patch.views = out.views;
    if (out.th_views !== null) patch.th_views = out.th_views;
    if (!dry && Object.keys(patch).length) {
      patch.views_at = new Date(now).toISOString();
      try { await sbUpdate(POSTS_TABLE, { id: `eq.${r.id}` }, patch); out.saved = true; }
      catch (e) {
        const msg = safe(e);
        out.errors.push(/views/.test(msg) ? '조회수 칸이 아직 없어요. supabase/migrations/005_ssuk_insta_views.sql을 먼저 실행해 주세요.' : msg);
      }
    }
    results.push(out);
  }
  // 서버 기록(Vercel 로그)에 결과를 남김 — 조회수 · 오류만 (토큰은 safe()로 가림)
  console.log('[insta-views]', JSON.stringify({ dry, force, results: results.map((r) => ({ id: r.id, views: r.views, th_views: r.th_views, saved: !!r.saved, errors: r.errors })) }));
  return { dry, checked: results.length, results };
}
