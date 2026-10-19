// 4자리 암호 입력. 설정·확인·변경에 같은 화면을 쓴다.
//
// 보안이 목적이 아니다 — 아이가 스스로 별을 못 주게 하는 정도면 된다.
// 그래도 평문으로 두지 않고, 잊었을 때는 어른만 풀 만한 산수로 연다.

import { PIN_LENGTH } from './config.js';
import { checkPin, setPin, getTokenState } from './storage.js';
import { sfx } from './sound.js';

const overlay = () => document.getElementById('overlay-pin');

function renderDots(filled) {
  const el = document.getElementById('pin-dots');
  el.replaceChildren();
  for (let i = 0; i < PIN_LENGTH; i++) {
    const dot = document.createElement('span');
    dot.className = 'pin-dot' + (i < filled ? ' is-on' : '');
    el.append(dot);
  }
}

// 한 번 입력받는다. 취소하면 null.
function readPin(title, { allowForgot = false } = {}) {
  return new Promise((resolve) => {
    const ov = overlay();
    document.getElementById('pin-title').textContent = title;
    const pad = document.getElementById('pin-pad');
    const cancel = document.getElementById('btn-pin-cancel');
    const forgot = document.getElementById('btn-pin-forgot');

    let value = '';
    renderDots(0);
    pad.replaceChildren();

    const close = (result) => {
      ov.hidden = true;
      cancel.removeEventListener('click', onCancel);
      forgot.removeEventListener('click', onForgot);
      resolve(result);
    };
    const onCancel = () => close(null);
    const onForgot = () => close({ forgot: true });

    const push = (digit) => {
      if (value.length >= PIN_LENGTH) return;
      value += digit;
      renderDots(value.length);
      sfx.tap();
      if (value.length === PIN_LENGTH) setTimeout(() => close({ pin: value }), 120);
    };

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '←'];
    for (const k of keys) {
      if (k === '') { pad.append(document.createElement('span')); continue; }
      const btn = document.createElement('button');
      btn.className = 'key';
      btn.textContent = k;
      btn.addEventListener('click', () => {
        if (k === '←') { value = value.slice(0, -1); renderDots(value.length); return; }
        push(k);
      });
      pad.append(btn);
    }

    forgot.hidden = !allowForgot;
    cancel.addEventListener('click', onCancel);
    forgot.addEventListener('click', onForgot);
    ov.hidden = false;
  });
}

// 어른만 풀 만한 산수 한 문제. 맞히면 암호를 다시 정할 수 있다.
// 보안 장치가 아니라 아이가 혼자 못 넘게 막는 턱이다.
async function forgotGate(app) {
  const a = 20 + Math.floor(Math.random() * 60);
  const b = 3 + Math.floor(Math.random() * 7);

  const got = await app.promptNumber(a + ' × ' + b + ' = ?');
  if (got === null) return false;

  if (got.trim() !== String(a * b)) {
    app.toast('답이 달라요');
    return false;
  }
  return true;
}

// 암호를 확인한다. 아직 암호가 없으면 새로 정한다.
export async function askPin(app, { title = '암호를 넣어 주세요', forSetup = false } = {}) {
  const st = getTokenState();

  if (!st.parent || forSetup) {
    // 한 번만 받는다. 잘못 눌러도 "암호를 잊었어요"로 다시 정할 수 있다.
    const first = await readPin(forSetup ? '새 암호를 정해 주세요' : '암호를 정해 주세요');
    if (!first || !first.pin) return false;

    await setPin(first.pin);
    app.toast('암호를 정했어요');
    return true;
  }

  const got = await readPin(title, { allowForgot: true });
  if (!got) return false;

  if (got.forgot) {
    const passed = await forgotGate(app);
    if (!passed) return false;
    return askPin(app, { forSetup: true });
  }

  if (await checkPin(got.pin)) return true;

  sfx.nope();
  app.toast('암호가 달라요');
  return false;
}
