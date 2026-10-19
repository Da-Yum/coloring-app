// 포인터 처리. Pointer Events만 쓴다.
//
// 오터치 방지 (7장):
//  - 동시에 2개 이상 닿으면 그리던 획을 취소한다 (손바닥이 닿은 것)
//  - S펜이 한 번 감지되면 잠시 손가락 입력을 통째로 무시한다

import { TOUCH_PRESSURE, PALM } from './config.js';

// 포인터를 붙잡는다. 이미 끝난 포인터면 예외가 나므로 삼킨다.
function capture(el, id) {
  try { el.setPointerCapture(id); return true; } catch { return false; }
}

function release(el, id) {
  try { el.releasePointerCapture(id); } catch { /* 이미 풀렸다 */ }
}

// 붙잡고 있는 동안에는 pointerleave가 튀어도 무시해야 한다.
// 캡처된 포인터는 요소 밖으로 나가도 계속 이 요소로 들어온다.
function leaveShouldCancel(el, id) {
  return !el.hasPointerCapture?.(id);
}

export function attachPointer(el, { map, onStart, onMove, onEnd, onCancel }) {
  let activeId = null;
  let activeType = null;
  let lastPenAt = -Infinity;
  const down = new Set();   // 지금 닿아 있는 포인터 전부

  const toPoint = (ev) => {
    const p = map(ev.clientX, ev.clientY);
    p.pressure = ev.pointerType === 'touch'
      ? TOUCH_PRESSURE
      : (ev.pressure > 0 ? ev.pressure : TOUCH_PRESSURE);
    return p;
  };

  // 펜이 닿은 직후의 손가락은 손바닥으로 본다
  const penIsActive = () =>
    activeType === 'pen' || (performance.now() - lastPenAt) < PALM.penLockMs;

  const finish = (cancelled) => {
    if (activeId === null) return;
    release(el, activeId);
    if (activeType === 'pen') lastPenAt = performance.now();
    activeId = null;
    activeType = null;
    if (cancelled) onCancel?.();
    else onEnd();
  };

  const onDown = (ev) => {
    down.add(ev.pointerId);

    if (ev.pointerType === 'touch' && penIsActive()) return;   // 손바닥

    if (activeId !== null) {
      // 두 번째 손가락이 닿았다 — 그리던 획을 없던 일로 한다
      finish(true);
      return;
    }
    if (down.size > 1) return;   // 이미 뭔가 닿아 있다

    activeId = ev.pointerId;
    activeType = ev.pointerType;
    if (ev.pointerType === 'pen') lastPenAt = performance.now();
    capture(el, ev.pointerId);
    ev.preventDefault();
    onStart(toPoint(ev));
  };

  const onMoveEv = (ev) => {
    if (ev.pointerId !== activeId) return;
    ev.preventDefault();
    if (activeType === 'pen') lastPenAt = performance.now();
    // 중간 좌표까지 받아서 빠르게 그어도 각지지 않게 한다.
    const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [];
    onMove((evs.length ? evs : [ev]).map(toPoint));
  };

  const onUp = (ev) => {
    down.delete(ev.pointerId);
    if (ev.pointerId !== activeId) return;
    if (ev.type === 'pointerleave' && !leaveShouldCancel(el, activeId)) return;
    finish(ev.type === 'pointercancel');
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMoveEv);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('pointerleave', onUp);

  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMoveEv);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    el.removeEventListener('pointerleave', onUp);
  };
}

// 길게 누르기 + 진행 링.
// 완료 판정은 실제 타이머로 한다. rAF는 링을 그리는 데만 쓴다 —
// 화면이 가려지면 rAF가 멈추는데, 그 때문에 동작까지 멈추면 안 된다.
export function attachHold(btn, ms, onComplete) {
  const ring = btn.querySelector('.hold-ring circle');
  const LEN = 132;                     // 2πr, r=21
  let raf = null;
  let timer = null;
  let start = 0;
  let activeId = null;

  const paint = (ratio) => {
    if (ring) ring.style.strokeDashoffset = String(LEN * (1 - ratio));
  };

  const stop = () => {
    if (raf !== null) cancelAnimationFrame(raf);
    if (timer !== null) clearTimeout(timer);
    raf = null;
    timer = null;
    activeId = null;
    paint(0);
    btn.classList.remove('is-holding');
  };

  const tick = (now) => {
    paint(Math.min(1, (now - start) / ms));
    raf = requestAnimationFrame(tick);
  };

  btn.addEventListener('pointerdown', (ev) => {
    if (btn.disabled || activeId !== null) return;
    ev.preventDefault();
    activeId = ev.pointerId;
    capture(btn, ev.pointerId);
    btn.classList.add('is-holding');
    start = performance.now();
    raf = requestAnimationFrame(tick);
    timer = setTimeout(() => {
      release(btn, activeId);
      stop();
      onComplete();
    }, ms);
  });

  const cancel = (ev) => {
    if (activeId === null || ev.pointerId !== activeId) return;
    if (ev.type === 'pointerleave' && !leaveShouldCancel(btn, activeId)) return;
    release(btn, activeId);
    stop();
  };

  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    btn.addEventListener(type, cancel);
  }
}
