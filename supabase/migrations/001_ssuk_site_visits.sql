-- 쑥쑥 생각놀이 방문 기록 (뉴스런 site_visits와 같은 방식)
-- 뉴스런(newslearn) Supabase 프로젝트를 함께 쓰므로, 뉴스런 표와 섞이지 않게 이름 앞에 ssuk_ 를 붙임
-- 서버(api/visit.js)만 service_role 키로 쓰고 읽어요. 사이트 방문자는 이 표에 직접 접근할 수 없어요.
create table if not exists ssuk_site_visits (
  id bigint generated always as identity primary key,
  visited_at timestamptz not null default now(),
  event text not null default 'visit',        -- visit: 사이트 방문 / play: 놀이를 끝까지 함
  ip_address text,                             -- 요청 헤더(x-forwarded-for)의 IP
  visitor_id text,                             -- 브라우저에 저장된 무작위 식별자
  device text,                                 -- 예: iPhone · Safari
  page text,
  referrer_host text,                          -- 들어오기 전 사이트 주소
  game text,
  level smallint,
  score smallint,
  is_admin boolean not null default false      -- 관리자 기기(내 접속) 기록
);

create index if not exists ssuk_site_visits_visited_at_idx on ssuk_site_visits (visited_at desc);
create index if not exists ssuk_site_visits_visitor_id_idx on ssuk_site_visits (visitor_id);

-- 정책을 하나도 만들지 않으면 service_role 키 말고는 아무도 읽고 쓸 수 없어요.
alter table ssuk_site_visits enable row level security;
