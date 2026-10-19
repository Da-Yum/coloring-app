import {
  TOOLS, BRUSH_SIZES, DEFAULT_TOOL, DEFAULT_SIZE,
  CANVAS_SIZE, CLEAR_HOLD_MS, FILL_ANIM_MS, AUTOSAVE_IDLE_MS, RECENT_COLORS,
  FEATURES,
} from '../config.js';
import { Layers } from '../canvas/layers.js';
import { StrokeRenderer, applyGrain, intersect } from '../canvas/brushes.js';
import { History } from '../canvas/history.js';
import { buildRegionMap, regionAt, maskFor, clipToMask, maskBox } from '../canvas/region.js';
import { attachPointer, attachHold } from '../input.js';
import {
  getOption, isUnlocked, unlock, getTokenState, saveTokenState,
  saveProgress, clearProgress,
} from '../storage.js';
import { sfx, wakeAudio } from '../sound.js';
import { mountPicker } from '../colorpicker.js';
import { setIcon } from '../icons.js';

let app;
let layers, history, renderer;
let drawing = null;
let regionMap = null;
let tool = TOOLS.find((t) => t.id === DEFAULT_TOOL);
let sizeId = DEFAULT_SIZE;
let color = '#000000';
let recent = [];

// 지금 그리고 있는 획의 상태
let activeMask = null;      // 선 밖으로 안 나가게 할 때 쓰는 마스크
let erasing = false;

const pending = [];
let raf = null;
let autosaveTimer = null;

const sizePx = () => BRUSH_SIZES.find((s) => s.id === sizeId).px;
const clipOn = () => getOption('clip') && regionMap;

/* ---------- 좌측: 도구 ---------- */

function visibleTools() {
  // 토큰 기능을 껐으면 값이 매겨진 특별 도구는 아예 없는 셈이다
  if (!FEATURES.tokens) return TOOLS.filter((t) => t.ready && !t.cost);
  return TOOLS.filter((t) => t.ready);
}

const toolLocked = (t) => FEATURES.tokens && Boolean(t.cost) && !isUnlocked(t.id);

// 잠긴 특별 도구를 별로 연다. 모자라면 혼내지 않고 할 수 있는 것을 알려준다.
async function tryUnlockTool(t) {
  const { tokens } = getTokenState();
  if (tokens < t.cost) {
    sfx.nope();
    app.toast('착한 일을 하면 별을 받을 수 있어요!', 3000);
    return;
  }
  if (!(await app.confirm('⭐ ' + t.cost + '개로 ' + t.label + ' 펜을 열까요?'))) return;

  saveTokenState({ tokens: tokens - t.cost });
  unlock(t.id);
  sfx.unlock();
  app.toast(t.label + ' 펜을 열었어요!');
  app.refreshTokens();
  tool = t;
  renderTools();
}

function renderTools() {
  const list = document.getElementById('tool-list');
  list.replaceChildren();

  for (const t of visibleTools()) {
    const isLocked = toolLocked(t);
    const btn = document.createElement('button');
    btn.className = 'tool' + (isLocked ? ' is-locked' : '');
    btn.dataset.tool = t.id;

    const ico = document.createElement('span');
    ico.className = 'ico';
    setIcon(ico, isLocked ? 'lock' : t.id, t.label);

    const label = document.createElement('span');
    label.textContent = t.label;
    btn.append(ico, label);

    if (isLocked) {
      const cost = document.createElement('span');
      cost.className = 'tool-cost';
      cost.textContent = '⭐' + t.cost;
      btn.append(cost);
    }

    btn.addEventListener('click', () => {
      if (isLocked) { tryUnlockTool(t); return; }
      tool = t;
      sfx.select();
      paintToolState();
    });
    list.append(btn);
  }

  if (toolLocked(tool) || !visibleTools().includes(tool)) {
    tool = TOOLS.find((x) => x.id === DEFAULT_TOOL);
  }
  paintToolState();
}

function paintToolState() {
  for (const el of document.getElementById('tool-list').children) {
    el.classList.toggle('is-on', el.dataset.tool === tool.id && !el.classList.contains('is-locked'));
  }
  // 페인트는 굵기가 의미 없다
  document.getElementById('size-list').style.visibility =
    tool.kind === 'fill' ? 'hidden' : 'visible';
}

/* ---------- 우측: 색과 굵기 ---------- */

function setColor(hex) {
  color = hex;
  recent = [hex, ...recent.filter((c) => c !== hex)].slice(0, RECENT_COLORS);
  paintSwatchState();
  renderRecent();
}

function renderPalette() {
  const el = document.getElementById('palette');
  el.replaceChildren();

  for (const hex of drawing.palette) {
    const btn = document.createElement('button');
    btn.className = 'swatch';
    btn.style.background = hex;
    btn.dataset.color = hex;
    btn.setAttribute('aria-label', hex);
    btn.addEventListener('click', () => { sfx.tap(); setColor(hex); });
    el.append(btn);
  }
  setColor(drawing.palette[0]);
}

function paintSwatchState() {
  for (const el of document.getElementById('palette').children) {
    el.classList.toggle('is-on', el.dataset.color === color);
  }
}

function renderRecent() {
  const el = document.getElementById('recent-colors');
  if (!el) return;
  el.replaceChildren();
  for (const hex of recent) {
    const btn = document.createElement('button');
    btn.className = 'recent-swatch';
    btn.style.background = hex;
    btn.addEventListener('click', () => { sfx.tap(); setColor(hex); });
    el.append(btn);
  }
}

function renderSizes() {
  const el = document.getElementById('size-list');
  el.replaceChildren();

  for (const s of BRUSH_SIZES) {
    const btn = document.createElement('button');
    btn.className = 'size';
    btn.dataset.size = s.id;
    btn.setAttribute('aria-label', s.label);

    const dot = document.createElement('span');
    dot.className = 'dot';
    const d = 8 + (s.px / 56) * 20;          // 굵기를 점 크기로 보여준다
    dot.style.width = dot.style.height = d.toFixed(0) + 'px';

    btn.append(dot);
    btn.addEventListener('click', () => { sizeId = s.id; sfx.tap(); paintSizeState(); });
    el.append(btn);
  }
  paintSizeState();
}

function paintSizeState() {
  for (const el of document.getElementById('size-list').children) {
    el.classList.toggle('is-on', el.dataset.size === sizeId);
  }
}

function syncAdvanced() {
  document.getElementById('advanced-colors').hidden = !getOption('advanced');
}

/* ---------- 그리기 ---------- */

function flush() {
  raf = null;
  if (!renderer.active) { pending.length = 0; return; }

  for (const pt of pending) renderer.extend(pt);
  pending.length = 0;

  // 이번 프레임에 새로 그린 자리만 손본다
  const box = renderer.takeFrameBox();
  if (!box) return;
  if (tool.grain) applyGrain(renderer.ctx, tool.grain, box);
  if (activeMask) clipToMask(renderer.ctx, activeMask, box);
}

function queue(points) {
  pending.push(...points);
  if (raf === null) raf = requestAnimationFrame(flush);
}

function strokeStart(pt) {
  wakeAudio();

  if (tool.kind === 'fill') { fillAt(pt); return; }

  erasing = tool.kind === 'erase';
  activeMask = null;

  // 선 밖으로 안 나가게: 누른 자리의 영역을 잡아둔다.
  // 지우개는 묶지 않는다 — 잘못 칠한 것을 지우려는데 영역에 갇히면 답답하다.
  if (clipOn() && !erasing) {
    const id = regionAt(regionMap, pt.x, pt.y);
    if (id) activeMask = maskFor(regionMap, id);
  }

  if (erasing) {
    // 칠 레이어를 직접 깎는다. 되돌리려면 깎기 전 상태가 필요하다.
    layers.backupPaint();
    layers.paintCtx.save();
    layers.paintCtx.globalCompositeOperation = 'destination-out';
    renderer.begin(layers.paintCtx, tool, '#000', sizePx(), pt);
    renderer.takeFrameBox();
    return;
  }

  layers.clearStroke();
  layers.setStrokeOpacity(tool.opacity);
  renderer.begin(layers.strokeCtx, tool, color, sizePx(), pt);

  const box = renderer.takeFrameBox();
  if (box) {
    if (tool.grain) applyGrain(layers.strokeCtx, tool.grain, box);
    if (activeMask) clipToMask(layers.strokeCtx, activeMask, box);
  }
}

function strokeEnd() {
  if (raf !== null) { cancelAnimationFrame(raf); flush(); }

  let box = renderer.end();

  if (erasing) {
    layers.paintCtx.restore();
    erasing = false;
    if (!box) return;
    const before = layers.backupSlice(box);
    const after = layers.paintCtx.getImageData(box.x, box.y, box.w, box.h);
    history.push(box, before, after);
    scheduleAutosave();
    return;
  }

  // 마스크 밖은 어차피 지워졌으니 기록할 범위도 줄인다
  if (activeMask) box = intersect(box, maskBox(activeMask));
  activeMask = null;
  if (!box) { layers.clearStroke(); return; }

  const ctx = layers.paintCtx;
  const before = ctx.getImageData(box.x, box.y, box.w, box.h);
  layers.commitStroke(box, tool.opacity);
  const after = ctx.getImageData(box.x, box.y, box.w, box.h);

  history.push(box, before, after);
  layers.clearStroke(box);
  scheduleAutosave();
}

// 손바닥이 닿는 등으로 획이 취소됐다. 없던 일로 되돌린다.
function strokeCancel() {
  if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
  pending.length = 0;
  const box = renderer.end();

  if (erasing) {
    layers.paintCtx.restore();
    erasing = false;
    if (box) layers.restoreFromBackup(box);
  } else {
    layers.clearStroke(box);
  }
  activeMask = null;
}

/* ---------- 페인트(채우기) ---------- */
// 옵션과 무관하게 항상 영역 기준이다.

function fillAt(pt) {
  if (!regionMap) { app.toast('잠깐만요, 도안을 보는 중이에요'); return; }

  const id = regionAt(regionMap, pt.x, pt.y);
  if (!id) { sfx.nope(); return; }

  const mask = maskFor(regionMap, id);
  if (!mask) { sfx.nope(); return; }

  const box = maskBox(mask);
  const before = layers.paintCtx.getImageData(box.x, box.y, box.w, box.h);

  sfx.fill();
  animateFill(mask, pt, () => {
    const after = layers.paintCtx.getImageData(box.x, box.y, box.w, box.h);
    history.push(box, before, after);
    scheduleAutosave();
  });
}

// 누른 자리에서 원이 퍼져 영역을 덮는다. 임시 레이어에서 보여주고 끝나면 합친다.
//
// 애니메이션은 rAF로 그리지만 마무리는 타이머로도 받쳐 둔다.
// 화면이 가려지면 rAF가 멈추는데, 그 때문에 칠한 것이 사라지면 안 된다.
function animateFill(mask, pt, done) {
  const box = maskBox(mask);
  const ctx = layers.strokeCtx;
  const reach = Math.hypot(
    Math.max(pt.x - box.x, box.x + box.w - pt.x),
    Math.max(pt.y - box.y, box.y + box.h - pt.y),
  );

  layers.clearStroke();
  layers.setStrokeOpacity(1);

  // radius를 주지 않으면 영역 전체를 덮는다 (마무리용)
  const paintTo = (radius) => {
    ctx.clearRect(box.x, box.y, box.w, box.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.fillStyle = color;
    if (radius === undefined) {
      ctx.fillRect(box.x, box.y, box.w, box.h);
    } else {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask.canvas, mask.x, mask.y);
    ctx.restore();
  };

  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    clearTimeout(backstop);
    paintTo();                       // 중간에 끊겨도 결과는 늘 같다
    layers.commitStroke(box, 1);
    layers.clearStroke(box);
    done();
  };

  const backstop = setTimeout(settle, FILL_ANIM_MS + 120);
  const start = performance.now();

  const step = (now) => {
    if (settled) return;
    // 같은 프레임의 RAF 시각이 클릭 처리 시각보다 앞설 수 있다.
    const t = Math.max(0, (now - start) / FILL_ANIM_MS);
    if (t >= 1) { settle(); return; }
    paintTo(reach * t);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- 다 지우기 ---------- */

function clearAll() {
  const box = { x: 0, y: 0, w: CANVAS_SIZE, h: CANVAS_SIZE };
  const before = layers.paintCtx.getImageData(box.x, box.y, box.w, box.h);
  layers.clearPaint();
  history.push(box, before, null);   // after = null → 투명하게
  sfx.clear();
  app.toast('다 지웠어요');
  scheduleAutosave();
}

/* ---------- 자동 저장 ---------- */

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    if (!drawing) return;
    const blob = await layers.paintBlob();
    if (blob) await saveProgress(drawing.id, blob);
  }, AUTOSAVE_IDLE_MS);
}

function stopAutosave() {
  clearTimeout(autosaveTimer);
}

/* ---------- 되돌리기 버튼 상태 ---------- */

function paintHistoryState(h) {
  document.getElementById('btn-undo').disabled = !h.canUndo();
  document.getElementById('btn-redo').disabled = !h.canRedo();
}

function fit() {
  if (layers) layers.fit(document.getElementById('canvas-area'));
}

/* ---------- 수명 주기 ---------- */

export function init(a) {
  app = a;

  layers = new Layers({
    bg: document.getElementById('layer-bg'),
    paint: document.getElementById('layer-paint'),
    stroke: document.getElementById('layer-stroke'),
    line: document.getElementById('layer-line'),
    wrap: document.getElementById('canvas-wrap'),
  });

  history = new History(layers.paintCtx);
  history.onChange = paintHistoryState;
  renderer = new StrokeRenderer();

  attachPointer(document.getElementById('canvas-wrap'), {
    map: (x, y) => layers.toCanvas(x, y),
    onStart: strokeStart,
    onMove: queue,
    onEnd: strokeEnd,
    onCancel: strokeCancel,
  });

  renderSizes();
  for (const [id, name, label] of [
    ['btn-undo', 'undo', '되돌리기'],
    ['btn-redo', 'redo', '다시하기'],
  ]) setIcon(document.getElementById(id), name, label);
  setIcon(document.querySelector('#btn-clear .hold-face'), 'trash', '다 지우기');

  mountPicker(document.getElementById('picker-mount'), (hex) => setColor(hex));

  document.getElementById('btn-undo').addEventListener('click', () => {
    if (history.undo()) { sfx.undo(); scheduleAutosave(); }
  });
  document.getElementById('btn-redo').addEventListener('click', () => {
    if (history.redo()) { sfx.undo(); scheduleAutosave(); }
  });
  attachHold(document.getElementById('btn-clear'), CLEAR_HOLD_MS, clearAll);

  document.getElementById('btn-paint-back').addEventListener('click', async () => {
    if (await app.confirm('그만할까요?')) app.go('select');
  });

  document.getElementById('btn-done').addEventListener('click', () => {
    stopAutosave();
    sfx.done();
    app.go('done', { drawing, canvas: layers.flatten() });
  });

  window.addEventListener('resize', fit);
  new ResizeObserver(fit).observe(document.getElementById('canvas-area'));
}

export async function enter(payload) {
  syncAdvanced();
  renderTools();

  if (payload?.resume) { fit(); return; }

  drawing = payload.drawing;
  layers.clearPaint();
  layers.clearStroke();
  history.reset();
  regionMap = null;
  renderPalette();
  fit();

  try {
    await layers.loadLineart(drawing.lineart);
  } catch (err) {
    console.error(err);
    app.toast('도안 그림을 불러오지 못했어요', 4000);
    return;
  }
  fit();

  // 이어서 칠하기
  if (payload?.restore) {
    try { await layers.restorePaint(payload.restore); }
    catch (err) { console.warn('이어 칠하기를 불러오지 못했습니다', err); }
  }

  // 영역 맵은 시간이 걸린다. 그 사이에도 자유롭게 칠할 수 있게 둔다.
  const busy = document.getElementById('region-busy');
  busy.hidden = false;
  try {
    regionMap = await buildRegionMap(drawing.id, layers.lineartPixels());
  } catch (err) {
    console.error('영역 맵을 만들지 못했습니다', err);
    app.toast('선 안쪽만 칠하기는 이 도안에서 쓸 수 없어요', 4000);
  } finally {
    busy.hidden = true;
  }
}

// 화면을 떠날 때 지금까지 칠한 것을 남긴다
export function leave() {
  stopAutosave();
  if (drawing) layers.paintBlob().then((blob) => blob && saveProgress(drawing.id, blob));
}
