import { getTokenState, saveTokenState, isUnlocked, unlock,
         progressKeys, loadProgress, clearProgress } from '../storage.js';
import { FEATURES } from '../config.js';
import { sfx } from '../sound.js';

let app;
let resumable = new Set();

const costOf = (d) => (FEATURES.tokens ? (d.cost || 0) : 0);
const locked = (d) => costOf(d) > 0 && !isUnlocked(d.id);

function card(drawing) {
  const el = document.createElement('button');
  el.className = 'card';
  const isLocked = locked(drawing);
  if (isLocked) el.classList.add('is-locked');

  const thumb = document.createElement('div');
  thumb.className = 'card-thumb';

  const img = document.createElement('img');
  img.src = drawing.thumbnail || drawing.lineart;
  img.alt = drawing.title;
  thumb.append(img);

  if (isLocked) {
    const veil = document.createElement('div');
    veil.className = 'lock-veil';
    veil.textContent = '🔒';
    const small = document.createElement('small');
    small.textContent = '⭐ ' + costOf(drawing) + '개';
    veil.append(small);
    thumb.append(veil);
  } else if (resumable.has(drawing.id)) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = '이어서';
    thumb.append(badge);
  }

  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = drawing.title;

  el.append(thumb, name);
  el.addEventListener('click', () => open(drawing));
  return el;
}

async function open(drawing) {
  if (locked(drawing)) { await tryUnlock(drawing); return; }

  sfx.select();

  // 칠하다 만 것이 있으면 이어서 칠할지 묻는다
  if (resumable.has(drawing.id)) {
    const saved = await loadProgress(drawing.id);
    if (saved?.blob) {
      const choice = await app.choose(drawing.title + ', 이어서 칠할까요?', [
        { label: '이어서 칠하기', value: 'resume', primary: true },
        { label: '새로 칠하기', value: 'fresh' },
      ]);
      if (choice === 'resume') {
        app.go('paint', { drawing, restore: saved.blob });
        return;
      }
      await clearProgress(drawing.id);
    }
  }
  app.go('paint', { drawing });
}

// 토큰으로 도안 열기. 모자라면 혼내지 않고 할 수 있는 것을 알려준다.
async function tryUnlock(drawing) {
  const cost = costOf(drawing);
  const { tokens } = getTokenState();

  if (tokens < cost) {
    sfx.nope();
    app.toast('착한 일을 하면 별을 받을 수 있어요!', 3000);
    return;
  }

  const yes = await app.confirm('⭐ ' + cost + '개로 열까요?');
  if (!yes) return;

  saveTokenState({ tokens: tokens - cost });
  unlock(drawing.id);
  sfx.unlock();
  app.toast(drawing.title + '을(를) 열었어요!');
  app.refreshTokens();
  await refresh();
}

async function refresh() {
  resumable = await progressKeys();
  const grid = document.getElementById('drawing-grid');
  grid.replaceChildren(...app.drawings.map(card));
}

export function init(a) {
  app = a;
  document.getElementById('btn-select-back')
    .addEventListener('click', () => app.go('start'));
}

export function enter() {
  app.refreshTokens();
  refresh();
}
