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
};

/* ---------- 소리 ---------- */
function speak(text) {
  if (!settings.sound || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.rate = 0.9;
  u.pitch = 1.2;
  speechSynthesis.speak(u);
}

let audioCtx;
function tone(freqs, dur = 0.14) {
  if (!settings.sound) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
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

/* ---------- 공통 UI ---------- */
function prompt(text, say = true) {
  if (say) speak(text);
  return el('div', { class: 'prompt' },
    el('span', {}, text),
    el('button', { class: 'speak-btn', 'aria-label': '다시 듣기', onclick: () => speak(text) }, '🔊'),
  );
}

const FEEDBACK = {
  good: ['⭕', '잘했어요!'],
  bad: ['💪', '괜찮아요!'],
  pass: ['👉', '다음 문제!'],
  done: ['🎉', '다 찾았어요!'],
};

function feedback(kind, done) {
  const [icon, text] = FEEDBACK[kind];
  if (kind === 'good' || kind === 'done') tone([660, 880, 1320]);
  else if (kind === 'bad') tone([392, 294], 0.18);
  speak(text);
  const overlay = el('div', { class: `feedback ${kind}` },
    el('div', { class: 'fb-icon' }, icon),
    el('div', { class: 'fb-text' }, text),
  );
  document.body.append(overlay);
  setTimeout(() => {
    overlay.remove();
    done();
  }, 1100);
}

// 보기 개수별 보기 칸 크기 (적을수록 크게)
const CHOICE_SIZE = { 2: 'clamp(110px, 36vw, 150px)', 3: 'clamp(88px, 27vw, 112px)', 4: 'clamp(70px, 20vw, 96px)' };
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
    // 긋는 중인 선 (from 점에서 손가락 위치까지)
    preview(from, x, y) {
      if (from == null) {
        previewLayer.replaceChildren();
        return;
      }
      const [x1, y1] = dotXY(from);
      previewLayer.replaceChildren(svg('line', { x1, y1, x2: x, y2: y, class: 'dl-line preview' }));
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
    const mine = [];
    let selected = null; // 눌러서 고른 점 (두 점을 차례로 눌러도 선이 생김)
    let dragFrom = null; // 손가락으로 긋기 시작한 점

    const left = dotBoard('mid');
    left.draw(original, 'orig');
    const right = dotBoard('mid', true);
    const undoBtn = el('button', { class: 'btn-main alt', disabled: true, onclick: undo }, '지우기');
    const doneBtn = el('button', { class: 'btn-main', disabled: true, onclick: submit }, '다 했어요');

    ctx.stage.append(
      prompt('왼쪽과 똑같이 선을 그어요'),
      el('div', { class: 'compare' },
        el('div', { class: 'compare-col' }, '원본', left.node),
        el('div', { class: 'compare-col' }, '내 답', right.node)),
      el('div', { class: 'draw-tip' }, '점에서 점까지 손가락으로 쭉 그어요'),
      el('div', { class: 'btn-row' }, undoBtn, doneBtn),
    );

    const canJoin = (a, b) => a != null && b != null && a !== b && !shareSide(a, b);

    function refresh() {
      right.draw(mine, 'mine');
      right.dots.forEach((d, k) => d.classList.toggle('sel', k === selected || k === dragFrom));
      undoBtn.disabled = mine.length === 0;
      doneBtn.disabled = mine.length === 0;
    }

    function addLine(a, b) {
      const key = lineKey([a, b]);
      if (!mine.some((l) => lineKey(l) === key)) mine.push([a, b]);
      const have = mine.map(lineKey);
      if (rec.missed) right.hint(original.filter((l) => !have.includes(lineKey(l))));
      tone([760], 0.06);
    }

    right.node.addEventListener('pointerdown', (e) => {
      const k = right.nearest(...right.toBoard(e));
      if (k == null) return;
      e.preventDefault();
      right.node.setPointerCapture(e.pointerId);
      dragFrom = k;
      tone([600], 0.05);
      refresh();
    });

    right.node.addEventListener('pointermove', (e) => {
      if (dragFrom == null) return;
      const [x, y] = right.toBoard(e);
      const k = right.nearest(x, y);
      // 이을 수 있는 점 가까이 오면 그 점에 딱 붙여서 보여줌
      if (canJoin(dragFrom, k)) right.preview(dragFrom, ...dotXY(k));
      else right.preview(dragFrom, x, y);
    });

    right.node.addEventListener('pointerup', (e) => {
      if (dragFrom == null) return;
      const from = dragFrom;
      const to = right.nearest(...right.toBoard(e));
      dragFrom = null;
      right.preview(null);
      if (canJoin(from, to)) {
        addLine(from, to);
        selected = null;
      } else if (to === from) {
        // 긋지 않고 콕 누른 경우: 두 점을 차례로 눌러도 이어지게
        if (canJoin(selected, from)) {
          addLine(selected, from);
          selected = null;
        } else {
          selected = selected === from ? null : from;
        }
      }
      refresh();
    });

    right.node.addEventListener('pointercancel', () => {
      dragFrom = null;
      right.preview(null);
      refresh();
    });

    function undo() {
      mine.pop();
      selected = null;
      refresh();
    }

    function submit() {
      rec.answer = [...mine];
      const want = original.map(lineKey);
      if (sameSet(mine.map(lineKey), want)) {
        ctx.finish(true);
        return;
      }
      // 잘못 그은 선은 지우고, 빠진 선은 점선으로 알려줌
      for (let k = mine.length - 1; k >= 0; k--) {
        if (!want.includes(lineKey(mine[k]))) mine.splice(k, 1);
      }
      const have = mine.map(lineKey);
      right.hint(original.filter((l) => !have.includes(lineKey(l))));
      refresh();
      ctx.miss('점선을 따라 그어 볼까요?');
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
// (빨강 동그라미 사과 · 노랑 바나나 · 초록 개구리 · 파랑 고래 · 보라 포도 · 분홍 꽃 · 검정 펭귄 · 주황 당근)
const PATTERN_SETS = [
  ['🍎', '🍌', '🐸', '🐳', '🍇', '🌸', '🐧', '🥕'],
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
  2: 'clamp(100px, 33vw, 136px)',
  3: 'clamp(84px, 26vw, 104px)',
};

function patternBoard(seq, unitLen, blankTile, tileSize) {
  const groups = [];
  for (let g = 0; g < seq.length / unitLen; g++) {
    groups.push(el('div', { class: 'pgroup' },
      seq.slice(g * unitLen, (g + 1) * unitLen).map((item, k) => {
        const idx = g * unitLen + k;
        return idx === blankTile.index ? blankTile.node : el('div', { class: 'tile' }, item);
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
    const buttons = choices.map((c) => el('button', { class: 'tile choice', 'aria-label': c, onclick: () => choose(c) }, c));
    const choiceRow = el('div', { class: 'choices', style: choicesStyle(choices.length) }, buttons);

    ctx.stage.append(prompt('빈칸에 들어갈 것은?'), board, choiceLabel(choices.length), choiceRow);

    function choose(c) {
      if (c !== answer) {
        retryChoice(ctx, buttons[choices.indexOf(c)], buttons[choices.indexOf(answer)]);
        return;
      }
      rec.chosen = c;
      blankNode.textContent = c;
      blankNode.className = 'tile pop good';
      ctx.finish(true);
    }

    return rec;
  },

  review(rec) {
    const ok = rec.chosen === rec.answer;
    const blankNode = el('div', { class: `tile ${rec.chosen == null ? 'blank' : ok ? 'good' : 'bad'}` }, rec.chosen ?? '?');
    return el('div', {},
      patternBoard(rec.seq, rec.unitLen, { index: rec.blank, node: blankNode }, rec.unitLen === 2 ? '40px' : '30px'),
      ok ? null : el('div', { class: 'review-note' }, `정답: ${rec.answer}`),
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
          el('span', { style: `animation-delay:${k * 0.06}s` }, emoji));
      }));

    const buttons = choices.map((c) =>
      el('button', { class: 'num-btn', onclick: () => choose(c, buttons[choices.indexOf(c)]) }, String(c)));

    ctx.stage.append(prompt(`${emoji} 몇 개일까요?`, false), board, choiceLabel(choices.length),
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
      el('div', { class: 'review-items' }, rec.emoji.repeat(rec.n)),
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
      style: `font-size:${extra.mini ? '22px' : cols === 2 ? 'min(30vw, 140px)' : 'min(20vw, 96px)'};animation-delay:${k * 0.04}s`,
      onclick: extra.onPick && (() => extra.onPick(k)),
    }, item)));
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

    const grid = oddGrid(items, cols, { onPick: choose });
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
        classOf: (k) => (k === rec.odd ? 'good' : k === rec.chosen ? 'bad' : ''),
      }));
  },
};

/* ---------- 놀이 5: 짝 맞추기 ---------- */
// 동물 얼굴끼리는 헷갈리므로 색과 모양이 다른 그림으로 섞음
const FLIP_ITEMS = ['🍎', '🍌', '🐸', '🐳', '🍇', '🌸', '🚗', '⭐'];
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
      el('button', { class: 'card open', 'aria-label': '카드', onclick: () => flip(k) }, el('span', {}, face)));
    const grid = el('div', {
      class: 'card-grid',
      style: `grid-template-columns:repeat(${cols},1fr);font-size:${{ 2: 'min(30vw, 130px)', 3: 'min(21vw, 96px)', 4: 'min(15vw, 72px)' }[cols] ?? 'min(10vw, 48px)'}`,
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
    el('span', { class: 'order-face', style: item.scale ? `transform:scale(${item.scale})` : '' }, item.label));
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
    const tileSize = len >= 4 ? 'clamp(66px, 20vw, 86px)' : len === 3 ? 'clamp(84px, 28vw, 108px)' : 'clamp(110px, 36vw, 150px)';

    const slotNodes = placed.map((_, s) =>
      el('button', { class: 'tile blank slot', 'aria-label': `${s + 1}번째 자리`, onclick: () => unplace(s) },
        String(s + 1)));
    const pieceNodes = order.map((p) =>
      el('button', { class: `tile choice${puzzle.items[p].text ? ' captioned' : ''}`, onclick: () => place(p) },
        el('span', { class: 'order-face', style: puzzle.items[p].scale ? `transform:scale(${puzzle.items[p].scale})` : '' },
          puzzle.items[p].label),
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

    const buttons = choices.map((c) => el('button', { class: 'tile choice', 'aria-label': c, onclick: () => choose(c) }, c));
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
        el('div', { class: `tile ${rec.chosen == null ? 'blank' : 'good'}`, style: '--t:64px' }, rec.chosen ?? '?')),
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
      el('button', { class: 'tile choice face', 'aria-label': FEELINGS[f].word, onclick: () => choose(f) }, FEELINGS[f].face));
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
          rec.chosen ? FEELINGS[rec.chosen].face : '?')),
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
  { q: '🐒', name: '원숭이', a: '🍌', kind: 'food' },
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

    const buttons = choices.map((c) => el('button', { class: 'tile choice', 'aria-label': c, onclick: () => choose(c) }, c));
    ctx.stage.append(
      prompt(`${withParticle(pair.name)} 어울리는 것은?`),
      el('div', { class: 'tile shadow-target' }, pair.q),
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
      el('div', { class: 'compare-col' }, rec.pair.name, el('div', { class: 'tile', style: '--t:64px' }, rec.pair.q)),
      el('div', { class: 'compare-col' }, '짝',
        el('div', { class: `tile ${rec.chosen == null ? 'blank' : 'good'}`, style: '--t:64px' }, rec.chosen ?? rec.pair.a)),
    );
  },
};

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
};
const questionKey = (game, r) => `${game.id}:${(QUESTION_KEYS[game.id] ?? JSON.stringify)(r)}`;

const GAMES = [
  copyGame, linesGame, listenGame, feelGame, matchGame, routineGame, memoryGame, patternGame,
  countGame, oddGame, flipGame, shadowGame, orderGame,
];

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
      order = withRng(`cycle:${n}:${attempt}`, () => shuffle(GAMES));
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
    return rotationCycle(Math.floor(pos / GAMES.length))[pos % GAMES.length];
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

  const week = range(0, 6).reverse().map((n) => {
    const d = daysAgo(n);
    const finished = store.get(dailyKey(dateKey(d)), null);
    return el('div', { class: `wk${finished ? ' done' : ''}${n === 0 ? ' today' : ''}` },
      el('span', { class: 'wk-day' }, WEEKDAYS[d.getDay()]),
      el('span', { class: 'wk-mark' }, finished ? '⭐' : '·'));
  });

  return el('button', { class: `daily-card${done ? ' finished' : ''}`, onclick: playDaily },
    el('div', { class: 'daily-top' },
      el('span', { class: 'daily-tag' }, '📅 오늘의 학습'),
      el('span', { class: 'daily-date' }, `${today.getMonth() + 1}월 ${today.getDate()}일 (${WEEKDAYS[today.getDay()]})`)),
    el('div', { class: 'daily-games' },
      games.map((g) => el('span', { class: 'daily-chip', style: `--c:${g.color}` }, `${g.icon} ${g.title}`))),
    el('div', { class: 'daily-bottom' },
      el('span', { class: 'daily-info' },
        done ? `✅ 오늘 완료 · ${done.score}점` : `${DAILY_TOTAL}문제 · 약 5분`,
        streak ? el('span', { class: 'daily-streak' }, ` · 🔥 ${streak}일 연속`) : null),
      el('span', { class: 'daily-go' }, done ? '다시 하기 ›' : '시작하기 ›')),
    el('div', { class: 'week' }, week),
  );
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
      if (!prev || state.score >= prev.score) {
        store.set(dailyKey(date), { score: state.score, correct: state.correct, total: state.records.length, level });
      }
    },
  });
}

/* ---------- 화면: 홈 ---------- */
// 놀이를 영역별로 묶음 (보호자가 이해하기 쉬운 말로)
const CATEGORIES = [
  { id: 'see', icon: '👀', name: '보고 따라하기', desc: '눈으로 보고 손으로 똑같이 해요', games: [copyGame, linesGame, shadowGame, oddGame] },
  { id: 'focus', icon: '🧠', name: '기억·집중', desc: '잘 보고 기억해요', games: [memoryGame, flipGame] },
  { id: 'think', icon: '🔍', name: '생각·규칙', desc: '규칙과 순서를 찾아요', games: [patternGame, orderGame] },
  { id: 'number', icon: '🔢', name: '수', desc: '하나, 둘, 셋 세어 봐요', games: [countGame] },
  { id: 'talk', icon: '🗣️', name: '말·소통', desc: '말을 듣고 뜻을 알아요', games: [listenGame, matchGame] },
  { id: 'life', icon: '💛', name: '마음·생활', desc: '기분과 생활 습관을 익혀요', games: [feelGame, routineGame] },
];

const HOME_TABS = [
  { id: 'today', icon: '🏠', name: '오늘' },
  { id: 'games', icon: '🧩', name: '놀이' },
  { id: 'records', icon: '📊', name: '기록' },
  { id: 'settings', icon: '⚙️', name: '설정' },
];

function levelPicker() {
  return el('div', { class: 'level-seg', role: 'radiogroup', 'aria-label': '난이도' },
    LEVELS.map((lv, k) => el('button', {
      class: `seg${k === settings.level ? ' on' : ''}`,
      role: 'radio',
      'aria-checked': String(k === settings.level),
      onclick: () => {
        settings.level = k;
        store.set('level', k);
        showHome();
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

// 오늘의 학습에 없는 놀이 중 4가지를 예시로 (날마다 바뀜)
function gamePicks() {
  const today = dateKey(new Date());
  const inDaily = new Set(dailyPlan(today).map((r) => r.game));
  const picks = withRng(`picks:${today}`, () => sample(GAMES.filter((g) => !inDaily.has(g)), 4));
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

function todayTab() {
  return [
    el('header', { class: 'home-top' },
      el('h1', {}, '쑥쑥 생각놀이'),
      el('button', { class: 'pill-btn', onclick: () => showGuide('howto') }, '📖 사용 방법')),
    el('p', { class: 'sub' }, '오늘은 어떤 놀이를 해볼까요?'),
    el('div', { class: 'level-label' }, '난이도'),
    levelPicker(),
    dailyCard(),
    gamePicks(),
  ];
}

function gamesTab() {
  const current = store.get('gameCat', 'all');
  const tabs = [{ id: 'all', icon: '✨', name: '전체' }, ...CATEGORIES];
  const shown = current === 'all' ? CATEGORIES : CATEGORIES.filter((c) => c.id === current);
  return [
    ...tabHeader('놀이', '하고 싶은 놀이를 골라요'),
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
  return [
    ...tabHeader('설정'),
    el('section', { class: 'panel' },
      el('div', { class: 'setting-row' },
        el('div', {}, el('div', { class: 'setting-name' }, '🔊 소리'), el('div', { class: 'setting-desc' }, '문제 읽어주기와 효과음')),
        soundBtn),
      el('div', { class: 'setting-name' }, '난이도'),
      levelPicker()),
    el('section', { class: 'panel' },
      el('h2', { class: 'panel-title' }, '👪 보호자 안내'),
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
  { icon: '🎚️', title: '난이도 고르기', text: '처음에는 ‘쉬움’으로 시작하세요. 기록 탭에서 ‘잘해요’ 알림이 나오면 한 단계 올려 보세요.' },
  { icon: '📅', title: '오늘의 학습 시작', text: '오늘 탭의 ‘오늘의 학습’을 누르면 일정표가 나와요. 아이와 함께 순서를 보고 ‘시작하기’를 눌러요.' },
  { icon: '👆', title: '문제 풀기', text: '그림을 눌러 답해요. 🔊는 다시 듣기, ‘패스’는 넘어가기예요. 틀리면 반짝이는 정답을 눌러 끝내요.' },
  { icon: '⭐', title: '결과 보기', text: '끝나면 별과 함께 문제마다 정답 · 다시 해서 맞음 · 패스가 나와요. 다시 하거나 처음으로 갈 수 있어요.' },
  { icon: '🧩', title: '놀이 골라 하기', text: '놀이 탭에서 영역별로 원하는 놀이를 골라 10문제씩 할 수 있어요.' },
  { icon: '📊', title: '기록 확인', text: '기록 탭에서 놀이별 결과와 달력을 보고, 어려워하는 놀이는 ‘해 보기’로 바로 연습해요.' },
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
    el('section', { class: 'panel' },
      el('h2', { class: 'panel-title' }, '이렇게 만들었어요'),
      el('ul', { class: 'feature-list' }, PRINCIPLES.map((p) => el('li', {},
        el('span', { class: 'feature-icon' }, p.icon),
        el('div', {}, el('b', {}, p.title), el('span', {}, p.text)))))),
    el('section', { class: 'panel' },
      el('h2', { class: 'panel-title' }, `놀이 ${GAMES.length}가지, 6가지 영역`),
      CATEGORIES.map((c) => el('div', { class: 'guide-cat' },
        el('div', { class: 'guide-cat-name' }, `${c.icon} ${c.name}`, el('small', {}, c.desc)),
        el('div', { class: 'guide-cat-games' }, c.games.map((g) => el('span', { style: `--c:${g.color}` }, `${g.icon} ${g.title}`)))))),
    el('section', { class: 'panel note-panel' },
      el('h2', { class: 'panel-title' }, '꼭 알아 두세요'),
      el('ul', { class: 'guide-list' },
        el('li', {}, '쑥쑥 생각놀이는 집에서 하는 연습 도구예요. 진단이나 치료를 대신하지 않아요.'),
        el('li', {}, '아이를 맡고 계신 치료사 · 특수교사 선생님과 목표를 함께 정하면 더 좋아요.'),
        el('li', {}, '로그인이 없고, 기록은 이 기기의 브라우저에만 저장돼요. 다른 곳으로 보내지 않아요.'))),
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
  const content = { today: todayTab, games: gamesTab, records: recordsTab, settings: settingsTab }[tab]();
  mount(el('div', { class: 'screen home' }, ...content, tabBar(tab)));
}

/* ---------- 화면: 놀이 ---------- */
function playGame(game) {
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
    el('div', { class: 'schedule-title' }, '📋 오늘 할 일'),
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

  const myScreen = mount(el('div', { class: 'screen game' },
    el('header', { class: 'topbar' },
      el('button', { class: 'icon-btn', 'aria-label': '그만하기', onclick: showHome }, '✕'),
      counter,
      el('div', { class: 'bar' }, barFill),
      score,
      el('button', { class: 'pill-btn', onclick: () => finish(false, 'pass') }, '패스')),
    gameName,
    strip,
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
      showResult(session, state);
      return;
    }
    const { game, index } = rounds[state.index];
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
          scheduleBoard(steps, current),
          el('button', { class: 'btn-main', onclick: next }, current === 0 ? '▶ 시작하기' : '▶ 다음 놀이 하기'),
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
    state.records.push({ ...rec, correct, retried, passed });
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
      el('div', { class: 'stars' }, [0, 1, 2].map((k) => el('span', { class: `star${k < stars ? '' : ' off'}` }, '⭐'))),
      el('div', { class: 'result-title' }, `${total}개 중 ${correct}개 맞았어요! ${message}`),
      el('div', { class: 'result-score' }, `${state.score}점`),
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

/* ---------- 새 버전 확인 ---------- */
// index.html의 ?v= 숫자와 항상 같게 맞춰야 함
const APP_VERSION = 22;

// 휴대폰이 예전 페이지를 저장해 두고 쓰는 경우, 새 버전이 올라와 있으면 한 번 새로 불러옴
async function checkForUpdate() {
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
checkForUpdate();
// 휴대폰에서 다른 앱을 쓰다가 돌아왔을 때도 확인
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate();
});
