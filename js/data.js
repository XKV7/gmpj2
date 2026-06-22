// ─────────────── TYPE CHART ───────────────
const TYPE_CHART = {
  노말:   { 바위: 0.5, 고스트: 0, 강철: 0.5 },
  불꽃:   { 불꽃: 0.5, 물: 0.5, 풀: 2, 얼음: 2, 벌레: 2, 바위: 0.5, 드래곤: 0.5, 강철: 2 },
  물:     { 불꽃: 2, 물: 0.5, 풀: 0.5, 땅: 2, 바위: 2, 드래곤: 0.5 },
  전기:   { 물: 2, 전기: 0.5, 풀: 0.5, 땅: 0, 비행: 2, 드래곤: 0.5 },
  풀:     { 불꽃: 0.5, 물: 2, 풀: 0.5, 독: 0.5, 땅: 2, 비행: 0.5, 벌레: 0.5, 바위: 2, 드래곤: 0.5, 강철: 0.5 },
  얼음:   { 불꽃: 0.5, 물: 0.5, 풀: 2, 얼음: 0.5, 땅: 2, 비행: 2, 드래곤: 2, 강철: 0.5 },
  격투:   { 노말: 2, 얼음: 2, 독: 0.5, 비행: 0.5, 에스퍼: 0.5, 벌레: 0.5, 바위: 2, 고스트: 0, 악: 2, 강철: 2, 페어리: 0.5 },
  독:     { 풀: 2, 독: 0.5, 땅: 0.5, 벌레: 0.5, 바위: 0.5, 고스트: 0.5, 강철: 0, 페어리: 2 },
  땅:     { 불꽃: 2, 전기: 2, 풀: 0.5, 독: 2, 비행: 0, 벌레: 0.5, 바위: 2, 강철: 2 },
  비행:   { 전기: 0.5, 풀: 2, 격투: 2, 벌레: 2, 바위: 0.5, 강철: 0.5 },
  에스퍼: { 격투: 2, 독: 2, 에스퍼: 0.5, 악: 0, 강철: 0.5 },
  벌레:   { 불꽃: 0.5, 풀: 2, 격투: 0.5, 독: 0.5, 비행: 0.5, 에스퍼: 2, 고스트: 0.5, 악: 2, 강철: 0.5, 페어리: 0.5 },
  바위:   { 불꽃: 2, 얼음: 2, 격투: 0.5, 땅: 0.5, 비행: 2, 벌레: 2, 강철: 0.5 },
  고스트: { 노말: 0, 에스퍼: 2, 고스트: 2, 악: 0.5 },
  드래곤: { 드래곤: 2, 강철: 0.5, 페어리: 0 },
  악:     { 격투: 0.5, 에스퍼: 2, 고스트: 2, 악: 0.5, 페어리: 0.5 },
  강철:   { 불꽃: 0.5, 물: 0.5, 전기: 0.5, 얼음: 2, 바위: 2, 강철: 0.5, 페어리: 2 },
  페어리: { 불꽃: 0.5, 독: 0.5, 강철: 0.5, 격투: 2, 드래곤: 2, 악: 2 }
};

function getTypeMultiplier(attackType, defTypes) {
  if (!Array.isArray(defTypes)) defTypes = [defTypes];
  return defTypes.reduce((acc, dt) => acc * (TYPE_CHART[attackType]?.[dt] ?? 1), 1);
}

const TYPE_COLORS = {
  노말: '#9A9A78', 불꽃: '#E8622A', 물: '#4A7CF5', 전기: '#E8C000',
  풀: '#5AAA30', 얼음: '#70C8C8', 격투: '#A02020', 독: '#8830A0',
  땅: '#C8A048', 비행: '#8878E8', 에스퍼: '#E84070', 벌레: '#88A010',
  페어리: '#EE88DD',
  바위: '#A08020', 고스트: '#503878', 드래곤: '#5820E8', 악: '#503830', 강철: '#9898B8'
};

// ─────────────── MOVES ───────────────
const MOVES_DB = {
  할퀴기:      { name: '할퀴기',         type: '노말',   power: 40,  accuracy: 100, pp: 35, category: 'physical', effect: null },
  빠른공격:    { name: '빠른공격',       type: '노말',   power: 40,  accuracy: 100, pp: 30, category: 'physical', effect: null },
  몸통박치기:  { name: '몸통박치기',     type: '노말',   power: 85,  accuracy: 100, pp: 15, category: 'physical', effect: null },
  하이퍼빔:    { name: '하이퍼빔',       type: '노말',   power: 150, accuracy: 90,  pp: 5,  category: 'special',  effect: null },
  화염방사:    { name: '화염방사',       type: '불꽃',   power: 95,  accuracy: 100, pp: 15, category: 'special',  effect: { status: '화상', chance: 0.1 } },
  불꽃세례:    { name: '불꽃세례',       type: '불꽃',   power: 90,  accuracy: 100, pp: 10, category: 'special',  effect: null },
  불꽃펀치:    { name: '불꽃펀치',       type: '불꽃',   power: 75,  accuracy: 100, pp: 15, category: 'physical', effect: { status: '화상', chance: 0.1 } },
  매지컬파이어:{ name: '매지컬파이어',   type: '불꽃',   power: 75,  accuracy: 100, pp: 10, category: 'special',  effect: { status: '화상', chance: 0.1 } },
  물대포:      { name: '물대포',         type: '물',     power: 80,  accuracy: 100, pp: 15, category: 'special',  effect: null },
  파도타기:    { name: '파도타기',       type: '물',     power: 90,  accuracy: 100, pp: 15, category: 'special',  effect: null },
  물기:        { name: '물기',           type: '물',     power: 60,  accuracy: 100, pp: 25, category: 'physical', effect: null },
  수중폭탄:    { name: '수중폭탄',       type: '물',     power: 110, accuracy: 80,  pp: 5,  category: 'special',  effect: null },
  솔라빔:      { name: '솔라빔',         type: '풀',     power: 120, accuracy: 100, pp: 10, category: 'special',  effect: null },
  잎날가르기:  { name: '잎날가르기',     type: '풀',     power: 70,  accuracy: 100, pp: 15, category: 'physical', effect: null },
  풀묶기:      { name: '풀묶기',         type: '풀',     power: 65,  accuracy: 95,  pp: 20, category: 'special',  effect: { status: '마비', chance: 0.1 } },
  에너지볼:    { name: '에너지볼',       type: '풀',     power: 90,  accuracy: 100, pp: 10, category: 'special',  effect: null },
  '10만볼트':  { name: '10만볼트',       type: '전기',   power: 90,  accuracy: 100, pp: 15, category: 'special',  effect: { status: '마비', chance: 0.1 } },
  번개:        { name: '번개',           type: '전기',   power: 110, accuracy: 70,  pp: 10, category: 'special',  effect: { status: '마비', chance: 0.3 } },
  전기충격:    { name: '전기충격',       type: '전기',   power: 40,  accuracy: 100, pp: 30, category: 'special',  effect: { status: '마비', chance: 0.1 } },
  볼트태클:    { name: '볼트태클',       type: '전기',   power: 120, accuracy: 100, pp: 15, category: 'physical', effect: null },
  눈보라:      { name: '눈보라',         type: '얼음',   power: 110, accuracy: 70,  pp: 5,  category: 'special',  effect: null },
  얼음빔:      { name: '얼음빔',         type: '얼음',   power: 90,  accuracy: 100, pp: 10, category: 'special',  effect: null },
  냉동펀치:    { name: '냉동펀치',       type: '얼음',   power: 75,  accuracy: 100, pp: 15, category: 'physical', effect: null },
  스톤에지:    { name: '스톤에지',       type: '바위',   power: 100, accuracy: 80,  pp: 5,  category: 'physical', effect: null },
  바위깨기:    { name: '바위깨기',       type: '바위',   power: 75,  accuracy: 90,  pp: 15, category: 'physical', effect: null },
  돌떨구기:    { name: '돌떨구기',       type: '바위',   power: 50,  accuracy: 90,  pp: 15, category: 'physical', effect: null },
  메가톤킥:    { name: '메가톤킥',       type: '격투',   power: 120, accuracy: 75,  pp: 5,  category: 'physical', effect: null },
  십자초퍼:    { name: '십자초퍼',       type: '격투',   power: 100, accuracy: 100, pp: 5,  category: 'physical', effect: null },
  발차기:      { name: '발차기',         type: '격투',   power: 65,  accuracy: 100, pp: 25, category: 'physical', effect: null },
  독침:        { name: '독침',           type: '독',     power: 15,  accuracy: 100, pp: 35, category: 'physical', effect: { status: '독', chance: 1.0 } },
  독가스:      { name: '독가스',         type: '독',     power: 65,  accuracy: 100, pp: 20, category: 'special',  effect: { status: '독', chance: 0.3 } },
  산성:        { name: '산성',           type: '독',     power: 40,  accuracy: 100, pp: 30, category: 'special',  effect: { status: '독', chance: 0.3 } },
  지진:        { name: '지진',           type: '땅',     power: 100, accuracy: 100, pp: 10, category: 'physical', effect: null },
  땅파기:      { name: '땅파기',         type: '땅',     power: 80,  accuracy: 100, pp: 10, category: 'physical', effect: null },
  에어슬래시:  { name: '에어슬래시',     type: '비행',   power: 75,  accuracy: 95,  pp: 15, category: 'special',  effect: null },
  날개치기:    { name: '날개치기',       type: '비행',   power: 60,  accuracy: 100, pp: 35, category: 'physical', effect: null },
  사이코키네시스:{ name: '사이코키네시스', type: '에스퍼', power: 90,  accuracy: 100, pp: 10, category: 'special',  effect: null },
  사이코쇼크:  { name: '사이코쇼크',     type: '에스퍼', power: 80,  accuracy: 100, pp: 10, category: 'special',  effect: null },
  벌레의야단법석:{ name: '벌레의야단법석', type: '벌레',  power: 90,  accuracy: 100, pp: 10, category: 'physical', effect: null },
  메가드레인:  { name: '메가드레인',     type: '벌레',   power: 40,  accuracy: 100, pp: 15, category: 'special',  effect: null },
  섀도볼:      { name: '섀도볼',         type: '고스트', power: 80,  accuracy: 100, pp: 15, category: 'special',  effect: null },
  나이트헤드:  { name: '나이트헤드',     type: '고스트', power: 60,  accuracy: 100, pp: 15, category: 'special',  effect: null },
  드래곤크루:  { name: '드래곤크루',     type: '드래곤', power: 120, accuracy: 100, pp: 5,  category: 'physical', effect: null },
  드래곤브레스:{ name: '드래곤브레스',   type: '드래곤', power: 60,  accuracy: 100, pp: 20, category: 'special',  effect: { status: '마비', chance: 0.3 } },
  암흑파:      { name: '암흑파',         type: '악',     power: 80,  accuracy: 100, pp: 15, category: 'special',  effect: null },
  물어뜯기:    { name: '물어뜯기',       type: '악',     power: 60,  accuracy: 100, pp: 25, category: 'physical', effect: null },
  아이언헤드:  { name: '아이언헤드',     type: '강철',   power: 80,  accuracy: 100, pp: 15, category: 'physical', effect: null },
  강철날개:    { name: '강철날개',       type: '강철',   power: 70,  accuracy: 90,  pp: 25, category: 'physical', effect: null },
  발버둥:      { name: '발버둥',         type: '노말',   power: 50,  accuracy: 100, pp: 999, category: 'physical', effect: null, isStruggle: true },
  // 맹독
  독독:        { name: '독독',           type: '독',     power: 0,   accuracy: 90,  pp: 10, category: 'status',   effect: { status: '맹독', chance: 1.0 } },
  // 페어리
  페어리윈드:  { name: '페어리윈드',     type: '페어리', power: 40,  accuracy: 100, pp: 30, category: 'special',  effect: null },
  문포스:      { name: '문포스',         type: '페어리', power: 95,  accuracy: 100, pp: 15, category: 'special',  effect: null },
  매지컬샤인:  { name: '매지컬샤인',     type: '페어리', power: 80,  accuracy: 100, pp: 10, category: 'special',  effect: null },
  나이트슬래시:{ name: '나이트슬래시',   type: '페어리', power: 70,  accuracy: 100, pp: 15, category: 'physical', effect: null }
};

// ─────────────── SPECIES ───────────────
const SPECIES_DB = {
  플라무: {
    id: 1, name: '플라무', types: ['불꽃'],
    baseStats: { hp: 45, atk: 52, def: 43, spAtk: 60, spDef: 50, speed: 65 },
    baseExp: 64, catchRate: 0.45, color: '#E8622A', emoji: '🔥',
    learnset: { 1: ['할퀴기', '불꽃세례'], 10: ['불꽃펀치'], 20: ['화염방사'], 30: ['매지컬파이어'], 40: ['하이퍼빔'] }
  },
  플라이온: {
    id: 2, name: '플라이온', types: ['불꽃', '비행'],
    baseStats: { hp: 78, atk: 84, def: 78, spAtk: 109, spDef: 85, speed: 100 },
    baseExp: 240, catchRate: 0.05, color: '#F05010', emoji: '🦅',
    learnset: { 1: ['날개치기', '할퀴기'], 15: ['불꽃세례'], 25: ['에어슬래시'], 35: ['화염방사'], 45: ['매지컬파이어'] }
  },
  아쿠아: {
    id: 3, name: '아쿠아', types: ['물'],
    baseStats: { hp: 44, atk: 48, def: 65, spAtk: 50, spDef: 64, speed: 43 },
    baseExp: 63, catchRate: 0.45, color: '#4A7CF5', emoji: '💧',
    learnset: { 1: ['물기', '빠른공격'], 10: ['물대포'], 20: ['파도타기'], 30: ['수중폭탄'], 40: ['하이퍼빔'] }
  },
  리프트: {
    id: 4, name: '리프트', types: ['풀'],
    baseStats: { hp: 45, atk: 49, def: 49, spAtk: 65, spDef: 65, speed: 45 },
    baseExp: 64, catchRate: 0.45, color: '#5AAA30', emoji: '🌿',
    learnset: { 1: ['할퀴기', '풀묶기'], 10: ['잎날가르기'], 20: ['에너지볼'], 30: ['솔라빔'], 40: ['하이퍼빔'] }
  },
  볼티: {
    id: 5, name: '볼티', types: ['전기'],
    baseStats: { hp: 35, atk: 55, def: 30, spAtk: 50, spDef: 40, speed: 90 },
    baseExp: 82, catchRate: 0.20, color: '#E8C000', emoji: '⚡',
    learnset: { 1: ['전기충격', '빠른공격'], 10: ['10만볼트'], 20: ['번개'], 30: ['볼트태클'], 40: ['하이퍼빔'] }
  },
  스톤크: {
    id: 6, name: '스톤크', types: ['바위', '땅'],
    baseStats: { hp: 80, atk: 110, def: 130, spAtk: 55, spDef: 65, speed: 45 },
    baseExp: 164, catchRate: 0.20, color: '#A08020', emoji: '🪨',
    learnset: { 1: ['몸통박치기', '돌떨구기'], 10: ['바위깨기'], 20: ['땅파기'], 30: ['스톤에지'], 40: ['지진'] }
  },
  윙글: {
    id: 7, name: '윙글', types: ['비행', '노말'],
    baseStats: { hp: 40, atk: 45, def: 40, spAtk: 35, spDef: 35, speed: 56 },
    baseExp: 50, catchRate: 0.55, color: '#8878E8', emoji: '🦜',
    learnset: { 1: ['날개치기', '빠른공격'], 10: ['에어슬래시'], 20: ['몸통박치기'], 30: ['강철날개'], 40: ['하이퍼빔'] }
  },
  독침이: {
    id: 8, name: '독침이', types: ['독', '벌레'],
    baseStats: { hp: 40, atk: 35, def: 30, spAtk: 45, spDef: 40, speed: 75 },
    baseExp: 52, catchRate: 0.55, color: '#8830A0', emoji: '🐛',
    learnset: { 1: ['독침', '할퀴기'], 10: ['독가스'], 20: ['산성'], 30: ['벌레의야단법석'], 40: ['메가드레인'] }
  },
  프로스트: {
    id: 9, name: '프로스트', types: ['얼음'],
    baseStats: { hp: 70, atk: 75, def: 80, spAtk: 70, spDef: 80, speed: 40 },
    baseExp: 120, catchRate: 0.25, color: '#70C8C8', emoji: '❄️',
    learnset: { 1: ['몸통박치기', '빠른공격'], 10: ['얼음빔'], 20: ['냉동펀치'], 30: ['눈보라'], 40: ['하이퍼빔'] }
  },
  고블린: {
    id: 10, name: '고블린', types: ['악'],
    baseStats: { hp: 60, atk: 85, def: 50, spAtk: 70, spDef: 55, speed: 80 },
    baseExp: 90, catchRate: 0.30, color: '#503830', emoji: '👺',
    learnset: { 1: ['물어뜯기', '빠른공격'], 10: ['암흑파'], 20: ['물어뜯기'], 30: ['암흑파'], 40: ['하이퍼빔'] }
  },
  스틸론: {
    id: 11, name: '스틸론', types: ['강철'],
    baseStats: { hp: 65, atk: 80, def: 140, spAtk: 40, spDef: 70, speed: 30 },
    baseExp: 130, catchRate: 0.15, color: '#9898B8', emoji: '⚙️',
    learnset: { 1: ['몸통박치기', '할퀴기'], 10: ['강철날개'], 20: ['아이언헤드'], 30: ['바위깨기'], 40: ['하이퍼빔'] }
  },
  드라코: {
    id: 12, name: '드라코', types: ['드래곤'],
    baseStats: { hp: 91, atk: 134, def: 95, spAtk: 100, spDef: 100, speed: 80 },
    baseExp: 270, catchRate: 0.05, color: '#5820E8', emoji: '🐉',
    learnset: { 1: ['몸통박치기', '할퀴기'], 20: ['드래곤브레스'], 35: ['드래곤크루'], 50: ['하이퍼빔'] }
  },
  고스파: {
    id: 13, name: '고스파', types: ['고스트'],
    baseStats: { hp: 60, atk: 65, def: 60, spAtk: 130, spDef: 75, speed: 110 },
    baseExp: 145, catchRate: 0.15, color: '#503878', emoji: '👻',
    learnset: { 1: ['나이트헤드', '할퀴기'], 10: ['섀도볼'], 20: ['암흑파'], 30: ['사이코쇼크'], 40: ['하이퍼빔'] }
  },
  글레이브: {
    id: 14, name: '글레이브', types: ['격투'],
    baseStats: { hp: 90, atk: 130, def: 80, spAtk: 65, spDef: 85, speed: 55 },
    baseExp: 155, catchRate: 0.20, color: '#A02020', emoji: '🥊',
    learnset: { 1: ['발차기', '빠른공격'], 10: ['십자초퍼'], 20: ['메가톤킥'], 30: ['몸통박치기'], 40: ['하이퍼빔'] }
  },
  에스페라: {
    id: 15, name: '에스페라', types: ['에스퍼'],
    baseStats: { hp: 65, atk: 65, def: 60, spAtk: 130, spDef: 95, speed: 110 },
    baseExp: 160, catchRate: 0.15, color: '#E84070', emoji: '🔮',
    learnset: { 1: ['할퀴기', '빠른공격'], 10: ['사이코쇼크'], 20: ['사이코키네시스'], 30: ['암흑파'], 40: ['하이퍼빔'] }
  },
  요정: {
    id: 16, name: '요정', types: ['페어리'],
    baseStats: { hp: 68, atk: 42, def: 62, spAtk: 108, spDef: 92, speed: 78 },
    baseExp: 135, catchRate: 0.20, color: '#EE88DD', emoji: '✨',
    learnset: { 1: ['페어리윈드', '빠른공격'], 12: ['매지컬샤인'], 24: ['문포스'], 36: ['독독'], 45: ['하이퍼빔'] }
  },
  엔젤: {
    id: 17, name: '엔젤', types: ['페어리', '비행'],
    baseStats: { hp: 52, atk: 38, def: 52, spAtk: 98, spDef: 88, speed: 92 },
    baseExp: 118, catchRate: 0.25, color: '#FFAAE0', emoji: '🧚',
    learnset: { 1: ['날개치기', '페어리윈드'], 10: ['에어슬래시'], 20: ['매지컬샤인'], 32: ['문포스'], 42: ['하이퍼빔'] }
  }
};

const STARTERS = ['플라무', '아쿠아', '리프트'];

// ─────────────── TRAINERS ───────────────
const TRAINERS = [
  { id: 0, name: '초보 트레이너 민준', party: [{ speciesId: '볼티', level: 5 }, { speciesId: '윙글', level: 5 }] },
  { id: 1, name: '트레이너 지아',       party: [{ speciesId: '독침이', level: 12 }, { speciesId: '스톤크', level: 12 }] },
  { id: 2, name: '강호 레인저 수호',    party: [{ speciesId: '프로스트', level: 22 }, { speciesId: '글레이브', level: 22 }] },
  { id: 3, name: '매직 마스터 나은',    party: [{ speciesId: '에스페라', level: 32 }, { speciesId: '고스파', level: 30 }] },
  { id: 4, name: '엘리트 챔피언 이온',  party: [{ speciesId: '드라코', level: 45 }, { speciesId: '에스페라', level: 40 }, { speciesId: '스틸론', level: 38 }] }
];

// ─────────────── WILD AREAS ───────────────
const WILD_AREAS = {
  '초원 지대': [
    { speciesId: '윙글',   minLv: 2,  maxLv: 8  },
    { speciesId: '독침이', minLv: 2,  maxLv: 8  },
    { speciesId: '리프트', minLv: 3,  maxLv: 8  },
    { speciesId: '볼티',   minLv: 3,  maxLv: 8  },
    { speciesId: '엔젤',   minLv: 3,  maxLv: 9  }
  ],
  '화산 동굴': [
    { speciesId: '플라무', minLv: 10, maxLv: 20 },
    { speciesId: '스톤크', minLv: 12, maxLv: 22 },
    { speciesId: '스틸론', minLv: 15, maxLv: 25 }
  ],
  '깊은 바다': [
    { speciesId: '아쿠아',   minLv: 15, maxLv: 28 },
    { speciesId: '프로스트', minLv: 18, maxLv: 30 }
  ],
  '유령 숲': [
    { speciesId: '고스파',  minLv: 20, maxLv: 35 },
    { speciesId: '고블린',  minLv: 20, maxLv: 32 },
    { speciesId: '요정',    minLv: 18, maxLv: 30 }
  ],
  '드래곤 산맥': [
    { speciesId: '드라코',   minLv: 35, maxLv: 55 },
    { speciesId: '에스페라', minLv: 30, maxLv: 45 },
    { speciesId: '글레이브', minLv: 28, maxLv: 42 }
  ]
};

const WORLD_AREAS = ['초원 지대', '화산 동굴', '깊은 바다', '유령 숲', '드래곤 산맥'];

// ─────────────── POKEBALLS ───────────────
const POKEBALLS = {
  몬스터볼: { name: '몬스터볼', multiplier: 1.0, color: '#DD2222' },
  슈퍼볼:   { name: '슈퍼볼',   multiplier: 1.5, color: '#4444EE' },
  하이퍼볼: { name: '하이퍼볼', multiplier: 2.0, color: '#DDAA00' },
  마스터볼: { name: '마스터볼', multiplier: 999, color: '#8844CC' }
};

const STATUS_COLORS = {
  독: '#A040A0', 맹독: '#6600CC', 화상: '#E86020', 마비: '#E8C000', 혼란: '#F080C0'
};