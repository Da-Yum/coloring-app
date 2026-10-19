// 내 작품 모아보기. 완성작은 IndexedDB에 남아 있다.

import { listGallery, removeFromGallery, downloadBlob, stampName } from '../storage.js';
import { sfx } from '../sound.js';

let app;
let urls = [];   // 화면을 떠날 때 전부 풀어 준다

function card(item) {
  const el = document.createElement('div');
  el.className = 'card';

  const thumb = document.createElement('div');
  thumb.className = 'card-thumb';

  const url = URL.createObjectURL(item.blob);
  urls.push(url);

  const img = document.createElement('img');
  img.src = url;
  img.alt = item.title;
  thumb.append(img);

  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = item.title;

  const actions = document.createElement('div');
  actions.className = 'gallery-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'ghost-btn tight';
  saveBtn.textContent = '내려받기';
  saveBtn.addEventListener('click', () => {
    downloadBlob(item.blob, stampName(item.drawingId));
    sfx.tap();
    app.toast('갤러리에 저장했어요!');
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'ghost-btn tight';
  delBtn.textContent = '지우기';
  delBtn.addEventListener('click', async () => {
    if (!(await app.confirm('이 그림을 지울까요?'))) return;
    await removeFromGallery(item.id);
    sfx.tap();
    refresh();
  });

  actions.append(saveBtn, delBtn);
  el.append(thumb, name, actions);
  return el;
}

function revoke() {
  for (const url of urls) URL.revokeObjectURL(url);
  urls = [];
}

async function refresh() {
  revoke();
  const items = await listGallery();
  const grid = document.getElementById('gallery-grid');
  grid.replaceChildren(...items.map(card));
  document.getElementById('gallery-empty').hidden = items.length > 0;
}

export function init(a) {
  app = a;
  document.getElementById('btn-gallery-back')
    .addEventListener('click', () => app.go('start'));
}

export function enter() {
  refresh();
}

export function leave() {
  revoke();
}
