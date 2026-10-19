// 서비스 워커. 오프라인에서도 돌아가게 앱 껍데기와 도안을 캐시한다.
//
// 코드를 고치면 CACHE 값을 올린다. 그래야 옛 캐시를 버리고 새로 받는다.
// GitHub Pages 하위 경로에서도 되도록 경로는 전부 상대 경로다.

const CACHE = 'coloring-v8';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/config.js',
  './js/storage.js',
  './js/input.js',
  './js/sound.js',
  './js/icons.js',
  './js/pin.js',
  './js/colorpicker.js',
  './js/screens/start.js',
  './js/screens/select.js',
  './js/screens/paint.js',
  './js/screens/done.js',
  './js/screens/gallery.js',
  './js/screens/parent.js',
  './js/canvas/layers.js',
  './js/canvas/brushes.js',
  './js/canvas/history.js',
  './js/canvas/region.js',
  './js/workers/region-worker.js',
  './data/drawings.json',
  './assets/drawings/hachuping.png',
  './assets/drawings/hachuping_thumb.png',
  './assets/drawings/baroping.png',
  './assets/drawings/baroping_thumb.png',
  './assets/drawings/ajaping.png',
  './assets/drawings/ajaping_thumb.png',
  './assets/drawings/laraping.png',
  './assets/drawings/laraping_thumb.png',
  './assets/drawings/chiikawa.png',
  './assets/drawings/chiikawa_thumb.png',
  './assets/drawings/hachiware.png',
  './assets/drawings/hachiware_thumb.png',
  './assets/drawings/usagi.png',
  './assets/drawings/usagi_thumb.png',
  './assets/ui/start-bg.jpg',
  './assets/icons/tools/brush.png',
  './assets/icons/tools/pencil.png',
  './assets/icons/tools/crayon.png',
  './assets/icons/tools/fill.png',
  './assets/icons/tools/eraser.png',
  './assets/icons/tools/gear.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE)
      // 한 장이 빠져도 설치는 되게 한 개씩 담는다
      .then((cache) => Promise.all(
        SHELL.map((url) => cache.add(url).catch((err) => {
          console.warn('캐시에 담지 못했습니다:', url, err);
        })),
      ))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 구글 폰트는 받아둔 뒤 다음부터 캐시에서 쓴다
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com');
  if (!sameOrigin && !isFont) return;

  ev.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // 도안 그림처럼 나중에 더해진 것도 담아둔다
        if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => {
        // 오프라인이고 캐시에도 없다 — 화면 이동이면 첫 페이지라도 보여준다
        if (req.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      });
    }),
  );
});
