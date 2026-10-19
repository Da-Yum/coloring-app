// 영역 맵과 마스크.
//
// 마스크는 영역 전체 크기가 아니라 그 영역의 바운딩 박스 크기로만 만든다.
// 2048²짜리 마스크를 영역마다 캐시하면 금방 수백 MB가 된다.
//
// 바깥을 자를 때는 destination-in을 쓴다. 마스크가 덮지 않는 자리는
// 소스 알파가 0이라 저절로 지워진다.

import { CANVAS_SIZE as S, REGION } from '../config.js';

const cache = new Map();   // drawingId → { labels, regions, byId, masks }

function workerUrl() {
  return new URL('../workers/region-worker.js', import.meta.url);
}

// 도안 하나의 영역 맵을 만든다. 이미 있으면 그대로 돌려준다.
export function buildRegionMap(drawingId, imageData) {
  const hit = cache.get(drawingId);
  if (hit) {
    cache.delete(drawingId);     // LRU: 쓴 것을 뒤로 보낸다
    cache.set(drawingId, hit);
    return Promise.resolve(hit);
  }

  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(workerUrl());
    } catch (err) {
      reject(err);
      return;
    }

    worker.onmessage = (ev) => {
      const { labels, regions } = ev.data;
      const byId = new Map();
      for (const r of regions) byId.set(r.id, r);

      const entry = { labels, regions, byId, masks: new Map() };
      cache.set(drawingId, entry);
      while (cache.size > REGION.cacheSize) {
        cache.delete(cache.keys().next().value);
      }
      worker.terminate();
      resolve(entry);
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    // pixels는 복사하지 않고 넘긴다 (16MB짜리다)
    const buf = imageData.data.buffer;
    worker.postMessage({
      width: imageData.width,
      height: imageData.height,
      pixels: imageData.data,
      threshold: REGION.threshold,
      minArea: REGION.minArea,
    }, [buf]);
  });
}

// 누른 자리의 영역 번호. 선 위면 가까운 영역을 찾아준다.
export function regionAt(map, x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= S || py >= S) return 0;

  const direct = map.labels[py * S + px];
  if (direct !== 0) return direct;

  // 선 위에서 시작했다. 반경 안에서 가장 가까운 영역을 쓴다.
  const R = REGION.snapRadius;
  let best = 0;
  let bestDist = Infinity;
  for (let dy = -R; dy <= R; dy++) {
    const yy = py + dy;
    if (yy < 0 || yy >= S) continue;
    for (let dx = -R; dx <= R; dx++) {
      const xx = px + dx;
      if (xx < 0 || xx >= S) continue;
      const id = map.labels[yy * S + xx];
      if (id === 0) continue;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) { bestDist = dist; best = id; }
    }
  }
  return best;
}

// 마스크 한 장. 영역 안쪽만 불투명하다.
// 선 경계에 흰 틈이 남지 않게 몇 픽셀 넓혀 둔다.
export function maskFor(map, id) {
  const hit = map.masks.get(id);
  if (hit) return hit;

  const region = map.byId.get(id);
  if (!region) return null;

  const pad = REGION.dilate;
  const x = Math.max(0, region.x - pad);
  const y = Math.max(0, region.y - pad);
  const w = Math.min(S, region.x + region.w + pad) - x;
  const h = Math.min(S, region.y + region.h + pad) - y;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const img = ctx.createImageData(w, h);
  const d = img.data;
  const labels = map.labels;
  for (let j = 0; j < h; j++) {
    const row = (y + j) * S + x;
    const out = j * w * 4;
    for (let i = 0; i < w; i++) {
      if (labels[row + i] === id) {
        const o = out + i * 4;
        d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  dilate(ctx, canvas, pad);

  const mask = { canvas, x, y, w, h };
  map.masks.set(id, mask);

  // 마스크를 무한정 쌓아두지 않는다
  if (map.masks.size > 24) map.masks.delete(map.masks.keys().next().value);
  return mask;
}

// 4방향으로 1px씩 r번 넓힌다. 반경 r짜리를 한 번에 하는 것보다 그리는 횟수가 적다.
function dilate(ctx, canvas, r) {
  if (r <= 0) return;
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width;
  tmp.height = canvas.height;
  const tctx = tmp.getContext('2d');

  for (let step = 0; step < r; step++) {
    tctx.clearRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(canvas, 0, 0);
    ctx.drawImage(tmp, -1, 0);
    ctx.drawImage(tmp, 1, 0);
    ctx.drawImage(tmp, 0, -1);
    ctx.drawImage(tmp, 0, 1);
  }
}

// box 안에서 마스크 바깥을 지운다. clip을 걸어 그 범위에만 먹인다.
export function clipToMask(ctx, mask, box) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask.canvas, mask.x, mask.y);
  ctx.restore();
}

export function maskBox(mask) {
  return { x: mask.x, y: mask.y, w: mask.w, h: mask.h };
}
