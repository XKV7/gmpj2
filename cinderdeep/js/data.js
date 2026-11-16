'use strict';
// All game content: lanterns, shades, boons, sanctuary upgrades, biomes, achievements.
(function (CD) {
  const D = (CD.Data = {});

  // 24x24 icon paths. f = fill, otherwise stroked.
  D.ICONS = {
    flame: { d: 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z', f: 1 },
    bolt: { d: 'M13 2 5 14h5l-1 8 8-12h-5z', f: 1 },
    shield: { d: 'M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z', f: 1 },
    speed: { d: 'M4 6l6 6-6 6M12 6l6 6-6 6' },
    sun: { d: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1' },
    drop: { d: 'M12 2c4 5 7 8 7 12a7 7 0 0 1-14 0c0-4 3-7 7-12z', f: 1 },
    magnet: { d: 'M5 3h4v9a3 3 0 0 0 6 0V3h4v9a7 7 0 0 1-14 0z', f: 1 },
    split: { d: 'M12 21V12M12 12 5 4M12 12l7-8M5 4v4M5 4h4M19 4v4M19 4h-4' },
    pierce: { d: 'M3 12h18M15 6l6 6-6 6M8 5v14' },
    bounce: { d: 'M3 5l7 13 5-10 6 11' },
    burst: { d: 'M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5 19 19M5 19l3.5-3.5M15.5 8.5 19 5' },
    seek: { d: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
    dash: { d: 'M3 8h10M5 12h14M3 16h10M16 8l4 4-4 4' },
    star: { d: 'M12 2l2.9 6.6 7.1.7-5.4 4.8 1.6 7L12 17.3 5.8 21.1l1.6-7L2 9.3l7.1-.7z', f: 1 },
    orbit: { d: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 12a9 4 0 1 0 18 0a9 4 0 1 0-18 0' },
    wing: { d: 'M12 21c-2-3-8-5-9-12 3 1 5 2 6 4 0-4 1-8 3-11 2 3 3 7 3 11 1-2 3-3 6-4-1 7-7 9-9 12z', f: 1 },
    chain: { d: 'M3 6h4l3 6h4l3 6h4' },
    gem: { d: 'M12 3l6 9-6 9-6-9z', f: 1 },
    glass: { d: 'M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9' },
    brazier: { d: 'M4 10h16l-3 6H7zM10 16h4v5h-4zM12 2c2 2 3 3 3 5a3 3 0 0 1-6 0c0-2 1-3 3-5z', f: 1 },
    swirl: { d: 'M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 3a9 9 0 0 1 9 9M12 21a9 9 0 0 1-9-9' },
    thorn: { d: 'M12 2l2 6 6-2-4 5 5 4-6 1 1 6-4-4-4 4 1-6-6-1 5-4-4-5 6 2z', f: 1 },
    ash: { d: 'M12 3l7 5v8l-7 5-7-5V8z' },
    skull: { d: 'M12 3a8 8 0 0 0-5 14v3h10v-3a8 8 0 0 0-5-14zM9 12h.01M15 12h.01M10 20v-2M14 20v-2' },
    lock: { d: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z' },
  };

  D.LANTERNS = {
    ember: {
      weapon: 'bolt', cost: 0, color: '#ffb347', light: [255, 196, 128],
      base: { dmg: 10, rate: 5, cost: 0.3, speed: 760, maxFlame: 100 },
      name: { ko: '잔불 등불', en: 'Ember Lantern' },
      desc: { ko: '빠르게 불씨 탄환을 쏘는 균형 잡힌 등불. 처음 심연에 내려가는 이에게 알맞다.', en: 'A balanced lantern that spits rapid ember bolts. A fine first light.' },
    },
    prism: {
      weapon: 'scatter', cost: 120, color: '#ffe9a8', light: [255, 226, 170],
      base: { dmg: 6.5, rate: 1.5, cost: 1.1, speed: 700, pellets: 6, maxFlame: 115 },
      name: { ko: '볕조각 등불', en: 'Sunshard Lantern' },
      desc: { ko: '빛 조각을 부채꼴로 흩뿌린다. 가까울수록 치명적이며 불꽃 통이 크다.', en: 'Scatters shards of light in a cone. Devastating up close, with a deeper oil well.' },
    },
    storm: {
      weapon: 'arc', cost: 300, color: '#9fd8ff', light: [190, 222, 255],
      base: { dmg: 9, rate: 3.2, cost: 0.42, range: 340, chain: 2, maxFlame: 90 },
      name: { ko: '뇌광 등불', en: 'Storm Lantern' },
      desc: { ko: '조준 방향의 그림자에게 번개가 튀어 연쇄한다. 빗나가면 불꽃을 쓰지 않는다.', en: 'Lightning leaps to shades in your aim and chains onward. Costs no flame on a miss.' },
    },
  };

  // ---------- shades ----------
  D.ENEMIES = {
    creeper: { hp: 22, spd: 92, dmg: 10, r: 15, embers: 2, name: { ko: '기는 그림자', en: 'Creeper' }, desc: { ko: '어둠이 뭉쳐 생긴 가장 흔한 것. 느리지만 끈질기다.', en: 'Darkness clotted into hunger. Slow, but it never stops coming.' } },
    mite: { hp: 6, spd: 178, dmg: 5, r: 8, embers: 0.5, name: { ko: '그을음 벌레', en: 'Soot Mite' }, desc: { ko: '떼 지어 달려드는 작은 것들. 하나는 약하나 열은 아니다.', en: 'They come in swarms. One is nothing. Ten is not nothing.' } },
    darter: { hp: 18, spd: 138, dmg: 13, r: 12, embers: 2, name: { ko: '도약귀', en: 'Lunger' }, desc: { ko: '몸을 웅크렸다가 일직선으로 덮쳐든다. 웅크릴 때 옆으로 비켜라.', en: 'Coils, then launches in a straight line. Sidestep when it crouches.' } },
    spitter: { hp: 22, spd: 85, dmg: 9, r: 14, embers: 3, name: { ko: '침 뱉는 눈', en: 'Spitting Eye' }, desc: { ko: '거리를 벌리고 어둠 덩이를 뱉는다. 섬광으로 탄을 지울 수 있다.', en: 'Keeps its distance and spits gloom. A flare wipes its shots away.' } },
    brute: { hp: 120, spd: 60, dmg: 18, r: 27, embers: 8, heavy: true, name: { ko: '거한', en: 'Hulk' }, desc: { ko: '땅을 내리찍어 주변을 뭉갠다. 고리가 차오르기 전에 벗어나라.', en: 'Slams the ground around it. Leave the ring before it fills.' } },
    nest: { hp: 95, spd: 0, dmg: 0, r: 26, embers: 10, heavy: true, name: { ko: '그을음 둥지', en: 'Soot Nest' }, desc: { ko: '벌레를 끝없이 낳는다. 먼저 부수지 않으면 떼에 잠긴다.', en: 'Births mites without end. Break it first or drown in them.' } },
    bomber: { hp: 26, spd: 112, dmg: 22, r: 16, embers: 3, name: { ko: '부푼 것', en: 'Bloat' }, desc: { ko: '가까이서 터진다. 터질 때 다른 그림자도 휩쓸린다.', en: 'Bursts when close. Its blast takes other shades with it.' } },
    lurker: { hp: 32, spd: 205, dmg: 16, r: 13, embers: 4, name: { ko: '잠복자', en: 'Lurker' }, desc: { ko: '빛 속에서도 보이지 않다가 코앞에서 모습을 드러낸다.', en: 'Unseen even in the light, until it is already upon you.' } },
    wraith: { hp: 36, spd: 80, dmg: 12, r: 15, embers: 4, ghost: true, name: { ko: '벽 지나는 망령', en: 'Wallwraith' }, desc: { ko: '벽을 그대로 통과한다. 벽은 더 이상 방패가 아니다.', en: 'Passes through stone. Walls will not save you from it.' } },
    warden: { hp: 64, spd: 78, dmg: 14, r: 18, embers: 6, shield: true, name: { ko: '방패지기', en: 'Shieldwarden' }, desc: { ko: '정면의 공격을 막아낸다. 등 뒤를 노리거나 섬광으로 무너뜨려라.', en: 'Blocks everything from the front. Flank it, or stagger it with a flare.' } },
    boss1: { hp: 1800, spd: 70, dmg: 18, r: 46, embers: 30, boss: true, heavy: true, name: { ko: '어둠아귀', en: 'The Gloom Maw' }, desc: { ko: '세 번째 심도의 주인. 삼킨 불빛만큼 커졌다.', en: 'Lord of the third depth. It has grown fat on swallowed light.' } },
    boss2: { hp: 4500, spd: 85, dmg: 18, r: 40, embers: 40, boss: true, heavy: true, name: { ko: '밀랍 과부', en: 'The Tallow Widow' }, desc: { ko: '화로의 불을 훔쳐 끄고, 어둠 속에서 다시 나타난다.', en: 'She snuffs the braziers and steps back out of the dark.' } },
    boss3: { hp: 9000, spd: 60, dmg: 20, r: 36, embers: 60, boss: true, heavy: true, name: { ko: '불 꺼진 자', en: 'The Unlit' }, desc: { ko: '처음으로 등불을 들고 내려왔던 자. 불이 꺼진 뒤에도 내려가기를 멈추지 않았다.', en: 'The first to carry a lantern down. It kept descending after its flame went out.' } },
  };
  D.BESTIARY = ['creeper', 'mite', 'darter', 'spitter', 'brute', 'nest', 'bomber', 'lurker', 'warden', 'wraith', 'boss1', 'boss2', 'boss3'];

  const POOL = [
    { t: 'creeper', min: 1, w: 10, cost: 1 },
    { t: 'mite', min: 1, w: 5, cost: 1.2, n: 3 },
    { t: 'darter', min: 1, w: 4, cost: 1.5 },
    { t: 'spitter', min: 2, w: 5, cost: 1.8 },
    { t: 'nest', min: 2, w: 1.2, cost: 4 },
    { t: 'brute', min: 2, w: 2, cost: 4 },
    { t: 'bomber', min: 4, w: 4, cost: 1.8 },
    { t: 'lurker', min: 4, w: 4, cost: 2.2 },
    { t: 'warden', min: 5, w: 3, cost: 3 },
    { t: 'wraith', min: 7, w: 4, cost: 2.2 },
  ];
  // Spend a threat budget on a mixed group of shades appropriate for the depth.
  D.composeGroup = function (budget, depth, rnd, opts) {
    const out = [];
    let guard = 40;
    while (budget > 0.5 && guard-- > 0) {
      const avail = POOL.filter((p) => p.min <= depth && p.cost <= budget + 0.4 && !(opts && opts.noStatic && p.t === 'nest'));
      if (!avail.length) break;
      const items = avail.map((p) => ({ p, w: p.t === 'creeper' ? Math.max(3, p.w - depth * 0.8) : p.w }));
      const pick = CD.U.weighted(items, rnd).p;
      for (let i = 0; i < (pick.n || 1); i++) out.push(pick.t);
      budget -= pick.cost;
    }
    if (!out.length) out.push('creeper');
    return out;
  };

  // ---------- boons ----------
  // r: 0 common, 1 uncommon, 2 rare
  const B = (id, r, max, icon, ko, en, dko, den, extra) => Object.assign({ id, r, max, icon, name: { ko, en }, desc: { ko: dko, en: den } }, extra || {});
  D.BOONS = [
    B('kindling', 0, 5, 'flame', '불쏘시개', 'Kindling', '피해 +20%', '+20% damage'),
    B('quickwick', 0, 5, 'bolt', '빠른 심지', 'Quick Wick', '공격 속도 +15%', '+15% fire rate'),
    B('deepoil', 0, 5, 'drop', '깊은 기름통', 'Deep Oil', '최대 불꽃 +20, 즉시 불꽃 20 회복', '+20 max flame and restore 20 flame'),
    B('widelight', 0, 4, 'sun', '넓은 빛', 'Wide Light', '빛의 반경 +12%', '+12% light radius'),
    B('fleetfoot', 0, 4, 'speed', '가벼운 발', 'Fleet Foot', '이동 속도 +8%', '+8% move speed'),
    B('embercall', 0, 3, 'magnet', '불씨 부름', 'Ember Call', '불씨를 끌어당기는 범위 +40%', '+40% ember pickup range'),
    B('thrift', 0, 3, 'gem', '아끼는 손', 'Thrift', '발사에 드는 불꽃 -20%', 'Shots cost 20% less flame'),
    B('slowburn', 0, 3, 'glass', '느린 연소', 'Slow Burn', '불꽃이 저절로 줄어드는 속도 -20%', 'Flame burns down 20% slower'),
    B('hardglass', 0, 4, 'shield', '단단한 유리', 'Hard Glass', '받는 피해 -12%', 'Take 12% less damage'),
    B('split', 1, 3, 'split', '갈라진 불꽃', 'Split Flame', '탄환 +1 (탄환당 피해 -15%)', '+1 projectile (-15% damage each)'),
    B('pierce', 1, 3, 'pierce', '꿰뚫는 빛', 'Piercing Light', '탄환이 적을 1회 더 관통 (뇌광: 연쇄 +1)', 'Shots pierce +1 enemy (Storm: +1 chain)'),
    B('ricochet', 1, 3, 'bounce', '되튀는 불씨', 'Ricochet', '탄환이 벽에서 1회 더 튕김', 'Shots bounce off walls +1 time', { not: 'arc' }),
    B('searing', 1, 3, 'flame', '그을림', 'Searing', '명중한 적을 3초간 불태움 (초당 피해의 30%)', 'Hits ignite for 3s (30% damage per second)'),
    B('cinderburst', 1, 3, 'burst', '재의 폭발', 'Cinderburst', '처치한 적이 폭발해 주변에 피해', 'Slain shades explode, damaging others nearby'),
    B('seeker', 1, 2, 'seek', '쫓는 불씨', 'Seeker', '탄환이 적을 향해 휜다', 'Shots curve toward enemies', { not: 'arc' }),
    B('doubledash', 1, 2, 'dash', '겹 질주', 'Double Dash', '질주 횟수 +1', '+1 dash charge'),
    B('blazetrail', 1, 3, 'dash', '불길 자국', 'Blaze Trail', '질주한 자리에 불길이 남아 적을 태움', 'Dashing leaves a burning trail'),
    B('flarecharge', 1, 3, 'sun', '밝은 섬광', 'Bright Flare', '섬광 재사용 -20%, 범위 +20%', 'Flare: -20% cooldown, +20% radius'),
    B('spark', 1, 4, 'star', '번뜩임', 'Bright Spark', '치명타 확률 +12% (피해 2.2배)', '+12% crit chance (2.2x damage)'),
    B('asheater', 1, 3, 'gem', '불씨 포식', 'Ember Eater', '불씨로 회복하는 불꽃 +25%', 'Embers restore 25% more flame'),
    B('wisp', 1, 3, 'orbit', '도는 도깨비불', 'Orbiting Wisp', '주위를 도는 도깨비불 +1. 적을 태우고 적의 탄을 지운다', '+1 wisp circles you, burning shades and eating their shots'),
    B('dazzle', 1, 2, 'swirl', '눈부심', 'Dazzle', '내 빛 안의 적이 12% 느려짐', 'Shades inside your light are slowed by 12%'),
    B('backdraft', 1, 3, 'thorn', '역화', 'Backdraft', '피격 시 주변에 불길을 터뜨려 반격', 'When hit, erupt in flame around you'),
    B('gravewarmth', 1, 3, 'drop', '무덤의 온기', 'Grave Warmth', '처치 시 6% 확률로 큰 불씨(불꽃 10)', '6% chance for kills to drop a great ember (10 flame)'),
    B('phoenix', 2, 1, 'wing', '불사조의 깃', 'Phoenix Feather', '불꽃이 꺼질 때 한 번, 절반의 불꽃으로 되살아난다', 'Once, when your flame dies, rekindle at half flame'),
    B('chain', 2, 2, 'chain', '번지는 불꽃', 'Chain Spark', '명중 시 주변 적 2명에게 피해의 50%가 번짐', 'Hits arc to 2 nearby shades for 50% damage'),
    B('sunheart', 2, 2, 'sun', '태양의 심장', 'Sunheart', '불꽃이 80% 이상일 때 피해 +35%', '+35% damage while above 80% flame'),
    B('lastlight', 2, 2, 'flame', '마지막 빛', 'Last Light', '불꽃이 30% 미만일 때 공격 속도 +50%, 발사 비용 없음', 'Below 30% flame: +50% fire rate and shots are free'),
    B('beacon', 2, 1, 'brazier', '성화의 맹약', 'Beacon Bond', '불 붙은 화로가 주기적으로 주변 적을 태우고, 회복량이 2배', 'Lit braziers pulse damage at nearby shades and heal twice as much'),
    B('glass', 2, 1, 'star', '유리 대포', 'Glass Cannon', '피해 +60%, 최대 불꽃 -25', '+60% damage, -25 max flame'),
    B('comet', 2, 2, 'dash', '혜성 질주', 'Comet Dash', '질주로 적을 꿰뚫어 큰 피해를 주고 밀쳐낸다', 'Dash through shades to scorch and knock them back'),
    B('nova', 2, 2, 'burst', '신성 섬광', 'Nova Flare', '섬광이 사방으로 불씨 탄환 12발을 쏜다', 'Flare also launches 12 bolts in all directions'),
  ];
  D.BOON = {};
  D.BOONS.forEach((b) => (D.BOON[b.id] = b));
  D.RARITY = [
    { ko: '흔함', en: 'Common', color: '#d8c9b0' },
    { ko: '귀함', en: 'Uncommon', color: '#7fd6ff' },
    { ko: '유물', en: 'Relic', color: '#ffc04d' },
  ];

  D.rollBoons = function (run, n, mode) {
    const weapon = D.LANTERNS[run.lantern].weapon;
    const W = mode === 'relic' ? [0, 30, 70] : mode === 'shrine' ? [0, 62, 38] : [64, 30, 6];
    const pool = D.BOONS.filter((b) => (run.boons[b.id] || 0) < b.max && b.not !== weapon && W[b.r] > 0);
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      const pick = CD.U.weighted(pool.map((b) => ({ b, w: W[b.r] * (run.boons[b.id] ? 1.25 : 1) }))).b;
      out.push(pick.id);
      pool.splice(pool.indexOf(pick), 1);
    }
    return out;
  };

  // ---------- sanctuary (permanent upgrades) ----------
  const M = (id, icon, costs, ko, en, dko, den) => ({ id, icon, costs, name: { ko, en }, desc: { ko: dko, en: den } });
  D.META = [
    M('vitality', 'drop', [20, 40, 70, 110, 160], '깊은 기름통', 'Deeper Well', '최대 불꽃 +10', '+10 max flame'),
    M('potency', 'flame', [25, 50, 85, 130, 190], '단단한 심지', 'Stout Wick', '피해 +6%', '+6% damage'),
    M('brazier', 'brazier', [30, 60, 110], '성화의 가호', 'Brazier Blessing', '화로를 밝힐 때 회복 +10', '+10 flame when lighting a brazier'),
    M('magnet', 'magnet', [20, 45, 80], '불씨의 인력', 'Ember Pull', '불씨 획득 범위 +15%', '+15% ember pickup range'),
    M('dash', 'dash', [35, 70, 120], '잰걸음', 'Light Step', '질주 재사용 -8%', '-8% dash cooldown'),
    M('reroll', 'swirl', [40, 90, 160], '두 번째 불씨', 'Second Spark', '하강마다 은총 다시 뽑기 +1', '+1 boon reroll per descent'),
    M('ashgain', 'ash', [50, 110, 200], '재 수확', 'Ash Harvest', '얻는 재 +15%', '+15% ash gained'),
    M('firstboon', 'star', [150], '첫 불씨', 'First Spark', '무작위 흔한 은총 하나를 지니고 시작', 'Begin each descent with a random common boon'),
  ];
  D.metaLevel = (id) => CD.Save.data.meta[id] || 0;

  D.computeStats = function (run) {
    const L = D.LANTERNS[run.lantern];
    const n = (id) => run.boons[id] || 0;
    const mv = D.metaLevel;
    const s = {};
    s.weapon = L.weapon;
    s.dmg = L.base.dmg * (1 + 0.06 * mv('potency')) * (1 + 0.2 * n('kindling')) * (1 + 0.6 * n('glass')) * Math.pow(0.85, n('split'));
    s.rate = L.base.rate * (1 + 0.15 * n('quickwick'));
    s.cost = L.base.cost * Math.pow(0.8, n('thrift'));
    s.shotSpeed = L.base.speed || 0;
    s.pellets = L.base.pellets || 1;
    s.range = L.base.range || 0;
    s.multishot = n('split');
    s.pierce = n('pierce');
    s.bounce = n('ricochet');
    s.burn = n('searing');
    s.explode = n('cinderburst');
    s.homing = n('seeker');
    s.crit = 0.04 + 0.12 * n('spark');
    s.critMult = 2.2;
    s.arcChain = (L.base.chain || 0) + n('pierce');
    s.chain = n('chain');
    s.maxFlame = Math.max(30, L.base.maxFlame + 10 * mv('vitality') + 20 * n('deepoil') - 25 * n('glass'));
    s.light = 1 + 0.12 * n('widelight');
    s.speed = 235 * (1 + 0.08 * n('fleetfoot'));
    s.pickup = 95 * (1 + 0.15 * mv('magnet')) * (1 + 0.4 * n('embercall'));
    s.emberMul = 1 + 0.25 * n('asheater');
    s.burnRate = 0.4 * Math.pow(0.8, n('slowburn'));
    s.dmgTaken = Math.pow(0.88, n('hardglass')) * (1 + 0.1 * run.gloom);
    s.dashCharges = 1 + n('doubledash');
    s.dashCd = 1.15 * Math.pow(0.92, mv('dash'));
    s.trail = n('blazetrail');
    s.comet = n('comet');
    s.flareCd = 9 * Math.pow(0.8, n('flarecharge'));
    s.flareR = 250 * (1 + 0.2 * n('flarecharge'));
    s.flareDmg = 30 + s.dmg * 2.5;
    s.nova = n('nova');
    s.wisps = n('wisp');
    s.sunheart = n('sunheart');
    s.lastlight = n('lastlight');
    s.beacon = n('beacon');
    s.thorns = n('backdraft');
    s.dazzle = n('dazzle');
    s.bigEmber = 0.06 * n('gravewarmth');
    s.brazierHeal = (35 + 10 * mv('brazier')) * (n('beacon') ? 2 : 1);
    s.ashMul = (1 + 0.15 * mv('ashgain')) * (1 + 0.2 * run.gloom);
    return s;
  };

  // ---------- biomes ----------
  D.BIOMES = [
    { name: { ko: '잿빛 공동', en: 'Ashen Hollows' }, floor: [156, 140, 120], wallTop: [44, 38, 36], face: [112, 98, 84], rim: [190, 170, 142], ambient: [9, 10, 17], fungi: ['#7fe0c0', '#ffd27f'], fog: [255, 190, 130] },
    { name: { ko: '침수 회랑', en: 'Drowned Galleries' }, floor: [112, 142, 148], wallTop: [26, 42, 50], face: [70, 104, 112], rim: [150, 196, 198], ambient: [5, 11, 17], fungi: ['#6fb8ff', '#9affe0'], fog: [150, 210, 255] },
    { name: { ko: '흑요 심장', en: 'Obsidian Heart' }, floor: [146, 120, 150], wallTop: [36, 24, 46], face: [98, 68, 112], rim: [196, 150, 206], ambient: [11, 5, 15], fungi: ['#ff7ad0', '#b48cff'], fog: [255, 150, 220] },
  ];
  D.BOSS_FLOORS = {
    3: { boss: 'boss1', name: { ko: '아귀의 식탁', en: "The Maw's Table" } },
    6: { boss: 'boss2', name: { ko: '과부의 베틀', en: "The Widow's Loom" } },
    9: { boss: 'boss3', name: { ko: '불 꺼진 옥좌', en: 'The Unlit Throne' } },
  };
  D.MAX_DEPTH = 9;
  D.biomeOf = (depth) => Math.min(2, Math.floor((depth - 1) / 3));
  D.depthName = function (depth) {
    const bf = D.BOSS_FLOORS[depth];
    return CD.L(bf ? bf.name : D.BIOMES[D.biomeOf(depth)].name);
  };

  // ---------- achievements ----------
  const Ac = (id, icon, ko, en, dko, den) => ({ id, icon, name: { ko, en }, desc: { ko: dko, en: den } });
  D.ACHS = [
    Ac('first_light', 'brazier', '첫 불', 'First Light', '화로에 처음으로 불을 붙였다', 'Light your first brazier'),
    Ac('maw', 'skull', '아귀를 굶기다', 'Starve the Maw', '어둠아귀를 쓰러뜨렸다', 'Defeat the Gloom Maw'),
    Ac('widow', 'skull', '끊어진 실', 'Cut Thread', '밀랍 과부를 쓰러뜨렸다', 'Defeat the Tallow Widow'),
    Ac('unlit', 'sun', '다시 타오르다', 'Rekindled', '불 꺼진 자를 쓰러뜨리고 심연에 불을 붙였다', 'Defeat the Unlit and relight the deep'),
    Ac('prism_win', 'star', '볕의 증명', 'Proof of Sun', '볕조각 등불로 하강을 완수했다', 'Complete a descent with the Sunshard Lantern'),
    Ac('storm_win', 'bolt', '뇌우의 끝', "Storm's End", '뇌광 등불로 하강을 완수했다', 'Complete a descent with the Storm Lantern'),
    Ac('untouched', 'shield', '그을음 하나 없이', 'Not a Smudge', '피해를 입지 않고 보스를 쓰러뜨렸다', 'Defeat a boss without taking damage'),
    Ac('collector', 'gem', '은총 수집가', 'Boon Collector', '한 번의 하강에서 은총 12개를 모았다', 'Hold 12 boons in a single descent'),
    Ac('slayer', 'flame', '그림자 사냥꾼', 'Shadeslayer', '그림자 1000마리를 처치했다', 'Slay 1000 shades in total'),
    Ac('hoarder', 'ash', '재를 긁어모으는 자', 'Ash Hoarder', '재를 모두 합쳐 500 모았다', 'Gather 500 ash in total'),
    Ac('pilgrim', 'swirl', '순례자', 'Pilgrim', '잊힌 제단에 불꽃을 바쳤다', 'Offer flame at a forgotten altar'),
    Ac('phoenix', 'wing', '재에서', 'From the Ashes', '불사조의 깃으로 되살아났다', 'Rekindle with the Phoenix Feather'),
    Ac('gloom3', 'skull', '더 깊은 어스름', 'Deeper Gloom', '어스름 3단계 이상에서 하강을 완수했다', 'Complete a descent at Gloom 3 or higher'),
    Ac('swift', 'speed', '불붙은 걸음', 'Burning Pace', '20분 안에 하강을 완수했다', 'Complete a descent in under 20 minutes'),
    Ac('familiar', 'glass', '익숙한 어둠', 'Familiar Dark', '열 번 꺼졌다', 'Let your flame die ten times'),
    Ac('devout', 'star', '성소의 주인', 'Keeper of the Sanctuary', '성소 강화 하나를 끝까지 올렸다', 'Max out any sanctuary upgrade'),
  ];
})(window.CD);
