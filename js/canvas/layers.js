// 레이어 4장.
//   배경(종이) → 칠 레이어 → 그리는 중인 획 → 선화(multiply)
//
// 그리는 중인 획을 따로 보이는 레이어에 두는 이유:
//  - 손을 떼기 전에도 보여야 한다
//  - 한 획 안에서 겹친 부분이 진해지지 않는다 (불투명도는 합칠 때 한 번만 먹인다)
//  - 4단계의 영역 마스크를 이 레이어에만 걸면 된다

import { CANVAS_SIZE as S } from '../config.js';

function sized(canvas) {
  canvas.width = S;
  canvas.height = S;
  return canvas;
}

function offscreen() {
  return sized(document.createElement('canvas'));
}

// 종이 결: 2048²를 직접 만들면 느리다. 작은 타일을 반복한다.
function paperTile(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 250 + ((Math.random() * 6) | 0);
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export class Layers {
  constructor({ bg, paint, stroke, line, wrap }) {
    this.wrap = wrap;
    this.bg = sized(bg);
    this.paint = sized(paint);
    this.stroke = sized(stroke);
    this.line = sized(line);

    this.bgCtx = this.bg.getContext('2d');
    this.paintCtx = this.paint.getContext('2d', { willReadFrequently: true });
    this.strokeCtx = this.stroke.getContext('2d');
    this.lineCtx = this.line.getContext('2d');

    this.backup = null;   // 지우개용. 필요할 때만 만든다
    this.drawPaper();
  }

  drawPaper() {
    const ctx = this.bgCtx;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = ctx.createPattern(paperTile(), 'repeat');
    ctx.fillRect(0, 0, S, S);
  }

  async loadLineart(src) {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('도안을 불러오지 못했습니다: ' + src));
      im.src = src;
    });
    this.lineCtx.clearRect(0, 0, S, S);
    this.lineCtx.drawImage(img, 0, 0, S, S);
    this.lineImage = img;
    return img;
  }

  // 선화를 픽셀로 읽는다. 영역 맵 계산에 쓴다.
  lineartPixels() {
    return this.lineCtx.getImageData(0, 0, S, S);
  }

  clearPaint() {
    this.paintCtx.clearRect(0, 0, S, S);
  }

  clearStroke(box) {
    const b = box || { x: 0, y: 0, w: S, h: S };
    this.strokeCtx.clearRect(b.x, b.y, b.w, b.h);
  }

  // 그리는 중인 획의 불투명도는 CSS로 보여준다.
  // 합칠 때 globalAlpha로 같은 값을 먹이므로 화면과 결과가 일치한다.
  setStrokeOpacity(v) {
    this.stroke.style.opacity = String(v);
  }

  // 임시 레이어의 내용을 칠 레이어에 얹는다.
  commitStroke(box, opacity) {
    const ctx = this.paintCtx;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(this.stroke, box.x, box.y, box.w, box.h, box.x, box.y, box.w, box.h);
    ctx.restore();
  }

  // 지우개는 칠 레이어를 직접 깎는다. 되돌리려면 깎기 전 상태가 있어야 하는데
  // getImageData로 2048² 전체를 뜨면 느리다. 캔버스끼리 복사는 빠르다.
  backupPaint() {
    if (!this.backup) {
      this.backup = offscreen();
      this.backupCtx = this.backup.getContext('2d', { willReadFrequently: true });
    }
    this.backupCtx.clearRect(0, 0, S, S);
    this.backupCtx.drawImage(this.paint, 0, 0);
  }

  // 백업에서 한 조각만 꺼낸다 (되돌리기용 before).
  backupSlice(box) {
    return this.backupCtx.getImageData(box.x, box.y, box.w, box.h);
  }

  // 지우개 획을 취소할 때 백업에서 되돌린다.
  restoreFromBackup(box) {
    const b = box || { x: 0, y: 0, w: S, h: S };
    this.paintCtx.clearRect(b.x, b.y, b.w, b.h);
    this.paintCtx.drawImage(this.backup, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
  }

  // 화면 좌표 → 캔버스 내부 좌표(2048 기준)
  toCanvas(clientX, clientY) {
    const r = this.paint.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * S,
      y: ((clientY - r.top) / r.height) * S,
    };
  }

  // 가로/세로 중 짧은 쪽에 맞춰 정사각형으로 고정한다.
  // aspect-ratio만 믿으면 넘치는 경우가 있어 직접 계산한다.
  fit(area) {
    const side = Math.floor(Math.min(area.clientWidth, area.clientHeight));
    if (side <= 0) return;
    this.wrap.style.width = side + 'px';
    this.wrap.style.height = side + 'px';
  }

  // 저장용 합성: 배경 → 칠 → 선화(multiply)
  flatten() {
    const out = offscreen();
    const ctx = out.getContext('2d');
    ctx.drawImage(this.bg, 0, 0);
    ctx.drawImage(this.paint, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.line, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    return out;
  }

  // 자동 저장용: 칠 레이어만 PNG로
  paintBlob() {
    return new Promise((resolve) => this.paint.toBlob(resolve, 'image/png'));
  }

  async restorePaint(blob) {
    const bmp = await createImageBitmap(blob);
    this.clearPaint();
    this.paintCtx.drawImage(bmp, 0, 0);
    bmp.close?.();
  }
}
