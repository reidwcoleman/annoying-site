# Willowmere Valley — Design Document

A Stardew Valley–inspired farming life-sim, built as a self-contained HTML5 Canvas
game with vanilla JavaScript. All art is drawn procedurally at runtime (16×16 pixel
sprites scaled up with nearest-neighbour), so the game has **no external assets** and
runs by simply opening `index.html`.

## Original story & setting

You inherit your late **Aunt Marigold's** neglected farm on the edge of **Willowmere**,
a quiet valley town that has seen better days. Trade the city grind for dirt under your
nails: clear the land, raise crops, and slowly win over the townsfolk.

### Original cast
- **Mayor Mira** — runs the town, warm but overworked.
- **Hazel** — the sharp-tongued carpenter who rebuilds your farm.
- **Dr. Elias** — the perpetually exhausted clinic doctor.
- **Juniper** — a traveling musician who busks in the square.
- **Old Barnaby** — the fisherman at the pier who speaks in riddles.
- **Pip** — the general-store shopkeeper's excitable kid.

## Systems
- Tile world engine, camera, collision.
- Multiple connected maps: **Farm**, **Town**, **Forest**.
- Farming loop: hoe → till, watering can → water, plant seed, crops grow across days, harvest.
- Tools + 12-slot hotbar + backpack inventory.
- Energy (drains on tool use), Time-of-day clock, Day / Season calendar.
- Sleep to save the game and advance the day; **shipping bin** sells items overnight.
- **General Store** to buy seeds & tools with gold.
- NPCs with branching dialogue and a friendship meter.
- Save / load via `localStorage`.
- Title screen, HUD, inventory & calendar menus, end-of-day summary.
- Chiptune sound effects via WebAudio.

## File layout
- `index.html` — shell + canvas.
- `css/style.css` — layout & pixel-perfect scaling.
- `js/assets.js` — procedural pixel-art sprite factory + sprite library.
- `js/audio.js` — WebAudio chiptune SFX.
- `js/data.js` — items, crops, maps, NPCs, dialogue, story text.
- `js/world.js` — map/tile management, collision, transitions.
- `js/entities.js` — player + NPC entities.
- `js/ui.js` — HUD, menus, dialogue rendering.
- `js/game.js` — main loop, input, state machine, save/load.

## Controls
- **WASD / Arrows** — move
- **Space / Enter** — use tool / interact / advance dialogue
- **1–9, 0, -, =** — select hotbar slot (or scroll wheel)
- **E / I** — inventory
- **C** — calendar
- **Esc** — pause / close menu
