// Supabase REST(PostgREST) 얇은 래퍼 (뉴스런 lib/supabase.js와 같은 방식). service_role 키로 서버에서만 씀.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 뉴스런 Supabase 프로젝트를 함께 쓰므로 쑥쑥놀이 표는 ssuk_ 로 시작
export const VISITS_TABLE = 'ssuk_site_visits';
export const FEEDBACK_TABLE = 'ssuk_feedback';

// 새 방식 키(sb_secret_...)는 apikey 머리말로만 보내고, 예전 service_role 키(JWT)는 Authorization에도 넣음
const AUTH_HEADERS = SUPABASE_KEY?.startsWith('sb_')
  ? { apikey: SUPABASE_KEY }
  : { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

async function sbFetch(path, options = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      ...AUTH_HEADERS,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!resp.ok) throw new Error(`Supabase ${path} 실패: ${resp.status} ${await resp.text()}`);
  if (resp.status === 204) return null;
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

// query: { select, order, limit, ...필터 } — 필터 값은 'eq.xxx' 처럼 PostgREST 연산자를 그대로 씀
export async function sbSelect(table, query = {}) {
  const qs = new URLSearchParams(query).toString();
  return sbFetch(`/${table}${qs ? `?${qs}` : ''}`);
}

// Supabase는 한 번에 최대 1000줄만 돌려줘서, 끝까지 나눠 받음
export async function sbSelectAll(table, query = {}, pageSize = 1000, maxRows = 100000) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const page = await sbSelect(table, { ...query, limit: String(pageSize), offset: String(offset) });
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

export async function sbInsert(table, row) {
  return sbFetch(`/${table}`, { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=minimal' } });
}

// query: { id: 'eq.3' } 처럼 고칠 줄을 고르고, patch의 값으로 바꿈
export async function sbUpdate(table, query, patch) {
  const qs = new URLSearchParams(query).toString();
  return sbFetch(`/${table}?${qs}`, { method: 'PATCH', body: JSON.stringify(patch), headers: { Prefer: 'return=minimal' } });
}

// query: { col: 'lt.xxx', ... } — 맞는 줄을 지움
export async function sbDelete(table, query) {
  const qs = new URLSearchParams(query).toString();
  return sbFetch(`/${table}?${qs}`, { method: 'DELETE' });
}

// 고친 줄을 돌려받음 — 조건(예: th_status=is.null)에 맞는 줄이 없으면 [] (먼저 잡은 쪽만 진행할 때 씀)
export async function sbUpdateReturning(table, query, patch) {
  const qs = new URLSearchParams(query).toString();
  return sbFetch(`/${table}?${qs}`, { method: 'PATCH', body: JSON.stringify(patch), headers: { Prefer: 'return=representation' } });
}
