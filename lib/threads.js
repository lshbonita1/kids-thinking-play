// 스레드(Threads) 함께 올리기: 인스타에 올라간 게시물을 같은 영상 + 짧은 글(queue의 threads)로 스레드에도 올림
// 토큰: 처음엔 환경 변수 THREADS_TOKEN, 이후 자동 갱신한 토큰을 ssuk_kv 'th_token'에 보관 (60일 만료 방지)
import { sbSelect, sbInsert, sbUpdate, sbUpdateReturning } from './supabase.js';
import { POSTS_TABLE, loadQueue, loadRows } from './insta.js';

const KV_TABLE = 'ssuk_kv';
const SITE = 'https://ssukssuknori.app';
const GRAPH = 'https://graph.threads.net/v1.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const threadsOn = () => Boolean(process.env.THREADS_TOKEN);

async function graph(path, { method = 'GET', params = {}, token }) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}${path}${method === 'GET' ? `?${qs}` : ''}`, {
    method,
    ...(method === 'GET' ? {} : { body: qs, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`스레드 ${path}: ${data.error?.message || res.status}`);
  return data;
}

export async function getThreadsToken() {
  const envToken = String(process.env.THREADS_TOKEN || '').replace(/\s+/g, '');
  if (!envToken) throw new Error('THREADS_TOKEN이 아직 없어요.');
  let row = null;
  try { [row] = await sbSelect(KV_TABLE, { select: '*', key: 'eq.th_token' }); } catch {}
  const token = row?.value || envToken;
  const age = row ? Date.now() - new Date(row.updated_at).getTime() : Infinity;
  if (age > 7 * 864e5) {
    try {
      const res = await fetch(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data.access_token) {
        const patch = { value: data.access_token, updated_at: new Date().toISOString() };
        if (row) await sbUpdate(KV_TABLE, { key: 'eq.th_token' }, patch);
        else await sbInsert(KV_TABLE, { key: 'th_token', ...patch });
        return data.access_token;
      }
    } catch {}
  }
  return token;
}

export async function threadsAccount(token) {
  return graph('/me', { params: { fields: 'id,username' }, token });
}

async function finish(row, token, userId, waitMs) {
  const until = Date.now() + waitMs;
  for (;;) {
    const st = await graph(`/${row.th_container_id}`, { params: { fields: 'status,error_message' }, token });
    if (st.status === 'FINISHED') break;
    if (st.status === 'PUBLISHED') return { id: row.id, threads: 'published' };
    if (st.status === 'ERROR' || st.status === 'EXPIRED') {
      await sbUpdate(POSTS_TABLE, { id: `eq.${row.id}` }, { th_status: 'error', th_error: `영상 처리 실패: ${st.error_message || st.status}` });
      return { id: row.id, threads: 'error' };
    }
    if (Date.now() > until) return { id: row.id, threads: 'processing' };
    await sleep(5000);
  }
  const pub = await graph(`/${userId}/threads_publish`, { method: 'POST', params: { creation_id: row.th_container_id }, token });
  let permalink = null;
  try { permalink = (await graph(`/${pub.id}`, { params: { fields: 'permalink' }, token })).permalink; } catch {}
  await sbUpdate(POSTS_TABLE, { id: `eq.${row.id}` }, { th_status: 'published', th_media_id: pub.id, th_permalink: permalink, th_posted_at: new Date().toISOString(), th_error: null });
  return { id: row.id, threads: 'published', permalink };
}

// 한 번 실행: 처리 중인 것 마무리 → 인스타엔 올렸지만 스레드엔 아직인 게시물 하나 올리기
export async function runThreadsOnce({ forceId = null, waitMs = 90000 } = {}) {
  const token = await getThreadsToken();
  const me = await threadsAccount(token);
  const rows = await loadRows();

  const pending = rows.find((r) => r.th_status === 'processing' && r.th_container_id);
  if (pending) {
    const r = await finish(pending, token, me.id, waitMs);
    if (!forceId || forceId === pending.id || r.threads === 'processing') return r;
  }

  const queue = await loadQueue();
  const byId = Object.fromEntries(queue.map((q) => [q.id, q]));
  const next = rows.find((r) => r.status === 'published' && !r.th_status && byId[r.id] && (!forceId || r.id === forceId));
  if (!next) return { threads: 'nothing', message: forceId ? '인스타에 먼저 올라가야 스레드에 올릴 수 있어요.' : '스레드에 올릴 게시물이 없어요.' };

  // 두 번 올라가지 않게 비어 있을 때만 자리를 잡음
  const claimed = await sbUpdateReturning(POSTS_TABLE, { id: `eq.${next.id}`, th_status: 'is.null' }, { th_status: 'creating' });
  if (!claimed?.length) return { threads: 'nothing', message: '다른 실행이 이미 올리고 있어요.' };
  const q = byId[next.id];
  try {
    const c = await graph(`/${me.id}/threads`, {
      method: 'POST',
      token,
      params: { media_type: 'VIDEO', video_url: `${SITE}/${q.video}`, text: (q.threads || q.caption).slice(0, 500) },
    });
    await sbUpdate(POSTS_TABLE, { id: `eq.${next.id}` }, { th_status: 'processing', th_container_id: c.id });
    return finish({ id: next.id, th_container_id: c.id }, token, me.id, waitMs);
  } catch (e) {
    await sbUpdate(POSTS_TABLE, { id: `eq.${next.id}` }, { th_status: 'error', th_error: String(e.message || e).slice(0, 500) });
    throw e;
  }
}

export async function resetThreads(id) {
  await sbUpdate(POSTS_TABLE, { id: `eq.${id}`, th_status: 'neq.published' },
    { th_status: null, th_container_id: null, th_error: null });
}
