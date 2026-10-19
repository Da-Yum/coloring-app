// 고급 옵션용 HSV 색상 선택기 — 색상 링 + 명도/채도 사각형.
// 고급 옵션이 꺼져 있으면 아예 보이지 않으므로 여기서는 늘 동작한다고 본다.

const RING_SIZE = 150;
const RING_OUTER = RING_SIZE / 2;
const RING_INNER = RING_OUTER - 20;
const SQ_SIZE = 84;

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return [r + m, g + m, b + m].map((n) => Math.round(n * 255));
}

function toHex(h, s, v) {
  return '#' + hsvToRgb(h, s, v).map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function drawRing(canvas) {
  const ctx = canvas.getContext('2d');
  const cx = RING_OUTER;
  const cy = RING_OUTER;
  ctx.clearRect(0, 0, RING_SIZE, RING_SIZE);

  // 1도씩 부채꼴로 채운다. 작은 각도 겹침을 줘서 틈이 안 보이게.
  for (let deg = 0; deg < 360; deg++) {
    const a0 = ((deg - 0.7) * Math.PI) / 180;
    const a1 = ((deg + 1.2) * Math.PI) / 180;
    ctx.beginPath();
    ctx.arc(cx, cy, RING_OUTER, a0, a1);
    ctx.arc(cx, cy, RING_INNER, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = toHex(deg, 1, 1);
    ctx.fill();
  }
}

function drawSquare(canvas, hue) {
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(SQ_SIZE, SQ_SIZE);
  const d = img.data;
  for (let y = 0; y < SQ_SIZE; y++) {
    const v = 1 - y / (SQ_SIZE - 1);
    for (let x = 0; x < SQ_SIZE; x++) {
      const s = x / (SQ_SIZE - 1);
      const [r, g, b] = hsvToRgb(hue, s, v);
      const o = (y * SQ_SIZE + x) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function mountPicker(host, onPick) {
  if (!host) return null;

  let hue = 200;
  let sat = 0.8;
  let val = 0.9;

  host.replaceChildren();

  const wrap = document.createElement('div');
  wrap.className = 'picker';

  const ring = document.createElement('canvas');
  ring.width = ring.height = RING_SIZE;
  ring.className = 'picker-ring';

  const square = document.createElement('canvas');
  square.width = square.height = SQ_SIZE;
  square.className = 'picker-square';

  const ringDot = document.createElement('span');
  ringDot.className = 'picker-dot ring-dot';
  const sqDot = document.createElement('span');
  sqDot.className = 'picker-dot sq-dot';

  wrap.append(ring, square, ringDot, sqDot);
  host.append(wrap);

  drawRing(ring);
  drawSquare(square, hue);

  const place = () => {
    const a = (hue * Math.PI) / 180;
    const rr = (RING_OUTER + RING_INNER) / 2;
    ringDot.style.left = (RING_OUTER + Math.cos(a) * rr) + 'px';
    ringDot.style.top = (RING_OUTER + Math.sin(a) * rr) + 'px';

    const off = (RING_SIZE - SQ_SIZE) / 2;
    sqDot.style.left = (off + sat * (SQ_SIZE - 1)) + 'px';
    sqDot.style.top = (off + (1 - val) * (SQ_SIZE - 1)) + 'px';
  };

  const emit = () => {
    place();
    onPick(toHex(hue, sat, val));
  };

  // 링은 각도만, 사각형은 좌표만 본다. 둘 다 끌어서 조절된다.
  const track = (el, handler) => {
    let id = null;
    const run = (ev) => {
      const r = el.getBoundingClientRect();
      handler(ev.clientX - r.left, ev.clientY - r.top, r);
    };
    el.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      id = ev.pointerId;
      try { el.setPointerCapture(id); } catch { /* 무시 */ }
      run(ev);
    });
    el.addEventListener('pointermove', (ev) => { if (ev.pointerId === id) run(ev); });
    const stop = (ev) => {
      if (ev.pointerId !== id) return;
      try { el.releasePointerCapture(id); } catch { /* 무시 */ }
      id = null;
    };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
  };

  track(ring, (x, y) => {
    const dx = x - RING_OUTER;
    const dy = y - RING_OUTER;
    hue = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    drawSquare(square, hue);
    emit();
  });

  track(square, (x, y) => {
    sat = Math.min(1, Math.max(0, x / (SQ_SIZE - 1)));
    val = Math.min(1, Math.max(0, 1 - y / (SQ_SIZE - 1)));
    emit();
  });

  place();
  return { hex: () => toHex(hue, sat, val) };
}
