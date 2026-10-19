// 아이콘.
//
// 도구 아이콘은 그림 파일이다 (크림색 타일을 포함한 한 장). 버튼 배경을
// 따로 깔지 않고 이 타일을 그대로 버튼 얼굴로 쓴다.
//
// 아직 그림이 없는 것은 SVG로 그리되, 그림 아이콘과 나란히 놓여도 튀지 않게
// 같은 모양의 타일을 CSS로 입힌다 (.ico--drawn).

const IMAGE_ICONS = {
  brush:  'assets/icons/tools/brush.png',
  pen:    'assets/icons/tools/pen.png',
  pencil: 'assets/icons/tools/pencil.png',
  crayon: 'assets/icons/tools/crayon.png',
  fill:   'assets/icons/tools/fill.png',
  eraser: 'assets/icons/tools/eraser.png',
  undo:   'assets/icons/tools/undo.png',
  redo:   'assets/icons/tools/redo.png',
  trash:  'assets/icons/tools/trash.png',
  gear:   'assets/icons/tools/gear.png',
  lock:   'assets/icons/tools/lock.png',
  star:   'assets/icons/tools/star.png',
};

const SVG = (body) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';

// 그림 아이콘이 아직 없는 것들
const DRAWN_ICONS = {
  // 반짝이 — 큰 별 하나와 작은 별 둘
  glitter: SVG(
    '<path d="M11 3.5l1.7 4 4 1.7-4 1.7-1.7 4-1.7-4-4-1.7 4-1.7z" fill="currentColor" fill-opacity=".25"/>' +
    '<path d="M17.8 14.2l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" fill="currentColor" fill-opacity=".25"/>' +
    '<path d="M5.6 16.4l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z"/>',
  ),
  // 무지개 — 세 겹 호
  rainbow: SVG(
    '<path d="M3.5 18a8.5 8.5 0 0 1 17 0"/>' +
    '<path d="M6.8 18a5.2 5.2 0 0 1 10.4 0"/>' +
    '<path d="M10.1 18a1.9 1.9 0 0 1 3.8 0"/>',
  ),
};

export function setIcon(el, name, label = '') {
  el.replaceChildren();
  el.classList.remove('ico--drawn');

  const src = IMAGE_ICONS[name];
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = label;
    img.decoding = 'async';
    el.append(img);
    return;
  }

  el.classList.add('ico--drawn');
  el.insertAdjacentHTML('afterbegin', DRAWN_ICONS[name] || DRAWN_ICONS.glitter);
}

export function iconUrl(name) {
  return IMAGE_ICONS[name] || null;
}
