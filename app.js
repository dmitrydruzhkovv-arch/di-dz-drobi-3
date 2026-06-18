/* ДЗ3 «Сложение и вычитание дробей» — урок 3 спринта «Дроби».
   Формат: ОДНА КАРТОЧКА НА ЭКРАН, движение только вперёд (стрелки «назад» нет).
   Данные: data.json (Методист). Математику не менять — только интерфейс и проверка.
   Бум-эффект: вспышки фона-ромбов (.lk-flash-*) + звуки из бренд-кита по URL. */

'use strict';

// ── УТИЛИТЫ ──────────────────────────────────────────────────────────────────

function makeFrac(n, d) {
  return `<span class="frac lk-mono"><span class="fn">${n}</span><span class="fd">${d}</span></span>`;
}
function makeMixed(w, n, d) {
  return `<span class="mixed-num lk-mono"><span>${w}</span>${makeFrac(n, d)}</span>`;
}

// Мини-маркап Методиста: **акцент**→.lk-hl, `моно`→.lk-mono, 7/4→двухэтажная дробь.
function fmtInline(text) {
  if (text == null) return '';
  return String(text)
    .replace(/\*\*(.+?)\*\*/g, (_, s) => `<span class="lk-hl">${s}</span>`)
    .replace(/`([^`]+)`/g,     (_, s) => `<span class="lk-mono">${s}</span>`)
    .replace(/(\d+)\/(\d+)/g,  (_, n, d) => makeFrac(n, d));
}

// Выражение (3/10 + 1/10): дроби + знаки операций с воздухом, оператор по центру высоты.
function fmtExpr(text) {
  return fmtInline(text).replace(/\s([+\-−=])\s/g, ' <span class="ex-op">$1</span> ');
}

function renderFeedback(fb) {
  const parts = Array.isArray(fb) ? fb : String(fb).split('\n');
  return parts.map(p => p.trim()).filter(Boolean)
    .map(p => `<p class="fb-p">${fmtInline(p)}</p>`).join('');
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const KEYS = ['A', 'B', 'C', 'D', 'E'];
const PRED_LABELS = { lt: '< 1', eq: '= 1', gt: '> 1' };
const PRED_VALS = ['lt', 'eq', 'gt'];
const PAIR_COLORS = ['mp-pair-0', 'mp-pair-1', 'mp-pair-2', 'mp-pair-3'];

// ── БУМ-ЭФФЕКТ: вспышки + звук ───────────────────────────────────────────────

function lkFlash(el) { el.classList.remove('is-on'); void el.offsetWidth; el.classList.add('is-on'); }
function playSound(id) {
  const a = document.getElementById(id);
  if (!a) return;
  try { a.currentTime = 0; a.play().catch(() => {}); } catch (e) {}
}
function boom(correct) {
  if (correct) { lkFlash(document.getElementById('lk-fx-ok')); playSound('snd-win'); }
  else         { lkFlash(document.getElementById('lk-fx-bad')); playSound('snd-lose'); }
}

// ── СОСТОЯНИЕ ────────────────────────────────────────────────────────────────

let DATA = null;
let idx = 0;
let combo = 0;
let firstTryCount = 0;
let finished = false;
let reported = false;   // #38 — отчёт уже отправлен (живёт и в localStorage)
let devMode = false;    // тест-режим Ди (?g=N / ?goto=N) — прогресс НЕ сохраняем
let allowSend = false;  // ?send=1 — разрешить отчёт даже в тест-режиме (проверка #38)
const results = []; // по заданию: { label, diff, correct, wrong:[строки], feedback }

// ── СОХРАНЕНИЕ ПРОГРЕССА (localStorage) ──────────────────────────────────────
// Refresh / случайное закрытие вкладки не сбрасывает ученика на старт.
// Инвариант: в начале задачи idx === results.length → позицию восстанавливаем
// как «следующая нерешённая», без риска двойного зачёта.
const HW_ID = 'dz_drobi_urok3';
function progKey() {
  const u = (new URLSearchParams(location.search).get('u') || '').slice(0, 40);
  return `hwprog:${HW_ID}:${u}`;
}
function saveProgress() {
  if (devMode) return;
  try {
    localStorage.setItem(progKey(), JSON.stringify({
      v: 1, results, firstTryCount, combo, finished, reported
    }));
  } catch (e) { /* приватный режим — просто не сохраняем */ }
}
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(progKey()) || 'null'); }
  catch (e) { return null; }
}
function clearProgress() { try { localStorage.removeItem(progKey()); } catch (e) {} }

// ── МЕХАНИКА 1: ОТМЕТЬ ВСЕ ВЕРНЫЕ (чекбоксы) ────────────────────────────────

function buildMultiSelect(task) {
  const shown = task._shown || (task._shown = shuffle(task.options.map((o, i) => ({ ...o, _i: i }))));
  return shown.map((o, i) => `
    <div class="ms-item" data-i="${i}">
      <div class="ms-box">✓</div>
      <div class="ms-text">${fmtInline(o.text)}</div>
    </div>`).join('');
}
function initMultiSelect(task, card) {
  const shown = task._shown;
  card.querySelectorAll('.ms-item').forEach(item => {
    item.addEventListener('click', () => {
      if (item.classList.contains('is-locked')) return;
      item.classList.toggle('checked');
    });
  });
  return {
    check() {
      const picked = [...card.querySelectorAll('.ms-item.checked')].map(el => +el.dataset.i);
      if (picked.length === 0) return { ok: false };
      let allCorrect = true;
      const wrong = [];
      shown.forEach((o, i) => {
        const item = card.querySelector(`.ms-item[data-i="${i}"]`);
        const checked = item.classList.contains('checked');
        if (checked !== o.correct) allCorrect = false;
        item.classList.remove('checked');
        item.classList.add('is-locked');
        if (o.correct) item.classList.add('is-correct');
        else if (checked) item.classList.add('is-wrong');
      });
      const yourLetters = picked.map(i => KEYS[i]).join(', ') || '—';
      const rightLetters = shown.map((o, i) => o.correct ? KEYS[i] : null).filter(Boolean).join(', ');
      if (!allCorrect) wrong.push(`ты отметил: **${yourLetters}** · верно: **${rightLetters}**`);
      return { ok: true, correct: allCorrect, wrong };
    }
  };
}

// ── МЕХАНИКА 2: ВПИСАТЬ ЧИСЛИТЕЛЬ (равенство «займи единицу») ────────────────

function buildFillNum(task) {
  return task.items.map((it, i) => `
    <div class="fn-row" id="fn-${task.id}-${i}">
      ${makeMixed(it.left[0], it.left[1], it.left[2])}
      <span class="fn-eq">=</span>
      <span class="mixed-num lk-mono">
        <span>${it.rhsWhole}</span>
        <span class="input-frac-col">
          <span class="input-num-wrap">
            <input class="input-field" type="number" inputmode="numeric" id="fn-in-${task.id}-${i}" min="0" max="99" placeholder="?">
          </span>
          <span class="input-den">${it.den}</span>
        </span>
      </span>
      <span class="fn-hint">${it.hint || ''}</span>
    </div>`).join('');
}
function checkFillNum(task, card) {
  let allFilled = true, allCorrect = true;
  const wrong = [];
  task.items.forEach((it, i) => {
    const v = parseInt(card.querySelector(`#fn-in-${task.id}-${i}`).value);
    if (isNaN(v)) { allFilled = false; return; }
    const ok = v === it.ans;
    if (!ok) {
      allCorrect = false;
      wrong.push(`${makeMixed(it.left[0], it.left[1], it.left[2])} = ${it.rhsWhole} ${makeFrac(v, it.den)} → верно ${makeFrac(it.ans, it.den)}`);
    }
    card.querySelector(`#fn-${task.id}-${i}`).classList.add(ok ? 'is-correct' : 'is-wrong');
    card.querySelector(`#fn-in-${task.id}-${i}`).disabled = true;
  });
  if (!allFilled) return { ok: false };
  return { ok: true, correct: allCorrect, wrong };
}

// ── МЕХАНИКА 3: ПРЕДСКАЖИ < 1 / = 1 / > 1 ───────────────────────────────────

function buildPredict(task) {
  return task.items.map((it, i) => `
    <div class="pred-row">
      <div class="pred-expr">${fmtExpr(it.expr)}</div>
      <div class="pred-btns">
        ${PRED_VALS.map(v => `<button class="pred-btn" data-i="${i}" data-val="${v}">${PRED_LABELS[v]}</button>`).join('')}
      </div>
    </div>`).join('');
}
function initPredict(task, card) {
  const answers = {};
  card.querySelectorAll('.pred-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const i = btn.dataset.i;
      answers[i] = btn.dataset.val;
      card.querySelectorAll(`[data-i="${i}"].pred-btn`).forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  return {
    check() {
      if (!task.items.every((_, i) => answers[String(i)] !== undefined)) return { ok: false };
      let allCorrect = true;
      const wrong = [];
      task.items.forEach((it, i) => {
        const user = answers[String(i)];
        const ok = user === it.ans;
        if (!ok) {
          allCorrect = false;
          wrong.push(`${fmtExpr(it.expr)} → ты: ${PRED_LABELS[user]} · верно: ${PRED_LABELS[it.ans]}`);
        }
        card.querySelectorAll(`[data-i="${i}"].pred-btn`).forEach(b => {
          b.classList.remove('selected');
          if (b.dataset.val === it.ans)            b.classList.add('is-correct');
          else if (b.dataset.val === user && !ok)  b.classList.add('is-wrong');
          b.disabled = true;
        });
      });
      return { ok: true, correct: allCorrect, wrong };
    }
  };
}

// ── МЕХАНИКА 4: СОЕДИНИ ПАРЫ (выражение ↔ значение) ─────────────────────────

function buildMatchPairs(task) {
  const rightShuffled = task._right || (task._right = shuffle(task.pairs.map((p, i) => ({ ...p, origIdx: i }))));
  const leftCol = task.pairs.map((p, i) =>
    `<div class="mp-item" data-side="left" data-idx="${i}">${fmtExpr(p.left)}</div>`).join('');
  const rightCol = rightShuffled.map(p =>
    `<div class="mp-item" data-side="right" data-orig="${p.origIdx}">${fmtExpr(p.right)}</div>`).join('');
  return `
    <div class="mp-grid">
      <div class="mp-col"><div class="mp-col-label">${task.col_left}</div>${leftCol}</div>
      <div class="mp-col"><div class="mp-col-label">${task.col_right}</div>${rightCol}</div>
    </div>`;
}
function initMatchPairs(task, card) {
  const state = { sel: null, pairs: {} };
  function setNum(el, n) {
    if (!el) return;
    let b = el.querySelector('.mp-num');
    if (n === null) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'mp-num'; el.appendChild(b); }
    b.textContent = n;
  }
  function applyColors() {
    card.querySelectorAll('.mp-item').forEach(el => {
      PAIR_COLORS.forEach(c => el.classList.remove(c));
      el.classList.remove('mp-selected');
      setNum(el, null);
    });
    Object.entries(state.pairs).forEach(([li, p]) => {
      const lEl = card.querySelector(`[data-side="left"][data-idx="${li}"]`);
      const rEl = card.querySelector(`[data-side="right"][data-orig="${p.ro}"]`);
      const ci = (p.n - 1) % PAIR_COLORS.length;
      lEl?.classList.add(PAIR_COLORS[ci]); rEl?.classList.add(PAIR_COLORS[ci]);
      setNum(lEl, p.n); setNum(rEl, p.n);
    });
    if (state.sel) {
      const sel = state.sel.side === 'left'
        ? card.querySelector(`[data-side="left"][data-idx="${state.sel.key}"]`)
        : card.querySelector(`[data-side="right"][data-orig="${state.sel.key}"]`);
      sel?.classList.add('mp-selected');
    }
  }
  // Выбор работает с любой стороны: тапнул плитку → подсветилась; тапнул из другого
  // столбца → пара образована/переназначена; повторный тап по выделенной → снять.
  // Номер пары закрепляется в момент соединения и не переназначается (стабильность).
  function freeNum() {
    const used = new Set(Object.values(state.pairs).map(p => p.n));
    let n = 1; while (used.has(n)) n++; return n;
  }
  function pair(li, ro) {
    // снять прежнюю связь этой правой плитки (если была у другой левой)
    Object.keys(state.pairs).forEach(k => { if (+k !== li && state.pairs[k].ro === ro) delete state.pairs[k]; });
    if (state.pairs[li]) state.pairs[li].ro = ro;   // левая уже в паре — номер сохраняем, меняем цель
    else state.pairs[li] = { ro, n: freeNum() };    // новая пара — наименьший свободный номер
  }
  card.querySelectorAll('.mp-item').forEach(item => {
    item.addEventListener('click', () => {
      if (item.classList.contains('is-locked')) return;
      const side = item.dataset.side;
      const key = side === 'left' ? parseInt(item.dataset.idx) : parseInt(item.dataset.orig);

      if (state.sel && state.sel.side === side && state.sel.key === key) {
        state.sel = null;                              // повторный тап — снять выделение
      } else if (!state.sel || state.sel.side === side) {
        state.sel = { side, key };                     // выбрать / переключить на этой же стороне
      } else {
        const li = side === 'left'  ? key : state.sel.key;
        const ro = side === 'right' ? key : state.sel.key;
        pair(li, ro);                                  // другая сторона — образуем пару
        state.sel = null;
      }
      applyColors();
    });
  });
  return {
    check() {
      if (!task.pairs.every((_, i) => state.pairs[i] !== undefined)) return { ok: false };
      let allCorrect = true;
      const wrong = [];
      task.pairs.forEach((p, li) => {
        const ro = state.pairs[li].ro;
        const ok = ro === li;
        if (!ok) {
          allCorrect = false;
          wrong.push(`${fmtExpr(p.left)} → ты: ${fmtExpr(task.pairs[ro].right)} · верно: ${fmtExpr(p.right)}`);
        }
        const lEl = card.querySelector(`[data-side="left"][data-idx="${li}"]`);
        const rEl = card.querySelector(`[data-side="right"][data-orig="${ro}"]`);
        PAIR_COLORS.forEach(c => { lEl?.classList.remove(c); rEl?.classList.remove(c); });
        lEl?.classList.remove('mp-selected');
        lEl?.classList.add(ok ? 'is-correct' : 'is-wrong', 'is-locked');
        rEl?.classList.add(ok ? 'is-correct' : 'is-wrong', 'is-locked');
      });
      card.querySelectorAll('[data-side="right"]').forEach(el => el.classList.add('is-locked'));
      return { ok: true, correct: allCorrect, wrong };
    }
  };
}

// ── МЕХАНИКА 5/6: ВВОД СМЕШАННОГО [целое][числ]/[знам] ──────────────────────

function buildInputMixed(task) {
  return task.items.map((it, i) => `
    <div class="im-row" id="im-${task.id}-${i}">
      <div class="im-expr">${fmtExpr(it.expr)}</div>
      <div class="im-arrow">=</div>
      <div class="im-mixed">
        <input class="input-field" type="number" inputmode="numeric" id="im-w-${task.id}-${i}" min="0" max="99" placeholder="?">
        <div class="input-frac-col">
          <div class="input-num-wrap">
            <input class="input-field" type="number" inputmode="numeric" id="im-n-${task.id}-${i}" min="0" max="99" placeholder="?">
          </div>
          <input class="input-field input-den-field" type="number" inputmode="numeric" id="im-d-${task.id}-${i}" min="1" max="99" placeholder="?"
                 style="height:38px;width:46px;font-size:16px">
        </div>
      </div>
    </div>`).join('');
}
function checkInputMixed(task, card) {
  let allFilled = true, allCorrect = true;
  const wrong = [];
  task.items.forEach((it, i) => {
    const w = parseInt(card.querySelector(`#im-w-${task.id}-${i}`).value);
    const n = parseInt(card.querySelector(`#im-n-${task.id}-${i}`).value);
    const d = parseInt(card.querySelector(`#im-d-${task.id}-${i}`).value);
    if (isNaN(w) || isNaN(n) || isNaN(d)) { allFilled = false; return; }
    // верно: целое совпало И дробная часть равна эталону (принимаем и несокращённую запись)
    const ok = w === it.whole && d !== 0 && n * it.den === it.num * d;
    if (!ok) {
      allCorrect = false;
      wrong.push(`${fmtExpr(it.expr)} → ты: ${makeMixed(w, n, d)} · верно: ${makeMixed(it.whole, it.num, it.den)}`);
    }
    card.querySelector(`#im-${task.id}-${i}`).classList.add(ok ? 'is-correct' : 'is-wrong');
    ['w', 'n', 'd'].forEach(p => card.querySelector(`#im-${p}-${task.id}-${i}`).disabled = true);
  });
  if (!allFilled) return { ok: false };
  return { ok: true, correct: allCorrect, wrong };
}

// ── МЕХАНИКА 7: НАЙДИ ОШИБКУ (два решения, одиночный выбор у каждого) ────────

function buildFindErrorMulti(task) {
  return task.subs.map((sub, si) => {
    const opts = sub.options.map((o, oi) => `
      <button class="lk-opt" data-sub="${si}" data-opt="${oi}">
        <span class="lk-key">${KEYS[oi]}</span>
        <span>${fmtInline(o.text)}</span>
      </button>`).join('');
    return `
      <div class="fe-sub">
        <div class="fe-name">${sub.name}</div>
        <div class="shown-work">${fmtInline(sub.shown_work)}</div>
        <div class="lk-opts" data-sub="${si}">${opts}</div>
      </div>`;
  }).join('');
}
function initFindErrorMulti(task, card) {
  const chosen = {}; // si → oi
  card.querySelectorAll('.lk-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-locked')) return;
      const si = btn.dataset.sub;
      card.querySelectorAll(`.lk-opt[data-sub="${si}"]`).forEach(b => { b.style.borderColor = ''; b.style.background = ''; });
      chosen[si] = +btn.dataset.opt;
      btn.style.borderColor = 'var(--lk-violet)';
      btn.style.background = 'rgba(168,85,247,.10)';
    });
  });
  return {
    check() {
      if (!task.subs.every((_, si) => chosen[si] !== undefined)) return { ok: false };
      let allCorrect = true;
      const wrong = [];
      task.subs.forEach((sub, si) => {
        const pick = chosen[si];
        const ok = sub.options[pick].correct;
        if (!ok) {
          allCorrect = false;
          const right = sub.options.find(o => o.correct);
          wrong.push(`**${sub.name.split(' ')[0]}** → верно: ${fmtInline(right.text)}`);
        }
        sub.options.forEach((o, oi) => {
          const btn = card.querySelector(`.lk-opt[data-sub="${si}"][data-opt="${oi}"]`);
          btn.style.borderColor = ''; btn.style.background = '';
          if (o.correct)              btn.classList.add('is-correct');
          else if (oi === pick)        btn.classList.add('is-wrong');
          btn.classList.add('is-locked');
        });
      });
      return { ok: true, correct: allCorrect, wrong };
    }
  };
}

// ── МЕХАНИКА 8: СВОБОДНЫЙ ОТВЕТ (дробь / смешанное / буква) ──────────────────

// Нормализация ввода: убрать пробелы, * · ×, нижний регистр.
function normAns(s) { return String(s).toLowerCase().replace(/[\s*·×]/g, ''); }

function answerMatches(it, raw) {
  const u = normAns(raw);
  if (!u) return null; // пусто
  if (it.kind === 'letter') {
    const accept = (it.accept || [it.ans]).map(normAns);
    return accept.includes(u);
  }
  // числовая дробь / целое: принимаем эталон и любую равную запись
  const target = parseFrac(it.ans);
  const got = parseFrac(u);
  if (got === null || target === null) return normAns(it.ans) === u;
  return Math.abs(got - target) < 1e-9;
}
function parseFrac(s) {
  s = normAns(s);
  const m = s.match(/^(-?\d+)\/(\d+)$/);
  if (m) { const d = +m[2]; return d === 0 ? null : (+m[1]) / d; }
  if (/^-?\d+$/.test(s)) return +s;
  return null;
}

function buildInputAnswer(task) {
  return task.items.map((it, i) => `
    <div class="ia-row" id="ia-${task.id}-${i}">
      <div class="ia-expr">${fmtExpr(it.expr)}</div>
      <input class="ia-field" type="text" inputmode="text" autocomplete="off" id="ia-in-${task.id}-${i}" placeholder="ответ">
    </div>`).join('');
}
function checkInputAnswer(task, card) {
  let allFilled = true, allCorrect = true;
  const wrong = [];
  task.items.forEach((it, i) => {
    const raw = card.querySelector(`#ia-in-${task.id}-${i}`).value.trim();
    const m = answerMatches(it, raw);
    if (m === null) { allFilled = false; return; }
    if (!m) {
      allCorrect = false;
      wrong.push(`${fmtExpr(it.expr)} → ты: ${fmtInline(raw)} · верно: ${fmtInline(it.ans)}`);
    }
    card.querySelector(`#ia-${task.id}-${i}`).classList.add(m ? 'is-correct' : 'is-wrong');
    card.querySelector(`#ia-in-${task.id}-${i}`).disabled = true;
  });
  if (!allFilled) return { ok: false };
  return { ok: true, correct: allCorrect, wrong };
}

// ── СБОРКА КАРТОЧКИ ──────────────────────────────────────────────────────────

function buildBody(task) {
  switch (task.mechanic) {
    case 'multi_select':     return buildMultiSelect(task);
    case 'fill_num':         return buildFillNum(task);
    case 'predict':          return buildPredict(task);
    case 'match_pairs':      return buildMatchPairs(task);
    case 'input_mixed':      return buildInputMixed(task);
    case 'find_error_multi': return buildFindErrorMulti(task);
    case 'input_answer':     return buildInputAnswer(task);
    default: return '';
  }
}
function initMechanic(task, card) {
  switch (task.mechanic) {
    case 'multi_select':     return initMultiSelect(task, card);
    case 'predict':          return initPredict(task, card);
    case 'match_pairs':      return initMatchPairs(task, card);
    case 'find_error_multi': return initFindErrorMulti(task, card);
    case 'fill_num':         return { check: () => checkFillNum(task, card) };
    case 'input_mixed':      return { check: () => checkInputMixed(task, card) };
    case 'input_answer':     return { check: () => checkInputAnswer(task, card) };
    default: return { check: () => ({ ok: true, correct: true, wrong: [] }) };
  }
}

// ── РЕНДЕР ТЕКУЩЕЙ КАРТОЧКИ ──────────────────────────────────────────────────

function render() {
  if (idx >= DATA.tasks.length) return showFinal();
  const task = DATA.tasks[idx];
  const screen = document.getElementById('screen');

  // прогресс-бар: позиция = до проверки текущего
  document.getElementById('prog-label').textContent = `${idx + 1} из ${DATA.tasks.length}`;
  document.getElementById('prog-fill').style.width = `${(idx / DATA.tasks.length) * 100}%`;

  const isLast = idx === DATA.tasks.length - 1;
  const hasHint = !!(task.hint && String(task.hint).trim());
  screen.innerHTML = `
    <div class="task-card lk-card lk-screen" id="card-${task.id}">
      <div class="task-head">
        <div class="task-label-wrap"><span class="task-label">${task.label}</span></div>
        ${hasHint ? `<button class="lk-hint-btn" id="hint-btn-${task.id}" type="button" aria-expanded="false" aria-controls="hint-${task.id}" aria-label="Подсказка от Леммы">Λ</button>` : ''}
      </div>
      ${hasHint ? `<div class="lk-hint-panel" id="hint-${task.id}"><div class="lk-hint-inner"><div class="lk-hint-body"><span class="lk-hint-tag">Λ Подсказка</span>${fmtInline(task.hint)}</div></div></div>` : ''}
      <p class="task-intro">${fmtInline(task.intro)}</p>
      <div class="task-body">${buildBody(task)}</div>
      <div class="task-feedback" id="fb-${task.id}">
        <div class="fb-label">Разбор</div>
        ${renderFeedback(task.feedback)}
      </div>
      <button class="lk-btn check-btn" id="btn-${task.id}">Проверить</button>
      <button class="lk-btn next-btn" id="next-${task.id}" hidden>${isLast ? 'К итогам ✨' : 'Дальше →'}</button>
    </div>`;
  window.scrollTo(0, 0);

  const card = document.getElementById(`card-${task.id}`);
  const checker = initMechanic(task, card);
  const checkBtn = document.getElementById(`btn-${task.id}`);
  const nextBtn = document.getElementById(`next-${task.id}`);

  // кнопка-подсказка Леммы (Λ): тап → раскрыть/свернуть панель подсказки
  const hintBtn = document.getElementById(`hint-btn-${task.id}`);
  if (hintBtn) {
    const hintPanel = document.getElementById(`hint-${task.id}`);
    hintBtn.addEventListener('click', () => {
      const open = hintPanel.classList.toggle('is-open');
      hintBtn.classList.toggle('is-open', open);
      hintBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  checkBtn.addEventListener('click', () => {
    const res = checker.check();
    if (!res || !res.ok) {
      checkBtn.classList.remove('shake'); void checkBtn.offsetWidth; checkBtn.classList.add('shake');
      checkBtn.addEventListener('animationend', () => checkBtn.classList.remove('shake'), { once: true });
      return;
    }
    // бум-эффект: фон-вспышка ромбов + реакция самой карточки
    boom(res.correct);
    card.classList.remove('lk-card-win', 'lk-card-shake'); void card.offsetWidth;
    card.classList.add(res.correct ? 'lk-card-win' : 'lk-card-shake');
    card.addEventListener('animationend', function clr(e) {
      if (e.target !== card) return;   // игнор анимаций дочерних (разбор lk-in и т.п.)
      card.classList.remove('lk-card-win', 'lk-card-shake');
      card.removeEventListener('animationend', clr);
    });
    // разбор + блокировка
    document.getElementById(`fb-${task.id}`).classList.add('show');
    checkBtn.disabled = true; checkBtn.hidden = true;
    nextBtn.hidden = false;
    // учёт результата
    if (res.correct) { firstTryCount++; combo++; } else { combo = 0; }
    updateCombo();
    document.getElementById('prog-fill').style.width = `${((idx + 1) / DATA.tasks.length) * 100}%`;
    results[idx] = {
      label: task.label, diff: task.difficulty,
      correct: res.correct, wrong: res.wrong || [], feedback: task.feedback
    };
    saveProgress();   // прогресс не теряется при refresh
  });

  nextBtn.addEventListener('click', () => { idx++; render(); });
}

function updateCombo() {
  const el = document.getElementById('combo');
  if (combo >= 2) { el.textContent = `🔥 ${combo} подряд!`; el.classList.add('show'); }
  else { el.classList.remove('show'); }
}

// ── ОТЧЁТ РЕПЕТИТОРУ (#38) — авто-отправка итогов на сервер ──────────────────
// Ученика опознаём ником из ссылки (?u=misha) — ПДн на провод не уходят.
// Сервер (RF, Caddy+HTTPS) шлёт итоги Ди в ВК и пишет в БД. Без ника — не шлём.
const HW_ENDPOINT = 'https://194-87-110-53.nip.io/hw-result';

function hwToken() {
  const p = new URLSearchParams(location.search);
  return (p.get('u') || p.get('id') || '').slice(0, 40);
}

function reportResults(score, total) {
  if (reported || (devMode && !allowSend)) return;   // тест-режим не шлёт (если нет ?send=1)
  const token = hwToken();
  if (!token) return;                 // нет ника — это превью/без привязки
  reported = true;
  saveProgress();                     // чтобы refresh на итогах не слал повторно
  const errors = [];
  results.forEach((r, i) => { if (r && !r.correct) errors.push(`№${i + 1} ${r.label}`); });
  const hw = `${DATA.meta.kicker} — ${DATA.meta.title}`;
  try {
    fetch(HW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, hw, hw_id: HW_ID, score, total, errors }),
      keepalive: true
    }).catch(() => {});
  } catch (e) { /* офлайн — не мешаем ученику */ }
}

// ── ЭКРАН ИТОГОВ (обзорный, скриншот-готовый) ───────────────────────────────

function showFinal() {
  document.getElementById('screen').hidden = true;
  document.getElementById('hw-header').hidden = true;
  playSound('snd-final');

  const total = DATA.tasks.length;
  finished = true;
  reportResults(firstTryCount, total);   // #38 — авто-отчёт репетитору
  saveProgress();                        // refresh на итогах вернёт сюда же
  const tier = firstTryCount === total ? '🏆 Идеально — ни одной осечки!'
             : firstTryCount >= total - 2 ? '💪 Крепко держишь тему!'
             : '🔁 Загляни в разборы ошибок — и прорешай ещё разок.';

  const revHtml = results.map((r, i) => {
    const mark = r.correct ? '✅' : '❌';
    const wrongLines = (r.wrong && r.wrong.length)
      ? `<div class="rev-wrong-line">${r.wrong.map(w => fmtInline(w)).join('<br>')}</div>` : '';
    const razbor = `<div class="rev-razbor-label">Разбор</div>${renderFeedback(r.feedback)}`;
    return `
      <div class="rev-item ${r.correct ? 'ok' : 'bad'}" data-i="${i}">
        <div class="rev-head">
          <span class="rev-mark">${mark}</span>
          <span class="rev-title">${r.label}</span>
          <span class="rev-diff">${r.diff}</span>
          ${r.correct ? '' : '<span class="rev-toggle">показать ▾</span>'}
        </div>
        <div class="rev-body">${wrongLines}${razbor}</div>
      </div>`;
  }).join('');

  const f = DATA.final;
  const el = document.getElementById('final-screen');
  el.innerHTML = `
    <div class="lk-card" style="padding:22px 18px">
      <div class="fin-theme">${f.theme}</div>
      <div class="fin-tier">${tier}</div>
      <div class="fin-score"><b>${firstTryCount}</b> <span>из ${total} · ${f.counter_label}</span></div>
      ${revHtml}
    </div>

    <div class="lk-card fin-card">
      <div class="fin-unlock">${f.unlock}</div>
      <p class="fin-tease">${fmtInline(f.tease)}</p>
      <p class="fin-counter"><b>${firstTryCount}</b> ${f.counter_label} из ${total}</p>
    </div>

    <button class="lk-btn send-btn" id="send-btn">${f.send_label}</button>
    <p class="send-note">Сделай скриншот этого экрана и пришли репетитору — он увидит, что освоено, а что подтянуть.</p>

    <div class="lk-sign" style="margin-top:22px">
      <span class="lk-badge lk-badge-l">Λ</span>
      <span class="lk-badge lk-badge-di">Di</span>
    </div>
    <div style="height:32px"></div>`;
  el.classList.add('show');
  window.scrollTo(0, 0);

  // раскрытие ошибок
  el.querySelectorAll('.rev-item.bad .rev-head').forEach(head => {
    head.addEventListener('click', () => {
      const item = head.closest('.rev-item');
      const open = item.classList.toggle('open');
      const tg = item.querySelector('.rev-toggle');
      if (tg) tg.textContent = open ? 'скрыть ▴' : 'показать ▾';
    });
  });

  document.getElementById('send-btn').addEventListener('click', () => window.open(f.send_url, '_blank'));
}

// ── ИНИЦИАЛИЗАЦИЯ ─────────────────────────────────────────────────────────────

function startHw() {
  document.getElementById('cover').hidden = true;
  document.getElementById('hw-header').hidden = false;
  document.getElementById('screen').hidden = false;
  // победная мелодия на старте + «разбудить» остальные звуки (для мобильных)
  playSound('snd-win');
  ['snd-lose', 'snd-final'].forEach(id => {
    const a = document.getElementById(id);
    if (a) { a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {}); }
  });
  render();
}

// Возврат к незавершённой/завершённой работе (refresh, повторный заход с того же ника).
function restoreProgress() {
  const saved = loadProgress();
  if (!saved || !Array.isArray(saved.results) || !saved.results.length) return false;
  saved.results.forEach(r => results.push(r));
  firstTryCount = (typeof saved.firstTryCount === 'number')
    ? saved.firstTryCount : results.filter(r => r && r.correct).length;
  combo = saved.combo || 0;
  reported = !!saved.reported;
  finished = !!saved.finished;
  idx = results.length;                 // следующая нерешённая
  document.getElementById('cover').hidden = true;
  document.getElementById('hw-header').hidden = false;
  document.getElementById('screen').hidden = false;
  if (finished || idx >= DATA.tasks.length) showFinal();
  else render();
  return true;
}

// ТЕСТ-РЕЖИМ Ди: ?goto=N — прыжок на задачу N (1..total), предыдущие
// засчитываются автоматически. Прогресс НЕ сохраняем (не мешает ученику).
function devGoto(n) {
  devMode = true;
  const total = DATA.tasks.length;
  const target = Math.max(1, Math.min(total, n)) - 1;   // 0-based
  for (let i = 0; i < target; i++) {
    const t = DATA.tasks[i];
    results[i] = { label: t.label, diff: t.difficulty, correct: true, wrong: [], feedback: t.feedback };
  }
  firstTryCount = target;
  idx = target;
  document.getElementById('cover').hidden = true;
  document.getElementById('hw-header').hidden = false;
  document.getElementById('screen').hidden = false;
  render();
}

function init(data) {
  DATA = data;
  document.getElementById('cv-kicker').textContent = data.meta.kicker;
  document.getElementById('cv-title').textContent = data.meta.title;
  document.getElementById('cv-lead').textContent = data.meta.cover_lead || data.meta.subtitle;
  document.getElementById('cv-meta').textContent =
    `${data.tasks.length} заданий · ~${data.meta.minutes || 12} мин`;
  document.getElementById('cv-start').addEventListener('click', startHw);

  const qs = new URLSearchParams(location.search);
  if (qs.get('reset') === '1') clearProgress();          // начать заново
  allowSend = qs.get('send') === '1';                    // тест отчёта с прыжка
  const g = parseInt(qs.get('g') || qs.get('goto'), 10); // ?g=8 (коротко) или ?goto=8
  if (!isNaN(g)) { devGoto(g); return; }                 // тест-режим Ди
  restoreProgress();                                     // продолжить с места
}

fetch('data.json')
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(init)
  .catch(() => {
    document.getElementById('screen').hidden = false;
    document.getElementById('screen').innerHTML =
      '<p style="color:var(--lk-bad);padding:20px;font-size:15px">Ошибка загрузки данных. Обновите страницу.</p>';
  });
