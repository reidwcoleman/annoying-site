/* assets.js — procedural pixel-art sprite factory for Willowmere Valley.
   Everything is drawn to small offscreen canvases (16px base grid) and scaled
   up with nearest-neighbour at render time, giving a crisp SNES-era look with
   zero external image files. */
(function () {
  "use strict";

  const A = {};
  window.Assets = A;

  A.TILE = 16;        // native pixels per tile
  A.SCALE = 3;        // default render scale (48px tiles)

  function make(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    x.imageSmoothingEnabled = false;
    return { c, x };
  }
  A.make = make;

  // Draw a sprite from an array of equal-length strings using a palette map.
  // "." (or " ") = transparent.
  function fromRows(rows, pal, px) {
    px = px || 1;
    const h = rows.length, w = rows[0].length;
    const { c, x } = make(w * px, h * px);
    for (let r = 0; r < h; r++) {
      for (let col = 0; col < w; col++) {
        const ch = rows[r][col];
        if (ch === "." || ch === " ") continue;
        const color = pal[ch];
        if (!color) continue;
        x.fillStyle = color;
        x.fillRect(col * px, r * px, px, px);
      }
    }
    return c;
  }
  A.fromRows = fromRows;

  function rect(x, px, py, w, h, color) { x.fillStyle = color; x.fillRect(px, py, w, h); }

  // small deterministic noise helper for texturing tiles
  function speck(x, cells, color) {
    x.fillStyle = color;
    cells.forEach(([cx, cy]) => x.fillRect(cx, cy, 1, 1));
  }

  /* ---------------------------------------------------------------- TILES */
  const T = A.tiles = {};

  function grassTile(base, blades) {
    const { c, x } = make(16, 16);
    rect(x, 0, 0, 16, 16, base);
    speck(x, [[2,3],[7,2],[11,5],[4,9],[13,10],[9,12],[1,13],[14,4]], blades);
    speck(x, [[5,6],[10,8],[3,11],[12,14]], "#3f7f34");
    return c;
  }
  T.grass = grassTile("#5aa845", "#6cbf52");
  T.grassDark = grassTile("#4c9539", "#5aa845");

  (function path() {
    const { c, x } = make(16, 16);
    rect(x, 0, 0, 16, 16, "#c8a877");
    rect(x, 0, 0, 16, 16, "#c8a877");
    speck(x, [[3,3],[9,4],[12,8],[5,11],[8,13],[2,9],[13,13]], "#b3925f");
    speck(x, [[6,6],[11,11]], "#d9bd8e");
    T.path = c;
  })();

  (function soil() {
    const dry = make(16, 16);
    rect(dry.x, 0, 0, 16, 16, "#7a5230");
    for (let i = 0; i < 16; i += 4) { rect(dry.x, 0, i, 16, 1, "#5f3f22"); }
    speck(dry.x, [[3,2],[9,6],[12,10],[5,14]], "#8a5f38");
    T.soil = dry.c;

    const wet = make(16, 16);
    rect(wet.x, 0, 0, 16, 16, "#4e3320");
    for (let i = 0; i < 16; i += 4) { rect(wet.x, 0, i, 16, 1, "#3a2515"); }
    speck(wet.x, [[3,2],[9,6],[12,10],[5,14]], "#5a3c24");
    T.soilWet = wet.c;
  })();

  (function water() {
    for (let f = 0; f < 2; f++) {
      const { c, x } = make(16, 16);
      rect(x, 0, 0, 16, 16, "#3b7dd8");
      rect(x, 0, 0, 16, 16, "#3b7dd8");
      const off = f * 3;
      x.fillStyle = "#6fa8 ".trim() + "e6";
      speck(x, [[(2+off)%16,4],[(7+off)%16,8],[(11+off)%16,12],[(4+off)%16,13]], "#7cb3f0");
      speck(x, [[(9+off)%16,3],[(1+off)%16,10]], "#2f66b8");
      T["water" + f] = c;
    }
  })();

  (function floorAndWall() {
    const fl = make(16, 16);
    rect(fl.x, 0, 0, 16, 16, "#a9743f");
    for (let i = 0; i < 16; i += 4) rect(fl.x, 0, i, 16, 1, "#8a5c30");
    for (let i = 0; i < 16; i += 8) rect(fl.x, i, 0, 1, 16, "#8a5c30");
    T.floor = fl.c;

    const rug = make(16, 16);
    rect(rug.x, 0, 0, 16, 16, "#8a3b3b");
    rect(rug.x, 1, 1, 14, 14, "#a94d4d");
    rect(rug.x, 3, 3, 10, 10, "#c76a6a");
    T.rug = rug.c;

    const wall = make(16, 16);
    rect(wall.x, 0, 0, 16, 16, "#c7b79a");
    rect(wall.x, 0, 12, 16, 4, "#9c8a6c");
    T.wall = wall.c;
  })();

  (function sand() {
    const { c, x } = make(16, 16);
    rect(x, 0, 0, 16, 16, "#e0cf94");
    speck(x, [[3,3],[9,5],[12,9],[5,12],[8,14],[14,2]], "#cdb877");
    T.sand = c;
  })();

  /* -------------------------------------------------------------- OBJECTS */
  const O = A.obj = {};

  // Tree — rendered 32x48 (2 tiles wide, 3 tall). Trunk anchored to bottom tile.
  (function tree() {
    const { c, x } = make(32, 48);
    // canopy
    x.fillStyle = "#2f6b2a";
    x.beginPath(); x.arc(16, 16, 15, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#3c8534";
    x.beginPath(); x.arc(13, 13, 11, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#57a84a";
    x.beginPath(); x.arc(11, 11, 6, 0, Math.PI * 2); x.fill();
    // trunk
    rect(x, 13, 26, 6, 18, "#6b4a2b");
    rect(x, 13, 26, 2, 18, "#7d5a37");
    rect(x, 17, 26, 2, 18, "#553a20");
    O.tree = c;

    // stump
    const s = make(32, 48);
    rect(s.x, 12, 34, 8, 10, "#6b4a2b");
    rect(s.x, 11, 32, 10, 4, "#8a6a44");
    rect(s.x, 13, 33, 6, 2, "#a07d52");
    O.stump = s.c;
  })();

  (function rockAndBush() {
    const r = make(16, 16);
    r.x.fillStyle = "#8b8b93";
    r.x.beginPath(); r.x.moveTo(2, 14); r.x.lineTo(4, 6); r.x.lineTo(9, 3);
    r.x.lineTo(14, 8); r.x.lineTo(14, 14); r.x.closePath(); r.x.fill();
    r.x.fillStyle = "#a6a6ad"; rect(r.x, 5, 6, 4, 3, "#a6a6ad");
    r.x.fillStyle = "#6f6f77"; rect(r.x, 2, 13, 12, 1, "#6f6f77");
    O.rock = r.c;

    const b = make(16, 16);
    b.x.fillStyle = "#2f6b2a";
    b.x.beginPath(); b.x.arc(8, 10, 6, 0, Math.PI * 2); b.x.fill();
    b.x.fillStyle = "#3c8534";
    b.x.beginPath(); b.x.arc(6, 8, 4, 0, Math.PI * 2); b.x.fill();
    speck(b.x, [[9,7],[11,10],[5,11]], "#e05a8a"); // berries
    O.bush = b.c;

    const wd = make(16, 16); // weed
    wd.x.strokeStyle = "#4c9539"; wd.x.lineWidth = 1;
    [[5,15,3,8],[8,15,8,6],[8,15,12,9]].forEach(([x1,y1,x2,y2])=>{
      wd.x.beginPath(); wd.x.moveTo(x1,y1); wd.x.lineTo(x2,y2); wd.x.stroke();
    });
    O.weed = wd.c;
  })();

  (function flowers() {
    const cols = { a: "#e85d75", b: "#f2c14e", c: "#a86fd6" };
    Object.keys(cols).forEach((k) => {
      const { c, x } = make(16, 16);
      rect(x, 7, 8, 1, 6, "#3c8534");
      x.fillStyle = cols[k];
      rect(x, 6, 6, 3, 3, cols[k]);
      rect(x, 5, 7, 1, 1, cols[k]); rect(x, 9, 7, 1, 1, cols[k]);
      rect(x, 7, 5, 1, 1, cols[k]); rect(x, 7, 9, 1, 1, cols[k]);
      rect(x, 7, 7, 1, 1, "#f7e08a");
      O["flower_" + k] = c;
    });
  })();

  // House — 5 tiles wide, 4 tall (80x64). Door bottom-center.
  (function house() {
    const { c, x } = make(80, 64);
    rect(x, 4, 20, 72, 44, "#d8b98c");   // walls
    rect(x, 4, 20, 72, 4, "#b89968");
    // roof
    x.fillStyle = "#a23b3b";
    x.beginPath(); x.moveTo(0, 22); x.lineTo(40, 0); x.lineTo(80, 22); x.closePath(); x.fill();
    x.fillStyle = "#8a2f2f";
    x.beginPath(); x.moveTo(0, 22); x.lineTo(40, 4); x.lineTo(80, 22); x.lineTo(80, 26);
    x.lineTo(40, 8); x.lineTo(0, 26); x.closePath(); x.fill();
    // door
    rect(x, 33, 40, 14, 24, "#6b4a2b");
    rect(x, 35, 42, 10, 22, "#7d5a37");
    rect(x, 43, 52, 2, 2, "#f2c14e");
    // windows
    rect(x, 14, 30, 12, 12, "#7cc0e8"); rect(x, 14, 30, 12, 12, "#7cc0e8");
    rect(x, 54, 30, 12, 12, "#7cc0e8");
    x.strokeStyle = "#6b4a2b";
    x.strokeRect(14, 30, 12, 12); x.strokeRect(54, 30, 12, 12);
    x.beginPath(); x.moveTo(20,30); x.lineTo(20,42); x.moveTo(14,36); x.lineTo(26,36); x.stroke();
    x.beginPath(); x.moveTo(60,30); x.lineTo(60,42); x.moveTo(54,36); x.lineTo(66,36); x.stroke();
    O.house = c;
  })();

  // Shop building — blue-roofed, 5x4
  (function shop() {
    const { c, x } = make(80, 64);
    rect(x, 4, 20, 72, 44, "#e6d8b0");
    x.fillStyle = "#3b6fa2";
    x.beginPath(); x.moveTo(0, 22); x.lineTo(40, 0); x.lineTo(80, 22); x.closePath(); x.fill();
    x.fillStyle = "#2f5885";
    x.beginPath(); x.moveTo(0,22); x.lineTo(40,4); x.lineTo(80,22); x.lineTo(80,26); x.lineTo(40,8); x.lineTo(0,26); x.closePath(); x.fill();
    rect(x, 33, 40, 14, 24, "#6b4a2b");
    rect(x, 35, 42, 10, 22, "#8a5c30");
    // awning
    for (let i = 0; i < 6; i++) rect(x, 8 + i * 11, 24, 11, 5, i % 2 ? "#d84f4f" : "#f4e9d0");
    rect(x, 50, 30, 20, 10, "#7cc0e8");
    O.shop = c;
  })();

  (function bed() {
    const { c, x } = make(32, 48);
    rect(x, 4, 6, 24, 40, "#8a5c30");   // frame
    rect(x, 6, 8, 20, 22, "#e0d6c0");   // pillow area / sheet
    rect(x, 6, 8, 20, 8, "#f4f0e6");    // pillow
    rect(x, 6, 18, 20, 26, "#c05a6a");  // blanket
    rect(x, 6, 18, 20, 3, "#d8737f");
    O.bed = c;
  })();

  (function shippingBin() {
    const { c, x } = make(32, 32);
    rect(x, 2, 10, 28, 20, "#8a5c30");
    rect(x, 2, 6, 28, 6, "#6b4a2b");    // lid
    rect(x, 2, 6, 28, 2, "#a07d52");
    rect(x, 4, 14, 24, 3, "#5f3f22");
    rect(x, 4, 20, 24, 3, "#5f3f22");
    O.bin = c;
  })();

  (function sign() {
    const { c, x } = make(16, 16);
    rect(x, 7, 8, 2, 8, "#6b4a2b");
    rect(x, 2, 3, 12, 8, "#a07d52");
    rect(x, 2, 3, 12, 8, "#a07d52");
    x.strokeStyle = "#6b4a2b"; x.strokeRect(2, 3, 12, 8);
    speck(x, [[4,5],[7,5],[10,5],[4,8],[9,8]], "#5f3f22");
    O.sign = c;
  })();

  (function fence() {
    const { c, x } = make(16, 16);
    rect(x, 2, 4, 2, 12, "#8a5c30");
    rect(x, 12, 4, 2, 12, "#8a5c30");
    rect(x, 0, 6, 16, 2, "#a07d52");
    rect(x, 0, 11, 16, 2, "#a07d52");
    O.fence = c;
  })();

  /* --------------------------------------------------------------- CROPS */
  // Each crop = array of 5 growth-stage canvases (16x16). Final has fruit.
  A.crops = {};
  function cropStages(fruitColor, leafColor) {
    leafColor = leafColor || "#3c8534";
    const stages = [];
    // stage 0: sprout
    let s = make(16, 16);
    rect(s.x, 7, 12, 2, 3, leafColor);
    rect(s.x, 6, 11, 4, 1, leafColor);
    stages.push(s.c);
    // stage 1
    s = make(16, 16);
    rect(s.x, 7, 9, 2, 6, leafColor);
    rect(s.x, 4, 9, 3, 1, leafColor); rect(s.x, 9, 8, 3, 1, leafColor);
    stages.push(s.c);
    // stage 2
    s = make(16, 16);
    rect(s.x, 7, 6, 2, 9, leafColor);
    rect(s.x, 3, 7, 4, 1, leafColor); rect(s.x, 9, 6, 4, 1, leafColor);
    rect(s.x, 4, 10, 3, 1, leafColor); rect(s.x, 9, 9, 3, 1, leafColor);
    stages.push(s.c);
    // stage 3: budding
    s = make(16, 16);
    rect(s.x, 7, 4, 2, 11, leafColor);
    rect(s.x, 2, 6, 5, 1, leafColor); rect(s.x, 9, 5, 5, 1, leafColor);
    rect(s.x, 3, 9, 4, 1, leafColor); rect(s.x, 9, 8, 4, 1, leafColor);
    s.x.fillStyle = "#2f6b2a"; s.x.beginPath(); s.x.arc(8, 5, 2, 0, 7); s.x.fill();
    stages.push(s.c);
    // stage 4: mature with fruit
    s = make(16, 16);
    rect(s.x, 7, 4, 2, 11, leafColor);
    rect(s.x, 2, 7, 5, 1, leafColor); rect(s.x, 9, 6, 5, 1, leafColor);
    s.x.fillStyle = fruitColor;
    s.x.beginPath(); s.x.arc(5, 9, 3, 0, 7); s.x.fill();
    s.x.beginPath(); s.x.arc(11, 7, 3, 0, 7); s.x.fill();
    s.x.beginPath(); s.x.arc(8, 12, 3, 0, 7); s.x.fill();
    s.x.fillStyle = "rgba(255,255,255,0.35)";
    s.x.fillRect(4, 8, 1, 1); s.x.fillRect(10, 6, 1, 1); s.x.fillRect(7, 11, 1, 1);
    stages.push(s.c);
    return stages;
  }
  A.cropStages = cropStages;

  /* --------------------------------------------------------- ITEM ICONS */
  const I = A.icons = {};

  (function tools() {
    // Hoe
    let s = make(16, 16);
    rect(s.x, 4, 3, 2, 10, "#a07d52"); rect(s.x, 4, 3, 2, 10, "#a07d52");
    rect(s.x, 6, 3, 6, 2, "#c9ccd4");
    I.hoe = s.c;
    // Watering can
    s = make(16, 16);
    rect(s.x, 4, 6, 7, 6, "#4a90d6");
    rect(s.x, 5, 4, 4, 2, "#4a90d6");
    rect(s.x, 10, 5, 4, 2, "#6aa8e0"); // spout
    rect(s.x, 3, 4, 2, 5, "#3b6fa2"); // handle
    I.can = s.c;
    // Axe
    s = make(16, 16);
    rect(s.x, 8, 4, 2, 10, "#8a5c30");
    s.x.fillStyle = "#c9ccd4";
    s.x.beginPath(); s.x.moveTo(9,3); s.x.lineTo(14,5); s.x.lineTo(14,9); s.x.lineTo(9,8); s.x.closePath(); s.x.fill();
    I.axe = s.c;
    // Pickaxe
    s = make(16, 16);
    rect(s.x, 8, 5, 2, 9, "#8a5c30");
    s.x.strokeStyle = "#c9ccd4"; s.x.lineWidth = 2;
    s.x.beginPath(); s.x.moveTo(3,7); s.x.quadraticCurveTo(9,2,15,7); s.x.stroke();
    I.pick = s.c;
    // Scythe
    s = make(16, 16);
    rect(s.x, 9, 4, 2, 10, "#8a5c30");
    s.x.strokeStyle = "#c9ccd4"; s.x.lineWidth = 2;
    s.x.beginPath(); s.x.moveTo(3,6); s.x.quadraticCurveTo(4,11,11,10); s.x.stroke();
    I.scythe = s.c;
  })();

  function seedIcon(color) {
    const { c, x } = make(16, 16);
    rect(x, 3, 3, 10, 10, "#c8a877");
    rect(x, 3, 3, 10, 2, "#b3925f");
    x.fillStyle = color;
    x.fillRect(5, 6, 2, 2); x.fillRect(9, 6, 2, 2); x.fillRect(7, 9, 2, 2);
    return c;
  }
  A.seedIcon = seedIcon;

  function produceIcon(color, leaf) {
    const { c, x } = make(16, 16);
    x.fillStyle = color;
    x.beginPath(); x.arc(8, 9, 5, 0, 7); x.fill();
    x.fillStyle = leaf || "#3c8534";
    rect(x, 7, 2, 2, 3, leaf || "#3c8534");
    rect(x, 5, 3, 2, 1, leaf || "#3c8534");
    x.fillStyle = "rgba(255,255,255,0.4)"; x.fillRect(6, 7, 1, 1);
    return c;
  }
  A.produceIcon = produceIcon;

  (function misc() {
    // Coin
    let s = make(16, 16);
    s.x.fillStyle = "#f2c14e"; s.x.beginPath(); s.x.arc(8,8,6,0,7); s.x.fill();
    s.x.fillStyle = "#d89a2e"; s.x.beginPath(); s.x.arc(8,8,6,0,7); s.x.lineWidth=1; s.x.stroke();
    s.x.fillStyle = "#fff2c4"; rect(s.x, 7, 4, 2, 8, "#fff2c4");
    I.coin = s.c;
    // Wood
    s = make(16, 16);
    rect(s.x, 2, 6, 12, 5, "#8a5c30"); rect(s.x, 2, 6, 12, 5, "#8a5c30");
    rect(s.x, 2, 6, 12, 1, "#a07d52");
    s.x.fillStyle = "#c8a877"; s.x.beginPath(); s.x.arc(3,8,2,0,7); s.x.fill();
    I.wood = s.c;
    // Stone
    s = make(16, 16);
    s.x.fillStyle = "#8b8b93"; s.x.beginPath(); s.x.arc(8,9,5,0,7); s.x.fill();
    s.x.fillStyle = "#a6a6ad"; rect(s.x, 6, 6, 3, 2, "#a6a6ad");
    I.stone = s.c;
    // Fish
    s = make(16, 16);
    s.x.fillStyle = "#6aa8e0";
    s.x.beginPath(); s.x.ellipse(7, 8, 5, 3, 0, 0, 7); s.x.fill();
    s.x.beginPath(); s.x.moveTo(12,8); s.x.lineTo(15,5); s.x.lineTo(15,11); s.x.closePath(); s.x.fill();
    s.x.fillStyle = "#1b2a1f"; s.x.fillRect(4, 7, 1, 1);
    I.fish = s.c;
    // Gift box
    s = make(16, 16);
    rect(s.x, 3, 6, 10, 8, "#c05a6a"); rect(s.x, 7, 6, 2, 8, "#f2c14e");
    rect(s.x, 3, 5, 10, 2, "#f2c14e"); rect(s.x, 6, 3, 4, 3, "#f2c14e");
    I.gift = s.c;
  })();

  /* ---------------------------------------------------- CHARACTER FACTORY */
  // Build a directional walk sheet for a humanoid from a color set.
  // Returns { down:[c0,c1,c2], up:[...], left:[...], right:[...] } at 16x24.
  A.character = function (col) {
    const skin = col.skin || "#e8b892";
    const hair = col.hair || "#4a2f1a";
    const shirt = col.shirt || "#3b6fa2";
    const pants = col.pants || "#3a2f4a";
    const shoe = col.shoe || "#3a2517";
    const outline = "rgba(0,0,0,0.25)";

    function frame(dir, step) {
      const { c, x } = make(16, 24);
      const legY = 19;
      const bob = step === 1 ? 1 : 0;
      const y0 = 1 + bob;
      // legs (step animation)
      const lx = step === 1 ? 5 : (step === 2 ? 7 : 6);
      const rx = step === 1 ? 8 : (step === 2 ? 6 : 7);
      rect(x, lx, legY, 2, 3, pants);
      rect(x, rx, legY, 2, 3, pants);
      rect(x, lx, legY + 3, 2, 1, shoe);
      rect(x, rx, legY + 3, 2, 1, shoe);
      // body
      rect(x, 5, y0 + 10, 6, 8, shirt);
      rect(x, 5, y0 + 10, 6, 1, "rgba(255,255,255,0.15)");
      // arms
      rect(x, 4, y0 + 11, 1, 5, skin);
      rect(x, 11, y0 + 11, 1, 5, skin);
      // head
      rect(x, 5, y0 + 3, 6, 7, skin);
      // hair + face by direction
      if (dir === "up") {
        rect(x, 4, y0 + 2, 8, 6, hair);           // back of head
        rect(x, 5, y0 + 8, 6, 2, hair);
      } else if (dir === "down") {
        rect(x, 4, y0 + 2, 8, 4, hair);           // fringe
        rect(x, 4, y0 + 2, 1, 6, hair); rect(x, 11, y0 + 2, 1, 6, hair);
        rect(x, 6, y0 + 6, 1, 1, "#26221c");      // eyes
        rect(x, 9, y0 + 6, 1, 1, "#26221c");
        rect(x, 7, y0 + 8, 2, 1, "#c77d6a");      // mouth
      } else {
        // side
        rect(x, 4, y0 + 2, 8, 4, hair);
        rect(x, 4, y0 + 2, 1, 6, hair);
        const eyeX = dir === "left" ? 6 : 9;
        rect(x, eyeX, y0 + 6, 1, 1, "#26221c");
        rect(x, dir === "left" ? 5 : 10, y0 + 8, 2, 1, "#c77d6a");
      }
      // subtle outline base
      x.fillStyle = outline; x.fillRect(5, legY + 4, 7, 1);
      return c;
    }

    return {
      down:  [frame("down", 0),  frame("down", 1),  frame("down", 2)],
      up:    [frame("up", 0),    frame("up", 1),    frame("up", 2)],
      left:  [frame("left", 0),  frame("left", 1),  frame("left", 2)],
      right: [frame("right", 0), frame("right", 1), frame("right", 2)],
    };
  };

  /* portrait (48x48) for dialogue box */
  A.portrait = function (col) {
    const { c, x } = make(48, 48);
    rect(x, 0, 0, 48, 48, "#2c3e2f");
    const skin = col.skin || "#e8b892", hair = col.hair || "#4a2f1a", shirt = col.shirt || "#3b6fa2";
    rect(x, 12, 34, 24, 14, shirt);        // shoulders
    rect(x, 15, 12, 18, 22, skin);          // face
    rect(x, 13, 8, 22, 10, hair);           // hair top
    rect(x, 13, 8, 4, 20, hair);            // sides
    rect(x, 31, 8, 4, 20, hair);
    rect(x, 19, 22, 3, 3, "#26221c");       // eyes
    rect(x, 26, 22, 3, 3, "#26221c");
    rect(x, 21, 29, 6, 2, "#c77d6a");       // mouth
    rect(x, 17, 20, 14, 1, "rgba(0,0,0,0.1)");
    return c;
  };

  A.ready = true;
})();
