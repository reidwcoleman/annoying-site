/* ui.js — HUD, menus, dialogue, shop, and title/summary screens. */
(function () {
  "use strict";
  const A = window.Assets, D = window.GameData;
  const U = {};
  window.UI = U;

  const CW = 800, CH = 600;

  function panel(ctx, x, y, w, h, fill) {
    ctx.fillStyle = "rgba(30,20,12,0.92)";
    roundRect(ctx, x + 2, y + 3, w, h, 10); ctx.fill();
    ctx.fillStyle = fill || "#efe0c0";
    roundRect(ctx, x, y, w, h, 10); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#6b4a2b";
    roundRect(ctx, x, y, w, h, 10); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = "#b89968";
    roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 8); ctx.stroke();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  U.panel = panel; U.roundRect = roundRect;

  function text(ctx, str, x, y, size, color, align, weight) {
    ctx.font = (weight || "bold") + " " + (size || 16) + 'px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillText(str, x + 1, y + 1);
    ctx.fillStyle = color || "#3a2a18";
    ctx.fillText(str, x, y);
  }
  U.text = text;

  function fmtTime(min) {
    let h = Math.floor(min / 60), m = min % 60;
    const ap = h >= 12 && h < 24 ? "PM" : "AM";
    let hh = h % 12; if (hh === 0) hh = 12; if (h >= 24) hh = (h - 24) % 12 || 12;
    return hh + ":" + String(m).padStart(2, "0") + " " + ap;
  }
  U.fmtTime = fmtTime;

  /* --------------------------------------------------------------- HUD */
  U.drawHUD = function (ctx, g) {
    // clock / date panel (top-right)
    const pw = 176, ph = 92, px = CW - pw - 12, py = 12;
    panel(ctx, px, py, pw, ph);
    const season = D.SEASONS[g.season];
    text(ctx, "Day " + g.day + " · " + season, px + pw / 2, py + 26, 17, "#3a2a18", "center");
    text(ctx, "Year " + g.year, px + pw / 2, py + 44, 12, "#7a5a38", "center");
    // clock face
    const late = g.time >= 24 * 60;
    text(ctx, fmtTime(g.time), px + pw / 2, py + 70, 22, late ? "#a23b3b" : "#2a4a7a", "center");
    // gold
    ctx.drawImage(A.icons.coin, px + 12, py + 74, 16, 16);
    text(ctx, g.gold + "g", px + 32, py + 87, 15, "#7a5a10");

    // energy bar (bottom-right, vertical)
    const bx = CW - 34, by = CH - 200, bw = 20, bh = 160;
    ctx.fillStyle = "rgba(30,20,12,0.85)";
    roundRect(ctx, bx - 2, by - 2, bw + 4, bh + 4, 8); ctx.fill();
    ctx.fillStyle = "#3a2a18";
    roundRect(ctx, bx, by, bw, bh, 6); ctx.fill();
    const ratio = Math.max(0, g.energy / g.maxEnergy);
    const eh = bh * ratio;
    const col = ratio > 0.5 ? "#6cbf52" : ratio > 0.2 ? "#f2c14e" : "#d84f4f";
    ctx.fillStyle = col;
    roundRect(ctx, bx, by + (bh - eh), bw, eh, 6); ctx.fill();
    text(ctx, "E", bx + bw / 2, by - 8, 13, "#efe0c0", "center");

    U.drawHotbar(ctx, g);

    // location name (top-left, fades)
    if (g.locTimer > 0) {
      ctx.globalAlpha = Math.min(1, g.locTimer);
      panel(ctx, 12, 12, 190, 34);
      text(ctx, D.mapNames[g.map] || g.map, 12 + 95, 34, 16, "#3a2a18", "center");
      ctx.globalAlpha = 1;
    }
  };

  U.HOTBAR = 12;
  U.drawHotbar = function (ctx, g) {
    const n = U.HOTBAR, cell = 46, gap = 4;
    const totalW = n * cell + (n - 1) * gap;
    const x0 = (CW - totalW) / 2, y0 = CH - cell - 10;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (cell + gap);
      ctx.fillStyle = i === g.selected ? "#f4e9d0" : "rgba(40,28,16,0.8)";
      roundRect(ctx, x, y0, cell, cell, 6); ctx.fill();
      ctx.lineWidth = i === g.selected ? 3 : 2;
      ctx.strokeStyle = i === g.selected ? "#f2c14e" : "#6b4a2b";
      roundRect(ctx, x, y0, cell, cell, 6); ctx.stroke();
      const slot = g.hotbar[i];
      if (slot && slot.id) {
        const it = D.items[slot.id];
        if (it) ctx.drawImage(it.icon, x + 7, y0 + 5, 32, 32);
        if (slot.qty > 1) text(ctx, String(slot.qty), x + cell - 4, y0 + cell - 5, 12, "#fff", "right");
      }
      text(ctx, String((i + 1) % 10 === 0 && i < 9 ? "" : (i < 9 ? i + 1 : "")), x + 4, y0 + 13, 10, "#c8b48a");
    }
    // selected item name
    const sel = g.hotbar[g.selected];
    if (sel && sel.id && D.items[sel.id]) {
      const name = D.items[sel.id].name;
      ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
      const w = ctx.measureText(name).width + 24;
      panel(ctx, (CW - w) / 2, y0 - 30, w, 24);
      text(ctx, name, CW / 2, y0 - 13, 14, "#3a2a18", "center");
    }
  };

  /* ---------------------------------------------------------- DIALOGUE */
  U.drawDialogue = function (ctx, g) {
    const d = g.dialogue; if (!d) return;
    const w = CW - 80, h = 150, x = 40, y = CH - h - 30;
    panel(ctx, x, y, w, h);
    let tx = x + 26;
    if (d.portrait) {
      panel(ctx, x + 18, y + 22, 96, 96, "#cdbb95");
      ctx.drawImage(d.portrait, x + 26, y + 30, 80, 80);
      tx = x + 140;
    }
    if (d.name) text(ctx, d.name, tx, y + 34, 19, "#7a4a1a");
    // word-wrapped body
    wrapText(ctx, d.text, tx, y + (d.name ? 62 : 44), w - (tx - x) - 30, 24, 16, "#3a2a18");
    // prompt
    const blink = Math.floor(g.uiT * 2) % 2 === 0;
    if (blink) text(ctx, "▼ Space", x + w - 90, y + h - 14, 13, "#a2792a");
  };

  function wrapText(ctx, str, x, y, maxW, lh, size, color) {
    ctx.font = 'bold ' + size + 'px "Trebuchet MS", sans-serif';
    const words = str.split(" ");
    let line = "", yy = y;
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        text(ctx, line, x, yy, size, color); line = word; yy += lh;
      } else line = test;
    }
    if (line) text(ctx, line, x, yy, size, color);
  }
  U.wrapText = wrapText;

  /* --------------------------------------------------------- INVENTORY */
  U.drawInventory = function (ctx, g) {
    dim(ctx);
    const cols = 8, rows = 4, cell = 58, gap = 6;
    const w = cols * cell + (cols - 1) * gap + 40;
    const h = rows * cell + (rows - 1) * gap + 90;
    const x = (CW - w) / 2, y = (CH - h) / 2;
    panel(ctx, x, y, w, h);
    text(ctx, "Backpack", x + w / 2, y + 34, 22, "#7a4a1a", "center");
    const gx = x + 20, gy = y + 50;
    for (let i = 0; i < cols * rows; i++) {
      const cx = gx + (i % cols) * (cell + gap);
      const cy = gy + Math.floor(i / cols) * (cell + gap);
      ctx.fillStyle = i === g.invSel ? "#f4e9d0" : "rgba(60,42,24,0.5)";
      roundRect(ctx, cx, cy, cell, cell, 6); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = i === g.invSel ? "#f2c14e" : "#8a6a44";
      roundRect(ctx, cx, cy, cell, cell, 6); ctx.stroke();
      const slot = g.inventory[i];
      if (slot && slot.id && D.items[slot.id]) {
        ctx.drawImage(D.items[slot.id].icon, cx + 11, cy + 8, 36, 36);
        if (slot.qty > 1) text(ctx, String(slot.qty), cx + cell - 5, cy + cell - 6, 13, "#fff", "right");
      }
    }
    // detail of selected
    const sel = g.inventory[g.invSel];
    if (sel && sel.id && D.items[sel.id]) {
      const it = D.items[sel.id];
      const info = it.name + (it.sell ? "  ·  sells for " + it.sell + "g" : "");
      text(ctx, info, x + w / 2, y + h - 20, 15, "#3a2a18", "center");
    } else {
      text(ctx, "E / Esc to close", x + w / 2, y + h - 20, 13, "#7a5a38", "center");
    }
  };

  /* -------------------------------------------------------------- SHOP */
  U.drawShop = function (ctx, g) {
    dim(ctx);
    const w = 460, h = 476, x = (CW - w) / 2, y = (CH - h) / 2;
    panel(ctx, x, y, w, h);
    text(ctx, "General Store", x + w / 2, y + 36, 24, "#7a4a1a", "center");
    ctx.drawImage(A.icons.coin, x + 24, y + 22, 18, 18);
    text(ctx, g.gold + "g", x + 46, y + 37, 16, "#7a5a10");

    const list = g.shop.list;
    const ry = y + 58, rh = 48;
    for (let i = 0; i < list.length; i++) {
      const it = D.items[list[i]];
      const sy = ry + i * rh;
      const on = i === g.shop.sel;
      ctx.fillStyle = on ? "rgba(242,193,78,0.35)" : "rgba(60,42,24,0.15)";
      roundRect(ctx, x + 16, sy, w - 32, rh - 6, 6); ctx.fill();
      if (on) { ctx.lineWidth = 2; ctx.strokeStyle = "#f2c14e"; roundRect(ctx, x + 16, sy, w - 32, rh - 6, 6); ctx.stroke(); }
      ctx.drawImage(it.icon, x + 26, sy + 5, 32, 32);
      text(ctx, it.name, x + 68, sy + 27, 16, "#3a2a18");
      const price = it.cost || it.sell || 0;
      const afford = g.gold >= price;
      text(ctx, price + "g", x + w - 30, sy + 27, 16, afford ? "#2a6a2a" : "#a23b3b", "right");
    }
    text(ctx, "↑↓ choose · Space buy · Esc leave", x + w / 2, y + h - 18, 13, "#7a5a38", "center");
  };

  /* ------------------------------------------------------- DAY SUMMARY */
  U.drawSummary = function (ctx, g) {
    ctx.fillStyle = "#12100a"; ctx.fillRect(0, 0, CW, CH);
    const s = g.summary;
    const w = 460, h = 340, x = (CW - w) / 2, y = (CH - h) / 2;
    panel(ctx, x, y, w, h);
    text(ctx, s.title, x + w / 2, y + 44, 24, "#7a4a1a", "center");
    text(ctx, s.subtitle, x + w / 2, y + 72, 15, "#5a4028", "center");
    let ly = y + 110;
    if (s.sales.length === 0) {
      text(ctx, "Nothing in the shipping bin today.", x + w / 2, ly + 20, 15, "#7a5a38", "center");
    } else {
      text(ctx, "Shipping Bin", x + 40, ly, 16, "#7a4a1a");
      ly += 26;
      s.sales.forEach((row) => {
        const it = D.items[row.id];
        if (it) ctx.drawImage(it.icon, x + 44, ly - 14, 18, 18);
        text(ctx, (it ? it.name : row.id) + " ×" + row.qty, x + 70, ly, 15, "#3a2a18");
        text(ctx, "+" + row.total + "g", x + w - 40, ly, 15, "#2a6a2a", "right");
        ly += 24;
      });
      ly += 8;
      text(ctx, "Total earned", x + 40, ly, 16, "#7a4a1a");
      text(ctx, "+" + s.totalEarned + "g", x + w - 40, ly, 16, "#2a6a2a", "right");
    }
    const blink = Math.floor(g.uiT * 2) % 2 === 0;
    if (blink) text(ctx, "Press Space", x + w / 2, y + h - 22, 15, "#a2792a", "center");
  };

  /* ------------------------------------------------------------ TITLE */
  U.drawTitle = function (ctx, g) {
    // sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, CH);
    grad.addColorStop(0, "#f7c98a"); grad.addColorStop(0.5, "#f0a86a"); grad.addColorStop(1, "#5aa845");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, CW, CH);
    // sun
    ctx.fillStyle = "#fff2c4"; ctx.beginPath(); ctx.arc(CW / 2, 180, 70, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(CW / 2, 180, 95, 0, 7); ctx.fill();
    // rolling hills
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = ["#4c9539", "#3f7f34", "#356b2c"][i];
      ctx.beginPath();
      const base = 380 + i * 60;
      ctx.moveTo(0, base);
      for (let xx = 0; xx <= CW; xx += 40)
        ctx.lineTo(xx, base - Math.sin((xx / 120) + i) * 26);
      ctx.lineTo(CW, CH); ctx.lineTo(0, CH); ctx.closePath(); ctx.fill();
    }
    // title
    ctx.textAlign = "center";
    ctx.font = 'bold 62px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = "rgba(60,30,10,0.5)"; ctx.fillText("Willowmere", CW / 2 + 3, 143);
    ctx.fillStyle = "#fff6e0"; ctx.fillText("Willowmere", CW / 2, 140);
    ctx.font = 'bold 30px "Trebuchet MS", sans-serif';
    ctx.fillStyle = "#7a3a10"; ctx.fillText("~ Valley ~", CW / 2, 178);

    // menu
    const items = g.hasSave ? ["Continue", "New Game"] : ["New Game"];
    const my = 430;
    items.forEach((label, i) => {
      const on = i === g.titleSel;
      const w = 240, x = (CW - w) / 2, y = my + i * 56;
      panel(ctx, x, y, w, 44, on ? "#fff2c4" : "#efe0c0");
      text(ctx, label, CW / 2, y + 29, 20, on ? "#7a3a10" : "#5a4028", "center");
      if (on) text(ctx, "▶", x - 6, y + 29, 20, "#7a3a10", "right");
    });
    text(ctx, "A cozy farming life — original tale, original folks.", CW / 2, CH - 24, 14, "#3a2a18", "center");
    ctx.textAlign = "left";
  };

  /* ------------------------------------------------------------ misc */
  function dim(ctx) { ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, CW, CH); }
  U.dim = dim;

  // transient toast messages
  U.drawToasts = function (ctx, g) {
    let y = 90;
    g.toasts.forEach((t) => {
      const alpha = Math.min(1, t.life);
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
      const w = ctx.measureText(t.msg).width + 30;
      panel(ctx, (CW - w) / 2, y, w, 30);
      text(ctx, t.msg, CW / 2, y + 20, 15, t.color || "#3a2a18", "center");
      ctx.globalAlpha = 1;
      y += 38;
    });
  };

  // night overlay tint based on time
  U.drawNightTint = function (ctx, g) {
    let a = 0;
    if (g.time >= 18 * 60) a = Math.min(0.5, (g.time - 18 * 60) / (7 * 60) * 0.5);
    if (g.map === "farmhouse" || g.map === "shop_interior") a = Math.min(a, 0.12);
    if (a > 0) {
      ctx.fillStyle = "rgba(20,24,60," + a + ")";
      ctx.fillRect(0, 0, CW, CH);
    }
  };
})();
