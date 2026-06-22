// ─────────────── CANVAS & INPUT ───────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

const input = {
  mx: 0, my: 0, clicked: false,
  isHover(x, y, w, h) { return this.mx >= x && this.mx <= x+w && this.my >= y && this.my <= y+h; },
  wasClicked(x, y, w, h) { return this.clicked && this.isHover(x, y, w, h); }
};

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  input.mx = (e.clientX - r.left) * (800 / r.width);
  input.my = (e.clientY - r.top)  * (600 / r.height);
});
canvas.addEventListener('click', e => {
  const r = canvas.getBoundingClientRect();
  input.mx = (e.clientX - r.left) * (800 / r.width);
  input.my = (e.clientY - r.top)  * (600 / r.height);
  input.clicked = true;
  handleClick();
  input.clicked = false;
});

// ─────────────── GAME LOOP ───────────────
function loop() {
  ctx.clearRect(0, 0, 800, 600);
  switch (GS.screen) {
    case 'TITLE':          renderTitle(ctx, input);         break;
    case 'STARTER_SELECT': renderStarterSelect(ctx, input); break;
    case 'WORLD':          renderWorld(ctx, input);         break;
    case 'BATTLE':         renderBattle(ctx, input);        break;
    case 'GAMEOVER':       renderGameOver(ctx, input);      break;
  }
  requestAnimationFrame(loop);
}

// ─────────────── CLICK HANDLER ───────────────
function handleClick() {
  switch (GS.screen) {
    case 'TITLE':          handleTitleClick();         break;
    case 'STARTER_SELECT': handleStarterClick();       break;
    case 'WORLD':          handleWorldClick();         break;
    case 'BATTLE':         handleBattleClick();        break;
    case 'GAMEOVER':       handleGameOverClick();      break;
  }
}

// ─── TITLE ───
function handleTitleClick() {
  const hasSave = GS.hasSave();
  const btnW = 260, btnH = 54;
  const startY = hasSave ? 290 : 320;

  if (input.wasClicked(400 - btnW/2, startY, btnW, btnH)) {
    GS.screen = 'STARTER_SELECT';
    return;
  }
  if (hasSave && input.wasClicked(400 - btnW/2, startY + 70, btnW, btnH)) {
    if (GS.load()) GS.screen = 'WORLD';
    return;
  }
}

// ─── STARTER SELECT ───
function handleStarterClick() {
  const positions = [160, 400, 640];
  for (let i = 0; i < STARTERS.length; i++) {
    const cx = positions[i];
    if (input.wasClicked(cx - 100, 140, 200, 280)) {
      GS.newGame(STARTERS[i]);
      GS.screen = 'WORLD';
      return;
    }
  }
}

// ─── WORLD ───
function handleWorldClick() {
  const rx = 400, bx = rx + 20, btnW = 340, btnH = 50;
  const canExplore = GS.player.party.some(p => p.currentHp > 0);

  if (canExplore && input.wasClicked(bx, 120, btnW, btnH)) {
    startWildBattle(GS.currentArea());
    return;
  }

  const trainer = GS.currentTrainer();
  const trainerAvail = trainer && !GS.player.defeatedTrainers.has(trainer.id) && canExplore;
  if (trainerAvail && input.wasClicked(bx, 185, btnW, btnH)) {
    startTrainerBattle(trainer);
    return;
  }

  if (GS.world.areaIndex < WORLD_AREAS.length - 1 && canExplore && input.wasClicked(bx, 250, btnW, btnH)) {
    GS.world.areaIndex++;
    GS.save();
    return;
  }

  if (GS.world.areaIndex > 0 && input.wasClicked(bx + 180, 400, 160, 46)) {
    GS.world.areaIndex--;
    GS.save();
    return;
  }

  if (input.wasClicked(bx, 400, 160, 46)) {
    GS.save();
    return;
  }
}

// ─── BATTLE ───
function handleBattleClick() {
  const b = GS.battle;
  if (!b) return;

  switch (b.phase) {
    case 'PLAYER_ACTION': handleActionClick(b); break;
    case 'MOVE_SELECT':   handleMoveClick(b);   break;
    case 'SWITCH_SELECT': handleSwitchClick(b); break;
    case 'BALL_SELECT':   handleBallClick(b);   break;
    case 'MESSAGING':     advanceMessage(b);    break;
    case 'END':           handleEndClick(b);    break;
  }
}

function handleActionClick(b) {
  const bw = 180, bh = 56;
  const col1 = 410, col2 = 605;
  const row1 = PANEL_Y + 125, row2 = PANEL_Y + 192;

  if (input.wasClicked(col1, row1, bw, bh)) { b.phase = 'MOVE_SELECT'; return; }
  if (input.wasClicked(col2, row1, bw, bh)) { b.phase = 'SWITCH_SELECT'; return; }
  if (b.isWild && input.wasClicked(col1, row2, bw, bh)) { b.phase = 'BALL_SELECT'; return; }
  if (input.wasClicked(col2, row2, bw, bh)) {
    if (b.isWild) {
      attemptFlee(b);
    } else {
      // Trainer battle: forfeit = lose
      b.result = 'lose';
      b._endMsg = '배틀을 포기했다.';
      b.phase = 'END';
    }
    return;
  }
}

function handleMoveClick(b) {
  const pocket = b.player;
  const bw = 185, bh = 56;
  const positions = [
    [10, PANEL_Y + 120], [205, PANEL_Y + 120],
    [10, PANEL_Y + 186], [205, PANEL_Y + 186]
  ];

  // Back
  if (input.wasClicked(400, PANEL_Y + 125, 380, 110)) { b.phase = 'PLAYER_ACTION'; return; }

  pocket.moves.forEach((move, i) => {
    if (!positions[i]) return;
    const [mx, my] = positions[i];
    if (move.currentPp > 0 && input.wasClicked(mx, my, bw, bh)) {
      executePlayerMove(b, move);
    }
  });
}

function handleSwitchClick(b) {
  const cols = 3;
  GS.player.party.forEach((p, i) => {
    const px = 20 + (i % cols) * 258;
    const py = PANEL_Y + 45 + Math.floor(i / cols) * 78;
    if (p.currentHp > 0 && i !== GS.player.activePocketIdx && input.wasClicked(px, py, 248, 68)) {
      executeSwitch(b, i);
    }
  });
  if (input.wasClicked(630, PANEL_Y + 208, 150, 36)) { b.phase = 'PLAYER_ACTION'; }
}

function handleBallClick(b) {
  let bxi = 0;
  for (const [name, count] of Object.entries(GS.player.balls)) {
    const bx = 20 + (bxi % 2) * 390;
    const by = PANEL_Y + 45 + Math.floor(bxi / 2) * 76;
    if (count > 0 && input.wasClicked(bx, by, 370, 66)) {
      attemptCatch(b, name);
      return;
    }
    bxi++;
  }
  if (input.wasClicked(630, PANEL_Y + 208, 150, 36)) { b.phase = 'PLAYER_ACTION'; }
}

function handleEndClick(b) {
  if (input.wasClicked(250, PANEL_Y + 140, 300, 50)) {
    if (b.result === 'lose') {
      // Save final party snapshot for game over screen, then wipe save
      GS._gameOverParty = GS.player.party.map(p => ({
        name: p.species.name, emoji: p.species.emoji, color: p.species.color,
        level: p.level, maxHp: p.maxHp, status: p.status,
        types: p.species.types
      }));
      GS._gameOverArea = GS.currentArea();
      GS._gameOverTrainers = GS.player.defeatedTrainers.size;
      localStorage.removeItem(SAVE_KEY);
      GS.battle = null;
      GS.screen = 'GAMEOVER';
      return;
    }
    GS.battle = null;
    GS.screen = 'WORLD';
    GS.save();
  }
}

function handleGameOverClick() {
  if (input.wasClicked(300, 530, 200, 50)) {
    GS._gameOverParty = null;
    GS.screen = 'TITLE';
  }
}

// ─────────────── BATTLE LOGIC ───────────────

function queueMessages(b, msgs, afterFn) {
  b.messages = Array.isArray(msgs) ? msgs : [msgs];
  b._msgIdx = 0;
  b.pendingAfterMsg = afterFn || null;
  b.phase = 'MESSAGING';
}

function advanceMessage(b) {
  b._msgIdx = (b._msgIdx || 0) + 1;
  if (b._msgIdx >= b.messages.length) {
    b.phase = 'PLAYER_ACTION'; // temporary
    const fn = b.pendingAfterMsg;
    b.pendingAfterMsg = null;
    if (fn) fn();
  }
}

function executePlayerMove(b, move) {
  move.currentPp = Math.max(0, move.currentPp - 1);
  const msgs = [];
  msgs.push(`${b.player.species.name}의 ${move.name}!`);

  const blocked = checkStatusBlock(b.player);
  if (blocked) {
    msgs.push(blocked);
    queueMessages(b, msgs, () => enemyTurn(b));
    return;
  }

  if (!checkAccuracy(move)) {
    msgs.push('기술이 빗나갔다!');
    queueMessages(b, msgs, () => enemyTurn(b));
    return;
  }

  const { damage, isCrit, typeM } = calculateDamage(b.player, b.enemy, move);
  b.enemy.currentHp = Math.max(0, b.enemy.currentHp - damage);

  if (typeM >= 2)   msgs.push('효과가 뛰어나다!');
  if (typeM <= 0)   msgs.push('효과가 없는 것 같다...');
  if (typeM > 0 && typeM < 1) msgs.push('효과가 적은 것 같다...');
  if (isCrit)       msgs.push('급소에 맞았다!');
  msgs.push(`${b.enemy.species.name}에게 ${damage}의 피해!`);

  const effectMsg = tryApplyEffect(move, b.enemy);
  if (effectMsg) msgs.push(effectMsg);

  if (b.enemy.currentHp <= 0) {
    msgs.push(`${b.enemy.species.name}이(가) 쓰러졌다!`);
    queueMessages(b, msgs, () => handleEnemyFaint(b));
  } else {
    queueMessages(b, msgs, () => enemyTurn(b));
  }
}

function executeSwitch(b, newIdx) {
  const oldName = b.player.species.name;
  GS.player.activePocketIdx = newIdx;
  b.player = GS.player.party[newIdx];
  const msgs = [`${oldName}은(는) 돌아와!`, `${b.player.species.name}! 나가줘!`];

  // Switching gives enemy a free attack
  queueMessages(b, msgs, () => enemyTurn(b));
}

function attemptFlee(b) {
  b.fleeAttempts = (b.fleeAttempts || 0) + 1;
  if (fleeSuccess(b.player, b.enemy)) {
    b.result = 'flee';
    b._endMsg = '도망치는 데 성공했다!';
    b.phase = 'END';
  } else {
    queueMessages(b, '도망치지 못했다!', () => enemyTurn(b));
  }
}

function attemptCatch(b, ballName) {
  GS.player.balls[ballName]--;
  const ball = POKEBALLS[ballName];
  const rate = calculateCatchRate(b.enemy, ball.multiplier);
  const msgs = [`${ballName}을 던졌다!`];

  if (Math.random() < rate) {
    msgs.push(`${b.enemy.species.name}을(를) 잡았다!`);
    b.enemy.isWild = false;

    if (GS.player.party.length < 6) {
      GS.player.party.push(b.enemy);
      msgs.push(`${b.enemy.species.name}이(가) 파티에 합류했다!`);
    } else {
      msgs.push(`파티가 가득 차 ${b.enemy.species.name}은(는) 놓아줬다.`);
    }

    b.result = 'catch';
    b._endMsg = `${b.enemy.species.name} 포획 완료!`;
    queueMessages(b, msgs, () => { b.phase = 'END'; });
  } else {
    msgs.push(`${b.enemy.species.name}이(가) 볼에서 빠져나왔다!`);
    queueMessages(b, msgs, () => enemyTurn(b));
  }
}

function enemyTurn(b) {
  if (b.enemy.currentHp <= 0 || b.player.currentHp <= 0) {
    checkBattleEnd(b);
    return;
  }

  const move = aiChooseMove(b.enemy, b.player);
  const msgs = [];
  msgs.push(`상대의 ${b.enemy.species.name}의 ${move.name}!`);

  const blocked = checkStatusBlock(b.enemy);
  if (blocked) {
    msgs.push(blocked);
    queueMessages(b, msgs, () => endOfTurn(b));
    return;
  }

  if (!checkAccuracy(move)) {
    msgs.push('기술이 빗나갔다!');
    queueMessages(b, msgs, () => endOfTurn(b));
    return;
  }

  if (!move.isStruggle) move.currentPp = Math.max(0, move.currentPp - 1);

  const { damage, isCrit, typeM } = calculateDamage(b.enemy, b.player, move);
  b.player.currentHp = Math.max(0, b.player.currentHp - damage);

  if (typeM >= 2)       msgs.push('효과가 뛰어나다!');
  if (typeM <= 0)       msgs.push('효과가 없는 것 같다...');
  if (typeM > 0 && typeM < 1) msgs.push('효과가 적은 것 같다...');
  if (isCrit)           msgs.push('급소에 맞았다!');
  msgs.push(`${b.player.species.name}에게 ${damage}의 피해!`);

  const effectMsg = tryApplyEffect(move, b.player);
  if (effectMsg) msgs.push(effectMsg);

  if (b.player.currentHp <= 0) {
    msgs.push(`${b.player.species.name}이(가) 쓰러졌다!`);
    queueMessages(b, msgs, () => handlePlayerFaint(b));
  } else {
    queueMessages(b, msgs, () => endOfTurn(b));
  }
}

function endOfTurn(b) {
  const msgs = [];
  // Apply status damage to both
  const pm = applyStatusDamage(b.player);
  const em = applyStatusDamage(b.enemy);
  msgs.push(...pm, ...em);

  if (b.player.currentHp <= 0) {
    msgs.push(`${b.player.species.name}이(가) 쓰러졌다!`);
    if (msgs.length > 0) {
      queueMessages(b, msgs, () => handlePlayerFaint(b));
    } else {
      handlePlayerFaint(b);
    }
    return;
  }
  if (b.enemy.currentHp <= 0) {
    msgs.push(`${b.enemy.species.name}이(가) 쓰러졌다!`);
    if (msgs.length > 0) {
      queueMessages(b, msgs, () => handleEnemyFaint(b));
    } else {
      handleEnemyFaint(b);
    }
    return;
  }

  if (msgs.length > 0) {
    queueMessages(b, msgs, () => { b.phase = 'PLAYER_ACTION'; });
  } else {
    b.phase = 'PLAYER_ACTION';
  }
}

function handlePlayerFaint(b) {
  // Check if any alive pocket exists
  const nextIdx = GS.player.party.findIndex((p, i) => p.currentHp > 0 && i !== GS.player.activePocketIdx);
  if (nextIdx === -1) {
    // All fainted
    b.result = 'lose';
    b._endMsg = '모든 포켓이 쓰러졌다!';
    b.phase = 'END';
  } else {
    // Force switch
    queueMessages(b, `${b.player.species.name}이(가) 쓰러졌다! 다음 포켓을 선택하세요.`, () => {
      b.phase = 'SWITCH_SELECT';
    });
  }
}

function handleEnemyFaint(b) {
  const msgs = [];
  // Grant exp to active player
  const expGained = getExpGain(b.enemy);
  msgs.push(`${b.player.species.name}은(는) ${expGained} 경험치를 획득했다!`);
  const levelUps = applyExp(b.player, expGained);
  for (const lu of levelUps) {
    msgs.push(`${b.player.species.name}은(는) 레벨 ${lu.level}이 됐다!`);
    for (const mn of lu.newMoveNames) {
      msgs.push(`${b.player.species.name}은(는) ${MOVES_DB[mn].name}을(를) 배웠다!`);
    }
  }

  // Trainer: try next pocket
  if (!b.isWild && b.trainer) {
    b.battle_trainerPartyIdx = (b.battle_trainerPartyIdx || 0) + 1;
    b.trainerPartyIdx++;
    if (b.trainerPartyIdx < b.trainer.party.length) {
      const next = b.trainer.party[b.trainerPartyIdx];
      b.enemy = createPocketInstance(next.speciesId, next.level);
      msgs.push(`${b.trainer.name}이(가) 다음 포켓을 꺼냈다!`);
      msgs.push(`${b.enemy.species.name}! 나가줘!`);
      queueMessages(b, msgs, () => { b.phase = 'PLAYER_ACTION'; });
      return;
    } else {
      // Trainer defeated
      GS.player.defeatedTrainers.add(b.trainer.id);
      msgs.push(`${b.trainer.name}을(를) 이겼다!`);
      b.result = 'win';
      b._endMsg = `트레이너 ${b.trainer.name} 격파!`;
      queueMessages(b, msgs, () => { b.phase = 'END'; });
      return;
    }
  }

  // Wild
  b.result = 'win';
  b._endMsg = '야생 포켓을 물리쳤다!';
  queueMessages(b, msgs, () => { b.phase = 'END'; });
}

function checkBattleEnd(b) {
  if (b.player.currentHp <= 0) handlePlayerFaint(b);
  else if (b.enemy.currentHp <= 0) handleEnemyFaint(b);
  else b.phase = 'PLAYER_ACTION';
}


// ─────────────── INIT ───────────────
loop();
