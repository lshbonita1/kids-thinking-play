// Vercel Cron이 하루 두 번(한국 낮 12시 · 저녁 8시쯤) 부름: 부를 때마다 예약표에서 날짜가 된 릴스를 하나씩 올림 (하루 2개)
// 올린 뒤에는 게시 후 7일 안 된 게시물의 조회수를 하루 한 번 적음 (두 번 불려도 20시간 안에는 다시 안 적음)
// Vercel이 Authorization: Bearer <CRON_SECRET> 를 붙여 보냄
import { runOnce } from '../lib/insta.js';
import { updateViews } from '../lib/insta-views.js';
import { runThreadsOnce, threadsOn } from '../lib/threads.js';
import { isAdmin } from '../lib/request.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const auth = String(req.headers.authorization || '');
  const cron = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!cron && !isAdmin(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (!process.env.INSTAGRAM_TOKEN) {
    res.status(200).json({ status: 'off', message: 'INSTAGRAM_TOKEN이 없어 자동 올리기가 꺼져 있어요.' });
    return;
  }
  const out = {};
  try {
    out.instagram = await runOnce();
  } catch (e) {
    console.error('insta-cron', e);
    out.instagram = { error: '올리지 못했어요.' };
  }
  // 인스타에 올라간 게시물을 스레드에도 (인스타가 실패해도 밀린 스레드는 따로 진행)
  if (threadsOn()) {
    try {
      out.threads = await runThreadsOnce();
    } catch (e) {
      console.error('threads-cron', e);
      out.threads = { error: '스레드에 올리지 못했어요.' };
    }
  }
  try {
    const v = await updateViews();
    out.views = { checked: v.checked, saved: v.results.filter((r) => r.saved).length, errors: v.results.flatMap((r) => r.errors).slice(0, 5) };
  } catch (e) {
    console.error('insta-views', e);
    out.views = { error: '조회수를 적지 못했어요.' };
  }
  res.status(out.instagram.error ? 500 : 200).json(out);
}
