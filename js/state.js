const SAVE_KEY = 'pocketbattle_v1';

// ─────────────── GAME STATE ───────────────
const GS = {
  screen: 'TITLE',   // TITLE | STARTER_SELECT | WORLD | BATTLE | GAMEOVER

  player: {
    name: '플레이어',
    party: [],
    activePocketIdx: 0,
    balls: { 몬스터볼: 5, 슈퍼볼: 0, 하이퍼볼: 0, 마스터볼: 0 },
    defeatedTrainers: new Set()
  },

  world: {
    areaIndex: 0,
    trainerIndex: 0
  },

  // ── battle ──
  battle: null,

  hasSave() { return !!localStorage.getItem(SAVE_KEY); },

  newGame(starterSpeciesId) {
    this.player.party = [createPocketInstance(starterSpeciesId, 5)];
    this.player.activePocketIdx = 0;
    this.player.balls = { 몬스터볼: 5, 슈퍼볼: 0, 하이퍼볼: 0, 마스터볼: 0 };
    this.player.defeatedTrainers = new Set();
    this.world.areaIndex = 0;
    this.world.trainerIndex = 0;
    this.save();
  },

  save() {
    const data = {
      party: this.player.party.map(p => ({
        speciesId: p.speciesId,
        level: p.level,
        exp: p.exp,
        currentHp: p.currentHp,
        status: p.status,
        moves: p.moves.map(m => ({ name: m.name, currentPp: m.currentPp }))
      })),
      activePocketIdx: this.player.activePocketIdx,
      balls: { ...this.player.balls },
      defeatedTrainers: [...this.player.defeatedTrainers],
      world: { ...this.world }
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  },

  load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      const d = JSON.parse(raw);
      this.player.party = d.party.map(pd => {
        const p = createPocketInstance(pd.speciesId, pd.level);
        p.exp = pd.exp;
        p.currentHp = pd.currentHp;
        p.status = pd.status;
        // restore PP
        for (let i = 0; i < p.moves.length && i < pd.moves.length; i++) {
          const sv = pd.moves.find(m => m.name === p.moves[i].name);
          if (sv) p.moves[i].currentPp = sv.currentPp;
        }
        return p;
      });
      this.player.activePocketIdx = d.activePocketIdx || 0;
      this.player.balls = d.balls || { 몬스터볼: 5, 슈퍼볼: 0, 하이퍼볼: 0, 마스터볼: 0 };
      this.player.defeatedTrainers = new Set(d.defeatedTrainers || []);
      this.world = d.world || { areaIndex: 0, trainerIndex: 0 };
      return true;
    } catch (e) {
      return false;
    }
  },

  getActivePlayer() { return this.player.party[this.player.activePocketIdx]; },

  getFirstLivePocket() {
    return this.player.party.find(p => p.currentHp > 0) || null;
  },

  allPartyFainted() {
    return this.player.party.every(p => p.currentHp <= 0);
  },

  currentTrainer() {
    const idx = this.world.trainerIndex;
    return idx < TRAINERS.length ? TRAINERS[idx] : null;
  },

  currentArea() {
    return WORLD_AREAS[this.world.areaIndex];
  }
};

// ─────────────── BATTLE STATE ───────────────
function createBattle(playerPocket, enemy, isWild, trainer) {
  return {
    phase: 'PLAYER_ACTION',
    // PLAYER_ACTION | MOVE_SELECT | SWITCH_SELECT | BALL_SELECT
    // MESSAGING | ENEMY_TURN | END
    player: playerPocket,
    enemy,
    isWild,
    trainer,           // null for wild
    trainerPartyIdx: 0,
    messages: [],
    pendingAfterMsg: null,  // callback after message queue clears
    result: null,           // 'win' | 'lose' | 'flee' | 'catch'
    expPending: [],         // { pocket, amount }
    fleeAttempts: 0
  };
}

function startWildBattle(areaName) {
  const wild = generateWildPocket(areaName);
  const player = GS.getActivePlayer();
  GS.battle = createBattle(player, wild, true, null);
  GS.screen = 'BATTLE';
}

function startTrainerBattle(trainer) {
  const first = createPocketInstance(trainer.party[0].speciesId, trainer.party[0].level);
  const player = GS.getActivePlayer();
  GS.battle = createBattle(player, first, false, trainer);
  GS.battle.trainerPartyIdx = 0;
  GS.screen = 'BATTLE';
}
