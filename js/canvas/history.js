// 되돌리기/다시하기.
// 스트로크마다 바뀐 영역의 before/after ImageData만 들고 있는다.
// after가 null이면 "그 영역을 투명하게" 라는 뜻 (다 지우기용).

import { HISTORY } from '../config.js';

const bytesOf = (entry) => {
  const px = entry.box.w * entry.box.h * 4;
  return entry.after ? px * 2 : px;
};

export class History {
  constructor(ctx) {
    this.ctx = ctx;
    this.stack = [];
    this.index = -1;   // 현재 위치. -1 = 아무것도 안 한 상태
    this.bytes = 0;
    this.onChange = null;
  }

  reset() {
    this.stack = [];
    this.index = -1;
    this.bytes = 0;
    this.notify();
  }

  push(box, before, after) {
    // 되돌린 뒤 새로 그리면 앞쪽 기록은 버린다.
    if (this.index < this.stack.length - 1) {
      for (const e of this.stack.slice(this.index + 1)) this.bytes -= bytesOf(e);
      this.stack.length = this.index + 1;
    }

    const entry = { box, before, after };
    this.stack.push(entry);
    this.bytes += bytesOf(entry);
    this.index = this.stack.length - 1;

    // 단계 수와 총 바이트 중 먼저 걸리는 쪽에서 오래된 것부터 밀어낸다.
    while (
      this.stack.length > HISTORY.maxSteps ||
      (this.bytes > HISTORY.maxBytes && this.stack.length > 1)
    ) {
      this.bytes -= bytesOf(this.stack.shift());
      this.index--;
    }
    this.notify();
  }

  apply(box, data) {
    if (data) this.ctx.putImageData(data, box.x, box.y);
    else this.ctx.clearRect(box.x, box.y, box.w, box.h);
  }

  undo() {
    if (!this.canUndo()) return false;
    const e = this.stack[this.index];
    this.apply(e.box, e.before);
    this.index--;
    this.notify();
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    const e = this.stack[this.index + 1];
    this.apply(e.box, e.after);
    this.index++;
    this.notify();
    return true;
  }

  canUndo() { return this.index >= 0; }
  canRedo() { return this.index < this.stack.length - 1; }

  notify() { this.onChange?.(this); }
}
