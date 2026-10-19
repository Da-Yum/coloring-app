// 화면 전환과 초기화. 각 화면 모듈은 init(app)으로 app을 받는다.
// (화면 → main 역import를 만들지 않으려고 app 객체를 넘긴다.)

import * as start from './screens/start.js';
import * as select from './screens/select.js';
import * as paint from './screens/paint.js';
import * as done from './screens/done.js';
import * as gallery from './screens/gallery.js';
import * as parent from './screens/parent.js';
import { getTokenState } from './storage.js';
import { FEATURES } from './config.js';
import { askPin } from './pin.js';
import { wakeAudio } from './sound.js';

const screens = { start, select, paint, done, gallery, parent };
const els = {};
let current = null;

function show(name, payload) {
  for (const key of Object.keys(screens)) {
    els[key].classList.toggle('is-active', key === name);
  }
  if (current && screens[current].leave) screens[current].leave();
  current = name;
  if (screens[name].enter) screens[name].enter(payload);
}

/* ---------- 토스트 ---------- */

let toastTimer = null;
function toast(message, ms = 2000) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/* ---------- 대화상자 ---------- */

function confirmAsk(text) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('overlay-confirm');
    document.getElementById('confirm-text').textContent = text;
    overlay.hidden = false;

    const yes = document.getElementById('btn-confirm-yes');
    const no = document.getElementById('btn-confirm-no');
    const close = (answer) => {
      overlay.hidden = true;
      yes.removeEventListener('click', onYes);
      no.removeEventListener('click', onNo);
      resolve(answer);
    };
    const onYes = () => close(true);
    const onNo = () => close(false);
    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
  });
}

// 버튼이 여럿인 물음. options = [{ label, value, primary }]
function choose(text, options) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('overlay-choice');
    document.getElementById('choice-text').textContent = text;
    const actions = document.getElementById('choice-actions');
    actions.replaceChildren();

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.className = opt.primary ? 'big-btn' : 'ghost-btn';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        overlay.hidden = true;
        resolve(opt.value);
      });
      actions.append(btn);
    }
    overlay.hidden = false;
  });
}

// 숫자 하나를 받는다 (암호를 잊었을 때 쓰는 산수 문제용).
function promptNumber(text) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('overlay-choice');
    document.getElementById('choice-text').textContent = text;
    const actions = document.getElementById('choice-actions');
    actions.replaceChildren();

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'num-input';
    input.inputMode = 'numeric';

    const ok = document.createElement('button');
    ok.className = 'big-btn';
    ok.textContent = '확인';

    const cancel = document.createElement('button');
    cancel.className = 'ghost-btn';
    cancel.textContent = '취소';

    const close = (value) => { overlay.hidden = true; resolve(value); };
    ok.addEventListener('click', () => close(input.value));
    cancel.addEventListener('click', () => close(null));
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') close(input.value); });

    actions.append(input, ok, cancel);
    overlay.hidden = false;
    setTimeout(() => input.focus(), 50);
  });
}

/* ---------- 토큰 표시 ---------- */

function refreshTokens() {
  const on = FEATURES.tokens;
  const { tokens } = getTokenState();
  for (const id of ['tokens-start', 'tokens-select']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.hidden = !on;
    el.textContent = '⭐ ' + tokens;
  }
  const p = document.getElementById('tokens-parent');
  if (p) p.textContent = '⭐ ' + tokens;
}

/* ---------- 도안 목록 ---------- */

async function loadDrawings() {
  const res = await fetch('data/drawings.json');
  if (!res.ok) throw new Error('도안 목록을 불러오지 못했습니다 (' + res.status + ')');
  return res.json();
}

const app = {
  go: show,
  toast,
  confirm: confirmAsk,
  choose,
  promptNumber,
  askPin: (opts) => askPin(app, opts),
  refreshTokens,
  drawings: [],
};

async function boot() {
  for (const key of Object.keys(screens)) {
    els[key] = document.getElementById('screen-' + key);
  }

  try {
    app.drawings = await loadDrawings();
  } catch (err) {
    console.error(err);
    toast('도안을 불러오지 못했어요', 5000);
  }

  for (const mod of Object.values(screens)) mod.init(app);
  refreshTokens();
  show('start');

  // 소리는 사용자가 처음 건드릴 때 깨어난다
  document.addEventListener('pointerdown', wakeAudio, { once: true });

  // 오프라인에서도 돌아가게 (9단계).
  // load 이벤트를 기다리면 안 된다 — boot()가 await 뒤에 리스너를 달기 때문에
  // 그 시점엔 load가 이미 지나가 있고, 그러면 영영 등록되지 않는다.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('서비스 워커를 등록하지 못했습니다', err);
    });
  }
}

boot();
