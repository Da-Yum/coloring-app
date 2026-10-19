import { downloadBlob, stampName, addToGallery, clearProgress } from '../storage.js';
import { sfx } from '../sound.js';

let app;
let drawing = null;
let flat = null;          // 합성된 캔버스
let stopConfetti = null;

/* 색종이 파티클 1~2초 */
function confetti(canvas) {
  const ctx = canvas.getContext('2d');
  const colors = ['#FF9F68', '#7FC8E8', '#7ED98B', '#F7D774', '#F29EC0', '#C9B8E8'];

  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  const bits = Array.from({ length: 90 }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * canvas.height * 0.5,
    vx: (Math.random() - 0.5) * 1.6,
    vy: 2 + Math.random() * 3,
    size: 6 + Math.random() * 8,
    spin: (Math.random() - 0.5) * 0.3,
    angle: Math.random() * Math.PI,
    color: colors[(Math.random() * colors.length) | 0],
  }));

  const started = performance.now();
  let raf = null;

  const tick = (now) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const age = now - started;
    const fade = age > 1400 ? Math.max(0, 1 - (age - 1400) / 600) : 1;

    for (const b of bits) {
      b.x += b.vx; b.y += b.vy; b.angle += b.spin;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.size / 2, -b.size / 2, b.size, b.size * 0.6);
      ctx.restore();
    }

    if (age < 2000) raf = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}

function toBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function save() {
  if (!flat) return;
  const blob = await toBlob(flat);
  if (!blob) { app.toast('저장하지 못했어요'); return; }

  downloadBlob(blob, stampName(drawing.id));
  await addToGallery(drawing.id, drawing.title, blob);   // 내 작품에도 남긴다
  await clearProgress(drawing.id);                        // 다 칠했으니 "이어서"는 지운다
  sfx.done();
  app.toast('갤러리에 저장했어요!');
}

export function init(a) {
  app = a;
  document.getElementById('btn-save').addEventListener('click', save);
  document.getElementById('btn-keep').addEventListener('click', () => app.go('paint', { resume: true }));
  document.getElementById('btn-home').addEventListener('click', () => app.go('start'));
}

export function enter(payload) {
  drawing = payload.drawing;
  flat = payload.canvas;

  document.getElementById('done-preview').src = flat.toDataURL('image/png');
  stopConfetti = confetti(document.getElementById('confetti'));
}

export function leave() {
  stopConfetti?.();
  stopConfetti = null;
}
