// 요청 공통 도우미: 접속 IP, 관리자 비밀번호 확인

export function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || null;
}

// 시간 차이로 비밀번호를 알아내지 못하도록 끝까지 비교
function sameText(a = '', b = '') {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Authorization: Bearer <ADMIN_TOKEN> 이 맞는지
export function isAdmin(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return Boolean(process.env.ADMIN_TOKEN) && sameText(token, process.env.ADMIN_TOKEN);
}

// sendBeacon · fetch가 보낸 본문을 객체로 (글자로 오면 직접 읽음)
export function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return body || {};
}
