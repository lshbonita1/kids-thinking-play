// Vercel Cron이 매일 저녁(한국 8시쯤) 부름: 예약표에서 날짜가 된 릴스를 하나 올림
// Vercel이 Authorization: Bearer <CRON_SECRET> 를 붙여 보냄
import { runOnce } from '../lib/insta.js';
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
  try {
    res.status(200).json(await runOnce());
  } catch (e) {
    console.error('insta-cron', e);
    res.status(500).json({ error: '올리지 못했어요.' });
  }
}
