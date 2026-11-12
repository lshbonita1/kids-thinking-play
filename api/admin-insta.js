// GET /api/admin-insta — 예약표 + 올린 기록 + 연결된 계정
// POST /api/admin-insta — { action: 'now', id } 지금 올리기 · { action: 'reset', id } 실패한 것 되돌리기
//                         { action: 'blog', id, done } 블로그에 올렸다고 체크 · 해제
// 둘 다 Authorization: Bearer <ADMIN_TOKEN>
import { isAdmin, readBody } from '../lib/request.js';
import { threadsOn, getThreadsToken, threadsAccount, runThreadsOnce, resetThreads } from '../lib/threads.js';
import { loadQueue, loadRows, getToken, account, runOnce, resetPost, todayKst, loadBlogDone, setBlogDone } from '../lib/insta.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAdmin(req)) {
    res.status(401).json({ error: '비밀번호가 맞지 않아요.' });
    return;
  }
  try {
    if (req.method === 'GET') {
      const [queue, rows, blogDone] = await Promise.all([loadQueue(), loadRows().catch(() => null), loadBlogDone().catch(() => ({}))]);
      let user = null, tokenError = null;
      if (!process.env.INSTAGRAM_TOKEN) tokenError = 'INSTAGRAM_TOKEN이 아직 없어요.';
      else {
        try { user = (await account(await getToken())).username; } catch (e) { tokenError = String(e.message || e); }
      }
      let thUser = null, thError = null;
      if (!threadsOn()) thError = 'THREADS_TOKEN이 아직 없어요.';
      else {
        try { thUser = (await threadsAccount(await getThreadsToken())).username; } catch (e) { thError = String(e.message || e); }
      }
      res.status(200).json({ queue, rows, blogDone, user, tokenError, thUser, thError, today: todayKst(), tableMissing: rows === null });
      return;
    }
    const { action, id, done } = readBody(req);
    if (action === 'blog') {
      res.status(200).json({ blogDone: await setBlogDone(String(id), Boolean(done)) });
    } else if (action === 'now') {
      res.status(200).json(await runOnce({ forceId: String(id || '') || null, waitMs: 100000 }));
    } else if (action === 'threads') {
      res.status(200).json(await runThreadsOnce({ forceId: String(id || '') || null, waitMs: 100000 }));
    } else if (action === 'th-reset') {
      await resetThreads(String(id));
      res.status(200).json({ ok: true });
    } else if (action === 'reset') {
      await resetPost(String(id));
      res.status(200).json({ ok: true });
    } else {
      res.status(400).json({ error: '알 수 없는 동작이에요.' });
    }
  } catch (e) {
    res.status(500).json({ error: '처리하지 못했어요.', detail: String(e.message || e) });
  }
}
