// 인스타그램 자동 올리기 (Instagram API with Instagram Login · 릴스)
// 예약표: insta/queue.json (사이트에 함께 배포) · 올린 기록: Supabase ssuk_insta_posts
// 토큰: 처음엔 환경 변수 INSTAGRAM_TOKEN, 이후 자동 갱신한 토큰을 ssuk_kv 'ig_token'에 보관 (60일 만료 방지)
import { sbSelect, sbInsert, sbUpdate, sbDelete } from './supabase.js';

export const POSTS_TABLE = 'ssuk_insta_posts';
const KV_TABLE = 'ssuk_kv';
const SITE = 'https://ssukssuknori.app';
const VERSION = process.env.INSTAGRAM_API_VERSION || 'v23.0';
// 토큰 종류에 따라 주소가 달라요
// - IGAA… : Instagram 로그인 토큰 → graph.instagram.com, 60일마다 갱신
// - EAA…  : 메타 비즈니스(통합 로그인) 시스템 사용자 토큰 → graph.facebook.com, 만료 없음
const isFbToken = (t) => t.startsWith('EAA');
const graphBase = (t) => `https://${isFbToken(t) ? 'graph.facebook.com' : 'graph.instagram.com'}/${VERSION}`;
// @ssukssuk_nori 의 인스타 계정 ID (메타 앱 화면에 보이는 번호)
const IG_USER_ID = process.env.INSTAGRAM_USER_ID || '17841478035627467';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 한국 날짜 'YYYY-MM-DD'
export function todayKst() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}

export async function loadQueue() {
  const res = await fetch(`${SITE}/insta/queue.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`예약표를 못 읽었어요 (${res.status})`);
  return (await res.json()).posts || [];
}

export async function loadRows() {
  return sbSelect(POSTS_TABLE, { select: '*', order: 'created_at.asc', limit: '500' });
}

async function graph(path, { method = 'GET', params = {}, token }) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${graphBase(token)}${path}${method === 'GET' ? `?${qs}` : ''}`, {
    method,
    ...(method === 'GET' ? {} : { body: qs, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`인스타 ${path}: ${data.error?.message || res.status}`);
  return data;
}

// 저장된 토큰을 쓰고, 7일 넘었으면 새로 받아 둠
export async function getToken() {
  let row = null;
  try { [row] = await sbSelect(KV_TABLE, { select: '*', key: 'eq.ig_token' }); } catch {}
  const envToken = process.env.INSTAGRAM_TOKEN;
  if (!envToken) throw new Error('INSTAGRAM_TOKEN이 아직 없어요.');
  if (isFbToken(envToken)) return envToken;  // 만료 없는 토큰은 갱신할 필요 없음
  const token = row?.value || envToken;
  const age = row ? Date.now() - new Date(row.updated_at).getTime() : Infinity;
  if (age > 7 * 864e5) {
    try {
      const res = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data.access_token) {
        const patch = { value: data.access_token, updated_at: new Date().toISOString() };
        if (row) await sbUpdate(KV_TABLE, { key: 'eq.ig_token' }, patch);
        else await sbInsert(KV_TABLE, { key: 'ig_token', ...patch });
        return data.access_token;
      }
    } catch {}
  }
  return token;
}

export async function account(token) {
  if (isFbToken(token)) {
    const a = await graph(`/${IG_USER_ID}`, { params: { fields: 'id,username' }, token });
    return { user_id: a.id, username: a.username };
  }
  return graph('/me', { params: { fields: 'user_id,username' }, token });
}

// 컨테이너가 다 처리됐으면 게시, 아니면 다음 실행 때 이어서
async function finish(row, token, igId, waitMs) {
  const until = Date.now() + waitMs;
  for (;;) {
    const st = await graph(`/${row.container_id}`, { params: { fields: 'status_code,status' }, token });
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') {
      await sbUpdate(POSTS_TABLE, { id: `eq.${row.id}` }, { status: 'error', error: `영상 처리 실패: ${st.status || st.status_code}` });
      return { id: row.id, status: 'error' };
    }
    if (Date.now() > until) return { id: row.id, status: 'processing' };
    await sleep(5000);
  }
  const pub = await graph(`/${igId}/media_publish`, { method: 'POST', params: { creation_id: row.container_id }, token });
  let permalink = null;
  try { permalink = (await graph(`/${pub.id}`, { params: { fields: 'permalink' }, token })).permalink; } catch {}
  await sbUpdate(POSTS_TABLE, { id: `eq.${row.id}` }, { status: 'published', media_id: pub.id, permalink, posted_at: new Date().toISOString(), error: null });
  return { id: row.id, status: 'published', permalink };
}

// 한 번 실행: 처리 중인 것 마무리 → 없으면 날짜가 된 다음 게시물 하나 올리기
// forceId: 관리자가 '지금 올리기'로 고른 게시물 (날짜 무시)
export async function runOnce({ forceId = null, waitMs = 100000 } = {}) {
  const token = await getToken();
  const me = await account(token);
  const igId = me.user_id || me.id;
  const rows = await loadRows();

  const pending = rows.find((r) => r.status === 'processing' && r.container_id);
  if (pending) return finish(pending, token, igId, waitMs);

  const queue = await loadQueue();
  const done = new Set(rows.map((r) => r.id));
  const next = forceId
    ? queue.find((q) => q.id === forceId && !done.has(q.id))
    : queue.find((q) => q.date <= todayKst() && !done.has(q.id));
  if (!next) return { status: 'nothing', message: forceId ? '이미 올렸거나 없는 게시물이에요.' : '오늘 올릴 게시물이 없어요.' };

  // 같은 게시물이 두 번 올라가지 않도록 먼저 줄을 만들어 자리를 잡음 (id가 겹치면 실패)
  try {
    await sbInsert(POSTS_TABLE, { id: next.id, status: 'creating' });
  } catch {
    return { status: 'nothing', message: '다른 실행이 이미 올리고 있어요.' };
  }
  try {
    const c = await graph(`/${igId}/media`, {
      method: 'POST',
      token,
      params: { media_type: 'REELS', video_url: `${SITE}/${next.video}`, caption: next.caption, share_to_feed: 'true' },
    });
    const row = { id: next.id, container_id: c.id };
    await sbUpdate(POSTS_TABLE, { id: `eq.${next.id}` }, { status: 'processing', container_id: c.id });
    return finish(row, token, igId, waitMs);
  } catch (e) {
    await sbUpdate(POSTS_TABLE, { id: `eq.${next.id}` }, { status: 'error', error: String(e.message || e).slice(0, 500) });
    throw e;
  }
}

// 실패 · 멈춘 게시물을 예약표 상태로 되돌림
export async function resetPost(id) {
  await sbDelete(POSTS_TABLE, { id: `eq.${id}`, status: 'neq.published' });
}
