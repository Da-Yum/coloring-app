// 스탬핑 방식 브러시. 경로를 일정 간격으로 보간하며 팁을 찍는다.
// 팁은 오프스크린 캔버스로 만들어 캐시한다 (색·굵기가 바뀌면 새로 만든다).

import { CANVAS_SIZE as S, STAMP_SPACING_RATIO } from '../config.js';

/* ---------- 팁 ---------- */

const tipCache = new Map();
const TIP_CACHE_MAX = 96;

function hardTip(g, d, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(d / 2, d / 2, r, 0, Math.PI * 2);
  g.fill();
}

// 붓: 가장자리가 흐린 원. 겹치면 진해진다.
//
// 그라데이션을 'transparent'로 끝내면 안 된다. 그건 "투명한 검정"이라
// 캔버스가 RGB까지 검정으로 보간해 가장자리가 거뭇하게 물든다.
// 색은 단색으로 깔고, 알파만 따로 깎아낸다.
function softTip(g, d, r, color) {
  g.fillStyle = color;
  g.fillRect(0, 0, d, d);

  const grad = g.createRadialGradient(d / 2, d / 2, r * 0.1, d / 2, d / 2, r);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.55, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');

  // destination-in은 소스의 알파만 본다. RGB가 무엇이든 상관없다.
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = grad;
  g.fillRect(0, 0, d, d);
  g.globalCompositeOperation = 'source-over';
}

// 크레파스: 큰 불규칙 팁. 가장자리가 들쭉날쭉하고 안에 틈이 있다.
function roughTip(g, d, r, color) {
  g.fillStyle = color;
  g.beginPath();
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.78 + Math.random() * 0.22);
    const x = d / 2 + Math.cos(a) * rr;
    const y = d / 2 + Math.sin(a) * rr;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
  g.fill();

  // 왁스가 안 묻은 자리
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < r * 0.8; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * r;
    g.beginPath();
    g.arc(d / 2 + Math.cos(a) * rr, d / 2 + Math.sin(a) * rr, Math.random() * r * 0.16, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}

function makeTip(tool, color, size) {
  const r = Math.max(0.5, size / 2);
  const d = Math.ceil(r * 2) + 2;
  const c = document.createElement('canvas');
  c.width = c.height = d;
  const g = c.getContext('2d');

  if (tool.tip === 'soft') softTip(g, d, r, color);
  else if (tool.tip === 'rough') roughTip(g, d, r, color);
  else hardTip(g, d, r, color);

  return c;
}

function getTip(tool, color, size) {
  // 크레파스 팁은 무작위라 캐시하면 같은 모양만 반복된다. 매번 새로 만든다.
  if (tool.tip === 'rough') return makeTip(tool, color, size);

  const key = tool.id + '|' + color + '|' + size.toFixed(1);
  let tip = tipCache.get(key);
  if (tip) return tip;
  tip = makeTip(tool, color, size);
  tipCache.set(key, tip);
  if (tipCache.size > TIP_CACHE_MAX) tipCache.delete(tipCache.keys().next().value);
  return tip;
}

export function clearTipCache() {
  tipCache.clear();
}

/* ---------- 종이 결 ---------- */
// 캔버스 좌표에 고정되어야 한다. 스트로크마다 랜덤이면 종이처럼 안 보인다.
// 패턴은 캔버스 원점 기준이라 같은 자리에 늘 같은 결이 남는다.

const grainCache = new Map();

function grainTile(kind) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;

  // keep = 그 픽셀이 살아남을 확률, soft = 살아남은 픽셀의 최소 알파
  const keep = kind === 'pencil' ? 0.62 : 0.74;
  const soft = kind === 'pencil' ? 90 : 150;

  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = Math.random() < keep ? soft + ((Math.random() * (255 - soft)) | 0) : 0;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function grainPattern(ctx, kind) {
  let pat = grainCache.get(kind);
  if (!pat) {
    pat = ctx.createPattern(grainTile(kind), 'repeat');
    grainCache.set(kind, pat);
  }
  return pat;
}

// 지금까지 그린 것에서 결 바깥을 깎아낸다. 같은 결을 다시 먹여도 결과는 같다.
export function applyGrain(ctx, kind, box) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = grainPattern(ctx, kind);
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.restore();
}

/* ---------- 스트로크 ---------- */

const RAINBOW_CYCLE = 900;   // 이 거리마다 색이 한 바퀴 돈다

export class StrokeRenderer {
  constructor() {
    this.active = false;
  }

  begin(ctx, tool, color, sizePx, pt) {
    this.ctx = ctx;
    this.tool = tool;
    this.color = color;
    this.baseSize = sizePx * (tool.sizeScale ?? 1);
    this.box = null;        // 획 전체가 차지한 범위
    this.frameBox = null;   // 지난 프레임 이후에 새로 그린 범위
    this.carry = 0;
    this.travel = 0;        // 무지개 펜이 쓰는 누적 거리
    this.last = pt;
    this.active = true;
    this.stamp(pt);
  }

  sizeFor(pressure) {
    const p = this.tool.press;
    if (!p || p.target !== 'size') return this.baseSize;
    return this.baseSize * (p.min + (p.max - p.min) * pressure);
  }

  alphaFor(pressure) {
    const p = this.tool.press;
    if (!p || p.target !== 'alpha') return 1;
    return p.min + (p.max - p.min) * pressure;
  }

  colorAt() {
    if (!this.tool.rainbow) return this.color;
    const hue = ((this.travel / RAINBOW_CYCLE) * 360) % 360;
    return 'hsl(' + hue.toFixed(0) + ', 85%, 58%)';
  }

  stamp(pt) {
    const size = this.sizeFor(pt.pressure);
    const tip = getTip(this.tool, this.colorAt(), size);
    const r = tip.width / 2;
    const alpha = this.alphaFor(pt.pressure);

    if (alpha < 1) {
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(tip, pt.x - r, pt.y - r);
      this.ctx.restore();
    } else {
      this.ctx.drawImage(tip, pt.x - r, pt.y - r);
    }
    this.grow(pt.x - r, pt.y - r, tip.width, tip.height);

    if (this.tool.sparkle) this.dropSparkle(pt, size);
  }

  // 반짝이 펜: 획 위에 작은 별이 남는다
  dropSparkle(pt, size) {
    if (Math.random() > 0.35) return;
    const ctx = this.ctx;
    const r = size * (0.25 + Math.random() * 0.35);
    const x = pt.x + (Math.random() - 0.5) * size;
    const y = pt.y + (Math.random() - 0.5) * size;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillStyle = Math.random() < 0.5 ? '#FFFFFF' : '#FFF4B8';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = i % 2 ? r * 0.32 : r;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    this.grow(x - r, y - r, r * 2, r * 2);
  }

  // 직전 점에서 이 점까지 일정 간격으로 찍는다.
  // 남은 거리(carry)를 이어 받아 선분 경계에서 간격이 뭉치지 않게 한다.
  extend(pt) {
    if (!this.active) return;
    const a = this.last;
    const dx = pt.x - a.x;
    const dy = pt.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;

    const spacing = Math.max(1, this.sizeFor(pt.pressure) * STAMP_SPACING_RATIO);
    let travelled = this.carry;
    while (travelled + spacing <= dist) {
      travelled += spacing;
      const t = travelled / dist;
      this.travel += spacing;
      this.stamp({
        x: a.x + dx * t,
        y: a.y + dy * t,
        pressure: a.pressure + (pt.pressure - a.pressure) * t,
      });
    }
    this.carry = travelled - dist;
    this.last = pt;
  }

  grow(x, y, w, h) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(S, Math.ceil(x + w));
    const y1 = Math.min(S, Math.ceil(y + h));
    if (x1 <= x0 || y1 <= y0) return;
    this.box = union(this.box, x0, y0, x1, y1);
    this.frameBox = union(this.frameBox, x0, y0, x1, y1);
  }

  // 지난 프레임 이후 새로 그린 범위를 꺼내고 비운다.
  takeFrameBox() {
    const b = this.frameBox;
    this.frameBox = null;
    return b;
  }

  // 그려진 영역의 바운딩 박스를 돌려준다. 아무것도 안 그렸으면 null.
  end() {
    this.active = false;
    return this.box;
  }
}

function union(box, x0, y0, x1, y1) {
  if (!box) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const nx = Math.min(box.x, x0);
  const ny = Math.min(box.y, y0);
  box.w = Math.max(box.x + box.w, x1) - nx;
  box.h = Math.max(box.y + box.h, y1) - ny;
  box.x = nx;
  box.y = ny;
  return box;
}

export function intersect(a, b) {
  if (!a || !b) return null;
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}
