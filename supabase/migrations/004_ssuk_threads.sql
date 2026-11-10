-- 인스타에 올린 게시물을 스레드(Threads)에도 함께 올린 기록
alter table ssuk_insta_posts add column if not exists th_status text;        -- processing · published · error
alter table ssuk_insta_posts add column if not exists th_container_id text;
alter table ssuk_insta_posts add column if not exists th_media_id text;
alter table ssuk_insta_posts add column if not exists th_permalink text;
alter table ssuk_insta_posts add column if not exists th_error text;
alter table ssuk_insta_posts add column if not exists th_posted_at timestamptz;

notify pgrst, 'reload schema';
