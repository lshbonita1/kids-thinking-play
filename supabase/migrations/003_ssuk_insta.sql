-- 쑥쑥 생각놀이 인스타 자동 올리기 기록 + 서버용 설정값(인스타 토큰 자동 갱신)
create table if not exists ssuk_insta_posts (
  id text primary key,                        -- insta/queue.json 의 게시물 id (예: 03_made)
  created_at timestamptz not null default now(),
  status text not null,                       -- creating · processing · published · error
  container_id text,
  media_id text,
  permalink text,
  error text,
  posted_at timestamptz
);
alter table ssuk_insta_posts enable row level security;

create table if not exists ssuk_kv (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table ssuk_kv enable row level security;

notify pgrst, 'reload schema';
