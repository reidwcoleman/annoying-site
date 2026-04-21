// Outbreak Response - zero-dependency multiplayer server (Node.js built-ins only).
// Transport: Server-Sent Events (server -> client) + HTTP POST (client -> server).

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const url = require('url');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pathogens.json'), 'utf8'));

const REGIONS = [
  { id: 0, name: 'North America', short: 'NA', col: 0, row: 0, neighbors: [1, 2] },
  { id: 1, name: 'Europe',         short: 'EU', col: 1, row: 0, neighbors: [0, 2, 3, 4] },
  { id: 2, name: 'South America',  short: 'SA', col: 0, row: 1, neighbors: [0, 1, 3] },
  { id: 3, name: 'Africa',         short: 'AF', col: 1, row: 1, neighbors: [1, 2, 4] },
  { id: 4, name: 'Asia',           short: 'AS', col: 2, row: 0, neighbors: [1, 3, 5] },
  { id: 5, name: 'Oceania',        short: 'OC', col: 2, row: 1, neighbors: [3, 4] },
];

const ROLES = [
  { id: 'doctor',     name: 'Doctor',          blurb: 'Treats infections faster. Treat costs 1 AP instead of 2.' },
  { id: 'scientist',  name: 'Scientist',       blurb: 'Earns 2 research tokens per correct answer instead of 1.' },
  { id: 'nurse',      name: 'Nurse',           blurb: 'Shields last 2 rounds instead of 1. Shield costs 1 AP.' },
  { id: 'educator',   name: 'Educator',        blurb: 'Share Intel gives 2 AP tokens instead of 1.' },
  { id: 'logistics',  name: 'Logistics',       blurb: 'Can move to any region, not just neighbors (costs 1 AP).' },
  { id: 'responder',  name: 'First Responder', blurb: 'Starts each turn with 4 AP instead of 3.' },
];

const CATEGORIES = Object.keys(DATA.categories);
const RESEARCH_GOAL = 4;
const MAX_OUTBREAKS = 3;
const MAX_INFECTION = 4;
const INFECTIONS_PER_PHASE = 2;
const ROUND_LIMIT = 12;

// ---- Helpers ----
function randInt(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[randInt(arr.length)]; }
function pathogensByCategory(cat) { return DATA.pathogens.filter(p => p.category === cat); }
function pathogenInfo(id) { return DATA.pathogens.find(p => p.id === id); }
function newId() { return crypto.randomBytes(9).toString('base64url'); }
function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (games.has(code));
  return code;
}

// ---- State ----
const games = new Map();
// player sessions: playerId -> { id, name, gameCode, sseRes (current SSE response or null), private message queue }
const sessions = new Map();

function logEntry(game, msg) {
  game.log.unshift({ t: Date.now(), msg });
  if (game.log.length > 80) game.log.pop();
}

function publicState(game) {
  return {
    code: game.code,
    hostId: game.hostId,
    phase: game.phase,
    players: game.players.map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      regionIdx: p.regionIdx,
      apBonus: p.apBonus || 0,
      connected: p.connected !== false,
    })),
    regions: game.regions,
    round: game.round,
    turnIdx: game.turnIdx,
    currentPlayerId: game.players[game.turnIdx] ? game.players[game.turnIdx].id : null,
    actionsLeft: game.actionsLeft,
    research: game.research,
    researchGoal: RESEARCH_GOAL,
    outbreakCount: game.outbreakCount,
    maxOutbreaks: MAX_OUTBREAKS,
    maxInfection: MAX_INFECTION,
    eradicated: game.eradicated,
    log: game.log.slice(0, 30),
    activeQuizFor: game.activeQuiz ? game.activeQuiz.playerId : null,
    roundLimit: ROUND_LIMIT,
    roles: ROLES,
  };
}

function newGame(hostPlayerId) {
  const code = makeCode();
  const game = {
    code,
    hostId: hostPlayerId,
    phase: 'lobby',
    players: [],
    regions: REGIONS.map(r => ({ ...r, infections: [], shield: 0 })),
    round: 1,
    turnIdx: 0,
    actionsLeft: 3,
    research: Object.fromEntries(CATEGORIES.map(c => [c, 0])),
    outbreakCount: 0,
    eradicated: [],
    log: [],
    activeQuiz: null,
    turnsTaken: 0,
    createdAt: Date.now(),
  };
  games.set(code, game);
  return game;
}

function sendToPlayer(playerId, event, data) {
  const s = sessions.get(playerId);
  if (!s) return;
  if (s.sseRes && !s.sseRes.writableEnded) {
    try {
      s.sseRes.write(`event: ${event}\n`);
      s.sseRes.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) { /* ignore */ }
  } else {
    // queue for next connection
    s.queue = s.queue || [];
    s.queue.push({ event, data });
    if (s.queue.length > 50) s.queue.splice(0, s.queue.length - 50);
  }
}

function broadcast(game, event, data) {
  for (const p of game.players) sendToPlayer(p.id, event, data);
}

function broadcastState(game) {
  broadcast(game, 'state', publicState(game));
}

// ---- Game logic ----
function assignRoles(game) {
  const pool = [...ROLES];
  for (const p of game.players) {
    const idx = randInt(pool.length);
    p.role = pool.splice(idx, 1)[0].id;
    p.regionIdx = 0;
    p.apBonus = 0;
  }
}

function initialInfections(game) {
  const cats = [...CATEGORIES, ...CATEGORIES];
  for (let i = cats.length - 1; i > 0; i--) {
    const j = randInt(i + 1); [cats[i], cats[j]] = [cats[j], cats[i]];
  }
  for (let i = 0; i < 6; i++) {
    const region = game.regions[i];
    const cat = cats[i];
    const pth = pick(pathogensByCategory(cat));
    region.infections.push({ pathogenId: pth.id, category: cat, level: 1 });
  }
}

function startingAP(player) {
  const base = player.role === 'responder' ? 4 : 3;
  return base + (player.apBonus || 0);
}
function currentPlayer(game) { return game.players[game.turnIdx]; }

function startGame(game) {
  if (game.players.length < 2) return { error: 'Need at least 2 players.' };
  if (game.players.length > 6) return { error: 'Maximum 6 players.' };
  assignRoles(game);
  initialInfections(game);
  game.phase = 'playing';
  game.round = 1;
  game.turnIdx = 0;
  game.turnsTaken = 0;
  game.actionsLeft = startingAP(game.players[0]);
  logEntry(game, `The outbreak begins. ${game.players[0].name} goes first.`);
  return {};
}

function endTurn(game) {
  const p = currentPlayer(game);
  if (p) p.apBonus = 0;
  game.turnsTaken++;
  game.activeQuiz = null;
  game.turnIdx = (game.turnIdx + 1) % game.players.length;
  if (game.turnsTaken >= game.players.length) {
    game.turnsTaken = 0;
    infectionPhase(game);
    game.round++;
    logEntry(game, `Round ${game.round} begins.`);
    for (const r of game.regions) if (r.shield > 0) r.shield--;
    if (checkWin(game)) { game.phase = 'won'; logEntry(game, 'Victory! All pathogens cured.'); return; }
    if (game.outbreakCount >= MAX_OUTBREAKS) { game.phase = 'lost'; logEntry(game, `Defeat. ${game.outbreakCount} regions fell.`); return; }
    if (game.round > ROUND_LIMIT) { game.phase = 'lost'; logEntry(game, 'Defeat. Time ran out.'); return; }
  }
  if (game.phase === 'playing') {
    game.actionsLeft = startingAP(currentPlayer(game));
  }
}

function infectionPhase(game) {
  for (let i = 0; i < INFECTIONS_PER_PHASE; i++) {
    const region = pick(game.regions);
    if (region.shield > 0) {
      region.shield = 0;
      logEntry(game, `Shield in ${region.name} absorbed an incoming infection.`);
      continue;
    }
    const cat = pick(CATEGORIES);
    if (game.eradicated.includes(cat)) {
      logEntry(game, `${DATA.categories[cat].name} strain tried to spread, but it is eradicated.`);
      continue;
    }
    const pth = pick(pathogensByCategory(cat));
    addInfection(game, region, pth.id, cat);
  }
}

function addInfection(game, region, pathogenId, cat) {
  let total = region.infections.reduce((s, i) => s + i.level, 0);
  if (total >= MAX_INFECTION) return outbreak(game, region, cat);
  let existing = region.infections.find(i => i.category === cat);
  if (!existing) {
    existing = { pathogenId, category: cat, level: 0 };
    region.infections.push(existing);
  }
  existing.level++;
  logEntry(game, `New ${DATA.categories[cat].name.toLowerCase()} infection in ${region.name}.`);
  total = region.infections.reduce((s, i) => s + i.level, 0);
  if (total >= MAX_INFECTION) outbreak(game, region, cat);
}

function outbreak(game, region, cat) {
  game.outbreakCount++;
  logEntry(game, `OUTBREAK in ${region.name}! The region has fallen.`);
  for (const nIdx of region.neighbors) {
    const neighbor = game.regions[nIdx];
    if (neighbor.shield > 0) { neighbor.shield = 0; continue; }
    const total = neighbor.infections.reduce((s, i) => s + i.level, 0);
    if (total >= MAX_INFECTION) continue;
    let existing = neighbor.infections.find(i => i.category === cat);
    if (!existing) {
      const pth = pick(pathogensByCategory(cat));
      existing = { pathogenId: pth.id, category: cat, level: 0 };
      neighbor.infections.push(existing);
    }
    existing.level++;
  }
}

function checkWin(game) { return CATEGORIES.every(c => game.research[c] >= RESEARCH_GOAL); }

function awardResearch(game, cat, amount) {
  game.research[cat] = Math.min(RESEARCH_GOAL, game.research[cat] + amount);
  if (game.research[cat] >= RESEARCH_GOAL && !game.eradicated.includes(cat)) {
    game.eradicated.push(cat);
    logEntry(game, `${DATA.categories[cat].name} CURED! Your team has defeated this pathogen category.`);
    for (const r of game.regions) r.infections = r.infections.filter(i => i.category !== cat);
  }
}

function quizFor(cat) {
  const matches = DATA.quiz.filter(q => (q.choices.join(' ') + ' ' + q.q + ' ' + q.explain).toLowerCase().includes(cat));
  return matches.length > 0 && Math.random() < 0.6 ? pick(matches) : pick(DATA.quiz);
}

function publicQuiz(q) {
  return {
    kind: q.kind, category: q.category, pathogenId: q.pathogenId, pathogenInfo: q.pathogenInfo,
    question: q.question, choices: q.choices, prompt: q.prompt,
  };
}

// ---- Action handlers (client->server) ----
function err(res, msg, status = 400) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: msg }));
}
function ok(res, data = {}) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, ...data }));
}

function handleAction(action, body, res, playerId) {
  const session = sessions.get(playerId);
  if (!session) return err(res, 'Unknown session. Please rejoin.');

  if (action === 'lobby/create') {
    const name = (body.name || '').trim().slice(0, 20);
    if (!name) return err(res, 'Please enter a name.');
    session.name = name;
    const game = newGame(playerId);
    const player = { id: playerId, name, role: null, regionIdx: 0, apBonus: 0, connected: true };
    game.players.push(player);
    session.gameCode = game.code;
    logEntry(game, `${name} created the room.`);
    broadcastState(game);
    return ok(res, { code: game.code });
  }

  if (action === 'lobby/join') {
    const name = (body.name || '').trim().slice(0, 20);
    const code = (body.code || '').trim().toUpperCase();
    if (!name) return err(res, 'Please enter a name.');
    const game = games.get(code);
    if (!game) return err(res, 'Room not found.');
    session.name = name;
    if (game.phase !== 'lobby') {
      const existing = game.players.find(p => p.name === name && p.connected === false);
      if (existing) {
        // rejoin: transfer playerId
        existing.id = playerId;
        existing.connected = true;
        session.gameCode = game.code;
        logEntry(game, `${name} reconnected.`);
        broadcastState(game);
        return ok(res, { code: game.code });
      }
      return err(res, 'Game already started.');
    }
    if (game.players.length >= 6) return err(res, 'Room is full.');
    if (game.players.some(p => p.name === name)) return err(res, 'Name already taken in this room.');
    const player = { id: playerId, name, role: null, regionIdx: 0, apBonus: 0, connected: true };
    game.players.push(player);
    session.gameCode = game.code;
    logEntry(game, `${name} joined.`);
    broadcastState(game);
    return ok(res, { code: game.code });
  }

  // All following actions require a game
  const game = games.get(session.gameCode);
  if (!game) return err(res, 'You are not in a game.');

  if (action === 'lobby/start') {
    if (game.hostId !== playerId) return err(res, 'Only the host can start.');
    if (game.phase !== 'lobby') return err(res, 'Already started.');
    const result = startGame(game);
    if (result.error) return err(res, result.error);
    broadcastState(game);
    return ok(res);
  }

  if (action === 'lobby/leave') {
    leaveGame(playerId);
    return ok(res);
  }

  if (action === 'chat') {
    const player = game.players.find(p => p.id === playerId);
    if (!player) return err(res, 'Not in this game.');
    const text = String(body.text || '').slice(0, 200).trim();
    if (!text) return err(res, 'Empty message.');
    broadcast(game, 'chat', { name: player.name, text, t: Date.now() });
    return ok(res);
  }

  // Turn actions
  if (game.phase !== 'playing') return err(res, 'Game not in play.');
  const cp = currentPlayer(game);
  const me = game.players.find(p => p.id === playerId);
  if (!me) return err(res, 'Not in this game.');

  if (action === 'game/move') {
    if (!cp || cp.id !== playerId) return err(res, 'Not your turn.');
    if (game.activeQuiz) return err(res, 'Finish the quiz first.');
    if (game.actionsLeft < 1) return err(res, 'No actions left.');
    const regionIdx = parseInt(body.regionIdx, 10);
    const to = game.regions[regionIdx];
    if (!to) return err(res, 'Invalid region.');
    const from = game.regions[cp.regionIdx];
    const canLongMove = cp.role === 'logistics';
    if (!canLongMove && !from.neighbors.includes(regionIdx)) return err(res, 'Region is not adjacent.');
    cp.regionIdx = regionIdx;
    game.actionsLeft--;
    logEntry(game, `${cp.name} moved to ${to.name}.`);
    broadcastState(game);
    return ok(res);
  }

  if (action === 'game/treat') {
    if (!cp || cp.id !== playerId) return err(res, 'Not your turn.');
    if (game.activeQuiz) return err(res, 'Finish the quiz first.');
    const cost = cp.role === 'doctor' ? 1 : 2;
    if (game.actionsLeft < cost) return err(res, `Treat costs ${cost} AP.`);
    const category = body.category;
    const region = game.regions[cp.regionIdx];
    const inf = region.infections.find(i => i.category === category);
    if (!inf) return err(res, 'No infection of that type here.');
    game.actionsLeft -= cost;
    const q = quizFor(category);
    const pth = pathogenInfo(inf.pathogenId);
    game.activeQuiz = {
      playerId: cp.id, kind: 'treat', category, pathogenId: inf.pathogenId,
      question: q.q, choices: q.choices, answer: q.answer, explain: q.explain,
      regionIdx: cp.regionIdx, pathogenInfo: pth,
      prompt: `Treat the ${DATA.categories[category].name.toLowerCase()} infection in ${region.name}.`,
    };
    logEntry(game, `${cp.name} is treating a ${DATA.categories[category].name.toLowerCase()} in ${region.name}.`);
    sendToPlayer(cp.id, 'quiz', publicQuiz(game.activeQuiz));
    broadcastState(game);
    return ok(res);
  }

  if (action === 'game/shield') {
    if (!cp || cp.id !== playerId) return err(res, 'Not your turn.');
    if (game.activeQuiz) return err(res, 'Finish the quiz first.');
    const cost = cp.role === 'nurse' ? 1 : 2;
    if (game.actionsLeft < cost) return err(res, `Shield costs ${cost} AP.`);
    game.actionsLeft -= cost;
    const region = game.regions[cp.regionIdx];
    const q = quizFor(body.category || pick(CATEGORIES));
    game.activeQuiz = {
      playerId: cp.id, kind: 'shield', category: body.category || null,
      question: q.q, choices: q.choices, answer: q.answer, explain: q.explain,
      regionIdx: cp.regionIdx,
      prompt: `Lead a prevention campaign in ${region.name}.`,
    };
    logEntry(game, `${cp.name} is launching a prevention campaign in ${region.name}.`);
    sendToPlayer(cp.id, 'quiz', publicQuiz(game.activeQuiz));
    broadcastState(game);
    return ok(res);
  }

  if (action === 'game/share') {
    if (!cp || cp.id !== playerId) return err(res, 'Not your turn.');
    if (game.activeQuiz) return err(res, 'Finish the quiz first.');
    if (game.actionsLeft < 1) return err(res, 'No actions left.');
    const target = game.players.find(p => p.id === body.targetId);
    if (!target || target.id === cp.id) return err(res, 'Pick a teammate.');
    if (target.regionIdx !== cp.regionIdx) return err(res, 'Teammate must be in the same region.');
    const gain = cp.role === 'educator' ? 2 : 1;
    target.apBonus = (target.apBonus || 0) + gain;
    game.actionsLeft--;
    logEntry(game, `${cp.name} shared intel with ${target.name} (+${gain} AP next turn).`);
    broadcastState(game);
    return ok(res);
  }

  if (action === 'game/quiz-answer') {
    if (!cp || cp.id !== playerId) return err(res, 'Not your turn.');
    if (!game.activeQuiz || game.activeQuiz.playerId !== playerId) return err(res, 'No active quiz.');
    const q = game.activeQuiz;
    const choiceIdx = parseInt(body.choiceIdx, 10);
    const correct = choiceIdx === q.answer;
    const region = game.regions[q.regionIdx];
    const researchGain = cp.role === 'scientist' ? 2 : 1;
    let detail = '';
    if (q.kind === 'treat') {
      if (correct) {
        const inf = region.infections.find(i => i.category === q.category);
        if (inf) {
          inf.level--;
          if (inf.level <= 0) region.infections = region.infections.filter(i => i !== inf);
        }
        awardResearch(game, q.category, researchGain);
        const pth = pathogenInfo(q.pathogenId);
        detail = `${cp.name} correctly treated ${pth ? pth.name : 'the infection'} in ${region.name} (+${researchGain} research ${DATA.categories[q.category].name}).`;
      } else {
        detail = `${cp.name} misdiagnosed the case in ${region.name}. The infection persists.`;
      }
    } else if (q.kind === 'shield') {
      if (correct) {
        region.shield = cp.role === 'nurse' ? 2 : 1;
        if (q.category) awardResearch(game, q.category, researchGain);
        detail = `${cp.name} established prevention measures in ${region.name} (shield active).`;
      } else {
        detail = `${cp.name}'s prevention campaign failed. No shield set up.`;
      }
    }
    logEntry(game, detail);
    const result = { correct, explain: q.explain, answer: q.answer, pathogenInfo: q.pathogenInfo || null };
    game.activeQuiz = null;
    sendToPlayer(cp.id, 'quizResult', result);
    if (checkWin(game)) { game.phase = 'won'; logEntry(game, 'Victory! All pathogens cured.'); }
    broadcastState(game);
    return ok(res, { correct });
  }

  if (action === 'game/end-turn') {
    if (!cp || cp.id !== playerId) return err(res, 'Not your turn.');
    if (game.activeQuiz) return err(res, 'Finish the quiz first.');
    logEntry(game, `${cp.name} ended their turn.`);
    endTurn(game);
    broadcastState(game);
    return ok(res);
  }

  return err(res, 'Unknown action.', 404);
}

function leaveGame(playerId) {
  const session = sessions.get(playerId);
  if (!session || !session.gameCode) return;
  const game = games.get(session.gameCode);
  if (!game) return;
  const player = game.players.find(p => p.id === playerId);
  if (!player) return;
  if (game.phase === 'lobby') {
    game.players = game.players.filter(p => p.id !== playerId);
    logEntry(game, `${player.name} left the lobby.`);
    if (game.hostId === playerId && game.players.length > 0) {
      game.hostId = game.players[0].id;
      logEntry(game, `${game.players[0].name} is now the host.`);
    }
    if (game.players.length === 0) {
      games.delete(game.code);
    } else {
      broadcastState(game);
    }
  } else {
    player.connected = false;
    logEntry(game, `${player.name} disconnected.`);
    if (currentPlayer(game) && currentPlayer(game).id === playerId) {
      game.activeQuiz = null;
      endTurn(game);
    }
    broadcastState(game);
  }
  session.gameCode = null;
}

function handleDisconnect(playerId) {
  const session = sessions.get(playerId);
  if (!session) return;
  const game = session.gameCode && games.get(session.gameCode);
  if (!game) return;
  const player = game.players.find(p => p.id === playerId);
  if (!player) return;
  if (game.phase === 'lobby') {
    // Remove from lobby
    game.players = game.players.filter(p => p.id !== playerId);
    logEntry(game, `${player.name} left the lobby.`);
    if (game.hostId === playerId && game.players.length > 0) {
      game.hostId = game.players[0].id;
      logEntry(game, `${game.players[0].name} is now the host.`);
    }
    if (game.players.length === 0) games.delete(game.code);
    else broadcastState(game);
  } else {
    player.connected = false;
    logEntry(game, `${player.name} disconnected (can rejoin).`);
    broadcastState(game);
  }
}

// Cleanup idle games
setInterval(() => {
  const now = Date.now();
  for (const [code, game] of games) {
    const idle = now - game.createdAt > 2 * 60 * 60 * 1000;
    if (idle && game.players.every(p => !p.connected)) games.delete(code);
  }
}, 10 * 60 * 1000);

// ---- HTTP server ----

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  rel = decodeURIComponent(rel).replace(/\.\./g, '');
  const full = path.join(PUBLIC_DIR, rel);
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  fs.stat(full, (e, stat) => {
    if (e || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(full).pipe(res);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = decodeURIComponent(pair.slice(idx + 1).trim());
    if (k) out[k] = v;
  });
  return out;
}

function ensureSession(req, res) {
  const cookies = parseCookies(req);
  let pid = cookies.pid;
  if (!pid || !sessions.has(pid)) {
    pid = newId();
    sessions.set(pid, { id: pid, name: null, gameCode: null, sseRes: null, queue: [] });
    res.setHeader('Set-Cookie', `pid=${pid}; Path=/; Max-Age=86400; SameSite=Lax`);
  }
  return pid;
}

function readBody(req, limit = 1024 * 64) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { req.destroy(); reject(new Error('payload too large')); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    const pid = ensureSession(req, res);

    if (req.method === 'GET' && pathname === '/events') {
      // SSE stream
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(':connected\n\n');
      const session = sessions.get(pid);
      // If another connection exists, replace it
      if (session.sseRes && !session.sseRes.writableEnded) {
        try { session.sseRes.end(); } catch {}
      }
      session.sseRes = res;
      // Send hello with identity
      res.write(`event: hello\ndata: ${JSON.stringify({ playerId: pid })}\n\n`);
      // If in a game, push current state
      if (session.gameCode) {
        const g = games.get(session.gameCode);
        if (g) {
          // if a player with this id exists, mark connected
          const p = g.players.find(pp => pp.id === pid);
          if (p) p.connected = true;
          res.write(`event: state\ndata: ${JSON.stringify(publicState(g))}\n\n`);
          broadcastState(g);
        }
      }
      // flush queue
      if (session.queue && session.queue.length) {
        for (const m of session.queue) {
          res.write(`event: ${m.event}\ndata: ${JSON.stringify(m.data)}\n\n`);
        }
        session.queue = [];
      }
      // Heartbeat
      const ping = setInterval(() => {
        if (res.writableEnded) { clearInterval(ping); return; }
        try { res.write(`:ping ${Date.now()}\n\n`); } catch {}
      }, 20000);
      req.on('close', () => {
        clearInterval(ping);
        if (session.sseRes === res) session.sseRes = null;
        handleDisconnect(pid);
      });
      return;
    }

    if (req.method === 'POST' && pathname.startsWith('/action/')) {
      const action = pathname.replace(/^\/action\//, '');
      const body = await readBody(req);
      return handleAction(action, body, res, pid);
    }

    if (req.method === 'GET' && pathname === '/api/pathogen-info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(DATA));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/me') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ playerId: pid }));
      return;
    }

    if (req.method === 'GET' && pathname === '/healthz') {
      res.writeHead(200); res.end('ok'); return;
    }

    if (req.method === 'GET') {
      return serveStatic(req, res, pathname);
    }

    res.writeHead(405); res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end('server error');
  }
});

// Returns { privateIps: [...], otherIps: [...] }
// "private" = routable on a typical home/office Wi-Fi LAN (RFC 1918).
// "other"   = public IPs, CGNAT, link-local, or reserved test ranges.
function lanAddresses() {
  const privateIps = [];
  const otherIps = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name]) {
      if (info.family !== 'IPv4' || info.internal) continue;
      const ip = info.address;
      if (isPrivateLAN(ip)) privateIps.push({ name, ip });
      else otherIps.push({ name, ip });
    }
  }
  return { privateIps, otherIps };
}

function isPrivateLAN(ip) {
  const m = ip.split('.').map(Number);
  if (m.length !== 4 || m.some(n => isNaN(n))) return false;
  // 10.0.0.0/8
  if (m[0] === 10) return true;
  // 172.16.0.0/12
  if (m[0] === 172 && m[1] >= 16 && m[1] <= 31) return true;
  // 192.168.0.0/16
  if (m[0] === 192 && m[1] === 168) return true;
  return false;
}

const PORT = parseInt(process.env.PORT, 10) || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const { privateIps, otherIps } = lanAddresses();
  console.log('');
  console.log('  🦠  Outbreak Response is running on port ' + PORT + '.');
  console.log('');
  console.log('  On this machine:   http://localhost:' + PORT);
  console.log('');
  if (privateIps.length > 0) {
    console.log('  Share these Wi-Fi URLs with teammates on the same network:');
    for (const { ip, name } of privateIps) {
      console.log('    http://' + ip + ':' + PORT + '   (' + name + ')');
    }
    console.log('');
    console.log('  They just open the URL in their browser. No install.');
  } else {
    console.log('  ⚠️  No private Wi-Fi IP detected on this machine.');
    if (otherIps.length > 0) {
      console.log('     Detected these non-private IPs (likely unreachable from your phone):');
      for (const { ip, name } of otherIps) {
        console.log('       ' + ip + ' (' + name + ')');
      }
    }
    console.log('');
    console.log('  To host on your real Wi-Fi, run this server on your OWN computer:');
    console.log('     1. Install Node.js 18+ (https://nodejs.org)');
    console.log('     2. Clone or copy this repo to your computer');
    console.log('     3. Run:  node server.js');
    console.log('     4. Your computer will print a 192.168.x.x URL.');
    console.log('     5. Make sure your computer\'s firewall allows port ' + PORT + '.');
  }
  console.log('');
});
