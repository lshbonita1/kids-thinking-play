-- 쑥쑥 생각놀이 의견 게시판 ('이런 놀이도 만들어 주세요')
-- 뉴스런(newslearn) Supabase 프로젝트를 함께 쓰므로 이름 앞에 ssuk_ 를 붙임
-- 서버(api/feedback.js, api/admin-feedback.js)만 service_role 키로 쓰고 읽어요.
create table if not exists ssuk_feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null default 'idea',          -- idea: 놀이 제안 / issue: 불편한 점 / etc: 칭찬 · 기타
  message text not null,                      -- 의견 (500자까지)
  nickname text,                              -- 닉네임 (안 써도 됨)
  ip_address text,                            -- 도배 막기용 (관리자만 봄)
  visitor_id text,                            -- 브라우저에 저장된 무작위 식별자
  is_hidden boolean not null default false,   -- 관리자가 숨긴 글
  admin_reply text,                           -- 만든 사람 답글
  replied_at timestamptz
);

create index if not exists ssuk_feedback_created_at_idx on ssuk_feedback (created_at desc);

-- 정책을 하나도 만들지 않으면 service_role 키 말고는 아무도 읽고 쓸 수 없어요.
alter table ssuk_feedback enable row level security;
