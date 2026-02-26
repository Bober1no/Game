// ===================================================================
//  IRONFRONT v4.0 — CORE GAME ENGINE
//  State management, pathfinding, combat, resources, research,
//  production, turn management, fog of war, weather, veterancy,
//  abilities, status effects, supply, objectives, merging.
// ===================================================================

(function () {
  'use strict';

  // ---------------------------------------------------------------
  //  HELPERS
  // ---------------------------------------------------------------
  var _nextId = 1;
  function uid() { return _nextId++; }

  IRON.sleep = function (ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  };

  // ---------------------------------------------------------------
  //  1. GAME STATE
  // ---------------------------------------------------------------
  function makeTeamState() {
    return {
      credits: IRON.STARTING_CREDITS,
      rp: IRON.STARTING_RP || 0,
      income: IRON.HQ_INCOME,
      research: {},
      researching: null,
      unlockedUnits: IRON.STARTING_UNITS.slice(),
      buildQueue: [],
      hqTile: null,
      depots: [],
      effects: {
        atkMult: 1,
        defMult: 1,
        defIgnore: 0,
        counterMult: 1,
        hpRegen: 0,
        rangeBonus: 0,
        scoutMoveBonus: 0,
        flyEvasion: 0,
        moveBonus: 0,
        fullVision: false,
        // v4.0 additions
        burnChance: 0,
        burnDmg: 0,
        burnDuration: 0,
        lastStandThreshold: 0,
        lastStandDefMult: 0,
        buildQueueBonus: 0,
        buildTimeReduction: 0,
        seeEnemyResearch: false,
        sabotageResearch: 0,
        enemyAtkDebuff: 0,
        incomeTheft: 0,
        empAbility: false,
        visionBonus: 0,
      },
      // Commander strategic abilities (one-time use per team)
      commanderAbilities: {
        airstrike: { used: false },
        emergencyDrop: { used: false },
        ironWill: { used: false },
      },
      // Iron Will tracking
      ironWillTurns: 0,
    };
  }

  IRON.state = {
    turn: 1,
    currentTeam: 'blue',
    phase: 'select',
    selectedUnit: null,
    grid: [],
    units: [],
    moveHighlights: [],
    attackHighlights: [],
    healHighlights: [],
    animating: false,
    blue: makeTeamState(),
    red: makeTeamState(),
    // v4.0 additions
    fogOfWar: false,
    weather: {
      current: IRON.WEATHER_TYPES[0],
      turnsUntilChange: IRON.WEATHER_CHANGE_INTERVAL,
    },
    objectives: [],
    settings: {
      gameMode: IRON.SETTINGS.gameMode,
      difficulty: IRON.SETTINGS.difficulty,
      multiplayer: IRON.SETTINGS.multiplayer,
    },
    visibility: { blue: {}, red: {} },
  };

  // ---------------------------------------------------------------
  //  2. MAP GENERATION
  // ---------------------------------------------------------------
  IRON.generateMap = function () {
    var W = IRON.GRID_W;
    var H = IRON.GRID_H;
    var T = IRON.TERRAIN;
    var grid = [];
    var x, z;

    // Apply game mode settings
    var modeConfig = IRON.GAME_MODES[IRON.state.settings.gameMode] || IRON.GAME_MODES.CLASSIC;
    IRON.state.fogOfWar = !!modeConfig.fogOfWar;

    // Initialize every tile as plains
    for (x = 0; x < W; x++) {
      grid[x] = [];
      for (z = 0; z < H; z++) {
        grid[x][z] = {
          x: x,
          z: z,
          terrain: T.PLAINS,
          unit: null,
          mesh: null,
          elevation: 0,
          owner: null,
        };
      }
    }

    // --- Water river running N-S around columns 11-12 ---
    for (z = 0; z < H; z++) {
      grid[11][z].terrain = T.WATER;
      grid[11][z].elevation = -0.15;
      grid[12][z].terrain = T.WATER;
      grid[12][z].elevation = -0.15;
    }

    // --- Road network ---
    // Horizontal main road at z=8 and z=9
    for (x = 0; x < W; x++) {
      var tile8 = grid[x][8];
      var tile9 = grid[x][9];
      if (tile8.terrain === T.WATER) {
        tile8.terrain = T.BRIDGE;
        tile8.elevation = 0;
      } else {
        tile8.terrain = T.ROAD;
      }
      if (tile9.terrain === T.WATER) {
        tile9.terrain = T.BRIDGE;
        tile9.elevation = 0;
      } else {
        tile9.terrain = T.ROAD;
      }
    }

    // Vertical roads connecting to depots and flanks
    for (z = 3; z <= 14; z++) {
      grid[6][z].terrain = T.ROAD;
    }
    for (z = 3; z <= 14; z++) {
      grid[17][z].terrain = T.ROAD;
    }
    // Cross-bridges at z=4 and z=13 through the river
    var bridgeRows = [4, 13];
    for (var bi = 0; bi < bridgeRows.length; bi++) {
      var bz = bridgeRows[bi];
      for (x = 10; x <= 13; x++) {
        if (grid[x][bz].terrain === T.WATER) {
          grid[x][bz].terrain = T.BRIDGE;
          grid[x][bz].elevation = 0;
        } else {
          grid[x][bz].terrain = T.ROAD;
        }
      }
    }

    // --- HQ Placement ---
    grid[1][8].terrain = T.HQ;
    grid[1][8].elevation = 0.3;
    grid[1][8].owner = 'blue';
    grid[1][9].terrain = T.HQ;
    grid[1][9].elevation = 0.3;
    grid[1][9].owner = 'blue';
    IRON.state.blue.hqTile = { x: 1, z: 8 };

    grid[22][8].terrain = T.HQ;
    grid[22][8].elevation = 0.3;
    grid[22][8].owner = 'red';
    grid[22][9].terrain = T.HQ;
    grid[22][9].elevation = 0.3;
    grid[22][9].owner = 'red';
    IRON.state.red.hqTile = { x: 22, z: 9 };

    // --- Supply Depots (symmetric) ---
    var depotCoords = [
      { x: 6, z: 4, owner: null },
      { x: 6, z: 13, owner: null },
      { x: 17, z: 4, owner: null },
      { x: 17, z: 13, owner: null },
    ];
    for (var d = 0; d < depotCoords.length; d++) {
      var dc = depotCoords[d];
      grid[dc.x][dc.z].terrain = T.DEPOT;
      grid[dc.x][dc.z].elevation = 0.15;
      grid[dc.x][dc.z].owner = null;
    }

    // --- Forests (symmetric) ---
    var forestTiles = [
      [3, 2], [4, 2], [3, 3], [5, 1],
      [3, 15], [4, 15], [3, 14], [5, 16],
      [4, 6], [5, 6], [4, 11], [5, 11],
      [8, 2], [9, 3], [8, 15], [9, 14],
      [8, 6], [9, 6], [8, 11], [9, 11],
      [20, 2], [19, 2], [20, 3], [18, 1],
      [20, 15], [19, 15], [20, 14], [18, 16],
      [19, 6], [18, 6], [19, 11], [18, 11],
      [15, 2], [14, 3], [15, 15], [14, 14],
      [15, 6], [14, 6], [15, 11], [14, 11],
    ];
    for (var fi = 0; fi < forestTiles.length; fi++) {
      var fx = forestTiles[fi][0], fz = forestTiles[fi][1];
      if (fx >= 0 && fx < W && fz >= 0 && fz < H) {
        var ft = grid[fx][fz];
        if (ft.terrain === T.PLAINS) {
          ft.terrain = T.FOREST;
        }
      }
    }

    // --- Mountains (symmetric) ---
    var mountainTiles = [
      [4, 0], [5, 0], [4, 17], [5, 17],
      [7, 4], [7, 13],
      [9, 0], [10, 1], [9, 17], [10, 16],
      [19, 0], [18, 0], [19, 17], [18, 17],
      [16, 4], [16, 13],
      [14, 0], [13, 1], [14, 17], [13, 16],
    ];
    for (var mi = 0; mi < mountainTiles.length; mi++) {
      var mx = mountainTiles[mi][0], mz = mountainTiles[mi][1];
      if (mx >= 0 && mx < W && mz >= 0 && mz < H) {
        var mt = grid[mx][mz];
        if (mt.terrain === T.PLAINS) {
          mt.terrain = T.MOUNTAIN;
          mt.elevation = 0.6;
        }
      }
    }

    IRON.state.grid = grid;

    // Build tile meshes
    for (x = 0; x < W; x++) {
      for (z = 0; z < H; z++) {
        IRON.buildTileMesh(grid[x][z]);
      }
    }

    return grid;
  };

  // ---------------------------------------------------------------
  //  3. UNIT MANAGEMENT
  // ---------------------------------------------------------------
  IRON.createUnit = function (unitType, team, x, z) {
    var typeData = IRON.UNIT_TYPES[unitType];
    if (!typeData) {
      console.error('Unknown unit type:', unitType);
      return null;
    }

    var tile = IRON.state.grid[x] && IRON.state.grid[x][z];
    if (!tile) {
      console.error('Invalid tile for unit:', x, z);
      return null;
    }

    var teamState = IRON.state[team];
    var eff = teamState.effects;

    var unit = {
      id: uid(),
      unitType: unitType,
      typeData: typeData,
      team: team,
      x: x,
      z: z,
      hp: typeData.hp,
      maxHp: typeData.hp,
      atk: typeData.atk,
      def: typeData.def,
      moveRange: typeData.moveRange,
      atkRange: typeData.atkRange,
      hasMoved: false,
      hasAttacked: false,
      isDead: false,
      mesh: null,
      // v4.0 additions
      xp: 0,
      rank: 0,
      abilityCooldown: 0,
      statusEffects: [],
      stealthed: false,
    };

    // Apply research effects to stats
    _applyResearchToUnit(unit, eff);

    // Build 3D model
    unit.mesh = IRON.buildUnitModel(unit);
    if (unit.mesh) {
      IRON.unitGroup.add(unit.mesh);
    }

    // Place on grid
    tile.unit = unit;
    IRON.state.units.push(unit);

    return unit;
  };

  function _applyResearchToUnit(unit, eff) {
    var td = unit.typeData;
    // Recalculate from base stats
    unit.atk = td.atk;
    unit.def = td.def;
    unit.moveRange = td.moveRange;
    unit.atkRange = td.atkRange;

    // Attack multiplier
    unit.atk = Math.round(td.atk * eff.atkMult);
    // Defense multiplier
    unit.def = Math.round(td.def * eff.defMult);
    // Range bonus (only for ranged units: atkRange > 1)
    if (td.atkRange > 1) {
      unit.atkRange = td.atkRange + eff.rangeBonus;
    }
    // Scout move bonus
    if (unit.unitType === 'SCOUT') {
      unit.moveRange = td.moveRange + eff.scoutMoveBonus;
    }
    // Global move bonus
    unit.moveRange += eff.moveBonus;

    // Veterancy rank bonuses
    if (unit.rank !== undefined && unit.rank > 0) {
      var rankData = IRON.VETERANCY.ranks[unit.rank];
      if (rankData) {
        unit.atk = Math.round(unit.atk * (1 + rankData.atkBonus));
        unit.def = Math.round(unit.def * (1 + rankData.defBonus));
      }
    }
  }

  IRON.placeInitialUnits = function () {
    // Blue units (near left HQ)
    IRON.createUnit('COMMANDER', 'blue', 2, 8);
    IRON.createUnit('TANK', 'blue', 1, 5);
    IRON.createUnit('TANK', 'blue', 1, 12);
    IRON.createUnit('INFANTRY', 'blue', 2, 3);
    IRON.createUnit('INFANTRY', 'blue', 2, 6);
    IRON.createUnit('INFANTRY', 'blue', 2, 10);
    IRON.createUnit('INFANTRY', 'blue', 2, 14);
    IRON.createUnit('ARTILLERY', 'blue', 1, 8);
    IRON.createUnit('SCOUT', 'blue', 3, 1);

    // Red units (near right HQ)
    IRON.createUnit('COMMANDER', 'red', 21, 9);
    IRON.createUnit('TANK', 'red', 22, 5);
    IRON.createUnit('TANK', 'red', 22, 12);
    IRON.createUnit('INFANTRY', 'red', 21, 3);
    IRON.createUnit('INFANTRY', 'red', 21, 6);
    IRON.createUnit('INFANTRY', 'red', 21, 10);
    IRON.createUnit('INFANTRY', 'red', 21, 14);
    IRON.createUnit('ARTILLERY', 'red', 22, 9);
    IRON.createUnit('SCOUT', 'red', 20, 16);

    // Initial visibility update
    if (IRON.state.fogOfWar) {
      IRON.updateVisibility('blue');
      IRON.updateVisibility('red');
    }
  };

  // ---------------------------------------------------------------
  //  HELPERS — getUnitEffectiveStats
  // ---------------------------------------------------------------
  IRON.getUnitEffectiveStats = function (unit) {
    if (!unit) return null;
    var eff = IRON.state[unit.team].effects;
    var td = unit.typeData;

    var atk = Math.round(td.atk * eff.atkMult);
    var def = Math.round(td.def * eff.defMult);
    var atkRange = td.atkRange;
    if (td.atkRange > 1) {
      atkRange = td.atkRange + eff.rangeBonus;
    }
    var moveRange = td.moveRange;
    if (unit.unitType === 'SCOUT') {
      moveRange += eff.scoutMoveBonus;
    }
    moveRange += eff.moveBonus;

    // Veterancy rank bonuses
    if (unit.rank !== undefined && unit.rank > 0) {
      var rankData = IRON.VETERANCY.ranks[unit.rank];
      if (rankData) {
        atk = Math.round(atk * (1 + rankData.atkBonus));
        def = Math.round(def * (1 + rankData.defBonus));
      }
    }

    // Commander proximity buff
    var cmdBuff = _hasCommanderBuff(unit);

    return {
      atk: cmdBuff ? Math.round(atk * (1 + IRON.COMMANDER_ATK_BUFF)) : atk,
      def: cmdBuff ? Math.round(def * (1 + IRON.COMMANDER_DEF_BUFF)) : def,
      moveRange: moveRange,
      atkRange: atkRange,
      hp: unit.hp,
      maxHp: unit.maxHp,
    };
  };

  function _hasCommanderBuff(unit) {
    var range = IRON.COMMANDER_BUFF_RANGE;
    var units = IRON.state.units;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.isDead) continue;
      if (u.team !== unit.team) continue;
      if (u.unitType !== 'COMMANDER') continue;
      if (u.id === unit.id) continue;
      var dist = Math.abs(u.x - unit.x) + Math.abs(u.z - unit.z);
      if (dist <= range) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------
  //  4. PATHFINDING
  // ---------------------------------------------------------------
  IRON.getMovableTiles = function (unit) {
    var grid = IRON.state.grid;
    var W = IRON.GRID_W, H = IRON.GRID_H;
    var flying = !!(unit.typeData.flying);
    var maxMove = unit.moveRange;

    // Weather movement modifier
    var modeConfig = IRON.GAME_MODES[IRON.state.settings.gameMode] || IRON.GAME_MODES.CLASSIC;
    if (modeConfig.weather && IRON.state.weather.current) {
      maxMove = Math.max(1, maxMove + IRON.state.weather.current.moveMod);
    }

    // If unit is entrenched and immobile, cannot move
    if (IRON.hasStatus(unit, 'entrenched') || IRON.hasStatus(unit, 'siege')) {
      return [];
    }

    // Suppressed: halve movement
    if (IRON.hasStatus(unit, 'suppressed')) {
      maxMove = Math.max(1, Math.floor(maxMove / 2));
    }

    // Iron Will: ignore terrain movement penalties
    var ironWill = IRON.state[unit.team].ironWillTurns > 0;

    // BFS
    var dist = {};
    var key = function (x, z) { return x + ',' + z; };
    var queue = [{ x: unit.x, z: unit.z, cost: 0 }];
    dist[key(unit.x, unit.z)] = 0;
    var result = [];
    var dirs = [
      { dx: 1, dz: 0 }, { dx: -1, dz: 0 },
      { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
    ];

    while (queue.length > 0) {
      var cur = queue.shift();
      for (var d = 0; d < dirs.length; d++) {
        var nx = cur.x + dirs[d].dx;
        var nz = cur.z + dirs[d].dz;
        if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;
        var tile = grid[nx][nz];

        // Check passability
        if (!flying && !tile.terrain.passable) continue;
        if (flying && !tile.terrain.flyable) continue;

        // Move cost
        var cost = flying ? 1 : tile.terrain.moveCost;
        if (ironWill && !flying && cost > 1) cost = 1; // ignore terrain penalties
        var newCost = cur.cost + cost;
        if (newCost > maxMove) continue;

        var k = key(nx, nz);
        if (dist[k] !== undefined && dist[k] <= newCost) continue;
        dist[k] = newCost;

        queue.push({ x: nx, z: nz, cost: newCost });
      }
    }

    // Collect tiles — must be empty (no unit) or the unit's own tile
    for (var k2 in dist) {
      var parts = k2.split(',');
      var tx = parseInt(parts[0], 10);
      var tz = parseInt(parts[1], 10);
      if (tx === unit.x && tz === unit.z) continue;
      var t = grid[tx][tz];
      if (!t.unit) {
        result.push(t);
      }
    }

    return result;
  };

  IRON.getAttackableTiles = function (unit) {
    var grid = IRON.state.grid;
    var W = IRON.GRID_W, H = IRON.GRID_H;
    var range = unit.atkRange;
    var result = [];

    for (var dx = -range; dx <= range; dx++) {
      for (var dz = -range; dz <= range; dz++) {
        if (dx === 0 && dz === 0) continue;
        if (Math.abs(dx) + Math.abs(dz) > range) continue;
        var tx = unit.x + dx;
        var tz = unit.z + dz;
        if (tx < 0 || tx >= W || tz < 0 || tz >= H) continue;
        var tile = grid[tx][tz];
        if (tile.unit && tile.unit.team !== unit.team && !tile.unit.isDead) {
          // If fog of war, only attack visible enemies
          if (IRON.state.fogOfWar && !IRON.isTileVisible(unit.team, tx, tz)) continue;
          result.push(tile);
        }
      }
    }

    return result;
  };

  IRON.getHealableTiles = function (unit) {
    if (!unit.typeData.canHeal) return [];
    var grid = IRON.state.grid;
    var W = IRON.GRID_W, H = IRON.GRID_H;
    var result = [];
    var dirs = [
      { dx: 1, dz: 0 }, { dx: -1, dz: 0 },
      { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
    ];

    for (var d = 0; d < dirs.length; d++) {
      var tx = unit.x + dirs[d].dx;
      var tz = unit.z + dirs[d].dz;
      if (tx < 0 || tx >= W || tz < 0 || tz >= H) continue;
      var tile = grid[tx][tz];
      if (tile.unit && tile.unit.team === unit.team && !tile.unit.isDead && tile.unit.hp < tile.unit.maxHp) {
        result.push(tile);
      }
    }

    return result;
  };

  IRON.findPath = function (fromX, fromZ, toX, toZ, flying) {
    var grid = IRON.state.grid;
    var W = IRON.GRID_W, H = IRON.GRID_H;
    var key = function (x, z) { return x + ',' + z; };
    var dirs = [
      { dx: 1, dz: 0 }, { dx: -1, dz: 0 },
      { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
    ];

    // A*
    var open = [];
    var gScore = {};
    var cameFrom = {};
    var startKey = key(fromX, fromZ);
    var goalKey = key(toX, toZ);

    gScore[startKey] = 0;
    open.push({ x: fromX, z: fromZ, f: _heuristic(fromX, fromZ, toX, toZ) });

    function _heuristic(ax, az, bx, bz) {
      return Math.abs(ax - bx) + Math.abs(az - bz);
    }

    while (open.length > 0) {
      var bestIdx = 0;
      for (var oi = 1; oi < open.length; oi++) {
        if (open[oi].f < open[bestIdx].f) bestIdx = oi;
      }
      var cur = open.splice(bestIdx, 1)[0];
      var curKey = key(cur.x, cur.z);

      if (curKey === goalKey) {
        var path = [{ x: toX, z: toZ }];
        var pk = goalKey;
        while (cameFrom[pk]) {
          pk = cameFrom[pk];
          var pp = pk.split(',');
          path.unshift({ x: parseInt(pp[0], 10), z: parseInt(pp[1], 10) });
        }
        return path;
      }

      for (var d = 0; d < dirs.length; d++) {
        var nx = cur.x + dirs[d].dx;
        var nz = cur.z + dirs[d].dz;
        if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;
        var tile = grid[nx][nz];
        if (!flying && !tile.terrain.passable) continue;
        if (flying && !tile.terrain.flyable) continue;

        var cost = flying ? 1 : tile.terrain.moveCost;
        var tentG = gScore[curKey] + cost;
        var nKey = key(nx, nz);

        if (gScore[nKey] === undefined || tentG < gScore[nKey]) {
          gScore[nKey] = tentG;
          cameFrom[nKey] = curKey;
          var f = tentG + _heuristic(nx, nz, toX, toZ);
          open.push({ x: nx, z: nz, f: f });
        }
      }
    }

    return [];
  };

  // ---------------------------------------------------------------
  //  5. COMBAT ENGINE
  // ---------------------------------------------------------------
  IRON.calculateDamage = function (attacker, defender) {
    var atkTeam = IRON.state[attacker.team];
    var defTeam = IRON.state[defender.team];
    var atkEff = atkTeam.effects;
    var defEff = defTeam.effects;

    // Base attack stat
    var atkStat = attacker.atk * atkEff.atkMult;

    // Veterancy atk bonus (already applied via _applyResearchToUnit, but use effective stat)
    // Commander buff for attacker
    if (_hasCommanderBuff(attacker)) {
      atkStat *= (1 + IRON.COMMANDER_ATK_BUFF);
    }

    // Enemy ATK debuff from intel research
    var enemyEff = IRON.state[defender.team].effects;
    if (enemyEff.enemyAtkDebuff > 0) {
      // The defender's team has researched enemyAtkDebuff, which reduces attacker's ATK
      // Actually: attacker's enemy has enemyAtkDebuff that affects attacker
      // enemyAtkDebuff is on the defender's team effects = debuff to the attacker
    }
    // Check if defender's team has debuffed attacker's team
    var defenderTeamEff = IRON.state[defender.team].effects;
    if (defenderTeamEff.enemyAtkDebuff > 0) {
      atkStat *= (1 - defenderTeamEff.enemyAtkDebuff);
    }

    // Siege mode atkBuff
    if (IRON.hasStatus(attacker, 'siege')) {
      var siegeStatus = _getStatus(attacker, 'siege');
      if (siegeStatus && siegeStatus.atkBuff) {
        atkStat *= (1 + siegeStatus.atkBuff);
      }
    }

    var baseDmg = atkStat * (0.85 + Math.random() * 0.3);

    // Effective defense
    var defStat = defender.def * defEff.defMult;
    // Commander buff for defender
    if (_hasCommanderBuff(defender)) {
      defStat *= (1 + IRON.COMMANDER_DEF_BUFF);
    }

    // Entrenched defBuff
    if (IRON.hasStatus(defender, 'entrenched')) {
      var entrenchStatus = _getStatus(defender, 'entrenched');
      if (entrenchStatus && entrenchStatus.defBuff) {
        defStat *= (1 + entrenchStatus.defBuff);
      }
    }

    // Siege mode defBuff
    if (IRON.hasStatus(defender, 'siege')) {
      var siegeDefStatus = _getStatus(defender, 'siege');
      if (siegeDefStatus && siegeDefStatus.defBuff) {
        defStat *= (1 + siegeDefStatus.defBuff);
      }
    }

    // Mark debuff: -30% DEF
    if (IRON.hasStatus(defender, 'marked')) {
      var markStatus = _getStatus(defender, 'marked');
      if (markStatus && markStatus.defDebuff) {
        defStat *= (1 - markStatus.defDebuff);
      }
    }

    // Last stand: if defender is below threshold, boost DEF
    if (defEff.lastStandThreshold > 0 && defender.hp / defender.maxHp <= defEff.lastStandThreshold) {
      defStat *= defEff.lastStandDefMult;
    }

    // Terrain defense bonus
    var defTile = IRON.state.grid[defender.x][defender.z];
    var effectiveDef = defStat + defTile.terrain.defBonus * 3;

    // Defense ignore (attacker's research)
    var defIgnored = effectiveDef * atkEff.defIgnore;
    var finalDef = effectiveDef - defIgnored;
    if (finalDef < 0) finalDef = 0;

    // Damage reduction
    var reduction = finalDef / (finalDef + 50);
    var damage = baseDmg * (1 - reduction);

    // Elevation attack bonus
    var atkTile = IRON.state.grid[attacker.x][attacker.z];
    if (atkTile.elevation > defTile.elevation) {
      damage *= (1 + IRON.ELEVATION_ATK_BONUS);
    }

    // Weather attack modifier
    var modeConfig = IRON.GAME_MODES[IRON.state.settings.gameMode] || IRON.GAME_MODES.CLASSIC;
    if (modeConfig.weather && IRON.state.weather.current) {
      damage *= (1 + IRON.state.weather.current.atkMod);
    }

    // Flying evasion
    if (defender.typeData.flying && defEff.flyEvasion > 0) {
      if (Math.random() < defEff.flyEvasion) {
        damage *= (1 - defEff.flyEvasion);
      }
    }

    return Math.max(1, Math.round(damage));
  };

  IRON.performAttack = function (attacker, defender) {
    return new Promise(function (resolve) {
      IRON.state.animating = true;

      // Check if air unit is disabled by weather
      var modeConfig = IRON.GAME_MODES[IRON.state.settings.gameMode] || IRON.GAME_MODES.CLASSIC;
      if (modeConfig.weather && IRON.state.weather.current && IRON.state.weather.current.airDisabled && attacker.typeData.flying) {
        IRON.state.animating = false;
        if (typeof IRON.addLog === 'function') IRON.addLog('Air unit grounded by weather!', 'warning');
        resolve({ killed: false, dmg: 0, counterDmg: 0 });
        return;
      }

      // 1. Spawn projectile
      var projectileDone;
      if (attacker.typeData.areaAttack) {
        projectileDone = IRON.spawnMissileEffect(attacker, [defender]);
      } else {
        projectileDone = IRON.spawnProjectileEffect(attacker, defender);
      }

      Promise.resolve(projectileDone).then(function () {
        return IRON.sleep(200);
      }).then(function () {
        // 2. Calculate and apply primary damage
        var dmg = IRON.calculateDamage(attacker, defender);
        defender.hp -= dmg;

        // Grant XP to attacker
        IRON.addXP(attacker, IRON.VETERANCY.xpPerAttack);

        // 3. Visual feedback
        IRON.flashUnit(defender);
        IRON.spawnDamageEffect(defender, dmg);
        IRON.updateHealthBar(defender);

        // Burn chance
        var atkEff = IRON.state[attacker.team].effects;
        if (atkEff.burnChance > 0 && Math.random() < atkEff.burnChance) {
          IRON.addStatusEffect(defender, {
            type: 'burn',
            turnsLeft: atkEff.burnDuration || 2,
            damage: atkEff.burnDmg || 5,
          });
          if (typeof IRON.addLog === 'function') IRON.addLog(defender.typeData.name + ' is burning!', 'combat');
        }

        // Area attack splash damage
        var splashPromise = Promise.resolve();
        if (attacker.typeData.areaAttack) {
          splashPromise = _applySplashDamage(attacker, defender);
        }

        return splashPromise.then(function () {
          // 4. Check if defender dies
          if (defender.hp <= 0) {
            defender.hp = 0;
            defender.isDead = true;
            IRON.state.grid[defender.x][defender.z].unit = null;
            IRON.spawnExplosionEffect(defender.x, defender.z);
            IRON.destroyUnitAnim(defender);

            // Grant kill XP
            IRON.addXP(attacker, IRON.VETERANCY.xpPerKill);

            // Kill bounty — earn credits for destroying enemy units
            var bounty = Math.round((defender.typeData.cost || 0) * (IRON.KILL_BOUNTY_PCT || 0.25));
            if (bounty > 0) {
              IRON.state[attacker.team].credits += bounty;
              if (typeof IRON.addLog === 'function') IRON.addLog('+' + bounty + ' credits (kill bounty)', 'info');
            }

            // Check bounty objectives
            _checkBountyKill(defender);

            attacker.hasAttacked = true;
            IRON.state.animating = false;
            IRON.checkGameOver();
            resolve({ killed: true, dmg: dmg, counterDmg: 0 });
            return;
          }

          // 5. Counter-attack check
          var counterDist = Math.abs(attacker.x - defender.x) + Math.abs(attacker.z - defender.z);
          if (counterDist <= defender.atkRange && !defender.isDead) {
            return IRON.sleep(300).then(function () {
              return Promise.resolve(IRON.spawnProjectileEffect(defender, attacker));
            }).then(function () {
              return IRON.sleep(200);
            }).then(function () {
              var counterBase = IRON.calculateDamage(defender, attacker);
              var counterMult = IRON.state[defender.team].effects.counterMult;
              var counterDmg = Math.max(1, Math.round(counterBase * 0.6 * counterMult));
              attacker.hp -= counterDmg;

              IRON.flashUnit(attacker);
              IRON.spawnDamageEffect(attacker, counterDmg);
              IRON.updateHealthBar(attacker);

              if (attacker.hp <= 0) {
                attacker.hp = 0;
                attacker.isDead = true;
                IRON.state.grid[attacker.x][attacker.z].unit = null;
                IRON.spawnExplosionEffect(attacker.x, attacker.z);
                IRON.destroyUnitAnim(attacker);

                // Grant kill XP to defender
                IRON.addXP(defender, IRON.VETERANCY.xpPerKill);

                // Kill bounty for counter-kill
                var counterBounty = Math.round((attacker.typeData.cost || 0) * (IRON.KILL_BOUNTY_PCT || 0.25));
                if (counterBounty > 0) {
                  IRON.state[defender.team].credits += counterBounty;
                  if (typeof IRON.addLog === 'function') IRON.addLog('+' + counterBounty + ' credits (kill bounty)', 'info');
                }
                _checkBountyKill(attacker);
              }

              attacker.hasAttacked = true;
              IRON.state.animating = false;
              IRON.checkGameOver();
              resolve({ killed: false, dmg: dmg, counterDmg: counterDmg });
            });
          } else {
            attacker.hasAttacked = true;
            IRON.state.animating = false;
            resolve({ killed: false, dmg: dmg, counterDmg: 0 });
          }
        });
      });
    });
  };

  function _applySplashDamage(attacker, primaryTarget) {
    var grid = IRON.state.grid;
    var W = IRON.GRID_W, H = IRON.GRID_H;
    var dirs = [
      { dx: 1, dz: 0 }, { dx: -1, dz: 0 },
      { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
    ];

    for (var d = 0; d < dirs.length; d++) {
      var sx = primaryTarget.x + dirs[d].dx;
      var sz = primaryTarget.z + dirs[d].dz;
      if (sx < 0 || sx >= W || sz < 0 || sz >= H) continue;
      var tile = grid[sx][sz];

      // Terrain destruction on splash
      IRON.destroyTerrain(sx, sz);

      if (tile.unit && !tile.unit.isDead && tile.unit.id !== attacker.id) {
        (function (splashTarget) {
          var splashDmg = Math.max(1, Math.round(IRON.calculateDamage(attacker, splashTarget) * 0.4));
          splashTarget.hp -= splashDmg;
          IRON.flashUnit(splashTarget);
          IRON.spawnDamageEffect(splashTarget, splashDmg);
          IRON.updateHealthBar(splashTarget);

          if (splashTarget.hp <= 0) {
            splashTarget.hp = 0;
            splashTarget.isDead = true;
            grid[splashTarget.x][splashTarget.z].unit = null;
            IRON.spawnExplosionEffect(splashTarget.x, splashTarget.z);
            IRON.destroyUnitAnim(splashTarget);

            // Grant kill XP
            IRON.addXP(attacker, IRON.VETERANCY.xpPerKill);
            _checkBountyKill(splashTarget);
          }
        })(tile.unit);
      }
    }

    return IRON.sleep(100);
  }

  IRON.performHeal = function (healer, target) {
    return new Promise(function (resolve) {
      IRON.state.animating = true;
      var amt = healer.typeData.healAmount || 35;
      target.hp = Math.min(target.maxHp, target.hp + amt);

      IRON.spawnHealEffect(target, amt);
      IRON.updateHealthBar(target);

      // Grant XP for healing
      IRON.addXP(healer, IRON.VETERANCY.xpPerHeal);

      healer.hasAttacked = true;

      IRON.sleep(400).then(function () {
        IRON.state.animating = false;
        resolve({ healed: amt });
      });
    });
  };

  // ---------------------------------------------------------------
  //  6. RESOURCE MANAGEMENT
  // ---------------------------------------------------------------
  IRON.calculateIncome = function (team) {
    var ts = IRON.state[team];
    var base = IRON.HQ_INCOME + ts.depots.length * IRON.DEPOT_INCOME;
    // Passive income growth
    base += (IRON.INCOME_GROWTH || 0) * (IRON.state.turn - 1);
    // Territory bonus (per alive unit)
    var aliveCount = 0;
    var units = IRON.state.units;
    for (var i = 0; i < units.length; i++) {
      if (units[i].team === team && !units[i].isDead) aliveCount++;
    }
    base += aliveCount * (IRON.TERRITORY_BONUS || 0);
    return base;
  };

  IRON.collectResources = function (team) {
    var ts = IRON.state[team];
    ts.income = IRON.calculateIncome(team);
    var incomeAmount = ts.income;

    // Income theft: enemy steals a portion of depot income
    var enemyTeam = (team === 'blue') ? 'red' : 'blue';
    var enemyEff = IRON.state[enemyTeam].effects;
    if (enemyEff.incomeTheft > 0 && ts.depots.length > 0) {
      var depotIncome = ts.depots.length * IRON.DEPOT_INCOME;
      var stolenAmount = Math.floor(depotIncome * enemyEff.incomeTheft);
      incomeAmount -= stolenAmount;
      IRON.state[enemyTeam].credits += stolenAmount;
    }

    ts.credits += incomeAmount;
    ts.rp += IRON.RP_PER_TURN;
  };

  IRON.canAfford = function (team, amount) {
    return IRON.state[team].credits >= amount;
  };

  IRON.spendCredits = function (team, amount) {
    IRON.state[team].credits -= amount;
  };

  // ---------------------------------------------------------------
  //  7. RESEARCH SYSTEM
  // ---------------------------------------------------------------
  IRON.canResearch = function (team, researchId) {
    var ts = IRON.state[team];
    var node = IRON.RESEARCH_TREE[researchId];
    if (!node) return false;

    // Already researched
    if (ts.research[researchId] && ts.research[researchId].completed) return false;

    // Already researching something
    if (ts.researching !== null) return false;

    // Can afford credits
    if (ts.credits < node.cost) return false;

    // Can afford RP (if node has rpCost)
    if (node.rpCost && ts.rp < node.rpCost) return false;

    // Prerequisites met
    for (var i = 0; i < node.requires.length; i++) {
      var req = node.requires[i];
      if (!ts.research[req] || !ts.research[req].completed) return false;
    }

    return true;
  };

  IRON.startResearch = function (team, researchId) {
    if (!IRON.canResearch(team, researchId)) return false;
    var ts = IRON.state[team];
    var node = IRON.RESEARCH_TREE[researchId];

    IRON.spendCredits(team, node.cost);
    // Also spend RP if required
    if (node.rpCost) {
      ts.rp -= node.rpCost;
    }
    ts.research[researchId] = { completed: false, turnsLeft: node.turns };
    ts.researching = researchId;
    return true;
  };

  IRON.advanceResearch = function (team) {
    var ts = IRON.state[team];
    if (!ts.researching) return;

    var researchId = ts.researching;
    var entry = ts.research[researchId];
    if (!entry) return;

    // Sabotage research: enemy adds turns to this team's research
    var enemyTeam = (team === 'blue') ? 'red' : 'blue';
    var enemyEff = IRON.state[enemyTeam].effects;
    if (enemyEff.sabotageResearch > 0) {
      entry.turnsLeft += enemyEff.sabotageResearch;
    }

    entry.turnsLeft--;
    if (entry.turnsLeft <= 0) {
      entry.completed = true;
      entry.turnsLeft = 0;
      ts.researching = null;

      // Unlock units from this research
      var node = IRON.RESEARCH_TREE[researchId];
      if (node.effect.unlock) {
        if (ts.unlockedUnits.indexOf(node.effect.unlock) === -1) {
          ts.unlockedUnits.push(node.effect.unlock);
        }
      }

      // Recalculate all effects
      IRON.applyResearchEffects(team);

      if (typeof IRON.addLog === 'function') {
        IRON.addLog(node.name + ' research complete!', 'info');
      }
      if (typeof IRON.showNotification === 'function' && team === 'blue') {
        IRON.showNotification('Research Complete: ' + node.name, 2000);
      }
    }
  };

  IRON.applyResearchEffects = function (team) {
    var ts = IRON.state[team];

    // Reset effects to base
    ts.effects = {
      atkMult: 1,
      defMult: 1,
      defIgnore: 0,
      counterMult: 1,
      hpRegen: 0,
      rangeBonus: 0,
      scoutMoveBonus: 0,
      flyEvasion: 0,
      moveBonus: 0,
      fullVision: false,
      burnChance: 0,
      burnDmg: 0,
      burnDuration: 0,
      lastStandThreshold: 0,
      lastStandDefMult: 0,
      buildQueueBonus: 0,
      buildTimeReduction: 0,
      seeEnemyResearch: false,
      sabotageResearch: 0,
      enemyAtkDebuff: 0,
      incomeTheft: 0,
      empAbility: false,
      visionBonus: 0,
    };

    // Apply all completed research
    for (var rid in ts.research) {
      if (!ts.research[rid].completed) continue;
      var node = IRON.RESEARCH_TREE[rid];
      if (!node) continue;
      var eff = node.effect;

      // Multiplicative effects
      if (eff.atkMult) ts.effects.atkMult *= eff.atkMult;
      if (eff.defMult) ts.effects.defMult *= eff.defMult;

      // Additive effects
      if (eff.defIgnore) ts.effects.defIgnore += eff.defIgnore;
      if (eff.counterMult) ts.effects.counterMult = Math.max(ts.effects.counterMult, eff.counterMult);
      if (eff.hpRegen) ts.effects.hpRegen += eff.hpRegen;
      if (eff.rangeBonus) ts.effects.rangeBonus += eff.rangeBonus;
      if (eff.scoutMoveBonus) ts.effects.scoutMoveBonus += eff.scoutMoveBonus;
      if (eff.flyEvasion) ts.effects.flyEvasion = Math.max(ts.effects.flyEvasion, eff.flyEvasion);
      if (eff.moveBonus) ts.effects.moveBonus += eff.moveBonus;
      if (eff.fullVision) ts.effects.fullVision = true;

      // v4.0 effects
      if (eff.burnChance) ts.effects.burnChance += eff.burnChance;
      if (eff.burnDmg) ts.effects.burnDmg = Math.max(ts.effects.burnDmg, eff.burnDmg);
      if (eff.burnDuration) ts.effects.burnDuration = Math.max(ts.effects.burnDuration, eff.burnDuration);
      if (eff.lastStandThreshold) ts.effects.lastStandThreshold = Math.max(ts.effects.lastStandThreshold, eff.lastStandThreshold);
      if (eff.lastStandDefMult) ts.effects.lastStandDefMult = Math.max(ts.effects.lastStandDefMult, eff.lastStandDefMult);
      if (eff.buildQueueBonus) ts.effects.buildQueueBonus += eff.buildQueueBonus;
      if (eff.buildTimeReduction) ts.effects.buildTimeReduction += eff.buildTimeReduction;
      if (eff.seeEnemyResearch) ts.effects.seeEnemyResearch = true;
      if (eff.sabotageResearch) ts.effects.sabotageResearch += eff.sabotageResearch;
      if (eff.enemyAtkDebuff) ts.effects.enemyAtkDebuff += eff.enemyAtkDebuff;
      if (eff.incomeTheft) ts.effects.incomeTheft += eff.incomeTheft;
      if (eff.empAbility) ts.effects.empAbility = true;
      if (eff.visionBonus) ts.effects.visionBonus += eff.visionBonus;
    }

    // Clamp defIgnore to max 1.0
    if (ts.effects.defIgnore > 1) ts.effects.defIgnore = 1;

    // Update all living units of this team
    var units = IRON.state.units;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.isDead || u.team !== team) continue;
      _applyResearchToUnit(u, ts.effects);
    }
  };

  IRON.getResearchStatus = function (team, researchId) {
    var ts = IRON.state[team];
    var node = IRON.RESEARCH_TREE[researchId];
    if (!node) return 'locked';

    if (ts.research[researchId] && ts.research[researchId].completed) {
      return 'completed';
    }

    if (ts.researching === researchId) {
      return 'researching';
    }

    for (var i = 0; i < node.requires.length; i++) {
      var req = node.requires[i];
      if (!ts.research[req] || !ts.research[req].completed) {
        return 'locked';
      }
    }

    return 'available';
  };

  // ---------------------------------------------------------------
  //  8. PRODUCTION SYSTEM
  // ---------------------------------------------------------------
  IRON.canBuild = function (team, unitType) {
    var ts = IRON.state[team];
    var typeData = IRON.UNIT_TYPES[unitType];
    if (!typeData) return false;

    // Unit type unlocked?
    if (ts.unlockedUnits.indexOf(unitType) === -1) return false;

    // Can afford?
    if (ts.credits < typeData.cost) return false;

    // Build queue limit (max 3 + buildQueueBonus)
    var maxQueue = 3 + (ts.effects.buildQueueBonus || 0);
    if (ts.buildQueue.length >= maxQueue) return false;

    // Check HQ has space nearby
    if (!IRON.findSpawnTile(team)) return false;

    return true;
  };

  IRON.startBuild = function (team, unitType) {
    if (!IRON.canBuild(team, unitType)) return false;
    var ts = IRON.state[team];
    var typeData = IRON.UNIT_TYPES[unitType];

    IRON.spendCredits(team, typeData.cost);
    var turnsLeft = typeData.buildTime;

    // Apply buildTimeReduction
    if (ts.effects.buildTimeReduction > 0) {
      turnsLeft = Math.max(1, turnsLeft - ts.effects.buildTimeReduction);
    }

    ts.buildQueue.push({
      unitType: unitType,
      turnsLeft: turnsLeft,
    });
    return true;
  };

  IRON.advanceProduction = function (team) {
    var ts = IRON.state[team];
    var completed = [];

    for (var i = ts.buildQueue.length - 1; i >= 0; i--) {
      var item = ts.buildQueue[i];
      item.turnsLeft--;
      if (item.turnsLeft <= 0) {
        completed.push(item.unitType);
        ts.buildQueue.splice(i, 1);
      }
    }

    // Spawn completed units near HQ
    for (var c = 0; c < completed.length; c++) {
      var spawnTile = IRON.findSpawnTile(team);
      if (spawnTile) {
        IRON.createUnit(completed[c], team, spawnTile.x, spawnTile.z);
      }
    }
  };

  IRON.findSpawnTile = function (team) {
    var ts = IRON.state[team];
    var hq = ts.hqTile;
    if (!hq) return null;

    var grid = IRON.state.grid;
    var W = IRON.GRID_W, H = IRON.GRID_H;

    var visited = {};
    var key = function (x, z) { return x + ',' + z; };
    var queue = [{ x: hq.x, z: hq.z }];
    visited[key(hq.x, hq.z)] = true;
    var dirs = [
      { dx: 0, dz: -1 }, { dx: 0, dz: 1 },
      { dx: -1, dz: 0 }, { dx: 1, dz: 0 },
      { dx: 1, dz: 1 }, { dx: 1, dz: -1 },
      { dx: -1, dz: 1 }, { dx: -1, dz: -1 },
    ];

    while (queue.length > 0) {
      var cur = queue.shift();
      if (cur.x >= 0 && cur.x < W && cur.z >= 0 && cur.z < H) {
        var tile = grid[cur.x][cur.z];
        if (tile.terrain.passable && !tile.unit) {
          return { x: cur.x, z: cur.z };
        }
      }

      for (var d = 0; d < dirs.length; d++) {
        var nx = cur.x + dirs[d].dx;
        var nz = cur.z + dirs[d].dz;
        if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;
        var nk = key(nx, nz);
        if (visited[nk]) continue;
        visited[nk] = true;
        queue.push({ x: nx, z: nz });
      }
    }

    return null;
  };

  // ---------------------------------------------------------------
  //  9. TURN MANAGEMENT
  // ---------------------------------------------------------------
  IRON.endTurn = function () {
    if (IRON.state.animating) return;
    if (IRON.state.phase === 'gameover') return;

    _deselectAll();

    var currentTeam = IRON.state.currentTeam;
    var modeConfig = IRON.GAME_MODES[IRON.state.settings.gameMode] || IRON.GAME_MODES.CLASSIC;

    if (currentTeam === 'blue') {
      // Blue just finished. Switch to red.
      IRON.state.currentTeam = 'red';
      _resetTeamUnits('red');
      _decrementAbilityCooldowns('red');
      IRON.applyStatusEffects_team('red');
      _medicAutoHeal('red');

      // UI feedback
      if (typeof IRON.addLog === 'function') IRON.addLog('Enemy turn...', 'info');
      if (typeof IRON.showNotification === 'function') IRON.showNotification('ENEMY TURN', 1500);
      if (typeof IRON.updateScores === 'function') IRON.updateScores();

      // Multiplayer hot-seat: both teams are human
      if (IRON.state.settings.multiplayer) {
        IRON.state.phase = 'select';
      } else {
        IRON.state.phase = 'ai';
        // Trigger AI (if available)
        if (typeof IRON.aiTurn === 'function') {
          IRON.sleep(300).then(function () {
            IRON.aiTurn();
          });
        }
      }
    } else {
      // Red just finished. Advance turn, give resources.
      IRON.state.turn++;

      // Advance weather
      if (modeConfig.weather) {
        IRON.advanceWeather();
      }

      // Collect resources for both teams
      IRON.collectResources('blue');
      IRON.collectResources('red');

      // Advance research for both teams
      IRON.advanceResearch('blue');
      IRON.advanceResearch('red');

      // Advance production for both teams
      IRON.advanceProduction('blue');
      IRON.advanceProduction('red');

      // Apply HP regen for both teams
      _applyHpRegen('blue');
      _applyHpRegen('red');

      // Check supply & attrition (WARFARE mode)
      if (modeConfig.supply) {
        IRON.checkSupply('blue');
        IRON.checkSupply('red');
      }

      // Advance secondary objectives (WARFARE mode)
      if (modeConfig.objectives) {
        IRON.advanceObjectives();
        IRON.checkObjectives();
      }

      // Decrement Iron Will turns
      if (IRON.state.blue.ironWillTurns > 0) IRON.state.blue.ironWillTurns--;
      if (IRON.state.red.ironWillTurns > 0) IRON.state.red.ironWillTurns--;

      // Switch to blue
      IRON.state.currentTeam = 'blue';
      _resetTeamUnits('blue');
      _decrementAbilityCooldowns('blue');
      IRON.applyStatusEffects_team('blue');
      _medicAutoHeal('blue');
      IRON.state.phase = 'select';

      // Update fog of war
      if (IRON.state.fogOfWar) {
        IRON.updateVisibility('blue');
        IRON.updateVisibility('red');
      }

      // UI feedback for new turn
      if (typeof IRON.updateScores === 'function') IRON.updateScores();
      if (typeof IRON.updateResources === 'function') IRON.updateResources();

      // Weather notification
      if (modeConfig.weather && IRON.state.weather.current) {
        var weatherName = IRON.state.weather.current.name;
        if (typeof IRON.showNotification === 'function') {
          IRON.showNotification('TURN ' + IRON.state.turn + ' — ' + weatherName + ' — YOUR MOVE', 2000);
        }
      } else {
        if (typeof IRON.showNotification === 'function') IRON.showNotification('TURN ' + IRON.state.turn + ' — YOUR MOVE', 2000);
      }

      if (typeof IRON.addLog === 'function') {
        IRON.addLog('───────────────────────────', 'info');
        IRON.addLog('Turn ' + IRON.state.turn + ': Your orders, Commander.', 'info');
        IRON.addLog('Credits: ' + IRON.state.blue.credits + ' (+' + IRON.state.blue.income + '/turn)', 'info');
      }

      IRON.checkGameOver();
    }
  };

  function _deselectAll() {
    if (IRON.state.selectedUnit) {
      IRON.setSelectionRing(IRON.state.selectedUnit, false);
      IRON.state.selectedUnit = null;
    }
    IRON.state.moveHighlights = [];
    IRON.state.attackHighlights = [];
    IRON.state.healHighlights = [];
    IRON.clearHighlights();
    IRON.state.phase = 'select';
  }

  function _resetTeamUnits(team) {
    var units = IRON.state.units;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.isDead || u.team !== team) continue;
      u.hasMoved = false;
      u.hasAttacked = false;
    }
  }

  function _decrementAbilityCooldowns(team) {
    var units = IRON.state.units;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.isDead || u.team !== team) continue;
      if (u.abilityCooldown > 0) {
        u.abilityCooldown--;
      }
    }
  }

  function _applyHpRegen(team) {
    var regen = IRON.state[team].effects.hpRegen;
    if (regen <= 0) return;
    var units = IRON.state.units;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.isDead || u.team !== team) continue;
      if (u.hp < u.maxHp) {
        u.hp = Math.min(u.maxHp, u.hp + regen);
        IRON.updateHealthBar(u);
      }
    }
  }

  function _medicAutoHeal(team) {
    var units = IRON.state.units;
    var grid = IRON.state.grid;
    var dirs = [
      { dx: 1, dz: 0 }, { dx: -1, dz: 0 },
      { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
    ];

    for (var i = 0; i < units.length; i++) {
      var medic = units[i];
      if (medic.isDead || medic.team !== team) continue;
      if (!medic.typeData.canHeal) continue;

      var healAmt = medic.typeData.healAmount || 35;

      for (var d = 0; d < dirs.length; d++) {
        var tx = medic.x + dirs[d].dx;
        var tz = medic.z + dirs[d].dz;
        if (tx < 0 || tx >= IRON.GRID_W || tz < 0 || tz >= IRON.GRID_H) continue;
        var tile = grid[tx][tz];
        if (tile.unit && tile.unit.team === team && !tile.unit.isDead && tile.unit.hp < tile.unit.maxHp) {
          tile.unit.hp = Math.min(tile.unit.maxHp, tile.unit.hp + healAmt);
          IRON.spawnHealEffect(tile.unit, healAmt);
          IRON.updateHealthBar(tile.unit);
        }
      }
    }
  }

  // ---------------------------------------------------------------
  //  GAME OVER CHECK
  // ---------------------------------------------------------------
  IRON.checkGameOver = function () {
    var blueAlive = false;
    var redAlive = false;
    var units = IRON.state.units;

    for (var i = 0; i < units.length; i++) {
      if (units[i].isDead) continue;
      if (units[i].team === 'blue') blueAlive = true;
      if (units[i].team === 'red') redAlive = true;
    }

    // Check HQ capture
    var grid = IRON.state.grid;
    var blueHQ = IRON.state.blue.hqTile;
    var redHQ = IRON.state.red.hqTile;
    var blueHQCaptured = false;
    var redHQCaptured = false;

    if (blueHQ) {
      var bhTile = grid[blueHQ.x][blueHQ.z];
      if (bhTile.unit && bhTile.unit.team === 'red' && !bhTile.unit.isDead) {
        blueHQCaptured = true;
      }
    }
    if (redHQ) {
      var rhTile = grid[redHQ.x][redHQ.z];
      if (rhTile.unit && rhTile.unit.team === 'blue' && !rhTile.unit.isDead) {
        redHQCaptured = true;
      }
    }

    if (!blueAlive || blueHQCaptured) {
      IRON.state.phase = 'gameover';
      IRON.state.winner = 'red';
      if (typeof IRON.showGameOver === 'function') {
        IRON.showGameOver('red');
      }
      return 'red';
    }

    if (!redAlive || redHQCaptured) {
      IRON.state.phase = 'gameover';
      IRON.state.winner = 'blue';
      if (typeof IRON.showGameOver === 'function') {
        IRON.showGameOver('blue');
      }
      return 'blue';
    }

    return null;
  };

  // ---------------------------------------------------------------
  //  10. DEPOT CAPTURE
  // ---------------------------------------------------------------
  IRON.checkDepotCapture = function () {
    var grid = IRON.state.grid;
    var W = IRON.GRID_W, H = IRON.GRID_H;
    var T = IRON.TERRAIN;

    for (var x = 0; x < W; x++) {
      for (var z = 0; z < H; z++) {
        var tile = grid[x][z];
        if (tile.terrain !== T.DEPOT) continue;
        if (!tile.unit || tile.unit.isDead) continue;

        var captor = tile.unit.team;
        if (tile.owner === captor) continue;

        // Remove from previous owner's depot list
        if (tile.owner) {
          var prevOwner = IRON.state[tile.owner];
          for (var d = prevOwner.depots.length - 1; d >= 0; d--) {
            if (prevOwner.depots[d].x === x && prevOwner.depots[d].z === z) {
              prevOwner.depots.splice(d, 1);
              break;
            }
          }
          prevOwner.income = IRON.calculateIncome(tile.owner);
        }

        // Assign to new owner
        tile.owner = captor;
        var newOwner = IRON.state[captor];
        newOwner.depots.push({ x: x, z: z });
        newOwner.income = IRON.calculateIncome(captor);

        // Grant XP for depot capture
        IRON.addXP(tile.unit, IRON.VETERANCY.xpPerCapture);
      }
    }
  };

  // ---------------------------------------------------------------
  //  CLEANUP DEAD UNITS
  // ---------------------------------------------------------------
  IRON.cleanupDeadUnits = function () {
    var units = IRON.state.units;
    for (var i = units.length - 1; i >= 0; i--) {
      if (units[i].isDead) {
        units.splice(i, 1);
      }
    }
  };

  // ---------------------------------------------------------------
  //  11. FOG OF WAR SYSTEM
  // ---------------------------------------------------------------
  IRON.getUnitVision = function (unit) {
    var vision = unit.typeData.vision || 3;
    var eff = IRON.state[unit.team].effects;

    // Full vision override
    if (eff.fullVision) return 999;

    // Vision bonus from research
    vision += (eff.visionBonus || 0);

    // Weather vision modifier
    var modeConfig = IRON.GAME_MODES[IRON.state.settings.gameMode] || IRON.GAME_MODES.CLASSIC;
    if (modeConfig.weather && IRON.state.weather.current) {
      vision += IRON.state.weather.current.visionMod;
    }

    return Math.max(1, vision);
  };

  IRON.updateVisibility = function (team) {
    if (!IRON.state.fogOfWar) return;

    var vis = {};
    var units = IRON.state.units;

    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.isDead || u.team !== team) continue;

      var range = IRON.getUnitVision(u);

      // Manhattan distance visibility
      for (var dx = -range; dx <= range; dx++) {
        for (var dz = -range; dz <= range; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > range) continue;
          var tx = u.x + dx;
          var tz = u.z + dz;
          if (tx < 0 || tx >= IRON.GRID_W || tz < 0 || tz >= IRON.GRID_H) continue;
          vis[tx + ',' + tz] = true;
        }
      }
    }

    // Also always see HQ tiles
    var hq = IRON.state[team].hqTile;
    if (hq) {
      vis[hq.x + ',' + hq.z] = true;
    }

    IRON.state.visibility[team] = vis;
  };

  IRON.isTileVisible = function (team, x, z) {
    if (!IRON.state.fogOfWar) return true;
    var eff = IRON.state[team].effects;
    if (eff.fullVision) return true;
    return !!IRON.state.visibility[team][x + ',' + z];
  };

  // ---------------------------------------------------------------
  //  12. WEATHER SYSTEM
  // ---------------------------------------------------------------
  IRON.advanceWeather = function () {
    var weather = IRON.state.weather;
    weather.turnsUntilChange--;

    if (weather.turnsUntilChange <= 0) {
      // Pick new weather (never same as current)
      var types = IRON.WEATHER_TYPES;
      var currentId = weather.current.id;
      var available = [];
      for (var i = 0; i < types.length; i++) {
        if (types[i].id !== currentId) {
          available.push(types[i]);
        }
      }
      var newWeather = available[Math.floor(Math.random() * available.length)];
      weather.current = newWeather;
      weather.turnsUntilChange = IRON.WEATHER_CHANGE_INTERVAL;

      if (typeof IRON.addLog === 'function') {
        IRON.addLog('Weather changed: ' + newWeather.name + ' — ' + newWeather.desc, 'info');
      }
    }
  };

  // ---------------------------------------------------------------
  //  13. VETERANCY SYSTEM
  // ---------------------------------------------------------------
  IRON.addXP = function (unit, amount) {
    if (!unit || unit.isDead) return;
    unit.xp = (unit.xp || 0) + amount;

    // Check for rank up
    var ranks = IRON.VETERANCY.ranks;
    var oldRank = unit.rank || 0;
    var newRank = oldRank;

    for (var r = ranks.length - 1; r >= 0; r--) {
      if (unit.xp >= ranks[r].xp) {
        newRank = r;
        break;
      }
    }

    if (newRank > oldRank) {
      unit.rank = newRank;
      var rankData = ranks[newRank];

      // Increase max HP by rank hpBonus
      unit.maxHp = unit.typeData.hp + rankData.hpBonus;
      unit.hp = Math.min(unit.hp + rankData.hpBonus, unit.maxHp);

      // Recalculate stats with new rank bonuses
      var eff = IRON.state[unit.team].effects;
      _applyResearchToUnit(unit, eff);

      // Notification
      if (typeof IRON.addLog === 'function') {
        IRON.addLog(unit.typeData.name + ' promoted to ' + rankData.name + '! ' + rankData.icon, 'info');
      }
      if (typeof IRON.showNotification === 'function') {
        IRON.showNotification(unit.typeData.name + ' → ' + rankData.name + '!', 1500);
      }
    }
  };

  IRON.getUnitRank = function (unit) {
    var rank = unit.rank || 0;
    return IRON.VETERANCY.ranks[rank] || IRON.VETERANCY.ranks[0];
  };

  // ---------------------------------------------------------------
  //  14. ACTIVE ABILITIES
  // ---------------------------------------------------------------
  IRON.canUseAbility = function (unit) {
    if (!unit || unit.isDead) return false;
    if (unit.hasMoved && unit.hasAttacked) return false;
    if (unit.abilityCooldown > 0) return false;

    var ability = IRON.ABILITIES[unit.unitType];
    if (!ability) return false;

    // Check if air unit grounded by weather
    var modeConfig = IRON.GAME_MODES[IRON.state.settings.gameMode] || IRON.GAME_MODES.CLASSIC;
    if (modeConfig.weather && IRON.state.weather.current && IRON.state.weather.current.airDisabled && unit.typeData.flying) {
      return false;
    }

    // Disabled/frozen units cannot use abilities
    if (IRON.hasStatus(unit, 'disabled') || IRON.hasStatus(unit, 'frozen')) {
      return false;
    }

    return true;
  };

  IRON.getAbilityTargets = function (unit) {
    if (!IRON.canUseAbility(unit)) return [];

    var ability = IRON.ABILITIES[unit.unitType];
    if (!ability) return [];

    var grid = IRON.state.grid;
    var W = IRON.GRID_W, H = IRON.GRID_H;
    var targets = [];
    var dirs = [
      { dx: 1, dz: 0 }, { dx: -1, dz: 0 },
      { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
    ];

    switch (ability.type) {
      case 'self_buff':
        // Target is self
        targets.push(grid[unit.x][unit.z]);
        break;

      case 'charge':
        // Target is an adjacent enemy tile
        for (var d = 0; d < dirs.length; d++) {
          var cx = unit.x + dirs[d].dx;
          var cz = unit.z + dirs[d].dz;
          if (cx < 0 || cx >= W || cz < 0 || cz >= H) continue;
          var ct = grid[cx][cz];
          if (ct.unit && ct.unit.team !== unit.team && !ct.unit.isDead) {
            targets.push(ct);
          }
        }
        break;

      case 'area_debuff':
      case 'smoke':
        // Target any tile within attack range
        var aRange = ability.radius + 2; // can target nearby area
        for (var adx = -aRange; adx <= aRange; adx++) {
          for (var adz = -aRange; adz <= aRange; adz++) {
            if (Math.abs(adx) + Math.abs(adz) > aRange) continue;
            var ax = unit.x + adx;
            var az = unit.z + adz;
            if (ax < 0 || ax >= W || az < 0 || az >= H) continue;
            targets.push(grid[ax][az]);
          }
        }
        break;

      case 'rally':
        // Adjacent friendly units
        for (var rd = 0; rd < dirs.length; rd++) {
          var rx = unit.x + dirs[rd].dx;
          var rz = unit.z + dirs[rd].dz;
          if (rx < 0 || rx >= W || rz < 0 || rz >= H) continue;
          var rt = grid[rx][rz];
          if (rt.unit && rt.unit.team === unit.team && !rt.unit.isDead && rt.unit.id !== unit.id) {
            targets.push(rt);
          }
        }
        break;

      case 'debuff':
        // Enemy units within attack range
        var dRange = unit.atkRange;
        for (var ddx = -dRange; ddx <= dRange; ddx++) {
          for (var ddz = -dRange; ddz <= dRange; ddz++) {
            if (ddx === 0 && ddz === 0) continue;
            if (Math.abs(ddx) + Math.abs(ddz) > dRange) continue;
            var dtx = unit.x + ddx;
            var dtz = unit.z + ddz;
            if (dtx < 0 || dtx >= W || dtz < 0 || dtz >= H) continue;
            var dt = grid[dtx][dtz];
            if (dt.unit && dt.unit.team !== unit.team && !dt.unit.isDead) {
              targets.push(dt);
            }
          }
        }
        break;

      case 'full_heal':
        // Adjacent friendly units
        for (var fd = 0; fd < dirs.length; fd++) {
          var fhx = unit.x + dirs[fd].dx;
          var fhz = unit.z + dirs[fd].dz;
          if (fhx < 0 || fhx >= W || fhz < 0 || fhz >= H) continue;
          var fht = grid[fhx][fhz];
          if (fht.unit && fht.unit.team === unit.team && !fht.unit.isDead && fht.unit.hp < fht.unit.maxHp) {
            targets.push(fht);
          }
        }
        break;

      case 'build_turret':
        // Adjacent empty passable tiles
        for (var bd = 0; bd < dirs.length; bd++) {
          var bx = unit.x + dirs[bd].dx;
          var bz = unit.z + dirs[bd].dz;
          if (bx < 0 || bx >= W || bz < 0 || bz >= H) continue;
          var bt = grid[bx][bz];
          if (bt.terrain.passable && !bt.unit) {
            targets.push(bt);
          }
        }
        break;

      case 'airstrike':
      case 'cluster':
        // Any tile within large range
        var asRange = ability.radius + 4;
        for (var asx = -asRange; asx <= asRange; asx++) {
          for (var asz = -asRange; asz <= asRange; asz++) {
            if (Math.abs(asx) + Math.abs(asz) > asRange) continue;
            var atx = unit.x + asx;
            var atz = unit.z + asz;
            if (atx < 0 || atx >= W || atz < 0 || atz >= H) continue;
            targets.push(grid[atx][atz]);
          }
        }
        break;

      case 'disable':
        // Adjacent enemy units (or within ability range)
        var disRange = ability.range || 1;
        for (var disx = -disRange; disx <= disRange; disx++) {
          for (var disz = -disRange; disz <= disRange; disz++) {
            if (disx === 0 && disz === 0) continue;
            if (Math.abs(disx) + Math.abs(disz) > disRange) continue;
            var dix = unit.x + disx;
            var diz = unit.z + disz;
            if (dix < 0 || dix >= W || diz < 0 || diz >= H) continue;
            var dit = grid[dix][diz];
            if (dit.unit && dit.unit.team !== unit.team && !dit.unit.isDead) {
              targets.push(dit);
            }
          }
        }
        break;
    }

    return targets;
  };

  IRON.useAbility = function (unit, targetX, targetZ) {
    if (!IRON.canUseAbility(unit)) return false;

    var ability = IRON.ABILITIES[unit.unitType];
    if (!ability) return false;

    var grid = IRON.state.grid;
    var W = IRON.GRID_W, H = IRON.GRID_H;
    var tile = grid[targetX] && grid[targetX][targetZ];
    if (!tile) return false;

    switch (ability.type) {
      case 'self_buff': {
        // Apply status effect to unit
        var buffType = unit.unitType === 'HEAVY_MECH' ? 'siege' : 'entrenched';
        IRON.addStatusEffect(unit, {
          type: buffType,
          turnsLeft: ability.duration,
          defBuff: ability.defBuff || 0,
          atkBuff: ability.atkBuff || 0,
          immobile: ability.immobile || false,
        });
        if (typeof IRON.addLog === 'function') {
          IRON.addLog(unit.typeData.name + ' activates ' + ability.name + '!', 'combat');
        }
        break;
      }

      case 'charge': {
        // Move through target tile, deal damage
        if (tile.unit && tile.unit.team !== unit.team && !tile.unit.isDead) {
          var chargeDmg = Math.round(unit.atk * ability.damageRatio);
          tile.unit.hp -= chargeDmg;
          IRON.flashUnit(tile.unit);
          IRON.spawnDamageEffect(tile.unit, chargeDmg);
          IRON.updateHealthBar(tile.unit);

          if (tile.unit.hp <= 0) {
            tile.unit.hp = 0;
            tile.unit.isDead = true;
            grid[tile.unit.x][tile.unit.z].unit = null;
            IRON.spawnExplosionEffect(tile.unit.x, tile.unit.z);
            IRON.destroyUnitAnim(tile.unit);
            IRON.addXP(unit, IRON.VETERANCY.xpPerKill);
            _checkBountyKill(tile.unit);

            // Move unit to the now-empty tile
            grid[unit.x][unit.z].unit = null;
            unit.x = targetX;
            unit.z = targetZ;
            grid[targetX][targetZ].unit = unit;
            if (unit.mesh) {
              unit.mesh.position.x = targetX * (IRON.TILE_SIZE + IRON.TILE_GAP);
              unit.mesh.position.z = targetZ * (IRON.TILE_SIZE + IRON.TILE_GAP);
            }
          }
        }
        break;
      }

      case 'area_debuff': {
        // Apply move debuff to all enemies in radius
        var radius = ability.radius || 1;
        for (var adx = -radius; adx <= radius; adx++) {
          for (var adz = -radius; adz <= radius; adz++) {
            if (Math.abs(adx) + Math.abs(adz) > radius) continue;
            var ax = targetX + adx;
            var az = targetZ + adz;
            if (ax < 0 || ax >= W || az < 0 || az >= H) continue;
            var at = grid[ax][az];
            if (at.unit && at.unit.team !== unit.team && !at.unit.isDead) {
              IRON.addStatusEffect(at.unit, {
                type: 'suppressed',
                turnsLeft: ability.duration || 1,
                moveDebuff: ability.moveDebuff || 0.50,
              });
            }
          }
        }
        if (typeof IRON.addLog === 'function') {
          IRON.addLog(unit.typeData.name + ' suppresses area!', 'combat');
        }
        break;
      }

      case 'smoke': {
        // Create smoke status on the tile (blocks vision)
        // We store smoke as a tile-level property
        tile.smoke = { turnsLeft: ability.duration || 2 };
        if (typeof IRON.addLog === 'function') {
          IRON.addLog(unit.typeData.name + ' deploys smoke screen!', 'combat');
        }
        break;
      }

      case 'rally': {
        // Reset hasMoved and hasAttacked on one adjacent friendly unit
        if (tile.unit && tile.unit.team === unit.team && !tile.unit.isDead && tile.unit.id !== unit.id) {
          tile.unit.hasMoved = false;
          tile.unit.hasAttacked = false;
          if (typeof IRON.addLog === 'function') {
            IRON.addLog(unit.typeData.name + ' rallies ' + tile.unit.typeData.name + '!', 'combat');
          }
        }
        break;
      }

      case 'debuff': {
        // Apply defDebuff to target enemy unit
        if (tile.unit && tile.unit.team !== unit.team && !tile.unit.isDead) {
          IRON.addStatusEffect(tile.unit, {
            type: 'marked',
            turnsLeft: ability.duration || 2,
            defDebuff: ability.defDebuff || 0.30,
          });
          if (typeof IRON.addLog === 'function') {
            IRON.addLog(unit.typeData.name + ' marks ' + tile.unit.typeData.name + '!', 'combat');
          }
        }
        break;
      }

      case 'full_heal': {
        // Heal adjacent friendly unit to full HP
        if (tile.unit && tile.unit.team === unit.team && !tile.unit.isDead) {
          var healAmt = tile.unit.maxHp - tile.unit.hp;
          tile.unit.hp = tile.unit.maxHp;
          IRON.spawnHealEffect(tile.unit, healAmt);
          IRON.updateHealthBar(tile.unit);
          IRON.addXP(unit, IRON.VETERANCY.xpPerHeal);
          if (typeof IRON.addLog === 'function') {
            IRON.addLog(unit.typeData.name + ' fully heals ' + tile.unit.typeData.name + '!', 'combat');
          }
        }
        break;
      }

      case 'build_turret': {
        // Create a static turret unit at target tile
        if (tile.terrain.passable && !tile.unit) {
          // Create turret as a simple unit-like object
          var turret = {
            id: uid(),
            unitType: 'TURRET',
            typeData: {
              name: 'Turret', icon: '🔫', type: 'STATIC TURRET',
              hp: ability.turretHp || 50,
              atk: ability.turretAtk || 30,
              def: 10,
              moveRange: 0,
              atkRange: ability.turretRange || 3,
              scale: 0.5,
              cost: 0, buildTime: 0,
              category: 'structure',
              vision: 3,
            },
            team: unit.team,
            x: targetX,
            z: targetZ,
            hp: ability.turretHp || 50,
            maxHp: ability.turretHp || 50,
            atk: ability.turretAtk || 30,
            def: 10,
            moveRange: 0,
            atkRange: ability.turretRange || 3,
            hasMoved: true,
            hasAttacked: false,
            isDead: false,
            mesh: null,
            xp: 0,
            rank: 0,
            abilityCooldown: 0,
            statusEffects: [],
            stealthed: false,
          };

          turret.mesh = IRON.buildUnitModel(turret);
          if (turret.mesh) {
            IRON.unitGroup.add(turret.mesh);
          }
          tile.unit = turret;
          IRON.state.units.push(turret);

          if (typeof IRON.addLog === 'function') {
            IRON.addLog(unit.typeData.name + ' deploys a turret!', 'combat');
          }
        }
        break;
      }

      case 'airstrike':
      case 'cluster': {
        // Deal area damage to all enemies in radius around target
        var asRadius = ability.radius || 2;
        var damageRatio = ability.damageRatio || 0.40;
        for (var asx = -asRadius; asx <= asRadius; asx++) {
          for (var asz = -asRadius; asz <= asRadius; asz++) {
            if (Math.abs(asx) + Math.abs(asz) > asRadius) continue;
            var atx = targetX + asx;
            var atz = targetZ + asz;
            if (atx < 0 || atx >= W || atz < 0 || atz >= H) continue;
            var at2 = grid[atx][atz];

            // Terrain destruction
            IRON.destroyTerrain(atx, atz);

            if (at2.unit && at2.unit.team !== unit.team && !at2.unit.isDead) {
              (function (target) {
                var dmg = Math.max(1, Math.round(unit.atk * damageRatio));
                target.hp -= dmg;
                IRON.flashUnit(target);
                IRON.spawnDamageEffect(target, dmg);
                IRON.updateHealthBar(target);

                if (target.hp <= 0) {
                  target.hp = 0;
                  target.isDead = true;
                  grid[target.x][target.z].unit = null;
                  IRON.spawnExplosionEffect(target.x, target.z);
                  IRON.destroyUnitAnim(target);
                  IRON.addXP(unit, IRON.VETERANCY.xpPerKill);
                  _checkBountyKill(target);
                }
              })(at2.unit);
            }
          }
        }
        if (typeof IRON.addLog === 'function') {
          IRON.addLog(unit.typeData.name + ' launches ' + ability.name + '!', 'combat');
        }
        break;
      }

      case 'disable': {
        // Prevent target enemy from acting next turn
        if (tile.unit && tile.unit.team !== unit.team && !tile.unit.isDead) {
          IRON.addStatusEffect(tile.unit, {
            type: 'disabled',
            turnsLeft: ability.duration || 1,
          });
          if (typeof IRON.addLog === 'function') {
            IRON.addLog(unit.typeData.name + ' disables ' + tile.unit.typeData.name + '!', 'combat');
          }
        }
        break;
      }
    }

    // Set cooldown and mark unit as having acted
    unit.abilityCooldown = ability.cooldown;
    unit.hasAttacked = true;
    unit.hasMoved = true;

    return true;
  };

  // ---------------------------------------------------------------
  //  15. STATUS EFFECTS SYSTEM
  // ---------------------------------------------------------------
  IRON.addStatusEffect = function (unit, effect) {
    if (!unit || unit.isDead) return;

    // Merge if same type exists
    for (var i = 0; i < unit.statusEffects.length; i++) {
      if (unit.statusEffects[i].type === effect.type) {
        // Refresh duration and data
        unit.statusEffects[i].turnsLeft = effect.turnsLeft;
        for (var key in effect) {
          if (key !== 'type' && key !== 'turnsLeft') {
            unit.statusEffects[i][key] = effect[key];
          }
        }
        return;
      }
    }
    unit.statusEffects.push(effect);
  };

  IRON.hasStatus = function (unit, type) {
    if (!unit || !unit.statusEffects) return false;
    for (var i = 0; i < unit.statusEffects.length; i++) {
      if (unit.statusEffects[i].type === type && unit.statusEffects[i].turnsLeft > 0) {
        return true;
      }
    }
    return false;
  };

  function _getStatus(unit, type) {
    if (!unit || !unit.statusEffects) return null;
    for (var i = 0; i < unit.statusEffects.length; i++) {
      if (unit.statusEffects[i].type === type) return unit.statusEffects[i];
    }
    return null;
  }

  // Called at start of a team's turn for all their units
  IRON.applyStatusEffects_team = function (team) {
    var units = IRON.state.units;
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.isDead || u.team !== team) continue;
      IRON.applyStatusEffects(u);
    }
  };

  IRON.applyStatusEffects = function (unit) {
    if (!unit || unit.isDead || !unit.statusEffects) return;

    for (var i = unit.statusEffects.length - 1; i >= 0; i--) {
      var effect = unit.statusEffects[i];

      switch (effect.type) {
        case 'burn':
          // Deal burn damage
          var burnDmg = effect.damage || 5;
          unit.hp -= burnDmg;
          if (typeof IRON.spawnDamageEffect === 'function') {
            IRON.spawnDamageEffect(unit, burnDmg);
          }
          if (typeof IRON.updateHealthBar === 'function') {
            IRON.updateHealthBar(unit);
          }
          if (unit.hp <= 0) {
            unit.hp = 0;
            unit.isDead = true;
            if (IRON.state.grid[unit.x] && IRON.state.grid[unit.x][unit.z]) {
              IRON.state.grid[unit.x][unit.z].unit = null;
            }
            if (typeof IRON.spawnExplosionEffect === 'function') {
              IRON.spawnExplosionEffect(unit.x, unit.z);
            }
            if (typeof IRON.destroyUnitAnim === 'function') {
              IRON.destroyUnitAnim(unit);
            }
          }
          break;

        case 'entrenched':
        case 'siege':
          // Buffs are applied via calculateDamage checks — nothing extra needed here
          break;

        case 'marked':
          // DEF debuff applied in calculateDamage — nothing extra here
          break;

        case 'disabled':
        case 'frozen':
          // Prevent unit from acting
          unit.hasMoved = true;
          unit.hasAttacked = true;
          break;

        case 'suppressed':
          // Movement halving is handled in getMovableTiles
          break;
      }

      // Decrement turnsLeft
      effect.turnsLeft--;

      // Remove expired effects
      if (effect.turnsLeft <= 0) {
        unit.statusEffects.splice(i, 1);
      }
    }
  };

  // ---------------------------------------------------------------
  //  16. DESTRUCTIBLE TERRAIN
  // ---------------------------------------------------------------
  IRON.destroyTerrain = function (x, z) {
    var grid = IRON.state.grid;
    if (!grid[x] || !grid[x][z]) return;
    var tile = grid[x][z];
    var T = IRON.TERRAIN;

    if (tile.terrain === T.BRIDGE && tile.terrain.destructible) {
      tile.terrain = T.WATER;
      tile.elevation = -0.15;
      // Rebuild tile mesh
      if (typeof IRON.rebuildTileMesh === 'function') {
        IRON.rebuildTileMesh(tile);
      } else if (typeof IRON.buildTileMesh === 'function') {
        IRON.buildTileMesh(tile);
      }
      if (typeof IRON.addLog === 'function') {
        IRON.addLog('Bridge destroyed at (' + x + ',' + z + ')!', 'warning');
      }
      // If a unit was on the bridge, it falls into water
      if (tile.unit && !tile.unit.isDead && !tile.unit.typeData.flying) {
        tile.unit.hp = 0;
        tile.unit.isDead = true;
        tile.unit = null;
      }
    } else if (tile.terrain === T.FOREST) {
      tile.terrain = T.BURNED;
      tile.elevation = 0;
      if (typeof IRON.rebuildTileMesh === 'function') {
        IRON.rebuildTileMesh(tile);
      } else if (typeof IRON.buildTileMesh === 'function') {
        IRON.buildTileMesh(tile);
      }
    }
  };

  // ---------------------------------------------------------------
  //  17. UNIT MERGING
  // ---------------------------------------------------------------
  IRON.canMerge = function (unit) {
    if (!unit || unit.isDead) return [];
    var threshold = IRON.MERGE_HP_THRESHOLD;

    // Unit must be below threshold
    if (unit.hp / unit.maxHp > threshold) return [];

    var grid = IRON.state.grid;
    var W = IRON.GRID_W, H = IRON.GRID_H;
    var dirs = [
      { dx: 1, dz: 0 }, { dx: -1, dz: 0 },
      { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
    ];
    var candidates = [];

    for (var d = 0; d < dirs.length; d++) {
      var nx = unit.x + dirs[d].dx;
      var nz = unit.z + dirs[d].dz;
      if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;
      var tile = grid[nx][nz];
      if (tile.unit && !tile.unit.isDead &&
          tile.unit.team === unit.team &&
          tile.unit.unitType === unit.unitType &&
          tile.unit.hp / tile.unit.maxHp <= threshold) {
        candidates.push(tile.unit);
      }
    }

    return candidates;
  };

  IRON.mergeUnits = function (unit, target) {
    if (!unit || !target || unit.isDead || target.isDead) return false;

    // Combine HP (cap at maxHp)
    unit.hp = Math.min(unit.maxHp, unit.hp + target.hp);
    IRON.updateHealthBar(unit);

    // Take the higher XP/rank
    if ((target.xp || 0) > (unit.xp || 0)) {
      unit.xp = target.xp;
      unit.rank = target.rank;
      // Recalculate stats
      var eff = IRON.state[unit.team].effects;
      var rankData = IRON.VETERANCY.ranks[unit.rank];
      if (rankData) {
        unit.maxHp = unit.typeData.hp + rankData.hpBonus;
        unit.hp = Math.min(unit.hp, unit.maxHp);
      }
      _applyResearchToUnit(unit, eff);
    }

    // Remove target
    target.hp = 0;
    target.isDead = true;
    IRON.state.grid[target.x][target.z].unit = null;

    // Animate target disappearing
    if (typeof IRON.destroyUnitAnim === 'function') {
      IRON.destroyUnitAnim(target);
    }

    if (typeof IRON.addLog === 'function') {
      IRON.addLog(unit.typeData.name + ' units merged!', 'info');
    }

    return true;
  };

  // ---------------------------------------------------------------
  //  18. SUPPLY & ATTRITION
  // ---------------------------------------------------------------
  IRON.checkSupply = function (team) {
    var ts = IRON.state[team];
    var units = IRON.state.units;
    var grid = IRON.state.grid;
    var W = IRON.GRID_W, H = IRON.GRID_H;

    // Collect all supply sources: HQ tiles and owned depots
    var supplySources = [];
    // HQ tiles
    var hq = ts.hqTile;
    if (hq) {
      supplySources.push(hq);
      // Also check adjacent HQ tiles
      for (var hx = 0; hx < W; hx++) {
        for (var hz = 0; hz < H; hz++) {
          if (grid[hx][hz].terrain === IRON.TERRAIN.HQ && grid[hx][hz].owner === team) {
            supplySources.push({ x: hx, z: hz });
          }
        }
      }
    }
    // Owned depots
    for (var d = 0; d < ts.depots.length; d++) {
      supplySources.push(ts.depots[d]);
    }

    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.isDead || u.team !== team) continue;

      // Find minimum distance to any supply source
      var minDist = Infinity;
      for (var s = 0; s < supplySources.length; s++) {
        var dist = Math.abs(u.x - supplySources[s].x) + Math.abs(u.z - supplySources[s].z);
        if (dist < minDist) minDist = dist;
      }

      if (minDist > IRON.SUPPLY_RANGE) {
        u.hp -= IRON.ATTRITION_DAMAGE;
        if (typeof IRON.updateHealthBar === 'function') {
          IRON.updateHealthBar(u);
        }
        if (typeof IRON.addLog === 'function') {
          IRON.addLog(u.typeData.name + ' suffering attrition! (-' + IRON.ATTRITION_DAMAGE + ' HP)', 'warning');
        }

        if (u.hp <= 0) {
          u.hp = 0;
          u.isDead = true;
          if (grid[u.x] && grid[u.x][u.z]) {
            grid[u.x][u.z].unit = null;
          }
          if (typeof IRON.spawnExplosionEffect === 'function') {
            IRON.spawnExplosionEffect(u.x, u.z);
          }
          if (typeof IRON.destroyUnitAnim === 'function') {
            IRON.destroyUnitAnim(u);
          }
        }
      }
    }
  };

  // ---------------------------------------------------------------
  //  19. SECONDARY OBJECTIVES
  // ---------------------------------------------------------------
  IRON.spawnObjective = function () {
    var templates = IRON.OBJECTIVE_TEMPLATES;
    var template = templates[Math.floor(Math.random() * templates.length)];
    var grid = IRON.state.grid;
    var W = IRON.GRID_W, H = IRON.GRID_H;
    var T = IRON.TERRAIN;

    // Find a valid neutral tile (plains or road, not near HQ)
    var attempts = 0;
    var maxAttempts = 100;
    var tile = null;

    while (attempts < maxAttempts) {
      var rx = Math.floor(Math.random() * W);
      var rz = Math.floor(Math.random() * H);
      var candidate = grid[rx][rz];

      if ((candidate.terrain === T.PLAINS || candidate.terrain === T.ROAD) && !candidate.unit) {
        // Not too close to either HQ
        var blueHQ = IRON.state.blue.hqTile;
        var redHQ = IRON.state.red.hqTile;
        var distBlue = blueHQ ? Math.abs(rx - blueHQ.x) + Math.abs(rz - blueHQ.z) : 999;
        var distRed = redHQ ? Math.abs(rx - redHQ.x) + Math.abs(rz - redHQ.z) : 999;

        if (distBlue >= 5 && distRed >= 5) {
          tile = candidate;
          break;
        }
      }
      attempts++;
    }

    if (!tile) return null;

    var objective = {
      id: uid(),
      type: template.type,
      icon: template.icon,
      reward: template.reward,
      text: template.text.replace('{x}', tile.x).replace('{z}', tile.z),
      x: tile.x,
      z: tile.z,
      turnsActive: 0,
    };

    // Type-specific data
    if (template.type === 'hold_zone') {
      objective.turnsNeeded = template.turnsNeeded || 3;
      objective.blueHoldTurns = 0;
      objective.redHoldTurns = 0;
    } else if (template.type === 'bounty') {
      // Mark a random enemy unit
      var enemies = [];
      var units = IRON.state.units;
      for (var i = 0; i < units.length; i++) {
        if (!units[i].isDead) enemies.push(units[i]);
      }
      if (enemies.length > 0) {
        var bountyTarget = enemies[Math.floor(Math.random() * enemies.length)];
        objective.targetUnitId = bountyTarget.id;
        objective.targetTeam = bountyTarget.team;
      }
    } else if (template.type === 'evac_zone') {
      objective.turnsToEvac = template.turnsToEvac || 2;
    }

    IRON.state.objectives.push(objective);

    if (typeof IRON.addLog === 'function') {
      IRON.addLog('OBJECTIVE: ' + objective.text, 'info');
    }
    if (typeof IRON.showNotification === 'function') {
      IRON.showNotification(objective.icon + ' ' + objective.text, 3000);
    }

    return objective;
  };

  IRON.checkObjectives = function () {
    var grid = IRON.state.grid;
    var objectives = IRON.state.objectives;

    for (var i = objectives.length - 1; i >= 0; i--) {
      var obj = objectives[i];

      switch (obj.type) {
        case 'supply_drop': {
          // If any unit standing on objective tile, grant reward
          var sdTile = grid[obj.x][obj.z];
          if (sdTile.unit && !sdTile.unit.isDead) {
            var sdTeam = sdTile.unit.team;
            IRON.state[sdTeam].credits += obj.reward;
            if (typeof IRON.addLog === 'function') {
              IRON.addLog(sdTeam + ' collected supply drop! +' + obj.reward + ' credits', 'info');
            }
            objectives.splice(i, 1);
          }
          break;
        }

        case 'hold_zone': {
          var hzTile = grid[obj.x][obj.z];
          if (hzTile.unit && !hzTile.unit.isDead) {
            var holdTeam = hzTile.unit.team;
            if (holdTeam === 'blue') {
              obj.blueHoldTurns++;
            } else {
              obj.redHoldTurns++;
            }

            if (obj.blueHoldTurns >= obj.turnsNeeded) {
              IRON.state.blue.credits += obj.reward;
              if (typeof IRON.addLog === 'function') {
                IRON.addLog('Blue holds zone! +' + obj.reward + ' credits', 'info');
              }
              objectives.splice(i, 1);
            } else if (obj.redHoldTurns >= obj.turnsNeeded) {
              IRON.state.red.credits += obj.reward;
              if (typeof IRON.addLog === 'function') {
                IRON.addLog('Red holds zone! +' + obj.reward + ' credits', 'info');
              }
              objectives.splice(i, 1);
            }
          }
          break;
        }

        case 'bounty': {
          // Check if bounty target is dead
          if (obj.targetUnitId) {
            var found = false;
            var units = IRON.state.units;
            for (var bi = 0; bi < units.length; bi++) {
              if (units[bi].id === obj.targetUnitId) {
                if (units[bi].isDead) {
                  // Grant reward to opposing team
                  var rewardTeam = obj.targetTeam === 'blue' ? 'red' : 'blue';
                  IRON.state[rewardTeam].credits += obj.reward;
                  if (typeof IRON.addLog === 'function') {
                    IRON.addLog('Bounty collected by ' + rewardTeam + '! +' + obj.reward + ' credits', 'info');
                  }
                  objectives.splice(i, 1);
                }
                found = true;
                break;
              }
            }
            if (!found) {
              // Unit no longer exists, remove objective
              objectives.splice(i, 1);
            }
          }
          break;
        }

        case 'evac_zone': {
          obj.turnsToEvac--;
          if (obj.turnsToEvac <= 0) {
            // Damage all units on the tile
            var evTile = grid[obj.x][obj.z];
            // Damage units in area (radius 1)
            for (var edx = -1; edx <= 1; edx++) {
              for (var edz = -1; edz <= 1; edz++) {
                var ex = obj.x + edx;
                var ez = obj.z + edz;
                if (ex < 0 || ex >= IRON.GRID_W || ez < 0 || ez >= IRON.GRID_H) continue;
                var et = grid[ex][ez];
                if (et.unit && !et.unit.isDead) {
                  var evacDmg = 60;
                  et.unit.hp -= evacDmg;
                  if (typeof IRON.spawnDamageEffect === 'function') {
                    IRON.spawnDamageEffect(et.unit, evacDmg);
                  }
                  if (typeof IRON.updateHealthBar === 'function') {
                    IRON.updateHealthBar(et.unit);
                  }
                  if (et.unit.hp <= 0) {
                    et.unit.hp = 0;
                    et.unit.isDead = true;
                    grid[et.unit.x][et.unit.z].unit = null;
                    if (typeof IRON.spawnExplosionEffect === 'function') {
                      IRON.spawnExplosionEffect(et.unit.x, et.unit.z);
                    }
                    if (typeof IRON.destroyUnitAnim === 'function') {
                      IRON.destroyUnitAnim(et.unit);
                    }
                  }
                }
              }
            }
            IRON.destroyTerrain(obj.x, obj.z);
            if (typeof IRON.addLog === 'function') {
              IRON.addLog('Bombardment hits (' + obj.x + ',' + obj.z + ')!', 'warning');
            }
            objectives.splice(i, 1);
          }
          break;
        }
      }
    }
  };

  IRON.advanceObjectives = function () {
    // Increment turnsActive on all objectives
    for (var i = 0; i < IRON.state.objectives.length; i++) {
      IRON.state.objectives[i].turnsActive++;
    }

    // Spawn new objectives at interval
    if (IRON.state.turn % IRON.OBJECTIVE_INTERVAL === 0) {
      IRON.spawnObjective();
    }
  };

  function _checkBountyKill(deadUnit) {
    var objectives = IRON.state.objectives;
    for (var i = objectives.length - 1; i >= 0; i--) {
      if (objectives[i].type === 'bounty' && objectives[i].targetUnitId === deadUnit.id) {
        var rewardTeam = deadUnit.team === 'blue' ? 'red' : 'blue';
        IRON.state[rewardTeam].credits += objectives[i].reward;
        if (typeof IRON.addLog === 'function') {
          IRON.addLog('Bounty collected by ' + rewardTeam + '! +' + objectives[i].reward + ' credits', 'info');
        }
        objectives.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------
  //  20. COMMANDER STRATEGIC ABILITIES
  // ---------------------------------------------------------------
  IRON.useCommanderAbility = function (team, abilityId, targetX, targetZ) {
    var ts = IRON.state[team];
    var ca = ts.commanderAbilities;

    if (!ca[abilityId] || ca[abilityId].used) {
      if (typeof IRON.addLog === 'function') IRON.addLog('Ability already used!', 'warning');
      return false;
    }

    var grid = IRON.state.grid;
    var W = IRON.GRID_W, H = IRON.GRID_H;

    switch (abilityId) {
      case 'airstrike': {
        // Costs 200 credits
        if (ts.credits < 200) {
          if (typeof IRON.addLog === 'function') IRON.addLog('Not enough credits for airstrike!', 'warning');
          return false;
        }
        ts.credits -= 200;

        // Deal 80 damage to all units in 3-radius of target
        var asRadius = 3;
        for (var asx = -asRadius; asx <= asRadius; asx++) {
          for (var asz = -asRadius; asz <= asRadius; asz++) {
            if (Math.abs(asx) + Math.abs(asz) > asRadius) continue;
            var ax = targetX + asx;
            var az = targetZ + asz;
            if (ax < 0 || ax >= W || az < 0 || az >= H) continue;
            var at = grid[ax][az];

            IRON.destroyTerrain(ax, az);

            if (at.unit && !at.unit.isDead) {
              at.unit.hp -= 80;
              if (typeof IRON.flashUnit === 'function') IRON.flashUnit(at.unit);
              if (typeof IRON.spawnDamageEffect === 'function') IRON.spawnDamageEffect(at.unit, 80);
              if (typeof IRON.updateHealthBar === 'function') IRON.updateHealthBar(at.unit);

              if (at.unit.hp <= 0) {
                at.unit.hp = 0;
                at.unit.isDead = true;
                grid[at.unit.x][at.unit.z].unit = null;
                if (typeof IRON.spawnExplosionEffect === 'function') IRON.spawnExplosionEffect(at.unit.x, at.unit.z);
                if (typeof IRON.destroyUnitAnim === 'function') IRON.destroyUnitAnim(at.unit);
                _checkBountyKill(at.unit);
              }
            }
          }
        }
        ca.airstrike.used = true;
        if (typeof IRON.addLog === 'function') IRON.addLog('COMMANDER AIRSTRIKE deployed!', 'combat');
        if (typeof IRON.showNotification === 'function') IRON.showNotification('AIRSTRIKE!', 2000);
        break;
      }

      case 'emergencyDrop': {
        // Instantly spawn one unit from build queue at HQ
        if (ts.buildQueue.length === 0) {
          if (typeof IRON.addLog === 'function') IRON.addLog('Build queue is empty!', 'warning');
          return false;
        }
        var item = ts.buildQueue.shift();
        var spawnTile = IRON.findSpawnTile(team);
        if (spawnTile) {
          IRON.createUnit(item.unitType, team, spawnTile.x, spawnTile.z);
          if (typeof IRON.addLog === 'function') IRON.addLog('Emergency drop: ' + item.unitType + ' deployed!', 'combat');
        }
        ca.emergencyDrop.used = true;
        break;
      }

      case 'ironWill': {
        // All units ignore terrain movement penalties for 2 turns
        ts.ironWillTurns = 2;
        ca.ironWill.used = true;
        if (typeof IRON.addLog === 'function') IRON.addLog('IRON WILL activated! Terrain penalties ignored for 2 turns.', 'combat');
        if (typeof IRON.showNotification === 'function') IRON.showNotification('IRON WILL!', 2000);
        break;
      }

      default:
        return false;
    }

    return true;
  };

  // -----------------------------------------------------------------
  //  INIT FUNCTIONS (called from main.js loading sequence)
  // -----------------------------------------------------------------

  /** Initialize weather system — pick a random starting weather. */
  IRON.initWeather = function () {
    if (!IRON.WEATHER_TYPES || IRON.WEATHER_TYPES.length === 0) return;
    var idx = Math.floor(Math.random() * IRON.WEATHER_TYPES.length);
    IRON.state.weather = {
      current: IRON.WEATHER_TYPES[idx],
      turnsUntilChange: IRON.WEATHER_CHANGE_INTERVAL || 4,
    };
  };

  /** Initialize fog of war — set up explored maps for both teams. */
  IRON.initFogOfWar = function () {
    if (!IRON.state.explored) IRON.state.explored = {};
    IRON.state.explored.blue = {};
    IRON.state.explored.red = {};
    // Reveal tiles around each team's starting units
    var units = IRON.state.units || [];
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      var vision = (u.typeData && u.typeData.vision) || 3;
      var team = u.team;
      if (!IRON.state.explored[team]) IRON.state.explored[team] = {};
      for (var dx = -vision; dx <= vision; dx++) {
        for (var dz = -vision; dz <= vision; dz++) {
          if (dx * dx + dz * dz > vision * vision) continue;
          var tx = u.x + dx;
          var tz = u.z + dz;
          if (tx >= 0 && tx < IRON.GRID_W && tz >= 0 && tz < IRON.GRID_H) {
            IRON.state.explored[team][tx + ',' + tz] = true;
          }
        }
      }
    }
  };

  /** Apply difficulty modifiers to AI team. */
  IRON.applyDifficultyModifiers = function (difficulty) {
    var mods = IRON.DIFFICULTY && IRON.DIFFICULTY[difficulty];
    if (!mods) return;
    var red = IRON.state.red;
    // Apply income bonus for AI
    red.income = Math.round(red.income * (mods.aiIncomeMult || 1));
  };

})();
