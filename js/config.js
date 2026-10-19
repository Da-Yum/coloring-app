// 설정값은 전부 여기 모은다. 느낌을 바꿀 때 이 파일만 건드린다.

// 기능 스위치.
// 착한 일 토큰·부모 모드는 코드를 지우지 않고 꺼 둔다.
// tokens를 true로 되돌리면 자물쇠·별·잠긴 도안·특별 도구가 다시 나온다.
export const FEATURES = {
  tokens: false,
};

export const CANVAS_SIZE = 2048;

// 굵기 3단계 (2048 캔버스 기준). 도구별 배율은 TOOLS.sizeScale.
export const BRUSH_SIZES = [
  { id: 'small',  label: '작게', px: 12 },
  { id: 'medium', label: '보통', px: 28 },
  { id: 'large',  label: '크게', px: 56 },
];

// tip   : 팁 모양 — hard(또렷) / soft(가장자리 흐림) / rough(틈이 보임)
// grain : 종이 결 — 캔버스 좌표에 고정된다. 스트로크마다 랜덤이 아니다
// kind  : 특수 동작 — fill(영역 채우기) / erase(지우개)
// press : 필압이 무엇을 바꾸는가 — size(굵기) / alpha(진하기)
export const TOOLS = [
  { id: 'brush',  label: '붓',      icon: '🖌', ready: true, sizeScale: 1.3, opacity: 0.35,
    tip: 'soft',  press: { target: 'size',  min: 0.5,  max: 1.5 } },
  { id: 'pen',    label: '펜',      icon: '✏', ready: true, sizeScale: 1.0, opacity: 1.00,
    tip: 'hard',  press: { target: 'size',  min: 0.85, max: 1.15 } },
  { id: 'pencil', label: '색연필',  icon: '🖍', ready: true, sizeScale: 0.8, opacity: 0.50,
    tip: 'hard',  grain: 'pencil', press: { target: 'alpha', min: 0.45, max: 1.0 } },
  { id: 'crayon', label: '크레파스', icon: '🖊', ready: true, sizeScale: 1.5, opacity: 0.85,
    tip: 'rough', grain: 'crayon', press: { target: 'size',  min: 0.9,  max: 1.1 } },
  { id: 'fill',   label: '페인트',  icon: '🪣', ready: true, kind: 'fill' },
  { id: 'eraser', label: '지우개',  icon: '🧼', ready: true, sizeScale: 1.2, opacity: 1.00,
    tip: 'hard',  kind: 'erase', press: { target: 'size', min: 0.85, max: 1.15 } },

  // 특별 도구 — 착한 일 토큰으로 연다 (15장). FEATURES.tokens가 꺼져 있으면 안 나온다.
  { id: 'glitter', label: '반짝이', icon: '✨', ready: true, sizeScale: 1.0, opacity: 1.00,
    tip: 'hard', sparkle: true, cost: 2, press: { target: 'size', min: 0.85, max: 1.15 } },
  { id: 'rainbow', label: '무지개', icon: '🌈', ready: true, sizeScale: 1.1, opacity: 1.00,
    tip: 'hard', rainbow: true, cost: 2, press: { target: 'size', min: 0.85, max: 1.15 } },
];

export const DEFAULT_TOOL = 'pen';
export const DEFAULT_SIZE = 'medium';

// 되돌리기: 스트로크마다 바뀐 영역만 저장한다. 전체 스냅샷은 2048²×4 = 16MB라
// 30단계면 메모리가 터진다. 단계 수와 총 바이트 중 먼저 걸리는 쪽에서 밀어낸다.
export const HISTORY = {
  maxSteps: 30,
  maxBytes: 64 * 1024 * 1024,
};

export const STAMP_SPACING_RATIO = 0.15;  // 간격 = 굵기 × 이 값
export const CLEAR_HOLD_MS = 1000;        // 다 지우기 길게 누르기
export const TOUCH_PRESSURE = 0.5;        // 손가락 입력의 고정 필압
export const FILL_ANIM_MS = 200;          // 페인트 퍼짐
export const AUTOSAVE_IDLE_MS = 2000;     // 손을 뗀 뒤 이만큼 조용하면 저장

// 영역 맵
export const REGION = {
  threshold: 128,   // 밝기가 이보다 어두우면 선
  minArea: 50,      // 이보다 작은 영역은 버린다
  dilate: 2,        // 선 경계에 흰 틈이 안 생기게 넓히는 픽셀
  snapRadius: 10,   // 선 위를 눌렀을 때 영역을 찾는 반경
  cacheSize: 2,     // 도안 몇 개분을 들고 있을지
};

// 오터치 방지 (7장)
export const PALM = {
  penLockMs: 1000,  // 펜이 닿은 뒤 이 시간 동안 손가락을 무시한다
};

export const OPTIONS = [
  { key: 'advanced', label: '고급 옵션',           def: false },
  { key: 'clip',     label: '선 밖으로 안 나가게', def: true,  parent: false },
  { key: 'sound',    label: '소리',                def: true  },
];

export const RECENT_COLORS = 6;

// 착한 일 토큰 (15장)
export const DEEDS_DEFAULT = [
  { id: 'toy',     label: '장난감 정리',   emoji: '🧸', reward: 1 },
  { id: 'teeth',   label: '양치하기',     emoji: '🪥', reward: 1 },
  { id: 'eat',     label: '밥 골고루 먹기', emoji: '🥕', reward: 1 },
  { id: 'greet',   label: '인사 잘하기',   emoji: '👋', reward: 1 },
  { id: 'help',    label: '동생 도와주기', emoji: '🤝', reward: 1 },
];

export const PARENT_GATE_HOLD_MS = 2000;  // 자물쇠 길게 누르기
export const PIN_LENGTH = 4;
