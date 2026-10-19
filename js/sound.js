// 효과음. 음원 파일 없이 WebAudio로 만든다 (받을 것이 줄고 오프라인에서도 된다).
// 소리 옵션이 꺼져 있으면 아무것도 하지 않는다.

import { getOption } from './storage.js';

let ctx = null;

function audio() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

// 브라우저는 사용자가 건드리기 전에는 소리를 막는다. 첫 터치에 깨운다.
export function wakeAudio() {
  const a = audio();
  if (a && a.state === 'suspended') a.resume().catch(() => {});
}

function blip(freqs, { duration = 0.12, type = 'sine', gain = 0.08 } = {}) {
  if (!getOption('sound')) return;
  const a = audio();
  if (!a || a.state !== 'running') return;

  const now = a.currentTime;
  freqs.forEach((f, i) => {
    const osc = a.createOscillator();
    const amp = a.createGain();
    const at = now + i * duration * 0.7;

    osc.type = type;
    osc.frequency.setValueAtTime(f, at);
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(gain, at + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(amp).connect(a.destination);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  });
}

export const sfx = {
  tap:     () => blip([520]),
  select:  () => blip([660], { duration: 0.1 }),
  fill:    () => blip([330, 440], { duration: 0.14, type: 'triangle' }),
  undo:    () => blip([300], { duration: 0.1, type: 'triangle' }),
  clear:   () => blip([220, 180], { duration: 0.16, type: 'triangle' }),
  done:    () => blip([523, 659, 784, 1047], { duration: 0.16 }),
  token:   () => blip([784, 988, 1319], { duration: 0.14 }),
  unlock:  () => blip([440, 554, 659, 880], { duration: 0.15 }),
  nope:    () => blip([200], { duration: 0.18, type: 'square', gain: 0.05 }),
};
