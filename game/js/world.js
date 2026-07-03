/* world.js — map construction, tiles, collision, objects, crops, rendering. */
(function () {
  "use strict";
  const A = window.Assets, D = window.GameData;
  const TS = A.TILE * A.SCALE; // 48 screen px per tile
  const W = {};
  window.World = W;
  W.TS = TS;

  W.cache = {};       // built map states this session
  W.currentId = null;

  const SOLID_TILES = { water0: true, water1: true, wall: true };
  const SOLID_OBJ = { tree: true, rock: true, bush: true, house: true, shop: true, bin: true, bed: true, sign: true, fence: true, stump: true };

  function rnd(n) { return Math.floor(Math.random() * n); }

  /* ------------------------------------------------------------- build */
  function build(id) {
    const bp = D.maps[id];
    const m = {
      id, w: bp.w, h: bp.h, interior: !!bp.interior,
      ground: [], objects: [], crops: {}, warps: [], shopCounter: bp.shopCounter || null,
    };
    // ground fill
    for (let y = 0; y < bp.h; y++) {
      const row = [];
      for (let x = 0; x < bp.w; x++) row.push(bp.base);
      m.ground.push(row);
    }
    // interior wall border
    if (bp.interior) {
      for (let x = 0; x < bp.w; x++) { m.ground[0][x] = "wall"; }
      for (let y = 0; y < bp.h; y++) { m.ground[y][0] = "wall"; m.ground[y][bp.w - 1] = "wall"; }
      for (let x = 0; x < bp.w; x++) { m.ground[bp.h - 1][x] = "wall"; }
    }
    // paths
    (bp.paths || []).forEach((p) => fillRect(m, p, "path"));
    // river / pond
    if (bp.river) fillRect(m, bp.river, "water0");
    if (bp.pond) fillEllipse(m, bp.pond, "water0");
    // tile-decal objects (rug)
    (bp.objects || []).forEach((o) => {
      if (o.tile) { m.ground[o.y][o.x] = o.obj; return; }
      addObj(m, { type: o.obj, tx: o.x, ty: o.y, kind: o.kind, w: o.w || 1, h: o.h || 1 });
    });
    // buildings
    (bp.buildings || []).forEach((b) => {
      addObj(m, { type: b.obj, tx: b.x, ty: b.y, kind: b.kind, w: b.solidW || b.w || 1, h: b.solidH || b.h || 1 });
      if (b.door && b.warp) {
        m.warps.push({ x: b.door.x, y: b.door.y, to: b.warp.to, tx: b.warp.tx, ty: b.warp.ty });
      }
    });
    // scatter
    if (bp.scatter) scatter(m, bp);
    // outer tree border for outdoor maps (natural boundary)
    if (!bp.interior) treeBorder(m, bp);
    // warps from blueprint
    (bp.warps || []).forEach((wp) => m.warps.push(wp));

    m.spawn = bp.spawn || { x: 2, y: 2 };
    rebuildSolid(m);
    return m;
  }

  function fillRect(m, r, type) {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++)
        if (inb(m, x, y)) m.ground[y][x] = type;
  }
  function fillEllipse(m, r, type) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rx = r.w / 2, ry = r.h / 2;
    for (let y = r.y - 1; y < r.y + r.h + 1; y++)
      for (let x = r.x - 1; x < r.x + r.w + 1; x++) {
        if (!inb(m, x, y)) continue;
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) m.ground[y][x] = type;
      }
  }
  function inb(m, x, y) { return x >= 0 && y >= 0 && x < m.w && y < m.h; }

  function addObj(m, o) {
    o.hp = o.hp != null ? o.hp : (o.type === "tree" ? 3 : o.type === "rock" ? 2 : 1);
    m.objects.push(o);
    return o;
  }

  function objAt(m, x, y) {
    for (const o of m.objects) {
      const w = o.w || 1, h = o.h || 1;
      if (x >= o.tx && x < o.tx + w && y >= o.ty && y < o.ty + h) return o;
    }
    return null;
  }
  W.objAt = objAt;

  function scatter(m, bp) {
    const s = bp.scatter, avoid = bp.tillRegion;
    const kinds = [];
    for (let i = 0; i < (s.trees || 0); i++) kinds.push("tree");
    for (let i = 0; i < (s.rocks || 0); i++) kinds.push("rock");
    for (let i = 0; i < (s.weeds || 0); i++) kinds.push("weed");
    for (let i = 0; i < (s.bush || 0); i++) kinds.push("bush");
    const flowerKinds = ["flower_a", "flower_b", "flower_c"];
    for (let i = 0; i < (s.flowers || 0); i++) kinds.push("flower");
    kinds.forEach((k) => {
      for (let tries = 0; tries < 30; tries++) {
        const x = 2 + rnd(m.w - 4), y = 2 + rnd(m.h - 4);
        if (m.ground[y][x] !== "grass" && m.ground[y][x] !== "grassDark") continue;
        if (objAt(m, x, y)) continue;
        if (avoid && x >= avoid.x && x < avoid.x + avoid.w && y >= avoid.y && y < avoid.y + avoid.h) continue;
        if (Math.abs(x - m.spawnGuess) < 2) { /* noop */ }
        let type = k;
        if (k === "flower") type = flowerKinds[rnd(3)];
        addObj(m, { type, tx: x, ty: y, w: 1, h: 1 });
        break;
      }
    });
  }

  function treeBorder(m, bp) {
    for (let x = 0; x < m.w; x++) {
      maybeBorderTree(m, x, 0); maybeBorderTree(m, x, m.h - 1);
    }
    for (let y = 0; y < m.h; y++) {
      maybeBorderTree(m, 0, y); maybeBorderTree(m, m.w - 1, y);
    }
  }
  function maybeBorderTree(m, x, y) {
    if (m.ground[y][x] !== "grass" && m.ground[y][x] !== "grassDark") return;
    if (objAt(m, x, y)) return;
    // leave gaps where warps are
    for (const wp of m.warps) if (Math.abs(wp.x - x) <= 1 && Math.abs(wp.y - y) <= 1) return;
    addObj(m, { type: "tree", tx: x, ty: y, w: 1, h: 1, hp: 3, border: true });
  }

  function rebuildSolid(m) {
    m.solid = [];
    for (let y = 0; y < m.h; y++) {
      const row = [];
      for (let x = 0; x < m.w; x++) row.push(!!SOLID_TILES[m.ground[y][x]]);
      m.solid.push(row);
    }
    for (const o of m.objects) {
      if (!SOLID_OBJ[o.type]) continue;
      const w = o.w || 1, h = o.h || 1;
      for (let y = o.ty; y < o.ty + h; y++)
        for (let x = o.tx; x < o.tx + w; x++)
          if (inb(m, x, y)) row_set(m, x, y);
    }
    // warp trigger tiles (building doors, edges) must be walkable
    for (const wp of m.warps) if (inb(m, wp.x, wp.y)) m.solid[wp.y][wp.x] = false;
  }
  function row_set(m, x, y) { m.solid[y][x] = true; }

  W.isSolid = function (m, x, y) {
    if (!inb(m, x, y)) return true;
    return m.solid[y][x];
  };

  /* ------------------------------------------------------------- access */
  W.enter = function (id) {
    if (!W.cache[id]) W.cache[id] = build(id);
    W.currentId = id;
    return W.cache[id];
  };
  W.get = function () { return W.cache[W.currentId]; };

  W.warpAt = function (m, x, y) {
    for (const wp of m.warps) if (wp.x === x && wp.y === y) return wp;
    return null;
  };

  /* ------------------------------------------------------- tile actions */
  W.till = function (m, x, y) {
    if (!inb(m, x, y)) return false;
    const g = m.ground[y][x];
    if ((g === "grass" || g === "grassDark") && !objAt(m, x, y)) {
      m.ground[y][x] = "soil"; return true;
    }
    return false;
  };
  W.water = function (m, x, y) {
    if (!inb(m, x, y)) return false;
    if (m.ground[y][x] === "soil") { m.ground[y][x] = "soilWet"; }
    const key = x + "_" + y;
    if (m.crops[key]) { m.crops[key].watered = true; m.ground[y][x] = "soilWet"; return true; }
    return m.ground[y][x] === "soilWet";
  };
  W.plant = function (m, x, y, cropId) {
    if (!inb(m, x, y)) return false;
    const g = m.ground[y][x];
    if (g !== "soil" && g !== "soilWet") return false;
    const key = x + "_" + y;
    if (m.crops[key]) return false;
    m.crops[key] = { cropId, stage: 0, days: 0, watered: g === "soilWet", ripe: false, dead: false, regrows: false };
    return true;
  };
  W.cropAt = function (m, x, y) { return m.crops[x + "_" + y] || null; };

  W.harvest = function (m, x, y) {
    const key = x + "_" + y, c = m.crops[key];
    if (!c || !c.ripe) return null;
    const def = D.crops[c.cropId];
    if (def.regrow) {
      c.ripe = false; c.stage = Math.max(2, def.stages.length - 2);
      c.days = def.days - def.regrow; c.regrows = true;
    } else {
      delete m.crops[key];
      m.ground[y][x] = "soil";
    }
    // yield: base 1, potato bonus chance
    let qty = 1;
    if (def.chance && Math.random() < def.chance) qty = 2;
    return { id: c.cropId, qty };
  };

  // Advance all crops one day (called on sleep). Returns nothing.
  W.advanceDayAll = function () {
    Object.values(W.cache).forEach((m) => {
      // dry watered soil, grow crops
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++)
          if (m.ground[y][x] === "soilWet" && !m.crops[x + "_" + y]) m.ground[y][x] = "soil";
      Object.keys(m.crops).forEach((key) => {
        const c = m.crops[key];
        const def = D.crops[c.cropId];
        if (c.watered && !c.ripe) {
          c.days++;
          const prog = Math.min(1, c.days / def.days);
          c.stage = Math.min(def.stages.length - 1, Math.floor(prog * (def.stages.length - 1)));
          if (c.days >= def.days) { c.ripe = true; c.stage = def.stages.length - 1; }
        }
        c.watered = false;
        // dry the soil tile back
        const [px, py] = key.split("_").map(Number);
        if (m.ground[py][px] === "soilWet") m.ground[py][px] = "soil";
      });
    });
  };

  W.removeObj = function (m, o) {
    const i = m.objects.indexOf(o);
    if (i >= 0) m.objects.splice(i, 1);
    rebuildSolid(m);
  };

  /* --------------------------------------------------------- rendering */
  let waterFrame = 0;
  W.tick = function (dt) {
    W._t = (W._t || 0) + dt;
    waterFrame = Math.floor(W._t / 500) % 2;
  };

  function tileCanvas(type) {
    if (type === "water0" || type === "water1") return A.tiles["water" + waterFrame];
    if (type === "soil") return A.tiles.soil;
    if (type === "soilWet") return A.tiles.soilWet;
    if (type === "grassDark") return A.tiles.grassDark;
    return A.tiles[type] || A.tiles.grass;
  }

  // draw ground + crops for the visible region; returns nothing.
  W.drawGround = function (ctx, m, cam, vw, vh) {
    const x0 = Math.max(0, Math.floor(cam.x / TS));
    const y0 = Math.max(0, Math.floor(cam.y / TS));
    const x1 = Math.min(m.w, Math.ceil((cam.x + vw) / TS));
    const y1 = Math.min(m.h, Math.ceil((cam.y + vh) / TS));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const sx = Math.round(x * TS - cam.x), sy = Math.round(y * TS - cam.y);
        ctx.drawImage(tileCanvas(m.ground[y][x]), sx, sy, TS, TS);
        const c = m.crops[x + "_" + y];
        if (c) {
          const def = D.crops[c.cropId];
          const spr = def.stages[c.stage];
          ctx.drawImage(spr, sx, sy, TS, TS);
        }
      }
    }
  };

  // Build a y-sorted list of drawable objects with their sprites/offsets.
  W.collectRenderables = function (m) {
    const list = [];
    for (const o of m.objects) {
      let spr, ow = TS, oh = TS, offx = 0, offy = 0, footY;
      switch (o.type) {
        case "tree":
          spr = A.obj.tree; ow = TS; oh = TS * 3;
          offx = -TS / 2; offy = -TS * 2; footY = (o.ty + 1) * TS; break;
        case "stump":
          spr = A.obj.stump; oh = TS * 3; offy = -TS * 2; offx = -TS / 2; footY = (o.ty + 1) * TS; break;
        case "house": case "shop":
          spr = A.obj[o.type]; ow = TS * 5; oh = TS * 4; offy = 0; footY = (o.ty + 4) * TS; break;
        case "bin":
          spr = A.obj.bin; ow = TS * 2; oh = TS * 2; footY = (o.ty + 2) * TS; break;
        case "bed":
          spr = A.obj.bed; ow = TS * 2; oh = TS * 3; offy = -TS; footY = (o.ty + 2) * TS; break;
        case "rock": spr = A.obj.rock; footY = (o.ty + 1) * TS; break;
        case "bush": spr = A.obj.bush; footY = (o.ty + 1) * TS; break;
        case "weed": spr = A.obj.weed; footY = (o.ty + 1) * TS; break;
        case "sign": spr = A.obj.sign; footY = (o.ty + 1) * TS; break;
        case "fence": spr = A.obj.fence; footY = (o.ty + 1) * TS; break;
        case "flower_a": case "flower_b": case "flower_c":
          spr = A.obj[o.type]; footY = (o.ty + 1) * TS; break;
        default: continue;
      }
      list.push({ spr, wx: o.tx * TS + offx, wy: o.ty * TS + offy, w: ow, h: oh, footY, obj: o });
    }
    return list;
  };

  /* -------------------------------------------------------- serialize */
  W.serialize = function () {
    const out = {};
    Object.keys(W.cache).forEach((id) => {
      const m = W.cache[id];
      out[id] = {
        ground: m.ground.map((r) => r.join(",")),
        crops: m.crops,
        objects: m.objects.map((o) => ({ type: o.type, tx: o.tx, ty: o.ty, w: o.w, h: o.h, hp: o.hp, kind: o.kind })),
      };
    });
    return { currentId: W.currentId, maps: out };
  };
  W.deserialize = function (data) {
    W.cache = {};
    Object.keys(data.maps).forEach((id) => {
      const bp = D.maps[id];
      const saved = data.maps[id];
      const m = { id, w: bp.w, h: bp.h, interior: !!bp.interior, warps: [], crops: saved.crops || {}, shopCounter: bp.shopCounter || null };
      m.ground = saved.ground.map((r) => r.split(","));
      m.objects = saved.objects.map((o) => Object.assign({}, o));
      // rebuild warps from blueprint
      (bp.buildings || []).forEach((b) => { if (b.door && b.warp) m.warps.push({ x: b.door.x, y: b.door.y, to: b.warp.to, tx: b.warp.tx, ty: b.warp.ty }); });
      (bp.warps || []).forEach((wp) => m.warps.push(wp));
      m.spawn = bp.spawn;
      rebuildSolid(m);
      W.cache[id] = m;
    });
    W.currentId = data.currentId;
  };
})();
