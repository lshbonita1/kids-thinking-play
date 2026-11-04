'use strict';

const TOTAL = 10;
const $app = document.getElementById('app');

const LEVELS = [
  { name: '쉬움', age: '3~4세' },
  { name: '보통', age: '5세' },
  { name: '어려움', age: '6~7세' },
];

/* ---------- 유틸 ---------- */
const rand = (n) => Math.floor(Math.random() * n);
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

/* ---------- 놀이 1: 모양 기억하기 ---------- */
const memoryGame = {
  id: 'memory',
  title: '모양 기억하기',
  desc: '칠해진 칸을 기억해요',
  skill: '작업 기억',
  icon: '🧠',
  color: '#f3d6cf',

  round(i, ctx) {
    const count = [2, 3, 4][ctx.level] + (i >= 5 ? 1 : 0);
    const original = sample([...Array(9).keys()], count).sort((a, b) => a - b);
    const rec = { original, answer: [] };
    const selected = new Set();

    const title = el('div');
    const cells = [...Array(9)].map((_, k) =>
      el('button', { class: 'mcell', disabled: true, 'aria-label': `${k + 1}번 칸`, onclick: () => toggle(k) }));
    const grid = el('div', { class: 'mgrid big' }, cells);
    const timerFill = el('div', { class: 'timer-fill' });
    const timer = el('div', { class: 'timer' }, timerFill);
    const doneBtn = el('button', { class: 'btn-main', disabled: true, onclick: submit }, '다 했어요');
    doneBtn.hidden = true;
    ctx.stage.append(title, grid, timer, doneBtn);

    // 1단계: 보여주기
    title.replaceChildren(prompt('잘 보고 기억해요!'));
    original.forEach((k) => cells[k].classList.add('on'));
    const showMs = 2500 + count * 500;
    timerFill.style.animationDuration = `${showMs}ms`;
    timer.classList.add('run');

    // 2단계: 따라 칠하기
    ctx.later(() => {
      original.forEach((k) => cells[k].classList.remove('on'));
      cells.forEach((c) => { c.disabled = false; });
      timer.hidden = true;
      doneBtn.hidden = false;
      title.replaceChildren(prompt('똑같이 칠해 보세요'));
    }, showMs);

    function toggle(k) {
      if (selected.has(k)) selected.delete(k);
      else selected.add(k);
      cells[k].classList.toggle('on', selected.has(k));
      doneBtn.disabled = selected.size === 0;
      tone([selected.has(k) ? 620 : 440], 0.06);
    }

    function submit() {
      rec.answer = [...selected].sort((a, b) => a - b);
      ctx.finish(sameSet(rec.answer, original));
    }

    return rec;
  },

  review(rec) {
    return el('div', { class: 'compare' },
      el('div', { class: 'compare-col' }, '원본', miniGrid(rec.original)),
      el('div', { class: 'compare-col' }, '내 답', miniGrid(rec.answer)),
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
const AABB = [0, 0, 1, 1];
const ABAC = [0, 1, 0, 2];
// 단계별 · 문제 번호별 규칙
const PATTERN_UNITS = [
  [AB, AB, AB, AB, AB, AB, AB, AB, AB, AB],
  [AB, AB, AB, AB, AAB, ABB, AAB, ABB, ABC, ABC],
  [AAB, ABB, ABC, AAB, ABC, ABB, ABC, AABB, ABAC, ABC],
];
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
    const choiceCount = ctx.level === 2 ? 4 : 3;
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
  [[1, 3], [1, 5]],
  [[2, 5], [3, 7]],
  [[4, 8], [5, 10]],
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
const ODD_SIZES = [[4, 4], [6, 6], [6, 9]];

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
    const hard = ctx.level === 2 || (ctx.level === 1 && i >= 5);
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
const FLIP_PAIRS = [[2, 2, 3, 3, 3], [3, 3, 4, 4, 4], [4, 4, 5, 5, 6]];
// 시작할 때 카드를 미리 보여주는 시간
const FLIP_PEEK = [2500, 1800, 1200];

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
    const similar = ctx.level === 2 || (ctx.level === 1 && i >= 5);
    const pool = similar
      ? group.filter((x) => x !== answer)
      : SHADOW_GROUPS.filter((g) => g !== group).flat();
    const choices = shuffle([answer, ...sample(pool, ctx.level === 2 ? 3 : 2)]);
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
const ORDER_LENGTHS = [[3, 3], [3, 4], [4, 5]];
const ORDER_MAX_NUMBER = [3, 9, 20];

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

const GAMES = [memoryGame, patternGame, countGame, oddGame, flipGame, shadowGame, orderGame];

const bestKey = (game, level) => `best:${game.id}:${level}`;

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
      '👪 보호자 안내 · 놀이마다 5~10문제(약 3~5분)예요. 아이 옆에서 함께 소리 내어 이야기하며 풀고, ',
      '정답보다 끝까지 생각해 본 과정을 칭찬해 주세요. 같은 단계 안에서도 뒤로 갈수록 조금씩 어려워져요. ',
      '너무 쉬워하거나 어려워하면 위에서 난이도를 바꿔 주세요.'),
  ));
}

/* ---------- 화면: 놀이 ---------- */
function playGame(game) {
  const level = settings.level;
  const total = game.total ?? TOTAL;
  const points = Math.round(100 / total);
  const state = { level, index: 0, score: 0, records: [] };
  let rec = null;
  let locked = false;
  let timers = [];

  const counter = el('div', { class: 'counter' });
  const barFill = el('div', { class: 'bar-fill' });
  const score = el('div', { class: 'score' });
  const stage = el('main', { class: 'stage' });

  const myScreen = mount(el('div', { class: 'screen game' },
    el('header', { class: 'topbar' },
      el('button', { class: 'icon-btn', 'aria-label': '그만하기', onclick: showHome }, '✕'),
      counter,
      el('div', { class: 'bar' }, barFill),
      score,
      el('button', { class: 'pill-btn', onclick: () => finish(false, 'pass') }, '패스')),
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
      showResult(game, state);
      return;
    }
    counter.textContent = `${state.index + 1} / ${total}`;
    barFill.style.width = `${((state.index + 1) / total) * 100}%`;
    score.textContent = `${state.score}점`;
    stage.replaceChildren();
    locked = false;
    rec = game.round(state.index, ctx);
  }

  function finish(correct, kind) {
    if (locked || !rec) return;
    locked = true;
    timers.forEach(clearTimeout);
    timers = [];
    const passed = kind === 'pass';
    state.records.push({ ...rec, correct, passed });
    if (correct) state.score = Math.min(100, state.score + points);
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
function showResult(game, state) {
  const total = state.records.length;
  const correct = state.records.filter((r) => r.correct).length;
  const ratio = correct / total;
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : ratio >= 0.3 ? 1 : 0;
  const best = store.get(bestKey(game, state.level), 0);
  if (state.score > best) store.set(bestKey(game, state.level), state.score);

  const message = ['다음엔 더 잘할 수 있어요!', '조금씩 늘고 있어요!', '정말 잘했어요!', '최고예요!'][stars];
  tone([523, 659, 784, 1047], 0.12);
  speak(`${total}개 중에 ${correct}개 맞았어요. ${message}`);

  const badgeOf = (r) => game.badge?.(r)
    ?? (r.passed ? ['pass', '패스'] : r.correct ? ['good', '정답'] : ['bad', '오답']);

  mount(el('div', { class: 'screen result' },
    el('section', { class: 'result-hero' },
      el('div', { class: 'result-level' }, `${game.title} · ${LEVELS[state.level].name}`),
      el('div', { class: 'stars' }, [0, 1, 2].map((k) => el('span', { class: `star${k < stars ? '' : ' off'}` }, '⭐'))),
      el('div', { class: 'result-title' }, `${total}개 중 ${correct}개 맞았어요! ${message}`),
      el('div', { class: 'result-score' }, `${state.score}점`),
      el('div', { class: 'result-actions' },
        el('button', { class: 'btn-main', onclick: () => playGame(game) }, '다시 하기'),
        el('button', { class: 'btn-main alt', onclick: showHome }, '다른 놀이'))),
    el('section', { class: 'records' },
      state.records.map((r, k) => {
        const [cls, text] = badgeOf(r) ?? ['pass', '패스'];
        return el('article', { class: 'rcard' },
          el('div', { class: 'rcard-head' },
            el('span', { class: 'rnum' }, String(k + 1)),
            el('span', { class: `badge ${cls}` }, text)),
          game.review(r));
      })),
  ));
}

showHome();
