'use strict';
// Localisation: Korean and English. Content strings (names, descriptions) live with the data.
(function (CD) {
  const S = {
    ko: {
      'title.sub': '마지막 등불',
      'title.tag': '불꽃은 생명이자, 시야이자, 무기다.',
      'menu.descend': '하강',
      'menu.sanctuary': '성소',
      'menu.archive': '기록',
      'menu.settings': '설정',
      'menu.quit': '종료',
      back: '뒤로', confirm: '확인', cancel: '취소', on: '켬', off: '끔',

      'select.title': '등불을 고르라',
      'select.start': '하강 시작',
      'select.locked': '성소에서 해금',
      'select.gloom': '어스름',
      'select.gloomDesc': '단계마다 그림자 체력 +15%, 받는 피해 +10%, 얻는 재 +20%',
      'select.gloomLocked': '하강을 완수하면 다음 어스름 단계가 열린다',
      'stat.dmg': '피해', 'stat.rate': '연사', 'stat.flame': '불꽃',

      'sanc.title': '성소',
      'sanc.sub': '심연에서 가져온 재를 바쳐 다음 하강을 준비한다.',
      'sanc.lanterns': '등불',
      'sanc.upgrades': '강화',
      'sanc.owned': '보유 중',
      'sanc.unlock': '해금',
      'sanc.max': '최대',
      ash: '재',

      'arch.title': '기록',
      'arch.shades': '그림자', 'arch.boons': '은총', 'arch.achs': '업적', 'arch.records': '전적',
      'arch.unknown': '아직 만나지 못했다',
      'arch.kills': '처치 {n}',
      'rec.runs': '하강 횟수', 'rec.wins': '완수', 'rec.deaths': '꺼진 횟수', 'rec.best': '최고 심도',
      'rec.kills': '처치한 그림자', 'rec.time': '플레이 시간', 'rec.ash': '모은 재', 'rec.braziers': '밝힌 화로', 'rec.bosses': '쓰러뜨린 주인',

      'set.title': '설정',
      'set.master': '전체 음량', 'set.music': '음악', 'set.sfx': '효과음', 'set.shake': '화면 흔들림',
      'set.dmgNum': '피해 숫자', 'set.autoAim': '자동 조준 (터치)', 'set.fullscreen': '전체 화면', 'set.lang': '언어',
      'set.controls': '조작법',
      'set.reset': '저장 데이터 초기화',
      'set.resetConfirm': '모든 진행 상황이 지워집니다. 정말 초기화할까요?',
      'ctl.move': '이동', 'ctl.aim': '조준 · 발사', 'ctl.dash': '질주', 'ctl.flare': '섬광', 'ctl.interact': '상호작용', 'ctl.map': '지도', 'ctl.pause': '일시 정지',
      'ctl.kbm': '키보드 · 마우스', 'ctl.pad': '게임패드',
      'ctl.k.move': 'WASD', 'ctl.k.aim': '마우스 · 좌클릭', 'ctl.k.dash': 'Space / Shift', 'ctl.k.flare': '우클릭 / Q', 'ctl.k.interact': 'E', 'ctl.k.map': 'M / Tab', 'ctl.k.pause': 'Esc',
      'ctl.p.move': 'L 스틱', 'ctl.p.aim': 'R 스틱 (RT 자동 조준)', 'ctl.p.dash': 'A / LT', 'ctl.p.flare': 'X / RB', 'ctl.p.interact': 'Y', 'ctl.p.map': 'Back', 'ctl.p.pause': 'Start',

      'pause.title': '일시 정지',
      'pause.resume': '계속',
      'pause.abandon': '하강 포기',
      'pause.abandonConfirm': '이번 하강을 포기할까요? 지금까지 모은 재는 가져갑니다.',
      'pause.boons': '지닌 은총',
      'pause.none': '아직 없다',

      'choice.normal': '은총을 고르라',
      'choice.relic': '주인의 유물',
      'choice.shrine': '제단의 응답',
      'choice.reroll': '다시 뽑기 ({n})',
      'choice.skip': '받지 않고 불꽃 +15',
      'choice.new': '새 은총',
      'choice.level': '단계 {a} → {b}',

      'res.dead': '불이 꺼졌다',
      'res.deadSub': '심도 {d} · {name}에서 어둠에 삼켜졌다',
      'res.won': '심연에 불이 붙었다',
      'res.wonSub': '아홉 심도 아래, 마지막 화로가 다시 타오른다',
      'res.depth': '도달 심도', 'res.time': '시간', 'res.kills': '처치', 'res.braziers': '밝힌 화로', 'res.boons': '은총', 'res.ash': '얻은 재',
      'res.again': '다시 하강', 'res.sanctuary': '성소로', 'res.title': '타이틀로',
      'res.gloom': '어스름 {n}단계가 열렸다',

      depth: '심도',
      kindling: '불을 붙이는 중…',
      shrinePrompt: '잊힌 제단 — 불꽃 25를 바쳐 귀한 은총을 구한다',
      shrineLow: '불꽃이 모자라다',
      gateOpen: '아래로 가는 문이 열렸다',
      eclipse: '일식',
      phoenix: '불사조의 깃',
      'toast.ach': '업적 달성',
      'map.title': '지도',

      'hint.move.kbm': 'WASD로 움직이고, 마우스로 겨눠 좌클릭으로 불씨를 쏜다',
      'hint.move.pad': 'L 스틱으로 움직이고, R 스틱을 기울여 불씨를 쏜다',
      'hint.move.touch': '왼쪽을 끌어 움직인다 · 가까운 그림자를 스스로 겨눠 쏜다',
      'hint.dash.kbm': 'Space로 질주 — 질주하는 동안은 다치지 않는다',
      'hint.dash.pad': 'A로 질주 — 질주하는 동안은 다치지 않는다',
      'hint.dash.touch': '질주 버튼 — 질주하는 동안은 다치지 않는다',
      'hint.flare.kbm': '우클릭 또는 Q로 섬광 — 그림자를 밀쳐내고 적의 탄을 지운다',
      'hint.flare.pad': 'X로 섬광 — 그림자를 밀쳐내고 적의 탄을 지운다',
      'hint.flare.touch': '섬광 버튼 — 그림자를 밀쳐내고 적의 탄을 지운다',
      'hint.flame': '등불의 불꽃이 곧 생명이다. 쏠 때도 닳으니, 불씨를 주워 되살려라',
      'hint.brazier': '화로 곁에 머물러 불을 붙여라. 어둠이 막으려 들 것이다',
      'hint.gate': '모든 화로가 밝혀졌다. 푸른 빛이 새는 문을 찾아 내려가라',
      'hint.shrine': '제단은 불꽃을 받고 귀한 은총을 내준다',
      'hint.guide': '등불의 불꽃은 아직 꺼진 화로 쪽으로 기운다',
    },
    en: {
      'title.sub': 'The Last Lantern',
      'title.tag': 'Your flame is your life, your sight, and your weapon.',
      'menu.descend': 'Descend',
      'menu.sanctuary': 'Sanctuary',
      'menu.archive': 'Archive',
      'menu.settings': 'Settings',
      'menu.quit': 'Quit',
      back: 'Back', confirm: 'Confirm', cancel: 'Cancel', on: 'On', off: 'Off',

      'select.title': 'Choose your lantern',
      'select.start': 'Begin descent',
      'select.locked': 'Unlock in the Sanctuary',
      'select.gloom': 'Gloom',
      'select.gloomDesc': 'Per level: shades +15% health, you take +10% damage, +20% ash',
      'select.gloomLocked': 'Complete a descent to unlock the next Gloom level',
      'stat.dmg': 'Damage', 'stat.rate': 'Rate', 'stat.flame': 'Flame',

      'sanc.title': 'Sanctuary',
      'sanc.sub': 'Offer the ash you carried up to prepare the next descent.',
      'sanc.lanterns': 'Lanterns',
      'sanc.upgrades': 'Upgrades',
      'sanc.owned': 'Owned',
      'sanc.unlock': 'Unlock',
      'sanc.max': 'Max',
      ash: 'Ash',

      'arch.title': 'Archive',
      'arch.shades': 'Shades', 'arch.boons': 'Boons', 'arch.achs': 'Achievements', 'arch.records': 'Records',
      'arch.unknown': 'Not yet encountered',
      'arch.kills': 'Slain {n}',
      'rec.runs': 'Descents', 'rec.wins': 'Completed', 'rec.deaths': 'Flames lost', 'rec.best': 'Deepest depth',
      'rec.kills': 'Shades slain', 'rec.time': 'Time played', 'rec.ash': 'Ash gathered', 'rec.braziers': 'Braziers lit', 'rec.bosses': 'Lords felled',

      'set.title': 'Settings',
      'set.master': 'Master volume', 'set.music': 'Music', 'set.sfx': 'Effects', 'set.shake': 'Screen shake',
      'set.dmgNum': 'Damage numbers', 'set.autoAim': 'Auto-aim (touch)', 'set.fullscreen': 'Fullscreen', 'set.lang': 'Language',
      'set.controls': 'Controls',
      'set.reset': 'Reset save data',
      'set.resetConfirm': 'All progress will be erased. Reset anyway?',
      'ctl.move': 'Move', 'ctl.aim': 'Aim · Fire', 'ctl.dash': 'Dash', 'ctl.flare': 'Flare', 'ctl.interact': 'Interact', 'ctl.map': 'Map', 'ctl.pause': 'Pause',
      'ctl.kbm': 'Keyboard · Mouse', 'ctl.pad': 'Gamepad',
      'ctl.k.move': 'WASD', 'ctl.k.aim': 'Mouse · Left click', 'ctl.k.dash': 'Space / Shift', 'ctl.k.flare': 'Right click / Q', 'ctl.k.interact': 'E', 'ctl.k.map': 'M / Tab', 'ctl.k.pause': 'Esc',
      'ctl.p.move': 'Left stick', 'ctl.p.aim': 'Right stick (RT auto-aims)', 'ctl.p.dash': 'A / LT', 'ctl.p.flare': 'X / RB', 'ctl.p.interact': 'Y', 'ctl.p.map': 'Back', 'ctl.p.pause': 'Start',

      'pause.title': 'Paused',
      'pause.resume': 'Resume',
      'pause.abandon': 'Abandon descent',
      'pause.abandonConfirm': 'Abandon this descent? You keep the ash gathered so far.',
      'pause.boons': 'Boons held',
      'pause.none': 'None yet',

      'choice.normal': 'Choose a boon',
      'choice.relic': "The lord's relic",
      'choice.shrine': 'The altar answers',
      'choice.reroll': 'Reroll ({n})',
      'choice.skip': 'Decline for +15 flame',
      'choice.new': 'New boon',
      'choice.level': 'Level {a} → {b}',

      'res.dead': 'Your flame went out',
      'res.deadSub': 'Swallowed by the dark at depth {d} · {name}',
      'res.won': 'The deep is alight',
      'res.wonSub': 'Nine depths down, the last brazier burns again',
      'res.depth': 'Depth reached', 'res.time': 'Time', 'res.kills': 'Slain', 'res.braziers': 'Braziers lit', 'res.boons': 'Boons', 'res.ash': 'Ash gained',
      'res.again': 'Descend again', 'res.sanctuary': 'Sanctuary', 'res.title': 'Title',
      'res.gloom': 'Gloom {n} unlocked',

      depth: 'Depth',
      kindling: 'Kindling…',
      shrinePrompt: 'Forgotten altar — offer 25 flame for a rare boon',
      shrineLow: 'Not enough flame',
      gateOpen: 'The way down has opened',
      eclipse: 'Eclipse',
      phoenix: 'Phoenix Feather',
      'toast.ach': 'Achievement unlocked',
      'map.title': 'Map',

      'hint.move.kbm': 'Move with WASD, aim with the mouse, left click to fire embers',
      'hint.move.pad': 'Move with the left stick, tilt the right stick to fire embers',
      'hint.move.touch': 'Drag on the left to move · you aim and fire at nearby shades on your own',
      'hint.dash.kbm': 'Space to dash — nothing can hurt you mid-dash',
      'hint.dash.pad': 'A to dash — nothing can hurt you mid-dash',
      'hint.dash.touch': 'Dash button — nothing can hurt you mid-dash',
      'hint.flare.kbm': 'Right click or Q to flare — hurls shades back and erases their shots',
      'hint.flare.pad': 'X to flare — hurls shades back and erases their shots',
      'hint.flare.touch': 'Flare button — hurls shades back and erases their shots',
      'hint.flame': 'Your flame is your life. Firing spends it too — gather embers to feed it',
      'hint.brazier': 'Stand by a brazier to kindle it. The dark will try to stop you',
      'hint.gate': 'Every brazier burns. Find the gate that bleeds blue light and descend',
      'hint.shrine': 'An altar takes flame and gives a rare boon in return',
      'hint.guide': 'Your lantern flame leans toward braziers still unlit',
    },
  };

  const I18N = (CD.I18N = { lang: 'ko', langs: { ko: '한국어', en: 'English' }, missing: {} });
  I18N.init = function () {
    const saved = CD.Save.data.settings.lang;
    const nav = (navigator.language || 'en').toLowerCase();
    I18N.lang = saved && S[saved] ? saved : nav.startsWith('ko') ? 'ko' : 'en';
    document.documentElement.lang = I18N.lang;
  };
  I18N.set = function (l) {
    if (!S[l]) return;
    I18N.lang = l;
    CD.Save.data.settings.lang = l;
    CD.Save.save();
    document.documentElement.lang = l;
  };
  CD.T = function (key, vars) {
    let s = S[I18N.lang][key];
    if (s === undefined) s = S.en[key];
    if (s === undefined) {
      I18N.missing[key] = true;
      return key;
    }
    if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
    return s;
  };
  CD.TH = function (id) {
    const k = 'hint.' + id + '.' + CD.Input.mode;
    return S[I18N.lang][k] !== undefined ? CD.T(k) : CD.T('hint.' + id);
  };
  CD.L = function (o) {
    return typeof o === 'string' ? o : o[I18N.lang] || o.en;
  };
  CD.FONT = '"Pretendard","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic","Segoe UI",system-ui,sans-serif';
  CD.FONT_DISPLAY = '"Cinzel","Nanum Myeongjo","Noto Serif KR","Batang","Songti SC",Georgia,"Times New Roman",serif';
})(window.CD);
