// 부모 모드. 여기 들어오려면 시작 화면 자물쇠를 2초 누르고 암호를 넣어야 한다.

import { TOOLS } from '../config.js';
import { getTokenState, saveTokenState, isUnlocked } from '../storage.js';
import { sfx } from '../sound.js';

let app;

/* ---------- 별 주기 ---------- */

// 아이 화면 쪽으로 별이 날아가 쌓이는 연출
function flyStar() {
  const el = document.getElementById('star-fly');
  el.hidden = false;
  el.animate(
    [
      { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0 },
      { transform: 'translate(-50%, -140%) scale(1.4)', opacity: 1, offset: 0.45 },
      { transform: 'translate(-50%, -320%) scale(.6)', opacity: 0 },
    ],
    { duration: 900, easing: 'ease-out' },
  ).onfinish = () => { el.hidden = true; };
}

function give(deed) {
  const st = getTokenState();
  const entry = {
    at: new Date().toISOString(),
    deedId: deed.id,
    label: deed.label,
    amount: deed.reward,
  };
  saveTokenState({
    tokens: st.tokens + deed.reward,
    history: [entry, ...st.history].slice(0, 100),
  });
  sfx.token();
  flyStar();
  app.refreshTokens();
  render();
}

function adjust(delta) {
  const st = getTokenState();
  saveTokenState({ tokens: Math.max(0, st.tokens + delta) });
  sfx.tap();
  app.refreshTokens();
  render();
}

/* ---------- 그리기 ---------- */

function renderDeeds() {
  const list = document.getElementById('deed-list');
  list.replaceChildren();

  for (const deed of getTokenState().deeds) {
    const row = document.createElement('div');
    row.className = 'deed';

    const btn = document.createElement('button');
    btn.className = 'deed-main';

    const emoji = document.createElement('span');
    emoji.className = 'emoji';
    emoji.textContent = deed.emoji || '⭐';

    const label = document.createElement('span');
    label.textContent = deed.label;

    const reward = document.createElement('span');
    reward.className = 'reward';
    reward.textContent = '+' + deed.reward;

    btn.append(emoji, label, reward);
    btn.addEventListener('click', () => give(deed));

    const del = document.createElement('button');
    del.className = 'deed-del';
    del.textContent = '✕';
    del.setAttribute('aria-label', deed.label + ' 지우기');
    del.addEventListener('click', async () => {
      if (!(await app.confirm(deed.label + ' 항목을 지울까요?'))) return;
      const st = getTokenState();
      saveTokenState({ deeds: st.deeds.filter((d) => d.id !== deed.id) });
      render();
    });

    row.append(btn, del);
    list.append(row);
  }
}

// 잠글 수 있는 것: 값이 매겨진 도안과 특별 도구
function lockTargets() {
  const drawings = app.drawings
    .filter((d) => (d.cost || 0) > 0)
    .map((d) => ({ id: d.id, label: d.title, cost: d.cost }));

  const tools = TOOLS
    .filter((t) => t.cost)
    .map((t) => ({ id: t.id, label: t.label + ' 펜', cost: t.cost }));

  return [...drawings, ...tools];
}

function renderLocks() {
  const list = document.getElementById('lock-list');
  list.replaceChildren();

  const targets = lockTargets();
  if (!targets.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = '잠글 수 있는 항목이 없습니다. 도안에 cost를 넣으면 여기 나옵니다.';
    list.append(p);
    return;
  }

  for (const t of targets) {
    const row = document.createElement('div');
    row.className = 'lock-row';

    const label = document.createElement('span');
    label.textContent = t.label;

    const state = document.createElement('span');
    state.className = 'state';
    state.textContent = isUnlocked(t.id) ? '열림' : '⭐ ' + t.cost;

    const btn = document.createElement('button');
    btn.textContent = isUnlocked(t.id) ? '다시 잠그기' : '그냥 열기';
    btn.addEventListener('click', () => {
      const st = getTokenState();
      const next = isUnlocked(t.id)
        ? st.unlocked.filter((id) => id !== t.id)
        : [...st.unlocked, t.id];
      saveTokenState({ unlocked: next });
      sfx.tap();
      render();
    });

    row.append(label, state, btn);
    list.append(row);
  }
}

function renderHistory() {
  const list = document.getElementById('deed-history');
  list.replaceChildren();

  const { history } = getTokenState();
  if (!history.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = '아직 준 별이 없습니다.';
    list.append(p);
    return;
  }

  for (const h of history.slice(0, 30)) {
    const row = document.createElement('div');
    row.className = 'history-row';

    const what = document.createElement('span');
    what.textContent = h.label;

    const amount = document.createElement('span');
    amount.textContent = '+' + h.amount;

    const when = document.createElement('span');
    when.className = 'when';
    const d = new Date(h.at);
    const p = (n) => String(n).padStart(2, '0');
    when.textContent = `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;

    row.append(what, amount, when);
    list.append(row);
  }
}

function render() {
  document.getElementById('token-count').textContent = String(getTokenState().tokens);
  renderDeeds();
  renderLocks();
  renderHistory();
  app.refreshTokens();
}

/* ---------- 수명 주기 ---------- */

export function init(a) {
  app = a;

  document.getElementById('btn-parent-back')
    .addEventListener('click', () => app.go('start'));

  document.getElementById('btn-token-plus').addEventListener('click', () => adjust(1));
  document.getElementById('btn-token-minus').addEventListener('click', () => adjust(-1));

  document.getElementById('btn-change-pin').addEventListener('click', async () => {
    await app.askPin({ forSetup: true });
  });

  document.getElementById('deed-add').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const label = document.getElementById('deed-label').value.trim();
    if (!label) return;

    const emoji = document.getElementById('deed-emoji').value.trim() || '⭐';
    const reward = Math.max(1, Math.min(9, Number(document.getElementById('deed-reward').value) || 1));

    const st = getTokenState();
    saveTokenState({
      deeds: [...st.deeds, { id: 'd' + Date.now().toString(36), label, emoji, reward }],
    });

    ev.target.reset();
    document.getElementById('deed-reward').value = '1';
    sfx.tap();
    render();
  });
}

export function enter() {
  render();
}
