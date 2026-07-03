/* data.js — game content: items, crops, NPCs, dialogue, story, map blueprints. */
(function () {
  "use strict";
  const A = window.Assets;
  const D = {};
  window.GameData = D;

  D.SEASONS = ["Spring", "Summer", "Fall", "Winter"];
  D.DAYS_PER_SEASON = 28;
  D.DAY_START = 6 * 60;   // 6:00 in minutes
  D.DAY_END = 26 * 60;    // 2:00 AM = collapse
  D.START_GOLD = 500;

  /* ------------------------------------------------------------- CROPS */
  // color = fruit color used for both crop sprite + produce icon
  const cropDefs = [
    { id: "parsnip",     name: "Parsnip",     color: "#e8d08a", leaf: "#8fae5a", days: 4, sell: 35,  seedCost: 20,  season: "Spring" },
    { id: "potato",      name: "Potato",      color: "#c69a5e", leaf: "#4c9539", days: 6, sell: 80,  seedCost: 50,  season: "Spring", chance: 0.2 },
    { id: "cauliflower", name: "Cauliflower", color: "#f2efe2", leaf: "#4c9539", days: 8, sell: 175, seedCost: 80,  season: "Spring" },
    { id: "strawberry",  name: "Strawberry",  color: "#e0405a", leaf: "#3c8534", days: 8, sell: 120, seedCost: 100, season: "Spring", regrow: 4 },
    { id: "corn",        name: "Corn",        color: "#f2c14e", leaf: "#4c9539", days: 8, sell: 50,  seedCost: 75,  season: "Summer", regrow: 4 },
    { id: "tomato",      name: "Tomato",      color: "#d84f4f", leaf: "#3c8534", days: 7, sell: 60,  seedCost: 50,  season: "Summer", regrow: 4 },
    { id: "pumpkin",     name: "Pumpkin",     color: "#e08a2e", leaf: "#4c9539", days: 9, sell: 320, seedCost: 100, season: "Fall" },
    { id: "melon",       name: "Melon",       color: "#8fc46a", leaf: "#3c8534", days: 9, sell: 250, seedCost: 80,  season: "Summer" },
  ];

  D.crops = {};
  D.items = {};

  function addItem(it) { D.items[it.id] = it; return it; }

  // base tools + materials
  addItem({ id: "hoe",    name: "Hoe",          type: "tool", icon: A.icons.hoe });
  addItem({ id: "can",    name: "Watering Can", type: "tool", icon: A.icons.can });
  addItem({ id: "axe",    name: "Axe",          type: "tool", icon: A.icons.axe });
  addItem({ id: "pick",   name: "Pickaxe",      type: "tool", icon: A.icons.pick });
  addItem({ id: "scythe", name: "Scythe",       type: "tool", icon: A.icons.scythe });

  addItem({ id: "wood",  name: "Wood",  type: "material", icon: A.icons.wood,  sell: 4 });
  addItem({ id: "stone", name: "Stone", type: "material", icon: A.icons.stone, sell: 3 });
  addItem({ id: "fiber", name: "Fiber", type: "material", icon: A.produceIcon("#8fae5a", "#4c9539"), sell: 2 });
  addItem({ id: "fish",  name: "River Fish", type: "food", icon: A.icons.fish, sell: 45 });

  cropDefs.forEach((c) => {
    const stages = A.cropStages(c.color, c.leaf);
    D.crops[c.id] = Object.assign({}, c, { stages });
    // produce item
    addItem({ id: c.id, name: c.name, type: "produce", icon: A.produceIcon(c.color, c.leaf), sell: c.sell });
    // seed item
    addItem({
      id: c.id + "_seed", name: c.name + " Seeds", type: "seed",
      icon: A.seedIcon(c.color), sell: Math.floor(c.seedCost / 2),
      cropId: c.id, cost: c.seedCost, season: c.season,
    });
  });

  /* ------------------------------------------------------------- SHOP */
  D.shopStock = [
    "parsnip_seed", "potato_seed", "cauliflower_seed", "strawberry_seed",
    "corn_seed", "tomato_seed", "melon_seed", "pumpkin_seed",
  ];

  /* ------------------------------------------------------------- NPCS */
  D.npcs = [
    {
      id: "mira", name: "Mayor Mira", map: "town", x: 15, y: 8,
      colors: { skin: "#d8a878", hair: "#8a8a8a", shirt: "#7a4fa2", pants: "#3a2f4a" },
      wander: true,
      lines: [
        "Welcome to Willowmere! We're a small town, but we look after our own.",
        "Your Aunt Marigold spoke of you often. She'd be glad the farm's in family hands.",
        "If you ever grow something special, the whole valley will hear about it.",
        "The old community board is looking a little bare these days... maybe you'll change that.",
      ],
    },
    {
      id: "hazel", name: "Hazel", map: "town", x: 6, y: 12,
      colors: { skin: "#c98a5e", hair: "#3a2517", shirt: "#8a3b3b", pants: "#3a2f4a" },
      wander: true,
      lines: [
        "So you're Marigold's kid. Hope you're tougher than you look.",
        "I run the carpentry. Bring me wood and stone and I'll patch that farm of yours up.",
        "Half this town would fall over in a stiff breeze. Present company excluded.",
        "...You did alright today. Don't let it go to your head.",
      ],
    },
    {
      id: "elias", name: "Dr. Elias", map: "town", x: 22, y: 10,
      colors: { skin: "#e8c49a", hair: "#5a4a3a", shirt: "#e6e6e6", pants: "#3b4a5a" },
      lines: [
        "Long night at the clinic. There's always something.",
        "Don't work yourself to collapse out there. I've patched up enough farmers to know.",
        "If you pass out in a field, someone drags you to me. Try not to make that a habit.",
        "Sleep. Eat. Water your crops. In roughly that order.",
      ],
    },
    {
      id: "juniper", name: "Juniper", map: "town", x: 14, y: 14,
      colors: { skin: "#b57a52", hair: "#c94f8a", shirt: "#4faa8a", pants: "#3a2f4a" },
      wander: true,
      lines: [
        "Just passing through Willowmere. The acoustics in the square are lovely.",
        "Every town has a song. This one's still figuring out the chorus.",
        "You've got dirt under your nails and a tune in your step. I like that.",
        "Stick around long enough and I'll write you into a verse.",
      ],
    },
    {
      id: "barnaby", name: "Old Barnaby", map: "town", x: 26, y: 16,
      colors: { skin: "#c98a5e", hair: "#d8d8d8", shirt: "#3b6fa2", pants: "#2f4a5a" },
      lines: [
        "The river gives what it gives. Patience is the only bait that never runs out.",
        "Cast when the ripples go quiet. That's when the big ones forget to be careful.",
        "Your aunt could pull a trout from a puddle. Talent skips a generation, they say.",
        "Come to the pier at dawn. The fish and I keep early hours.",
      ],
    },
    {
      id: "pip", name: "Pip", map: "town", x: 10, y: 7,
      colors: { skin: "#e8b892", hair: "#c98a2e", shirt: "#e0405a", pants: "#3b6fa2" },
      wander: true,
      lines: [
        "Ooh, a REAL farmer! Are your boots always that muddy? So cool!",
        "Ma runs the general store. I'm gonna run it someday. Or be a pirate. Undecided.",
        "Did you know pumpkins can get bigger than ME? I measured!",
        "If you find a shiny rock, I'll trade you three cool sticks for it!",
      ],
    },
  ];

  /* ------------------------------------------------------------- STORY */
  D.intro = [
    { who: "", text: "The bus rattles to a stop at the edge of Willowmere Valley." },
    { who: "Mayor Mira", text: "You made it! You must be Marigold's family. I'm Mira — I run things around here, more or less." },
    { who: "Mayor Mira", text: "Your aunt left you the old farm past the river. It's... well, it's seen better days. But the soil's good, and the town could use new blood." },
    { who: "Mayor Mira", text: "Clear the land, plant what you can, and get to know folks. Willowmere takes care of those who take care of it." },
    { who: "", text: "You grip your aunt's old tools and step off the bus. A new life begins." },
  ];

  D.tips = [
    "Use the HOE on grass-dirt to till soil, then plant SEEDS and water them.",
    "Crops need water every day until they're ripe. Harvest with SPACE when they glow.",
    "Chop trees with the AXE for wood; break rocks with the PICKAXE for stone.",
    "Drop produce in the SHIPPING BIN by your house — it sells overnight.",
    "Buy seeds at the General Store in town (blue-roofed building).",
    "Watch your ENERGY. If it runs out, or it hits 2AM, you collapse and lose the day.",
    "Sleep in your BED to save the game and start the next morning.",
    "Talk to townsfolk with SPACE. They warm up to you the more you visit.",
  ];

  /* ----------------------------------------------------- MAP BLUEPRINTS */
  // Blueprints are interpreted by world.js. Coordinates are in tiles.
  D.maps = {
    farm: {
      w: 34, h: 26, base: "grass",
      // rectangular border of trees; river strip on the left
      river: { x: 0, y: 0, w: 3, h: 26 },
      buildings: [
        { obj: "house", x: 20, y: 3, solidW: 5, solidH: 4, door: { x: 22, y: 6 }, warp: { to: "farmhouse", tx: 4, ty: 7 } },
        { obj: "bin", x: 17, y: 6, w: 2, h: 2, kind: "bin" },
      ],
      tillRegion: { x: 5, y: 9, w: 12, h: 12 },
      scatter: { trees: 14, rocks: 12, weeds: 20, flowers: 6 },
      warps: [
        { x: 32, y: 12, to: "town", tx: 3, ty: 11, edge: "right" },
        { x: 32, y: 13, to: "town", tx: 3, ty: 11, edge: "right" },
      ],
      spawn: { x: 16, y: 10 },
    },

    farmhouse: {
      w: 12, h: 9, base: "floor", interior: true,
      objects: [
        { obj: "bed", x: 3, y: 2, w: 2, h: 3, kind: "bed" },
        { obj: "rug", x: 6, y: 4, tile: true },
      ],
      warps: [
        { x: 4, y: 8, to: "farm", tx: 22, ty: 7, edge: "bottom" },
        { x: 5, y: 8, to: "farm", tx: 22, ty: 7, edge: "bottom" },
      ],
      spawn: { x: 4, y: 6 },
    },

    town: {
      w: 32, h: 22, base: "grass",
      paths: [
        { x: 1, y: 11, w: 30, h: 2 },   // main road
        { x: 14, y: 2, w: 2, h: 18 },   // vertical
      ],
      buildings: [
        { obj: "shop", x: 8, y: 3, solidW: 5, solidH: 4, door: { x: 10, y: 6 }, warp: { to: "shop_interior", tx: 5, ty: 7 } },
        { obj: "house", x: 20, y: 3, solidW: 5, solidH: 4 },
        { obj: "sign", x: 15, y: 13, w: 1, h: 1 },
      ],
      pond: { x: 24, y: 15, w: 6, h: 5 },
      scatter: { trees: 10, flowers: 12, bush: 5 },
      warps: [
        { x: 1, y: 11, to: "farm", tx: 30, ty: 12, edge: "left" },
        { x: 1, y: 12, to: "farm", tx: 30, ty: 12, edge: "left" },
      ],
      spawn: { x: 3, y: 11 },
    },

    shop_interior: {
      w: 11, h: 9, base: "floor", interior: true,
      objects: [
        { obj: "rug", x: 5, y: 5, tile: true },
        { obj: "sign", x: 2, y: 2, w: 1, h: 1, kind: "shopkeeper" },
      ],
      shopCounter: { x: 4, y: 2, w: 3, h: 1 },
      warps: [
        { x: 5, y: 8, to: "town", tx: 10, ty: 7, edge: "bottom" },
        { x: 4, y: 8, to: "town", tx: 10, ty: 7, edge: "bottom" },
      ],
      spawn: { x: 5, y: 6 },
    },
  };

  D.mapNames = { farm: "Marigold Farm", farmhouse: "Farmhouse", town: "Willowmere", shop_interior: "General Store" };
})();
