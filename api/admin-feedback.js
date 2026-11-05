// GET /api/admin-feedback — 의견 게시판 전체 (숨긴 글 · IP 포함)
// POST /api/admin-feedback — { id, action: 'reply' | 'hide' | 'show' | 'delete', reply }
// 둘 다 Authorization: Bearer <ADMIN_TOKEN>
import { sbSelect, sbUpdate, sbDelete, FEEDBACK_TABLE } from '../lib/supabase.js';
import { isAdmin, readBody } from '../lib/request.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAdmin(req)) {
    res.status(401).json({ error: '비밀번호가 맞지 않아요.' });
    return;
  }
  try {
    if (req.method === 'GET') {
      const rows = await sbSelect(FEEDBACK_TABLE, { select: '*', order: 'created_at.desc', limit: '200' });
      res.status(200).json({ posts: rows });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'GET · POST만 돼요.' });
      return;
    }
    const { id, action, reply } = readBody(req);
    const where = { id: `eq.${Number(id)}` };
    if (!Number.isInteger(Number(id))) throw new Error('글 번호가 없어요.');
    if (action === 'reply') {
      const r = String(reply ?? '').trim().slice(0, 1000);
      await sbUpdate(FEEDBACK_TABLE, where, { admin_reply: r || null, replied_at: r ? new Date().toISOString() : null });
    } else if (action === 'hide' || action === 'show') {
      await sbUpdate(FEEDBACK_TABLE, where, { is_hidden: action === 'hide' });
    } else if (action === 'delete') {
      await sbDelete(FEEDBACK_TABLE, where);
    } else {
      throw new Error('알 수 없는 동작이에요.');
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '처리하지 못했어요.', detail: String(e.message || e) });
  }
}
