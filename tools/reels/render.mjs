// HTML 장면을 1080x1920 영상 그림(프레임)으로 찍음. 페이지의 CSS 애니메이션 시간을 직접 옮겨 가며 30fps로 캡처
// 사용: node render.mjs <html 경로> <초> <출력 폴더>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [html, secs, outDir, fpsArg] = process.argv.slice(2);
const FPS = Number(fpsArg || 30);
mkdirSync(outDir, { recursive: true });
const PORT = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${outDir}/.ud`, '--window-size=1080,1920', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break; } catch {}
  await sleep(200);
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const waiting = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
await send('Page.enable');
await send('Page.navigate', { url: pathToFileURL(html).href });
await sleep(2500); // 글꼴 · 그림 불러오기
// 모든 애니메이션을 멈추고 시간을 직접 지정
const total = Math.round(Number(secs) * FPS);
for (let f = 0; f < total; f++) {
  const t = (f / FPS) * 1000;
  await send('Runtime.evaluate', { expression: `document.getAnimations().forEach(a=>{a.pause();a.currentTime=${t}});window.__t&&window.__t(${t});` });
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1080, height: 1920, scale: 1 } });
  writeFileSync(`${outDir}/${String(f).padStart(4, '0')}.png`, Buffer.from(shot.result.data, 'base64'));
}
ws.close(); chrome.kill();
console.log(`frames ${total} -> ${outDir}`);
