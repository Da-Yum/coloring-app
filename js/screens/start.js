import { OPTIONS, PARENT_GATE_HOLD_MS, FEATURES } from '../config.js';
import { getOption, setOption, getTokenState } from '../storage.js';
import { attachHold } from '../input.js';
import { sfx } from '../sound.js';
import { setIcon } from '../icons.js';

let app;

function renderOptions() {
  const list = document.getElementById('opt-list');
  list.replaceChildren();

  for (const opt of OPTIONS) {
    const row = document.createElement('div');
    row.className = 'opt';

    const label = document.createElement('span');
    label.textContent = opt.label;

    const toggle = document.createElement('button');
    toggle.className = 'toggle';
    toggle.setAttribute('role', 'switch');

    const paint = () => {
      const on = getOption(opt.key);
      toggle.classList.toggle('is-on', on);
      toggle.setAttribute('aria-checked', String(on));
    };
    paint();

    toggle.addEventListener('click', async () => {
      // 토큰 모드를 켜고 끄는 것은 부모만 할 수 있다 (15장)
      if (opt.parent && !(await app.askPin({ title: '부모님만 바꿀 수 있어요' }))) return;

      setOption(opt.key, !getOption(opt.key));
      paint();
      sfx.tap();
      app.refreshTokens();
    });

    row.append(label, toggle);
    list.append(row);
  }
}

// 처음 켰을 때 한 번 부모님 설정을 권한다. 건너뛰면 토큰 모드는 꺼진 채로 간다.
async function firstRun() {
  if (!FEATURES.tokens) return;
  const st = getTokenState();
  if (st.setupDone) return;

  const want = await app.choose(
    '착한 일을 하면 별을 받고, 그 별로 새 도안을 여는 기능이 있어요. 지금 설정할까요?',
    [
      { label: '설정하기', value: true, primary: true },
      { label: '나중에', value: false },
    ],
  );

  if (want) {
    const ok = await app.askPin({ forSetup: true });
    if (ok) {
      setOption('tokens', true);
      app.refreshTokens();
    }
  }
  // 물어본 것 자체를 기억한다. 다시 묻지 않는다.
  const { saveTokenState } = await import('../storage.js');
  saveTokenState({ setupDone: true });
}

export function init(a) {
  app = a;
  const overlay = document.getElementById('overlay-options');

  document.getElementById('btn-begin').addEventListener('click', () => {
    sfx.select();
    app.go('select');
  });

  document.getElementById('btn-gallery').addEventListener('click', () => {
    sfx.select();
    app.go('gallery');
  });

  const gear = document.getElementById('btn-options');
  setIcon(gear, 'gear', '옵션');
  gear.addEventListener('click', () => {
    renderOptions();
    overlay.hidden = false;
  });

  document.getElementById('btn-options-close').addEventListener('click', () => {
    overlay.hidden = true;
    app.refreshTokens();
  });

  // 부모 모드 입구. 아이가 우연히 누르기 어렵게 2초 길게 누르기.
  const parentBtn = document.getElementById('btn-parent');
  if (FEATURES.tokens) {
    attachHold(parentBtn, PARENT_GATE_HOLD_MS, async () => {
      if (await app.askPin({ title: '부모님 암호' })) app.go('parent');
    });
  } else {
    parentBtn.hidden = true;
  }
}

export function enter() {
  app.refreshTokens();
  firstRun();
}
