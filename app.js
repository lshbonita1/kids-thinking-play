'use strict';

const TOTAL = 10;
const $app = document.getElementById('app');

const LEVELS = [
  { name: '쉬움' },
  { name: '보통' },
  { name: '어려움' },
];

/* ---------- 유틸 ---------- */
let rng = Math.random;
const rand = (n) => Math.floor(rng() * n);

// 같은 글자(날짜 등)를 넣으면 늘 같은 순서의 난수가 나옴
function seededRng(text) {
  let h = 1779033703 ^ text.length;
  for (const ch of text) {
    h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withRng(seed, fn) {
  const prev = rng;
  rng = seededRng(seed);
  try {
    return fn();
  } finally {
    rng = prev;
  }
}
const pick = (arr) => arr[rand(arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const sample = (arr, k) => shuffle(arr).slice(0, k);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, k) => from + k);
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid != null && kid !== false) node.append(kid);
  }
  return node;
}

let screenId = 0;
function mount(node) {
  screenId++;
  $app.replaceChildren(node);
  window.scrollTo(0, 0);
  return screenId;
}

/* ---------- 저장 ---------- */
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

const settings = {
  sound: store.get('sound', true),
  level: store.get('level', 0), // 처음엔 쉬움부터
  voice: store.get('voice', ''), // 고른 목소리 이름 (없으면 자동)
  pitch: store.get('pitch', 1.1), // 목소리 높이: 높을수록 밝고 어린 느낌 (기본: 보통)
  rate: store.get('rate', 1), // 빠르기 (기본: 보통)
  tips: store.get('tips', true), // 놀이를 시작할 때 보호자 도움말 보이기
};

// 목소리 높이 · 빠르기 선택지
const PITCH_OPTIONS = [{ v: 1.1, name: '보통' }, { v: 1.4, name: '밝게' }, { v: 1.7, name: '아주 밝게' }];
const RATE_OPTIONS = [{ v: 0.7, name: '느리게' }, { v: 0.85, name: '조금 느리게' }, { v: 1, name: '보통' }];

/* ---------- 소리 ---------- */
// 한국어 음성을 골라 둠 (태블릿에 따라 기본 음성이 영어라 한국어를 이상하게 읽는 경우가 있음)
let koVoice = null;
// 이 기기에 있는 한국어 목소리 목록
function koreanVoices() {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang?.replace('_', '-').toLowerCase().startsWith('ko'));
}
// 고른 목소리 → 없으면 여성 목소리(이름으로 추정) → 기기 안 목소리 → 아무 한국어 목소리
const SOFT_VOICE_HINTS = ['유나', 'yuna', 'sora', 'female', 'heami', 'sunhi', 'jimin', 'seoyeon', 'google 한국'];
function pickKoreanVoice() {
  const voices = koreanVoices();
  koVoice = voices.find((v) => v.name === settings.voice)
    ?? voices.find((v) => SOFT_VOICE_HINTS.some((h) => v.name.toLowerCase().includes(h)))
    ?? voices.find((v) => v.localService)
    ?? voices[0]
    ?? null;
}
if ('speechSynthesis' in window) {
  pickKoreanVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickKoreanVoice);
}

// force: 말하기 카드처럼 소리 설정과 상관없이 꼭 말해야 할 때
function speak(text, force = false) {
  if ((!settings.sound && !force) || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  if (koVoice) u.voice = koVoice;
  u.rate = settings.rate;
  u.pitch = settings.pitch;
  // 아이패드에서 음성이 '일시 정지' 상태로 멈춰 있는 경우가 있어 풀어 줌
  speechSynthesis.resume();
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
    // 일부 안드로이드 태블릿은 취소 직후 바로 말하면 소리가 안 나서 잠깐 쉬었다가 말함
    setTimeout(() => speechSynthesis.speak(u), 80);
  } else {
    speechSynthesis.speak(u);
  }
}

// 태블릿·휴대폰은 화면을 한 번 만진 뒤에야 소리를 낼 수 있어서, 첫 터치 때 소리를 켜 둠
function unlockSound() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {}
  if ('speechSynthesis' in window && settings.sound) {
    const silent = new SpeechSynthesisUtterance(' ');
    silent.volume = 0;
    speechSynthesis.speak(silent);
  }
}
document.addEventListener('pointerdown', unlockSound, { once: true, capture: true });

let audioCtx;
function tone(freqs, dur = 0.14) {
  if (!settings.sound) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    freqs.forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t = audioCtx.currentTime + i * dur;
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    });
  } catch {}
}

/* ---------- 실사 사진 ---------- */
// 사진이 있는 그림은 사진으로 보여 줌 (photos/이름.jpg, 출처는 photos/CREDITS.md)
// 사진이 아직 없는 그림은 지금처럼 그림 글자로
const PHOTOS = {
  '🍎': 'apple', '🍌': 'banana', '🐸': 'frog', '🐳': 'whale', '🍇': 'grapes', '🌸': 'flower', '🥕': 'carrot',
  '🚗': 'car', '🎈': 'balloon', '🦋': 'butterfly', '✈️': 'airplane', '🐶': 'dog', '🍯': 'honey', '🥛': 'milk',
  '✏️': 'pencil', '🪥': 'toothbrush', '📒': 'notebook', '🐝': 'bee', '🐥': 'chick',
  '🐄': 'cow', '🥚': 'egg', '🐘': 'elephant', '🥅': 'goal', '☂️': 'umbrella',
  // 기분 알기 얼굴 (무서운 얼굴은 알맞은 사진을 찾을 때까지 그림으로)
  '😄': 'face_happy', '😭': 'face_sad', '😡': 'face_angry',
};

function pic(e) {
  const name = PHOTOS[e];
  if (!name) return e;
  return el('img', { class: 'photo', src: `photos/${name}.jpg`, alt: '', draggable: 'false' });
}

// 그림 여러 개를 함께 보여 줄 때: 모두 사진이 있으면 사진으로, 하나라도 없으면 모두 그림 글자로
// (사진과 그림이 섞이면 모양 차이만 보고 답을 고를 수 있어서)
function photoRenderer(items) {
  return items.every((e) => PHOTOS[e]) ? pic : String;
}

/* ---------- 공통 UI ---------- */
function prompt(text, say = true) {
  if (say) speak(text);
  return el('div', { class: 'prompt' },
    el('span', {}, text),
    el('button', { class: 'speak-btn', 'aria-label': '다시 듣기', onclick: () => speak(text) }, '🔊'),
  );
}

/* ---------- 쑥쑥이 (새싹 친구 캐릭터) ---------- */
// 표정: smile(기본 미소) · happy(눈웃음 + 활짝 웃는 입)
function mascotSvg(mood = 'smile') {
  const ink = '#3b3226';
  const eyes = mood === 'happy'
    ? `<path d="M34 59 Q40 52 46 59" stroke="${ink}" stroke-width="3.6" stroke-linecap="round" fill="none"/>
       <path d="M54 59 Q60 52 66 59" stroke="${ink}" stroke-width="3.6" stroke-linecap="round" fill="none"/>`
    : `<circle cx="40" cy="57" r="4.2" fill="${ink}"/><circle cx="60" cy="57" r="4.2" fill="${ink}"/>
       <circle cx="41.4" cy="55.6" r="1.3" fill="#fff"/><circle cx="61.4" cy="55.6" r="1.3" fill="#fff"/>`;
  const mouth = mood === 'happy'
    ? `<path d="M41 66 Q50 80 59 66 Z" fill="${ink}"/><path d="M45.5 72.5 Q50 77 54.5 72.5 Q50 70 45.5 72.5 Z" fill="#f08a80"/>`
    : `<path d="M43 68 Q50 75 57 68" stroke="${ink}" stroke-width="3.2" stroke-linecap="round" fill="none"/>`;
  return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <path d="M50 36 V22" stroke="#4fa86f" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="37" cy="20" rx="14" ry="7.5" fill="#6cc08a" transform="rotate(-28 37 20)"/>
    <ellipse cx="63" cy="20" rx="14" ry="7.5" fill="#4fa86f" transform="rotate(28 63 20)"/>
    <circle cx="50" cy="62" r="28" fill="#a9dea1"/>
    <circle cx="32" cy="68" r="4.5" fill="#f4a9a0" opacity=".8"/><circle cx="68" cy="68" r="4.5" fill="#f4a9a0" opacity=".8"/>
    ${eyes}${mouth}
  </svg>`;
}

function mascot(mood, cls = '') {
  const node = el('span', { class: `mascot ${cls}` });
  node.innerHTML = mascotSvg(mood);
  return node;
}

// 정답·패스 등에서 쑥쑥이가 나와서 말해 줌
const FEEDBACK = {
  good: ['happy', '잘했어요!'],
  bad: ['smile', '괜찮아요!'],
  pass: ['smile', '다음 문제!'],
  done: ['happy', '다 찾았어요!'],
};

function feedback(kind, done) {
  const [mood, text] = FEEDBACK[kind];
  if (kind === 'good' || kind === 'done') tone([660, 880, 1320]);
  else if (kind === 'bad') tone([392, 294], 0.18);
  speak(text);
  const overlay = el('div', { class: `feedback ${kind}` },
    el('div', { class: 'fb-icon' }, mascot(mood, 'bounce')),
    el('div', { class: 'fb-text' }, text),
  );
  document.body.append(overlay);
  setTimeout(() => {
    overlay.remove();
    done();
  }, 1100);
}

// 보기 개수별 보기 칸 크기 (적을수록 크게)
const CHOICE_SIZE = { 2: 'clamp(calc(110px * var(--k)), min(36vw, 20vh), calc(150px * var(--k)))', 3: 'clamp(calc(72px * var(--k)), min(27vw, 17vh), calc(112px * var(--k)))', 4: 'clamp(calc(58px * var(--k)), 20vw, calc(96px * var(--k)))' };
const choicesStyle = (count) => `--choice-t:${CHOICE_SIZE[count] ?? CHOICE_SIZE[4]}`;

// 틀린 보기는 흐리게 막고 정답 보기를 반짝여 알려준 뒤 다시 고르게 함
// ('오류 없는 학습': 실패로 끝나지 않고 정답을 직접 눌러 보게)
function retryChoice(ctx, wrong, right) {
  wrong.classList.add('bad', 'tried');
  wrong.disabled = true;
  right.classList.add('hint');
  ctx.miss('반짝이는 것을 눌러 볼까요?');
}

// 문제 그림과 보기를 헷갈리지 않도록 보기 위에 다는 안내
function choiceLabel(count) {
  const word = ['', '한', '두', '세', '네'][count] ?? String(count);
  return el('div', { class: 'choice-label' }, `👇 아래 ${word} 보기에서 골라 보세요`);
}

function miniGrid(cells) {
  return el('div', { class: 'mgrid mini' },
    [...Array(9)].map((_, k) => el('div', { class: `mcell${cells.includes(k) ? ' on' : ''}` })),
  );
}

/* ---------- 3×3 칸 모양 ---------- */
// 칸 번호:  0 1 2 / 3 4 5 / 6 7 8
// 이어진 모양이라 흩어진 칸보다 기억하기 쉬움
const GRID_SHAPES = {
  2: [[0, 1]],
  3: [[0, 1, 2], [0, 3, 4], [0, 4, 8], [0, 1, 4]],
  4: [[2, 5, 7, 8], [0, 1, 2, 4], [0, 1, 3, 4], [1, 2, 3, 4], [0, 2, 4, 6], [0, 3, 6, 7]],
  5: [[0, 2, 4, 6, 8], [1, 3, 4, 5, 7], [0, 3, 6, 7, 8], [0, 1, 2, 4, 7], [0, 1, 2, 3, 6]],
};

// 모양을 무작위로 돌리고 뒤집은 뒤, 3×3 안의 아무 자리에 놓기
function randomShape(count) {
  let pts = pick(GRID_SHAPES[count]).map((k) => [Math.floor(k / 3), k % 3]);
  for (let t = rand(4); t > 0; t--) pts = pts.map(([r, c]) => [c, 2 - r]);
  if (rand(2)) pts = pts.map(([r, c]) => [r, 2 - c]);
  const minR = Math.min(...pts.map((p) => p[0]));
  const minC = Math.min(...pts.map((p) => p[1]));
  pts = pts.map(([r, c]) => [r - minR, c - minC]);
  const offR = rand(3 - Math.max(...pts.map((p) => p[0])));
  const offC = rand(3 - Math.max(...pts.map((p) => p[1])));
  return pts.map(([r, c]) => (r + offR) * 3 + (c + offC)).sort((a, b) => a - b);
}

// 눌러서 칠하는 3×3 판
function paintGrid(size, onChange) {
  const selected = new Set();
  const cells = [...Array(9)].map((_, k) =>
    el('button', { class: 'mcell', 'aria-label': `${k + 1}번 칸`, onclick: () => toggle(k) }));
  function toggle(k) {
    if (selected.has(k)) selected.delete(k);
    else selected.add(k);
    cells[k].classList.toggle('on', selected.has(k));
    cells[k].classList.remove('hint');
    tone([selected.has(k) ? 620 : 440], 0.06);
    onChange(selected);
  }
  return {
    node: el('div', { class: `mgrid ${size}` }, cells),
    cells,
    answer: () => [...selected].sort((a, b) => a - b),
    // 틀렸을 때: 잘못 칠한 칸은 지우고, 빠진 칸은 테두리로 알려줌
    showHint(original) {
      for (const k of [...selected]) {
        if (!original.includes(k)) {
          selected.delete(k);
          cells[k].classList.remove('on');
        }
      }
      original.forEach((k) => cells[k].classList.toggle('hint', !selected.has(k)));
      onChange(selected);
    },
  };
}

function gridReview(rec) {
  return el('div', { class: 'compare' },
    el('div', { class: 'compare-col' }, '원본', miniGrid(rec.original)),
    el('div', { class: 'compare-col' }, '내 답', miniGrid(rec.answer)),
  );
}

/* ---------- 놀이 1: 모양 기억하기 ---------- */
// 단계별 [앞 5문제, 뒤 5문제] 칸 수
const MEMORY_COUNTS = [[2, 3], [3, 3], [3, 4]];

const memoryGame = {
  id: 'memory',
  title: '모양 기억하기',
  desc: '칠해진 모양을 기억해요',
  skill: '작업 기억',
  icon: '🧠',
  color: '#f3d6cf',

  round(i, ctx) {
    const count = MEMORY_COUNTS[ctx.level][i < 5 ? 0 : 1];
    const original = randomShape(count);
    const rec = { original, answer: [] };

    const title = el('div');
    const board = paintGrid('big', (selected) => { doneBtn.disabled = selected.size === 0; });
    board.cells.forEach((c) => { c.disabled = true; });
    const timerFill = el('div', { class: 'timer-fill' });
    const timer = el('div', { class: 'timer' }, timerFill);
    const doneBtn = el('button', { class: 'btn-main', disabled: true, onclick: submit }, '다 했어요');
    doneBtn.hidden = true;
    ctx.stage.append(title, board.node, timer, doneBtn);

    // 1단계: 보여주기
    title.replaceChildren(prompt('잘 보고 기억해요!'));
    original.forEach((k) => board.cells[k].classList.add('on'));
    const showMs = 3000 + count * 700;
    timerFill.style.animationDuration = `${showMs}ms`;
    timer.classList.add('run');

    // 2단계: 따라 칠하기
    ctx.later(() => {
      original.forEach((k) => board.cells[k].classList.remove('on'));
      board.cells.forEach((c) => { c.disabled = false; });
      timer.hidden = true;
      doneBtn.hidden = false;
      title.replaceChildren(prompt('똑같이 칠해 보세요'));
    }, showMs);

    function submit() {
      rec.answer = board.answer();
      if (sameSet(rec.answer, original)) ctx.finish(true);
      else {
        board.showHint(original);
        ctx.miss('반짝이는 칸을 칠해 볼까요?');
      }
    }

    return rec;
  },

  review: gridReview,
};

/* ---------- 놀이: 똑같이 칠하기 ---------- */
const COPY_COUNTS = [[2, 3], [3, 4], [4, 5]];

const copyGame = {
  id: 'copy',
  title: '똑같이 칠하기',
  desc: '보면서 똑같이 칠해요',
  skill: '공간 지각',
  icon: '🎨',
  color: '#f9d9c4',

  round(i, ctx) {
    const original = randomShape(COPY_COUNTS[ctx.level][i < 5 ? 0 : 1]);
    const rec = { original, answer: [] };

    const board = paintGrid('mid', (selected) => { doneBtn.disabled = selected.size === 0; });
    const doneBtn = el('button', { class: 'btn-main', disabled: true, onclick: submit }, '다 했어요');
    ctx.stage.append(
      prompt('왼쪽과 똑같이 칠해요'),
      el('div', { class: 'compare' },
        el('div', { class: 'compare-col' }, '원본',
          el('div', { class: 'mgrid mid' },
            [...Array(9)].map((_, k) => el('div', { class: `mcell${original.includes(k) ? ' on' : ''}` })))),
        el('div', { class: 'compare-col' }, '내 답', board.node)),
      doneBtn,
    );

    function submit() {
      rec.answer = board.answer();
      if (sameSet(rec.answer, original)) ctx.finish(true);
      else {
        board.showHint(original);
        ctx.miss('반짝이는 칸을 칠해 볼까요?');
      }
    }

    return rec;
  },

  review: gridReview,
};

/* ---------- 놀이: 선 따라 긋기 ---------- */
// 네모 테두리 위 점 12개 (4×4 격자의 바깥 줄)
const DOTS = [];
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 4; c++) {
    if (r === 0 || r === 3 || c === 0 || c === 3) DOTS.push({ r, c });
  }
}
const dotXY = (k) => [30 + DOTS[k].c * 80, 30 + DOTS[k].r * 80];
// 같은 변 위의 두 점은 테두리와 겹치므로 선으로 쓰지 않음
const shareSide = (a, b) => {
  const [p, q] = [DOTS[a], DOTS[b]];
  return (p.r === q.r && (p.r === 0 || p.r === 3)) || (p.c === q.c && (p.c === 0 || p.c === 3));
};
// 쉬운 선: 가로 · 세로 곧은 선과 네모의 두 대각선 (꼭짓점끼리)
const isCorner = (k) => (DOTS[k].r === 0 || DOTS[k].r === 3) && (DOTS[k].c === 0 || DOTS[k].c === 3);
const isStraight = (a, b) => DOTS[a].r === DOTS[b].r || DOTS[a].c === DOTS[b].c || (isCorner(a) && isCorner(b));
const lineKey = ([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`);
// 단계별 [앞 5문제, 뒤 5문제] 선 개수
const LINE_COUNTS = [[1, 2], [2, 3], [3, 4]];

function randomLines(n, straightOnly) {
  const lines = [];
  const keys = new Set();
  for (let guard = 0; lines.length < n && guard < 500; guard++) {
    const a = rand(DOTS.length);
    const b = rand(DOTS.length);
    if (a === b || shareSide(a, b) || (straightOnly && !isStraight(a, b))) continue;
    const key = lineKey([a, b]);
    if (keys.has(key)) continue;
    keys.add(key);
    lines.push([a, b]);
  }
  return lines;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...kids) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...kids);
  return node;
}

// 손가락이 점에서 이만큼(보드 좌표) 안에 있으면 그 점을 누른 것으로 봄
const DOT_REACH = 38;

const pathData = (pts) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')}`;

function dotBoard(size, drawable = false) {
  const hintLayer = svg('g');
  const lineLayer = svg('g');
  const previewLayer = svg('g');
  const dots = DOTS.map((_, k) => {
    const [x, y] = dotXY(k);
    return svg('g', { class: 'dl-dot' }, svg('circle', { cx: x, cy: y, r: 10, class: 'dl-point' }));
  });
  const node = svg('svg', { viewBox: '0 0 300 300', class: `dl-board ${size}${drawable ? ' drawable' : ''}` },
    svg('rect', { x: 30, y: 30, width: 240, height: 240, class: 'dl-frame' }),
    hintLayer,
    lineLayer,
    previewLayer,
    svg('g', {}, ...dots));
  return {
    node,
    dots,
    draw(lines, kind, layer = lineLayer) {
      layer.replaceChildren(...lines.map(([a, b]) => {
        const [x1, y1] = dotXY(a);
        const [x2, y2] = dotXY(b);
        return svg('line', { x1, y1, x2, y2, class: `dl-line ${kind}` });
      }));
    },
    // 그어야 할 선을 흐린 점선으로 보여줌
    hint(lines) {
      this.draw(lines, 'hint', hintLayer);
    },
    // 손으로 그린 자국을 그대로 그림
    drawPaths(paths, kind) {
      lineLayer.replaceChildren(...paths.map((pts) => svg('path', { d: pathData(pts), class: `dl-line ${kind}` })));
    },
    // 지금 그리고 있는 자국
    livePath(points) {
      previewLayer.replaceChildren(...(points ? [svg('path', { d: pathData(points), class: 'dl-line live' })] : []));
    },
    // 화면 좌표 → 보드 좌표
    toBoard(e) {
      const rect = node.getBoundingClientRect();
      return [(e.clientX - rect.left) * 300 / rect.width, (e.clientY - rect.top) * 300 / rect.height];
    },
    nearest(x, y) {
      let best = null;
      let bestDist = DOT_REACH;
      DOTS.forEach((_, k) => {
        const [dx, dy] = dotXY(k);
        const dist = Math.hypot(dx - x, dy - y);
        if (dist <= bestDist) {
          best = k;
          bestDist = dist;
        }
      });
      return best;
    },
  };
}

const linesGame = {
  id: 'lines',
  title: '선 따라 긋기',
  desc: '점을 이어 똑같이 그려요',
  skill: '시지각 · 소근육',
  icon: '✏️',
  color: '#f5e3c8',

  round(i, ctx) {
    const original = randomLines(LINE_COUNTS[ctx.level][i < 5 ? 0 : 1], ctx.level === 0 && i < 5);
    const rec = { original, answer: [] };
    // 아이가 손으로 그린 선: 그린 자국(points)을 그대로 보여 주고, 채점은 시작 점과 끝 점으로 함
    const strokes = []; // [{ line: [시작 점, 끝 점], points: [[x, y], ...] }]
    let drawing = null; // 지금 그리고 있는 선 { from, points }

    const left = dotBoard('mid');
    left.draw(original, 'orig');
    const right = dotBoard('mid', true);
    const resetBtn = el('button', { class: 'btn-main alt', disabled: true, onclick: reset }, '다시 그리기');
    const doneBtn = el('button', { class: 'btn-main', disabled: true, onclick: submit }, '다 했어요');

    ctx.stage.append(
      prompt('왼쪽과 똑같이 선을 그어요'),
      el('div', { class: 'compare' },
        el('div', { class: 'compare-col' }, '원본', left.node),
        el('div', { class: 'compare-col' }, '내 답', right.node)),
      el('div', { class: 'draw-tip' }, '점에서 점까지 손가락으로 그려요'),
      el('div', { class: 'btn-row' }, resetBtn, doneBtn),
    );

    const canJoin = (a, b) => a != null && b != null && a !== b && !shareSide(a, b);
    const drawnLines = () => strokes.map((st) => st.line);

    function refresh() {
      right.drawPaths(strokes.map((st) => st.points), 'mine');
      right.dots.forEach((d, k) => d.classList.toggle('sel', drawing?.from === k));
      resetBtn.disabled = strokes.length === 0;
      doneBtn.disabled = strokes.length === 0;
      if (rec.missed) {
        const have = drawnLines().map(lineKey);
        right.hint(original.filter((l) => !have.includes(lineKey(l))));
      }
    }

    right.node.addEventListener('pointerdown', (e) => {
      const k = right.nearest(...right.toBoard(e));
      if (k == null) return;
      e.preventDefault();
      right.node.setPointerCapture(e.pointerId);
      drawing = { from: k, points: [dotXY(k)] };
      tone([600], 0.05);
      refresh();
      right.livePath(drawing.points);
    });

    right.node.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const point = right.toBoard(e);
      const [lx, ly] = drawing.points[drawing.points.length - 1];
      if (Math.hypot(point[0] - lx, point[1] - ly) < 3) return;
      drawing.points.push(point);
      right.livePath(drawing.points);
    });

    right.node.addEventListener('pointerup', (e) => {
      if (!drawing) return;
      const { from, points } = drawing;
      drawing = null;
      right.livePath(null);
      // 다른 점에서 손을 떼면 선이 생기고, 아니면 그린 자국은 사라짐
      const to = right.nearest(...right.toBoard(e));
      const key = canJoin(from, to) ? lineKey([from, to]) : null;
      if (key && !strokes.some((st) => lineKey(st.line) === key)) {
        points.push(dotXY(to));
        strokes.push({ line: [from, to], points });
        tone([760], 0.06);
      }
      refresh();
    });

    right.node.addEventListener('pointercancel', () => {
      drawing = null;
      right.livePath(null);
      refresh();
    });

    // 그린 선을 모두 지우고 처음부터 다시
    function reset() {
      strokes.length = 0;
      tone([440], 0.06);
      refresh();
    }

    function submit() {
      rec.answer = drawnLines();
      const want = original.map(lineKey);
      if (sameSet(rec.answer.map(lineKey), want)) {
        ctx.finish(true);
        return;
      }
      // 잘못 그린 선은 지우고, 빠진 선은 점선으로 알려줌
      for (let k = strokes.length - 1; k >= 0; k--) {
        if (!want.includes(lineKey(strokes[k].line))) strokes.splice(k, 1);
      }
      ctx.miss('점선을 따라 그어 볼까요?');
      refresh();
    }

    return rec;
  },

  review(rec) {
    const board = (lines, kind) => {
      const b = dotBoard('mini');
      b.draw(lines, kind);
      return b.node;
    };
    return el('div', { class: 'compare' },
      el('div', { class: 'compare-col' }, '원본', board(rec.original, 'orig')),
      el('div', { class: 'compare-col' }, '내 답', board(rec.answer, 'mine')),
    );
  },
};

/* ---------- 놀이 2: 규칙 찾기 ---------- */
// 아이가 한눈에 구분하도록 색과 모양이 모두 확실히 다른 그림만 씀
// (빨강 사과 · 노랑 바나나 · 초록 개구리 · 파랑 고래 · 보라 포도 · 분홍 꽃 · 회색 코끼리 · 주황 당근, 모두 실사 사진)
const PATTERN_SETS = [
  ['🍎', '🍌', '🐸', '🐳', '🍇', '🌸', '🐘', '🥕'],
];
// 숫자가 같으면 같은 그림
const AB = [0, 1];
const AAB = [0, 0, 1];
const ABB = [0, 1, 1];
const ABC = [0, 1, 2];
// 단계별 · 문제 번호별 규칙
const PATTERN_UNITS = [
  [AB, AB, AB, AB, AB, AB, AB, AB, AB, AB],
  [AB, AB, AB, AB, AB, AB, AAB, ABB, AAB, ABB],
  [AB, AB, AB, AAB, ABB, AAB, ABB, ABC, AAB, ABC],
];
// 단계별 보기 개수
const PATTERN_CHOICES = [2, 3, 3];
// 규칙 길이별 묶음 수: 규칙을 보여주는 묶음 1개 + 빈칸이 있는 묶음 1개 (한눈에 보이도록 최소로)
const PATTERN_GROUPS = { 2: 2, 3: 2 };
const PATTERN_TILE = {
  2: 'clamp(calc(100px * var(--k)), min(33vw, 17vh), calc(136px * var(--k)))',
  3: 'clamp(calc(84px * var(--k)), min(26vw, 14vh), calc(104px * var(--k)))',
};

function patternBoard(seq, unitLen, blankTile, tileSize) {
  const groups = [];
  for (let g = 0; g < seq.length / unitLen; g++) {
    groups.push(el('div', { class: 'pgroup' },
      seq.slice(g * unitLen, (g + 1) * unitLen).map((item, k) => {
        const idx = g * unitLen + k;
        return idx === blankTile.index ? blankTile.node : el('div', { class: 'tile' }, pic(item));
      })));
  }
  // 그림을 크게 보여주려고 한 줄에 한 묶음씩
  const cols = 1;
  return el('div', { class: 'pgroups', style: `--t:${tileSize};grid-template-columns:repeat(${cols},auto)` }, groups);
}

const patternGame = {
  id: 'pattern',
  title: '규칙 찾기',
  desc: '빈칸에 들어갈 것은?',
  skill: '패턴 인식',
  icon: '🍎',
  color: '#fbe6b8',

  round(i, ctx) {
    const shape = PATTERN_UNITS[ctx.level][i % TOTAL];
    const set = pick(PATTERN_SETS);
    const kinds = sample(set, Math.max(...shape) + 1);
    const unit = shape.map((k) => kinds[k]);
    const seq = Array.from({ length: PATTERN_GROUPS[unit.length] }, () => unit).flat();
    // 첫 묶음은 규칙을 보여주기 위해 비워두지 않음
    const blank = unit.length + rand(seq.length - unit.length);
    const answer = seq[blank];
    const choiceCount = PATTERN_CHOICES[ctx.level];
    const choices = shuffle([
      answer,
      ...shuffle(kinds.filter((k) => k !== answer)),
      ...sample(set.filter((x) => !kinds.includes(x)), choiceCount),
    ].slice(0, choiceCount));
    const rec = { seq, unitLen: unit.length, blank, answer, chosen: null };

    const blankNode = el('div', { class: 'tile blank' }, '?');
    const board = patternBoard(seq, unit.length, { index: blank, node: blankNode }, PATTERN_TILE[unit.length]);
    const buttons = choices.map((c) => el('button', { class: 'tile choice', 'aria-label': c, onclick: () => choose(c) }, pic(c)));
    const choiceRow = el('div', { class: 'choices', style: choicesStyle(choices.length) }, buttons);

    ctx.stage.append(prompt('빈칸에 들어갈 것은?'), board, choiceLabel(choices.length), choiceRow);

    function choose(c) {
      if (c !== answer) {
        retryChoice(ctx, buttons[choices.indexOf(c)], buttons[choices.indexOf(answer)]);
        return;
      }
      rec.chosen = c;
      blankNode.replaceChildren(pic(c));
      blankNode.className = 'tile pop good';
      ctx.finish(true);
    }

    return rec;
  },

  review(rec) {
    const ok = rec.chosen === rec.answer;
    const blankNode = el('div', { class: `tile ${rec.chosen == null ? 'blank' : ok ? 'good' : 'bad'}` }, rec.chosen == null ? '?' : pic(rec.chosen));
    return el('div', {},
      patternBoard(rec.seq, rec.unitLen, { index: rec.blank, node: blankNode }, rec.unitLen === 2 ? '40px' : '30px'),
      ok ? null : el('div', { class: 'review-note answer-note' }, '정답: ', pic(rec.answer)),
    );
  },
};

/* ---------- 놀이 3: 몇 개일까? ---------- */
const COUNT_ITEMS = ['🍎', '🐥', '⭐', '🎈', '🐳', '🌸', '🚗', '🦋'];
// 단계별 [앞 5문제, 뒤 5문제] 개수 범위
const COUNT_RANGES = [
  [[1, 3], [1, 4]],
  [[1, 4], [2, 5]],
  [[2, 6], [3, 8]],
];

const countGame = {
  id: 'count',
  title: '몇 개일까?',
  desc: '하나, 둘, 셋… 세어 봐요',
  skill: '수 감각',
  icon: '🔢',
  color: '#cfe6f3',

  round(i, ctx) {
    const [lo, hi] = COUNT_RANGES[ctx.level][i < 5 ? 0 : 1];
    const n = lo + rand(hi - lo + 1);
    const emoji = pick(COUNT_ITEMS);
    const near = shuffle([n - 2, n - 1, n + 1, n + 2].filter((x) => x >= 1 && x <= 12));
    const choices = [n, near[0], near[1]].sort((a, b) => a - b);
    const rec = { emoji, n, chosen: null };

    // 4×3 칸 중 무작위 위치에 흩어 놓기
    const slots = sample([...Array(12).keys()], n);
    const board = el('div', { class: 'count-board' },
      slots.map((s, k) => {
        const left = ((s % 4) + 0.5) / 4 * 100 + (Math.random() * 8 - 4);
        const top = (Math.floor(s / 4) + 0.5) / 3 * 100 + (Math.random() * 10 - 5);
        return el('div', { class: 'count-item', style: `left:${left}%;top:${top}%` },
          el('span', { style: `animation-delay:${k * 0.06}s` }, pic(emoji)));
      }));

    const buttons = choices.map((c) =>
      el('button', { class: 'num-btn', onclick: () => choose(c, buttons[choices.indexOf(c)]) }, String(c)));

    ctx.stage.append(prompt('몇 개일까요?', false), board, choiceLabel(choices.length),
      el('div', { class: 'num-choices' }, buttons));
    speak('몇 개일까요?');

    function choose(c, btn) {
      if (c !== n) {
        retryChoice(ctx, btn, buttons[choices.indexOf(n)]);
        return;
      }
      rec.chosen = c;
      btn.classList.add('good');
      ctx.finish(true);
    }

    return rec;
  },

  review(rec) {
    return el('div', {},
      el('div', { class: 'review-items' }, range(1, rec.n).map(() => pic(rec.emoji))),
      el('div', { class: 'review-note' }, `정답 ${rec.n}개 · 내 답 ${rec.chosen == null ? '-' : `${rec.chosen}개`}`),
    );
  },
};

/* ---------- 놀이 4: 다른 하나 찾기 ---------- */
// 쉬운 짝: 색도 모양도 완전히 다름 / 어려운 짝: 같은 종류지만 색이 확실히 다름
// (🍎/🍅, 🌷/🌹처럼 색까지 같은 짝은 쓰지 않음)
const ODD_EASY = [
  ['🍎', '🍌'], ['🐸', '🐷'], ['🚗', '🌳'], ['⭐', '🐳'], ['🍇', '🥕'], ['⚽', '🎈'],
  ['🐘', '🌸'], ['🐧', '🌻'], ['✈️', '🍉'], ['🦒', '☂️'], ['🚌', '🐙'], ['🦋', '🍄'],
];
const ODD_HARD = [
  ['🚗', '🚕'], ['⚽', '🏀'], ['🍊', '🍇'], ['🐻', '🐼'], ['🐟', '🐙'], ['🍎', '🍏'], ['❤️', '💙'], ['🌞', '🌙'],
];
// 단계별 [앞 5문제, 뒤 5문제] 칸 수
const ODD_SIZES = [[4, 4], [4, 6], [6, 6]];

function oddGrid(items, cols, extra = {}) {
  return el('div', { class: `ogrid${extra.mini ? ' mini' : ''}`, style: `grid-template-columns:repeat(${cols},1fr)` },
    items.map((item, k) => el(extra.mini ? 'div' : 'button', {
      class: `otile ${extra.classOf?.(k) ?? ''}`,
      style: `font-size:${extra.mini ? '22px' : cols === 2 ? 'min(30vw, calc(140px * var(--k)))' : 'min(20vw, calc(96px * var(--k)))'};animation-delay:${k * 0.04}s`,
      onclick: extra.onPick && (() => extra.onPick(k)),
    }, (extra.render ?? String)(item))));
}

const oddGame = {
  id: 'odd',
  title: '다른 하나 찾기',
  desc: '모양이 다른 친구를 찾아요',
  skill: '시각 변별',
  icon: '🔍',
  color: '#d6ecd2',

  round(i, ctx) {
    const size = ODD_SIZES[ctx.level][i < 5 ? 0 : 1];
    const cols = size === 4 ? 2 : 3;
    const hard = ctx.level === 2 && i >= 5;
    const [same, diff] = shuffle(pick(hard ? ODD_HARD : ODD_EASY));
    const odd = rand(size);
    const items = Array.from({ length: size }, (_, k) => (k === odd ? diff : same));
    const rec = { items, cols, odd, chosen: null };

    const grid = oddGrid(items, cols, { onPick: choose, render: photoRenderer(items) });
    ctx.stage.append(prompt('다른 하나를 찾아요!'), grid);

    function choose(k) {
      if (k !== odd) {
        retryChoice(ctx, grid.children[k], grid.children[odd]);
        return;
      }
      rec.chosen = k;
      grid.children[k].classList.add('good');
      ctx.finish(true);
    }

    return rec;
  },

  review(rec) {
    return el('div', { class: 'review-center' },
      oddGrid(rec.items, rec.cols, {
        mini: true,
        render: photoRenderer(rec.items),
        classOf: (k) => (k === rec.odd ? 'good' : k === rec.chosen ? 'bad' : ''),
      }));
  },
};

/* ---------- 놀이 5: 짝 맞추기 ---------- */
// 동물 얼굴끼리는 헷갈리므로 색과 모양이 다른 그림으로 섞음
const FLIP_ITEMS = ['🍎', '🍌', '🐸', '🐳', '🍇', '🌸', '🚗', '🥕'];
// 단계별 · 판별 짝 개수
const FLIP_PAIRS = [[2, 2, 2, 3, 3], [2, 3, 3, 3, 4], [3, 3, 4, 4, 5]];
// 시작할 때 카드를 미리 보여주는 시간
const FLIP_PEEK = [3000, 2500, 2000];

const flipGame = {
  id: 'flip',
  title: '짝 맞추기',
  desc: '같은 그림 두 장을 찾아요',
  skill: '기억력 · 집중력',
  icon: '🃏',
  color: '#e6dcf5',
  total: 5,

  round(i, ctx) {
    const pairs = FLIP_PAIRS[ctx.level][i];
    const faces = sample(FLIP_ITEMS, pairs);
    const deck = shuffle([...faces, ...faces]);
    const cols = deck.length <= 4 ? 2 : deck.length === 6 ? 3 : 4;
    const rec = { faces, misses: 0, done: false };
    let opened = [];
    let matched = 0;
    let busy = true;

    const title = el('div');
    const cards = deck.map((face, k) =>
      el('button', { class: 'card open', 'aria-label': '카드', onclick: () => flip(k) }, el('span', {}, pic(face))));
    const grid = el('div', {
      class: 'card-grid',
      style: `grid-template-columns:repeat(${cols},1fr);font-size:${{ 2: 'min(30vw, calc(130px * var(--k)))', 3: 'min(21vw, calc(96px * var(--k)))', 4: 'min(15vw, calc(72px * var(--k)))' }[cols] ?? 'min(10vw, calc(48px * var(--k)))'}`,
    }, cards);
    ctx.stage.append(title, grid);

    title.replaceChildren(prompt('잘 보고 기억해요!'));
    ctx.later(() => {
      cards.forEach((c) => c.classList.remove('open'));
      busy = false;
      title.replaceChildren(prompt('같은 그림을 찾아요!'));
    }, FLIP_PEEK[ctx.level]);

    function flip(k) {
      const card = cards[k];
      if (busy || card.classList.contains('open')) return;
      card.classList.add('open');
      tone([600], 0.05);
      opened.push(k);
      if (opened.length < 2) return;

      const [a, b] = opened;
      opened = [];
      if (deck[a] === deck[b]) {
        cards[a].classList.add('matched');
        cards[b].classList.add('matched');
        tone([700, 1000], 0.08);
        if (++matched === pairs) {
          rec.done = true;
          busy = true;
          ctx.later(() => ctx.finish(rec.misses <= pairs, 'done'), 500);
        }
      } else {
        rec.misses++;
        busy = true;
        ctx.later(() => {
          cards[a].classList.remove('open');
          cards[b].classList.remove('open');
          busy = false;
        }, 800);
      }
    }

    return rec;
  },

  review(rec) {
    const note = !rec.done ? '끝까지 하지 못했어요'
      : rec.misses === 0 ? '한 번도 안 틀리고 다 찾았어요'
      : `${rec.misses}번 틀리고 다 찾았어요`;
    return el('div', {},
      el('div', { class: 'review-items' }, rec.faces.join(' ')),
      el('div', { class: 'review-note' }, note),
    );
  },

  // 끝까지 찾았으면 실수가 많아도 '오답' 대신 '완성'으로 표시
  badge(rec) {
    if (rec.passed) return null;
    return rec.correct ? ['good', '잘 찾았어요'] : ['pass', '완성'];
  },
};

/* ---------- 놀이 6: 그림자 찾기 ---------- */
// 그림자는 모양으로만 구분하므로 윤곽이 서로 확실히 다른 것만 씀
// (동물 얼굴, 둥근 과일처럼 그림자가 비슷한 것끼리는 넣지 않음)
const SHADOW_ITEMS = ['🐘', '🦒', '🦋', '🦀', '🐙', '✈️', '🚲', '⛵', '🍌', '🍄', '🌵', '⭐', '❤️', '🌙', '🔑'];

const shadow = (item) => el('span', { class: 'shadow' }, item);

const shadowGame = {
  id: 'shadow',
  title: '그림자 찾기',
  desc: '꼭 맞는 그림자를 골라요',
  skill: '형태 지각',
  icon: '👤',
  color: '#dcdde8',

  round(i, ctx) {
    const [answer, ...others] = sample(SHADOW_ITEMS, ctx.level === 0 ? 2 : 3);
    const choices = shuffle([answer, ...others]);
    const rec = { answer, chosen: null };

    const buttons = choices.map((c) =>
      el('button', { class: 'tile choice', 'aria-label': '그림자', onclick: () => choose(c, buttons[choices.indexOf(c)]) },
        shadow(c)));

    ctx.stage.append(
      prompt('알맞은 그림자를 찾아요!'),
      el('div', { class: 'tile shadow-target' }, answer),
      choiceLabel(choices.length),
      el('div', { class: 'choices', style: choicesStyle(choices.length) }, buttons),
    );

    function choose(c, btn) {
      if (c !== answer) {
        retryChoice(ctx, btn, buttons[choices.indexOf(answer)]);
        return;
      }
      rec.chosen = c;
      btn.classList.add('good');
      ctx.finish(true);
    }

    return rec;
  },

  review(rec) {
    const ok = rec.chosen === rec.answer;
    return el('div', { class: 'compare' },
      el('div', { class: 'compare-col' }, '그림', el('div', { class: 'tile', style: '--t:64px' }, rec.answer)),
      el('div', { class: 'compare-col' }, '내 답',
        el('div', { class: `tile ${rec.chosen == null ? 'blank' : ok ? 'good' : 'bad'}`, style: '--t:64px' },
          rec.chosen == null ? '?' : shadow(rec.chosen))),
    );
  },
};

/* ---------- 놀이 7: 순서 맞추기 ---------- */
const ORDER_STORIES = [
  { items: ['🥚', '🐣', '🐥', '🐔'], say: '자라는 순서대로 놓아요', level: 0 },
];
// (사람 나이 순서·달 모양·새싹 단계는 그림 차이가 작아서 뺌)
const ORDER_SIZE_ITEMS = ['🎈', '🍎', '⭐', '🐳', '🍩'];
// 단계별 [앞 5문제, 뒤 5문제] 개수
const ORDER_LENGTHS = [[2, 3], [3, 3], [3, 4]];
const ORDER_MAX_NUMBER = [3, 5, 9];

function makeOrderPuzzle(level, len) {
  const stories = ORDER_STORIES.filter((s) => s.level <= level && s.items.length >= len);
  const kind = pick(['size', 'number', ...(stories.length ? ['story'] : [])]);

  if (kind === 'story') {
    const story = pick(stories);
    return { say: story.say, items: story.items.slice(0, len).map((label) => ({ label })) };
  }
  if (kind === 'number') {
    const nums = level === 0 ? range(1, len) : sample(range(1, ORDER_MAX_NUMBER[level]), len).sort((a, b) => a - b);
    return { say: '작은 수부터 순서대로 놓아요', items: nums.map((n) => ({ label: String(n) })) };
  }
  const emoji = pick(ORDER_SIZE_ITEMS);
  return {
    say: '작은 것부터 순서대로 놓아요',
    items: range(0, len - 1).map((k) => ({ label: emoji, scale: 0.4 + (0.6 * k) / (len - 1) })),
  };
}

function orderTile(item, props = {}) {
  return el('div', { class: 'tile', ...props },
    el('span', { class: 'order-face', style: item.scale ? `transform:scale(${item.scale})` : '' }, PHOTOS[item.label] ? pic(item.label) : item.label));
}

const orderGame = {
  id: 'order',
  title: '순서 맞추기',
  desc: '차례대로 줄을 세워요',
  skill: '순서 · 논리',
  icon: '🪜',
  color: '#f6dbe7',

  // makePuzzle을 바꿔 끼워서 '생활 순서' 놀이도 같은 방식으로 씀
  round(i, ctx, makePuzzle = makeOrderPuzzle) {
    const puzzle = makePuzzle(ctx.level, ORDER_LENGTHS[ctx.level][i < 5 ? 0 : 1]);
    const len = puzzle.items.length;
    let order;
    do order = shuffle(range(0, len - 1));
    while (order.every((v, k) => v === k));
    const placed = Array(len).fill(null); // 칸 → 조각 번호
    const rec = { items: puzzle.items, order, chosen: placed };
    const tileSize = len >= 4 ? 'clamp(calc(58px * var(--k)), 20vw, calc(86px * var(--k)))' : len === 3 ? 'clamp(calc(84px * var(--k)), 28vw, calc(108px * var(--k)))' : 'clamp(calc(110px * var(--k)), 36vw, calc(150px * var(--k)))';

    const slotNodes = placed.map((_, s) =>
      el('button', { class: 'tile blank slot', 'aria-label': `${s + 1}번째 자리`, onclick: () => unplace(s) },
        String(s + 1)));
    const pieceNodes = order.map((p) =>
      el('button', { class: `tile choice${puzzle.items[p].text ? ' captioned' : ''}`, onclick: () => place(p) },
        el('span', { class: 'order-face', style: puzzle.items[p].scale ? `transform:scale(${puzzle.items[p].scale})` : '' },
          puzzle.items.every((it) => PHOTOS[it.label]) ? pic(puzzle.items[p].label) : puzzle.items[p].label),
        puzzle.items[p].text ? el('span', { class: 'order-caption' }, puzzle.items[p].text) : null));

    ctx.stage.append(
      prompt(puzzle.say),
      el('div', { class: 'order-slots', style: `--t:${tileSize}` }, slotNodes),
      el('div', { class: 'choices', style: `--choice-t:${tileSize}` }, pieceNodes),
    );

    function place(p) {
      const s = placed.indexOf(null);
      if (s < 0 || placed.includes(p)) return;
      placed[s] = p;
      slotNodes[s].replaceChildren(...pieceNodes[order.indexOf(p)].cloneNode(true).childNodes);
      slotNodes[s].className = `tile slot filled pop${puzzle.items[p].text ? ' captioned' : ''}`;
      pieceNodes[order.indexOf(p)].classList.add('used');
      tone([520 + s * 80], 0.07);
      if (puzzle.items[p].text) speak(puzzle.items[p].text);
      if (!placed.includes(null)) {
        const wrongAt = placed.findIndex((v, k) => v !== k);
        if (wrongAt < 0) {
          slotNodes.forEach((n) => n.classList.add('good'));
          ctx.finish(true);
          return;
        }
        // 처음 틀린 자리부터 다시 놓게 하고, 놓아야 할 그림을 반짝여 알려줌
        for (let k = placed.length - 1; k >= wrongAt; k--) unplace(k);
        rec.missed = true;
        ctx.miss('반짝이는 그림을 놓아 볼까요?');
      }
      guide();
    }

    function guide() {
      pieceNodes.forEach((n) => n.classList.remove('hint'));
      const s = placed.indexOf(null);
      if (rec.missed && s >= 0) pieceNodes[order.indexOf(s)].classList.add('hint');
    }

    function unplace(s) {
      const p = placed[s];
      if (p == null) return;
      placed[s] = null;
      slotNodes[s].replaceChildren(String(s + 1));
      slotNodes[s].className = 'tile blank slot';
      pieceNodes[order.indexOf(p)].classList.remove('used');
      guide();
    }

    return rec;
  },

  review(rec) {
    const ok = rec.chosen.every((v, k) => v === k);
    const row = (indexes, cls) => el('div', { class: 'order-slots', style: '--t:40px' },
      indexes.map((p) => (p == null ? el('div', { class: 'tile blank' }, '?') : orderTile(rec.items[p], { class: `tile ${cls}` }))));
    return el('div', { class: 'order-review' },
      el('div', { class: 'compare-col' }, '정답 순서', row(range(0, rec.items.length - 1), '')),
      el('div', { class: 'compare-col' }, '내 순서', row(rec.chosen, ok ? 'good' : '')),
    );
  },
};

/* ---------- 놀이: 이름 듣고 찾기 ---------- */
// 색과 모양이 서로 확실히 다른 낱말만
const LISTEN_WORDS = [
  ['사과', '🍎'], ['바나나', '🍌'], ['개구리', '🐸'], ['고래', '🐳'], ['포도', '🍇'], ['꽃', '🌸'],
  ['펭귄', '🐧'], ['당근', '🥕'], ['자동차', '🚗'], ['별', '⭐'], ['공', '⚽'], ['풍선', '🎈'],
  ['코끼리', '🐘'], ['나비', '🦋'], ['기린', '🦒'], ['비행기', '✈️'],
];
// 단계별 [앞 5문제, 뒤 5문제] 보기 개수
const LISTEN_CHOICES = [[2, 2], [2, 3], [3, 4]];

// 받침이 있으면 '을', 없으면 '를'
function objectParticle(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code % 28 ? '을' : '를';
}

const listenGame = {
  id: 'listen',
  title: '이름 듣고 찾기',
  desc: '말을 듣고 그림을 골라요',
  skill: '말 알아듣기',
  icon: '👂',
  color: '#d4e8f7',

  round(i, ctx) {
    const picked = sample(LISTEN_WORDS, LISTEN_CHOICES[ctx.level][i < 5 ? 0 : 1]);
    const [word, answer] = picked[0];
    const choices = shuffle(picked.map(([, e]) => e));
    const rec = { word, answer, chosen: null };

    const show = photoRenderer(choices);
    const buttons = choices.map((c) => el('button', { class: 'tile choice', 'aria-label': c, onclick: () => choose(c) }, show(c)));
    ctx.stage.append(
      prompt(`${word}${objectParticle(word)} 찾아요`),
      el('div', { class: 'choices', style: choicesStyle(choices.length) }, buttons),
    );

    function choose(c) {
      if (c !== answer) {
        retryChoice(ctx, buttons[choices.indexOf(c)], buttons[choices.indexOf(answer)]);
        return;
      }
      rec.chosen = c;
      buttons[choices.indexOf(c)].classList.add('good');
      ctx.finish(true);
    }

    return rec;
  },

  review(rec) {
    return el('div', { class: 'compare' },
      el('div', { class: 'compare-col' }, '들은 말', el('div', { class: 'review-word' }, rec.word)),
      el('div', { class: 'compare-col' }, '고른 그림',
        el('div', { class: `tile ${rec.chosen == null ? 'blank' : 'good'}`, style: '--t:64px' }, rec.chosen ? pic(rec.chosen) : '?')),
    );
  },
};

/* ---------- 놀이: 기분 알기 ---------- */
// 표정이 확실히 다른 얼굴만 (😢/😭, 😨/😱처럼 비슷한 얼굴은 함께 쓰지 않음)
const FEELINGS = {
  happy: { face: '😄', word: '기뻐요', adj: '기쁜' },
  sad: { face: '😭', word: '슬퍼요', adj: '슬픈' },
  angry: { face: '😡', word: '화나요', adj: '화난' },
  scared: { face: '😱', word: '무서워요', adj: '무서운' },
};
// 단계별로 쓰는 기분
const FEEL_SETS = [['happy', 'sad'], ['happy', 'sad', 'angry'], ['happy', 'sad', 'angry', 'scared']];
// 상황 문제: avoid는 함께 느낄 수도 있어서 보기로 내지 않는 기분
const FEEL_SITUATIONS = [
  { icon: '🎁', text: '선물을 받았어요', feel: 'happy' },
  { icon: '🎂', text: '생일 케이크를 받았어요', feel: 'happy' },
  { icon: '🎉', text: '친구들과 파티를 해요', feel: 'happy' },
  { icon: '🎠', text: '회전목마를 탔어요', feel: 'happy' },
  { icon: '🍦', text: '아이스크림을 떨어뜨렸어요', feel: 'sad', avoid: ['angry'] },
  { icon: '🎈', text: '풍선이 하늘로 날아갔어요', feel: 'sad', avoid: ['angry'] },
  { icon: '🧸', text: '좋아하는 인형이 찢어졌어요', feel: 'sad', avoid: ['angry'] },
  { icon: '🩹', text: '넘어져서 무릎이 아파요', feel: 'sad', avoid: ['angry', 'scared'] },
  { icon: '🧱', text: '친구가 내 블록을 일부러 무너뜨렸어요', feel: 'angry', avoid: ['sad'] },
  { icon: '⛈️', text: '천둥 번개가 쾅쾅 쳐요', feel: 'scared', avoid: ['sad'] },
];

const feelGame = {
  id: 'feel',
  title: '기분 알기',
  desc: '얼굴 표정을 보고 기분을 알아요',
  skill: '감정 이해',
  icon: '😊',
  color: '#fde2b8',

  round(i, ctx) {
    const set = FEEL_SETS[ctx.level];
    // 앞쪽은 얼굴 찾기, 뒤쪽은 상황 문제 (얼굴 문제는 종류가 적어서 쉬움도 뒤쪽은 상황 문제로)
    const situation = i >= [4, 5, 3][ctx.level]
      ? pick(FEEL_SITUATIONS.filter((s) => set.includes(s.feel)))
      : null;
    const feel = situation ? situation.feel : pick(set);
    const others = set.filter((f) => f !== feel && !situation?.avoid?.includes(f));
    const choices = shuffle([feel, ...sample(others, ctx.level === 0 ? 1 : 2)]);
    const rec = { feel, situation, choices, chosen: null };

    const buttons = choices.map((f) =>
      el('button', { class: 'tile choice face', 'aria-label': FEELINGS[f].word, onclick: () => choose(f) }, pic(FEELINGS[f].face)));
    const row = el('div', { class: 'choices', style: choicesStyle(choices.length) }, buttons);

    if (situation) {
      ctx.stage.append(
        prompt('어떤 기분일까요?', false),
        el('div', { class: 'situation' },
          el('div', { class: 'situation-icon' }, situation.icon),
          el('div', { class: 'situation-text' }, situation.text)),
        choiceLabel(choices.length),
        row,
      );
      speak(`${situation.text}. 어떤 기분일까요?`);
    } else {
      ctx.stage.append(prompt(`${FEELINGS[feel].adj} 얼굴을 찾아요`), row);
    }

    function choose(f) {
      if (f !== feel) {
        retryChoice(ctx, buttons[choices.indexOf(f)], buttons[choices.indexOf(feel)]);
        return;
      }
      rec.chosen = f;
      buttons[choices.indexOf(f)].classList.add('good');
      ctx.finish(true);
    }

    return rec;
  },

  review(rec) {
    const question = rec.situation
      ? el('div', { class: 'review-word' }, `${rec.situation.icon} ${rec.situation.text}`)
      : el('div', { class: 'review-word' }, `${FEELINGS[rec.feel].adj} 얼굴`);
    return el('div', { class: 'compare' },
      el('div', { class: 'compare-col' }, '문제', question),
      el('div', { class: 'compare-col' }, FEELINGS[rec.feel].word,
        el('div', { class: `tile ${rec.chosen == null ? 'blank' : 'good'}`, style: '--t:64px' },
          rec.chosen ? pic(FEELINGS[rec.chosen].face) : '?')),
    );
  },
};

/* ---------- 놀이: 생활 순서 ---------- */
// 순서가 분명한 생활 습관만 (옷 입기처럼 순서가 사람마다 다른 것은 뺌)
const ROUTINES = [
  { say: '손 씻는 순서대로 놓아요', steps: [['🚰', '물 틀기'], ['🧼', '비누칠'], ['💦', '헹구기'], ['🧻', '닦기']] },
  { say: '밖에 나가는 순서대로 놓아요', steps: [['🧦', '양말 신기'], ['👟', '신발 신기'], ['🚪', '나가기']] },
  { say: '밥 먹는 순서대로 놓아요', steps: [['🧼', '손 씻기'], ['🍚', '밥 먹기'], ['🪥', '이 닦기']] },
  { say: '잠자는 순서대로 놓아요', steps: [['🛁', '목욕'], ['👕', '잠옷 입기'], ['🛏️', '잠자기']] },
  { say: '그림 그리는 순서대로 놓아요', steps: [['📄', '종이 꺼내기'], ['🖍️', '그리기'], ['🖼️', '완성']] },
];

// 그림 아래 글자가 잘 보이도록 생활 순서는 많아야 3단계까지만 냄
const ROUTINE_MAX_STEPS = 3;

function makeRoutinePuzzle(level, len) {
  const want = Math.min(len, ROUTINE_MAX_STEPS);
  const routine = pick(ROUTINES.filter((r) => r.steps.length >= want));
  const n = want;
  return { say: routine.say, items: routine.steps.slice(0, n).map(([label, text]) => ({ label, text })) };
}

const routineGame = {
  ...orderGame,
  id: 'routine',
  title: '생활 순서',
  desc: '손 씻기, 밥 먹기 순서를 알아요',
  skill: '생활 습관 · 순서',
  icon: '🧼',
  color: '#d9f0ec',

  round(i, ctx) {
    return orderGame.round(i, ctx, makeRoutinePuzzle);
  },
};

/* ---------- 놀이: 어울리는 짝 찾기 ---------- */
// 먹이 짝과 물건 짝을 나눠서, 보기는 늘 다른 쪽에서만 냄 (헷갈릴 만한 보기 없게)
const MATCH_PAIRS = [
  { q: '🐶', name: '강아지', a: '🦴', kind: 'food' },
  { q: '🐝', name: '벌', a: '🍯', kind: 'food' },
  { q: '🐰', name: '토끼', a: '🥕', kind: 'food' },
  { q: '🦋', name: '나비', a: '🌸', kind: 'food' },
  { q: '🐄', name: '젖소', a: '🥛', kind: 'food' },
  { q: '🐔', name: '닭', a: '🥚', kind: 'food' },
  { q: '🌧️', name: '비', a: '☂️', kind: 'thing' },
  { q: '🦷', name: '이빨', a: '🪥', kind: 'thing' },
  { q: '🔒', name: '자물쇠', a: '🔑', kind: 'thing' },
  { q: '✏️', name: '연필', a: '📒', kind: 'thing' },
  { q: '🦶', name: '발', a: '🧦', kind: 'thing' },
  { q: '⚽', name: '공', a: '🥅', kind: 'thing' },
];
// 단계별 [앞 5문제, 뒤 5문제] 보기 개수
const MATCH_CHOICES = [[2, 2], [2, 3], [3, 3]];

// 받침이 있으면 '과', 없으면 '와'
function withParticle(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return `${word}${code >= 0 && code % 28 ? '과' : '와'}`;
}

const matchGame = {
  id: 'match',
  title: '어울리는 짝 찾기',
  desc: '함께 쓰이는 것을 찾아요',
  skill: '쓰임 이해 · 연상',
  icon: '🔗',
  color: '#e8dff5',

  round(i, ctx) {
    const pair = pick(MATCH_PAIRS);
    const others = MATCH_PAIRS.filter((x) => x.kind !== pair.kind).map((x) => x.a);
    const choices = shuffle([pair.a, ...sample(others, MATCH_CHOICES[ctx.level][i < 5 ? 0 : 1] - 1)]);
    const rec = { pair, chosen: null };

    const show = photoRenderer([pair.q, ...choices]);
    const buttons = choices.map((c) => el('button', { class: 'tile choice', 'aria-label': c, onclick: () => choose(c) }, show(c)));
    ctx.stage.append(
      prompt(`${withParticle(pair.name)} 어울리는 것은?`),
      el('div', { class: 'tile shadow-target' }, show(pair.q)),
      choiceLabel(choices.length),
      el('div', { class: 'choices', style: choicesStyle(choices.length) }, buttons),
    );

    function choose(c) {
      if (c !== pair.a) {
        retryChoice(ctx, buttons[choices.indexOf(c)], buttons[choices.indexOf(pair.a)]);
        return;
      }
      rec.chosen = c;
      buttons[choices.indexOf(c)].classList.add('good');
      ctx.finish(true);
    }

    return rec;
  },

  review(rec) {
    return el('div', { class: 'compare' },
      el('div', { class: 'compare-col' }, rec.pair.name, el('div', { class: 'tile', style: '--t:64px' }, pic(rec.pair.q))),
      el('div', { class: 'compare-col' }, '짝',
        el('div', { class: `tile ${rec.chosen == null ? 'blank' : 'good'}`, style: '--t:64px' }, pic(rec.chosen ?? rec.pair.a))),
    );
  },
};

/* ---------- 놀이: 어디에 있을까? (위 · 아래 · 옆) ---------- */
// 색과 모양이 서로 다른 물건만 (한 그림 안에서 헷갈리지 않게)
const SPACE_ITEMS = [
  { e: '🧦', name: '양말' }, { e: '☕', name: '컵' }, { e: '📘', name: '책' }, { e: '🍓', name: '딸기' },
  { e: '🍌', name: '바나나' }, { e: '⚽', name: '공' }, { e: '🧸', name: '곰인형' }, { e: '🐸', name: '개구리' },
];
const PLACES = {
  top: { word: '위', arrow: '⬆️' },
  under: { word: '아래', arrow: '⬇️' },
  side: { word: '옆', arrow: '➡️' },
};
// 단계별로 쓰는 자리
const SPACE_PLACES = [['top', 'under'], ['top', 'under', 'side'], ['top', 'under', 'side']];

// 받침이 있으면 '은', 없으면 '는'
function topicParticle(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return `${word}${code >= 0 && code % 28 ? '은' : '는'}`;
}

// 가구 그림 (책상 · 의자)과 물건 자리. 물건은 그림 글자로 얹음
const FURNITURE = {
  desk: {
    name: '책상',
    draw: `
      <rect x="40" y="112" width="190" height="20" rx="4" fill="#e9b47e"/>
      <rect x="52" y="132" width="166" height="14" rx="3" fill="#d79a62"/>
      <path d="M62 146 L52 226 M208 146 L218 226" stroke="#d79a62" stroke-width="10" stroke-linecap="round"/>
      <path d="M92 146 L98 214 M178 146 L172 214" stroke="#ecc79e" stroke-width="8" stroke-linecap="round"/>`,
    spots: { top: [135, 106, 70], under: [135, 222, 62], side: [290, 222, 62] },
  },
  chair: {
    name: '의자',
    draw: `
      <path d="M70 40 L76 136 M170 40 L164 136" stroke="#c98552" stroke-width="10" stroke-linecap="round"/>
      <rect x="64" y="36" width="112" height="20" rx="6" fill="#d9925b"/>
      <rect x="58" y="134" width="124" height="16" rx="5" fill="#e9b47e"/>
      <path d="M70 150 L62 228 M170 150 L178 228 M92 150 L96 218 M148 150 L144 218" stroke="#c98552" stroke-width="9" stroke-linecap="round"/>`,
    spots: { top: [120, 128, 64], under: [120, 224, 56], side: [270, 224, 62] },
  },
};

function spaceScene(furniture, placed, size = '') {
  const f = FURNITURE[furniture];
  const items = Object.entries(placed).map(([place, item]) => {
    const [x, y, fs] = f.spots[place];
    return `<text x="${x}" y="${y}" font-size="${fs}" text-anchor="middle">${item.e}</text>`;
  }).join('');
  const wrap = el('div', { class: `space-scene ${size}` });
  wrap.innerHTML = `<svg viewBox="0 0 340 240" role="img" aria-label="${f.name} 그림">
    <path d="M10 228 H330" stroke="#e3d8c6" stroke-width="3" stroke-linecap="round"/>${f.draw}${items}</svg>`;
  return wrap;
}

const spaceGame = {
  id: 'space',
  title: '어디에 있을까?',
  desc: '위, 아래, 옆을 알아요',
  skill: '공간 개념',
  icon: '🪑',
  color: '#f3e3cc',

  round(i, ctx) {
    const furniture = pick(Object.keys(FURNITURE));
    const places = SPACE_PLACES[ctx.level];
    // 쉬움은 물건 2개(위·아래), 보통은 앞쪽 2개·뒤쪽 3개, 어려움은 3개
    const used = ctx.level === 0 || (ctx.level === 1 && i < 5) ? sample(places, 2) : places;
    const things = sample(SPACE_ITEMS, used.length + 1);
    const placed = Object.fromEntries(used.map((pl, k) => [pl, things[k]]));
    const extra = things[used.length]; // 그림에 없는 물건 (보기로만)
    const ask = pick(used);
    // 보통 뒤쪽 · 어려움 뒤쪽은 '어디에 있어요?' 문제
    const whereType = ctx.level > 0 && i >= [10, 7, 5][ctx.level];
    const f = FURNITURE[furniture];
    const rec = { furniture, placed, ask, whereType, chosen: null };

    let choices, answer, label, say;
    if (whereType) {
      answer = ask;
      choices = shuffle([...used]);
      label = (pl) => el('span', { class: 'place-btn' }, el('b', {}, PLACES[pl].arrow), PLACES[pl].word);
      say = `${topicParticle(placed[ask].name)} 어디에 있어요?`;
    } else {
      answer = placed[ask].e;
      const pool = [...Object.values(placed)].concat(ctx.level === 0 ? [] : [extra]);
      choices = shuffle(pool.map((t) => t.e));
      label = (c) => c;
      say = `${f.name} ${PLACES[ask].word}에 뭐가 있어요?`;
    }

    const buttons = choices.map((c) => el('button', {
      class: `tile choice${whereType ? ' place' : ''}`,
      'aria-label': whereType ? PLACES[c].word : c,
      onclick: () => choose(c),
    }, label(c)));

    ctx.stage.append(
      prompt(say),
      spaceScene(furniture, placed),
      choiceLabel(choices.length),
      el('div', { class: 'choices', style: choicesStyle(choices.length) }, buttons),
    );

    function choose(c) {
      if (c !== answer) {
        retryChoice(ctx, buttons[choices.indexOf(c)], buttons[choices.indexOf(answer)]);
        return;
      }
      rec.chosen = c;
      buttons[choices.indexOf(c)].classList.add('good');
      if (!whereType) speak(`${PLACES[ask].word}에 ${placed[ask].name}`);
      ctx.finish(true);
    }

    return rec;
  },

  review(rec) {
    const f = FURNITURE[rec.furniture];
    const q = rec.whereType
      ? `${topicParticle(rec.placed[rec.ask].name)} 어디에? → ${PLACES[rec.ask].word}`
      : `${f.name} ${PLACES[rec.ask].word}에? → ${rec.placed[rec.ask].name}`;
    return el('div', { class: 'space-review' },
      spaceScene(rec.furniture, rec.placed, 'mini'),
      el('div', { class: 'review-note' }, q));
  },
};

/* ---------- 놀이: 길 따라 그리기 (소근육 · 눈과 손 협응) ---------- */
// 길 모양: 300×200 판 위의 꺾은선. 단계가 오를수록 굽은 곳이 많아짐
const traceCurve = (f) => range(0, 24).map((k) => [30 + k * 10, f(k / 24)]);
const TRACE_SHAPES = {
  straight: [[35, 100], [265, 100]],
  hill: traceCurve((t) => 140 - 80 * Math.sin(Math.PI * t)),
  wave: traceCurve((t) => 100 - 50 * Math.sin(2 * Math.PI * t)),
  zigzag: [[35, 55], [112, 150], [188, 55], [265, 150]],
  turn: [[45, 45], [255, 45], [255, 155], [45, 155]],
};
// 단계별 [앞 5문제, 뒤 5문제]에 나오는 길 모양
const TRACE_LEVELS = [
  [['straight'], ['straight', 'hill']],
  [['hill', 'wave'], ['wave', 'zigzag']],
  [['wave', 'zigzag'], ['zigzag', 'turn']],
];
// 단계별 길 폭 (넓을수록 쉬움)
const TRACE_ROAD = [56, 46, 38];
// [움직이는 친구, 도착할 곳]
const TRACE_PAIRS = [['🐛', '🍎'], ['🐝', '🌸'], ['🐰', '🥕'], ['🐶', '🎈'], ['🐸', '🍇']];

function tracePoints(shape, flip) {
  return TRACE_SHAPES[shape].map(([x, y]) => [flip & 1 ? 300 - x : x, flip & 2 ? 200 - y : y]);
}

// 꺾은선을 4칸 간격의 점으로 나눔 (손가락이 길 어디쯤 있는지 찾는 데 씀)
function traceSamples(pts, step = 4) {
  const out = [{ x: pts[0][0], y: pts[0][1] }];
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1];
    const [bx, by] = pts[k];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let j = 1; j <= n; j++) out.push({ x: ax + ((bx - ax) * j) / n, y: ay + ((by - ay) * j) / n });
  }
  return out;
}

const tracePos = (p) => `left:${(p.x / 300) * 100}%;top:${(p.y / 200) * 100}%`;

function traceBoard(rec, mini = false) {
  const d = `M${rec.points.map((p) => p.join(',')).join(' L')}`;
  const board = el('div', { class: `trace-board${mini ? ' mini' : ''}` });
  board.innerHTML = `<svg viewBox="0 0 300 200" aria-hidden="true">
    <path class="trace-edge" d="${d}" stroke-width="${rec.road + 6}"/>
    <path class="trace-road" d="${d}" stroke-width="${rec.road}"/>
    <path class="trace-mid" d="${d}"/>
    <polyline class="trace-trail" stroke-width="${rec.road * 0.42}" points=""/>
  </svg>`;
  const samples = traceSamples(rec.points);
  const goal = el('span', { class: 'trace-goal', style: tracePos(samples[samples.length - 1]) }, pic(rec.pair[1]));
  const mover = el('span', { class: 'trace-mover', style: tracePos(samples[0]) }, rec.pair[0]);
  board.append(goal, mover);
  return { board, samples, goal, mover, trail: board.querySelector('.trace-trail') };
}

const traceGame = {
  id: 'trace',
  title: '길 따라 그리기',
  desc: '친구를 끌어서 길을 따라가요',
  skill: '소근육 · 눈과 손 협응',
  icon: '🐛',
  color: '#dcefd2',

  round(i, ctx) {
    const shape = pick(TRACE_LEVELS[ctx.level][i < 5 ? 0 : 1]);
    const flip = rand(4);
    const pair = pick(TRACE_PAIRS);
    const road = TRACE_ROAD[ctx.level];
    const rec = { shape, flip, pair, road, points: tracePoints(shape, flip), done: false };
    const { board, samples, goal, mover, trail } = traceBoard(rec);
    let at = 0; // 친구가 지금까지 간 곳 (samples 번호)
    let dragging = false;
    mover.classList.add('wiggle');

    ctx.stage.append(
      prompt('길을 따라 끌어 가요'),
      board,
      el('div', { class: 'draw-tip' }, '손가락으로 꾹 누르고 천천히 끌어요'),
    );

    const toBoard = (e) => {
      const r = board.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * 300, ((e.clientY - r.top) / r.height) * 200];
    };

    function move(x, y) {
      // 지금 위치 근처의 길에서만 찾음 (길이 굽어 가까이 붙은 곳으로 건너뛰지 않게)
      let best = -1;
      let bestDist = Infinity;
      for (let k = Math.max(0, at - 10); k <= Math.min(samples.length - 1, at + 15); k++) {
        const dist = Math.hypot(samples[k].x - x, samples[k].y - y);
        if (dist < bestDist) { bestDist = dist; best = k; }
      }
      if (bestDist > road / 2 + 18) {
        // 길을 벗어나면 친구는 그 자리에 멈추고, 다시 친구를 잡아서 가면 됨
        stop();
        mover.classList.add('wiggle');
        ctx.miss('길을 따라 천천히 가 봐요');
        return;
      }
      if (best <= at) return;
      at = best;
      mover.setAttribute('style', tracePos(samples[at]));
      trail.setAttribute('points', samples.slice(0, at + 1).map((p) => `${p.x},${p.y}`).join(' '));
      if (at >= samples.length - 3) {
        stop();
        rec.done = true;
        mover.setAttribute('style', tracePos(samples[samples.length - 1]));
        goal.classList.add('pop', 'reached');
        ctx.finish(true);
      }
    }

    function stop() {
      dragging = false;
      mover.classList.remove('held');
    }

    board.addEventListener('pointerdown', (e) => {
      if (rec.done) return;
      const [x, y] = toBoard(e);
      if (Math.hypot(samples[at].x - x, samples[at].y - y) > Math.max(45, road)) return;
      e.preventDefault();
      board.setPointerCapture(e.pointerId);
      dragging = true;
      mover.classList.remove('wiggle');
      mover.classList.add('held');
      tone([600], 0.05);
    });
    board.addEventListener('pointermove', (e) => dragging && move(...toBoard(e)));
    board.addEventListener('pointerup', () => {
      if (!dragging) return;
      stop();
      mover.classList.add('wiggle');
    });
    board.addEventListener('pointercancel', stop);

    return rec;
  },

  review(rec) {
    const { board, samples, trail } = traceBoard(rec, true);
    if (rec.done) trail.setAttribute('points', samples.map((p) => `${p.x},${p.y}`).join(' '));
    return el('div', { class: 'review-center' },
      el('div', {}, board,
        el('div', { class: 'review-note' },
          !rec.done ? '끝까지 가지 못했어요' : rec.missed ? '길을 벗어났다가 다시 갔어요' : '길을 따라 끝까지 갔어요')));
  },
};

/* ---------- 놀이: 바구니에 쏙 (소근육 · 분류) ---------- */
// 색과 모양이 서로 확실히 다른 사진만
const SORT_ITEMS = ['🍎', '🍌', '🐸', '🐳', '🍇', '🥕', '🚗', '🎈'];
// 단계별 바구니 수
const SORT_BASKETS = [2, 2, 3];
// 단계별 [앞 5문제, 뒤 5문제] 옮길 그림 수
const SORT_COUNTS = [[3, 4], [4, 5], [5, 6]];
const SORT_TILE = 'clamp(calc(70px * var(--k)), 22vw, calc(92px * var(--k)))';

/* ---------- 바구니에 끌어 넣기 (바구니에 쏙 · 같은 무리끼리 모으기가 같이 씀) ---------- */
// baskets: [{ key, label }], keyOf(그림) === 바구니 key 이면 맞는 바구니
function dragSortRound(ctx, { say, items, baskets, keyOf, render, rec }) {
  Object.assign(rec, { items, misses: 0, done: false });
  let selected = null;
  let drag = null;
  let placed = 0;

  const pieces = items.map((it) => el('button', { class: 'tile sort-piece', 'aria-label': '그림' }, render(it)));
  const boxes = baskets.map((b) => el('button', { class: 'basket', 'aria-label': '바구니' },
    el('div', { class: 'basket-label' }, b.label),
    el('div', { class: 'basket-in' })));

  ctx.stage.append(
    prompt(say),
    el('div', { class: 'sort-pieces', style: `--t:${SORT_TILE}` }, pieces),
    el('div', { class: 'draw-tip sort-tip' }, '👇 그림을 끌어서 바구니에 쏙!'),
    el('div', { class: 'baskets', style: `grid-template-columns:repeat(${baskets.length},1fr)` }, boxes),
  );

  const hit = (node, e) => {
    const r = node.getBoundingClientRect();
    return e.clientX >= r.left - 10 && e.clientX <= r.right + 10 && e.clientY >= r.top - 10 && e.clientY <= r.bottom + 10;
  };

  function select(k) {
    selected = selected === k ? null : k;
    pieces.forEach((p, j) => p.classList.toggle('sel', j === selected));
  }

  function drop(k, b) {
    selected = null;
    pieces.forEach((p) => p.classList.remove('sel'));
    if (keyOf(items[k]) !== baskets[b].key) {
      // 맞는 바구니를 반짝여 알려주고 다시 옮기게 함
      rec.misses++;
      boxes.forEach((bn, j) => bn.classList.toggle('hint', baskets[j].key === keyOf(items[k])));
      ctx.miss('반짝이는 바구니에 넣어 볼까요?');
      return;
    }
    pieces[k].classList.add('used');
    boxes.forEach((bn) => bn.classList.remove('hint'));
    boxes[b].querySelector('.basket-in').append(el('span', { class: 'basket-got pop' }, render(items[k])));
    tone([520 + placed * 70], 0.07);
    if (++placed === items.length) {
      rec.done = true;
      ctx.finish(true);
    }
  }

  pieces.forEach((p, k) => {
    const reset = () => {
      drag = null;
      p.classList.remove('dragging');
      p.style.transform = '';
      boxes.forEach((b) => b.classList.remove('over'));
    };
    p.addEventListener('pointerdown', (e) => {
      if (p.classList.contains('used') || rec.done) return;
      e.preventDefault();
      p.setPointerCapture(e.pointerId);
      drag = { k, x0: e.clientX, y0: e.clientY, moved: false };
      p.classList.add('dragging');
      tone([600], 0.04);
    });
    p.addEventListener('pointermove', (e) => {
      if (drag?.k !== k) return;
      const dx = e.clientX - drag.x0;
      const dy = e.clientY - drag.y0;
      if (Math.hypot(dx, dy) > 8) drag.moved = true;
      p.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`;
      boxes.forEach((b) => b.classList.toggle('over', hit(b, e)));
    });
    p.addEventListener('pointerup', (e) => {
      if (drag?.k !== k) return;
      const { moved } = drag;
      reset();
      // 끌지 않고 톡 누르면 고르기만 하고, 바구니를 눌러서 넣을 수도 있음
      if (!moved) { select(k); return; }
      const b = boxes.findIndex((bn) => hit(bn, e));
      if (b >= 0) drop(k, b);
    });
    p.addEventListener('pointercancel', reset);
  });
  boxes.forEach((b, j) => b.addEventListener('click', () => selected != null && drop(selected, j)));

  return rec;
}

const sortGame = {
  id: 'sort',
  title: '바구니에 쏙',
  desc: '같은 그림 바구니에 옮겨요',
  skill: '소근육 · 분류',
  icon: '🧺',
  color: '#f6e2c4',

  round(i, ctx) {
    const kinds = sample(SORT_ITEMS, SORT_BASKETS[ctx.level]);
    const n = SORT_COUNTS[ctx.level][i < 5 ? 0 : 1];
    const items = shuffle([...kinds, ...range(1, n - kinds.length).map(() => pick(kinds))]);
    return dragSortRound(ctx, {
      say: '같은 그림 바구니에 넣어요',
      items,
      baskets: kinds.map((kd) => ({ key: kd, label: pic(kd) })),
      keyOf: (it) => it,
      render: pic,
      rec: { kinds },
    });
  },

  review(rec) {
    const note = !rec.done ? '끝까지 하지 못했어요'
      : rec.misses === 0 ? '한 번도 안 틀리고 다 넣었어요'
      : `${rec.misses}번 틀리고 다 넣었어요`;
    return el('div', {},
      el('div', { class: 'review-items' }, rec.items.map((it) => pic(it))),
      el('div', { class: 'review-note' }, note),
    );
  },

  badge(rec) {
    if (rec.passed) return null;
    return rec.correct ? ['good', '잘 넣었어요'] : ['pass', '완성'];
  },
};

/* ---------- 게임 놀이: 풍선 터뜨리기 ---------- */
// 색이 서로 확실히 다른 풍선만
const BALLOON_COLORS = [
  { name: '빨간', fill: '#ff6b6b' },
  { name: '노란', fill: '#ffd43b' },
  { name: '파란', fill: '#4dabf7' },
  { name: '초록', fill: '#51cf66' },
];
// 단계별 풍선 색 수, [앞 5문제, 뒤 5문제] 풍선 수
const BALLOON_KINDS = [1, 2, 3];
const BALLOON_COUNTS = [[4, 5], [5, 6], [6, 7]];

function balloonSvg(fill) {
  return `<svg viewBox="0 0 60 92" aria-hidden="true">
    <path d="M30 64 Q26 76 32 84 Q36 90 30 92" stroke="#b9ad9b" stroke-width="2" fill="none"/>
    <path d="M25 66 L35 66 L30 59 Z" fill="${fill}"/>
    <ellipse cx="30" cy="32" rx="26" ry="30" fill="${fill}"/>
    <ellipse cx="20" cy="20" rx="6" ry="10" fill="#fff" opacity=".45" transform="rotate(25 20 20)"/>
  </svg>`;
}

const balloonGame = {
  id: 'balloon',
  title: '풍선 터뜨리기',
  desc: '풍선을 톡톡 눌러 터뜨려요',
  skill: '집중력 · 색깔',
  icon: '🎈',
  color: '#fde2e2',

  round(i, ctx) {
    const n = BALLOON_COUNTS[ctx.level][i < 5 ? 0 : 1];
    const kinds = sample(BALLOON_COLORS, BALLOON_KINDS[ctx.level]);
    const target = kinds[0];
    // 쉬움: 모두 같은 색이라 다 터뜨리면 끝 / 보통 · 어려움: 정한 색만 (절반쯤)
    const targets = kinds.length === 1 ? n : Math.ceil(n / 2);
    const colors = shuffle([
      ...Array(targets).fill(target),
      ...range(1, n - targets).map((k) => kinds[1 + (k % (kinds.length - 1))]),
    ]);
    const rec = { color: target.name, single: kinds.length === 1, n, targets, done: false };
    let popped = 0;

    // 3칸 × 3줄 자리에 흩어 놓기 (조금씩 비뚤게)
    const slots = sample(range(0, 8), n);
    const balloons = colors.map((c, k) => {
      const s = slots[k];
      const node = el('button', {
        class: 'balloon',
        'aria-label': `${c.name} 풍선`,
        style: `left:${18 + (s % 3) * 32 + (Math.random() * 4 - 2)}%;top:${19 + Math.floor(s / 3) * 31 + (Math.random() * 4 - 2)}%;animation-delay:${(Math.random() * -2).toFixed(2)}s`,
        onclick: () => pop(k),
      });
      node.innerHTML = balloonSvg(c.fill);
      return node;
    });
    const say = rec.single ? '풍선을 모두 터뜨려요!' : `${target.name} 풍선을 터뜨려요!`;
    ctx.stage.append(prompt(say), el('div', { class: 'balloon-field' }, balloons));

    function pop(k) {
      const node = balloons[k];
      if (node.classList.contains('popped')) return;
      if (colors[k] !== target) {
        node.classList.remove('nope');
        void node.offsetWidth;
        node.classList.add('nope');
        balloons.forEach((b, j) => b.classList.toggle('hint', colors[j] === target && !b.classList.contains('popped')));
        ctx.miss(`${target.name} 풍선을 찾아요`);
        return;
      }
      node.classList.add('popped');
      node.classList.remove('hint');
      tone([880, 1320], 0.06);
      if (++popped === targets) {
        rec.done = true;
        ctx.later(() => ctx.finish(true), 350);
      }
    }

    return rec;
  },

  review(rec) {
    return el('div', { class: 'review-note' },
      rec.done ? (rec.single ? `풍선 ${rec.n}개를 다 터뜨렸어요` : `${rec.color} 풍선 ${rec.targets}개를 다 터뜨렸어요`) : '끝까지 하지 못했어요');
  },
};

/* ---------- 게임 놀이: 숨은 친구 잡기 ---------- */
// 서로 색과 모양이 확실히 다른 친구들
const MOLE_FRIENDS = [['🐰', '토끼'], ['🐻', '곰'], ['🐸', '개구리'], ['🐷', '돼지']];
// 단계별 구멍 수, 잡을 횟수, 나와 있는 시간(없으면 잡을 때까지 기다림), 다른 친구가 섞여 나올 확률
const MOLE_HOLES = [3, 4, 6];
const MOLE_NEED = [3, 4, 5];
const MOLE_STAY = [0, 2600, 2000];
const MOLE_DECOY = [0, 0, 0.35];

const moleGame = {
  id: 'mole',
  title: '숨은 친구 잡기',
  desc: '쏙 나온 친구를 톡 잡아요',
  skill: '집중력 · 반응',
  icon: '🐰',
  color: '#e3f0d6',

  round(i, ctx) {
    const [target, decoy] = sample(MOLE_FRIENDS, 2);
    const holesN = MOLE_HOLES[ctx.level];
    const need = MOLE_NEED[ctx.level];
    const rec = { target: target[0], decoy: decoy[0], holes: holesN, need, hits: 0, done: false };
    let up = null; // { hole, who }
    let turn = 0; // 지난 차례의 타이머가 새 차례를 건드리지 않게
    let last = -1;

    const holes = range(1, holesN).map((_, h) => el('button', { class: 'mole-hole', 'aria-label': '구멍', onclick: () => tap(h) },
      el('span', { class: 'mole-friend' })));
    const counter = el('div', { class: 'mole-count' });
    ctx.stage.append(
      prompt(MOLE_DECOY[ctx.level] ? `${target[1]}만 잡아요!` : `${target[1]}${objectParticle(target[1])} 잡아요!`),
      counter,
      el('div', { class: `mole-field holes-${holesN}` }, holes),
    );

    function draw() {
      counter.replaceChildren(...range(1, need).map((k) => el('span', { class: k <= rec.hits ? 'on' : '' }, k <= rec.hits ? '⭐' : '☆')));
    }

    function show() {
      const t = ++turn;
      let h;
      do h = rand(holesN);
      while (h === last && holesN > 1);
      last = h;
      const who = Math.random() < MOLE_DECOY[ctx.level] ? decoy[0] : target[0];
      up = { hole: h, who };
      const friend = holes[h].firstChild;
      friend.textContent = who;
      holes[h].classList.add('up');
      if (MOLE_STAY[ctx.level]) {
        ctx.later(() => {
          if (t !== turn) return;
          hide();
          ctx.later(() => t === turn && show(), 450);
        }, who === target[0] ? MOLE_STAY[ctx.level] : MOLE_STAY[ctx.level] * 0.8);
      }
    }

    function hide() {
      if (up) holes[up.hole].classList.remove('up', 'hit');
      up = null;
    }

    function tap(h) {
      if (!up || up.hole !== h || rec.done) return;
      const t = ++turn;
      if (up.who !== target[0]) {
        holes[h].classList.add('nope');
        ctx.later(() => holes[h].classList.remove('nope'), 400);
        ctx.miss(`${target[1]}만 잡아요`);
        hide();
        ctx.later(() => t === turn && show(), 700);
        return;
      }
      rec.hits++;
      holes[h].classList.add('hit');
      tone([700, 1000], 0.07);
      draw();
      if (rec.hits >= need) {
        rec.done = true;
        ctx.later(() => ctx.finish(true), 450);
        return;
      }
      ctx.later(() => {
        if (t !== turn) return;
        hide();
        ctx.later(() => t === turn && show(), 400);
      }, 350);
    }

    draw();
    ctx.later(show, 700);
    return rec;
  },

  review(rec) {
    return el('div', { class: 'review-note' },
      rec.done ? `${rec.target} ${rec.need}번 잡았어요` : `${rec.target} ${rec.hits}번 잡았어요`);
  },
};

/* ---------- 놀이: 몸 어디 있지? ---------- */
const BODY_PART_NAMES = { eye: '눈', nose: '코', mouth: '입', ear: '귀', hair: '머리카락', hand: '손', foot: '발', tummy: '배' };
// 단계별 그림(얼굴 · 온몸)과 물어보는 곳
const BODY_LEVELS = [
  { scene: 'face', parts: ['eye', 'nose', 'mouth'] },
  { scene: 'face', parts: ['eye', 'nose', 'mouth', 'ear', 'hair'] },
  { scene: 'body', parts: ['eye', 'mouth', 'hand', 'foot', 'tummy', 'hair'] },
];

// 얼굴 (200×200). 누르는 곳마다 눈에 보이는 그림보다 넉넉한 투명 영역을 둠
const FACE_SVG = `
  <g class="bp" data-part="ear"><circle cx="30" cy="108" r="19" fill="#f6d2b0"/><circle cx="170" cy="108" r="19" fill="#f6d2b0"/>
    <circle cx="30" cy="108" r="24" fill="transparent"/><circle cx="170" cy="108" r="24" fill="transparent"/></g>
  <circle cx="100" cy="110" r="72" fill="#fbe0c6"/>
  <g class="bp" data-part="hair"><path d="M26 102 Q26 30 100 30 Q174 30 174 102 Q156 60 100 62 Q44 60 26 102Z" fill="#6b4f35"/></g>
  <circle cx="62" cy="134" r="10" fill="#f6b5ac" opacity=".7"/><circle cx="138" cy="134" r="10" fill="#f6b5ac" opacity=".7"/>
  <g class="bp" data-part="eye"><ellipse cx="72" cy="104" rx="9" ry="11" fill="#3b3226"/><ellipse cx="128" cy="104" rx="9" ry="11" fill="#3b3226"/>
    <circle cx="75" cy="100" r="3" fill="#fff"/><circle cx="131" cy="100" r="3" fill="#fff"/>
    <circle cx="72" cy="104" r="21" fill="transparent"/><circle cx="128" cy="104" r="21" fill="transparent"/></g>
  <g class="bp" data-part="nose"><ellipse cx="100" cy="128" rx="9" ry="7" fill="#e8a98a"/><circle cx="100" cy="127" r="15" fill="transparent"/></g>
  <g class="bp" data-part="mouth"><path d="M78 148 Q100 172 122 148" stroke="#d0574f" stroke-width="7" stroke-linecap="round" fill="none"/>
    <rect x="70" y="142" width="60" height="32" fill="transparent"/></g>`;

const BODY_SCENES = {
  face: { viewBox: '0 0 200 200', svg: FACE_SVG },
  body: {
    viewBox: '0 0 200 330',
    // 팔(소매 → 맨팔) 끝에 손이 붙고, 목 · 티셔츠 · 반바지 · 다리 · 신발이 이어지게
    svg: `
      <path d="M70 132 L54 160" stroke="#8fc1e8" stroke-width="24" stroke-linecap="round"/>
      <path d="M130 132 L146 160" stroke="#8fc1e8" stroke-width="24" stroke-linecap="round"/>
      <path d="M55 158 L40 194" stroke="#fbe0c6" stroke-width="16" stroke-linecap="round"/>
      <path d="M145 158 L160 194" stroke="#fbe0c6" stroke-width="16" stroke-linecap="round"/>
      <g class="bp" data-part="hand">
        <circle cx="37" cy="201" r="13" fill="#fbe0c6"/><circle cx="163" cy="201" r="13" fill="#fbe0c6"/>
        <ellipse cx="47" cy="196" rx="5" ry="4" fill="#fbe0c6" transform="rotate(-30 47 196)"/>
        <ellipse cx="153" cy="196" rx="5" ry="4" fill="#fbe0c6" transform="rotate(30 153 196)"/>
        <circle cx="37" cy="201" r="24" fill="transparent"/><circle cx="163" cy="201" r="24" fill="transparent"/></g>
      <rect x="90" y="104" width="20" height="22" rx="6" fill="#f3cfae"/>
      <rect x="77" y="228" width="18" height="50" rx="8" fill="#fbe0c6"/>
      <rect x="105" y="228" width="18" height="50" rx="8" fill="#fbe0c6"/>
      <path d="M66 200 H134 V236 Q134 240 130 240 H104 L100 222 L96 240 H70 Q66 240 66 236Z" fill="#6c8fb3"/>
      <g class="bp" data-part="tummy">
        <path d="M70 120 Q100 112 130 120 Q140 124 140 136 V206 Q140 214 132 214 H68 Q60 214 60 206 V136 Q60 124 70 120Z" fill="#8fc1e8"/>
        <path d="M88 119 Q100 130 112 119" stroke="#6fa6d6" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M100 176 l-9 -9 a6 6 0 0 1 9 -8 a6 6 0 0 1 9 8z" fill="#f7a8b8"/></g>
      <g class="bp" data-part="foot">
        <path d="M60 286 Q60 274 74 274 H92 Q96 274 96 280 V290 Q96 294 90 294 H66 Q60 294 60 286Z" fill="#e07a5f"/>
        <path d="M140 286 Q140 274 126 274 H108 Q104 274 104 280 V290 Q104 294 110 294 H134 Q140 294 140 286Z" fill="#e07a5f"/>
        <rect x="48" y="264" width="104" height="42" fill="transparent"/></g>
      <g transform="translate(40 -4) scale(.6)">${FACE_SVG}</g>`,
  },
};

function bodyScene(scene, extra = {}) {
  const node = el('div', { class: `body-scene ${scene}${extra.mini ? ' mini' : ''}` });
  node.innerHTML = `<svg viewBox="${BODY_SCENES[scene].viewBox}" role="img" aria-label="사람 그림">${BODY_SCENES[scene].svg}</svg>`;
  if (extra.mark) node.querySelector(`[data-part="${extra.mark}"]`)?.classList.add('good');
  return node;
}

const bodyGame = {
  id: 'body',
  title: '몸 어디 있지?',
  desc: '눈, 코, 입은 어디 있을까요?',
  skill: '말 이해 · 신체 개념',
  icon: '👀',
  color: '#fbe0c6',

  round(i, ctx) {
    const { scene, parts } = BODY_LEVELS[ctx.level];
    const part = pick(parts);
    const name = BODY_PART_NAMES[part];
    const rec = { scene, part, chosen: null };
    const board = bodyScene(scene);

    ctx.stage.append(prompt(`${topicParticle(name)} 어디 있어요?`), board);

    board.addEventListener('click', (e) => {
      const g = e.target.closest('.bp');
      if (!g || rec.chosen) return;
      const target = board.querySelector(`[data-part="${part}"]`);
      if (g.dataset.part !== part) {
        g.classList.remove('bad');
        void g.getBoundingClientRect();
        g.classList.add('bad');
        target.classList.add('hint');
        ctx.miss(`반짝이는 곳이 ${name}${topicParticle(name).endsWith('은') ? '이에요' : '예요'}`);
        return;
      }
      rec.chosen = part;
      target.classList.remove('hint');
      target.classList.add('good');
      ctx.finish(true);
    });

    return rec;
  },

  review(rec) {
    const name = BODY_PART_NAMES[rec.part];
    return el('div', { class: 'review-center' },
      el('div', {}, bodyScene(rec.scene, { mini: true, mark: rec.part }),
        el('div', { class: 'review-note' }, rec.chosen ? `${name}${objectParticle(name)} 찾았어요` : `${topicParticle(name)} 여기 있어요`)));
  },
};

/* ---------- 놀이: 큰 것, 작은 것 ---------- */
// 크기만 보고 고르도록 배경 없는 그림 글자로 (사진은 작게 줄이면 알아보기 어려움)
const SIZE_ITEMS = ['🍎', '🎈', '🐘', '🚗', '🐳', '🐸', '🍌', '🦋'];
const SIZE_TILE = { 2: 'clamp(130px, 40vw, calc(180px * var(--k)))', 3: 'clamp(96px, 28vw, calc(140px * var(--k)))' };
// 단계별 [앞 5문제, 뒤 5문제] 크기 비율 (크기 차이가 한눈에 보이게)
const SIZE_SCALES = [
  [[1, 0.45], [1, 0.5]],
  [[1, 0.5], [1, 0.7, 0.42]],
  [[1, 0.7, 0.42], [1, 0.74, 0.5]],
];

function sizeTile(item, scale, props = {}) {
  return el('div', { class: 'tile size-tile', ...props },
    el('span', { class: 'size-face', style: `transform:scale(${scale})` }, item));
}

const sizeGame = {
  id: 'size',
  title: '큰 것, 작은 것',
  desc: '큰 것과 작은 것을 골라요',
  skill: '크기 개념',
  icon: '🐘',
  color: '#e0e6f5',

  round(i, ctx) {
    const scales = shuffle(SIZE_SCALES[ctx.level][i < 5 ? 0 : 1]);
    const item = pick(SIZE_ITEMS);
    const ask = rand(2) ? 'big' : 'small';
    const answer = scales.indexOf(ask === 'big' ? Math.max(...scales) : Math.min(...scales));
    const rec = { item, scales, ask, answer, chosen: null };
    const word = scales.length === 2 ? (ask === 'big' ? '큰 것' : '작은 것') : (ask === 'big' ? '가장 큰 것' : '가장 작은 것');

    const buttons = scales.map((sc, k) => el('button', { class: 'tile choice size-tile', 'aria-label': `${k + 1}번`, onclick: () => choose(k) },
      el('span', { class: 'size-face', style: `transform:scale(${sc})` }, item)));
    ctx.stage.append(prompt(`${word}을 골라요`), choiceLabel(scales.length),
      el('div', { class: 'choices', style: `--choice-t:${SIZE_TILE[scales.length]}` }, buttons));

    function choose(k) {
      if (k !== answer) {
        retryChoice(ctx, buttons[k], buttons[answer]);
        return;
      }
      rec.chosen = k;
      buttons[k].classList.add('good');
      ctx.finish(true);
    }

    return rec;
  },

  review(rec) {
    return el('div', {},
      el('div', { class: 'size-review' }, rec.scales.map((sc, k) =>
        sizeTile(rec.item, sc, { class: `tile size-tile${k === rec.answer ? ' good' : ''}`, style: '--t:56px' }))),
      el('div', { class: 'review-note' }, rec.ask === 'big' ? '큰 것 고르기' : '작은 것 고르기'));
  },
};

/* ---------- 놀이: 조각 퍼즐 ---------- */
const PUZZLE_PHOTOS = ['🍎', '🎈', '🐘', '🚗', '🐳', '🐸', '🦋', '🐥', '🐶'];
// 단계별 [앞 5문제, 뒤 5문제] [가로 조각 수, 세로 조각 수]
const PUZZLE_GRIDS = [
  [[2, 1], [2, 1]],
  [[2, 1], [2, 2]],
  [[2, 2], [3, 2]],
];
const PUZZLE_SIZE = 'clamp(200px, min(66vw, 38vh), calc(320px * var(--k)))';

function puzzlePiece(src, cols, rows, n) {
  const c = n % cols;
  const r = Math.floor(n / cols);
  return el('span', {
    class: 'puzzle-img',
    style: `background-image:url(${src});background-size:${cols * 100}% ${rows * 100}%;background-position:${cols > 1 ? (c / (cols - 1)) * 100 : 0}% ${rows > 1 ? (r / (rows - 1)) * 100 : 0}%`,
  });
}

const puzzleGame = {
  id: 'puzzle',
  title: '조각 퍼즐',
  desc: '조각을 옮겨 그림을 완성해요',
  skill: '공간 지각 · 소근육',
  icon: '🧩',
  color: '#f9e3c9',

  round(i, ctx) {
    const [cols, rows] = PUZZLE_GRIDS[ctx.level][i < 5 ? 0 : 1];
    const photo = pick(PUZZLE_PHOTOS);
    const src = `photos/${PHOTOS[photo]}.jpg`;
    const count = cols * rows;
    const rec = { photo, cols, rows, misses: 0, done: false };
    let order;
    do order = shuffle(range(0, count - 1));
    while (count > 1 && order.every((v, k) => v === k));
    let selected = null;
    let drag = null;
    let placed = 0;

    const slots = range(0, count - 1).map((n) => el('button', { class: 'puzzle-slot', 'aria-label': `${n + 1}번 자리`, onclick: () => selected != null && drop(selected, n) }));
    const board = el('div', {
      class: `puzzle-board${ctx.level < 2 ? ' guide' : ''}`,
      style: `--p:${PUZZLE_SIZE};grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);--guide:url(${src})`,
    }, slots);
    const pieces = order.map((n) => el('button', {
      class: 'puzzle-piece',
      'aria-label': '퍼즐 조각',
      style: `width:calc(var(--p) / ${cols});height:calc(var(--p) / ${rows})`,
    }, puzzlePiece(src, cols, rows, n)));

    ctx.stage.append(
      prompt('조각을 옮겨 그림을 완성해요'),
      board,
      el('div', { class: 'puzzle-pieces', style: `--p:calc(${PUZZLE_SIZE} * .8)` }, pieces),
    );

    const hit = (node, e) => {
      const r = node.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    };

    function select(k) {
      selected = selected === k ? null : k;
      pieces.forEach((p, j) => p.classList.toggle('sel', j === selected));
    }

    function drop(k, slot) {
      selected = null;
      pieces.forEach((p) => p.classList.remove('sel'));
      if (order[k] !== slot) {
        rec.misses++;
        slots.forEach((s, j) => s.classList.toggle('hint', j === order[k]));
        ctx.miss('반짝이는 자리에 놓아 볼까요?');
        return;
      }
      pieces[k].classList.add('used');
      slots.forEach((s) => s.classList.remove('hint'));
      slots[slot].replaceChildren(puzzlePiece(src, cols, rows, slot));
      slots[slot].classList.add('filled', 'pop');
      tone([520 + placed * 80], 0.07);
      if (++placed === count) {
        rec.done = true;
        board.classList.add('complete');
        ctx.later(() => ctx.finish(true), 500);
      }
    }

    pieces.forEach((p, k) => {
      const reset = () => {
        drag = null;
        p.classList.remove('dragging');
        p.style.transform = '';
        slots.forEach((s) => s.classList.remove('over'));
      };
      p.addEventListener('pointerdown', (e) => {
        if (p.classList.contains('used') || rec.done) return;
        e.preventDefault();
        p.setPointerCapture(e.pointerId);
        drag = { k, x0: e.clientX, y0: e.clientY, moved: false };
        p.classList.add('dragging');
      });
      p.addEventListener('pointermove', (e) => {
        if (drag?.k !== k) return;
        const dx = e.clientX - drag.x0;
        const dy = e.clientY - drag.y0;
        if (Math.hypot(dx, dy) > 8) drag.moved = true;
        p.style.transform = `translate(${dx}px, ${dy}px)`;
        slots.forEach((s) => s.classList.toggle('over', !s.classList.contains('filled') && hit(s, e)));
      });
      p.addEventListener('pointerup', (e) => {
        if (drag?.k !== k) return;
        const { moved } = drag;
        reset();
        // 끌지 않고 톡 누르면 고르기만 하고, 자리를 눌러서 놓을 수도 있음
        if (!moved) { select(k); return; }
        const s = slots.findIndex((sn) => !sn.classList.contains('filled') && hit(sn, e));
        if (s >= 0) drop(k, s);
      });
      p.addEventListener('pointercancel', reset);
    });

    return rec;
  },

  review(rec) {
    const note = !rec.done ? '끝까지 하지 못했어요'
      : rec.misses === 0 ? '한 번도 안 틀리고 완성했어요'
      : `${rec.misses}번 틀리고 완성했어요`;
    return el('div', {},
      el('div', { class: 'review-items' }, pic(rec.photo), el('span', {}, ` ${rec.cols * rec.rows}조각`)),
      el('div', { class: 'review-note' }, note));
  },

  badge(rec) {
    if (rec.passed) return null;
    return rec.correct ? ['good', '완성'] : ['pass', '완성'];
  },
};

/* ---------- 놀이: 무엇에 쓰는 걸까? (기능 · 종류로 고르기) ---------- */
// 그림마다 해당하는 쓰임 (비행기처럼 두 가지에 다 맞는 것은 다른 문제의 보기로 나오지 않게)
const USE_ITEMS = {
  '🍎': ['eat'], '🍌': ['eat'], '🍇': ['eat'], '🥕': ['eat'], '🍉': ['eat'], '🍪': ['eat'],
  '🚗': ['ride'], '🚌': ['ride'], '🚲': ['ride'], '⛵': ['ride'], '🚂': ['ride'], '✈️': ['ride', 'fly'],
  '👕': ['wear'], '👗': ['wear'], '👖': ['wear'], '🧥': ['wear'],
  '🦋': ['fly'], '🐝': ['fly'], '🐦': ['fly'], '🎈': ['fly'],
  '🪥': ['wash'], '🧼': ['wash'], '🛁': ['wash'],
};
const USE_ASKS = [
  { id: 'eat', say: '먹는 것을 골라요' },
  { id: 'ride', say: '타는 것을 골라요' },
  { id: 'wear', say: '입는 것을 골라요' },
  { id: 'fly', say: '하늘을 나는 것을 골라요' },
  { id: 'wash', say: '씻을 때 쓰는 것을 골라요' },
];
// 단계별 [앞 5문제, 뒤 5문제] 보기 개수, 나오는 쓰임
const USE_CHOICES = [[2, 2], [2, 3], [3, 4]];
const USE_LEVEL_ASKS = [['eat', 'ride', 'wear'], ['eat', 'ride', 'wear', 'fly'], ['eat', 'ride', 'wear', 'fly', 'wash']];

const useGame = {
  id: 'use',
  title: '무엇에 쓰는 걸까?',
  desc: '먹는 것, 타는 것을 골라요',
  skill: '말 이해 · 생각하기',
  icon: '🍽️',
  color: '#fde7d2',

  round(i, ctx) {
    const ask = pick(USE_ASKS.filter((a) => USE_LEVEL_ASKS[ctx.level].includes(a.id)));
    const items = Object.keys(USE_ITEMS);
    const answer = pick(items.filter((e) => USE_ITEMS[e].includes(ask.id)));
    const count = USE_CHOICES[ctx.level][i < 5 ? 0 : 1];
    // 보기는 서로 다른 쓰임에서 하나씩 (같은 쓰임 그림이 두 개면 헷갈림)
    const otherAsks = shuffle(USE_LEVEL_ASKS[ctx.level].filter((a) => a !== ask.id));
    const wrongs = otherAsks.slice(0, count - 1).map((a) => pick(items.filter((e) => USE_ITEMS[e].includes(a) && !USE_ITEMS[e].includes(ask.id))));
    while (wrongs.length < count - 1) {
      wrongs.push(pick(items.filter((e) => !USE_ITEMS[e].includes(ask.id) && !wrongs.includes(e))));
    }
    const choices = shuffle([answer, ...wrongs]);
    const rec = { ask: ask.id, say: ask.say, answer, choices, chosen: null };
    const render = photoRenderer(choices);

    const buttons = choices.map((c) => el('button', { class: 'tile choice', 'aria-label': c, onclick: () => choose(c) }, render(c)));
    ctx.stage.append(prompt(ask.say), choiceLabel(choices.length),
      el('div', { class: 'choices', style: choicesStyle(choices.length) }, buttons));

    function choose(c) {
      const btn = buttons[choices.indexOf(c)];
      if (c !== answer) {
        retryChoice(ctx, btn, buttons[choices.indexOf(answer)]);
        return;
      }
      rec.chosen = c;
      btn.classList.add('good');
      ctx.finish(true);
    }

    return rec;
  },

  review(rec) {
    return el('div', {},
      el('div', { class: 'review-items' }, rec.choices.map((c) =>
        el('span', { class: c === rec.answer ? 'use-answer' : '' }, photoRenderer(rec.choices)(c)))),
      el('div', { class: 'review-note' }, `${rec.say.replace('을 골라요', '')}: ${rec.answer}`));
  },
};

/* ---------- 놀이: 쑥쑥이 따라 하기 (동작 모방) ---------- */
// 쑥쑥이가 보여 주는 동작을 아이가 따라 하면 보호자가 '했어요'를 누름
const IMITATE_ACTIONS = [
  { icon: '👏', say: '박수 짝짝', anim: 'clap' },
  { icon: '👋', say: '손 흔들기', anim: 'wave' },
  { icon: '🙌', say: '만세', anim: 'up' },
  { icon: '🙆', say: '머리에 손 올리기', anim: 'bob' },
  { icon: '🦶', say: '발 쿵쿵', anim: 'stomp' },
  { icon: '👃', say: '코 콕', anim: 'poke' },
  { icon: '😝', say: '메롱', anim: 'bob' },
  { icon: '🫶', say: '하트 만들기', anim: 'beat' },
];
// 단계별 한 번에 보여 주는 동작 수
const IMITATE_STEPS = [1, 1, 2];

const imitateGame = {
  id: 'imitate',
  title: '쑥쑥이 따라 하기',
  desc: '쑥쑥이처럼 몸으로 따라 해요',
  skill: '모방 · 몸 놀이',
  icon: '👏',
  color: '#e2f1fb',

  round(i, ctx) {
    const acts = sample(IMITATE_ACTIONS, IMITATE_STEPS[ctx.level]);
    const say = acts.length === 1 ? `${acts[0].say}! 따라 해 봐요` : `${acts[0].say} 하고, ${acts[1].say}! 따라 해 봐요`;
    const rec = { acts: acts.map((a) => a.icon), say, done: false };
    let k = 0;

    const show = el('div', { class: 'imitate-show' });
    function play() {
      // 동작이 두 개면 차례로 보여 줌
      const a = acts[k % acts.length];
      show.replaceChildren(
        el('div', { class: 'imitate-mascot' }, mascot('happy', 'bounce')),
        el('div', { class: `imitate-act anim-${a.anim}` }, a.icon),
        el('div', { class: 'imitate-name' }, acts.map((x, j) => el('span', { class: x === a ? 'on' : '' }, x.say)).flatMap((n, j) => (j ? [' → ', n] : [n]))));
      if (acts.length > 1 && ++k < acts.length) ctx.later(play, 1800);
    }
    play();

    ctx.stage.append(
      prompt(say),
      show,
      el('div', { class: 'imitate-tip' }, '👪 아이가 따라 하면 [했어요]를 눌러 주세요'),
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn-main alt', onclick: () => { k = 0; play(); speak(say); } }, '🔁 다시 보기'),
        el('button', { class: 'btn-main', onclick: () => { rec.done = true; ctx.finish(true); } }, '✅ 했어요!')),
    );

    return rec;
  },

  review(rec) {
    return el('div', {},
      el('div', { class: 'review-items' }, rec.acts.join(' ')),
      el('div', { class: 'review-note' }, rec.say.replace('! 따라 해 봐요', '')));
  },
};

/* ---------- 놀이: 두 단계 지시 따르기 ---------- */
// 단계별 그림 수, 차례로 누를 수
const STEPS_PICS = [4, 6, 6];
const STEPS_COUNT = [2, 2, 3];

const stepsGame = {
  id: 'steps',
  title: '차례대로 눌러요',
  desc: '말을 듣고 순서대로 눌러요',
  skill: '듣기 · 기억',
  icon: '👆',
  color: '#e6e0f7',

  round(i, ctx) {
    const words = sample(LISTEN_WORDS, STEPS_PICS[ctx.level]);
    const seq = words.slice(0, STEPS_COUNT[ctx.level]);
    const shown = shuffle(words);
    const say = `${seq.map(([w]) => `${w}${objectParticle(w)}`).join(' 누르고, ')} 눌러요`;
    const rec = { seq: seq.map(([, e]) => e), words: seq.map(([w]) => w), say, done: false };
    const render = photoRenderer(shown.map(([, e]) => e));
    let at = 0;

    const buttons = shown.map(([w, e]) => el('button', { class: 'tile choice steps-tile', 'aria-label': w, onclick: () => tap(e) },
      render(e), el('span', { class: 'steps-num' })));
    ctx.stage.append(prompt(say),
      el('div', { class: 'choices', style: choicesStyle(shown.length > 4 ? 3 : 2) }, buttons));

    function tap(e) {
      const k = shown.findIndex(([, x]) => x === e);
      if (buttons[k].classList.contains('done')) return;
      if (e !== rec.seq[at]) {
        buttons.forEach((b) => b.classList.remove('hint'));
        buttons[shown.findIndex(([, x]) => x === rec.seq[at])].classList.add('hint');
        ctx.miss(`${rec.words[at]}${objectParticle(rec.words[at])} 먼저 눌러요`);
        return;
      }
      buttons.forEach((b) => b.classList.remove('hint'));
      buttons[k].classList.add('done', 'good');
      buttons[k].querySelector('.steps-num').textContent = String(at + 1);
      tone([600 + at * 120], 0.07);
      if (++at === rec.seq.length) {
        rec.done = true;
        ctx.finish(true);
      }
    }

    return rec;
  },

  review(rec) {
    return el('div', {},
      el('div', { class: 'review-items' }, rec.seq.map((e, k) => el('span', {}, `${k + 1}`, pic(e)))),
      el('div', { class: 'review-note' }, rec.say));
  },
};

/* ---------- 듣고 고르는 놀이의 공통 진행 ---------- */
// 보기 개수별 보기 크기 (그림 하나만 보고 고르므로 크게)
const BIG_CHOICE = {
  2: 'clamp(124px, 38vw, calc(170px * var(--k)))',
  3: 'clamp(96px, 28vw, calc(140px * var(--k)))',
  4: 'clamp(86px, 21vw, calc(124px * var(--k)))',
};
// 보기 중 정답 하나를 고르고, 틀리면 정답이 반짝여 다시 고르게 함
// wide: 문장이 긴 보기는 가로로 긴 줄 모양으로
function choiceRound(ctx, { say, choices, answer, render = String, top = null, rec = {}, wide = false }) {
  Object.assign(rec, { say, choices, answer, chosen: null });
  const ans = choices.indexOf(answer);
  const buttons = choices.map((c, k) => el('button', { class: `tile choice${wide ? ' wide-choice' : ''}`, 'aria-label': `${k + 1}번 보기`, onclick: () => choose(k) }, render(c)));
  ctx.stage.append(...[prompt(say), top, choiceLabel(choices.length),
    el('div', { class: `choices${wide ? ' wide-choices' : ''}`, style: `--choice-t:${BIG_CHOICE[choices.length] ?? BIG_CHOICE[4]}` }, buttons)].filter(Boolean));

  function choose(k) {
    if (k !== ans) {
      retryChoice(ctx, buttons[k], buttons[ans]);
      return;
    }
    rec.chosen = k;
    buttons[k].classList.add('good');
    ctx.finish(true);
  }
  return rec;
}

// 결과 화면: 보기를 늘어놓고 정답에 표시
function choiceReview(rec, render = String) {
  return el('div', {},
    el('div', { class: 'review-items choice-review' }, rec.choices.map((c) =>
      el('span', { class: c === rec.answer ? 'use-answer' : '' }, render(c)))),
    el('div', { class: 'review-note' }, rec.say));
}

// 단계별 [앞 5문제, 뒤 5문제] 보기 개수 (여러 놀이가 같이 씀)
const BASIC_CHOICES = [[2, 2], [2, 3], [3, 4]];
const basicChoiceCount = (ctx, i) => BASIC_CHOICES[ctx.level][i < 5 ? 0 : 1];

/* ---------- 놀이: 소리 듣고 찾기 ---------- */
// 어려움에서는 동물 말고 탈것 · 물건 소리도 나옴
const SOUND_ITEMS = [
  ['🐶', '멍멍', 0], ['🐱', '야옹', 0], ['🐮', '음매', 0], ['🐷', '꿀꿀', 0], ['🐸', '개굴개굴', 0],
  ['🐔', '꼬끼오', 0], ['🦆', '꽥꽥', 1], ['🐑', '메에', 1], ['🐝', '윙윙', 1],
  ['🚗', '빵빵', 2], ['🚂', '칙칙폭폭', 2], ['🚒', '삐뽀삐뽀', 2], ['🔔', '딩동', 2], ['⏰', '따르릉', 2],
];

const soundGame = {
  id: 'sound',
  title: '소리 듣고 찾기',
  desc: '멍멍! 누구 소리일까요?',
  skill: '듣고 구분하기',
  icon: '🐶',
  color: '#fbe8d0',

  round(i, ctx) {
    const pool = SOUND_ITEMS.filter(([, , lv]) => lv <= ctx.level);
    const picks = sample(pool, basicChoiceCount(ctx, i));
    const [answer, sound] = picks[0];
    const rec = choiceRound(ctx, {
      say: `"${sound}" 소리는 누구일까요?`,
      choices: shuffle(picks.map(([e]) => e)),
      answer,
      top: el('button', { class: 'sound-play', onclick: () => speak(`${sound}! ${sound}!`) }, '🔊 ', el('b', {}, sound)),
    });
    ctx.later(() => speak(`${sound}! ${sound}!`), 1600);
    return rec;
  },

  review: (rec) => choiceReview(rec),
};

/* ---------- 놀이: 무엇을 하고 있나요? (동작 이해) ---------- */
const VERB_ITEMS = [
  ['🛌', '자는'], ['🏃', '달리는'], ['😭', '우는'], ['🛀', '목욕하는'], ['🏊', '수영하는'],
  ['🚴', '자전거 타는'], ['💃', '춤추는'], ['🧗', '올라가는'], ['😂', '웃는'], ['🙋', '손 드는'],
];

const verbGame = {
  id: 'verb',
  title: '무엇을 하고 있나요?',
  desc: '자는 친구, 달리는 친구를 찾아요',
  skill: '동작 이해',
  icon: '🏃',
  color: '#e1efe0',

  round(i, ctx) {
    const picks = sample(VERB_ITEMS, basicChoiceCount(ctx, i));
    return choiceRound(ctx, {
      say: `${picks[0][1]} 친구를 골라요`,
      choices: shuffle(picks.map(([e]) => e)),
      answer: picks[0][0],
    });
  },

  review: (rec) => choiceReview(rec),
};

/* ---------- 놀이: 색깔 · 모양 이름 ---------- */
const COLOR_NAMES = [['빨간', '#ef4444'], ['노란', '#facc15'], ['파란', '#3b82f6'], ['초록', '#22c55e'], ['보라', '#a855f7'], ['주황', '#f97316']];
const SHAPE_NAMES = { circle: '동그라미', triangle: '세모', square: '네모', star: '별', heart: '하트' };
const SHAPE_PATHS = {
  circle: '<circle cx="50" cy="50" r="40"/>',
  triangle: '<path d="M50 10 L92 86 H8 Z" stroke-linejoin="round"/>',
  square: '<rect x="12" y="12" width="76" height="76" rx="8"/>',
  star: '<path d="M50 6 L62 38 L96 38 L68 58 L79 92 L50 72 L21 92 L32 58 L4 38 L38 38 Z"/>',
  heart: '<path d="M50 88 C10 60 4 34 22 20 C36 9 48 18 50 28 C52 18 64 9 78 20 C96 34 90 60 50 88 Z"/>',
};

// 보기 하나 = [모양, 색 이름]
function shapeNode([shape, color]) {
  const node = el('span', { class: 'shape-pic' });
  const fill = color ? COLOR_NAMES.find(([n]) => n === color)[1] : '#8a8fa0';
  node.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true" fill="${fill}" stroke="${fill}" stroke-width="2">${SHAPE_PATHS[shape]}</svg>`;
  return node;
}

const colorGame = {
  id: 'color',
  title: '색깔 · 모양 이름',
  desc: '빨간색은? 동그라미는?',
  skill: '기초 개념',
  icon: '🎨',
  color: '#fde2e2',

  round(i, ctx) {
    const n = basicChoiceCount(ctx, i);
    const colors = shuffle(COLOR_NAMES.map(([c]) => c));
    const shapes = shuffle(Object.keys(SHAPE_NAMES));
    // 쉬움: 색깔만(모두 동그라미) / 보통: 앞은 색깔, 뒤는 모양(모두 회색) / 어려움: 뒤는 '빨간 세모'처럼 둘 다
    const mode = ctx.level === 0 ? 'color' : ctx.level === 1 ? (i < 5 ? 'color' : 'shape') : (i < 5 ? 'shape' : 'both');
    let choices;
    let say;
    if (mode === 'color') {
      choices = colors.slice(0, n).map((c) => ['circle', c]);
      say = `${choices[0][1]}색을 골라요`;
    } else if (mode === 'shape') {
      choices = shapes.slice(0, n).map((s) => [s, null]);
      say = `${SHAPE_NAMES[choices[0][0]]}${objectParticle(SHAPE_NAMES[choices[0][0]])} 골라요`;
    } else {
      // 정답과 색만 같은 것, 모양만 같은 것을 섞어서 둘 다 들어야 맞힐 수 있게
      const [s0, s1] = shapes;
      const [c0, c1] = colors;
      choices = [[s0, c0], [s0, c1], [s1, c0], [s1, c1]].slice(0, n);
      say = `${c0} ${SHAPE_NAMES[s0]}${objectParticle(SHAPE_NAMES[s0])} 골라요`;
    }
    const answer = choices[0];
    const rec = choiceRound(ctx, { say, choices: shuffle(choices), answer, render: shapeNode });
    rec.key = `${mode}|${answer.join()}|${n}`;
    return rec;
  },

  review: (rec) => choiceReview(rec, shapeNode),
};

/* ---------- 놀이: 숫자와 개수 짝짓기 ---------- */
const NUMBER_WORDS = ['', '한', '두', '세', '네', '다섯'];
const NUMBER_ITEMS = [['🍎', '사과'], ['⭐', '별'], ['🐥', '병아리'], ['🎈', '풍선'], ['🍓', '딸기']];
const NUMBER_MAX = [3, 4, 5];

function dotsNode([emoji, count]) {
  return el('span', { class: `num-dots n${count}` }, range(1, count).map(() => el('i', {}, emoji)));
}

const numberGame = {
  id: 'number',
  title: '숫자와 개수 짝짓기',
  desc: '숫자만큼 있는 것을 찾아요',
  skill: '수 개념',
  icon: '3️⃣',
  color: '#dfe9f7',

  round(i, ctx) {
    const [emoji, name] = pick(NUMBER_ITEMS);
    const counts = sample(range(1, NUMBER_MAX[ctx.level]), basicChoiceCount(ctx, i));
    const n = counts[0];
    const choices = shuffle(counts.map((c) => [emoji, c]));
    return choiceRound(ctx, {
      say: `${name}${topicParticle(name).endsWith('은') ? '이' : '가'} ${NUMBER_WORDS[n]} 개 있는 것을 골라요`,
      choices,
      answer: choices.find(([, c]) => c === n),
      render: dotsNode,
      top: el('div', { class: 'num-big' }, String(n)),
    });
  },

  review: (rec) => choiceReview(rec, dotsNode),
};

/* ---------- 놀이: 반대말 ---------- */
// 그림 두 장이 서로 반대인 짝. 그림은 [글자 그림] 또는 [그리는 함수]
const svgPic = (body, vb = '0 0 100 100') => () => {
  const n = el('span', { class: 'opp-pic' });
  n.innerHTML = `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
  return n;
};
const manyPic = (n) => () => el('span', { class: `num-dots n${n}` }, range(1, n).map(() => el('i', {}, '🍎')));
const OPPOSITES = [
  { level: 0, a: ['많은 것', manyPic(5)], b: ['적은 것', manyPic(1)] },
  { level: 0, a: ['뜨거운 것', () => '🔥'], b: ['차가운 것', () => '🧊'] },
  { level: 0, a: ['낮', () => '☀️'], b: ['밤', () => '🌙'] },
  { level: 1, a: ['긴 것', svgPic('<rect x="4" y="42" width="92" height="16" rx="8" fill="#f97316"/>')], b: ['짧은 것', svgPic('<rect x="36" y="42" width="28" height="16" rx="8" fill="#f97316"/>')] },
  { level: 1, a: ['열린 책', () => '📖'], b: ['닫힌 책', () => '📕'] },
  { level: 1, a: ['웃는 얼굴', () => '😄'], b: ['우는 얼굴', () => '😭'] },
  { level: 2, a: ['상자 안에 있는 공', svgPic('<rect x="14" y="30" width="72" height="60" rx="6" fill="#d9b07c"/><rect x="20" y="36" width="60" height="48" rx="4" fill="#f3dfbf"/><circle cx="50" cy="66" r="14" fill="#ef4444"/>')],
    b: ['상자 밖에 있는 공', svgPic('<rect x="6" y="40" width="58" height="50" rx="6" fill="#d9b07c"/><rect x="11" y="45" width="48" height="40" rx="4" fill="#f3dfbf"/><circle cx="82" cy="76" r="14" fill="#ef4444"/>')] },
  { level: 2, a: ['가득 찬 컵', svgPic('<path d="M25 15 H75 L68 90 H32 Z" fill="#e8f1fb" stroke="#9fc2e6" stroke-width="3"/><path d="M27 22 H73 L68 88 H32 Z" fill="#60a5fa"/>')],
    b: ['텅 빈 컵', svgPic('<path d="M25 15 H75 L68 90 H32 Z" fill="#e8f1fb" stroke="#9fc2e6" stroke-width="3"/>')] },
];

const oppositeGame = {
  id: 'opposite',
  title: '반대말',
  desc: '많다 · 적다, 길다 · 짧다',
  skill: '개념 이해',
  icon: '↔️',
  color: '#e8e1f6',

  round(i, ctx) {
    const pair = pick(OPPOSITES.filter((o) => o.level <= ctx.level));
    const flip = rand(2);
    const [want, other] = flip ? [pair.b, pair.a] : [pair.a, pair.b];
    const rec = choiceRound(ctx, {
      say: `${want[0]}${objectParticle(want[0])} 골라요`,
      choices: shuffle([want, other]),
      answer: want,
      render: ([, draw]) => draw(),
    });
    rec.key = want[0];
    return rec;
  },

  review: (rec) => choiceReview(rec, ([, draw]) => draw()),
};

/* ---------- 놀이: 이럴 땐 어떻게 해요? (원인과 결과) ---------- */
const NEEDS = [
  { icon: '🌧️', say: '비가 와요', need: '☂️', level: 0 },
  { icon: '🥶', say: '추워요', need: '🧥', level: 0 },
  { icon: '😋', say: '배고파요', need: '🍚', level: 0 },
  { icon: '😴', say: '졸려요', need: '🛏️', level: 0 },
  { icon: '🖐️', say: '손이 더러워요', need: '🧼', level: 1 },
  { icon: '🥵', say: '목말라요', need: '🥛', level: 1 },
  { icon: '🤧', say: '콧물이 나요', need: '🧻', level: 1 },
  { icon: '🌑', say: '깜깜해요', need: '🔦', level: 2 },
  { icon: '🦷', say: '이를 닦아요', need: '🪥', level: 2 },
  { icon: '🩹', say: '무릎이 까졌어요', need: '🩹', level: 2 },
];

const needGame = {
  id: 'need',
  title: '이럴 땐 어떻게 해요?',
  desc: '비가 오면 무엇이 필요할까요?',
  skill: '원인과 결과',
  icon: '☂️',
  color: '#dcecf8',

  round(i, ctx) {
    const pool = NEEDS.filter((x) => x.level <= ctx.level);
    const q = pick(pool);
    const wrongs = sample(NEEDS.filter((x) => x !== q && x.need !== q.need), basicChoiceCount(ctx, i) - 1).map((x) => x.need);
    const rec = choiceRound(ctx, {
      say: `${q.say}. 무엇이 필요할까요?`,
      choices: shuffle([q.need, ...wrongs]),
      answer: q.need,
      // 무릎 그림은 정답 그림(밴드)과 같아서 다친 무릎 대신 우는 얼굴로
      top: el('div', { class: 'need-scene' }, q.icon === q.need ? '😣' : q.icon),
    });
    rec.situation = q.say;
    return rec;
  },

  review: (rec) => choiceReview(rec),
};

/* ---------- 놀이: 번갈아 쌓기 (차례 지키기) ---------- */
// 아이와 쑥쑥이가 블록을 하나씩 번갈아 쌓음. 쑥쑥이 차례에 누르면 '기다려요'
const TURN_BLOCKS = [4, 6, 8];
const TURN_WAIT = [1200, 1600, 2200];
const BLOCK_COLORS = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#14b8a6'];

const turnGame = {
  id: 'turn',
  title: '번갈아 쌓기',
  desc: '쑥쑥이랑 차례차례 쌓아요',
  skill: '차례 지키기',
  icon: '🧱',
  color: '#fbe3d6',
  total: 5,

  round(i, ctx) {
    const total = TURN_BLOCKS[ctx.level];
    const rec = { total, round: i, early: 0, done: false };
    let placed = 0;
    let myTurn = true;

    const tower = el('div', { class: 'turn-tower' });
    const who = el('div', { class: 'turn-who' });
    const btn = el('button', { class: 'turn-btn', onclick: tap }, '🧱 내 블록 쌓기');
    ctx.stage.append(prompt('쑥쑥이랑 번갈아 쌓아요'), tower, who, btn);

    function addBlock(mine) {
      tower.prepend(el('div', { class: `turn-block pop${mine ? ' mine' : ''}`, style: `--c:${BLOCK_COLORS[placed % BLOCK_COLORS.length]}` }, mine ? '🙂' : '🌱'));
      placed++;
      tone([440 + placed * 60], 0.07);
    }

    function draw() {
      who.replaceChildren(myTurn
        ? el('span', { class: 'turn-mine' }, '👉 내 차례!')
        : el('span', { class: 'turn-wait' }, mascot('smile'), ' 쑥쑥이 차례 · 기다려요'));
      btn.classList.toggle('waiting', !myTurn);
    }

    function tap() {
      if (rec.done) return;
      if (!myTurn) {
        rec.early++;
        btn.classList.remove('nope');
        void btn.offsetWidth;
        btn.classList.add('nope');
        ctx.miss('기다려요. 지금은 쑥쑥이 차례예요');
        return;
      }
      addBlock(true);
      if (placed >= total) return end();
      myTurn = false;
      draw();
      speak('이번엔 쑥쑥이 차례!');
      ctx.later(() => {
        addBlock(false);
        if (placed >= total) return end();
        myTurn = true;
        draw();
        speak('내 차례!');
      }, TURN_WAIT[ctx.level]);
    }

    function end() {
      rec.done = true;
      who.replaceChildren(el('span', { class: 'turn-mine' }, '🎉 다 쌓았어요!'));
      btn.disabled = true;
      ctx.later(() => ctx.finish(true), 600);
    }

    draw();
    return rec;
  },

  review(rec) {
    return el('div', { class: 'review-note' },
      !rec.done ? '끝까지 하지 못했어요' : rec.early ? `블록 ${rec.total}개 · 차례 전에 ${rec.early}번 눌렀어요` : `블록 ${rec.total}개를 차례대로 잘 쌓았어요`);
  },
};

/* ---------- 놀이: 기다리기 연습 ---------- */
// 모래시계가 다 내려갈 때까지 기다리면 선물 상자가 열림. 중간에 누르면 '아직이에요'
const WAIT_SECONDS = [[3, 5], [5, 8], [8, 12]];
const WAIT_PRIZES = ['⭐', '🍓', '🐥', '🌈', '🎈', '🦋', '🍪', '🧸'];

const waitGame = {
  id: 'wait',
  title: '기다리기 연습',
  desc: '모래시계가 끝날 때까지 기다려요',
  skill: '기다리기 · 참기',
  icon: '⏳',
  color: '#f5ecd3',
  total: 5,

  round(i, ctx) {
    const sec = WAIT_SECONDS[ctx.level][i < 3 ? 0 : 1];
    const prize = pick(WAIT_PRIZES);
    const rec = { sec, prize, early: 0, done: false };
    const start = Date.now();

    const fill = el('div', { class: 'wait-fill' });
    const box = el('button', { class: 'wait-box', 'aria-label': '선물 상자', onclick: tap }, '🎁');
    const left = el('div', { class: 'wait-left' }, `${sec}`);
    ctx.stage.append(
      prompt(`손을 무릎에 두고 기다려요`),
      el('div', { class: 'wait-glass' }, el('div', { class: 'wait-bar' }, fill), left),
      box,
      el('div', { class: 'imitate-tip' }, '모래시계가 다 내려가면 상자가 열려요'));
    fill.style.transition = `width ${sec}s linear`;
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = '0%'; }));

    const tick = () => {
      if (rec.done) return;
      const remain = Math.max(0, Math.ceil(sec - (Date.now() - start) / 1000));
      left.textContent = String(remain);
      if (remain === 0) open();
      else ctx.later(tick, 250);
    };
    ctx.later(tick, 250);

    function tap() {
      if (rec.done) return;
      rec.early++;
      box.classList.remove('nope');
      void box.offsetWidth;
      box.classList.add('nope');
      ctx.miss('아직이에요. 조금만 더 기다려요');
    }

    function open() {
      rec.done = true;
      box.textContent = prize;
      box.classList.add('opened', 'pop');
      speak('잘 기다렸어요!');
      tone([523, 659, 784], 0.12);
      ctx.later(() => ctx.finish(true), 900);
    }

    return rec;
  },

  review(rec) {
    return el('div', { class: 'review-note' },
      !rec.done ? '끝까지 하지 못했어요' : rec.early ? `${rec.sec}초 · 중간에 ${rec.early}번 눌렀어요 ${rec.prize}` : `${rec.sec}초를 잘 기다렸어요 ${rec.prize}`);
  },
};

/* ---------- 내 사진 (우리 가족 찾기 · 우리 집 말하기 카드) ---------- */
// 사진은 서버로 보내지 않고 이 기기(브라우저)에만 저장. 320px 정사각형으로 줄여 저장 공간을 아낌
const FAMILY_KEY = 'familyPhotos';
const TALK_CUSTOM_KEY = 'talkCustom';

function pickPhoto() {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept: 'image/*' });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = c.height = 320;
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 320, 320);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
    input.click();
  });
}

// 저장 공간이 모자라면 false
function savePhotoList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    toast('저장 공간이 모자라요. 사진을 몇 장 지워 주세요.');
    return false;
  }
}

const photoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 이름 · 문장과 사진을 받아 목록에 더하는 칸 (가족 사진 · 말하기 카드가 같이 씀)
function photoAdder({ placeholder, button, onAdd }) {
  const name = el('input', { class: 'fb-nick', maxlength: '16', placeholder });
  const status = el('p', { class: 'fb-status', role: 'status' });
  const add = el('button', { class: 'btn-main', onclick: async () => {
    if (!name.value.trim()) { status.textContent = '이름(말)을 먼저 적어 주세요.'; name.focus(); return; }
    const img = await pickPhoto();
    if (!img) return;
    onAdd(name.value.trim(), img);
  } }, button);
  return el('section', { class: 'fb-form' }, name, status, add,
    el('p', { class: 'fb-note' }, '🔒 사진은 이 기기 안에만 저장되고 어디로도 보내지 않아요. 브라우저 기록을 지우면 함께 지워져요.'));
}

function photoList(list, onDelete) {
  return el('div', { class: 'my-photos' }, list.length
    ? list.map((p) => el('div', { class: 'my-photo' },
      el('img', { src: p.img, alt: '' }),
      el('b', {}, p.name),
      el('button', { class: 'chip', onclick: () => onDelete(p.id) }, '지우기')))
    : el('p', { class: 'muted' }, '아직 사진이 없어요.'));
}

const familyList = () => store.get(FAMILY_KEY, []);

function showFamilySetup(after = null) {
  const list = familyList();
  const redraw = () => showFamilySetup(after);
  toolScreen('우리 가족 사진',
    el('p', { class: 'sub' }, '엄마, 아빠, 형제, 선생님 사진을 넣으면 "엄마는 어디 있어요?" 놀이를 할 수 있어요. 2명 이상 넣어 주세요.'),
    photoAdder({
      placeholder: '이름 (예: 엄마, 아빠, 할머니, 김 선생님)',
      button: '📷 사진 골라서 넣기',
      onAdd: (name, img) => { if (savePhotoList(FAMILY_KEY, [...familyList(), { id: photoId(), name, img }])) redraw(); },
    }),
    el('h2', { class: 'fb-title' }, `넣은 사진 (${list.length}명)`),
    photoList(list, (id) => { savePhotoList(FAMILY_KEY, familyList().filter((p) => p.id !== id)); redraw(); }),
    list.length >= 2 ? el('button', { class: 'btn-main', onclick: () => playGame(familyGame) }, '▶ 우리 가족 찾기 놀이 시작') : null);
}

const familyGame = {
  id: 'family',
  title: '우리 가족 찾기',
  desc: '엄마는 어디 있을까? 사진으로 찾아요',
  skill: '이름 알기 · 사회성',
  icon: '👨‍👩‍👧',
  color: '#fde7ef',
  // 보호자가 사진을 넣어야 하는 놀이라 오늘의 학습에는 넣지 않음
  optional: true,
  ready: () => familyList().length >= 2,

  round(i, ctx) {
    const people = familyList();
    const picks = sample(people, Math.min(people.length, [2, 3, 4][ctx.level]));
    const answer = picks[0];
    const face = (id) => {
      const p = people.find((x) => x.id === id);
      return p ? el('img', { class: 'family-face', src: p.img, alt: '' }) : '?';
    };
    const rec = choiceRound(ctx, {
      say: `${topicParticle(answer.name)} 어디 있어요?`,
      choices: shuffle(picks.map((p) => p.id)),
      answer: answer.id,
      render: face,
    });
    rec.face = face;
    return rec;
  },

  review: (rec) => choiceReview(rec, (id) => {
    const p = familyList().find((x) => x.id === id);
    return p ? el('img', { class: 'family-face mini', src: p.img, alt: '' }) : '?';
  }),
};

const talkCustomList = () => store.get(TALK_CUSTOM_KEY, []);

function showTalkCardEditor() {
  const list = talkCustomList();
  toolScreen('우리 집 말하기 카드',
    el('p', { class: 'sub' }, '아이가 좋아하는 간식, 장난감, 장소 사진으로 말하기 카드를 만들어요. 누르면 적은 말을 소리로 말해 줘요.'),
    photoAdder({
      placeholder: '말 (예: 딸기 주세요, 곰 인형 줘요)',
      button: '📷 사진 골라서 카드 만들기',
      onAdd: (name, img) => { if (savePhotoList(TALK_CUSTOM_KEY, [...talkCustomList(), { id: photoId(), name, img }])) showTalkCardEditor(); },
    }),
    el('h2', { class: 'fb-title' }, `만든 카드 (${list.length}장)`),
    photoList(list, (id) => { savePhotoList(TALK_CUSTOM_KEY, talkCustomList().filter((p) => p.id !== id)); showTalkCardEditor(); }),
    el('button', { class: 'btn-main alt', onclick: () => showHome('talk') }, '🗣️ 말하기로 돌아가기'));
}

/* ---------- 놀이: 이럴 땐 뭐라고 해요? (사회적 말) ---------- */
const SOCIAL_SITUATIONS = [
  { icon: '🎁', say: '선물을 받았어요', answer: ['🙏', '고마워요'] },
  { icon: '💥', say: '친구와 부딪혔어요', answer: ['🙇', '미안해요'] },
  { icon: '🌅', say: '아침에 선생님을 만났어요', answer: ['👋', '안녕하세요'] },
  { icon: '🍚', say: '밥을 먹기 전이에요', answer: ['🥄', '잘 먹겠습니다'] },
  { icon: '🩹', say: '친구가 넘어졌어요', answer: ['🤗', '괜찮아?'] },
  { icon: '🧸', say: '친구랑 같이 놀고 싶어요', answer: ['🤝', '같이 놀자'] },
  { icon: '🌙', say: '잠자러 가요', answer: ['😴', '안녕히 주무세요'] },
  { icon: '🎂', say: '친구의 생일이에요', answer: ['🎉', '생일 축하해'] },
];
const SOCIAL_LEVEL_COUNT = [4, 6, 8];
const phraseCard = ([icon, text]) => el('span', { class: 'phrase-card' }, el('span', { class: 'phrase-icon' }, icon), el('b', {}, text));

const socialGame = {
  id: 'social',
  title: '이럴 땐 뭐라고 해요?',
  desc: '고마워요, 미안해요를 골라요',
  skill: '사회성 · 말하기',
  icon: '🙏',
  color: '#fde2e2',

  round(i, ctx) {
    const pool = SOCIAL_SITUATIONS.slice(0, SOCIAL_LEVEL_COUNT[ctx.level]);
    const q = pick(pool);
    const wrongs = sample(pool.filter((x) => x !== q), basicChoiceCount(ctx, i) - 1).map((x) => x.answer);
    const rec = choiceRound(ctx, {
      say: `${q.say}. 뭐라고 말할까요?`,
      choices: shuffle([q.answer, ...wrongs]),
      answer: q.answer,
      render: phraseCard,
      top: el('div', { class: 'need-scene' }, q.icon),
    });
    rec.situation = q.say;
    return rec;
  },

  review: (rec) => choiceReview(rec, phraseCard),
};

/* ---------- 놀이: 무엇이 없어졌을까? (기억) ---------- */
const MISSING_ITEMS = ['🍎', '🍌', '🚗', '⭐', '🎈', '🐳', '🐸', '🦋', '⚽', '🌸'];
const MISSING_COUNT = [3, 4, 5];
const MISSING_VIEW = [3500, 3500, 3000];

const missingGame = {
  id: 'missing',
  title: '무엇이 없어졌을까?',
  desc: '잘 보고, 사라진 것을 찾아요',
  skill: '기억 · 주의집중',
  icon: '🔎',
  color: '#e1ecf8',

  round(i, ctx) {
    const items = sample(MISSING_ITEMS, MISSING_COUNT[ctx.level]);
    const gone = rand(items.length);
    const missing = items[gone];
    const rec = { items, missing };
    const row = (hide) => el('div', { class: 'missing-row' }, items.map((e, k) =>
      el('div', { class: `tile missing-tile${hide && k === gone ? ' blank' : ''}` }, hide && k === gone ? '?' : e)));

    ctx.stage.append(prompt('잘 보고 기억해요'), row(false));
    ctx.later(() => {
      ctx.stage.replaceChildren();
      // 남아 있는 그림 중에서 보기를 골라, 무엇이 사라졌는지 비교하며 찾게 함
      const others = sample(items.filter((e) => e !== missing), basicChoiceCount(ctx, i) - 1);
      choiceRound(ctx, { say: '무엇이 없어졌나요?', choices: shuffle([missing, ...others]), answer: missing, top: row(true), rec });
    }, MISSING_VIEW[ctx.level]);
    return rec;
  },

  review: (rec) => el('div', {},
    el('div', { class: 'review-items' }, rec.items.join(' ')),
    el('div', { class: 'review-note' }, `없어진 것: ${rec.missing}`)),
};

/* ---------- 놀이: 반쪽 그림 찾기 (부분과 전체) ---------- */
const HALF_ITEMS = ['🍎', '🐘', '🚗', '🦋', '🐳', '⭐', '🍌', '🐸', '✈️', '🎈', '🌸', '🐧'];
const halfPic = (e, side) => el('span', { class: `half-pic ${side}` }, el('span', {}, e));

const halfGame = {
  id: 'half',
  title: '반쪽 그림 찾기',
  desc: '반쪽만 보고 무엇인지 맞혀요',
  skill: '부분과 전체',
  icon: '🌗',
  color: '#efe6d6',

  round(i, ctx) {
    const picks = sample(HALF_ITEMS, basicChoiceCount(ctx, i));
    const answer = picks[0];
    const side = ctx.level === 2 && rand(2) ? 'right' : 'left';
    const rec = choiceRound(ctx, {
      say: '반쪽 그림은 무엇일까요?',
      choices: shuffle(picks),
      answer,
      top: el('div', { class: 'tile half-tile' }, halfPic(answer, side)),
    });
    rec.side = side;
    return rec;
  },

  review: (rec) => choiceReview(rec),
};

/* ---------- 놀이: 안전한 것 · 위험한 것 ---------- */
const DANGER_ITEMS = ['🔥', '🔪', '🔌', '💊', '✂️'];
const SAFE_ITEMS = ['🧸', '⚽', '📚', '🖍️', '🧩', '🎈', '🪀'];

const safetyGame = {
  id: 'safety',
  title: '안전한 것 · 위험한 것',
  desc: '만지면 위험한 것을 알아요',
  skill: '생활 안전',
  icon: '⚠️',
  color: '#fde8cc',

  round(i, ctx) {
    const n = basicChoiceCount(ctx, i);
    // 어려움 뒤쪽은 거꾸로 '안전하게 놀 수 있는 것' 고르기
    const askSafe = ctx.level === 2 && i >= 5 && rand(2);
    const answer = pick(askSafe ? SAFE_ITEMS : DANGER_ITEMS);
    const wrongs = sample(askSafe ? DANGER_ITEMS : SAFE_ITEMS, n - 1);
    const rec = choiceRound(ctx, {
      say: askSafe ? '안전하게 갖고 놀 수 있는 것을 골라요' : '만지면 위험한 것을 골라요',
      choices: shuffle([answer, ...wrongs]),
      answer,
    });
    rec.mode = askSafe ? 'safe' : 'danger';
    return rec;
  },

  review: (rec) => choiceReview(rec),
};

/* ---------- 놀이: 같은 무리끼리 모으기 (종류 나누기) ---------- */
const GROUPS = [
  { key: 'fruit', name: '과일', icon: '🍎', items: ['🍌', '🍇', '🍓', '🍉', '🍊', '🍐'] },
  { key: 'animal', name: '동물', icon: '🐶', items: ['🐱', '🐸', '🐘', '🐰', '🐻', '🐷'] },
  { key: 'ride', name: '탈것', icon: '🚗', items: ['🚌', '✈️', '🚲', '🚂', '⛵', '🚒'] },
  { key: 'cloth', name: '옷', icon: '👕', items: ['👖', '🧦', '🧢', '👗', '🧥', '👟'] },
];
const GROUP_BASKETS = [2, 2, 3];
const GROUP_COUNTS = [[3, 4], [4, 5], [5, 6]];

const groupGame = {
  id: 'group',
  title: '같은 무리끼리 모으기',
  desc: '과일은 과일끼리, 동물은 동물끼리',
  skill: '종류 나누기',
  icon: '🗂️',
  color: '#e4f1dc',

  round(i, ctx) {
    const cats = sample(GROUPS, GROUP_BASKETS[ctx.level]);
    const n = GROUP_COUNTS[ctx.level][i < 5 ? 0 : 1];
    // 바구니마다 하나씩은 꼭 들어가게
    const items = shuffle([...cats.map((c) => pick(c.items)), ...range(1, n - cats.length).map(() => pick(pick(cats).items))]);
    const keyOf = (it) => GROUPS.find((g) => g.items.includes(it))?.key;
    return dragSortRound(ctx, {
      say: '같은 무리끼리 바구니에 넣어요',
      items,
      baskets: cats.map((c) => ({ key: c.key, label: el('span', { class: 'group-label' }, el('span', {}, c.icon), el('b', {}, c.name)) })),
      keyOf,
      render: (it) => el('span', { class: 'emoji-piece' }, it),
      rec: { cats: cats.map((c) => c.key) },
    });
  },

  review(rec) {
    return el('div', {},
      el('div', { class: 'review-items' }, rec.items.join(' ')),
      el('div', { class: 'review-note' }, !rec.done ? '끝까지 하지 못했어요' : rec.misses ? `${rec.misses}번 틀리고 다 나눴어요` : '한 번도 안 틀리고 다 나눴어요'));
  },

  badge(rec) {
    if (rec.passed) return null;
    return rec.correct ? ['good', '잘 나눴어요'] : ['pass', '완성'];
  },
};

/* ---------- 놀이: 날씨와 하루 ---------- */
const WEATHER_QS = [
  { tag: 'hot', icon: '☀️', say: '더운 날 입는 옷을 골라요', items: ['🩳', '👒', '🩴'], level: 0 },
  { tag: 'cold', icon: '❄️', say: '추운 날 입는 것을 골라요', items: ['🧣', '🧤', '🧥'], level: 0 },
  { tag: 'rain', icon: '🌧️', say: '비 오는 날 필요한 것을 골라요', items: ['☔', '👢'], level: 0 },
  { tag: 'night', icon: '🌙', say: '밤에 하는 일을 골라요', items: ['😴', '🛏️'], level: 1 },
  { tag: 'morning', icon: '🌅', say: '아침에 일어날 때 울리는 것을 골라요', items: ['⏰'], level: 2 },
];

const weatherGame = {
  id: 'weather',
  title: '날씨와 하루',
  desc: '추운 날, 더운 날 무엇을 입을까?',
  skill: '시간 · 날씨 개념',
  icon: '🌤️',
  color: '#dcefff',

  round(i, ctx) {
    const pool = WEATHER_QS.filter((q) => q.level <= ctx.level);
    const q = pick(pool);
    const answer = pick(q.items);
    const wrongs = sample(pool.filter((x) => x !== q).flatMap((x) => x.items), basicChoiceCount(ctx, i) - 1);
    const rec = choiceRound(ctx, {
      say: q.say,
      choices: shuffle([answer, ...wrongs]),
      answer,
      top: el('div', { class: 'need-scene' }, q.icon),
    });
    rec.tag = q.tag;
    return rec;
  },

  review: (rec) => choiceReview(rec),
};

/* ---------- 놀이: 리듬 따라 치기 (듣고 따라 하기) ---------- */
// 쑥쑥이가 북을 친 횟수만큼 똑같이 치기. 리듬은 '묶음' 배열: [3]은 쿵쿵쿵, [1, 2]는 쿵 — 쿵쿵
const RHYTHM_PLANS = [
  [[2], [3], [1, 1], [2, 1], [1, 2], [1, 1, 1]],
  [[3], [4], [1, 2], [2, 1], [2, 2], [1, 1, 1], [3, 1]],
  [[4], [5], [2, 3], [3, 2], [1, 3], [3, 1], [2, 1, 2], [1, 2, 1], [2, 2, 1]],
];
// 묶음 안 박자 간격 · 묶음 사이 쉬는 간격(ms), 묶음이 하나면 고르게 치는 간격
const RHYTHM_STEP = [520, 450, 380];
const RHYTHM_EVEN = [700, 600, 500];
const RHYTHM_GAP = 950;

function rhythmBeats(plan, level) {
  const beats = [];
  let t = 0;
  plan.forEach((count, g) => {
    if (g) t += RHYTHM_GAP - RHYTHM_STEP[level];
    for (let k = 0; k < count; k++) {
      beats.push({ t, group: g });
      t += plan.length === 1 ? RHYTHM_EVEN[level] : RHYTHM_STEP[level];
    }
  });
  return beats;
}

const rhythmGame = {
  id: 'rhythm',
  title: '리듬 따라 치기',
  desc: '쑥쑥이처럼 북을 쿵쿵 쳐요',
  skill: '듣기 · 모방',
  icon: '🥁',
  color: '#f8e1cf',
  total: 6,

  round(i, ctx) {
    const plan = pick(RHYTHM_PLANS[ctx.level]);
    const beats = rhythmBeats(plan, ctx.level);
    const n = beats.length;
    const rec = { n, plan, sig: plan.join('-'), done: false };
    let taps = 0;
    let listening = true;
    let waitGen = 0; // 지난 기다림 타이머가 새로 친 것을 건드리지 않게

    // 쉬는 자리는 동그라미 사이를 띄워서 리듬이 눈으로도 보이게
    const dots = beats.map((b, k) => el('i', { class: k && b.group !== beats[k - 1].group ? 'gap' : '' }));
    const drum = el('button', { class: 'drum', 'aria-label': '북', onclick: tap }, '🥁');
    const guide = el('div', { class: 'rhythm-guide' });
    ctx.stage.append(prompt('쑥쑥이 북소리를 잘 들어요'), el('div', { class: 'rhythm-dots' }, dots), drum, guide);

    function play() {
      listening = true;
      taps = 0;
      const reset = () => dots.forEach((d, k) => d.classList.remove('show', 'mine'));
      reset();
      guide.replaceChildren(el('span', {}, mascot('smile'), ' 쑥쑥이가 쳐요'));
      beats.forEach(({ t }, k) => ctx.later(() => {
        dots[k].classList.add('show');
        drum.classList.remove('hit'); void drum.offsetWidth; drum.classList.add('hit');
        tone([196], 0.18);
      }, 400 + t));
      ctx.later(() => {
        listening = false;
        reset();
        guide.replaceChildren(el('b', {}, '👉 이제 똑같이 쳐 봐요!'));
        speak('똑같이 쳐 봐요');
      }, 400 + beats[n - 1].t + 700);
    }

    function tap() {
      if (listening || rec.done) return;
      dots[taps].classList.add('mine');
      drum.classList.remove('hit'); void drum.offsetWidth; drum.classList.add('hit');
      tone([262], 0.15);
      taps++;
      const gen = ++waitGen;
      if (taps >= n) {
        rec.done = true;
        ctx.later(() => ctx.finish(true), 500);
        return;
      }
      // 중간에 멈추면 몇 번 쳐야 하는지 다시 들려줌
      ctx.later(() => {
        if (gen !== waitGen || rec.done || listening) return;
        ctx.miss('다시 잘 들어 봐요');
        ctx.later(play, 900);
      }, 2500);
    }

    ctx.later(play, 300);
    return rec;
  },

  review: (rec) => el('div', { class: 'review-note' }, `${rec.plan.map((c) => '쿵'.repeat(c)).join(' — ')} · ${rec.done ? `${rec.n}번 따라 쳤어요` : '끝까지 하지 못했어요'}`),
};

/* ---------- 놀이: 왜 그런 기분일까? (감정의 이유) ---------- */
// '기분 알기'의 거꾸로: 얼굴을 보고 그 기분이 된 까닭(상황)을 고름
const situationCard = (s) => el('span', { class: 'phrase-card' }, el('span', { class: 'phrase-icon' }, s.icon), el('b', {}, s.text));
const WHY_CHOICES = [[2, 2], [2, 3], [3, 3]];

const whyGame = {
  id: 'why',
  title: '왜 그런 기분일까?',
  desc: '슬픈 얼굴, 왜 슬플까요?',
  skill: '감정 이해',
  icon: '🤔',
  color: '#f3e3f6',

  round(i, ctx) {
    const feels = FEEL_SETS[ctx.level];
    const pool = FEEL_SITUATIONS.filter((s) => feels.includes(s.feel));
    const q = pick(pool);
    const f = FEELINGS[q.feel];
    // 그 기분일 수도 있는 상황(avoid)은 보기에서 뺌
    const wrongs = sample(pool.filter((s) => s.feel !== q.feel && !(s.avoid || []).includes(q.feel)), WHY_CHOICES[ctx.level][i < 5 ? 0 : 1] - 1);
    const rec = choiceRound(ctx, {
      say: `왜 ${f.adj} 얼굴일까요?`,
      choices: shuffle([q, ...wrongs]),
      answer: q,
      render: situationCard,
      wide: true,
      top: el('div', { class: 'need-scene face-scene' }, PHOTOS[f.face] ? pic(f.face) : f.face),
    });
    rec.feel = q.feel;
    return rec;
  },

  review: (rec) => choiceReview(rec, situationCard),
};

/* ---------- 보호자 도움말 (놀이를 시작할 때 한 줄) ---------- */
const CATEGORY_TIPS = {
  see: '고르기 전에 그림을 손가락으로 함께 가리키며 이름을 말해 주세요.',
  hand: '손이 서툴면 아이 손 위에 손을 얹어 함께 움직여 주세요. 끝까지 해낸 것을 칭찬해 주세요.',
  fun: '정답보다 즐거움이 먼저예요. 잘 기다리고 따라 한 순간을 크게 칭찬해 주세요.',
  focus: '보여 주는 동안 "잘 보자" 하며 그림을 함께 짚어 주세요.',
  think: '틀리면 답을 바로 알려 주기보다, 반짝이는 힌트를 함께 보며 다시 해 보게 해 주세요.',
  number: '그림을 하나씩 손가락으로 짚으며 소리 내어 함께 세어 주세요.',
  talk: '아이가 고른 그림의 이름을 또박또박 한 번 더 말해 주세요. 따라 말하면 크게 칭찬해 주세요.',
  life: '놀이 속 상황을 실제 생활에서도 같은 말로 다시 이야기해 주세요.',
};
const GAME_TIPS = {
  family: '사진 속 사람을 가리키며 "엄마 여기 있네!"처럼 함께 말해 주세요.',
  imitate: '보호자가 먼저 동작을 크게 해 보이면 아이가 더 쉽게 따라 해요.',
  wait: '기다리는 동안 "하나, 둘…" 함께 세어 주면 기다리기가 쉬워져요.',
  turn: '"이번엔 누구 차례?" 하고 함께 말하며 차례를 기다려 보세요.',
  rhythm: '먼저 아이와 무릎이나 책상을 "쿵쿵" 치며 함께 연습해 보세요.',
  safety: '위험한 물건은 생활 속에서도 "위험해" 같은 짧고 같은 말로 알려 주세요.',
};
function gameTip(game) {
  return GAME_TIPS[game.id] ?? CATEGORY_TIPS[CATEGORIES.find((c) => c.games.includes(game))?.id] ?? null;
}

// 놀이별로 '같은 문제'를 판단하는 기준 (아이 눈에 같아 보이는 것끼리 같다고 봄)
const QUESTION_KEYS = {
  memory: (r) => r.original.join(),
  copy: (r) => r.original.join(),
  lines: (r) => r.original.map(lineKey).sort().join(),
  pattern: (r) => `${r.seq.join('')}|${r.blank}`,
  count: (r) => `${r.emoji}${r.n}`,
  odd: (r) => [r.items[r.odd], r.items[r.odd === 0 ? 1 : 0]].sort().join(),
  flip: (r) => [...r.faces].sort().join(),
  shadow: (r) => r.answer,
  listen: (r) => r.word,
  feel: (r) => r.situation?.text ?? `${r.feel}|${r.choices.join()}`,
  match: (r) => r.pair.q,
  order: (r) => `${r.items.map((it) => `${it.label}${it.scale ?? ''}`).join()}|${r.order.join()}`,
  routine: (r) => `${r.items.map((it) => it.label).join()}|${r.order.join()}`,
  opposite: (r) => r.key,
  need: (r) => `${r.situation}|${r.choices.length}`,
  turn: (r) => `${r.total}|${r.round}`,
  wait: (r) => `${r.sec}|${r.prize}`,
  social: (r) => `${r.situation}|${r.choices.length}`,
  missing: (r) => `${[...r.items].sort().join()}|${r.missing}`,
  half: (r) => `${r.answer}|${r.side}|${r.choices.length}`,
  safety: (r) => `${r.mode}|${r.answer}|${r.choices.length}`,
  group: (r) => `${r.cats.join()}|${r.items.join()}`,
  weather: (r) => `${r.tag}|${r.answer}|${r.choices.length}`,
  rhythm: (r) => r.sig,
  why: (r) => `${r.feel}|${r.answer.text}|${r.choices.length}`,
  family: (r) => `${r.answer}|${r.choices.length}`,
  sound: (r) => `${r.answer}|${r.choices.length}`,
  verb: (r) => `${r.answer}|${r.choices.length}`,
  color: (r) => r.key,
  number: (r) => `${r.answer.join()}|${r.choices.length}`,
  steps: (r) => r.seq.join(),
  use: (r) => `${r.ask}|${r.answer}|${r.choices.length}`,
  imitate: (r) => r.acts.join(),
  body: (r) => `${r.scene}|${r.part}`,
  size: (r) => `${r.item}|${r.ask}|${r.scales.join()}`,
  puzzle: (r) => `${r.photo}|${r.cols}x${r.rows}`,
  balloon: (r) => `${r.color}|${r.n}`,
  mole: (r) => `${r.target}|${r.decoy}`,
  trace: (r) => `${r.shape}|${r.flip}|${r.pair.join('')}`,
  sort: (r) => `${[...r.kinds].sort().join()}|${r.items.length}`,
  space: (r) => `${r.furniture}|${Object.entries(r.placed).map(([pl, t]) => pl + t.e).join()}|${r.ask}|${r.whereType}`,
};
const questionKey = (game, r) => `${game.id}:${(QUESTION_KEYS[game.id] ?? JSON.stringify)(r)}`;

const GAMES = [
  copyGame, linesGame, listenGame, feelGame, matchGame, routineGame, spaceGame, memoryGame, patternGame,
  countGame, oddGame, flipGame, shadowGame, orderGame, traceGame, sortGame, balloonGame, moleGame,
  bodyGame, sizeGame, puzzleGame, useGame, imitateGame, stepsGame,
  soundGame, verbGame, colorGame, numberGame,
  oppositeGame, needGame, turnGame, waitGame,
  socialGame, missingGame, halfGame, safetyGame, groupGame, weatherGame, rhythmGame, whyGame,
  familyGame,
];
// 오늘의 학습에 돌아가며 나오는 놀이 (보호자가 준비해야 하는 놀이는 뺌)
const DAILY_GAMES = GAMES.filter((g) => !g.optional);

const bestKey = (game, level) => `best:${game.id}:${level}`;

/* ---------- 오늘의 학습 ---------- */
// 하루에 놀이 4가지를 골라 3·3·2·2문제씩 (모두 10문제)
const DAILY_COUNTS = [3, 3, 2, 2];
const DAILY_TOTAL = DAILY_COUNTS.reduce((a, b) => a + b, 0);
const WEEKDAYS = '일월화수목금토';

const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};
const dailyKey = (date) => `daily:${date}`;

/* ---------- 학습 기록 ---------- */
// 문제마다 결과를 날짜·놀이별로 모아 둠: stats[날짜][놀이] = { first, retry, pass }
//   first: 처음에 맞힘 / retry: 다시 해서 맞음 / pass: 패스
const STATS_KEY = 'stats';
const STATS_KEEP_DAYS = 120;
const OUTCOMES = [
  { id: 'first', name: '처음에 맞힘' },
  { id: 'retry', name: '다시 해서 맞음' },
  { id: 'pass', name: '패스' },
];

function recordStat(gameId, outcome) {
  const stats = store.get(STATS_KEY, {});
  const day = dateKey(new Date());
  const counts = ((stats[day] ??= {})[gameId] ??= { first: 0, retry: 0, pass: 0 });
  counts[outcome]++;
  const cutoff = dateKey(daysAgo(STATS_KEEP_DAYS));
  for (const d of Object.keys(stats)) if (d < cutoff) delete stats[d];
  store.set(STATS_KEY, stats);
}

// 최근 days일 동안의 놀이별 합계와 학습한 날
function statsSince(days) {
  const cutoff = dateKey(daysAgo(days - 1));
  const perGame = {};
  const activeDays = new Set();
  for (const [day, games] of Object.entries(store.get(STATS_KEY, {}))) {
    if (day < cutoff) continue;
    activeDays.add(day);
    for (const [id, c] of Object.entries(games)) {
      const t = (perGame[id] ??= { first: 0, retry: 0, pass: 0 });
      for (const o of OUTCOMES) t[o.id] += c[o.id] ?? 0;
    }
  }
  return { perGame, activeDays };
}

const totalOf = (c) => c.first + c.retry + c.pass;
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

// 놀이를 골고루 돌리기: 모든 놀이를 한 번씩 섞은 '한 바퀴'를 이어 붙이고,
// 날마다 그 줄에서 차례로 4개씩 가져감 → 한 바퀴(9가지)를 다 돌아야 같은 놀이가 다시 나옴
const ROTATION_START = Date.UTC(2026, 0, 1);
const rotationCycles = [];

function dayNumber(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Math.max(0, Math.round((Date.UTC(y, m - 1, d) - ROTATION_START) / 86400000));
}

function rotationCycle(k) {
  const overlap = DAILY_COUNTS.length - 1;
  while (rotationCycles.length <= k) {
    const n = rotationCycles.length;
    const prevTail = n > 0 ? rotationCycles[n - 1].slice(-overlap) : [];
    let order;
    // 바퀴가 바뀌는 날에 같은 놀이가 하루에 두 번 나오지 않도록, 앞 바퀴 끝과 겹치면 다시 섞음
    for (let attempt = 0; attempt < 50; attempt++) {
      order = withRng(`cycle:${n}:${attempt}`, () => shuffle(DAILY_GAMES));
      if (!order.slice(0, overlap).some((g) => prevTail.includes(g))) break;
    }
    rotationCycles.push(order);
  }
  return rotationCycles[k];
}

// 같은 날에는 누가 언제 열어도 같은 놀이 · 같은 문제가 나오도록 날짜로 정함
function dailyPlan(date) {
  const start = dayNumber(date) * DAILY_COUNTS.length;
  const games = DAILY_COUNTS.map((_, g) => {
    const pos = start + g;
    return rotationCycle(Math.floor(pos / DAILY_GAMES.length))[pos % DAILY_GAMES.length];
  });
  return games.flatMap((game, g) => {
    const per = DAILY_COUNTS[g];
    const total = game.total ?? TOTAL;
    // 문제 번호를 놀이 전체 범위에 고르게 퍼뜨려서 쉬운 문제 → 조금 어려운 문제 순서로
    return range(0, per - 1).map((j) => ({ game, index: Math.floor((j * total) / per) }));
  });
}

function dailyStreak() {
  let n = store.get(dailyKey(dateKey(daysAgo(0))), null) ? 0 : 1;
  let streak = 0;
  while (store.get(dailyKey(dateKey(daysAgo(n))), null)) {
    streak++;
    n++;
  }
  return streak;
}

function dailyCard() {
  const today = new Date();
  const date = dateKey(today);
  const games = [...new Set(dailyPlan(date).map((r) => r.game))];
  const done = store.get(dailyKey(date), null);
  const streak = dailyStreak();
  const info = done ? `✅ 오늘 완료 · ${done.score}점` : `${DAILY_TOTAL}문제`;

  return el('section', { class: `daily-card${done ? ' finished' : ''}` },
    el('div', { class: 'daily-top' },
      el('span', { class: 'daily-tag' }, '오늘의 학습'),
      el('span', { class: 'daily-date' }, `${today.getMonth() + 1}월 ${today.getDate()}일 (${WEEKDAYS[today.getDay()]})`)),
    el('div', { class: 'daily-row' },
      el('div', { class: 'daily-icons' },
        games.map((g) => el('span', { class: 'daily-icon', style: `--c:${g.color}`, title: g.title, 'aria-label': g.title }, g.icon))),
      el('span', { class: 'daily-info' }, info, streak > 1 ? el('small', {}, `🔥 ${streak}일 연속`) : null)),
    done ? null : rewardLine(),
    el('button', { class: 'daily-go', onclick: playDaily }, done ? '다시 하기' : '▶ 시작하기'),
  );
}

/* ---------- 칭찬 스티커판 ---------- */
// 오늘의 학습을 처음 끝낸 날마다 스티커 1개. 10개를 모을 때마다 쑥쑥이가 한 단계 자람
const STICKERS = ['⭐', '🍓', '🐥', '🌈', '🎈', '🦋', '🍀', '🐳', '🌻', '🚗'];
const GROW_STAGES = [['🌱', '새싹'], ['🌿', '잎이 난 새싹'], ['🌷', '꽃'], ['🌳', '나무'], ['🍎', '열매 나무']];
const STICKERS_PER_STAGE = 10;

function stickerCount() {
  let n = 0;
  try {
    for (let k = 0; k < localStorage.length; k++) if (localStorage.key(k).startsWith('daily:')) n++;
  } catch {}
  return n;
}

function stickerCard() {
  const n = stickerCount();
  const stage = Math.min(Math.floor(n / STICKERS_PER_STAGE), GROW_STAGES.length - 1);
  const grownUp = n >= GROW_STAGES.length * STICKERS_PER_STAGE;
  const onBoard = grownUp ? STICKERS_PER_STAGE : n % STICKERS_PER_STAGE;
  const [icon, name] = GROW_STAGES[stage];
  const note = grownUp ? '쑥쑥이가 다 자랐어요! 🎉'
    : stage > 0 && onBoard === 0 ? '쑥쑥이가 한 뼘 자랐어요! 🎉'
    : `${STICKERS_PER_STAGE - onBoard}개 더 모으면 쑥쑥이가 자라요`;
  return el('section', { class: 'sticker-card' },
    el('div', { class: 'sticker-head' },
      el('span', { class: 'sticker-grow', title: name }, icon),
      el('div', { class: 'sticker-text' },
        el('b', {}, '칭찬 스티커'),
        el('span', {}, note))),
    el('div', { class: 'sticker-board' }, range(0, STICKERS_PER_STAGE - 1).map((k) =>
      el('span', { class: `sticker${k < onBoard ? ' on' : ''}` },
        k < onBoard ? STICKERS[(n - onBoard + k) % STICKERS.length] : ''))));
}

function playDaily() {
  const date = dateKey(new Date());
  const level = settings.level;
  playSession({
    title: '오늘의 학습',
    level,
    rounds: dailyPlan(date),
    seed: `${date}:${level}`,
    showGameName: true,
    schedule: true,
    restart: playDaily,
    save(state) {
      const prev = store.get(dailyKey(date), null);
      if (!prev) state.newSticker = true; // 오늘 처음 끝냄 → 칭찬 스티커
      if (!prev || state.score >= prev.score) {
        store.set(dailyKey(date), { score: state.score, correct: state.correct, total: state.records.length, level });
      }
    },
  });
}

/* ---------- 화면: 홈 ---------- */
// 놀이를 영역별로 묶음 (보호자가 이해하기 쉬운 말로)
const CATEGORIES = [
  { id: 'see', icon: '👀', name: '보고 따라하기', desc: '눈으로 보고 손으로 똑같이 해요', games: [copyGame, shadowGame, oddGame, imitateGame] },
  { id: 'hand', icon: '✋', name: '손 놀이', desc: '손가락으로 긋고, 끌고, 옮겨요', games: [linesGame, traceGame, sortGame, puzzleGame] },
  { id: 'fun', icon: '🎮', name: '게임 놀이', desc: '톡톡 눌러 신나게 놀아요', games: [balloonGame, moleGame, rhythmGame] },
  { id: 'focus', icon: '🧠', name: '기억·집중', desc: '잘 보고 기억해요', games: [memoryGame, flipGame, missingGame] },
  { id: 'think', icon: '🔍', name: '생각·규칙', desc: '규칙과 순서, 위치를 찾아요', games: [patternGame, orderGame, spaceGame, sizeGame, colorGame, oppositeGame, needGame, halfGame, groupGame, weatherGame] },
  { id: 'number', icon: '🔢', name: '수', desc: '하나, 둘, 셋 세어 봐요', games: [countGame, numberGame] },
  { id: 'talk', icon: '🗣️', name: '말·소통', desc: '말을 듣고 뜻을 알아요', games: [familyGame, listenGame, soundGame, verbGame, matchGame, bodyGame, useGame, stepsGame] },
  { id: 'life', icon: '💛', name: '마음·생활', desc: '기분과 생활 습관을 익혀요', games: [feelGame, whyGame, socialGame, safetyGame, routineGame, turnGame, waitGame] },
];

const HOME_TABS = [
  { id: 'today', icon: '🏠', name: '오늘' },
  { id: 'games', icon: '🧩', name: '놀이' },
  { id: 'talk', icon: '🗣️', name: '말하기' },
  { id: 'records', icon: '📊', name: '기록' },
  { id: 'settings', icon: '⚙️', name: '설정' },
];

// onPick: 난이도를 바꾼 뒤 다시 그릴 화면 (기본은 홈)
function levelPicker(size = '', onPick = () => showHome()) {
  return el('div', { class: `level-seg ${size}`, role: 'radiogroup', 'aria-label': '난이도' },
    LEVELS.map((lv, k) => el('button', {
      class: `seg${k === settings.level ? ' on' : ''}`,
      role: 'radio',
      'aria-checked': String(k === settings.level),
      onclick: () => {
        settings.level = k;
        store.set('level', k);
        onPick();
      },
    }, el('span', { class: 'seg-name' }, lv.name))));
}

function gameCard(g) {
  const best = store.get(bestKey(g, settings.level), null);
  return el('button', { class: 'game-card', style: `--c:${g.color}`, onclick: () => playGame(g) },
    el('div', { class: 'gc-icon' }, g.icon),
    el('div', { class: 'gc-body' },
      el('div', { class: 'gc-title' }, g.title),
      el('div', { class: 'gc-desc' }, g.desc),
      el('span', { class: 'gc-skill' }, g.skill)),
    best == null ? null : el('div', { class: 'gc-best' }, `최고 ${best}점`));
}

function tabHeader(title, sub) {
  return [el('header', { class: 'home-top' }, el('h1', {}, title)), sub ? el('p', { class: 'sub' }, sub) : null];
}

// 오늘의 학습에 없는 놀이 중 8가지를 예시로 (날마다 바뀜)
function gamePicks() {
  const today = dateKey(new Date());
  const inDaily = new Set(dailyPlan(today).map((r) => r.game));
  const picks = withRng(`picks:${today}`, () => sample(GAMES.filter((g) => !inDaily.has(g) && (!g.optional || g.ready())), 8));
  return el('section', { class: 'pick-section' },
    el('div', { class: 'pick-head' },
      el('h2', {}, '🧩 이런 놀이도 있어요'),
      el('button', { class: 'pick-all', onclick: () => showHome('games') }, `전체 ${GAMES.length}가지 ›`)),
    el('div', { class: 'pick-grid' }, picks.map((g) =>
      el('button', { class: 'pick-card', style: `--c:${g.color}`, onclick: () => playGame(g) },
        el('span', { class: 'pick-icon' }, g.icon),
        el('b', {}, g.title),
        el('span', {}, g.desc)))));
}

// 사이트 로고: 왼쪽에 쑥쑥이(새싹 친구), 오른쪽에 장난감 블록 글자 (쑥쑥 · 생각놀이)
const LOGO_SVG = `
<svg viewBox="0 0 410 72" aria-hidden="true" focusable="false">
  <g transform="translate(-4 -6) scale(.8)">
    <path d="M50 36 V22" stroke="#4fa86f" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="37" cy="20" rx="14" ry="7.5" fill="#6cc08a" transform="rotate(-28 37 20)"/>
    <ellipse cx="63" cy="20" rx="14" ry="7.5" fill="#4fa86f" transform="rotate(28 63 20)"/>
    <circle cx="50" cy="62" r="28" fill="#a9dea1"/>
    <circle cx="40" cy="58" r="4.2" fill="#3b3226"/><circle cx="60" cy="58" r="4.2" fill="#3b3226"/>
    <circle cx="41.4" cy="56.6" r="1.3" fill="#fff"/><circle cx="61.4" cy="56.6" r="1.3" fill="#fff"/>
    <circle cx="32" cy="68" r="4.5" fill="#f4a9a0" opacity=".8"/><circle cx="68" cy="68" r="4.5" fill="#f4a9a0" opacity=".8"/>
    <path d="M43 69 Q50 76 57 69" stroke="#3b3226" stroke-width="3.2" stroke-linecap="round" fill="none"/>
  </g>
  <g transform="translate(78 0)">
  <g font-family="Jua, sans-serif" font-size="29" text-anchor="middle">
    <g transform="translate(6 16) rotate(-5 24 24)"><rect width="48" height="48" rx="13" fill="#d4e8cf"/><text x="24" y="34" fill="#3f8f5a">쑥</text></g>
    <g transform="translate(58 16) rotate(4 24 24)"><rect width="48" height="48" rx="13" fill="#d4e8cf"/><text x="24" y="34" fill="#3f8f5a">쑥</text></g>
    <g transform="translate(122 16) rotate(-3 24 24)"><rect width="48" height="48" rx="13" fill="#f8e2b2"/><text x="24" y="34" fill="#5e4f3c">생</text></g>
    <g transform="translate(174 16) rotate(4 24 24)"><rect width="48" height="48" rx="13" fill="#d5e6f6"/><text x="24" y="34" fill="#5e4f3c">각</text></g>
    <g transform="translate(226 16) rotate(-4 24 24)"><rect width="48" height="48" rx="13" fill="#f3d7cf"/><text x="24" y="34" fill="#5e4f3c">놀</text></g>
    <g transform="translate(278 16) rotate(3 24 24)"><rect width="48" height="48" rx="13" fill="#e4dbf3"/><text x="24" y="34" fill="#5e4f3c">이</text></g>
  </g>
  <path d="M48 17 q6 -15 22 -15 q-6 14 -22 15z" fill="#6cc08a"/>
  </g>
</svg>`;

function logoTitle() {
  const h1 = el('h1', { class: 'logo', 'aria-label': '쑥쑥 생각놀이' });
  h1.innerHTML = LOGO_SVG;
  return h1;
}

function todayTab() {
  return [
    el('header', { class: 'home-top' },
      logoTitle(),
      shareTopButton()),
    levelPicker('compact'),
    levelTestLink(),
    dailyCard(),
    stickerCard(),
    gamePicks(),
    helperCard(),
    feedbackCard(),
    shareCard(),
    el('footer', { class: 'home-foot' },
      el('a', { class: 'faq-btn', href: 'faq.html' },
        el('span', { class: 'faq-icon' }, '🙋'),
        el('span', { class: 'faq-text' },
          el('b', {}, '자주 묻는 질문'),
          el('small', {}, '궁금한 점, 여기서 먼저 찾아보세요')),
        el('span', { class: 'faq-go' }, '›')),
      el('button', { class: 'about-banner', onclick: () => showGuide('about') },
        el('span', { class: 'about-banner-icon' }, mascot('smile')),
        el('span', { class: 'about-banner-text' },
          el('b', {}, '쑥쑥 생각놀이 소개'),
          el('small', {}, '만든 이유와 30초 소개 영상을 볼 수 있어요')),
        el('span', { class: 'faq-go' }, '›')),
      el('div', { class: 'home-foot-links' },
        el('button', { class: 'link-btn', onclick: () => showGuide('howto') }, '사용 방법'), ' · ',
        el('a', { href: 'privacy.html' }, '개인정보처리방침'), ' · ', el('span', {}, 'ssukssuknori.app'))),
  ];
}

/* ---------- 공유하기 ---------- */
// 많은 앱이 쓰는 공유 모양(점 세 개를 선으로 이은 그림) + '공유' 글자
const SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.6 15.4 6.4M8.6 13.4l6.8 4.2" fill="none" stroke-width="2" stroke-linecap="round"/></svg>';
function shareTopButton() {
  const btn = el('button', { class: 'share-top', 'aria-label': '공유하기', title: '친구에게 공유하기', onclick: shareSite });
  btn.innerHTML = `${SHARE_ICON}<span>공유</span>`;
  return btn;
}
const SITE_URL = 'https://ssukssuknori.app/';
const SHARE_TEXT = '아이와 함께하는 그림 생각놀이, 쑥쑥 생각놀이예요. 하루 10문제, 설치 없이 바로 해요!';

function shareCard() {
  return el('section', { class: 'share-card' },
    el('span', { class: 'share-icon', 'aria-hidden': 'true' }, '💌'),
    el('div', { class: 'share-text' },
      el('b', {}, '친구에게 알려 주세요'),
      el('span', {}, '함께 하면 더 즐거워요')),
    el('button', { class: 'share-btn', onclick: shareSite }, '📤 공유하기'));
}

// 휴대폰은 공유 창(카카오톡 · 문자 등)을 열고, 안 되는 곳에서는 주소를 복사함
async function shareSite() {
  if (navigator.share) {
    try {
      await navigator.share({ title: '쑥쑥 생각놀이', text: SHARE_TEXT, url: SITE_URL });
    } catch {}
    return;
  }
  const text = `${SHARE_TEXT}\n${SITE_URL}`;
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    const box = el('textarea', { style: 'position:fixed;opacity:0' });
    box.value = text;
    document.body.append(box);
    box.select();
    try { copied = document.execCommand('copy'); } catch {}
    box.remove();
  }
  toast(copied ? '주소를 복사했어요. 친구에게 붙여 넣어 보내 주세요!' : `이 주소를 보내 주세요: ${SITE_URL}`);
}

function toast(text) {
  document.querySelector('.toast')?.remove();
  const node = el('div', { class: 'toast', role: 'status' }, text);
  document.body.append(node);
  setTimeout(() => node.remove(), 2800);
}

function gamesTab() {
  const current = store.get('gameCat', 'all');
  const tabs = [{ id: 'all', icon: '✨', name: '전체' }, ...CATEGORIES];
  const shown = current === 'all' ? CATEGORIES : CATEGORIES.filter((c) => c.id === current);
  return [
    ...tabHeader('놀이', '하고 싶은 놀이를 골라요'),
    el('button', { class: 'report-link ws-link', onclick: () => showWorksheets() }, '🖨️ 종이 학습지로 인쇄해서 하기 ›'),
    el('div', { class: 'level-label' }, '난이도'),
    levelPicker(),
    el('div', { class: 'cat-tabs', role: 'tablist' },
      tabs.map((c) => el('button', {
        class: `cat-tab${c.id === current ? ' on' : ''}`,
        role: 'tab',
        'aria-selected': String(c.id === current),
        onclick: () => {
          store.set('gameCat', c.id);
          showHome('games');
        },
      }, `${c.icon} ${c.name}`))),
    ...shown.map((c) => el('section', { class: 'cat-section' },
      el('h2', { class: 'cat-title' }, `${c.icon} ${c.name}`),
      el('p', { class: 'cat-desc' }, c.desc),
      el('div', { class: 'game-list' }, c.games.map(gameCard)))),
  ];
}

// 놀이 하나의 결과 비율 막대 (처음에 맞힘 / 다시 해서 맞음 / 패스)
function outcomeBar(c) {
  const total = totalOf(c);
  return el('div', { class: 'obar', role: 'img',
    'aria-label': OUTCOMES.map((o) => `${o.name} ${c[o.id]}개`).join(', ') },
  OUTCOMES.filter((o) => c[o.id] > 0).map((o) => el('span', {
    class: `obar-seg ${o.id}`,
    style: `flex-grow:${c[o.id]}`,
    title: `${o.name} ${c[o.id]}개 (${pct(c[o.id], total)}%)`,
  })));
}

// 최근 4주 달력: ⭐ 오늘의 학습 완료, 초록 바탕 놀이를 한 날
function recordCalendar(activeDays) {
  const start = daysAgo(27);
  const lead = start.getDay(); // 첫 줄을 일요일부터 맞춤
  const cells = [];
  for (let k = 0; k < lead; k++) cells.push(el('span', { class: 'cal-cell blank' }));
  for (let n = 27; n >= 0; n--) {
    const d = daysAgo(n);
    const key = dateKey(d);
    const daily = store.get(dailyKey(key), null);
    cells.push(el('span', {
      class: `cal-cell${activeDays.has(key) || daily ? ' played' : ''}${n === 0 ? ' today' : ''}`,
      title: daily ? `${d.getMonth() + 1}월 ${d.getDate()}일 오늘의 학습 ${daily.score}점` : null,
    }, el('span', { class: 'cal-date' }, String(d.getDate())), daily ? el('span', { class: 'cal-mark' }, '⭐') : null));
  }
  return el('div', { class: 'calendar' },
    [...WEEKDAYS].map((w) => el('span', { class: 'cal-head' }, w)),
    cells);
}

// 어려워하는 놀이 / 잘하는 놀이 알림 (놀이마다 5문제 이상 풀었을 때만)
const ALERT_MIN = 5;
function recordAlerts(perGame) {
  const rows = GAMES.map((g) => ({ g, c: perGame[g.id] })).filter((x) => x.c && totalOf(x.c) >= ALERT_MIN);
  const hard = rows.filter((x) => pct(x.c.first, totalOf(x.c)) < 50)
    .sort((a, b) => a.c.first / totalOf(a.c) - b.c.first / totalOf(b.c));
  const good = rows.filter((x) => totalOf(x.c) >= 8 && pct(x.c.first, totalOf(x.c)) >= 90);
  if (!hard.length && !good.length) {
    return el('p', { class: 'empty' }, `아직 알림이 없어요. 한 놀이를 ${ALERT_MIN}문제 넘게 풀면 알려 드려요.`);
  }
  return el('div', { class: 'alerts' },
    hard.map(({ g, c }) => el('div', { class: 'alert hard' },
      el('div', { class: 'alert-icon' }, '🌱'),
      el('div', { class: 'alert-body' },
        el('b', {}, `${g.title} 놀이를 어려워해요`),
        el('span', {}, `처음에 맞힌 문제가 ${pct(c.first, totalOf(c))}%예요. 조금 더 연습해 보세요.`)),
      el('button', { class: 'alert-btn', onclick: () => playGame(g) }, '해 보기'))),
    good.map(({ g, c }) => el('div', { class: 'alert good' },
      el('div', { class: 'alert-icon' }, '🌟'),
      el('div', { class: 'alert-body' },
        el('b', {}, `${g.title} 놀이를 잘해요`),
        el('span', {}, settings.level < 2
          ? `처음에 맞힌 문제가 ${pct(c.first, totalOf(c))}%예요. 난이도를 올려 봐도 좋아요.`
          : `처음에 맞힌 문제가 ${pct(c.first, totalOf(c))}%예요. 정말 잘하고 있어요!`)))),
  );
}

function recordsTab() {
  const range7 = store.get('recRange', 7);
  const { perGame, activeDays } = statsSince(range7);
  const sum = Object.values(perGame).reduce((t, c) => ({
    first: t.first + c.first, retry: t.retry + c.retry, pass: t.pass + c.pass,
  }), { first: 0, retry: 0, pass: 0 });
  const total = totalOf(sum);
  const played = GAMES.filter((g) => perGame[g.id] && totalOf(perGame[g.id]) > 0)
    .sort((a, b) => totalOf(perGame[b.id]) - totalOf(perGame[a.id]));
  const notPlayed = GAMES.filter((g) => !played.includes(g));
  const dailies = range(0, 13)
    .map((n) => ({ d: daysAgo(n), rec: store.get(dailyKey(dateKey(daysAgo(n))), null) }))
    .filter((x) => x.rec);
  const { activeDays: calendarDays } = statsSince(28);

  return [
    ...tabHeader('기록', '이 기기에서 한 학습이 저장돼요'),
    el('button', { class: 'report-link', onclick: showReport }, '📋 선생님께 보여 드릴 기록 한 장 ›'),
    el('div', { class: 'level-seg range-seg', role: 'radiogroup', 'aria-label': '기간' },
      [7, 30].map((n) => el('button', {
        class: `seg${n === range7 ? ' on' : ''}`,
        role: 'radio',
        'aria-checked': String(n === range7),
        onclick: () => {
          store.set('recRange', n);
          showHome('records');
        },
      }, `최근 ${n}일`))),
    el('div', { class: 'stat-tiles' },
      el('div', { class: 'stat-tile' }, el('b', {}, `${activeDays.size}일`), el('span', {}, '학습한 날')),
      el('div', { class: 'stat-tile' }, el('b', {}, `${total}개`), el('span', {}, '푼 문제')),
      el('div', { class: 'stat-tile' }, el('b', {}, total ? `${pct(sum.first, total)}%` : '-'), el('span', {}, '처음에 맞힘'))),
    el('section', { class: 'panel' },
      el('h2', { class: 'panel-title' }, '💡 알림'),
      recordAlerts(perGame)),
    el('section', { class: 'panel' },
      el('h2', { class: 'panel-title' }, '🧩 놀이별 결과'),
      played.length
        ? [
          el('div', { class: 'obar-legend' },
            OUTCOMES.map((o) => el('span', {}, el('i', { class: `swatch ${o.id}` }), o.name))),
          el('ul', { class: 'obar-list' }, played.map((g) => {
            const c = perGame[g.id];
            const t = totalOf(c);
            return el('li', {},
              el('div', { class: 'obar-head' },
                el('span', {}, `${g.icon} ${g.title}`),
                el('span', { class: 'obar-num' }, `${t}문제 · 처음에 맞힘 ${pct(c.first, t)}%`)),
              outcomeBar(c),
              el('div', { class: 'obar-detail' },
                OUTCOMES.map((o) => `${o.name} ${c[o.id]}`).join(' · ')));
          })),
        ]
        : el('p', { class: 'empty' }, '아직 기록이 없어요. 놀이를 해 보세요!'),
      notPlayed.length && played.length
        ? el('p', { class: 'not-played' }, `아직 안 한 놀이: ${notPlayed.map((g) => g.title).join(', ')}`)
        : null),
    el('section', { class: 'panel' },
      el('h2', { class: 'panel-title' }, '📅 최근 4주'),
      recordCalendar(calendarDays),
      el('p', { class: 'cal-legend' }, '⭐ 오늘의 학습을 끝낸 날 · 초록색 놀이를 한 날')),
    el('section', { class: 'panel' },
      el('h2', { class: 'panel-title' }, '📋 오늘의 학습 점수 (최근 2주)'),
      dailies.length
        ? el('ul', { class: 'rec-list' }, dailies.map(({ d, rec }) => el('li', {},
          el('span', {}, `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`),
          el('span', { class: 'rec-meta' }, `${LEVELS[rec.level]?.name ?? ''} · ${rec.correct}/${rec.total} 맞음`),
          el('b', {}, `${rec.score}점`))))
        : el('p', { class: 'empty' }, '아직 기록이 없어요. 오늘의 학습을 해 보세요!')),
  ];
}

// 목소리 고르기 · 높이 · 빠르기 · 들어 보기
function voiceSettings() {
  const voices = koreanVoices();
  const preview = () => {
    unlockSound();
    speak('안녕! 나는 쑥쑥이야. 같이 놀자!');
  };
  const optionSeg = (options, current, key) => el('div', { class: 'level-seg voice-seg', role: 'radiogroup' },
    options.map((o) => el('button', {
      class: `seg${o.v === current ? ' on' : ''}`,
      role: 'radio',
      'aria-checked': String(o.v === current),
      onclick: () => {
        settings[key] = o.v;
        store.set(key, o.v);
        preview();
        showHome('settings');
      },
    }, el('span', { class: 'seg-name' }, o.name))));
  const select = el('select', {
    id: 'voice-select',
    class: 'voice-select',
    'aria-label': '목소리',
    onchange: (e) => {
      settings.voice = e.target.value;
      store.set('voice', settings.voice);
      pickKoreanVoice();
      preview();
    },
  },
  el('option', { value: '' }, '자동으로 고르기'),
  voices.map((v) => el('option', { value: v.name, selected: v.name === settings.voice }, v.name)));
  return el('div', { class: 'voice-box' },
    el('div', { class: 'setting-name' }, '🗣️ 목소리'),
    voices.length > 1 ? select : el('p', { class: 'setting-desc' },
      voices.length ? `이 기기의 한국어 목소리: ${voices[0].name}` : '이 기기에서 한국어 목소리를 찾지 못했어요.'),
    el('div', { class: 'setting-desc voice-label' }, '목소리 높이'),
    optionSeg(PITCH_OPTIONS, settings.pitch, 'pitch'),
    el('div', { class: 'setting-desc voice-label' }, '빠르기'),
    optionSeg(RATE_OPTIONS, settings.rate, 'rate'),
    el('button', { class: 'more-games', disabled: !settings.sound, onclick: preview },
      el('span', {}, '▶ 목소리 들어 보기'), el('span', {}, '🔊')),
  );
}

function settingsTab() {
  const soundBtn = el('button', {
    class: `switch${settings.sound ? ' on' : ''}`,
    role: 'switch',
    'aria-checked': String(settings.sound),
    onclick: () => {
      settings.sound = !settings.sound;
      store.set('sound', settings.sound);
      showHome('settings');
    },
  }, settings.sound ? '켬' : '끔');
  const tipsBtn = el('button', {
    class: `switch${settings.tips ? ' on' : ''}`,
    role: 'switch',
    'aria-checked': String(settings.tips),
    onclick: () => {
      settings.tips = !settings.tips;
      store.set('tips', settings.tips);
      showHome('settings');
    },
  }, settings.tips ? '켬' : '끔');
  return [
    ...tabHeader('설정'),
    el('section', { class: 'panel' },
      el('div', { class: 'setting-row' },
        el('div', {}, el('div', { class: 'setting-name' }, '🔊 소리'), el('div', { class: 'setting-desc' }, '문제 읽어주기와 효과음')),
        soundBtn),
      el('div', { class: 'setting-row' },
        el('div', {}, el('div', { class: 'setting-name' }, '👪 보호자 도움말'), el('div', { class: 'setting-desc' }, '놀이를 시작할 때 맨 위에 한 줄 도움말')),
        tipsBtn),
      el('button', {
        class: 'more-games sound-test',
        disabled: !settings.sound,
        onclick: () => {
          unlockSound();
          tone([660, 880, 1320]);
          speak('안녕하세요. 쑥쑥 생각놀이예요. 소리가 잘 들리나요?');
        },
      }, el('span', {}, '🔈 소리 시험하기'), el('span', {}, '▶')),
      el('p', { class: 'setting-desc sound-help' },
        '소리가 안 나면: 무음 모드를 끄고 볼륨을 올려 주세요. 효과음만 나고 말소리가 안 나면 기기 설정의 ‘텍스트 음성 변환’에서 한국어 음성을 받아 주세요.'),
      voiceSettings(),
      el('div', { class: 'setting-name' }, '난이도'),
      levelPicker(),
      levelTestLink()),
    el('section', { class: 'panel' },
      el('h2', { class: 'panel-title' }, '👪 보호자 안내'),
      el('a', { class: 'more-games', href: 'faq.html' },
        el('span', {}, '❓ 자주 묻는 질문'), el('span', {}, '›')),
      el('button', { class: 'more-games', onclick: () => showFamilySetup() },
        el('span', {}, '👨‍👩‍👧 우리 가족 사진 넣기'), el('span', {}, '›')),
      el('button', { class: 'more-games', onclick: () => showWorksheets() },
        el('span', {}, '🖨️ 종이 학습지 인쇄'), el('span', {}, '›')),
      el('button', { class: 'more-games', onclick: showFeedback },
        el('span', {}, '💬 의견 게시판'), el('span', {}, '›')),
      el('button', { class: 'more-games', onclick: () => showGuide('about') },
        el('span', {}, '🌱 쑥쑥 생각놀이 소개'), el('span', {}, '›')),
      el('button', { class: 'more-games', onclick: () => showGuide('howto') },
        el('span', {}, '📖 사용 방법'), el('span', {}, '›'))),
  ];
}

/* ---------- 화면: 소개 · 사용 방법 ---------- */
// 만든 원칙 (실제로 사이트에 들어간 기능만 적음)
const PRINCIPLES = [
  { icon: '🔍', title: '한눈에 구분되는 큰 그림', text: '색과 모양이 확실히 다른 그림만 크게 보여 줘요. 비슷해서 헷갈리는 그림은 함께 나오지 않아요.' },
  { icon: '🔊', title: '소리로 읽어 주는 문제', text: '글을 몰라도 할 수 있도록 문제를 읽어 줘요. 🔊 버튼으로 몇 번이고 다시 들을 수 있어요.' },
  { icon: '💡', title: '틀려도 괜찮아요', text: '틀리면 정답이 반짝이고 직접 눌러서 끝내요. 실패로 끝나지 않고 맞힌 경험이 쌓여요.' },
  { icon: '📋', title: '미리 아는 순서', text: '오늘 할 놀이를 일정표로 먼저 보여 주고, 하나 끝날 때마다 ✔ 표시해요.' },
  { icon: '⏱️', title: '하루 5분, 매일 조금씩', text: '오늘의 학습은 10문제예요. 날마다 놀이가 골고루 바뀌어서 여러 능력을 고르게 연습해요.' },
];

const HOWTO_STEPS = [
  { icon: '🎚️', title: '난이도 고르기', text: '처음이면 오늘 탭의 ‘🧪 우리 아이 난이도 알아보기’로 알맞은 단계를 찾아 보세요. 기록 탭에서 ‘잘해요’ 알림이 나오면 한 단계 올려도 좋아요.' },
  { icon: '📅', title: '오늘의 학습 시작', text: '‘오늘의 학습’을 누르면 일정표가 나와요. ‘🎁 다 하면 뭐 할까?’로 끝나고 할 일을 먼저 골라 두면 시작하기 쉬워요.' },
  { icon: '👆', title: '문제 풀기', text: '그림을 눌러 답해요. 🔊는 다시 듣기, ‘패스’는 넘어가기예요. 틀리면 반짝이는 정답을 눌러 끝내요.' },
  { icon: '⭐', title: '결과와 칭찬 스티커', text: '끝나면 문제마다 결과가 나와요. 오늘의 학습을 처음 끝낸 날마다 칭찬 스티커를 받고, 10개 모으면 쑥쑥이가 자라요.' },
  { icon: '🧩', title: '놀이 골라 하기', text: '놀이 탭에서 영역별로 원하는 놀이를 골라 할 수 있어요. ‘🖨️ 종이 학습지’로 인쇄해서 연필로 할 수도 있어요.' },
  { icon: '🗣️', title: '말하기 카드', text: '아래 ‘말하기’ 메뉴에서 그림을 누르면 “물 주세요”, “도와주세요”를 대신 말해 줘요.' },
  { icon: '🧰', title: '생활 도우미', text: '그림 이야기(병원 · 미용실 등 미리 보기), 먼저 · 다음 보드, 숨 쉬기를 생활 속에서 써 보세요.' },
  { icon: '📊', title: '기록 확인', text: '기록 탭에서 놀이별 결과를 보고, ‘📋 기록 한 장’은 선생님께 보여 드릴 수 있게 인쇄 · 저장할 수 있어요.' },
  { icon: '💬', title: '의견 남기기', text: '있었으면 하는 놀이나 불편한 점은 의견 게시판에 남겨 주세요. 하나하나 읽고 고쳐 나가요.' },
];

const PARENT_TIPS = [
  '아이 옆에 앉아 함께 해 주세요. 그림 이름을 소리 내어 말해 주면 더 좋아요.',
  '맞혔을 때뿐 아니라 끝까지 해 본 것도 칭찬해 주세요.',
  '매일 비슷한 시간에 하면 아이가 순서를 예상하기 쉬워요.',
  '힘들어하면 바로 멈추세요. 오늘의 학습은 다음에 다시 열어도 같은 문제가 나와요.',
  '소리에 예민하면 설정에서 소리를 끌 수 있어요.',
];

function guideAbout() {
  return [
    el('section', { class: 'guide-hero' },
      el('div', { class: 'guide-hero-icon' }, '🌱'),
      el('h2', {}, '쑥쑥 생각놀이는'),
      el('p', {}, '또래보다 천천히 배우는 아이가 집에서 놀이하듯 기초 인지를 연습하는 무료 학습 놀이예요. 짧고 쉬운 문제를 매일 조금씩, 아이의 속도에 맞춰 해요.')),
    el('section', { class: 'panel intro-video' },
      el('h2', { class: 'panel-title' }, '🎬 30초 만에 둘러보기'),
      // 눌러야 받기 시작함 (데이터 아끼기). 영상은 운영자가 만든 소개 영상(H.264로 바꿔 어느 기기에서나 재생)
      el('video', { src: 'media/intro.mp4?v=5', poster: 'media/intro-poster.jpg?v=2', controls: true, playsinline: true, preload: 'none' })),
    el('section', { class: 'panel' },
      el('h2', { class: 'panel-title' }, '이렇게 만들었어요'),
      el('ul', { class: 'feature-list' }, PRINCIPLES.map((p) => el('li', {},
        el('span', { class: 'feature-icon' }, p.icon),
        el('div', {}, el('b', {}, p.title), el('span', {}, p.text)))))),
    el('section', { class: 'panel' },
      el('h2', { class: 'panel-title' }, `놀이 ${GAMES.length}가지, ${CATEGORIES.length}가지 영역`),
      CATEGORIES.map((c) => el('div', { class: 'guide-cat' },
        el('div', { class: 'guide-cat-name' }, `${c.icon} ${c.name}`, el('small', {}, c.desc)),
        el('div', { class: 'guide-cat-games' }, c.games.map((g) => el('span', { style: `--c:${g.color}` }, `${g.icon} ${g.title}`)))))),
    el('section', { class: 'panel note-panel' },
      el('h2', { class: 'panel-title' }, '꼭 알아 두세요'),
      el('ul', { class: 'guide-list' },
        el('li', {}, '쑥쑥 생각놀이는 집에서 하는 연습 도구예요. 진단이나 치료를 대신하지 않아요.'),
        el('li', {}, '아이를 맡고 계신 치료사 · 특수교사 선생님과 목표를 함께 정하면 더 좋아요.'),
        el('li', {}, '로그인이 없어요. 아이의 학습 기록(점수 · 달력)은 이 기기의 브라우저에만 저장돼요.'),
        el('li', {}, '사이트 운영을 위해 접속 정보(접속 시간 · IP 주소 · 기기 종류)를 모아요. ',
          el('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, '개인정보처리방침 보기')),
        el('li', {}, '무료인지, 기록은 어디에 저장되는지 등 궁금한 점은 ',
          el('a', { href: 'faq.html' }, '자주 묻는 질문'), '에 모아 두었어요.'),
        el('li', {}, '실사 사진은 누구나 무료로 쓸 수 있는 사진(CC0 · 퍼블릭 도메인, 일부 얼굴 사진은 출처 표시 조건)이에요. ',
          el('a', { href: 'https://github.com/lshbonita1/kids-thinking-play/blob/main/photos/CREDITS.md', target: '_blank', rel: 'noopener' }, '사진 출처 보기')))),
  ];
}

function guideHowto() {
  return [
    el('section', { class: 'panel' },
      el('h2', { class: 'panel-title' }, '이렇게 해요'),
      el('ol', { class: 'step-list' }, HOWTO_STEPS.map((st, k) => el('li', {},
        el('span', { class: 'step-num' }, String(k + 1)),
        el('span', { class: 'feature-icon' }, st.icon),
        el('div', {}, el('b', {}, st.title), el('span', {}, st.text)))))),
    el('section', { class: 'panel' },
      el('h2', { class: 'panel-title' }, '👪 보호자 도움말'),
      el('ul', { class: 'guide-list' }, PARENT_TIPS.map((t) => el('li', {}, t)))),
    el('section', { class: 'panel' },
      el('h2', { class: 'panel-title' }, '📱 휴대폰 홈 화면에 추가하기'),
      el('p', { class: 'guide-p' }, '앱처럼 아이콘을 눌러 바로 열 수 있어요.'),
      el('ul', { class: 'guide-list' },
        el('li', {}, '아이폰(사파리): 아래 공유 버튼 → ‘홈 화면에 추가’'),
        el('li', {}, '안드로이드(크롬): 오른쪽 위 ⋮ → ‘홈 화면에 추가’'))),
    el('button', { class: 'btn-main', onclick: () => { store.set('homeTab', 'today'); showHome('today'); } }, '📅 오늘의 학습 하러 가기'),
  ];
}

function showGuide(section) {
  window.speechSynthesis?.cancel();
  const tabs = [{ id: 'about', name: '소개' }, { id: 'howto', name: '사용 방법' }];
  mount(el('div', { class: 'screen guide' },
    el('header', { class: 'guide-top' },
      el('button', { class: 'icon-btn', 'aria-label': '돌아가기', onclick: () => showHome() }, '←'),
      el('h1', {}, '쑥쑥 생각놀이 안내')),
    el('div', { class: 'level-seg range-seg', role: 'tablist' },
      tabs.map((t) => el('button', {
        class: `seg${t.id === section ? ' on' : ''}`,
        role: 'tab',
        'aria-selected': String(t.id === section),
        onclick: () => showGuide(t.id),
      }, t.name))),
    ...(section === 'howto' ? guideHowto() : guideAbout()),
  ));
}

function tabBar(current) {
  return el('nav', { class: 'tab-bar', 'aria-label': '메뉴' },
    HOME_TABS.map((t) => el('button', {
      class: `tab-btn${t.id === current ? ' on' : ''}`,
      'aria-current': t.id === current ? 'page' : null,
      onclick: () => showHome(t.id),
    }, el('span', { class: 'tab-icon' }, t.icon), el('span', {}, t.name))));
}

function showHome(tab) {
  window.speechSynthesis?.cancel();
  // 버튼에서 바로 불리면 이벤트가 넘어오므로, 글자가 아니면 마지막으로 본 탭으로
  if (typeof tab !== 'string' || !HOME_TABS.some((t) => t.id === tab)) tab = store.get('homeTab', 'today');
  store.set('homeTab', tab);
  const content = { today: todayTab, games: gamesTab, talk: talkTab, records: recordsTab, settings: settingsTab }[tab]();
  mount(el('div', { class: 'screen home' }, ...content, tabBar(tab)));
}

/* ---------- 말하기 카드 (그림을 누르면 대신 말해 줌) ---------- */
// 말이 아직 어려운 아이가 그림을 눌러 하고 싶은 말을 전하는 도구 (설정에서 소리를 꺼도 말함)
const TALK_GROUPS = [
  { name: '필요해요', color: '#dbeefd', cards: [['💧', '물 주세요'], ['🍚', '밥 주세요'], ['🍪', '간식 주세요'], ['🚽', '화장실 가고 싶어요'], ['😴', '졸려요']] },
  { name: '부탁해요', color: '#fdeccf', cards: [['➕', '더 주세요'], ['✋', '그만할래요'], ['🙏', '도와주세요'], ['🤗', '안아 주세요'], ['🛋️', '쉬고 싶어요']] },
  { name: '내 기분', color: '#fde2e2', cards: [['😄', '좋아요'], ['😣', '싫어요'], ['🤕', '아파요'], ['😢', '슬퍼요'], ['😠', '화나요']] },
  { name: '하고 싶어요', color: '#e3f3e6', cards: [['⚽', '공놀이 하고 싶어요'], ['📚', '책 읽고 싶어요'], ['🛝', '놀이터 가고 싶어요'], ['🎵', '노래 듣고 싶어요'], ['🏠', '집에 가고 싶어요']] },
];

function talkTab() {
  const said = el('div', { class: 'talk-said', 'aria-live': 'polite' }, el('span', { class: 'talk-said-hint' }, '그림을 누르면 말해 줘요'));
  const say = (icon, text, node) => {
    speak(text, true);
    said.replaceChildren(el('span', { class: 'talk-said-icon' }, icon), el('b', {}, text));
    node.classList.remove('pop');
    void node.offsetWidth;
    node.classList.add('pop');
  };
  const card = ([icon, text], color, cls = '') => {
    const node = el('button', { class: `talk-card ${cls}`, style: `--c:${color}`, onclick: () => say(icon, text, node) },
      el('span', { class: 'talk-icon' }, icon), el('span', { class: 'talk-text' }, text));
    return node;
  };
  return [
    ...tabHeader('말하기', '하고 싶은 말을 그림으로 눌러요'),
    said,
    el('div', { class: 'talk-yesno' }, card(['👍', '네'], '#d5f0dc', 'big'), card(['👎', '아니요'], '#fbdcdc', 'big')),
    el('section', { class: 'talk-group' },
      el('h2', {}, '⭐ 우리 집 카드'),
      el('div', { class: 'talk-grid' },
        talkCustomList().map((c) => {
          const node = el('button', { class: 'talk-card photo', style: '--c:#fff3c4', onclick: () => say(el('img', { class: 'talk-said-img', src: c.img, alt: '' }), c.name, node) },
            el('img', { class: 'talk-photo', src: c.img, alt: '' }), el('span', { class: 'talk-text' }, c.name));
          return node;
        }),
        el('button', { class: 'talk-card add', style: '--c:#fffaf0', onclick: showTalkCardEditor }, el('span', { class: 'talk-icon' }, '➕'), el('span', { class: 'talk-text' }, '사진으로 카드 만들기')))),
    ...TALK_GROUPS.map((g) => el('section', { class: 'talk-group' },
      el('h2', {}, g.name),
      el('div', { class: 'talk-grid' }, g.cards.map((c) => card(c, g.color))))),
    helperCard(),
  ];
}

/* ---------- 생활 도우미: 그림 이야기 · 먼저 다음 · 숨 쉬기 ---------- */
function helperCard() {
  return el('section', { class: 'helper-card' },
    el('h2', {}, '🧰 생활 도우미'),
    el('div', { class: 'helper-grid' },
      el('button', { class: 'helper-btn', style: '--c:#fdeccf', onclick: () => showStories() }, el('span', {}, '📖'), el('b', {}, '그림 이야기')),
      el('button', { class: 'helper-btn', style: '--c:#dbeefd', onclick: showFirstThen }, el('span', {}, '➡️'), el('b', {}, '먼저 · 다음')),
      el('button', { class: 'helper-btn', style: '--c:#e3f3e6', onclick: showBreathing }, el('span', {}, '🎈'), el('b', {}, '숨 쉬기')),
      el('button', { class: 'helper-btn', style: '--c:#fde2e2', onclick: showRewardPicker }, el('span', {}, '🎁'), el('b', {}, '다 하면 뭐 할까?')),
      el('button', { class: 'helper-btn', style: '--c:#e8e1f6', onclick: showReport }, el('span', {}, '📋'), el('b', {}, '기록 한 장')),
      el('button', { class: 'helper-btn', style: '--c:#f5ecd3', onclick: () => showWorksheets() }, el('span', {}, '🖨️'), el('b', {}, '종이 학습지'))));
}

function toolScreen(title, ...kids) {
  window.speechSynthesis?.cancel();
  return mount(el('div', { class: 'screen guide tool' },
    el('header', { class: 'guide-top' },
      el('button', { class: 'icon-btn', 'aria-label': '돌아가기', onclick: () => showHome() }, '←'),
      el('h1', {}, title)),
    ...kids));
}

// 처음 가 보는 곳 · 지켜야 할 일을 미리 그림으로 보여 주는 짧은 이야기 (묶음별)
const STORY_GROUPS = [
  { name: '생활 습관', stories: [
    { icon: '🚽', title: '화장실에 가요', pages: [
      ['🚽', '쉬가 마려우면 화장실에 가요.'],
      ['👖', '바지를 내리고 변기에 앉아요.'],
      ['🧻', '다 하면 휴지로 닦아요.'],
      ['💦', '물을 내려요. 쏴아 소리가 나요.'],
      ['🧼', '손을 깨끗이 씻으면 끝!'],
    ] },
    { icon: '🧴', title: '머리를 감아요', pages: [
      ['🛁', '목욕할 때 머리도 감아요.'],
      ['🙈', '고개를 숙이고 눈을 꼭 감아요.'],
      ['🫧', '거품을 보글보글 묻혀요.'],
      ['🚿', '물로 쏴아 헹궈요. 금방 끝나요.'],
      ['😊', '수건으로 닦으면 머리가 보송보송!'],
    ] },
    { icon: '✂️', title: '손톱을 깎아요', pages: [
      ['🖐️', '손톱이 길면 깎아야 해요.'],
      ['🪑', '엄마 아빠 무릎에 앉아요.'],
      ['✂️', '똑똑 소리가 나요. 아프지 않아요.'],
      ['🔟', '손가락 열 개를 하나씩 깎아요.'],
      ['✨', '손톱이 깔끔해졌어요!'],
    ] },
    { icon: '👕', title: '옷을 입어요', pages: [
      ['👕', '머리를 쏙 넣어요.'],
      ['💪', '팔을 하나씩 쏙쏙 넣어요.'],
      ['👖', '바지에 다리를 하나씩 넣어요.'],
      ['🧦', '양말을 신어요.'],
      ['🌟', '혼자서도 잘 입었어요!'],
    ] },
    { icon: '🌙', title: '잠자기 전에', pages: [
      ['🌙', '밤이 되면 잘 준비를 해요.'],
      ['🪥', '이를 닦아요.'],
      ['👚', '잠옷으로 갈아입어요.'],
      ['📖', '책을 한 권 읽어요.'],
      ['😴', '불을 끄고 눈을 감아요. 잘 자요!'],
    ] },
  ] },
  { name: '밖에 나가요', stories: [
    { icon: '🏫', title: '어린이집에 가요', pages: [
      ['🎒', '가방을 메고 어린이집에 가요.'],
      ['👋', '엄마 아빠와 안녕 인사해요.'],
      ['🧑‍🏫', '선생님과 친구들이 반갑게 맞아 줘요.'],
      ['🧸', '친구들과 함께 놀아요.'],
      ['🤗', '놀고 나면 엄마 아빠가 데리러 와요.'],
    ] },
    { icon: '🚌', title: '버스를 타요', pages: [
      ['🚏', '정류장에서 버스를 기다려요.'],
      ['🚌', '버스가 오면 차례대로 타요.'],
      ['💺', '자리에 앉거나 손잡이를 꼭 잡아요.'],
      ['🤫', '버스 안에서는 작은 목소리로 말해요.'],
      ['🔔', '내릴 때가 되면 벨을 눌러요.'],
    ] },
    { icon: '🛗', title: '엘리베이터를 타요', pages: [
      ['🛗', '엘리베이터 버튼을 눌러요.'],
      ['🚪', '문이 열리면 안으로 들어가요.'],
      ['🧍', '문에서 떨어져 가만히 서 있어요.'],
      ['🔢', '가고 싶은 층 숫자를 눌러요.'],
      ['👋', '문이 열리면 내려요. 도착!'],
    ] },
    { icon: '🚦', title: '찻길을 건너요', pages: [
      ['🚦', '찻길은 횡단보도에서 건너요.'],
      ['🔴', '빨간 불이면 멈춰서 기다려요.'],
      ['🟢', '초록 불이 켜지면 건너요.'],
      ['🤝', '엄마 아빠 손을 꼭 잡아요.'],
      ['👀', '차가 오는지 왼쪽, 오른쪽을 봐요.'],
    ] },
    { icon: '💉', title: '예방주사를 맞아요', pages: [
      ['🏥', '튼튼해지려고 예방주사를 맞아요.'],
      ['👕', '소매를 걷고 팔을 보여 줘요.'],
      ['😮‍💨', '숨을 크게 쉬어요. 하나, 둘, 셋!'],
      ['🩹', '따끔하고 금방 끝나요. 밴드를 붙여요.'],
      ['🏅', '용감하게 잘 맞았어요!'],
    ] },
    { icon: '🏥', title: '병원에 가요', pages: [
      ['🤒', '몸이 아프면 병원에 가요.'],
      ['🪑', '이름을 부를 때까지 의자에 앉아 기다려요.'],
      ['🩺', '의사 선생님이 "아" 해 보래요. 입을 크게 벌려요.'],
      ['💊', '약을 먹으면 몸이 금방 나아요.'],
      ['🌟', '다 끝났어요! 잘 참았어요.'],
    ] },
    { icon: '🦷', title: '치과에 가요', pages: [
      ['🦷', '이를 보러 치과에 가요.'],
      ['🛋️', '커다란 의자에 누워요.'],
      ['💡', '밝은 불이 켜져요. 눈을 감아도 괜찮아요.'],
      ['😮', '입을 "아" 크게 벌리고 기다려요.'],
      ['✨', '이가 반짝반짝 깨끗해졌어요!'],
    ] },
    { icon: '💇', title: '미용실에 가요', pages: [
      ['💇', '머리가 길면 미용실에 가요.'],
      ['🪑', '의자에 앉아서 가만히 있어요.'],
      ['✂️', '가위가 싹둑싹둑 소리를 내요. 아프지 않아요.'],
      ['💨', '드라이어가 윙 하고 따뜻한 바람을 불어요.'],
      ['🪞', '거울을 봐요. 정말 멋져요!'],
    ] },
    { icon: '🛒', title: '마트에 가요', pages: [
      ['🛒', '엄마 아빠랑 마트에 가요.'],
      ['🤝', '손을 꼭 잡고 함께 걸어요.'],
      ['🍎', '살 것을 카트에 담아요.'],
      ['💳', '계산대에서 차례를 기다려요.'],
      ['🏠', '다 사면 집으로 가요.'],
    ] },
  ] },
  { name: '마음 · 친구', stories: [
    { icon: '🛝', title: '차례를 기다려요', pages: [
      ['🛝', '미끄럼틀에 친구들이 줄을 서 있어요.'],
      ['🧍', '나도 맨 뒤에 서요.'],
      ['⏳', '내 차례가 올 때까지 기다려요.'],
      ['😄', '내 차례예요! 신나게 타요.'],
      ['👏', '잘 기다렸어요. 최고예요!'],
    ] },
    { icon: '🧸', title: '함께 나눠 써요', pages: [
      ['🧸', '친구도 내 장난감을 갖고 놀고 싶어요.'],
      ['🗣️', '"같이 놀자" 하고 말해요.'],
      ['🔄', '한 번은 내가, 한 번은 친구가 놀아요.'],
      ['🙅', '친구 것을 빼앗지 않아요. "빌려줘" 하고 물어봐요.'],
      ['😊', '함께 노니까 더 재미있어요!'],
    ] },
    { icon: '🔊', title: '큰 소리가 나면', pages: [
      ['🔊', '가끔 큰 소리가 나서 깜짝 놀라요.'],
      ['🙉', '귀를 손으로 막아도 괜찮아요.'],
      ['🤗', '엄마 아빠에게 "시끄러워요" 하고 말해요.'],
      ['🎈', '풍선처럼 천천히 숨을 쉬어요.'],
      ['🌈', '소리가 멈추면 다시 편안해져요.'],
    ] },
    { icon: '😢', title: '속상할 때', pages: [
      ['😢', '속상하면 눈물이 날 수 있어요.'],
      ['🗣️', '"속상해요" 하고 말로 알려요.'],
      ['🤗', '엄마 아빠가 꼭 안아 줘요.'],
      ['🎈', '숨을 천천히 쉬면 마음이 가라앉아요.'],
      ['😊', '기분이 나아지면 다시 놀아요.'],
    ] },
  ] },
];
const STORIES = STORY_GROUPS.flatMap((g) => g.stories);

function showStories(story = null, page = 0) {
  if (!story) {
    toolScreen('그림 이야기',
      el('p', { class: 'sub' }, '처음 가는 곳, 지켜야 할 일을 미리 그림으로 봐요'),
      ...STORY_GROUPS.map((g) => el('section', { class: 'story-group' },
        el('h2', {}, g.name),
        el('div', { class: 'story-list' }, g.stories.map((st) =>
          el('button', { class: 'story-item', onclick: () => showStories(st, 0) }, el('span', {}, st.icon), el('b', {}, st.title)))))));
    return;
  }
  const [icon, text] = story.pages[page];
  const last = page === story.pages.length - 1;
  toolScreen(story.title,
    el('section', { class: 'story-page' },
      el('div', { class: 'story-scene pop' }, icon),
      el('p', { class: 'story-text' }, text),
      el('button', { class: 'speak-btn', 'aria-label': '다시 듣기', onclick: () => speak(text) }, '🔊')),
    el('div', { class: 'story-dots' }, story.pages.map((_, k) => el('i', { class: k === page ? 'on' : '' }))),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn-main alt', disabled: page === 0, onclick: () => showStories(story, page - 1) }, '◀ 앞으로'),
      last
        ? el('button', { class: 'btn-main', onclick: () => showStories() }, '✅ 다 읽었어요')
        : el('button', { class: 'btn-main', onclick: () => showStories(story, page + 1) }, '다음 ▶')));
  speak(text);
}

// 먼저 할 일 → 다음에 할 일 (좋아하는 일을 '다음'에 두면 먼저 할 일을 하기 쉬워짐)
const FIRST_THEN_ITEMS = [
  ['🪥', '양치'], ['🍚', '밥 먹기'], ['👕', '옷 입기'], ['🛁', '목욕'], ['🚽', '화장실'], ['🧸', '장난감 정리'],
  ['🌱', '쑥쑥 놀이'], ['📚', '책 읽기'], ['🛝', '놀이터'], ['📺', '텔레비전'], ['🍪', '간식'], ['😴', '잠자기'],
];
const FIRST_THEN_TIMES = [0, 1, 3, 5];

function showFirstThen() {
  const saved = store.get('firstThen', { first: 0, then: 8, minutes: 0 });
  const st = { ...saved, slot: 'first', running: false, doneFirst: false, endAt: 0 };
  const box = (slot) => {
    const [icon, name] = FIRST_THEN_ITEMS[st[slot]];
    return el('button', {
      class: `ft-box${st.slot === slot && !st.running ? ' sel' : ''}${slot === 'first' && st.doneFirst ? ' done' : ''}${slot === 'then' && st.doneFirst ? ' now' : ''}`,
      onclick: () => { if (!st.running) { st.slot = slot; draw(); } },
    },
    el('span', { class: 'ft-label' }, slot === 'first' ? '먼저' : '다음'),
    el('span', { class: 'ft-icon' }, slot === 'first' && st.doneFirst ? '✅' : icon),
    el('b', {}, name),
    slot === 'first' && st.running && st.minutes ? el('span', { class: 'ft-timer' }) : null);
  };
  const root = el('div', { class: 'ft-wrap' });
  let tick = null;

  function say() {
    speak(`먼저 ${FIRST_THEN_ITEMS[st.first][1]}, 다음에 ${FIRST_THEN_ITEMS[st.then][1]}!`);
  }

  function draw() {
    const kids = [
      el('div', { class: 'ft-boards' }, box('first'), el('span', { class: 'ft-arrow' }, '➜'), box('then')),
    ];
    if (!st.running) {
      kids.push(
        el('p', { class: 'ft-help' }, `${st.slot === 'first' ? '먼저' : '다음'} 칸에 넣을 그림을 골라요`),
        el('div', { class: 'ft-pick' }, FIRST_THEN_ITEMS.map(([icon, name], k) =>
          el('button', { class: `ft-item${st[st.slot] === k ? ' on' : ''}`, onclick: () => {
            st[st.slot] = k;
            if (st.slot === 'first') st.slot = 'then';
            draw();
          } }, el('span', {}, icon), el('small', {}, name)))),
        el('div', { class: 'ft-times' }, el('span', {}, '⏱️ 먼저 할 시간'),
          FIRST_THEN_TIMES.map((m) => el('button', { class: `chip${st.minutes === m ? ' on' : ''}`, onclick: () => { st.minutes = m; draw(); } }, m ? `${m}분` : '없음'))),
        el('button', { class: 'btn-main', onclick: start }, '▶ 보여 주기'));
    } else {
      kids.push(st.doneFirst
        ? el('div', { class: 'btn-row' },
          el('button', { class: 'btn-main alt', onclick: () => { st.running = false; st.doneFirst = false; draw(); } }, '처음부터'))
        : el('div', { class: 'btn-row' },
          el('button', { class: 'btn-main alt', onclick: say }, '🔊 다시 말하기'),
          el('button', { class: 'btn-main', onclick: finishFirst }, '✅ 먼저 끝!')));
    }
    root.replaceChildren(...kids);
    updateTimer();
  }

  function start() {
    store.set('firstThen', { first: st.first, then: st.then, minutes: st.minutes });
    st.running = true;
    st.doneFirst = false;
    st.endAt = st.minutes ? Date.now() + st.minutes * 60000 : 0;
    draw();
    say();
    clearInterval(tick);
    if (st.minutes) tick = setInterval(updateTimer, 500);
  }

  function updateTimer() {
    const t = root.querySelector('.ft-timer');
    if (!root.isConnected && tick) { clearInterval(tick); return; }
    if (!t || !st.endAt) return;
    const left = Math.max(0, st.endAt - Date.now());
    t.style.setProperty('--p', `${(left / (st.minutes * 60000)) * 100}%`);
    t.textContent = `${Math.floor(left / 60000)}:${String(Math.ceil((left % 60000) / 1000) % 60).padStart(2, '0')}`;
    if (left === 0) {
      clearInterval(tick);
      st.endAt = 0;
      tone([660, 880, 660], 0.15);
      speak(`${FIRST_THEN_ITEMS[st.first][1]} 시간이 끝났어요`, true);
    }
  }

  function finishFirst() {
    clearInterval(tick);
    st.doneFirst = true;
    st.endAt = 0;
    draw();
    tone([523, 659, 784], 0.12);
    speak(`잘했어요! 이제 ${FIRST_THEN_ITEMS[st.then][1]}!`);
  }

  toolScreen('먼저 · 다음', root);
  draw();
}

// 풍선이 커지면 숨을 들이쉬고, 작아지면 내쉬어요 (4초씩, 5번)
function showBreathing() {
  const ROUNDS = 5;
  const PHASE = 4000;
  const ball = el('div', { class: 'breath-ball' }, '🎈');
  const word = el('div', { class: 'breath-word' }, '준비됐나요?');
  const count = el('div', { class: 'breath-count' }, range(1, ROUNDS).map(() => el('i')));
  const btn = el('button', { class: 'btn-main', onclick: start }, '▶ 시작하기');
  let timer = null;
  let n = 0;

  function step(phase) {
    if (!ball.isConnected) return;
    if (phase === 'in') {
      ball.className = 'breath-ball grow';
      word.textContent = '코로 숨을 들이쉬어요';
      speak('들이쉬고');
      timer = setTimeout(() => step('out'), PHASE);
    } else {
      ball.className = 'breath-ball shrink';
      word.textContent = '입으로 후 내쉬어요';
      speak('후 내쉬고');
      timer = setTimeout(() => {
        count.children[n]?.classList.add('on');
        if (++n < ROUNDS) step('in');
        else {
          ball.className = 'breath-ball';
          word.textContent = '잘했어요! 마음이 편안해졌어요 😊';
          speak('잘했어요. 마음이 편안해졌어요.');
          btn.textContent = '한 번 더 하기';
          btn.disabled = false;
        }
      }, PHASE);
    }
  }

  function start() {
    clearTimeout(timer);
    n = 0;
    [...count.children].forEach((c) => c.classList.remove('on'));
    btn.disabled = true;
    step('in');
  }

  toolScreen('숨 쉬기',
    el('p', { class: 'sub' }, '속상하거나 화날 때, 풍선과 함께 천천히 숨 쉬어요'),
    el('div', { class: 'breath-stage' }, ball), word, count, btn);
}

/* ---------- 의견 게시판 ('이런 놀이도 만들어 주세요') ---------- */
const FEEDBACK_KINDS = [['idea', '💡 놀이 제안'], ['issue', '🛠️ 불편한 점'], ['etc', '💌 칭찬 · 기타']];

function feedbackCard() {
  return el('button', { class: 'feedback-card', onclick: showFeedback },
    el('span', { class: 'feedback-card-icon' }, '💬'),
    el('span', { class: 'feedback-card-text' }, el('b', {}, '이런 놀이도 만들어 주세요'), el('small', {}, '의견 게시판에 남겨 주시면 하나하나 읽어요')),
    el('span', { class: 'feedback-card-go' }, '›'));
}

function showFeedback() {
  let kind = 'idea';
  const kindRow = el('div', { class: 'fb-kinds' });
  const drawKinds = () => kindRow.replaceChildren(...FEEDBACK_KINDS.map(([id, name]) =>
    el('button', { class: `chip${kind === id ? ' on' : ''}`, onclick: () => { kind = id; drawKinds(); } }, name)));
  drawKinds();
  const message = el('textarea', { class: 'fb-message', maxlength: '500', rows: '4', placeholder: '예) 동물 소리 듣고 찾는 놀이가 있으면 좋겠어요' });
  const nickname = el('input', { class: 'fb-nick', maxlength: '12', placeholder: '닉네임 (안 써도 돼요)' });
  const status = el('p', { class: 'fb-status', role: 'status' });
  const send = el('button', { class: 'btn-main', onclick: submit }, '의견 남기기');
  const list = el('div', { class: 'fb-list' }, el('p', { class: 'muted' }, '불러오는 중이에요…'));

  async function submit() {
    if (message.value.trim().length < 2) {
      status.textContent = '의견을 두 글자 이상 적어 주세요.';
      message.focus();
      return;
    }
    send.disabled = true;
    status.textContent = '';
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, message: message.value, nickname: nickname.value, vid: visitorId() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '잠시 뒤 다시 해 주세요.');
      message.value = '';
      toast('고마워요! 의견이 잘 남겨졌어요 🌱');
      loadList();
    } catch (e) {
      status.textContent = e.message;
    } finally {
      send.disabled = false;
    }
  }

  async function loadList() {
    try {
      const res = await fetch('/api/feedback', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const { posts } = await res.json();
      list.replaceChildren(...(posts.length ? posts.map(feedbackPost) : [el('p', { class: 'muted' }, '아직 남겨진 의견이 없어요. 첫 의견을 남겨 주세요!')]));
    } catch {
      list.replaceChildren(el('p', { class: 'muted' }, '의견을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'));
    }
  }

  toolScreen('의견 게시판',
    el('p', { class: 'sub' }, '있었으면 하는 놀이, 불편한 점을 알려 주세요. 하나하나 읽고 고쳐 나갈게요.'),
    el('section', { class: 'fb-form' },
      kindRow, message, nickname,
      el('p', { class: 'fb-note' }, '🔒 아이 이름, 연락처 같은 개인정보는 적지 말아 주세요. 남긴 글은 모두가 볼 수 있어요.'),
      status, send),
    el('h2', { class: 'fb-title' }, '남겨 주신 의견'),
    list);
  loadList();
}

function feedbackPost(p) {
  const kindName = (FEEDBACK_KINDS.find(([id]) => id === p.kind) ?? FEEDBACK_KINDS[0])[1];
  const day = new Date(p.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  return el('article', { class: 'fb-post' },
    el('div', { class: 'fb-post-head' },
      el('span', { class: `fb-kind ${p.kind}` }, kindName),
      el('span', { class: 'fb-who' }, `${p.nickname || '보호자'} · ${day}`)),
    el('p', { class: 'fb-text' }, p.message),
    p.admin_reply ? el('div', { class: 'fb-reply' }, el('b', {}, '🌱 만든 사람'), el('p', {}, p.admin_reply)) : null);
}

/* ---------- 다 하면 뭐 할까? (보상 고르기) ---------- */
// 오늘의 학습 전에 끝나고 할 좋아하는 일을 골라 두면 시작할 마음이 생김
const REWARDS = [
  ['🛝', '놀이터'], ['🍪', '간식'], ['📺', '영상 보기'], ['🫧', '비눗방울'],
  ['📚', '책 읽기'], ['🧸', '장난감 놀이'], ['🤗', '꼭 안아 주기'], ['🎵', '노래 부르기'],
];

function rewardToday() {
  const r = store.get('reward', null);
  return r && r.date === dateKey(new Date()) ? REWARDS[r.k] : null;
}

function rewardLine() {
  const r = rewardToday();
  return el('button', { class: `reward-line${r ? ' set' : ''}`, onclick: showRewardPicker },
    r ? [el('span', {}, '🎁 다 하면'), el('b', {}, `${r[0]} ${r[1]}`), el('small', {}, '바꾸기')] : [el('span', {}, '🎁 다 하면 뭐 할까?'), el('small', {}, '고르기 ›')]);
}

function showRewardPicker() {
  const now = store.get('reward', null);
  toolScreen('다 하면 뭐 할까?',
    el('p', { class: 'sub' }, '오늘의 학습을 다 하면 할 일을 아이와 함께 골라요'),
    el('div', { class: 'reward-grid' }, REWARDS.map(([icon, name], k) =>
      el('button', {
        class: `reward-item${now && now.date === dateKey(new Date()) && now.k === k ? ' on' : ''}`,
        onclick: () => {
          store.set('reward', { date: dateKey(new Date()), k });
          speak(`좋아요! 다 하면 ${name}!`);
          showHome('today');
        },
      }, el('span', {}, icon), el('b', {}, name)))));
}

/* ---------- 우리 아이 기록 한 장 (선생님께 보여 드리기) ---------- */
function showReport() {
  const DAYS = 30;
  const { perGame, activeDays } = statsSince(DAYS);
  const rows = GAMES.filter((g) => perGame[g.id] && totalOf(perGame[g.id]) > 0).map((g) => {
    const c = perGame[g.id];
    const n = totalOf(c);
    return { g, n, first: pct(c.first, n), retry: pct(c.retry, n) };
  }).sort((a, b) => b.n - a.n);
  const sum = rows.reduce((t, r) => ({ n: t.n + r.n, first: t.first + perGame[r.g.id].first }), { n: 0, first: 0 });
  // 3문제 이상 푼 놀이만 잘함 · 연습 필요로 나눔
  const enough = rows.filter((r) => r.n >= 3);
  const strong = [...enough].sort((a, b) => b.first - a.first).slice(0, 3).filter((r) => r.first >= 60);
  const weak = [...enough].sort((a, b) => a.first - b.first).slice(0, 3).filter((r) => r.first < 60);
  const test = store.get('levelTest', null);
  const from = daysAgo(DAYS - 1);
  const fmtDay = (d) => `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
  const names = (list) => (list.length ? list.map((r) => `${r.g.icon} ${r.g.title} (${r.first}%)`).join(', ') : '아직 판단하기 어려워요');

  toolScreen('우리 아이 기록',
    el('section', { class: 'report' },
      el('div', { class: 'report-head' },
        el('b', {}, '🌱 쑥쑥 생각놀이 학습 기록'),
        el('span', {}, `${fmtDay(from)} ~ ${fmtDay(new Date())} (최근 ${DAYS}일)`)),
      el('div', { class: 'stat-tiles' },
        el('div', { class: 'stat-tile' }, el('b', {}, `${activeDays.size}일`), el('span', {}, '학습한 날')),
        el('div', { class: 'stat-tile' }, el('b', {}, `${sum.n}개`), el('span', {}, '푼 문제')),
        el('div', { class: 'stat-tile' }, el('b', {}, sum.n ? `${pct(sum.first, sum.n)}%` : '-'), el('span', {}, '처음에 맞힘'))),
      el('dl', { class: 'report-facts' },
        el('dt', {}, '지금 난이도'), el('dd', {}, LEVELS[settings.level].name),
        el('dt', {}, '난이도 알아보기'), el('dd', {}, test ? `${LEVELS[test.level].name} 추천 (${test.date}, 보통 ${test.mid}/6 · 어려움 ${test.hard}/6)` : '아직 안 했어요'),
        el('dt', {}, '칭찬 스티커'), el('dd', {}, `${stickerCount()}개 (오늘의 학습을 끝낸 날)`),
        el('dt', {}, '👍 잘하는 놀이'), el('dd', {}, names(strong)),
        el('dt', {}, '🌱 연습이 더 필요한 놀이'), el('dd', {}, names(weak))),
      rows.length
        ? el('table', { class: 'report-table' },
          el('thead', {}, el('tr', {}, el('th', {}, '놀이'), el('th', {}, '문제'), el('th', {}, '처음에 맞힘'), el('th', {}, '다시 해서 맞힘'))),
          el('tbody', {}, rows.map((r) => el('tr', {},
            el('td', {}, `${r.g.icon} ${r.g.title}`), el('td', {}, `${r.n}`), el('td', {}, `${r.first}%`), el('td', {}, `${r.retry}%`)))))
        : el('p', { class: 'muted' }, '최근 30일 동안 푼 문제가 없어요.'),
      el('p', { class: 'report-note' }, '※ 이 기기에서 한 놀이만 모은 기록이에요. 진단이나 평가 결과가 아니라 집에서 한 연습의 참고 자료로 봐 주세요.')),
    el('div', { class: 'btn-row report-actions' },
      el('button', { class: 'btn-main', onclick: () => window.print() }, '🖨️ 인쇄 · PDF로 저장')),
    el('p', { class: 'report-tip' }, '화면을 캡처해서 선생님께 보내 드려도 돼요.'));
}

/* ---------- 종이 학습지 (A4로 인쇄해서 연필로 하는 놀이) ---------- */
const svgBox = (vb, body, cls = 'ws-svg') => {
  const n = el('span', { class: cls });
  n.innerHTML = `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
  return n;
};
// 4×4 점판 (선 따라 긋기와 같은 점 위치)
const wsDots = (lines = []) => svgBox('0 0 300 300',
  lines.map(([a, b]) => { const [x1, y1] = dotXY(a); const [x2, y2] = dotXY(b); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#333" stroke-width="9" stroke-linecap="round"/>`; }).join('')
  + DOTS.map((_, k) => { const [x, y] = dotXY(k); return `<circle cx="${x}" cy="${y}" r="11" fill="#555"/>`; }).join(''), 'ws-board');
// 3×3 칸 (색칠 따라 하기)
const wsGrid = (filled = []) => svgBox('0 0 300 300',
  range(0, 8).map((k) => `<rect x="${6 + (k % 3) * 96}" y="${6 + Math.floor(k / 3) * 96}" width="96" height="96" fill="${filled.includes(k) ? '#555' : '#fff'}" stroke="#333" stroke-width="4"/>`).join(''), 'ws-board');
const wsDot = () => el('span', { class: 'ws-dot' });
const wsItem = (e, cls = '') => el('span', { class: `ws-e ${cls}` }, e);
// 잇기: 왼쪽 · 오른쪽 그림을 점까지 선으로
const wsConnect = (left, right) => el('div', { class: 'ws-connect' },
  el('div', { class: 'ws-col' }, left.map((n) => el('div', { class: 'ws-cell' }, n, wsDot()))),
  el('div', { class: 'ws-col right' }, right.map((n) => el('div', { class: 'ws-cell' }, wsDot(), n))));

const WORKSHEETS = [
  {
    id: 'trace', icon: '🐛', title: '길 따라 그리기', say: '친구가 도착할 수 있게 점선을 따라 그어요',
    make(lv) {
      const shapes = [['straight', 'hill', 'straight', 'hill', 'straight', 'hill'], ['hill', 'wave', 'hill', 'wave', 'zigzag', 'zigzag'], ['wave', 'zigzag', 'wave', 'zigzag', 'turn', 'turn']][lv];
      return el('div', { class: 'ws-grid2' }, shapes.map((shape) => {
        const pts = tracePoints(shape, rand(4));
        const d = `M${pts.map((p) => p.join(',')).join(' L')}`;
        const [a, b] = pick(TRACE_PAIRS);
        const [s, e] = [pts[0], pts[pts.length - 1]];
        return svgBox('0 0 300 200', `<path d="${d}" fill="none" stroke="#eee" stroke-width="${TRACE_ROAD[lv]}" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${d}" fill="none" stroke="#777" stroke-width="3.5" stroke-dasharray="7 8" stroke-linecap="round" stroke-linejoin="round"/>
          <text x="${s[0]}" y="${s[1] + 12}" font-size="36" text-anchor="middle">${a}</text><text x="${e[0]}" y="${e[1] + 12}" font-size="36" text-anchor="middle">${b}</text>`, 'ws-board wide');
      }));
    },
  },
  {
    id: 'lines', icon: '✏️', title: '선 따라 긋기', say: '왼쪽과 똑같이 오른쪽 점에 선을 그어요',
    make(lv) {
      return el('div', { class: 'ws-pairs' }, range(1, 3).map(() =>
        el('div', { class: 'ws-pair' }, wsDots(randomLines(LINE_COUNTS[lv][1], lv === 0)), el('span', { class: 'ws-arrow' }, '→'), wsDots())));
    },
  },
  {
    id: 'copy', icon: '🎨', title: '똑같이 칠하기', say: '왼쪽과 똑같이 오른쪽 칸을 색칠해요',
    make(lv) {
      return el('div', { class: 'ws-pairs' }, range(1, 3).map(() =>
        el('div', { class: 'ws-pair' }, wsGrid(randomShape(COPY_COUNTS[lv][1])), el('span', { class: 'ws-arrow' }, '→'), wsGrid())));
    },
  },
  {
    id: 'match', icon: '🔗', title: '같은 그림 잇기', say: '같은 그림끼리 선으로 이어요',
    make(lv) {
      const items = sample(LISTEN_WORDS, [3, 4, 5][lv]).map(([, e]) => e);
      return wsConnect(items.map((e) => wsItem(e)), shuffle(items).map((e) => wsItem(e)));
    },
  },
  {
    id: 'shadow', icon: '👤', title: '그림자 잇기', say: '그림과 꼭 맞는 그림자를 선으로 이어요',
    make(lv) {
      const items = sample(SHADOW_ITEMS, [3, 4, 5][lv]);
      return wsConnect(items.map((e) => wsItem(e)), shuffle(items).map((e) => wsItem(e, 'shade')));
    },
  },
  {
    id: 'odd', icon: '🔍', title: '다른 하나 찾기', say: '모양이 다른 하나에 동그라미 해요',
    make(lv) {
      return el('div', { class: 'ws-rows' }, range(1, 4).map(() => {
        const [same, diff] = shuffle(pick(lv === 2 ? ODD_HARD : ODD_EASY));
        const n = [3, 4, 5][lv];
        const odd = rand(n);
        return el('div', { class: 'ws-row' }, range(0, n - 1).map((k) => wsItem(k === odd ? diff : same)));
      }));
    },
  },
  {
    id: 'count', icon: '🔢', title: '세어 보기', say: '몇 개인지 세어서 숫자에 동그라미 해요',
    make(lv) {
      const max = COUNT_RANGES[lv][1][1];
      return el('div', { class: 'ws-rows' }, range(1, 4).map(() => {
        const n = 1 + rand(Math.min(max, 6));
        const e = pick(COUNT_ITEMS);
        return el('div', { class: 'ws-row spread' },
          el('span', { class: 'ws-group' }, range(1, n).map(() => wsItem(e, 'small'))),
          el('span', { class: 'ws-nums' }, range(1, Math.min(max, 6)).map((k) => el('b', {}, String(k)))));
      }));
    },
  },
  {
    id: 'pattern', icon: '🍎', title: '규칙 찾기', say: '빈칸에 들어갈 그림에 동그라미 해요',
    make(lv) {
      return el('div', { class: 'ws-rows' }, range(1, 4).map((_, r) => {
        const shape = PATTERN_UNITS[lv][r * 2 + 2];
        const kinds = sample(PATTERN_SETS[0], Math.max(...shape) + 1);
        const unit = shape.map((k) => kinds[k]);
        const seq = [...unit, ...unit];
        const answer = seq[seq.length - 1];
        const other = pick(kinds.filter((k) => k !== answer).concat(PATTERN_SETS[0].filter((x) => !kinds.includes(x))));
        return el('div', { class: 'ws-row spread' },
          el('span', { class: 'ws-group' }, seq.slice(0, -1).map((e) => wsItem(e, 'small')), el('span', { class: 'ws-blank' }, '?')),
          el('span', { class: 'ws-choose' }, shuffle([answer, other]).map((e) => wsItem(e, 'small'))));
      }));
    },
  },
  {
    id: 'size', icon: '🐘', title: '큰 것 · 작은 것', say: '큰 것에는 ○, 작은 것에는 △ 해요',
    make(lv) {
      return el('div', { class: 'ws-rows' }, range(1, 4).map(() => {
        const scales = shuffle(lv === 0 ? [1, 0.45] : [1, 0.7, 0.42]);
        const e = pick(SIZE_ITEMS);
        return el('div', { class: 'ws-row' }, scales.map((sc) => el('span', { class: 'ws-e', style: `font-size:calc(var(--ws-e) * ${sc * 1.25})` }, e)));
      }));
    },
  },
  {
    id: 'number', icon: '3️⃣', title: '숫자와 개수 잇기', say: '숫자와 개수가 같은 것끼리 이어요',
    make(lv) {
      const nums = sample(range(1, NUMBER_MAX[lv]), [3, 4, 5][lv]);
      const e = pick(NUMBER_ITEMS)[0];
      return wsConnect(nums.map((n) => el('b', { class: 'ws-num' }, String(n))),
        shuffle(nums).map((n) => el('span', { class: 'ws-group' }, range(1, n).map(() => wsItem(e, 'tiny')))));
    },
  },
];

function showWorksheets(id = store.get('wsType', 'trace')) {
  const ws = WORKSHEETS.find((w) => w.id === id) ?? WORKSHEETS[0];
  store.set('wsType', ws.id);
  const lv = settings.level;
  const page = el('section', { class: 'ws-page' },
    el('header', { class: 'ws-head' },
      el('div', { class: 'ws-title' }, `${ws.icon} ${ws.title}`),
      el('div', { class: 'ws-name' }, '이름 ____________   날짜 ______')),
    el('p', { class: 'ws-say' }, ws.say),
    ws.make(lv),
    el('footer', { class: 'ws-foot' }, `🌱 쑥쑥 생각놀이 · ${LEVELS[lv].name} · ssukssuknori.app`));

  const preview = el('div', { class: 'ws-preview' }, page);
  toolScreen('종이 학습지',
    el('p', { class: 'sub' }, '인쇄해서 연필로 해요. 난이도는 지금 고른 단계를 따라요.'),
    el('div', { class: 'ws-types' }, WORKSHEETS.map((w) =>
      el('button', { class: `chip${w.id === ws.id ? ' on' : ''}`, onclick: () => showWorksheets(w.id) }, `${w.icon} ${w.title}`))),
    levelPicker('compact ws-level', () => showWorksheets(ws.id)),
    preview,
    el('div', { class: 'btn-row ws-actions' },
      el('button', { class: 'btn-main alt', onclick: () => showWorksheets(ws.id) }, '🔀 다른 문제'),
      el('button', { class: 'btn-main', onclick: printWorksheet }, '🖨️ 인쇄')));
  // 미리보기는 학습지를 A4 비율 그대로 그린 뒤 화면 폭에 맞게 줄여서 보여 줌 (좁은 화면에서 그림이 겹치지 않게)
  const fit = () => { page.style.zoom = String(Math.min(1, (preview.clientWidth - 20) / WS_PREVIEW_WIDTH)); };
  fit();
  window.addEventListener('resize', fit, { once: true });
}

const WS_PREVIEW_WIDTH = 560;

// 학습지 한 장만 인쇄되게 (다른 화면 요소는 숨김)
function printWorksheet() {
  document.documentElement.classList.add('print-ws');
  const done = () => { document.documentElement.classList.remove('print-ws'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1000);
}

/* ---------- 화면: 놀이 ---------- */
function playGame(game) {
  if (game.ready && !game.ready()) {
    showFamilySetup();
    return;
  }
  const total = game.total ?? TOTAL;
  playSession({
    title: game.title,
    level: settings.level,
    rounds: range(0, total - 1).map((index) => ({ game, index })),
    restart: () => playGame(game),
    save(state) {
      const best = store.get(bestKey(game, state.level), 0);
      if (state.score > best) store.set(bestKey(game, state.level), state.score);
    },
  });
}

// 이어지는 같은 놀이 문제를 한 단계로 묶음 → [{ game, start, count }]
function scheduleSteps(rounds) {
  const steps = [];
  rounds.forEach(({ game }, i) => {
    const last = steps[steps.length - 1];
    if (last && last.game === game) last.count++;
    else steps.push({ game, start: i, count: 1 });
  });
  return steps;
}

const ORDINALS = ['첫', '두', '세', '네', '다섯', '여섯'];

// 시각 일정표: 오늘 할 놀이를 순서대로 보여주고, 끝난 것은 ✔, 지금 할 것은 크게 표시
function scheduleBoard(steps, current) {
  return el('div', { class: 'schedule' },
    el('div', { class: 'schedule-title' },
      mascot(current === 0 ? 'smile' : 'happy', 'bounce'),
      el('span', { class: 'bubble' }, current === 0 ? '오늘 할 일이에요!' : '잘했어요! 다음 놀이예요')),
    el('ol', { class: 'schedule-list' },
      steps.map((step, k) => {
        const status = k < current ? 'done' : k === current ? 'now' : 'later';
        return el('li', { class: `schedule-item ${status}`, style: `--c:${step.game.color}` },
          el('span', { class: 'schedule-num' }, k < current ? '✔' : String(k + 1)),
          el('span', { class: 'schedule-icon' }, step.game.icon),
          el('span', { class: 'schedule-name' }, step.game.title,
            el('small', {}, `${step.count}문제`)),
          el('span', { class: 'schedule-state' }, { done: '다 했어요', now: '지금 해요', later: '' }[status]));
      })),
  );
}

// 푸는 동안 위에 보이는 작은 일정 줄
function scheduleStrip(steps, current) {
  return steps.map((step, k) =>
    el('span', { class: `strip-step ${k < current ? 'done' : k === current ? 'now' : 'later'}`, style: `--c:${step.game.color}` },
      k < current ? '✔' : step.game.icon,
      k === current ? el('span', { class: 'strip-name' }, step.game.title) : null));
}

// session: { title, level, rounds: [{ game, index }], seed?, showGameName?, schedule?, restart, save }
function playSession(session) {
  const { level, rounds } = session;
  const total = rounds.length;
  const points = Math.round(100 / total);
  const state = { level, index: 0, score: 0, correct: 0, records: [] };
  let rec = null;
  let locked = false;
  let timers = [];

  const counter = el('div', { class: 'counter' });
  const barFill = el('div', { class: 'bar-fill' });
  const score = el('div', { class: 'score' });
  const gameName = el('div', { class: 'round-chip' });
  gameName.hidden = !session.showGameName || session.schedule;
  const steps = session.schedule ? scheduleSteps(rounds) : null;
  const strip = el('div', { class: 'schedule-strip' });
  strip.hidden = !steps;
  const announced = new Set();
  const usedKeys = new Set(); // 이번에 이미 나온 문제
  let lastKey = null;
  const stage = el('main', { class: 'stage' });
  // 한 가지 놀이를 골라 할 때만 보호자 도움말 (오늘의 학습은 일정표가 있어 화면이 복잡해지지 않게 뺌)
  const tipBar = () => {
    const tip = !session.schedule && settings.tips && new Set(rounds.map((r) => r.game)).size === 1 ? gameTip(rounds[0].game) : null;
    if (!tip) return null;
    const bar = el('div', { class: 'parent-tip' }, el('span', {}, '👪'), el('p', {}, tip),
      el('button', { class: 'parent-tip-x', 'aria-label': '도움말 닫기', onclick: () => bar.remove() }, '✕'));
    return bar;
  };

  const myScreen = mount(el('div', { class: 'screen game' },
    el('header', { class: 'topbar' },
      el('button', { class: 'icon-btn', 'aria-label': '그만하기', onclick: showHome }, '✕'),
      counter,
      el('div', { class: 'bar' }, barFill),
      score,
      el('button', { class: 'pill-btn', onclick: () => finish(false, 'pass') }, '패스')),
    gameName,
    strip,
    tipBar(),
    stage,
  ));
  const alive = () => screenId === myScreen;

  const ctx = {
    stage,
    level,
    finish: (correct, kind) => finish(correct, kind),
    // 틀렸지만 힌트를 보고 다시 해 보는 중 (첫 시도에 맞힌 것만 점수)
    miss(message) {
      if (locked || !rec) return;
      rec.missed = true;
      tone([392, 330], 0.15);
      speak(message);
    },
    later(fn, ms) {
      timers.push(setTimeout(() => alive() && fn(), ms));
    },
  };

  function next() {
    if (state.index >= total) {
      session.save(state);
      sendLog({ t: 'play', game: session.logId ?? (session.schedule ? 'daily' : rounds[0].game.id), level, score: state.score });
      (session.showResult ?? showResult)(session, state);
      return;
    }
    const { game, index } = rounds[state.index];
    // 난이도 알아보기처럼 문제마다 단계가 다를 수 있음
    ctx.level = rounds[state.index].level ?? level;
    counter.textContent = `${state.index + 1} / ${total}`;
    barFill.style.width = `${((state.index + 1) / total) * 100}%`;
    score.textContent = `${state.score}점`;
    gameName.style.setProperty('--c', game.color);
    gameName.textContent = `${game.icon} ${game.title}`;
    stage.replaceChildren();

    // 새 놀이로 넘어갈 때마다 일정표를 먼저 보여주고, 아이가 버튼을 눌러야 시작
    if (steps) {
      const current = steps.findIndex((st) => state.index >= st.start && state.index < st.start + st.count);
      strip.replaceChildren(...scheduleStrip(steps, current));
      if (!announced.has(current)) {
        announced.add(current);
        rec = null; // 일정표를 보는 동안에는 패스가 눌리지 않게
        const step = steps[current];
        const prev = steps[current - 1];
        stage.append(
          ...[scheduleBoard(steps, current),
            current === 0 && rewardToday() ? el('div', { class: 'reward-chip' }, `🎁 다 하면 ${rewardToday().join(' ')}!`) : null,
            el('button', { class: 'btn-main', onclick: next }, current === 0 ? '▶ 시작하기' : '▶ 다음 놀이 하기')].filter(Boolean),
        );
        speak(current === 0
          ? `오늘은 ${ORDINALS[steps.length - 1] ?? steps.length} 가지 놀이를 해요. ${ORDINALS[0]} 번째는 ${step.game.title} 놀이예요.`
          : `${prev.game.title} 끝! 다음은 ${step.game.title} 놀이예요.`);
        return;
      }
    }

    locked = false;
    // 놀이가 rec을 나중에 고쳐 쓰므로 복사하지 않고 그대로 씀
    const make = () => Object.assign(game.round(index, ctx), { game });
    // 이미 나온 문제면 다시 만듦. 문제 종류가 적어 다 써 버렸을 때는 바로 앞 문제와만 다르게
    let key;
    for (let attempt = 0; ; attempt++) {
      if (attempt > 0) {
        stage.replaceChildren();
        timers.forEach(clearTimeout);
        timers = [];
      }
      rec = session.seed ? withRng(`${session.seed}:${state.index}:${attempt}`, make) : make();
      key = questionKey(game, rec);
      if (!usedKeys.has(key) || (attempt >= 30 && key !== lastKey) || attempt >= 60) break;
    }
    usedKeys.add(key);
    lastKey = key;
  }

  function finish(correct, kind) {
    if (locked || !rec) return;
    locked = true;
    timers.forEach(clearTimeout);
    timers = [];
    const passed = kind === 'pass';
    const retried = correct && !!rec.missed;
    correct = correct && !rec.missed;
    state.records.push({ ...rec, correct, retried, passed, testLevel: ctx.level });
    // 짝 맞추기의 '완성'(실수가 많았지만 끝까지 함)은 다시 해서 맞음으로 셈
    recordStat(rec.game.id, passed ? 'pass' : correct ? 'first' : 'retry');
    if (correct) {
      state.correct++;
      state.score = Math.min(100, state.score + points);
    }
    score.textContent = `${state.score}점`;
    feedback(kind ?? (correct || retried ? 'good' : 'bad'), () => {
      if (!alive()) return;
      state.index++;
      next();
    });
  }

  next();
}

/* ---------- 우리 아이 난이도 알아보기 ---------- */
// 보통 문제 6개 → 어려움 문제 6개를 풀고, 처음 시도에 맞힌 수로 알맞은 난이도를 추천
const LEVEL_TEST_GAMES = () => [listenGame, countGame, oddGame, patternGame, shadowGame, sizeGame];
const LEVEL_TEST_REASONS = [
  '쉬운 문제부터 차근차근 해요. 익숙해지면 다시 알아보기를 해 보세요.',
  '보통 문제를 잘 풀었어요. 어려운 문제는 보통 단계에서 조금 더 연습해요.',
  '어려운 문제도 잘 풀었어요! 어려움 단계로 해 보세요.',
];

function levelTestLink() {
  const last = store.get('levelTest', null);
  return el('button', { class: 'level-test-link', onclick: showLevelTestIntro },
    last ? `🧪 추천 난이도 ${LEVELS[last.level].name} · 다시 알아보기 ›` : '🧪 우리 아이 난이도 알아보기 ›');
}

function showLevelTestIntro() {
  const n = LEVEL_TEST_GAMES().length;
  mount(el('div', { class: 'screen result' },
    el('section', { class: 'result-hero' },
      el('div', { class: 'result-level' }, '우리 아이 난이도 알아보기'),
      el('div', { class: 'result-mascot' }, mascot('smile', 'bounce')),
      el('div', { class: 'result-title' }, '놀이를 해 보고 난이도를 알려 드려요'),
      el('ul', { class: 'test-notes' },
        el('li', {}, `${n * 2}문제 · 약 4분 (보통 ${n}문제 → 어려움 ${n}문제)`),
        el('li', {}, '틀려도 괜찮아요. 반짝이는 힌트를 보고 다시 해 봐요.'),
        el('li', {}, '보호자가 옆에서 함께 봐 주세요. 답은 알려 주지 말아 주세요.')),
      el('div', { class: 'result-actions stack' },
        el('button', { class: 'btn-main', onclick: playLevelTest }, '▶ 시작하기'),
        el('button', { class: 'btn-main alt', onclick: () => showHome() }, '처음으로')))));
  speak('놀이를 해 보고 알맞은 난이도를 알려 줄게요.');
}

function playLevelTest() {
  const games = LEVEL_TEST_GAMES();
  playSession({
    title: '난이도 알아보기',
    level: 1,
    rounds: [1, 2].flatMap((lv) => games.map((game) => ({ game, index: 7, level: lv }))),
    showGameName: true,
    logId: 'leveltest',
    restart: playLevelTest,
    save() {},
    showResult: showLevelTestResult,
  });
}

function showLevelTestResult(session, state) {
  const n = LEVEL_TEST_GAMES().length;
  const firstTry = (lv) => state.records.filter((r) => r.testLevel === lv && r.correct).length;
  const mid = firstTry(1);
  const hard = firstTry(2);
  // 보통을 거의 다 맞히고 어려움도 많이 맞히면 어려움, 보통을 대부분 맞히면 보통, 아니면 쉬움
  const pick = mid >= n - 1 && hard >= n - 2 ? 2 : mid >= n - 2 ? 1 : 0;
  const name = LEVELS[pick].name;
  store.set('levelTest', { date: dateKey(new Date()), mid, hard, level: pick });
  tone([523, 659, 784, 1047], 0.12);
  speak(`끝까지 잘했어요! 추천 난이도는 ${name}이에요.`);

  const choose = () => {
    settings.level = pick;
    store.set('level', pick);
    showHome();
    toast(`난이도를 ${name}으로 정했어요`);
  };
  mount(el('div', { class: 'screen result' },
    el('section', { class: 'result-hero' },
      el('div', { class: 'result-level' }, '우리 아이 난이도 알아보기'),
      el('div', { class: 'result-mascot' }, mascot('happy', 'bounce')),
      el('div', { class: 'result-title' }, '끝까지 잘했어요!'),
      el('div', { class: 'test-pick' }, el('span', {}, '추천 난이도'), el('b', {}, name)),
      el('div', { class: 'test-bars' },
        [[1, mid], [2, hard]].map(([lv, got]) => el('div', { class: 'test-bar' },
          el('span', { class: 'test-bar-name' }, `${LEVELS[lv].name} 문제`),
          el('span', { class: 'test-dots' }, range(1, n).map((k) => el('i', { class: k <= got ? 'on' : '' }))),
          el('span', { class: 'test-bar-num' }, `${got} / ${n}`)))),
      el('p', { class: 'test-why' }, LEVEL_TEST_REASONS[pick]),
      el('p', { class: 'test-why muted' }, '그날 아이 컨디션에 따라 결과가 달라질 수 있어요. 언제든 다시 알아볼 수 있어요.'),
      el('div', { class: 'result-actions stack' },
        el('button', { class: 'btn-main', onclick: choose }, `${name}으로 정하기`),
        el('button', { class: 'btn-main alt', onclick: () => showHome() }, '처음으로')))));
}

/* ---------- 화면: 결과 ---------- */
function showResult(session, state) {
  const total = state.records.length;
  const { correct } = state;
  const ratio = correct / total;
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : ratio >= 0.3 ? 1 : 0;

  const message = ['다음엔 더 잘할 수 있어요!', '조금씩 늘고 있어요!', '정말 잘했어요!', '최고예요!'][stars];
  tone([523, 659, 784, 1047], 0.12);
  speak(`${total}개 중에 ${correct}개 맞았어요. ${message}`);

  const badgeOf = (r) => r.game.badge?.(r)
    ?? (r.passed ? ['pass', '패스'] : r.correct ? ['good', '정답'] : r.retried ? ['retry', '다시 해서 맞음'] : ['bad', '오답']);

  mount(el('div', { class: 'screen result' },
    el('section', { class: 'result-hero' },
      el('div', { class: 'result-level' }, `${session.title} · ${LEVELS[state.level].name}`),
      el('div', { class: 'result-mascot' }, mascot(stars >= 2 ? 'happy' : 'smile', 'bounce')),
      el('div', { class: 'stars' }, [0, 1, 2].map((k) => el('span', { class: `star${k < stars ? '' : ' off'}` }, '⭐'))),
      el('div', { class: 'result-title' }, `${total}개 중 ${correct}개 맞았어요! ${message}`),
      el('div', { class: 'result-score' }, `${state.score}점`),
      state.newSticker ? el('div', { class: 'result-sticker pop' }, `⭐ 칭찬 스티커를 받았어요! (모두 ${stickerCount()}개)`) : null,
      session.schedule && rewardToday() ? el('div', { class: 'result-reward pop' }, `🎁 약속한 ${rewardToday().join(' ')} 시간이에요!`) : null,
      el('div', { class: 'result-actions' },
        el('button', { class: 'btn-main', onclick: session.restart }, '다시 하기'),
        el('button', { class: 'btn-main alt', onclick: showHome }, '처음으로'))),
    el('section', { class: 'records' },
      state.records.map((r, k) => {
        const [cls, text] = badgeOf(r);
        return el('article', { class: 'rcard' },
          el('div', { class: 'rcard-head' },
            el('span', { class: 'rnum' }, String(k + 1),
              session.showGameName ? el('span', { class: 'rgame' }, `${r.game.icon} ${r.game.title}`) : null),
            el('span', { class: `badge ${cls}` }, text)),
          r.game.review(r));
      })),
  ));
}

/* ---------- 방문 기록 (관리자 통계용, api/visit.js) ---------- */
// 기기마다 무작위 번호를 하나 만들어 둠 (이름 · 연락처 같은 정보는 보내지 않음)
function visitorId() {
  let id = store.get('vid', null);
  if (!id) {
    id = window.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    store.set('vid', id);
  }
  return id;
}

function sendLog(data) {
  // 실제 사이트에서만 보냄 (내 컴퓨터에서 시험할 때는 안 보냄)
  // 진짜 주소에서만 기록 (배포 미리보기 주소 *.vercel.app은 Vercel 봇이 열어 보므로 빼기)
  if (!/(^|\.)ssukssuknori\.app$/.test(location.hostname)) return;
  try {
    const body = JSON.stringify({ vid: visitorId(), admin: store.get('isAdminDevice', false), ...data });
    const sent = navigator.sendBeacon?.('/api/visit', new Blob([body], { type: 'text/plain' }));
    if (!sent) fetch('/api/visit', { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch {}
}

function logVisit() {
  let ref = null;
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    if (r && r.hostname !== location.hostname) ref = `${r.hostname}${r.pathname}`.slice(0, 120);
  } catch {}
  // QR 코드로 들어오면 주소에 ?qr=이름 이 붙어 있음 → 'qr-이름'으로 따로 기록하고, 주소창에서는 지움(공유할 때 따라가지 않게)
  let page = 'home';
  try {
    const url = new URL(location.href);
    const qr = url.searchParams.get('qr');
    if (qr && /^[a-z0-9-]{1,20}$/i.test(qr)) page = `qr-${qr.toLowerCase()}`;
    if (url.searchParams.has('qr')) {
      url.searchParams.delete('qr');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  } catch {}
  sendLog({ t: 'visit', page, ref });
}

/* ---------- 새 버전 확인 ---------- */
// index.html의 ?v= 숫자와 항상 같게 맞춰야 함
const APP_VERSION = 93;

// 휴대폰이 예전 페이지를 저장해 두고 쓰는 경우, 새 버전이 올라와 있으면 한 번 새로 불러옴
let lastUpdateCheck = 0;
async function checkForUpdate() {
  // 페이지를 열 때와 화면이 다시 보일 때가 겹치므로 1분 안에는 한 번만 확인
  if (Date.now() - lastUpdateCheck < 60000) return;
  lastUpdateCheck = Date.now();
  try {
    const res = await fetch(`./?check=${Date.now()}`, { cache: 'no-store' });
    const latest = Number((await res.text()).match(/app\.js\?v=(\d+)/)?.[1]);
    if (!(latest > APP_VERSION)) return;
    // 혹시 숫자를 잘못 맞춰도 계속 새로고침되지 않도록 버전마다 한 번만
    if (sessionStorage.getItem('reloadedTo') === String(latest)) return;
    sessionStorage.setItem('reloadedTo', String(latest));
    const url = new URL(location.href);
    url.searchParams.set('v', latest);
    location.replace(url);
  } catch {}
}

showHome();
logVisit();
checkForUpdate();
// 휴대폰에서 다른 앱을 쓰다가 돌아왔을 때도 확인
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate();
});
