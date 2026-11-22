-- 인스타 · 스레드 게시물 조회수 (게시 후 7일 동안 하루 한 번 api/insta-cron.js가 적음)
alter table ssuk_insta_posts add column if not exists views integer;          -- 인스타 릴스 조회수
alter table ssuk_insta_posts add column if not exists th_views integer;       -- 스레드 조회수
alter table ssuk_insta_posts add column if not exists views_at timestamptz;   -- 마지막으로 조회수를 적은 시각

notify pgrst, 'reload schema';
