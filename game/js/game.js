/* game.js — main loop, input, state machine, tools, save/load. */
(function () {
  "use strict";
  const A = window.Assets, D = window.GameData, W = window.World, UI = window.UI, S = window.Sound;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const CW = canvas.width, CH = canvas.height, TS = W.TS;
  const SAVE_KEY = "willowmere_save_v1";

  const PLAYER_COLORS = { skin: "#e8b892", hair: "#6b4a2b", shirt: "#3b8fa2", pants: "#3a3a5a", shoe: "#3a2517" };

  const g = {
    state: "title",
    titleSel: 0, hasSave: false,
    map: "farm",
    time: D.DAY_START, day: 1, season: 0, year: 1,
    gold: D.START_GOLD, energy: 270, maxEnergy: 270,
    hotbar: [], inventory: [], selected: 0, invSel: 0,
    player: null, npcs: [], npcCache: {},
    dialogue: null, shop: null, summary: null,
    shippingBin: [],
    toasts: [], uiT: 0, locTimer: 0,
    introIdx: 0, timeAcc: 0, passedOut: false,
    cam: { x: 0, y: 0 },
  };
  window.__willowmere = g;

  /* ------------------------------------------------------ inventory */
  function emptySlots(arr, n) { for (let i = 0; i < n; i++) arr.push(null); }

  function addItem(id, qty) {
    qty = qty || 1;
    const it = D.items[id];
    const stackable = it && it.type !== "tool";
    const pools = [g.hotbar, g.inventory];
    if (stackable) {
      for (const pool of pools)
        for (const slot of pool)
          if (slot && slot.id === id) { slot.qty += qty; return true; }
    }
    for (const pool of pools)
      for (let i = 0; i < pool.length; i++)
        if (!pool[i]) { pool[i] = { id, qty }; return true; }
    toast("Inventory full!", "#a23b3b");
    return false;
  }

  function countItem(id) {
    let n = 0;
    [g.hotbar, g.inventory].forEach((p) => p.forEach((s) => { if (s && s.id === id) n += s.qty; }));
    return n;
  }
  function removeItem(id, qty) {
    qty = qty || 1;
    for (const pool of [g.hotbar, g.inventory])
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        if (s && s.id === id) {
          const take = Math.min(qty, s.qty); s.qty -= take; qty -= take;
          if (s.qty <= 0) pool[i] = null;
          if (qty <= 0) return true;
        }
      }
    return qty <= 0;
  }
  function selectedSlot() { return g.hotbar[g.selected]; }

  function toast(msg, color) { g.toasts.push({ msg, color, life: 2.4 }); if (g.toasts.length > 4) g.toasts.shift(); }

  /* ---------------------------------------------------------- new game */
  function newGame() {
    g.hotbar = []; g.inventory = [];
    emptySlots(g.hotbar, UI.HOTBAR); emptySlots(g.inventory, 32);
    ["hoe", "can", "axe", "pick", "scythe"].forEach((t) => addItem(t, 1));
    addItem("parsnip_seed", 15);
    g.gold = D.START_GOLD; g.energy = 270; g.maxEnergy = 270;
    g.time = D.DAY_START; g.day = 1; g.season = 0; g.year = 1;
    g.shippingBin = []; g.selected = 0;
    W.cache = {};
    g.npcCache = {};
    g.player = new window.Player(PLAYER_COLORS);
    enterMap("farm", D.maps.farm.spawn.x, D.maps.farm.spawn.y);
    startIntro();
  }

  function startIntro() {
    g.state = "intro"; g.introIdx = 0;
    showIntroLine();
  }
  function showIntroLine() {
    const e = D.intro[g.introIdx];
    g.dialogue = { name: e.who, portrait: e.who === "Mayor Mira" ? npcPortrait("mira") : null, text: e.text };
  }
  function npcPortrait(id) {
    const def = D.npcs.find((n) => n.id === id);
    return def ? A.portrait(def.colors) : null;
  }

  /* --------------------------------------------------------- map enter */
  function enterMap(id, tx, ty) {
    const m = W.enter(id);
    g.map = id;
    if (!g.player) g.player = new window.Player(PLAYER_COLORS);
    g.player.placeTile(tx, ty);
    // npcs for this map
    if (!g.npcCache[id]) {
      g.npcCache[id] = D.npcs.filter((n) => n.map === id).map((def) => new window.NPC(def));
    }
    g.npcs = g.npcCache[id];
    g.locTimer = 2.5;
    g.arrivalTile = { x: tx, y: ty };
    updateCamera();
  }

  function updateCamera() {
    const m = W.get();
    const px = g.player.x + window.ENT.SW / 2;
    const py = g.player.y + window.ENT.SH / 2;
    let cx = px - CW / 2, cy = py - CH / 2;
    cx = Math.max(0, Math.min(m.w * TS - CW, cx));
    cy = Math.max(0, Math.min(m.h * TS - CH, cy));
    if (m.w * TS < CW) cx = (m.w * TS - CW) / 2;
    if (m.h * TS < CH) cy = (m.h * TS - CH) / 2;
    g.cam.x = cx; g.cam.y = cy;
  }

  /* --------------------------------------------------------- dialogue */
  function startDialogue(entries, onEnd) {
    // entries: [{name, portrait, text}]
    g.dialogueQueue = entries.slice();
    g.dialogueOnEnd = onEnd || null;
    g.state = "dialogue";
    nextDialogue();
  }
  function nextDialogue() {
    if (!g.dialogueQueue || g.dialogueQueue.length === 0) {
      g.dialogue = null; g.state = "play";
      if (g.dialogueOnEnd) { const f = g.dialogueOnEnd; g.dialogueOnEnd = null; f(); }
      return;
    }
    g.dialogue = g.dialogueQueue.shift();
    S.talk();
  }

  /* ------------------------------------------------------------ tools */
  function npcAdjacent() {
    const c = g.player.centerTile();
    const ft = g.player.facingTile();
    let best = null, bestD = 99;
    g.npcs.forEach((n) => {
      const t = n.tile();
      const d = Math.abs(t.x - c.x) + Math.abs(t.y - c.y);
      // prefer the one we're facing, else any within 1 tile
      const facingMatch = (t.x === ft.x && t.y === ft.y);
      const score = facingMatch ? 0 : d;
      if ((facingMatch || d <= 1) && score < bestD) { bestD = score; best = n; }
    });
    return best;
  }

  function useTool() {
    const m = W.get();
    const ft = g.player.facingTile();

    // 1) NPC talk
    const npc = npcAdjacent();
    if (npc) {
      npc.faceTo(g.player.x, g.player.y);
      const def = npc.def;
      startDialogue([{ name: def.name, portrait: npc.portrait, text: npc.nextLine() }]);
      return;
    }
    // 2) interactable object
    const o = W.objAt(m, ft.x, ft.y);
    if (o) {
      if (o.type === "bed") { trySleep(); return; }
      if (o.type === "bin") { depositToBin(); return; }
      if (o.type === "sign") {
        if (o.kind === "shopkeeper") { openShop(); return; }
        startDialogue([{ name: "Notice Board", portrait: null, text: D.tips[Math.floor(g.uiT) % D.tips.length] }]);
        return;
      }
    }
    // shop counter (interior)
    if (m.shopCounter && ft.x >= m.shopCounter.x && ft.x < m.shopCounter.x + m.shopCounter.w &&
        Math.abs(ft.y - m.shopCounter.y) <= 1) { openShop(); return; }

    // 3) ripe crop harvest (by hand)
    const crop = W.cropAt(m, ft.x, ft.y);
    if (crop && crop.ripe) {
      const yield_ = W.harvest(m, ft.x, ft.y);
      if (yield_) { addItem(yield_.id, yield_.qty); S.harvest(); toast("Harvested " + D.items[yield_.id].name + (yield_.qty > 1 ? " ×" + yield_.qty : "")); }
      return;
    }

    // 4) selected tool / seed
    const slot = selectedSlot();
    if (!slot || !slot.id) return;
    const it = D.items[slot.id];
    if (!it) return;

    if (it.type === "seed") { plantSeed(m, ft, it); return; }
    if (it.type !== "tool") return;

    if (g.energy <= 0) { toast("Too exhausted to work...", "#a23b3b"); S.error(); return; }

    switch (slot.id) {
      case "hoe": doHoe(m, ft); break;
      case "can": doWater(m, ft); break;
      case "axe": doAxe(m, ft, o); break;
      case "pick": doPick(m, ft, o); break;
      case "scythe": doScythe(m, ft, o); break;
    }
  }

  function spendEnergy(n) { g.energy = Math.max(0, g.energy - n); }

  function doHoe(m, ft) {
    if (W.till(m, ft.x, ft.y)) { spendEnergy(2); S.hoe(); }
    else S.error();
  }
  function doWater(m, ft) {
    const crop = W.cropAt(m, ft.x, ft.y);
    if (m.ground[ft.y] && (m.ground[ft.y][ft.x] === "soil" || m.ground[ft.y][ft.x] === "soilWet" || crop)) {
      W.water(m, ft.x, ft.y); spendEnergy(2); S.water();
    } else if (m.ground[ft.y] && (m.ground[ft.y][ft.x] === "water0" || m.ground[ft.y][ft.x] === "water1")) {
      S.water(); toast("Refilled the watering can.");
    } else S.error();
  }
  function doAxe(m, ft, o) {
    if (o && (o.type === "tree" || o.type === "stump")) {
      o.hp--; S.chop(); spendEnergy(3);
      addItem("wood", o.type === "tree" ? 1 : 2);
      if (o.hp <= 0) {
        if (o.type === "tree") { o.type = "stump"; o.hp = 1; }
        else { W.removeObj(m, o); addItem("wood", 2); }
      }
    } else if (o && o.type === "bush") {
      o.hp--; S.chop(); spendEnergy(2); if (o.hp <= 0) { W.removeObj(m, o); addItem("fiber", 1); }
    } else S.error();
  }
  function doPick(m, ft, o) {
    if (o && o.type === "rock") {
      o.hp--; S.pick(); spendEnergy(3); addItem("stone", 1);
      if (o.hp <= 0) { W.removeObj(m, o); addItem("stone", 1); if (Math.random() < 0.2) addItem("coin", 0) || (g.gold += 20); }
    } else S.error();
  }
  function doScythe(m, ft, o) {
    if (o && o.type === "weed") { W.removeObj(m, o); S.chop(); if (Math.random() < 0.6) addItem("fiber", 1); }
    else if (o && (o.type === "flower_a" || o.type === "flower_b" || o.type === "flower_c")) { W.removeObj(m, o); S.chop(); }
    else S.error();
  }
  function plantSeed(m, ft, it) {
    if (D.SEASONS[g.season] !== it.season) { toast("Won't grow this season.", "#a23b3b"); S.error(); return; }
    if (W.plant(m, ft.x, ft.y, it.cropId)) {
      removeItem(it.id, 1); S.plant();
      if (m.ground[ft.y][ft.x] === "soil") { /* not watered */ }
    } else { S.error(); }
  }

  /* -------------------------------------------------------- bin / shop */
  function depositToBin() {
    const slot = selectedSlot();
    if (!slot || !slot.id) { toast("Select produce to ship."); return; }
    const it = D.items[slot.id];
    if (!it || it.type === "tool" || !it.sell) { toast("Can't ship that.", "#a23b3b"); return; }
    // move ALL of selected stack into bin
    const qty = slot.qty;
    const existing = g.shippingBin.find((b) => b.id === slot.id);
    if (existing) existing.qty += qty; else g.shippingBin.push({ id: slot.id, qty });
    g.hotbar[g.selected] = null;
    S.coin(); toast("Shipped " + it.name + " ×" + qty + " (sells overnight)");
  }

  function openShop() {
    g.shop = { list: D.shopStock.slice(), sel: 0 };
    g.state = "shop";
  }
  function buySelected() {
    const id = g.shop.list[g.shop.sel];
    const it = D.items[id];
    const price = it.cost || it.sell || 0;
    if (g.gold < price) { toast("Not enough gold.", "#a23b3b"); S.error(); return; }
    g.gold -= price; addItem(id, 1); S.coin();
    toast("Bought " + it.name);
  }

  /* ---------------------------------------------------------- sleeping */
  function trySleep() {
    startDialogue([{ name: "", portrait: null, text: "Head to bed and end the day?  (Space to sleep)" }], () => {});
    // simpler: sleep immediately via confirm handled below
    g.dialogueQueue = [];
    g.dialogue = { name: "", portrait: null, text: "You climb into bed..." };
    g.state = "dialogue";
    g.dialogueOnEnd = () => sleepNow(false);
  }

  function sleepNow(passedOut) {
    // process shipping
    let sales = [], totalEarned = 0;
    g.shippingBin.forEach((b) => {
      const it = D.items[b.id];
      const each = it.sell || 0;
      const tot = each * b.qty;
      sales.push({ id: b.id, qty: b.qty, total: tot });
      totalEarned += tot;
    });
    g.gold += totalEarned;
    g.shippingBin = [];

    // advance world + calendar
    W.advanceDayAll();
    g.day++;
    if (g.day > D.DAYS_PER_SEASON) { g.day = 1; g.season++; if (g.season > 3) { g.season = 0; g.year++; } }
    g.time = D.DAY_START;
    g.energy = passedOut ? Math.floor(g.maxEnergy * 0.6) : g.maxEnergy;
    let penalty = 0;
    if (passedOut) { penalty = Math.min(g.gold, 50); g.gold -= penalty; }

    // wake in farmhouse
    enterMap("farmhouse", D.maps.farmhouse.spawn.x, D.maps.farmhouse.spawn.y);

    g.summary = {
      title: passedOut ? "You collapsed..." : "Day " + (g.day) + " · " + D.SEASONS[g.season],
      subtitle: passedOut ? ("Someone carried you home." + (penalty ? " Lost " + penalty + "g." : "")) : "A new morning in Willowmere.",
      sales, totalEarned,
    };
    save();
    S.sleep();
    g.state = "summary";
  }

  function passOut() {
    g.passedOut = true;
    sleepNow(true);
  }

  /* ------------------------------------------------------------- save */
  function save() {
    try {
      const data = {
        v: 1,
        time: g.time, day: g.day, season: g.season, year: g.year,
        gold: g.gold, energy: g.energy, maxEnergy: g.maxEnergy,
        hotbar: g.hotbar, inventory: g.inventory, selected: g.selected,
        shippingBin: g.shippingBin,
        player: { x: g.player.x, y: g.player.y, facing: g.player.facing },
        world: W.serialize(),
        npcLines: {},
      };
      Object.keys(g.npcCache).forEach((mp) => {
        g.npcCache[mp].forEach((n) => { data.npcLines[n.def.id] = n.lineIdx; });
      });
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      g.hasSave = true;
    } catch (e) { console.warn("save failed", e); }
  }
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!data) return false;
      g.time = data.time; g.day = data.day; g.season = data.season; g.year = data.year;
      g.gold = data.gold; g.energy = data.energy; g.maxEnergy = data.maxEnergy;
      g.hotbar = data.hotbar; g.inventory = data.inventory; g.selected = data.selected || 0;
      g.shippingBin = data.shippingBin || [];
      g.npcCache = {};
      W.deserialize(data.world);
      g.player = new window.Player(PLAYER_COLORS);
      g.map = data.world.currentId;
      W.currentId = g.map;
      g.player.x = data.player.x; g.player.y = data.player.y; g.player.facing = data.player.facing;
      // build npcs for current map
      if (!g.npcCache[g.map]) g.npcCache[g.map] = D.npcs.filter((n) => n.map === g.map).map((def) => new window.NPC(def));
      g.npcs = g.npcCache[g.map];
      if (data.npcLines) g.npcs.forEach((n) => { if (data.npcLines[n.def.id] != null) n.lineIdx = data.npcLines[n.def.id]; });
      g.locTimer = 2;
      updateCamera();
      g.state = "play";
      return true;
    } catch (e) { console.warn("load failed", e); return false; }
  }

  /* ------------------------------------------------------------ input */
  const keys = {};
  window.addEventListener("keydown", (e) => {
    S.resume();
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    if (e.repeat) { keys[e.key.toLowerCase()] = true; return; }
    keys[e.key.toLowerCase()] = true;
    onPress(e.key.toLowerCase());
  });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
  canvas.addEventListener("wheel", (e) => {
    if (g.state !== "play") return;
    e.preventDefault();
    g.selected = (g.selected + (e.deltaY > 0 ? 1 : -1) + UI.HOTBAR) % UI.HOTBAR;
    S.select();
  }, { passive: false });
  canvas.setAttribute("tabindex", "0");

  function onPress(k) {
    const act = k === " " || k === "enter" || k === "spacebar";
    switch (g.state) {
      case "title":
        if (k === "arrowup" || k === "w") { g.titleSel = Math.max(0, g.titleSel - 1); S.select(); }
        else if (k === "arrowdown" || k === "s") { g.titleSel = Math.min((g.hasSave ? 1 : 0), g.titleSel + 1); S.select(); }
        else if (act) {
          const items = g.hasSave ? ["Continue", "New Game"] : ["New Game"];
          if (items[g.titleSel] === "Continue") { if (!load()) newGame(); }
          else newGame();
          S.newDay();
        }
        break;
      case "intro":
        if (act) {
          g.introIdx++;
          if (g.introIdx >= D.intro.length) { g.dialogue = null; g.state = "play"; toast(D.tips[0]); }
          else { showIntroLine(); S.talk(); }
        }
        break;
      case "dialogue":
        if (act) nextDialogue();
        break;
      case "play":
        if (act) useTool();
        else if (k === "e" || k === "i") { g.state = "inventory"; g.invSel = 0; S.select(); }
        else if (k === "c") { openCalendar(); }
        else if (k === "escape") { g.state = "paused"; }
        else if (k >= "1" && k <= "9") { g.selected = parseInt(k) - 1; S.select(); }
        else if (k === "0") { g.selected = 9; S.select(); }
        else if (k === "-") { g.selected = 10; S.select(); }
        else if (k === "=") { g.selected = 11; S.select(); }
        else if (k === "q") { g.selected = (g.selected + 11) % UI.HOTBAR; S.select(); }
        break;
      case "inventory":
        if (k === "e" || k === "i" || k === "escape") { g.state = "play"; S.select(); }
        else handleInvNav(k);
        break;
      case "shop":
        if (k === "escape" || k === "e") { g.state = "play"; g.shop = null; S.select(); }
        else if (k === "arrowup" || k === "w") { g.shop.sel = (g.shop.sel + g.shop.list.length - 1) % g.shop.list.length; S.select(); }
        else if (k === "arrowdown" || k === "s") { g.shop.sel = (g.shop.sel + 1) % g.shop.list.length; S.select(); }
        else if (act) buySelected();
        break;
      case "summary":
        if (act) { g.state = "play"; S.newDay(); toast(D.tips[(g.day) % D.tips.length]); }
        break;
      case "paused":
        if (k === "escape") { g.state = "play"; }
        else if (k === "s") { save(); toast("Game saved."); }
        else if (k === "q") { g.state = "title"; g.titleSel = 0; g.hasSave = hasSave(); }
        break;
      case "calendar":
        if (k === "c" || k === "escape") { g.state = "play"; S.select(); }
        break;
    }
  }

  function handleInvNav(k) {
    const cols = 8, total = 32;
    if (k === "arrowleft" || k === "a") g.invSel = (g.invSel + total - 1) % total;
    else if (k === "arrowright" || k === "d") g.invSel = (g.invSel + 1) % total;
    else if (k === "arrowup" || k === "w") g.invSel = (g.invSel + total - cols) % total;
    else if (k === "arrowdown" || k === "s") g.invSel = (g.invSel + cols) % total;
    else return;
    S.select();
  }

  function openCalendar() { g.state = "calendar"; S.select(); }

  /* --------------------------------------------------------- warp/step */
  function checkWarp() {
    const m = W.get();
    const c = g.player.centerTile();
    if (g.arrivalTile) {
      if (c.x === g.arrivalTile.x && c.y === g.arrivalTile.y) return; // don't re-trigger on the tile we arrived at
      g.arrivalTile = null;
    }
    const wp = W.warpAt(m, c.x, c.y);
    if (wp) { enterMap(wp.to, wp.tx, wp.ty); S.select(); }
  }

  /* ------------------------------------------------------------ update */
  let stepSfxT = 0;
  function update(dt) {
    g.uiT += dt;
    W.tick(dt * 1000);
    for (let i = g.toasts.length - 1; i >= 0; i--) { g.toasts[i].life -= dt; if (g.toasts[i].life <= 0) g.toasts.splice(i, 1); }
    if (g.locTimer > 0) g.locTimer -= dt;

    if (g.state === "play") {
      // movement
      let dx = 0, dy = 0;
      if (keys["arrowleft"] || keys["a"]) dx -= 1;
      if (keys["arrowright"] || keys["d"]) dx += 1;
      if (keys["arrowup"] || keys["w"]) dy -= 1;
      if (keys["arrowdown"] || keys["s"]) dy += 1;
      const m = W.get();
      const wasMoving = g.player.moving;
      g.player.update(dt, dx, dy, m);
      if (g.player.moving) {
        stepSfxT += dt; if (stepSfxT > 0.28) { stepSfxT = 0; S.step(); }
        checkWarp();
      }
      updateCamera();
      // npcs
      g.npcs.forEach((n) => n.update(dt, m));

      // time
      g.timeAcc += dt;
      const RATE = 1.8; // in-game minutes per real second
      while (g.timeAcc >= 1 / RATE) { g.timeAcc -= 1 / RATE; g.time += 1; }
      if (g.time >= D.DAY_END) { passOut(); }
      else if (g.energy <= 0 && !g.player.moving) { /* allow but warn */ }
    } else if (g.state === "intro" || g.state === "dialogue") {
      const m = W.get();
      g.npcs.forEach((n) => n.update(dt, m));
    }
  }

  /* ------------------------------------------------------------ render */
  function render() {
    ctx.clearRect(0, 0, CW, CH);
    if (g.state === "title") { UI.drawTitle(ctx, g); return; }

    const m = W.get();
    if (!m) return;
    // ground + crops
    ctx.fillStyle = m.interior ? "#2c2018" : "#356b2c";
    ctx.fillRect(0, 0, CW, CH);
    W.drawGround(ctx, m, g.cam, CW, CH);

    // facing-tile highlight when holding a tool in play
    if (g.state === "play") {
      const slot = selectedSlot();
      if (slot && slot.id && D.items[slot.id] && (D.items[slot.id].type === "tool" || D.items[slot.id].type === "seed")) {
        const ft = g.player.facingTile();
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(Math.round(ft.x * TS - g.cam.x) + 2, Math.round(ft.y * TS - g.cam.y) + 2, TS - 4, TS - 4);
      }
    }

    // renderables: objects + player + npcs, y-sorted
    const list = W.collectRenderables(m);
    list.push({ isPlayer: true, footY: g.player.footY() });
    g.npcs.forEach((n) => list.push({ isNPC: true, npc: n, footY: n.footY() }));
    list.sort((a, b) => a.footY - b.footY);
    list.forEach((r) => {
      if (r.isPlayer) g.player.draw(ctx, g.cam);
      else if (r.isNPC) {
        r.npc.draw(ctx, g.cam);
        // name tag when near player
        const dx = r.npc.x - g.player.x, dy = r.npc.y - g.player.y;
        if (dx * dx + dy * dy < (TS * 2.4) * (TS * 2.4)) {
          UI.text(ctx, r.npc.name, Math.round(r.npc.x - g.cam.x + window.ENT.SW / 2),
            Math.round(r.npc.y - g.cam.y - 6), 12, "#fff6e0", "center");
        }
      } else {
        ctx.drawImage(r.spr, Math.round(r.wx - g.cam.x), Math.round(r.wy - g.cam.y), r.w, r.h);
      }
    });

    UI.drawNightTint(ctx, g);

    // overlays
    if (g.state === "play") { UI.drawHUD(ctx, g); }
    else if (g.state === "intro" || g.state === "dialogue") { UI.drawHUD(ctx, g); UI.drawDialogue(ctx, g); }
    else if (g.state === "inventory") { UI.drawHUD(ctx, g); UI.drawInventory(ctx, g); }
    else if (g.state === "shop") { UI.drawHUD(ctx, g); UI.drawShop(ctx, g); }
    else if (g.state === "calendar") { UI.drawHUD(ctx, g); drawCalendar(); }
    else if (g.state === "paused") { UI.drawHUD(ctx, g); drawPause(); }
    else if (g.state === "summary") { UI.drawSummary(ctx, g); return; }

    UI.drawToasts(ctx, g);
  }

  function drawPause() {
    UI.dim(ctx);
    const w = 320, h = 220, x = (CW - w) / 2, y = (CH - h) / 2;
    UI.panel(ctx, x, y, w, h);
    UI.text(ctx, "Paused", CW / 2, y + 46, 26, "#7a4a1a", "center");
    const lines = ["Esc — Resume", "S — Save game", "Q — Quit to title"];
    lines.forEach((l, i) => UI.text(ctx, l, CW / 2, y + 90 + i * 34, 17, "#3a2a18", "center"));
    UI.text(ctx, "Willowmere Valley", CW / 2, y + h - 20, 12, "#7a5a38", "center");
  }

  function drawCalendar() {
    UI.dim(ctx);
    const w = 420, h = 380, x = (CW - w) / 2, y = (CH - h) / 2;
    UI.panel(ctx, x, y, w, h);
    UI.text(ctx, D.SEASONS[g.season] + " · Year " + g.year, CW / 2, y + 40, 24, "#7a4a1a", "center");
    const cols = 7, cell = 50, gx = x + 24, gy = y + 60;
    const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    dayNames.forEach((d, i) => UI.text(ctx, d, gx + i * cell + cell / 2, gy, 13, "#7a5a38", "center"));
    for (let d = 1; d <= D.DAYS_PER_SEASON; d++) {
      const col = (d - 1) % 7, row = Math.floor((d - 1) / 7);
      const cx = gx + col * cell, cy = gy + 12 + row * cell;
      const today = d === g.day;
      ctx.fillStyle = today ? "#f2c14e" : "rgba(60,42,24,0.15)";
      UI.roundRect(ctx, cx + 3, cy + 3, cell - 6, cell - 8, 6); ctx.fill();
      UI.text(ctx, String(d), cx + cell / 2, cy + 30, 15, today ? "#5a3010" : "#3a2a18", "center");
    }
    UI.text(ctx, "C / Esc to close", CW / 2, y + h - 18, 13, "#7a5a38", "center");
  }

  /* -------------------------------------------------------------- boot */
  let last = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function boot() {
    g.hasSave = hasSave();
    const ld = document.getElementById("loading");
    if (ld) ld.style.display = "none";
    canvas.focus();
    requestAnimationFrame(loop);
  }
  if (A.ready) boot(); else window.addEventListener("load", boot);
})();
