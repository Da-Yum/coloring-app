// 선화에서 영역 맵을 만든다. 2048² 라벨링은 무거우니 메인 스레드 밖에서 돈다.
//
// 1) 선화를 흰 바탕 위에 올린 밝기로 이진화한다
// 2) 선이 아닌 픽셀을 4방향 연결로 묶어 영역마다 번호를 준다
// 3) 선 픽셀은 0. 너무 작은 영역도 0으로 버린다

self.onmessage = function (ev) {
  var d = ev.data;
  var result = label(d.pixels, d.width, d.height, d.threshold, d.minArea);
  self.postMessage(result, [result.labels.buffer]);
};

function label(pixels, W, H, threshold, minArea) {
  var n = W * H;
  var isLine = new Uint8Array(n);
  var i, p;

  // 알파가 있는 PNG도 있다. 흰 종이 위에 올렸을 때의 밝기로 판단한다.
  for (i = 0, p = 0; i < n; i++, p += 4) {
    var a = pixels[p + 3];
    var gray = pixels[p] * 0.299 + pixels[p + 1] * 0.587 + pixels[p + 2] * 0.114;
    var onWhite = (gray * a + 255 * (255 - a)) / 255;
    isLine[i] = onWhite < threshold ? 1 : 0;
  }

  var labels = new Int32Array(n);   // 0 = 선이거나 버려진 영역
  var stack = new Int32Array(n);    // 재귀 대신 쓰는 스택
  var regions = [];
  var next = 0;

  for (var seed = 0; seed < n; seed++) {
    if (isLine[seed] || labels[seed] !== 0) continue;

    var id = ++next;
    var top = 0;
    stack[top++] = seed;
    labels[seed] = id;

    var count = 0;
    var minX = W, minY = H, maxX = -1, maxY = -1;

    while (top > 0) {
      var idx = stack[--top];
      var x = idx % W;
      var y = (idx - x) / W;

      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      var j;
      if (x > 0)     { j = idx - 1; if (!isLine[j] && labels[j] === 0) { labels[j] = id; stack[top++] = j; } }
      if (x < W - 1) { j = idx + 1; if (!isLine[j] && labels[j] === 0) { labels[j] = id; stack[top++] = j; } }
      if (y > 0)     { j = idx - W; if (!isLine[j] && labels[j] === 0) { labels[j] = id; stack[top++] = j; } }
      if (y < H - 1) { j = idx + W; if (!isLine[j] && labels[j] === 0) { labels[j] = id; stack[top++] = j; } }
    }

    regions.push({ id: id, count: count, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }

  // 손톱보다 작은 조각은 칠할 대상이 아니다. 0으로 되돌린다.
  var drop = new Uint8Array(next + 1);
  var anyDropped = false;
  for (i = 0; i < regions.length; i++) {
    if (regions[i].count < minArea) { drop[regions[i].id] = 1; anyDropped = true; }
  }
  if (anyDropped) {
    for (i = 0; i < n; i++) if (drop[labels[i]]) labels[i] = 0;
  }

  var kept = [];
  for (i = 0; i < regions.length; i++) if (!drop[regions[i].id]) kept.push(regions[i]);

  return { labels: labels, regions: kept, width: W, height: H };
}
