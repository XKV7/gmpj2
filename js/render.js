// All rendering lives here; canvas/ctx provided by main.js

// ─────────────── HELPERS ───────────────
function fillRoundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawHpBar(ctx, x, y, w, h, ratio) {
  ctx.fillStyle = '#333';
  ctx.fillRect(x, y, w, h);
  const color = ratio > 0.5 ? '#44CC44' : ratio > 0.25 ? '#DDCC00' : '#DD3333';
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.floor(w * Math.max(0, ratio)), h);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function drawExpBar(ctx, x, y, w, h, pocket) {
  const ratio = pocket.exp / getExpToNextLevel(pocket.level);
  ctx.fillStyle = '#333';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#4488FF';
  ctx.fillRect(x, y, Math.floor(w * Math.min(1, ratio)), h);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function drawTypeBadge(ctx, x, y, typeName) {
  const color = TYPE_COLORS[typeName] || '#888';
  fillRoundRect(ctx, x, y, 56, 18, 4, color, null);
  ctx.fillStyle = '#fff';
  ctx.font = '7px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillText(typeName, x + 28, y + 13);
}

function drawButton(ctx, x, y, w, h, label, hovered, color = '#223344', textColor = '#eee') {
  const bg = hovered ? '#3a5060' : color;
  fillRoundRect(ctx, x, y, w, h, 6, bg, hovered ? '#88ccff' : '#445566');
  ctx.fillStyle = textColor;
  ctx.font = '9px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
}

function drawPocketSprite(ctx, x, y, radius, pocket, flip = false) {
  const color = pocket.species.color;
  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, y + radius + 4, radius * 0.8, radius * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Body
  ctx.save();
  if (flip) { ctx.translate(x, y); ctx.scale(-1, 1); ctx.translate(-x, -y); }
  const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius);
  grad.addColorStop(0, lightenColor(color, 40));
  grad.addColorStop(1, darkenColor(color, 20));
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = darkenColor(color, 40);
  ctx.lineWidth = 2;
  ctx.stroke();

  // Emoji
  ctx.font = `${radius}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pocket.species.emoji, x, y + 2);
  ctx.restore();

  // Status indicator
  if (pocket.status) {
    ctx.fillStyle = STATUS_COLORS[pocket.status] || '#aaa';
    ctx.font = '8px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText(pocket.status, x, y + radius + 16);
  }
}

function lightenColor(hex, amt) {
  const r = Math.min(255, parseInt(hex.slice(1,3),16)+amt);
  const g = Math.min(255, parseInt(hex.slice(3,5),16)+amt);
  const b = Math.min(255, parseInt(hex.slice(5,7),16)+amt);
  return `rgb(${r},${g},${b})`;
}
function darkenColor(hex, amt) {
  const r = Math.max(0, parseInt(hex.slice(1,3),16)-amt);
  const g = Math.max(0, parseInt(hex.slice(3,5),16)-amt);
  const b = Math.max(0, parseInt(hex.slice(5,7),16)-amt);
  return `rgb(${r},${g},${b})`;
}

// ─────────────── TITLE SCREEN ───────────────
function renderTitle(ctx, input) {
  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, 600);
  bg.addColorStop(0, '#0a0a1e');
  bg.addColorStop(1, '#1a1040');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 800, 600);

  // Stars
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 80; i++) {
    const sx = ((i * 137 + 50) % 800);
    const sy = ((i * 97 + 30) % 500);
    ctx.fillRect(sx, sy, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
  }

  // Title
  ctx.save();
  ctx.shadowColor = '#4488ff';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#eeddff';
  ctx.font = '36px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillText('포켓 배틀', 400, 180);
  ctx.font = '14px "Press Start 2P"';
  ctx.fillStyle = '#aabbff';
  ctx.fillText('POCKET BATTLE', 400, 220);
  ctx.restore();

  // Buttons
  const hasSave = GS.hasSave();
  const btnW = 260, btnH = 54;
  const startY = hasSave ? 290 : 320;

  drawButton(ctx, 400 - btnW/2, startY,      btnW, btnH, '새 게임',
    input.isHover(400 - btnW/2, startY, btnW, btnH));

  if (hasSave) {
    drawButton(ctx, 400 - btnW/2, startY + 70, btnW, btnH, '이어하기',
      input.isHover(400 - btnW/2, startY + 70, btnW, btnH), '#1a3a1a', '#88ff88');
  }

  ctx.fillStyle = '#556677';
  ctx.font = '7px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillText('클릭하여 선택', 400, 570);
}

// ─────────────── STARTER SELECT ───────────────
function renderStarterSelect(ctx, input) {
  const bg = ctx.createLinearGradient(0, 0, 0, 600);
  bg.addColorStop(0, '#101828');
  bg.addColorStop(1, '#1a2840');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 800, 600);

  ctx.fillStyle = '#ddeeff';
  ctx.font = '16px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillText('파트너를 선택하세요', 400, 60);

  ctx.fillStyle = '#8899aa';
  ctx.font = '9px "Press Start 2P"';
  ctx.fillText('모험의 시작을 함께할 포켓을 고르세요', 400, 90);

  const starters = STARTERS.map(sid => createPocketInstance(sid, 5));
  const positions = [160, 400, 640];

  starters.forEach((p, i) => {
    const cx = positions[i];
    const cy = 260;
    const isH = input.isHover(cx - 100, 140, 200, 280);

    fillRoundRect(ctx, cx - 100, 140, 200, 280, 10,
      isH ? '#2a3a5a' : '#1a2540', isH ? '#5588cc' : '#334466');

    drawPocketSprite(ctx, cx, cy, 55, p);

    ctx.fillStyle = '#eee';
    ctx.font = '11px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText(p.species.name, cx, 350);

    // Type badges
    p.species.types.forEach((t, ti) => {
      drawTypeBadge(ctx, cx - 28 + ti * 62, 365, t);
    });

    // Base stats mini display
    ctx.fillStyle = '#aabbcc';
    ctx.font = '7px "Press Start 2P"';
    const bs = p.species.baseStats;
    ctx.fillText(`HP:${bs.hp} ATK:${bs.atk}`, cx, 395);
    ctx.fillText(`SPD:${bs.speed}`, cx, 410);
  });

  ctx.fillStyle = '#667788';
  ctx.font = '8px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillText('포켓을 클릭하여 선택', 400, 460);
}

// ─────────────── WORLD SCREEN ───────────────
function renderWorld(ctx, input) {
  const bg = ctx.createLinearGradient(0, 0, 800, 600);
  bg.addColorStop(0, '#0d1a0d');
  bg.addColorStop(1, '#1a2a1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 800, 600);

  // Area title
  const area = GS.currentArea();
  ctx.fillStyle = '#88ffaa';
  ctx.font = '18px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillText(area, 400, 45);

  // Area index indicator
  WORLD_AREAS.forEach((a, i) => {
    const active = i === GS.world.areaIndex;
    ctx.fillStyle = active ? '#88ffaa' : '#334433';
    ctx.fillRect(340 + i * 26, 58, 20, 6);
  });

  // Party panel (left)
  fillRoundRect(ctx, 20, 80, 360, 440, 10, '#0d1a0d', '#335533');
  ctx.fillStyle = '#88ffaa';
  ctx.font = '10px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.fillText('파티', 36, 106);

  GS.player.party.forEach((p, i) => {
    const py = 120 + i * 66;
    const fainted = p.currentHp <= 0;
    fillRoundRect(ctx, 30, py, 340, 58, 6,
      fainted ? '#1a0a0a' : '#122012', fainted ? '#441122' : '#335533');

    ctx.font = `${Math.floor(14 * (p.species.emoji.length > 2 ? 0.8 : 1))}px serif`;
    ctx.fillText(p.species.emoji, 50, py + 38);

    ctx.fillStyle = fainted ? '#886688' : '#ddeedd';
    ctx.font = '8px "Press Start 2P"';
    ctx.fillText(`${p.species.name} Lv.${p.level}`, 78, py + 22);

    ctx.fillStyle = fainted ? '#554455' : '#aabbaa';
    ctx.font = '7px "Press Start 2P"';
    ctx.fillText(`HP: ${p.currentHp}/${p.maxHp}`, 78, py + 38);

    drawHpBar(ctx, 78, py + 44, 220, 7, p.currentHp / p.maxHp);

    if (p.status) {
      ctx.fillStyle = STATUS_COLORS[p.status];
      ctx.font = '7px "Press Start 2P"';
      ctx.fillText(p.status, 310, py + 24);
    }
    if (i === GS.player.activePocketIdx && !fainted) {
      ctx.fillStyle = '#ffdd44';
      ctx.fillText('▶', 34, py + 26);
    }
  });

  // Right panel: actions
  const rx = 400;
  fillRoundRect(ctx, rx, 80, 380, 440, 10, '#0d1a1a', '#335555');
  ctx.fillStyle = '#88eeff';
  ctx.font = '10px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.fillText('행동', rx + 16, 106);

  const btnW = 340, btnH = 50;
  const bx = rx + 20;

  // Wild encounter button
  const canExplore = GS.player.party.some(p => p.currentHp > 0);
  drawButton(ctx, bx, 120, btnW, btnH, '야생 탐험',
    canExplore && input.isHover(bx, 120, btnW, btnH),
    canExplore ? '#223322' : '#111', canExplore ? '#88ffaa' : '#445544');

  // Trainer battle
  const trainer = GS.currentTrainer();
  const trainerAvail = trainer && !GS.player.defeatedTrainers.has(trainer.id) && canExplore;
  drawButton(ctx, bx, 185, btnW, btnH,
    trainer ? `트레이너 배틀` : '트레이너 없음',
    trainerAvail && input.isHover(bx, 185, btnW, btnH),
    trainerAvail ? '#223355' : '#111', trainerAvail ? '#88aaff' : '#445566');
  if (trainer && !GS.player.defeatedTrainers.has(trainer.id)) {
    ctx.fillStyle = '#aac0ff';
    ctx.font = '7px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText(trainer.name, bx + btnW/2, 195);
  }

  // Next area
  const nextAreaAvail = GS.world.areaIndex < WORLD_AREAS.length - 1 && canExplore;
  drawButton(ctx, bx, 250, btnW, btnH, '다음 지역으로',
    nextAreaAvail && input.isHover(bx, 250, btnW, btnH),
    nextAreaAvail ? '#332233' : '#111', nextAreaAvail ? '#ddaaff' : '#554466');

  // Balls display
  fillRoundRect(ctx, bx, 315, btnW, 70, 6, '#111a22', '#334455');
  ctx.fillStyle = '#88aacc';
  ctx.font = '8px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.fillText('포켓볼:', bx + 10, 335);
  let bxi = bx + 10;
  for (const [name, count] of Object.entries(GS.player.balls)) {
    if (count > 0) {
      ctx.fillStyle = POKEBALLS[name].color;
      ctx.fillText(`${name}×${count}`, bxi, 358);
      bxi += 120;
    }
  }

  // Save button
  drawButton(ctx, bx, 400, 160, 46, '저장',
    input.isHover(bx, 400, 160, 46), '#332200', '#ffdd88');

  // Prev area
  const prevAreaAvail = GS.world.areaIndex > 0;
  drawButton(ctx, bx + 180, 400, 160, 46, '이전 지역',
    prevAreaAvail && input.isHover(bx + 180, 400, 160, 46),
    prevAreaAvail ? '#223322' : '#111', prevAreaAvail ? '#aaffaa' : '#556655');

  // Footer
  ctx.fillStyle = '#445544';
  ctx.font = '7px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillText(`패배한 트레이너: ${GS.player.defeatedTrainers.size}/${TRAINERS.length}`, 590, 540);
}

// ─────────────── BATTLE SCREEN ───────────────
const ARENA_H = 360;
const PANEL_Y = ARENA_H;

function renderBattle(ctx, input) {
  if (!GS.battle) return;
  const b = GS.battle;

  renderBattleArena(ctx, b);
  renderBattlePanel(ctx, input, b);
}

function renderBattleArena(ctx, b) {
  // Sky/ground
  const sky = ctx.createLinearGradient(0, 0, 0, ARENA_H);
  sky.addColorStop(0, '#0a0a20');
  sky.addColorStop(0.6, '#1a1840');
  sky.addColorStop(1, '#2a2818');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 800, ARENA_H);

  // Ground platforms
  ctx.fillStyle = '#3a3010';
  ctx.fillRect(0, 300, 280, 60);
  ctx.fillStyle = '#8a7030';
  ctx.fillRect(0, 296, 280, 8);

  ctx.fillStyle = '#1a2a10';
  ctx.fillRect(520, 140, 280, 60);
  ctx.fillStyle = '#4a6020';
  ctx.fillRect(520, 136, 280, 8);

  // Enemy pocket
  if (b.enemy && b.enemy.currentHp > 0) {
    drawPocketSprite(ctx, 640, 160, 55, b.enemy, false);
  }
  // Player pocket
  if (b.player && b.player.currentHp > 0) {
    drawPocketSprite(ctx, 160, 290, 55, b.player, true);
  }

  // Enemy info box (top-left)
  renderInfoBox(ctx, b.enemy, 30, 20, false);

  // Player info box (bottom-right)
  renderInfoBox(ctx, b.player, 450, 240, true);
}

function renderInfoBox(ctx, pocket, x, y, showExp) {
  if (!pocket) return;
  const w = 300, h = showExp ? 88 : 70;
  fillRoundRect(ctx, x, y, w, h, 6, 'rgba(10,10,20,0.85)', '#334455');

  ctx.fillStyle = '#ddeeff';
  ctx.font = '10px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.fillText(`${pocket.species.name}`, x + 10, y + 20);

  ctx.fillStyle = '#aabbcc';
  ctx.font = '9px "Press Start 2P"';
  ctx.fillText(`Lv.${pocket.level}`, x + w - 70, y + 20);

  ctx.fillStyle = '#88aacc';
  ctx.font = '8px "Press Start 2P"';
  ctx.fillText('HP', x + 10, y + 38);
  drawHpBar(ctx, x + 30, y + 30, 220, 10, pocket.currentHp / pocket.maxHp);

  ctx.fillStyle = '#778899';
  ctx.font = '7px "Press Start 2P"';
  ctx.fillText(`${pocket.currentHp}/${pocket.maxHp}`, x + 260, y + 40);

  if (showExp) {
    ctx.fillStyle = '#6688aa';
    ctx.font = '7px "Press Start 2P"';
    ctx.fillText('EXP', x + 10, y + 58);
    drawExpBar(ctx, x + 30, y + 50, 220, 6, pocket);
  }

  if (pocket.status) {
    ctx.fillStyle = STATUS_COLORS[pocket.status];
    ctx.font = '7px "Press Start 2P"';
    ctx.fillText(`[${pocket.status}]`, x + 10, y + (showExp ? 76 : 58));
  }
}

function renderBattlePanel(ctx, input, b) {
  // Panel background
  fillRoundRect(ctx, 0, PANEL_Y, 800, 600 - PANEL_Y, 0, '#0a1018', '#334455');
  ctx.strokeStyle = '#445566';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, PANEL_Y); ctx.lineTo(800, PANEL_Y); ctx.stroke();

  switch (b.phase) {
    case 'PLAYER_ACTION': renderActionMenu(ctx, input, b);     break;
    case 'MOVE_SELECT':   renderMoveMenu(ctx, input, b);       break;
    case 'SWITCH_SELECT': renderSwitchMenu(ctx, input, b);     break;
    case 'BALL_SELECT':   renderBallMenu(ctx, input, b);       break;
    case 'MESSAGING':     renderMessagePhase(ctx, input, b);   break;
    case 'END':           renderBattleEnd(ctx, input, b);      break;
  }
}

function renderMessageBox(ctx, messages, currentIdx) {
  fillRoundRect(ctx, 10, PANEL_Y + 10, 780, 100, 6, '#0d1620', '#334455');
  if (messages.length === 0) return;
  const msg = messages[currentIdx] || '';
  ctx.fillStyle = '#ddeeff';
  ctx.font = '11px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  // Wrap text
  const words = msg.split('');
  let line = '';
  let lineY = PANEL_Y + 28;
  const maxW = 740;
  ctx.save();
  ctx.rect(18, PANEL_Y + 10, 764, 100);
  ctx.clip();
  // Simple wrapping by character width
  for (let i = 0; i < msg.length; i++) {
    const test = line + msg[i];
    if (ctx.measureText(test).width > maxW && line.length > 0) {
      ctx.fillText(line, 20, lineY);
      line = msg[i];
      lineY += 22;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, 20, lineY);
  ctx.restore();

  // "continue" indicator
  ctx.fillStyle = '#88aacc';
  ctx.font = '9px "Press Start 2P"';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  if (currentIdx < messages.length - 1) {
    ctx.fillText('▼ 클릭', 790, PANEL_Y + 108);
  }
}

function renderActionMenu(ctx, input, b) {
  renderMessageBox(ctx, [], 0);

  const bw = 180, bh = 56;
  const col1 = 410, col2 = 605;
  const row1 = PANEL_Y + 125, row2 = PANEL_Y + 192;

  ctx.fillStyle = '#778899';
  ctx.font = '9px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('무엇을 할까요?', 20, PANEL_Y + 50);

  drawButton(ctx, col1, row1, bw, bh, '기술 사용', input.isHover(col1, row1, bw, bh), '#221a00', '#ffdd88');
  drawButton(ctx, col2, row1, bw, bh, '포켓 교체', input.isHover(col2, row1, bw, bh), '#00221a', '#88ffdd');
  drawButton(ctx, col1, row2, bw, bh, b.isWild ? '볼 사용' : '──', input.isHover(col1, row2, bw, bh) && b.isWild, b.isWild ? '#001822' : '#111', b.isWild ? '#88ccff' : '#333');
  drawButton(ctx, col2, row2, bw, bh, b.isWild ? '도망가기' : '항복', input.isHover(col2, row2, bw, bh), '#220011', '#ff8888');
}

function renderMoveMenu(ctx, input, b) {
  const pocket = b.player;
  renderMessageBox(ctx, [], 0);

  const bw = 185, bh = 56;
  const positions = [
    [10, PANEL_Y + 120], [205, PANEL_Y + 120],
    [10, PANEL_Y + 186], [205, PANEL_Y + 186]
  ];

  pocket.moves.forEach((move, i) => {
    if (!positions[i]) return;
    const [mx, my] = positions[i];
    const nopp = move.currentPp <= 0;
    const typeColor = TYPE_COLORS[move.type] || '#888';
    drawButton(ctx, mx, my, bw, bh, '',
      !nopp && input.isHover(mx, my, bw, bh),
      nopp ? '#111' : '#1a1a2a', nopp ? '#555' : typeColor);

    ctx.fillStyle = nopp ? '#555' : '#fff';
    ctx.font = '8px "Press Start 2P"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(move.name, mx + 8, my + 22);

    ctx.fillStyle = nopp ? '#444' : '#aabbcc';
    ctx.font = '7px "Press Start 2P"';
    ctx.fillText(`PP: ${move.currentPp}/${move.pp}`, mx + 8, my + 38);
    drawTypeBadge(ctx, mx + bw - 64, my + 6, move.type);
    ctx.fillStyle = nopp ? '#444' : '#cc9988';
    ctx.font = '7px "Press Start 2P"';
    ctx.fillText(`위력:${move.power}`, mx + bw - 64, my + 48);
  });

  drawButton(ctx, 400, PANEL_Y + 125, 380, 110, '← 뒤로',
    input.isHover(400, PANEL_Y + 125, 380, 110), '#1a0a0a', '#ff8888');
}

function renderSwitchMenu(ctx, input, b) {
  fillRoundRect(ctx, 10, PANEL_Y + 10, 780, 230, 6, '#0a0a18', '#334466');
  ctx.fillStyle = '#aabbdd';
  ctx.font = '10px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('어떤 포켓으로 교체?', 20, PANEL_Y + 32);

  const cols = 3;
  GS.player.party.forEach((p, i) => {
    const px = 20 + (i % cols) * 258;
    const py = PANEL_Y + 45 + Math.floor(i / cols) * 78;
    const fainted = p.currentHp <= 0;
    const isActive = i === GS.player.activePocketIdx;
    const isH = !fainted && !isActive && input.isHover(px, py, 248, 68);

    fillRoundRect(ctx, px, py, 248, 68, 6,
      fainted ? '#1a0a0a' : isActive ? '#1a2a1a' : (isH ? '#2a2a3a' : '#121222'),
      fainted ? '#441122' : isActive ? '#338833' : '#334466');

    ctx.font = '16px serif';
    ctx.fillText(p.species.emoji, px + 8, py + 40);

    ctx.fillStyle = fainted ? '#665566' : isActive ? '#88ff88' : '#ddeeff';
    ctx.font = '8px "Press Start 2P"';
    ctx.fillText(`${p.species.name} Lv.${p.level}`, px + 36, py + 22);
    ctx.fillStyle = '#8899aa';
    ctx.font = '7px "Press Start 2P"';
    ctx.fillText(`${p.currentHp}/${p.maxHp}`, px + 36, py + 36);
    drawHpBar(ctx, px + 36, py + 43, 180, 7, p.currentHp / p.maxHp);

    if (isActive) {
      ctx.fillStyle = '#88ff88'; ctx.font = '7px "Press Start 2P"';
      ctx.fillText('출전중', px + 180, py + 20);
    }
  });

  drawButton(ctx, 630, PANEL_Y + 208, 150, 36, '← 뒤로',
    input.isHover(630, PANEL_Y + 208, 150, 36), '#1a0a0a', '#ff8888');
}

function renderBallMenu(ctx, input, b) {
  fillRoundRect(ctx, 10, PANEL_Y + 10, 780, 230, 6, '#0a1018', '#334455');
  ctx.fillStyle = '#aaccdd';
  ctx.font = '10px "Press Start 2P"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('어떤 볼을 쓸까요?', 20, PANEL_Y + 32);

  let bxi = 0;
  for (const [name, count] of Object.entries(GS.player.balls)) {
    const bx = 20 + (bxi % 2) * 390;
    const by = PANEL_Y + 45 + Math.floor(bxi / 2) * 76;
    const available = count > 0;
    const isH = available && input.isHover(bx, by, 370, 66);
    fillRoundRect(ctx, bx, by, 370, 66, 6,
      available ? (isH ? '#1a2a3a' : '#0d1a28') : '#111',
      available ? POKEBALLS[name].color : '#334');

    ctx.fillStyle = available ? '#ddeeff' : '#445566';
    ctx.font = '9px "Press Start 2P"';
    ctx.fillText(`${name}`, bx + 12, by + 24);
    ctx.font = '7px "Press Start 2P"';
    ctx.fillStyle = available ? '#88aacc' : '#334';
    ctx.fillText(`남은 수: ${count}`, bx + 12, by + 44);
    if (name === '마스터볼') {
      ctx.fillStyle = '#ffaaff';
      ctx.fillText('반드시 잡힌다!', bx + 140, by + 44);
    }
    bxi++;
  }

  drawButton(ctx, 630, PANEL_Y + 208, 150, 36, '← 뒤로',
    input.isHover(630, PANEL_Y + 208, 150, 36), '#1a0a0a', '#ff8888');
}

function renderMessagePhase(ctx, input, b) {
  renderMessageBox(ctx, b.messages, b._msgIdx || 0);
  // Show "click to continue" more clearly when messages remain
  ctx.fillStyle = '#4a6a8a';
  ctx.font = '9px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('클릭하여 계속', 400, PANEL_Y + 160);
}

function renderBattleEnd(ctx, input, b) {
  const won = b.result === 'win' || b.result === 'catch' || b.result === 'flee';
  fillRoundRect(ctx, 150, PANEL_Y + 20, 500, 210, 10,
    won ? '#0a2a0a' : '#2a0a0a', won ? '#44aa44' : '#aa4444');

  ctx.fillStyle = won ? '#88ff88' : '#ff8888';
  ctx.font = '16px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const resultText = {
    win: '승리!', catch: '포획 성공!', flee: '도망쳤다!', lose: '패배...'
  }[b.result] || '';
  ctx.fillText(resultText, 400, PANEL_Y + 66);

  ctx.fillStyle = '#aabbcc';
  ctx.font = '8px "Press Start 2P"';
  ctx.fillText(b._endMsg || '', 400, PANEL_Y + 100);

  drawButton(ctx, 250, PANEL_Y + 140, 300, 50, '세계로 돌아가기',
    input.isHover(250, PANEL_Y + 140, 300, 50), won ? '#0a2a0a' : '#2a0a0a', won ? '#88ff88' : '#ff8888');
}

// ─────────────── GAME OVER ───────────────
function renderGameOver(ctx, input) {
  ctx.fillStyle = '#0a0000';
  ctx.fillRect(0, 0, 800, 600);

  ctx.fillStyle = '#ff4444';
  ctx.font = '28px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', 400, 220);

  ctx.fillStyle = '#886666';
  ctx.font = '10px "Press Start 2P"';
  ctx.fillText('모든 포켓이 쓰러졌다...', 400, 280);

  drawButton(ctx, 270, 340, 260, 54, '처음으로', input.isHover(270, 340, 260, 54), '#220000', '#ff8888');
}
