/* audio.js — tiny WebAudio chiptune SFX. No files; everything synthesized. */
(function () {
  "use strict";
  const S = {};
  window.Sound = S;

  let ctx = null;
  let enabled = true;

  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { enabled = false; }
    }
    return ctx;
  }
  S.resume = function () { const c = ac(); if (c && c.state === "suspended") c.resume(); };
  S.setEnabled = function (v) { enabled = v; };

  function blip(freq, dur, type, vol, slideTo) {
    if (!enabled) return;
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  S.step = function () { blip(180 + Math.random() * 30, 0.06, "triangle", 0.05); };
  S.hoe = function () { blip(140, 0.14, "sawtooth", 0.12, 90); };
  S.water = function () { blip(680, 0.18, "sine", 0.1, 320); };
  S.chop = function () { blip(120, 0.16, "square", 0.14, 70); };
  S.pick = function () { blip(300, 0.1, "square", 0.12, 160); };
  S.harvest = function () { blip(520, 0.09, "square", 0.13); setTimeout(() => blip(700, 0.12, "square", 0.13), 80); };
  S.plant = function () { blip(400, 0.08, "sine", 0.1, 520); };
  S.coin = function () { blip(880, 0.06, "square", 0.12); setTimeout(() => blip(1180, 0.1, "square", 0.12), 60); };
  S.select = function () { blip(600, 0.04, "square", 0.08); };
  S.talk = function () { blip(440, 0.05, "triangle", 0.07, 500); };
  S.error = function () { blip(160, 0.15, "sawtooth", 0.12, 120); };
  S.sleep = function () {
    [523, 392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.3, "sine", 0.1), i * 160));
  };
  S.newDay = function () {
    [392, 523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.22, "triangle", 0.1), i * 130));
  };
  S.levelup = function () {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.15, "square", 0.12), i * 90));
  };
})();
