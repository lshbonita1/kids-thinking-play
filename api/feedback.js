// GET /api/feedback — 의견 게시판 글 목록 (숨긴 글 빼고 최근 60개)
// POST /api/feedback — 의견 남기기 { kind, message, nickname, vid }
import { sbSelect, sbInsert, FEEDBACK_TABLE } from '../lib/supabase.js';
import { getClientIp, readBody } from '../lib/request.js';

const KINDS = ['idea', 'issue', 'etc'];
const MAX_PER_HOUR = 3; // 같은 IP에서 1시간에 남길 수 있는 글 수 (도배 막기)

const text = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const rows = await sbSelect(FEEDBACK_TABLE, {
        select: 'id,created_at,kind,message,nickname,admin_reply,replied_at',
        is_hidden: 'eq.false',
        order: 'created_at.desc',
        limit: '60',
      });
      res.status(200).json({ posts: rows });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'GET · POST만 돼요.' });
      return;
    }
    const body = readBody(req);
    const message = text(body.message, 500);
    const nickname = text(body.nickname, 12).replace(/\n/g, ' ') || null;
    if (message.length < 2) {
      res.status(400).json({ error: '의견을 두 글자 이상 적어 주세요.' });
      return;
    }
    // 광고 글을 막으려고 인터넷 주소는 받지 않음
    if (/https?:\/\/|www\.|\.(com|net|kr|co|io|me|ly)\b/i.test(`${message} ${nickname || ''}`)) {
      res.status(400).json({ error: '인터넷 주소는 적을 수 없어요.' });
      return;
    }
    const ip = getClientIp(req);
    if (ip) {
      const recent = await sbSelect(FEEDBACK_TABLE, {
        select: 'id',
        ip_address: `eq.${ip}`,
        created_at: `gte.${new Date(Date.now() - 3600000).toISOString()}`,
      });
      if (recent.length >= MAX_PER_HOUR) {
        res.status(429).json({ error: '조금 뒤에 다시 남겨 주세요. (1시간에 3개까지)' });
        return;
      }
    }
    await sbInsert(FEEDBACK_TABLE, {
      kind: KINDS.includes(body.kind) ? body.kind : 'idea',
      message,
      nickname,
      ip_address: ip,
      visitor_id: text(body.vid, 100) || null,
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    // 누구나 부르는 주소라 서버 오류 내용은 보여 주지 않고 기록만 남김
    console.error('feedback', e);
    res.status(500).json({ error: '잠시 뒤 다시 해 주세요.' });
  }
}
