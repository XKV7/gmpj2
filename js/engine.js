// ─────────────── STAT CALCULATION ───────────────
function computeStats(baseStats, level) {
  const hp    = Math.floor((2 * baseStats.hp    * level / 100) + level + 10);
  const calc  = b => Math.floor((2 * b * level / 100) + 5);
  return {
    hp,
    atk:   calc(baseStats.atk),
    def:   calc(baseStats.def),
    spAtk: calc(baseStats.spAtk),
    spDef: calc(baseStats.spDef),
    speed: calc(baseStats.speed)
  };
}

function getLearnedMoves(species, level) {
  const learnset = species.learnset;
  const learned = [];
  const lvKeys = Object.keys(learnset).map(Number).sort((a, b) => a - b);
  for (const lv of lvKeys) {
    if (lv <= level) {
      const batch = Array.isArray(learnset[lv]) ? learnset[lv] : [learnset[lv]];
      for (const m of batch) {
        if (!learned.includes(m)) learned.push(m);
        if (learned.length > 4) learned.shift();
      }
    }
  }
  if (learned.length === 0) learned.push('할퀴기');
  return learned;
}

function createPocketInstance(speciesId, level, isWild = false) {
  const species = SPECIES_DB[speciesId];
  const stats = computeStats(species.baseStats, level);
  const moveNames = getLearnedMoves(species, level);
  return {
    speciesId,
    species,
    level,
    exp: 0,
    stats,
    maxHp: stats.hp,
    currentHp: stats.hp,
    status: null,
    badlyPoisonedTurns: 0,
    moves: moveNames.map(n => ({ ...MOVES_DB[n], currentPp: MOVES_DB[n].pp })),
    isWild
  };
}

// ─────────────── DAMAGE ───────────────
function calculateDamage(attacker, defender, move) {
  const atkStat    = move.category === 'physical' ? attacker.stats.atk   : attacker.stats.spAtk;
  const defStat    = move.category === 'physical' ? defender.stats.def   : defender.stats.spDef;
  const typeM      = getTypeMultiplier(move.type, defender.species.types);
  const base       = ((2 * attacker.level / 5 + 2) * move.power * (atkStat / defStat) / 50 + 2);
  const rand       = Math.random() * 0.15 + 0.85;
  const isCrit     = Math.random() < (1 / 16);
  const critMult   = isCrit ? 1.5 : 1;
  const burnMult   = (attacker.status === '화상' && move.category === 'physical') ? 0.5 : 1;
  const damage     = Math.max(1, Math.floor(base * typeM * rand * critMult * burnMult));
  return { damage, isCrit, typeM };
}

// ─────────────── STATUS ───────────────
function checkStatusBlock(pocket) {
  if (pocket.status === '마비' && Math.random() < 0.25)
    return `${pocket.species.name}은(는) 마비로 움직일 수 없다!`;
  if (pocket.status === '혼란' && Math.random() < 0.33)
    return `${pocket.species.name}은(는) 혼란 상태로 기술을 쓰지 못했다!`;
  return null;
}

function applyStatusDamage(pocket) {
  const msgs = [];
  if (pocket.status === '독') {
    const dmg = Math.max(1, Math.floor(pocket.maxHp / 8));
    pocket.currentHp = Math.max(0, pocket.currentHp - dmg);
    msgs.push(`${pocket.species.name}은(는) 독으로 ${dmg}의 피해를 받았다!`);
  } else if (pocket.status === '맹독') {
    const turns = pocket.badlyPoisonedTurns || 1;
    const dmg = Math.max(1, Math.floor(pocket.maxHp * turns / 16));
    pocket.currentHp = Math.max(0, pocket.currentHp - dmg);
    pocket.badlyPoisonedTurns = Math.min(8, turns + 1);
    msgs.push(`${pocket.species.name}은(는) 맹독으로 ${dmg}의 피해를 받았다! (${turns}/8턴)`);
  } else if (pocket.status === '화상') {
    const dmg = Math.max(1, Math.floor(pocket.maxHp / 16));
    pocket.currentHp = Math.max(0, pocket.currentHp - dmg);
    msgs.push(`${pocket.species.name}은(는) 화상으로 ${dmg}의 피해를 받았다!`);
  }
  return msgs;
}

function tryApplyEffect(move, target) {
  if (!move.effect || !move.effect.status) return null;
  if (target.status) return null;
  if (Math.random() < move.effect.chance) {
    target.status = move.effect.status;
    if (move.effect.status === '맹독') target.badlyPoisonedTurns = 1;
    return `${target.species.name}은(는) ${move.effect.status} 상태가 됐다!`;
  }
  return null;
}

// ─────────────── ACCURACY ───────────────
function checkAccuracy(move) {
  return Math.random() * 100 < move.accuracy;
}

// ─────────────── CATCH ───────────────
function calculateCatchRate(target, ballMultiplier) {
  if (ballMultiplier >= 999) return 1;
  const species  = target.species;
  const base     = species.catchRate;
  const hpRatio  = target.currentHp / target.maxHp;
  const hpFactor = (3 * target.maxHp - 2 * target.currentHp) / (3 * target.maxHp);
  const statusB  = target.status ? 1.5 : 1;
  return Math.min(1, base * hpFactor * ballMultiplier * statusB);
}

// ─────────────── EXP ───────────────
function getExpToNextLevel(level) {
  return Math.floor(Math.pow(level, 3));
}

function getExpGain(defeated) {
  return Math.floor(defeated.species.baseExp * defeated.level / 7);
}

function applyExp(pocket, amount) {
  const results = [];
  pocket.exp += amount;
  while (pocket.level < 100 && pocket.exp >= getExpToNextLevel(pocket.level)) {
    pocket.exp -= getExpToNextLevel(pocket.level);
    pocket.level++;
    const newStats = computeStats(pocket.species.baseStats, pocket.level);
    const hpGain = newStats.hp - pocket.stats.hp;
    pocket.currentHp = Math.min(newStats.hp, pocket.currentHp + hpGain);
    pocket.maxHp = newStats.hp;
    pocket.stats = newStats;

    const learnset = pocket.species.learnset;
    const newMoveNames = learnset[pocket.level]
      ? (Array.isArray(learnset[pocket.level]) ? learnset[pocket.level] : [learnset[pocket.level]])
      : [];

    const autoLearn = [];
    const choiceMoves = [];  // 4칸 꽉 찼을 때 플레이어 선택 필요

    for (const mn of newMoveNames) {
      if (pocket.moves.find(m => m.name === MOVES_DB[mn].name)) continue;
      if (pocket.moves.length < 4) {
        pocket.moves.push({ ...MOVES_DB[mn], currentPp: MOVES_DB[mn].pp });
        autoLearn.push(mn);
      } else {
        choiceMoves.push(mn);
      }
    }
    results.push({ level: pocket.level, autoLearn, choiceMoves });
  }
  return results;
}

// ─────────────── AI ───────────────
function aiChooseMove(enemy, player) {
  const available = enemy.moves.filter(m => m.currentPp > 0);
  if (available.length === 0) return { ...MOVES_DB['발버둥'], currentPp: 999 };
  let best = available[0];
  let bestScore = -1;
  for (const m of available) {
    const typeM = getTypeMultiplier(m.type, player.species.types);
    const score = m.power * typeM;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// ─────────────── WILD GENERATOR ───────────────
function generateWildPocket(areaName) {
  const table = WILD_AREAS[areaName];
  if (!table) return null;
  const entry = table[Math.floor(Math.random() * table.length)];
  const level = entry.minLv + Math.floor(Math.random() * (entry.maxLv - entry.minLv + 1));
  return createPocketInstance(entry.speciesId, level, true);
}

// ─────────────── FLEE CHANCE ───────────────
function fleeSuccess(player, enemy) {
  if (enemy.isWild) {
    const chance = (player.stats.speed * 128 / Math.max(1, enemy.stats.speed) + 30) / 256;
    return Math.random() < Math.min(1, chance);
  }
  return false;
}
