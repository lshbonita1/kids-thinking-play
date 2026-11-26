// 앱을 한 번 열어 놓고 순서대로 동작하며 화면을 찍음 (질문 → 정답 반짝 → 누름 → 칭찬)
// 사용: node appseq.mjs <이름> '<시작 JS>' '<단계 JSON: [["파일이름", "JS", 기다릴ms], ...]>'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';
import { fileURLToPath } from 'node:url';
const [name, startJs, stepsJson] = process.argv.slice(2);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = fileURLToPath(new URL('./assets/', import.meta.url));
const TMP = process.env.REELS_TMP || '/tmp/reels-cap';
mkdirSync(TMP, { recursive: true });
const html = readFileSync(ROOT + 'index.html', 'utf8').replace('<head>', `<head><base href="file://${ROOT}">`);
writeFileSync(`${TMP}/${name}.html`, html);
const b = await launch({ width: 540, height: 960, scale: 2, dir: `${TMP}/ud_${name}` });
await b.goto(`file://${TMP}/${name}.html`);
await sleep(2500);
await b.evalJs(`settings.tips=false;settings.sound=false;${startJs}`);
for (const [file, js, wait] of JSON.parse(stepsJson)) {
  if (js) await b.evalJs(js);
  await sleep(wait);
  writeFileSync(`${OUT}${file}.png`, await b.shot());
  console.log('shot', file);
}
b.close();
