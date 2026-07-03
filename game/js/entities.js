/* entities.js — Player and NPC entities (movement, animation, collision). */
(function () {
  "use strict";
  const A = window.Assets, W = window.World, D = window.GameData;
  const TS = W.TS;
  const SW = 16 * A.SCALE, SH = 24 * A.SCALE; // sprite 48x72

  // feet hitbox within sprite
  const FX = 14, FY = 54, FW = 20, FH = 14;

  function boxSolid(m, px, py, w, h) {
    const tx0 = Math.floor(px / TS), ty0 = Math.floor(py / TS);
    const tx1 = Math.floor((px + w - 1) / TS), ty1 = Math.floor((py + h - 1) / TS);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++)
        if (W.isSolid(m, tx, ty)) return true;
    return false;
  }

  /* --------------------------------------------------------------- Player */
  function Player(sheetColors) {
    this.colors = sheetColors;
    this.sheet = A.character(sheetColors);
    this.x = 0; this.y = 0;      // top-left world px
    this.facing = "down";
    this.moving = false;
    this.frameT = 0; this.frameSeq = 0;
    this.speed = 165;            // px/sec
  }
  Player.prototype.placeTile = function (tx, ty) {
    this.x = tx * TS + (TS - SW) / 2;
    this.y = ty * TS + TS - SH + 6;
  };
  Player.prototype.feet = function () {
    return { x: this.x + FX, y: this.y + FY, w: FW, h: FH };
  };
  Player.prototype.centerTile = function () {
    return { x: Math.floor((this.x + SW / 2) / TS), y: Math.floor((this.y + FY + FH / 2) / TS) };
  };
  // tile the player is facing toward
  Player.prototype.facingTile = function () {
    const c = this.centerTile();
    if (this.facing === "up") c.y -= 1;
    else if (this.facing === "down") c.y += 1;
    else if (this.facing === "left") c.x -= 1;
    else c.x += 1;
    return c;
  };
  Player.prototype.update = function (dt, dx, dy, m) {
    this.moving = !!(dx || dy);
    if (dx !== 0) this.facing = dx < 0 ? "left" : "right";
    else if (dy !== 0) this.facing = dy < 0 ? "up" : "down";

    if (this.moving) {
      const len = Math.hypot(dx, dy) || 1;
      const mvx = (dx / len) * this.speed * dt;
      const mvy = (dy / len) * this.speed * dt;
      // X axis
      let f = this.feet();
      if (!boxSolid(m, f.x + mvx, f.y, f.w, f.h)) this.x += mvx;
      // Y axis
      f = this.feet();
      if (!boxSolid(m, f.x, f.y + mvy, f.w, f.h)) this.y += mvy;

      this.frameT += dt;
      if (this.frameT > 0.14) { this.frameT = 0; this.frameSeq = (this.frameSeq + 1) % 4; }
    } else {
      this.frameSeq = 0;
    }
  };
  Player.prototype.currentFrame = function () {
    const seq = [0, 1, 0, 2][this.frameSeq];
    return this.sheet[this.facing][seq];
  };
  Player.prototype.draw = function (ctx, cam) {
    ctx.drawImage(this.currentFrame(), Math.round(this.x - cam.x), Math.round(this.y - cam.y), SW, SH);
  };
  Player.prototype.footY = function () { return this.y + SH; };

  /* ----------------------------------------------------------------- NPC */
  function NPC(def) {
    this.def = def;
    this.name = def.name;
    this.sheet = A.character(def.colors);
    this.portrait = A.portrait(def.colors);
    this.facing = "down";
    this.homeTile = { x: def.x, y: def.y };
    this.x = def.x * TS + (TS - SW) / 2;
    this.y = def.y * TS + TS - SH + 6;
    this.frameT = 0; this.frameSeq = 0; this.moving = false;
    this.wanderT = 1 + Math.random() * 2;
    this.dir = { x: 0, y: 0 };
    this.lineIdx = 0;
  }
  NPC.prototype.feet = function () { return { x: this.x + FX, y: this.y + FY, w: FW, h: FH }; };
  NPC.prototype.tile = function () { return { x: Math.floor((this.x + SW / 2) / TS), y: Math.floor((this.y + FY + FH / 2) / TS) }; };
  NPC.prototype.update = function (dt, m) {
    if (!this.def.wander) { this.moving = false; this.frameSeq = 0; return; }
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = 1.5 + Math.random() * 3;
      const r = Math.random();
      if (r < 0.4) this.dir = { x: 0, y: 0 };
      else {
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const d = dirs[Math.floor(Math.random() * 4)];
        // stay near home
        const t = this.tile();
        if (Math.abs(t.x + d[0] - this.homeTile.x) > 3 || Math.abs(t.y + d[1] - this.homeTile.y) > 3)
          this.dir = { x: 0, y: 0 };
        else this.dir = { x: d[0], y: d[1] };
      }
    }
    this.moving = !!(this.dir.x || this.dir.y);
    if (this.moving) {
      this.facing = this.dir.x < 0 ? "left" : this.dir.x > 0 ? "right" : this.dir.y < 0 ? "up" : "down";
      const sp = 55 * dt;
      const f = this.feet();
      if (!boxSolid(m, f.x + this.dir.x * sp, f.y + this.dir.y * sp, f.w, f.h)) {
        this.x += this.dir.x * sp; this.y += this.dir.y * sp;
      } else { this.dir = { x: 0, y: 0 }; }
      this.frameT += dt;
      if (this.frameT > 0.16) { this.frameT = 0; this.frameSeq = (this.frameSeq + 1) % 4; }
    } else { this.frameSeq = 0; }
  };
  NPC.prototype.faceTo = function (px, py) {
    const dx = px - this.x, dy = py - this.y;
    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx < 0 ? "left" : "right";
    else this.facing = dy < 0 ? "up" : "down";
  };
  NPC.prototype.currentFrame = function () {
    const seq = [0, 1, 0, 2][this.frameSeq];
    return this.sheet[this.facing][seq];
  };
  NPC.prototype.draw = function (ctx, cam) {
    ctx.drawImage(this.currentFrame(), Math.round(this.x - cam.x), Math.round(this.y - cam.y), SW, SH);
  };
  NPC.prototype.footY = function () { return this.y + SH; };
  NPC.prototype.nextLine = function () {
    const line = this.def.lines[this.lineIdx % this.def.lines.length];
    this.lineIdx++;
    return line;
  };

  window.Player = Player;
  window.NPC = NPC;
  window.ENT = { SW, SH };
})();
