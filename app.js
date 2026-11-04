'use strict';

const TOTAL = 10;
const $app = document.getElementById('app');

const LEVELS = [
  { name: '쉬움', age: '3~4세' },
  { name: '보통', age: '5세' },
  { name: '어려움', age: '6~7세' },
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
  level: store.get('level', 1),
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
    tone([selected.has(k) ? 620 : 440], 0.06);
    onChange(selected);
  }
  return {
    node: el('div', { class: `mgrid ${size}` }, cells),
    cells,
    answer: () => [...selected].sort((a, b) => a - b),
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
      ctx.finish(sameSet(rec.answer, original));
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
      ctx.finish(sameSet(rec.answer, original));
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
const isStraight = (a, b) => DOTS[a].r === DOTS[b].r || DOTS[a].c === DOTS[b].c;
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
  const lineLayer = svg('g');
  const previewLayer = svg('g');
  const dots = DOTS.map((_, k) => {
    const [x, y] = dotXY(k);
    return svg('g', { class: 'dl-dot' }, svg('circle', { cx: x, cy: y, r: 10, class: 'dl-point' }));
  });
  const node = svg('svg', { viewBox: '0 0 300 300', class: `dl-board ${size}${drawable ? ' drawable' : ''}` },
    svg('rect', { x: 30, y: 30, width: 240, height: 240, class: 'dl-frame' }),
    lineLayer,
    previewLayer,
    svg('g', {}, ...dots));
  return {
    node,
    dots,
    draw(lines, kind) {
      lineLayer.replaceChildren(...lines.map(([a, b]) => {
        const [x1, y1] = dotXY(a);
        const [x2, y2] = dotXY(b);
        return svg('line', { x1, y1, x2, y2, class: `dl-line ${kind}` });
      }));
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
      el('div', { class: 'hint' }, '점에서 점까지 손가락으로 쭉 그어요'),
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
      ctx.finish(sameSet(mine.map(lineKey), original.map(lineKey)));
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
const PATTERN_SETS = [
  ['🍎', '🍌', '🍇', '🍓', '🍊', '🍉', '🍑', '🥝'],
  ['🐶', '🐱', '🐰', '🐻', '🐼', '🐸', '🐷', '🐵'],
  ['🚗', '🚌', '🚲', '✈️', '🚀', '🚂', '⛵', '🚁'],
  ['🔴', '🟡', '🔵', '🟢', '🟣', '🟠'],
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
const PATTERN_GROUPS = 4;
const PATTERN_TILE = {
  2: 'clamp(52px, 15vw, 76px)',
  3: 'clamp(36px, 10vw, 58px)',
  4: 'clamp(44px, 13vw, 64px)',
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
  // 4칸짜리 규칙은 한 줄에 한 묶음씩
  const cols = unitLen >= 4 ? 1 : 2;
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
    const seq = Array.from({ length: PATTERN_GROUPS }, () => unit).flat();
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
    const choiceRow = el('div', { class: 'choices' },
      choices.map((c) => el('button', { class: 'tile choice', 'aria-label': c, onclick: () => choose(c) }, c)));
    choiceRow.hidden = true;
    const showBtn = el('button', {
      class: 'btn-main',
      onclick: () => {
        showBtn.hidden = true;
        choiceRow.hidden = false;
        tone([520, 700], 0.08);
      },
    }, '보기 확인');

    ctx.stage.append(prompt('빈칸에 들어갈 것은?'), board, showBtn, choiceRow);

    function choose(c) {
      rec.chosen = c;
      const ok = c === answer;
      blankNode.textContent = c;
      blankNode.className = `tile pop ${ok ? 'good' : 'bad'}`;
      ctx.finish(ok);
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
const COUNT_ITEMS = ['🍎', '🍓', '🐥', '⭐', '🎈', '🐟', '🌸', '🍪', '🚗', '🦋'];
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

    ctx.stage.append(prompt(`${emoji} 몇 개일까요?`, false), board, el('div', { class: 'num-choices' }, buttons));
    speak('몇 개일까요?');

    function choose(c, btn) {
      rec.chosen = c;
      btn.classList.add(c === n ? 'good' : 'bad');
      ctx.finish(c === n);
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
const ODD_EASY = [['🐶', '🐱'], ['🍎', '🍌'], ['🌞', '🌙'], ['🚗', '✈️'], ['🌷', '🍄'], ['⚽', '🎈']];
const ODD_HARD = [['🍎', '🍅'], ['🐥', '🐔'], ['🚗', '🚕'], ['🐟', '🐠'], ['🌷', '🌹'], ['⚽', '🏀'], ['🐻', '🐼'], ['🍊', '🍋']];
// 단계별 [앞 5문제, 뒤 5문제] 칸 수
const ODD_SIZES = [[4, 4], [4, 6], [6, 6]];

function oddGrid(items, cols, extra = {}) {
  return el('div', { class: `ogrid${extra.mini ? ' mini' : ''}`, style: `grid-template-columns:repeat(${cols},1fr)` },
    items.map((item, k) => el(extra.mini ? 'div' : 'button', {
      class: `otile ${extra.classOf?.(k) ?? ''}`,
      style: `font-size:${extra.mini ? 22 : cols === 2 ? 64 : 46}px;animation-delay:${k * 0.04}s`,
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
      rec.chosen = k;
      grid.children[k].classList.add(k === odd ? 'good' : 'bad');
      ctx.finish(k === odd);
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
const FLIP_ITEMS = ['🐶', '🐱', '🐰', '🐻', '🐼', '🐸', '🦁', '🐷', '🐵', '🐧', '🐥', '🐳'];
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
    const cols = deck.length <= 4 ? 2 : deck.length === 6 ? 3 : deck.length === 10 ? 5 : 4;
    const rec = { faces, misses: 0, done: false };
    let opened = [];
    let matched = 0;
    let busy = true;

    const title = el('div');
    const cards = deck.map((face, k) =>
      el('button', { class: 'card open', 'aria-label': '카드', onclick: () => flip(k) }, el('span', {}, face)));
    const grid = el('div', {
      class: 'card-grid',
      style: `grid-template-columns:repeat(${cols},1fr);font-size:${cols <= 3 ? 50 : 38}px`,
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
// 같은 묶음끼리는 모양이 비슷해서 어려운 단계에서 보기로 함께 나옴
const SHADOW_GROUPS = [
  ['🐶', '🐱', '🐰', '🐻', '🐷', '🐸', '🐵', '🐭'],
  ['🚗', '🚌', '🚲', '✈️', '🚂', '🚁', '⛵', '🚀'],
  ['🍎', '🍌', '🍇', '🍓', '🍐', '🍉', '🥕', '🍄'],
  ['🐘', '🦒', '🐢', '🐇', '🦋', '🐌', '🦀', '🐙'],
];

const shadow = (item) => el('span', { class: 'shadow' }, item);

const shadowGame = {
  id: 'shadow',
  title: '그림자 찾기',
  desc: '꼭 맞는 그림자를 골라요',
  skill: '형태 지각',
  icon: '👤',
  color: '#dcdde8',

  round(i, ctx) {
    const group = pick(SHADOW_GROUPS);
    const answer = pick(group);
    const similar = ctx.level === 2 && i >= 5;
    const pool = similar
      ? group.filter((x) => x !== answer)
      : SHADOW_GROUPS.filter((g) => g !== group).flat();
    const choices = shuffle([answer, ...sample(pool, ctx.level === 0 ? 1 : 2)]);
    const rec = { answer, chosen: null };

    const buttons = choices.map((c) =>
      el('button', { class: 'tile choice', 'aria-label': '그림자', onclick: () => choose(c, buttons[choices.indexOf(c)]) },
        shadow(c)));

    ctx.stage.append(
      prompt('알맞은 그림자를 찾아요!'),
      el('div', { class: 'tile shadow-target' }, answer),
      el('div', { class: 'choices' }, buttons),
    );

    function choose(c, btn) {
      rec.chosen = c;
      btn.classList.add(c === answer ? 'good' : 'bad');
      ctx.finish(c === answer);
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
  { items: ['🌱', '🌿', '🌳'], say: '자라는 순서대로 놓아요', level: 0 },
  { items: ['👶', '🧒', '🧑', '👴'], say: '자라는 순서대로 놓아요', level: 0 },
  { items: ['🌑', '🌒', '🌓', '🌔', '🌕'], say: '달이 커지는 순서대로 놓아요', level: 2 },
];
const ORDER_SIZE_ITEMS = ['🎈', '🍎', '🐻', '⭐', '🌸', '🐟', '🍩'];
// 단계별 [앞 5문제, 뒤 5문제] 개수
const ORDER_LENGTHS = [[2, 3], [3, 3], [3, 4]];
const ORDER_MAX_NUMBER = [3, 5, 9];

function makeOrderPuzzle(level, len) {
  const stories = ORDER_STORIES.filter((s) => s.level <= level && s.items.length >= len);
  const kind = pick(['size', 'number', ...(stories.length ? ['story', 'story'] : [])]);

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

  round(i, ctx) {
    const len = ORDER_LENGTHS[ctx.level][i < 5 ? 0 : 1];
    const puzzle = makeOrderPuzzle(ctx.level, len);
    let order;
    do order = shuffle(range(0, len - 1));
    while (order.every((v, k) => v === k));
    const placed = Array(len).fill(null); // 칸 → 조각 번호
    const rec = { items: puzzle.items, chosen: placed };
    const tileSize = len >= 5 ? 'clamp(44px, 14vw, 62px)' : 'clamp(56px, 17vw, 76px)';

    const slotNodes = placed.map((_, s) =>
      el('button', { class: 'tile blank slot', 'aria-label': `${s + 1}번째 자리`, onclick: () => unplace(s) },
        String(s + 1)));
    const pieceNodes = order.map((p) =>
      el('button', { class: 'tile choice', onclick: () => place(p) },
        el('span', { class: 'order-face', style: puzzle.items[p].scale ? `transform:scale(${puzzle.items[p].scale})` : '' },
          puzzle.items[p].label)));

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
      slotNodes[s].className = 'tile slot filled pop';
      pieceNodes[order.indexOf(p)].classList.add('used');
      tone([520 + s * 80], 0.07);
      if (!placed.includes(null)) {
        const ok = placed.every((v, k) => v === k);
        slotNodes.forEach((n) => n.classList.add(ok ? 'good' : 'bad'));
        ctx.finish(ok);
      }
    }

    function unplace(s) {
      const p = placed[s];
      if (p == null) return;
      placed[s] = null;
      slotNodes[s].replaceChildren(String(s + 1));
      slotNodes[s].className = 'tile blank slot';
      pieceNodes[order.indexOf(p)].classList.remove('used');
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

const GAMES = [copyGame, linesGame, memoryGame, patternGame, countGame, oddGame, flipGame, shadowGame, orderGame];

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

// 같은 날에는 누가 언제 열어도 같은 놀이 · 같은 문제가 나오도록 날짜로 정함
function dailyPlan(date) {
  const games = withRng(`plan:${date}`, () => sample(GAMES, DAILY_COUNTS.length));
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
function showHome() {
  window.speechSynthesis?.cancel();
  const soundBtn = el('button', {
    class: 'pill-btn',
    onclick: () => {
      settings.sound = !settings.sound;
      store.set('sound', settings.sound);
      soundBtn.textContent = settings.sound ? '🔊 소리 켬' : '🔇 소리 끔';
    },
  }, settings.sound ? '🔊 소리 켬' : '🔇 소리 끔');

  const levelPicker = el('div', { class: 'level-seg', role: 'radiogroup', 'aria-label': '난이도' },
    LEVELS.map((lv, k) => el('button', {
      class: `seg${k === settings.level ? ' on' : ''}`,
      role: 'radio',
      'aria-checked': String(k === settings.level),
      onclick: () => {
        settings.level = k;
        store.set('level', k);
        showHome();
      },
    }, el('span', { class: 'seg-name' }, lv.name), el('span', { class: 'seg-age' }, lv.age))));

  mount(el('div', { class: 'screen home' },
    el('header', { class: 'home-top' }, el('h1', {}, '쑥쑥 생각놀이'), soundBtn),
    el('p', { class: 'sub' }, '오늘은 어떤 놀이를 해볼까요?'),
    el('div', { class: 'level-label' }, '난이도'),
    levelPicker,
    dailyCard(),
    el('div', { class: 'level-label' }, '놀이 골라 하기'),
    el('div', { class: 'game-list' },
      GAMES.map((g) => {
        const best = store.get(bestKey(g, settings.level), null);
        return el('button', { class: 'game-card', style: `--c:${g.color}`, onclick: () => playGame(g) },
          el('div', { class: 'gc-icon' }, g.icon),
          el('div', { class: 'gc-body' },
            el('div', { class: 'gc-title' }, g.title),
            el('div', { class: 'gc-desc' }, g.desc),
            el('span', { class: 'gc-skill' }, g.skill)),
          best == null ? null : el('div', { class: 'gc-best' }, `최고 ${best}점`));
      })),
    el('p', { class: 'parent-note' },
      '👪 보호자 안내 · 매일 ‘오늘의 학습’으로 여러 놀이를 10문제씩 섞어 풀어 보세요(약 5분). ',
      '날마다 놀이 종류가 바뀌고, 같은 날에는 몇 번을 열어도 같은 문제가 나와요. ',
      '아이 옆에서 함께 소리 내어 이야기하며 풀고, 정답보다 끝까지 생각해 본 과정을 칭찬해 주세요. ',
      '너무 쉬워하거나 어려워하면 위에서 난이도를 바꿔 주세요.'),
  ));
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

// session: { title, level, rounds: [{ game, index }], seed?, showGameName?, restart, save }
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
  gameName.hidden = !session.showGameName;
  const stage = el('main', { class: 'stage' });

  const myScreen = mount(el('div', { class: 'screen game' },
    el('header', { class: 'topbar' },
      el('button', { class: 'icon-btn', 'aria-label': '그만하기', onclick: showHome }, '✕'),
      counter,
      el('div', { class: 'bar' }, barFill),
      score,
      el('button', { class: 'pill-btn', onclick: () => finish(false, 'pass') }, '패스')),
    gameName,
    stage,
  ));
  const alive = () => screenId === myScreen;

  const ctx = {
    stage,
    level,
    finish: (correct, kind) => finish(correct, kind),
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
    locked = false;
    // 놀이가 rec을 나중에 고쳐 쓰므로 복사하지 않고 그대로 씀
    const make = () => Object.assign(game.round(index, ctx), { game });
    rec = session.seed ? withRng(`${session.seed}:${state.index}`, make) : make();
  }

  function finish(correct, kind) {
    if (locked || !rec) return;
    locked = true;
    timers.forEach(clearTimeout);
    timers = [];
    const passed = kind === 'pass';
    state.records.push({ ...rec, correct, passed });
    if (correct) {
      state.correct++;
      state.score = Math.min(100, state.score + points);
    }
    score.textContent = `${state.score}점`;
    feedback(kind ?? (correct ? 'good' : 'bad'), () => {
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
    ?? (r.passed ? ['pass', '패스'] : r.correct ? ['good', '정답'] : ['bad', '오답']);

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

showHome();
