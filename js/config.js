// ===================================================================
//  IRONFRONT v4.0 — CONFIGURATION & CONSTANTS
// ===================================================================
var IRON = window.IRON || {};

// ---------- MAP ----------
IRON.GRID_W = 24;
IRON.GRID_H = 18;
IRON.TILE_SIZE = 2;
IRON.TILE_GAP = 0.08;
IRON.TILE_HEIGHT = 0.3;

// ---------- TERRAIN ----------
IRON.TERRAIN = {
  PLAINS:   { id:0, name:'Plains',    color:0x4a7a3a, defBonus:0,  moveCost:1,   passable:true,  flyable:true,  elevation:0      },
  FOREST:   { id:1, name:'Forest',    color:0x2a5a2a, defBonus:2,  moveCost:2,   passable:true,  flyable:true,  elevation:0      },
  MOUNTAIN: { id:2, name:'Mountain',  color:0x6a6a5a, defBonus:3,  moveCost:3,   passable:true,  flyable:true,  elevation:0.6    },
  WATER:    { id:3, name:'Water',     color:0x2a5a7a, defBonus:0,  moveCost:99,  passable:false, flyable:true,  elevation:-0.15  },
  ROAD:     { id:4, name:'Road',      color:0x8a7a5a, defBonus:-1, moveCost:0.5, passable:true,  flyable:true,  elevation:0      },
  BRIDGE:   { id:5, name:'Bridge',    color:0x9a8a6a, defBonus:-1, moveCost:1,   passable:true,  flyable:true,  elevation:0,  destructible:true },
  HQ:       { id:6, name:'HQ',        color:0x4a6a4a, defBonus:3,  moveCost:1,   passable:true,  flyable:true,  elevation:0.3    },
  DEPOT:    { id:7, name:'Supply Depot', color:0x6a6a3a, defBonus:1, moveCost:1,  passable:true,  flyable:true,  elevation:0.15   },
  BURNED:   { id:8, name:'Burned Ground', color:0x3a3525, defBonus:0, moveCost:1, passable:true, flyable:true,  elevation:0      },
  RUINS:    { id:9, name:'Ruins',     color:0x5a5a4a, defBonus:1,  moveCost:1.5, passable:true,  flyable:true,  elevation:0      },
  MINEFIELD:{ id:10,name:'Minefield', color:0x6a4a3a, defBonus:0,  moveCost:1,   passable:true,  flyable:true,  elevation:0, hidden:true, damage:40 },
  SANDBAGS: { id:11,name:'Sandbags',  color:0x7a7a5a, defBonus:4,  moveCost:1.5, passable:true,  flyable:true,  elevation:0.1    },
};

// ---------- UNIT TYPES ----------
IRON.UNIT_TYPES = {
  INFANTRY: {
    name:'Infantry', icon:'🔫', type:'LIGHT INFANTRY',
    hp:100, atk:30, def:15, moveRange:3, atkRange:1, scale:0.7,
    cost:100, buildTime:1, category:'basic', vision:3,
    desc:'Versatile frontline unit. Cheap and effective.',
  },
  TANK: {
    name:'Tank', icon:'🛡️', type:'HEAVY ARMOR',
    hp:200, atk:55, def:40, moveRange:4, atkRange:2, scale:1.0,
    cost:300, buildTime:2, category:'armor', vision:3,
    desc:'Heavy armored unit. Strong attack and defense.',
  },
  ARTILLERY: {
    name:'Artillery', icon:'💥', type:'LONG RANGE',
    hp:70, atk:70, def:8, moveRange:2, atkRange:5, scale:0.85,
    cost:250, buildTime:2, category:'support', vision:2,
    desc:'Devastating long-range bombardment. Fragile up close.',
  },
  SCOUT: {
    name:'Scout', icon:'👁', type:'RECON UNIT',
    hp:60, atk:20, def:10, moveRange:6, atkRange:1, scale:0.55,
    cost:80, buildTime:1, category:'recon', vision:6,
    desc:'Fast reconnaissance. Reveals terrain and enemies.',
  },
  COMMANDER: {
    name:'Commander', icon:'⭐', type:'COMMAND UNIT',
    hp:150, atk:40, def:30, moveRange:3, atkRange:2, scale:0.9,
    cost:400, buildTime:3, category:'command', vision:4,
    desc:'Buffs nearby allies +15% ATK/DEF. Lose to lose the war.',
  },
  SNIPER: {
    name:'Sniper', icon:'🎯', type:'PRECISION UNIT',
    hp:55, atk:85, def:5, moveRange:2, atkRange:6, scale:0.65,
    cost:200, buildTime:2, category:'support', vision:5,
    desc:'Extreme range. Lethal damage, but very fragile.',
  },
  MEDIC: {
    name:'Medic', icon:'➕', type:'FIELD MEDIC',
    hp:80, atk:10, def:12, moveRange:4, atkRange:1, scale:0.65,
    cost:150, buildTime:1, category:'support', vision:3,
    canHeal:true, healAmount:35,
    desc:'Heals adjacent friendly units each turn.',
  },
  ENGINEER: {
    name:'Engineer', icon:'🔧', type:'COMBAT ENGINEER',
    hp:90, atk:25, def:20, moveRange:3, atkRange:1, scale:0.7,
    cost:180, buildTime:2, category:'support', vision:3,
    canBuild:true, canRepair:true, repairAmount:25,
    desc:'Builds structures and repairs adjacent units.',
  },
  HELICOPTER: {
    name:'Helicopter', icon:'🚁', type:'ATTACK HELI',
    hp:145, atk:68, def:20, moveRange:7, atkRange:3, scale:0.9,
    cost:350, buildTime:2, category:'air', vision:5,
    flying:true,
    desc:'Flying unit. High mobility and firepower.',
  },
  MISSILE_LAUNCHER: {
    name:'Missile', icon:'🚀', type:'MISSILE PLATFORM',
    hp:85, atk:90, def:10, moveRange:2, atkRange:7, scale:0.9,
    cost:400, buildTime:3, category:'heavy', vision:2,
    areaAttack:true, splashRadius:1,
    desc:'Area-of-effect missiles. Devastating but slow.',
  },
  HEAVY_MECH: {
    name:'HeavyMech', icon:'🤖', type:'ASSAULT MECH',
    hp:300, atk:75, def:50, moveRange:3, atkRange:2, scale:1.2,
    cost:600, buildTime:4, category:'ultimate', vision:3,
    desc:'The ultimate war machine. Extremely expensive.',
  },
  DRONE: {
    name:'Drone', icon:'📡', type:'RECON DRONE',
    hp:45, atk:22, def:8, moveRange:8, atkRange:2, scale:0.4,
    cost:50, buildTime:1, category:'recon', vision:7,
    flying:true,
    desc:'Fast and cheap. Best scout in the game.',
  },
};

// ---------- RESEARCH TREE ----------
IRON.RESEARCH_TREE = {
  // === OFFENSE BRANCH ===
  sharperRounds: {
    name: 'Sharper Rounds', branch: 'offense', tier: 1,
    cost: 100, rpCost: 50, turns: 2, icon: '🔫',
    desc: 'All units gain +10% ATK.',
    effect: { atkMult: 1.10 },
    requires: [],
  },
  armorPiercing: {
    name: 'Armor Piercing', branch: 'offense', tier: 2,
    cost: 200, rpCost: 100, turns: 3, icon: '💢',
    desc: 'Attacks ignore 20% of enemy DEF.',
    effect: { defIgnore: 0.20 },
    requires: ['sharperRounds'],
  },
  incendiaryRounds: {
    name: 'Incendiary Rounds', branch: 'offense', tier: 2,
    cost: 250, rpCost: 100, turns: 3, icon: '🔥',
    desc: 'Attacks have 20% chance to inflict burn (5 dmg/turn for 2 turns).',
    effect: { burnChance: 0.20, burnDmg: 5, burnDuration: 2 },
    requires: ['sharperRounds'],
  },
  precisionStrike: {
    name: 'Precision Strike', branch: 'offense', tier: 3,
    cost: 400, rpCost: 200, turns: 4, icon: '🎯',
    desc: '+25% ATK. Unlocks Sniper unit.',
    effect: { atkMult: 1.25, unlock: 'SNIPER' },
    requires: ['armorPiercing'],
  },
  doomsdayProtocol: {
    name: 'Doomsday Protocol', branch: 'offense', tier: 4,
    cost: 650, rpCost: 300, turns: 5, icon: '☢️',
    desc: '+40% ATK. Unlocks Missile Launcher.',
    effect: { atkMult: 1.40, unlock: 'MISSILE_LAUNCHER' },
    requires: ['precisionStrike'],
  },

  // === DEFENSE BRANCH ===
  reinforcedPlating: {
    name: 'Reinforced Plating', branch: 'defense', tier: 1,
    cost: 100, rpCost: 50, turns: 2, icon: '🛡️',
    desc: 'All units gain +10% DEF.',
    effect: { defMult: 1.10 },
    requires: [],
  },
  reactiveArmor: {
    name: 'Reactive Armor', branch: 'defense', tier: 2,
    cost: 200, rpCost: 100, turns: 3, icon: '🔰',
    desc: '+20% DEF. Counter-attack damage up 50%.',
    effect: { defMult: 1.20, counterMult: 1.5 },
    requires: ['reinforcedPlating'],
  },
  emergencyProtocols: {
    name: 'Emergency Protocols', branch: 'defense', tier: 2,
    cost: 250, rpCost: 100, turns: 3, icon: '🚨',
    desc: 'Units below 20% HP gain +100% DEF for 1 turn. Last stand!',
    effect: { lastStandThreshold: 0.20, lastStandDefMult: 2.0 },
    requires: ['reinforcedPlating'],
  },
  energyShields: {
    name: 'Energy Shields', branch: 'defense', tier: 3,
    cost: 400, rpCost: 200, turns: 4, icon: '🔮',
    desc: 'Units regen 5 HP/turn. Unlocks Medic.',
    effect: { hpRegen: 5, unlock: 'MEDIC' },
    requires: ['reactiveArmor'],
  },
  fortressProtocol: {
    name: 'Fortress Protocol', branch: 'defense', tier: 4,
    cost: 650, rpCost: 300, turns: 5, icon: '🏰',
    desc: '+50% DEF. Unlocks Heavy Mech.',
    effect: { defMult: 1.50, unlock: 'HEAVY_MECH' },
    requires: ['energyShields'],
  },

  // === TECHNOLOGY BRANCH ===
  advancedSensors: {
    name: 'Advanced Sensors', branch: 'tech', tier: 1,
    cost: 100, rpCost: 50, turns: 2, icon: '📡',
    desc: '+1 attack range for all ranged units.',
    effect: { rangeBonus: 1 },
    requires: [],
  },
  droneNetwork: {
    name: 'Drone Network', branch: 'tech', tier: 2,
    cost: 200, rpCost: 100, turns: 3, icon: '🛸',
    desc: 'Unlocks Drone unit. +1 move range for scouts.',
    effect: { scoutMoveBonus: 1, unlock: 'DRONE' },
    requires: ['advancedSensors'],
  },
  rapidDeployment: {
    name: 'Rapid Deployment', branch: 'tech', tier: 2,
    cost: 250, rpCost: 100, turns: 3, icon: '⚡',
    desc: 'Build queue +1 slot. Units build 1 turn faster.',
    effect: { buildQueueBonus: 1, buildTimeReduction: 1 },
    requires: ['advancedSensors'],
  },
  stealthTech: {
    name: 'Stealth Tech', branch: 'tech', tier: 3,
    cost: 400, rpCost: 200, turns: 4, icon: '👻',
    desc: 'Unlocks Helicopter. Flying units +20% evasion.',
    effect: { flyEvasion: 0.20, unlock: 'HELICOPTER' },
    requires: ['droneNetwork'],
  },
  orbitalCommand: {
    name: 'Orbital Command', branch: 'tech', tier: 4,
    cost: 650, rpCost: 300, turns: 5, icon: '🛰️',
    desc: 'Unlocks Engineer. +2 move range. Full map vision.',
    effect: { moveBonus: 2, unlock: 'ENGINEER', fullVision: true },
    requires: ['stealthTech'],
  },

  // === INTELLIGENCE BRANCH (NEW) ===
  signalIntercept: {
    name: 'Signal Intercept', branch: 'intel', tier: 1,
    cost: 100, rpCost: 50, turns: 2, icon: '📻',
    desc: 'Reveals enemy research and build queue.',
    effect: { seeEnemyResearch: true },
    requires: [],
  },
  cyberWarfare: {
    name: 'Cyber Warfare', branch: 'intel', tier: 2,
    cost: 250, rpCost: 120, turns: 3, icon: '💻',
    desc: 'Delay enemy research by 1 turn. Enemy units -5% ATK.',
    effect: { sabotageResearch: 1, enemyAtkDebuff: 0.05 },
    requires: ['signalIntercept'],
  },
  economicWarfare: {
    name: 'Economic Warfare', branch: 'intel', tier: 3,
    cost: 450, rpCost: 200, turns: 4, icon: '💰',
    desc: 'Steal 25% of enemy depot income each turn.',
    effect: { incomeTheft: 0.25 },
    requires: ['cyberWarfare'],
  },
  neuralHack: {
    name: 'Neural Hack', branch: 'intel', tier: 4,
    cost: 700, rpCost: 350, turns: 5, icon: '🧠',
    desc: 'Unlock EMP ability: freeze an enemy unit for 1 turn. +3 vision range.',
    effect: { empAbility: true, visionBonus: 3 },
    requires: ['economicWarfare'],
  },
};

// ---------- STARTING UNITS AVAILABLE ----------
IRON.STARTING_UNITS = ['INFANTRY', 'TANK', 'ARTILLERY', 'SCOUT', 'COMMANDER'];

// ---------- ECONOMY ----------
IRON.STARTING_CREDITS = 500;
IRON.HQ_INCOME = 100;
IRON.DEPOT_INCOME = 50;
IRON.STARTING_RP = 0;
IRON.RP_PER_TURN = 50;
IRON.KILL_BOUNTY_PCT = 0.25;  // earn 25% of killed unit's cost as credits
IRON.INCOME_GROWTH = 5;       // base income grows +5 per turn
IRON.TERRITORY_BONUS = 3;     // +3 credits per alive unit per turn

// ---------- COMMANDER BUFF ----------
IRON.COMMANDER_BUFF_RANGE = 3;
IRON.COMMANDER_ATK_BUFF = 0.15;
IRON.COMMANDER_DEF_BUFF = 0.15;

// ---------- ELEVATION COMBAT ----------
IRON.ELEVATION_ATK_BONUS = 0.15; // +15% ATK when attacking from higher terrain

// ---------- ABILITIES ----------
IRON.ABILITIES = {
  INFANTRY:          { name:'Entrench',      cooldown:3, icon:'🏠', desc:'+50% DEF for 2 turns, cannot move.',           type:'self_buff',    duration:2, defBuff:0.50, immobile:true },
  TANK:              { name:'Overrun',        cooldown:4, icon:'💨', desc:'Charge through an enemy tile dealing 50% ATK.',type:'charge',       damageRatio:0.50 },
  ARTILLERY:         { name:'Barrage',        cooldown:5, icon:'🔥', desc:'Suppress 3x3 area. Enemies move -50% next turn.',type:'area_debuff', radius:1, moveDebuff:0.50, duration:1 },
  SCOUT:             { name:'Smoke Screen',   cooldown:3, icon:'💨', desc:'Block vision on a tile for 2 turns.',          type:'smoke',        duration:2, radius:1 },
  COMMANDER:         { name:'Rally',          cooldown:5, icon:'📢', desc:'Reset one adjacent ally\'s actions.',          type:'rally' },
  SNIPER:            { name:'Mark Target',    cooldown:3, icon:'🎯', desc:'Mark enemy: -30% DEF for 2 turns.',            type:'debuff',       duration:2, defDebuff:0.30 },
  MEDIC:             { name:'Field Surgery',  cooldown:5, icon:'💉', desc:'Fully heal one adjacent unit.',                type:'full_heal' },
  ENGINEER:          { name:'Deploy Turret',  cooldown:6, icon:'🔧', desc:'Place a static turret (30 ATK, range 3).',     type:'build_turret', turretAtk:30, turretRange:3, turretHp:50 },
  HELICOPTER:        { name:'Airstrike',      cooldown:5, icon:'💣', desc:'Bomb 2-radius area for 40% ATK.',              type:'airstrike',    radius:2, damageRatio:0.40 },
  MISSILE_LAUNCHER:  { name:'Cluster Bomb',   cooldown:6, icon:'☢️', desc:'Full damage to all enemies in 2-radius.',      type:'cluster',      radius:2, damageRatio:1.0 },
  HEAVY_MECH:        { name:'Siege Mode',     cooldown:4, icon:'🏰', desc:'Immobile 1 turn. +80% DEF, +50% ATK.',         type:'self_buff',    duration:1, defBuff:0.80, atkBuff:0.50, immobile:true },
  DRONE:             { name:'EMP Pulse',      cooldown:4, icon:'⚡', desc:'Disable an adjacent enemy for 1 turn.',        type:'disable',      duration:1, range:1 },
};

// ---------- VETERANCY / XP ----------
IRON.VETERANCY = {
  ranks: [
    { name:'Recruit', icon:'',  xp:0,   atkBonus:0,    defBonus:0,    hpBonus:0   },
    { name:'Veteran', icon:'⭐', xp:50,  atkBonus:0.10, defBonus:0.10, hpBonus:10  },
    { name:'Elite',   icon:'⭐⭐',xp:120, atkBonus:0.20, defBonus:0.20, hpBonus:25  },
    { name:'Legend',  icon:'👑', xp:250, atkBonus:0.35, defBonus:0.35, hpBonus:50  },
  ],
  xpPerKill: 40,
  xpPerAttack: 10,
  xpPerHeal: 15,
  xpPerCapture: 20,
};

// ---------- WEATHER ----------
IRON.WEATHER_TYPES = [
  { id:'clear',     name:'Clear Skies',   icon:'☀️',  moveMod:0,  atkMod:0,     visionMod:0,  airDisabled:false, desc:'Perfect conditions.' },
  { id:'rain',      name:'Heavy Rain',    icon:'🌧️', moveMod:-1, atkMod:-0.10, visionMod:-1, airDisabled:false, desc:'Reduced movement and accuracy.' },
  { id:'fog',       name:'Dense Fog',     icon:'🌫️', moveMod:0,  atkMod:0,     visionMod:-3, airDisabled:false, desc:'Severely reduced vision.' },
  { id:'storm',     name:'Thunderstorm',  icon:'⛈️', moveMod:-1, atkMod:-0.15, visionMod:-2, airDisabled:true,  desc:'Air units grounded. Harsh conditions.' },
  { id:'sandstorm', name:'Sandstorm',     icon:'🏜️', moveMod:-1, atkMod:-0.20, visionMod:-2, airDisabled:false, desc:'Brutal winds. Reduced accuracy.' },
];
IRON.WEATHER_CHANGE_INTERVAL = 4; // turns between weather shifts

// ---------- SUPPLY & ATTRITION ----------
IRON.SUPPLY_RANGE = 10;     // max tiles from HQ/depot before attrition
IRON.ATTRITION_DAMAGE = 5;  // HP lost per turn when out of supply

// ---------- SECONDARY OBJECTIVES ----------
IRON.OBJECTIVE_TEMPLATES = [
  { type:'supply_drop', icon:'📦', reward:300, text:'Supply drop at ({x},{z})! First to reach it earns 300 credits.' },
  { type:'hold_zone',   icon:'🏁', reward:200, text:'Hold zone ({x},{z}) for 3 turns for 200 credits.', turnsNeeded:3 },
  { type:'bounty',      icon:'💰', reward:250, text:'High-value target marked! Destroy it for 250 credits.' },
  { type:'evac_zone',   icon:'⚠️', reward:0,   text:'Bombardment incoming at ({x},{z})! Clear out in 2 turns.', turnsToEvac:2 },
];
IRON.OBJECTIVE_INTERVAL = 6; // new objective appears every N turns

// ---------- GAME MODES ----------
IRON.GAME_MODES = {
  CLASSIC:  { name:'Classic Warfare',  fogOfWar:false, weather:false, objectives:false, supply:false, desc:'Standard tactical combat. Full map visibility.' },
  FOG:      { name:'Fog of War',       fogOfWar:true,  weather:false, objectives:false, supply:false, desc:'Limited vision. Scouting is critical.' },
  WARFARE:  { name:'Total Warfare',    fogOfWar:true,  weather:true,  objectives:true,  supply:true,  desc:'Every system active. The ultimate challenge.' },
};

// ---------- GAME SETTINGS (defaults, may be overwritten by menu) ----------
if (!IRON.SETTINGS) {
  IRON.SETTINGS = {
    gameMode: 'CLASSIC',
    difficulty: 'normal',
    multiplayer: false,
  };
}

// ---------- DIFFICULTY MODIFIERS ----------
IRON.DIFFICULTY = {
  easy:   { aiAtkMult:0.85, aiDefMult:0.85, aiIncomeMult:0.80, aiDelay:500  },
  normal: { aiAtkMult:1.00, aiDefMult:1.00, aiIncomeMult:1.00, aiDelay:350  },
  hard:   { aiAtkMult:1.15, aiDefMult:1.15, aiIncomeMult:1.25, aiDelay:250  },
};

// ---------- UNIT MERGE ----------
IRON.MERGE_HP_THRESHOLD = 0.50; // units must be below 50% HP to merge
