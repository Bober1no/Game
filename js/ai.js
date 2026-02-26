// ===================================================================
//  IRONFRONT v4.0 — AI OPPONENT (Red Team)
// ===================================================================
// Smart, tactical AI that makes intelligent decisions about movement,
// combat, research, production, abilities, weather, veterancy,
// objectives, supply lines, elevation, and unit merging.
// ===================================================================

(function () {
  'use strict';

  // -----------------------------------------------------------------
  //  UTILITY HELPERS
  // -----------------------------------------------------------------

  /** Manhattan distance between two grid positions. */
  function dist(ax, az, bx, bz) {
    return Math.abs(ax - bx) + Math.abs(az - bz);
  }

  /** Clamp value between min and max. */
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /** Random integer in [lo, hi]. */
  function randInt(lo, hi) {
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }

  /** Return terrain data for a tile (or null). */
  function terrainAt(grid, x, z) {
    if (!grid || !grid[x] || !grid[x][z]) return null;
    var t = grid[x][z];
    return t.terrain || IRON.TERRAIN.PLAINS;
  }

  /** Get defense bonus of terrain at (x,z). */
  function terrainDef(grid, x, z) {
    var t = terrainAt(grid, x, z);
    return t ? t.defBonus : 0;
  }

  /** Get elevation of terrain at (x,z). */
  function terrainElevation(grid, x, z) {
    var t = terrainAt(grid, x, z);
    return t ? (t.elevation || 0) : 0;
  }

  /** Check if terrain at (x,z) is a minefield. */
  function isMinefield(grid, x, z) {
    var t = terrainAt(grid, x, z);
    return t === IRON.TERRAIN.MINEFIELD;
  }

  /** Check if terrain at (x,z) is sandbags. */
  function isSandbags(grid, x, z) {
    var t = terrainAt(grid, x, z);
    return t === IRON.TERRAIN.SANDBAGS;
  }

  /** Get all living units for a team. */
  function teamUnits(team) {
    return IRON.state.units.filter(function (u) { return u.team === team && !u.isDead; });
  }

  /** Unit value ranking for target priority. */
  function unitValue(unit) {
    var typeKey = unit.type || unit.unitType;
    if (typeKey === 'COMMANDER') return 100;
    if (typeKey === 'HEAVY_MECH') return 90;
    if (typeKey === 'MISSILE_LAUNCHER') return 85;
    if (typeKey === 'ARTILLERY') return 80;
    if (typeKey === 'SNIPER') return 75;
    if (typeKey === 'TANK') return 70;
    if (typeKey === 'HELICOPTER') return 65;
    if (typeKey === 'MEDIC') return 60;
    if (typeKey === 'ENGINEER') return 55;
    if (typeKey === 'INFANTRY') return 40;
    if (typeKey === 'SCOUT') return 30;
    if (typeKey === 'DRONE') return 20;
    return 35;
  }

  /** Get the UNIT_TYPES stats object for a unit. */
  function unitStats(unit) {
    var key = unit.type || unit.unitType;
    return IRON.UNIT_TYPES[key] || {};
  }

  /** True if unit type key represents a ranged fire-first unit. */
  function isRangedFireFirst(unit) {
    var key = unit.type || unit.unitType;
    return key === 'ARTILLERY' || key === 'SNIPER' || key === 'MISSILE_LAUNCHER';
  }

  /** True if unit is a medic. */
  function isMedic(unit) {
    var key = unit.type || unit.unitType;
    return key === 'MEDIC';
  }

  /** True if unit is a flying unit. */
  function isFlying(unit) {
    var s = unitStats(unit);
    return !!s.flying;
  }

  /** Unit display name. */
  function uName(unit) {
    var s = unitStats(unit);
    return s.name || unit.type || unit.unitType || 'Unit';
  }

  /** True if an enemy unit is within range of a given position. */
  function enemyNearby(x, z, enemies, range) {
    return enemies.some(function (e) { return dist(x, z, e.x, e.z) <= range; });
  }

  /** Get the current weather object (or null/clear). */
  function currentWeather() {
    if (!IRON.state || !IRON.state.weather) return null;
    return IRON.state.weather.current || null;
  }

  /** Get difficulty settings for current difficulty. */
  function diffSettings() {
    var diff = IRON.SETTINGS.difficulty || 'normal';
    return IRON.DIFFICULTY[diff] || IRON.DIFFICULTY.normal;
  }

  /** Get the veterancy rank object for a unit. */
  function getVetRank(unit) {
    if (!IRON.VETERANCY || !IRON.VETERANCY.ranks) return null;
    var xp = unit.xp || 0;
    var ranks = IRON.VETERANCY.ranks;
    var rank = ranks[0];
    for (var i = ranks.length - 1; i >= 0; i--) {
      if (xp >= ranks[i].xp) {
        rank = ranks[i];
        break;
      }
    }
    return rank;
  }

  /** Get veterancy rank index (0=recruit, 1=veteran, 2=elite, 3=legend). */
  function getVetRankIndex(unit) {
    if (!IRON.VETERANCY || !IRON.VETERANCY.ranks) return 0;
    var xp = unit.xp || 0;
    var ranks = IRON.VETERANCY.ranks;
    for (var i = ranks.length - 1; i >= 0; i--) {
      if (xp >= ranks[i].xp) return i;
    }
    return 0;
  }

  /** Estimate effective ATK of a unit including veterancy bonuses. */
  function effectiveAtk(unit) {
    var s = unitStats(unit);
    var atk = s.atk || 0;
    var rank = getVetRank(unit);
    if (rank && rank.atkBonus) atk *= (1 + rank.atkBonus);
    return atk;
  }

  /** Estimate effective DEF of a unit including veterancy bonuses. */
  function effectiveDef(unit) {
    var s = unitStats(unit);
    var def = s.def || 0;
    var rank = getVetRank(unit);
    if (rank && rank.defBonus) def *= (1 + rank.defBonus);
    return def;
  }

  /** Count enemies within a radius of a position. */
  function countEnemiesInRadius(x, z, radius, enemies) {
    var count = 0;
    for (var i = 0; i < enemies.length; i++) {
      if (dist(x, z, enemies[i].x, enemies[i].z) <= radius) count++;
    }
    return count;
  }

  /** Check if unit is within supply range of HQ or a team depot. */
  function isInSupply(unit, red) {
    var supplyRange = IRON.SUPPLY_RANGE || 10;
    // Check HQ
    if (red.hqTile && dist(unit.x, unit.z, red.hqTile.x, red.hqTile.z) <= supplyRange) return true;
    // Check depots
    var depots = red.depots || [];
    for (var i = 0; i < depots.length; i++) {
      if (dist(unit.x, unit.z, depots[i].x, depots[i].z) <= supplyRange) return true;
    }
    return false;
  }

  /** Calculate minimum supply distance for a position. */
  function supplyDistance(x, z, red) {
    var minDist = 999;
    if (red.hqTile) {
      minDist = Math.min(minDist, dist(x, z, red.hqTile.x, red.hqTile.z));
    }
    var depots = red.depots || [];
    for (var i = 0; i < depots.length; i++) {
      minDist = Math.min(minDist, dist(x, z, depots[i].x, depots[i].z));
    }
    return minDist;
  }

  /** Add random noise to a score (for easy difficulty). */
  function addNoise(score, amount) {
    return score + (Math.random() - 0.5) * amount;
  }

  // -----------------------------------------------------------------
  //  PHASE 1: RESEARCH DECISION
  // -----------------------------------------------------------------

  function aiResearchPhase() {
    var red = IRON.state.red;
    if (red.researching) return; // Already researching something

    var creditReserve = 200;
    var availableCredits = red.credits - creditReserve;
    if (availableCredits <= 0) return;

    var availableRP = (red.rp !== undefined) ? red.rp : Infinity;

    var completed = red.research || {};
    var enemies = teamUnits('blue');
    var allies = teamUnits('red');

    // Determine game pressure
    var losingUnits = allies.length < enemies.length;
    var losingBadly = allies.length < enemies.length * 0.6;
    var enemyStrongDef = enemies.some(function (e) {
      var s = unitStats(e);
      return s.def >= 30;
    });
    var needMapControl = (red.depots || []).length < 2;

    // Count enemy infantry for incendiary priority
    var enemyInfantry = enemies.filter(function (e) {
      var k = e.type || e.unitType;
      return k === 'INFANTRY' || k === 'SCOUT';
    }).length;
    var enemyHasStrongEcon = (IRON.state.blue && IRON.state.blue.depots &&
      IRON.state.blue.depots.length >= 3);

    // Build priority list
    var priorityOrder = [];

    // Tier 1 priorities first
    priorityOrder.push('sharperRounds');
    priorityOrder.push('reinforcedPlating');
    priorityOrder.push('advancedSensors');
    priorityOrder.push('signalIntercept'); // Intel T1 - always useful early

    // Intel branch priorities based on game state
    if (losingBadly) {
      priorityOrder.push('cyberWarfare');     // Sabotage enemy when losing
      priorityOrder.push('emergencyProtocols'); // Last stand defense
    }
    if (enemyHasStrongEcon) {
      priorityOrder.push('economicWarfare');  // Steal their income
    }

    // Incendiary rounds vs infantry-heavy enemies
    if (enemyInfantry >= 3) {
      priorityOrder.push('incendiaryRounds');
    }

    // Rapid deployment when we need more units
    if (losingUnits) {
      priorityOrder.push('rapidDeployment');
    }

    // Tier 2+ based on game state
    if (losingUnits) {
      priorityOrder.push('reactiveArmor', 'energyShields', 'fortressProtocol');
      priorityOrder.push('armorPiercing', 'precisionStrike', 'doomsdayProtocol');
      priorityOrder.push('droneNetwork', 'stealthTech', 'orbitalCommand');
      priorityOrder.push('cyberWarfare', 'economicWarfare', 'neuralHack');
    } else if (enemyStrongDef) {
      priorityOrder.push('armorPiercing', 'precisionStrike', 'doomsdayProtocol');
      priorityOrder.push('reactiveArmor', 'energyShields', 'fortressProtocol');
      priorityOrder.push('droneNetwork', 'stealthTech', 'orbitalCommand');
      priorityOrder.push('cyberWarfare', 'economicWarfare', 'neuralHack');
    } else if (needMapControl) {
      priorityOrder.push('droneNetwork', 'stealthTech', 'orbitalCommand');
      priorityOrder.push('armorPiercing', 'precisionStrike', 'doomsdayProtocol');
      priorityOrder.push('reactiveArmor', 'energyShields', 'fortressProtocol');
      priorityOrder.push('cyberWarfare', 'economicWarfare', 'neuralHack');
    } else {
      // Balanced
      priorityOrder.push('armorPiercing', 'reactiveArmor', 'droneNetwork');
      priorityOrder.push('precisionStrike', 'energyShields', 'stealthTech');
      priorityOrder.push('cyberWarfare', 'incendiaryRounds', 'rapidDeployment');
      priorityOrder.push('doomsdayProtocol', 'fortressProtocol', 'orbitalCommand');
      priorityOrder.push('economicWarfare', 'emergencyProtocols', 'neuralHack');
    }

    // Deduplicate priority list keeping first occurrence
    var seen = {};
    var dedupedOrder = [];
    for (var i = 0; i < priorityOrder.length; i++) {
      if (!seen[priorityOrder[i]]) {
        seen[priorityOrder[i]] = true;
        dedupedOrder.push(priorityOrder[i]);
      }
    }

    for (var j = 0; j < dedupedOrder.length; j++) {
      var resId = dedupedOrder[j];
      if (completed[resId] && completed[resId].completed) continue;
      var info = IRON.RESEARCH_TREE[resId];
      if (!info) continue;
      // Check credit cost
      if (info.cost > availableCredits) continue;
      // Check RP cost (research now costs both credits AND rp)
      if (info.rpCost !== undefined && info.rpCost > availableRP) continue;
      // Check prerequisites
      if (typeof IRON.canResearch === 'function' && !IRON.canResearch('red', resId)) continue;

      IRON.startResearch('red', resId);
      IRON.addLog('Enemy researching ' + info.name, 'ai');
      return;
    }
  }

  // -----------------------------------------------------------------
  //  PHASE 2: PRODUCTION DECISION
  // -----------------------------------------------------------------

  function aiProductionPhase() {
    var red = IRON.state.red;
    var queue = red.buildQueue || [];
    if (queue.length >= 3) return; // Queue full

    var allies = teamUnits('red');
    var enemies = teamUnits('blue');
    var weather = currentWeather();

    // Count current army composition
    var comp = {};
    for (var i = 0; i < allies.length; i++) {
      var key = allies[i].type || allies[i].unitType;
      comp[key] = (comp[key] || 0) + 1;
    }

    // How many frontline units
    var frontline = (comp.INFANTRY || 0) + (comp.TANK || 0) + (comp.HEAVY_MECH || 0);
    var hasArtillery = (comp.ARTILLERY || 0) + (comp.MISSILE_LAUNCHER || 0);
    var scouts = (comp.SCOUT || 0) + (comp.DRONE || 0);

    // Check if enemies are clustered
    var enemyClustered = false;
    if (enemies.length >= 3) {
      var cx = 0, cz = 0;
      for (var ei = 0; ei < enemies.length; ei++) { cx += enemies[ei].x; cz += enemies[ei].z; }
      cx /= enemies.length;
      cz /= enemies.length;
      var avgDist = 0;
      for (var ej = 0; ej < enemies.length; ej++) { avgDist += dist(enemies[ej].x, enemies[ej].z, cx, cz); }
      avgDist /= enemies.length;
      enemyClustered = avgDist < 4;
    }

    var needMapControl = (red.depots || []).length < 2;
    var credits = red.credits;

    // Weather consideration: don't build flying units in storms
    var airDisabled = weather && weather.airDisabled;

    /** Try to build a unit type. Returns true if queued. */
    function tryBuild(typeKey) {
      if ((comp[typeKey] || 0) >= 3) return false;
      // Skip flying units if air is disabled
      var info = IRON.UNIT_TYPES[typeKey];
      if (!info) return false;
      if (airDisabled && info.flying) return false;
      if (info.cost > credits) return false;
      if (typeof IRON.canBuild === 'function' && !IRON.canBuild('red', typeKey)) return false;

      IRON.startBuild('red', typeKey);
      IRON.addLog('Enemy building ' + info.name, 'ai');
      return true;
    }

    // Decision logic
    if (frontline < 2) {
      if (credits >= 300 && (comp.TANK || 0) < 2) {
        if (tryBuild('TANK')) return;
      }
      if (tryBuild('INFANTRY')) return;
    }

    if (hasArtillery === 0 && enemyClustered) {
      if (tryBuild('ARTILLERY')) return;
    }

    if (needMapControl && scouts < 2) {
      if (!airDisabled && tryBuild('DRONE')) return;
      if (tryBuild('SCOUT')) return;
    }

    if (credits > 400) {
      var preferred = [
        'HEAVY_MECH', 'MISSILE_LAUNCHER', 'HELICOPTER', 'TANK',
        'SNIPER', 'ARTILLERY', 'ENGINEER', 'MEDIC', 'INFANTRY', 'SCOUT'
      ];
      for (var pi = 0; pi < preferred.length; pi++) {
        if (tryBuild(preferred[pi])) return;
      }
    }

    // Default: build something useful
    if (frontline < 4 && tryBuild('INFANTRY')) return;
    if (hasArtillery < 2 && tryBuild('ARTILLERY')) return;
    if (tryBuild('TANK')) return;
  }

  // -----------------------------------------------------------------
  //  ABILITY USAGE LOGIC
  // -----------------------------------------------------------------

  /**
   * Attempt to use the unit's special ability if available and smart.
   * Returns true if an ability was used.
   */
  async function tryUseAbility(unit, enemies, allies, grid, red, damageMap) {
    if (typeof IRON.canUseAbility !== 'function') return false;
    if (!IRON.canUseAbility(unit)) return false;

    var typeKey = unit.type || unit.unitType;
    var stats = unitStats(unit);
    var abilityDef = IRON.ABILITIES[typeKey];
    if (!abilityDef) return false;

    var diff = diffSettings();
    var isHard = (IRON.SETTINGS.difficulty === 'hard');
    var name = uName(unit);

    switch (typeKey) {

      case 'INFANTRY': {
        // Entrench: use when on high-def terrain and enemies nearby but can't reach them
        var tDef = terrainDef(grid, unit.x, unit.z);
        var nearEnemyCount = countEnemiesInRadius(unit.x, unit.z, 3, enemies);
        var canReachEnemy = enemies.some(function (e) {
          return dist(unit.x, unit.z, e.x, e.z) <= (stats.atkRange || 1);
        });
        if (tDef >= 2 && nearEnemyCount > 0 && !canReachEnemy) {
          if (typeof IRON.useAbility === 'function') {
            await IRON.useAbility(unit, unit.x, unit.z);
            IRON.addLog('Enemy ' + name + ' entrenches!', 'ai');
            return true;
          }
        }
        break;
      }

      case 'TANK': {
        // Overrun: charge through blocking enemies
        var adjacentEnemy = enemies.find(function (e) {
          return dist(unit.x, unit.z, e.x, e.z) === 1;
        });
        if (adjacentEnemy && typeof IRON.useAbility === 'function') {
          await IRON.useAbility(unit, adjacentEnemy.x, adjacentEnemy.z);
          IRON.addLog('Enemy ' + name + ' overruns ' + uName(adjacentEnemy) + '!', 'ai');
          return true;
        }
        break;
      }

      case 'ARTILLERY': {
        // Barrage: use when 3+ enemies are clustered
        var bestBarragePos = null;
        var bestBarrageCount = isHard ? 2 : 3; // Hard mode triggers at 2+
        for (var ei = 0; ei < enemies.length; ei++) {
          var e = enemies[ei];
          var count = countEnemiesInRadius(e.x, e.z, abilityDef.radius || 1, enemies);
          if (count >= bestBarrageCount) {
            bestBarrageCount = count;
            bestBarragePos = { x: e.x, z: e.z };
          }
        }
        if (bestBarragePos && typeof IRON.useAbility === 'function') {
          await IRON.useAbility(unit, bestBarragePos.x, bestBarragePos.z);
          IRON.addLog('Enemy ' + name + ' barrages area!', 'ai');
          return true;
        }
        break;
      }

      case 'SCOUT': {
        // Smoke Screen: cover advancing allies near enemies
        var alliesNearEnemies = allies.filter(function (a) {
          if (a === unit) return false;
          return enemies.some(function (e) { return dist(a.x, a.z, e.x, e.z) <= 3; });
        });
        if (alliesNearEnemies.length >= 1 && typeof IRON.useAbility === 'function') {
          // Place smoke on the ally closest to enemies
          var target = alliesNearEnemies[0];
          await IRON.useAbility(unit, target.x, target.z);
          IRON.addLog('Enemy ' + name + ' deploys smoke screen!', 'ai');
          return true;
        }
        break;
      }

      case 'COMMANDER': {
        // Rally: reset one adjacent ally that has already acted
        var bestRallyTarget = null;
        var bestRallyValue = 0;
        for (var ai = 0; ai < allies.length; ai++) {
          var a = allies[ai];
          if (a === unit) continue;
          if (!a.hasMoved && !a.hasAttacked) continue;
          if (dist(unit.x, unit.z, a.x, a.z) > 1) continue;
          var val = unitValue(a);
          if (val > bestRallyValue) {
            bestRallyValue = val;
            bestRallyTarget = a;
          }
        }
        if (bestRallyTarget && typeof IRON.useAbility === 'function') {
          await IRON.useAbility(unit, bestRallyTarget.x, bestRallyTarget.z);
          IRON.addLog('Enemy ' + name + ' rallies ' + uName(bestRallyTarget) + '!', 'ai');
          return true;
        }
        break;
      }

      case 'SNIPER': {
        // Mark Target: always mark the highest-DEF enemy before attacking
        var bestMarkTarget = null;
        var bestDef = -1;
        for (var mi = 0; mi < enemies.length; mi++) {
          var me = enemies[mi];
          var eDef = effectiveDef(me);
          if (eDef > bestDef && dist(unit.x, unit.z, me.x, me.z) <= (stats.atkRange || 6)) {
            bestDef = eDef;
            bestMarkTarget = me;
          }
        }
        if (bestMarkTarget && bestDef >= 15 && typeof IRON.useAbility === 'function') {
          await IRON.useAbility(unit, bestMarkTarget.x, bestMarkTarget.z);
          IRON.addLog('Enemy ' + name + ' marks ' + uName(bestMarkTarget) + '!', 'ai');
          return true;
        }
        break;
      }

      case 'MEDIC': {
        // Field Surgery: use when an ally is below 30% HP
        var criticalAlly = null;
        var worstPct = 0.30;
        for (var hi = 0; hi < allies.length; hi++) {
          var ha = allies[hi];
          if (ha === unit || ha.hp <= 0) continue;
          if (dist(unit.x, unit.z, ha.x, ha.z) > 1) continue;
          var haStats = unitStats(ha);
          var pct = ha.hp / haStats.hp;
          if (pct < worstPct) {
            worstPct = pct;
            criticalAlly = ha;
          }
        }
        if (criticalAlly && typeof IRON.useAbility === 'function') {
          await IRON.useAbility(unit, criticalAlly.x, criticalAlly.z);
          IRON.addLog('Enemy ' + name + ' performs field surgery on ' + uName(criticalAlly) + '!', 'ai');
          return true;
        }
        break;
      }

      case 'ENGINEER': {
        // Deploy Turret: build near frontline
        var avgEnemyX = 0, avgEnemyZ = 0;
        if (enemies.length > 0) {
          for (var exi = 0; exi < enemies.length; exi++) { avgEnemyX += enemies[exi].x; avgEnemyZ += enemies[exi].z; }
          avgEnemyX /= enemies.length;
          avgEnemyZ /= enemies.length;
        }
        // Place near unit's current position toward enemy frontline
        var turretPos = { x: unit.x, z: unit.z };
        // Choose adjacent tile closest to enemy center
        var bestTurretDist = 999;
        var dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        for (var di = 0; di < dirs.length; di++) {
          var tx = unit.x + dirs[di][0];
          var tz = unit.z + dirs[di][1];
          if (!grid || !grid[tx] || !grid[tx][tz]) continue;
          var tile = grid[tx][tz];
          if (tile.unit) continue;
          var tTerrain = terrainAt(grid, tx, tz);
          if (!tTerrain || !tTerrain.passable) continue;
          var d = dist(tx, tz, avgEnemyX, avgEnemyZ);
          if (d < bestTurretDist) {
            bestTurretDist = d;
            turretPos = { x: tx, z: tz };
          }
        }
        if (typeof IRON.useAbility === 'function') {
          await IRON.useAbility(unit, turretPos.x, turretPos.z);
          IRON.addLog('Enemy ' + name + ' deploys turret!', 'ai');
          return true;
        }
        break;
      }

      case 'HELICOPTER': {
        // Airstrike: use when 3+ enemies in radius
        var bestStrikePos = null;
        var bestStrikeCount = isHard ? 2 : 3;
        var strikeRadius = abilityDef.radius || 2;
        for (var si = 0; si < enemies.length; si++) {
          var se = enemies[si];
          var sc = countEnemiesInRadius(se.x, se.z, strikeRadius, enemies);
          if (sc >= bestStrikeCount) {
            bestStrikeCount = sc;
            bestStrikePos = { x: se.x, z: se.z };
          }
        }
        if (bestStrikePos && typeof IRON.useAbility === 'function') {
          await IRON.useAbility(unit, bestStrikePos.x, bestStrikePos.z);
          IRON.addLog('Enemy ' + name + ' calls airstrike!', 'ai');
          return true;
        }
        break;
      }

      case 'MISSILE_LAUNCHER': {
        // Cluster Bomb: use when 2+ enemies in radius
        var bestClusterPos = null;
        var bestClusterCount = 2;
        var clusterRadius = abilityDef.radius || 2;
        for (var ci = 0; ci < enemies.length; ci++) {
          var ce = enemies[ci];
          var cc = countEnemiesInRadius(ce.x, ce.z, clusterRadius, enemies);
          if (cc >= bestClusterCount) {
            bestClusterCount = cc;
            bestClusterPos = { x: ce.x, z: ce.z };
          }
        }
        if (bestClusterPos && typeof IRON.useAbility === 'function') {
          await IRON.useAbility(unit, bestClusterPos.x, bestClusterPos.z);
          IRON.addLog('Enemy ' + name + ' launches cluster bombs!', 'ai');
          return true;
        }
        break;
      }

      case 'HEAVY_MECH': {
        // Siege Mode: use when adjacent to enemies and low HP
        var hpPct = unit.hp / stats.hp;
        var adjacentEnemyCount = countEnemiesInRadius(unit.x, unit.z, 2, enemies);
        if (adjacentEnemyCount > 0 && hpPct < 0.6 && typeof IRON.useAbility === 'function') {
          await IRON.useAbility(unit, unit.x, unit.z);
          IRON.addLog('Enemy ' + name + ' enters siege mode!', 'ai');
          return true;
        }
        break;
      }

      case 'DRONE': {
        // EMP Pulse: disable the highest-value adjacent enemy
        var bestEMPTarget = null;
        var bestEMPValue = 0;
        var empRange = abilityDef.range || 1;
        for (var pi = 0; pi < enemies.length; pi++) {
          var pe = enemies[pi];
          if (dist(unit.x, unit.z, pe.x, pe.z) <= empRange) {
            var pv = unitValue(pe);
            if (pv > bestEMPValue) {
              bestEMPValue = pv;
              bestEMPTarget = pe;
            }
          }
        }
        if (bestEMPTarget && typeof IRON.useAbility === 'function') {
          await IRON.useAbility(unit, bestEMPTarget.x, bestEMPTarget.z);
          IRON.addLog('Enemy ' + name + ' EMPs ' + uName(bestEMPTarget) + '!', 'ai');
          return true;
        }
        break;
      }
    }

    return false;
  }

  // -----------------------------------------------------------------
  //  COMMANDER ABILITIES (team-level strategic abilities)
  // -----------------------------------------------------------------

  async function tryCommanderAbilities(red, enemies, allies) {
    if (!red.commanderAbilities) return;
    var abilities = red.commanderAbilities;

    // Airstrike: when 4+ enemies clustered within 3 tiles
    if (abilities.airstrike && !abilities.airstrike.used) {
      for (var i = 0; i < enemies.length; i++) {
        var count = countEnemiesInRadius(enemies[i].x, enemies[i].z, 3, enemies);
        if (count >= 4) {
          if (typeof IRON.useCommanderAbility === 'function') {
            await IRON.useCommanderAbility('red', 'airstrike', enemies[i].x, enemies[i].z);
            IRON.addLog('Enemy calls in a commander airstrike!', 'ai');
          }
          return;
        }
      }
    }

    // Emergency Drop: when losing badly and build queue has items
    if (abilities.emergencyDrop && !abilities.emergencyDrop.used) {
      var losingBadly = allies.length < enemies.length * 0.5;
      if (losingBadly && red.buildQueue && red.buildQueue.length > 0) {
        if (typeof IRON.useCommanderAbility === 'function') {
          await IRON.useCommanderAbility('red', 'emergencyDrop');
          IRON.addLog('Enemy uses emergency drop!', 'ai');
        }
        return;
      }
    }

    // Iron Will: when pushing across difficult terrain
    if (abilities.ironWill && !abilities.ironWill.used) {
      var unitsOnHardTerrain = allies.filter(function (a) {
        var t = terrainAt(IRON.state.grid, a.x, a.z);
        return t && t.moveCost >= 2;
      });
      if (unitsOnHardTerrain.length >= 3) {
        if (typeof IRON.useCommanderAbility === 'function') {
          await IRON.useCommanderAbility('red', 'ironWill');
          IRON.addLog('Enemy invokes Iron Will!', 'ai');
        }
        return;
      }
    }
  }

  // -----------------------------------------------------------------
  //  OBJECTIVE AWARENESS
  // -----------------------------------------------------------------

  /**
   * Returns objective-based move scoring adjustments.
   * Also returns a set of units that should prioritize objectives.
   */
  function getObjectiveTargets(allies, enemies) {
    var targets = []; // { unitFilter, x, z, priority }
    if (!IRON.state.objectives || !IRON.state.objectives.length) return targets;

    var objectives = IRON.state.objectives;
    for (var i = 0; i < objectives.length; i++) {
      var obj = objectives[i];
      if (obj.completed || obj.expired) continue;

      switch (obj.type) {
        case 'supply_drop':
          targets.push({
            x: obj.x, z: obj.z, priority: 50,
            unitFilter: function (u) {
              var k = u.type || u.unitType;
              return k === 'SCOUT' || k === 'DRONE';
            }
          });
          break;
        case 'hold_zone':
          targets.push({
            x: obj.x, z: obj.z, priority: 40,
            unitFilter: function () { return true; }
          });
          break;
        case 'bounty':
          if (obj.targetUnit) {
            targets.push({
              x: obj.targetUnit.x, z: obj.targetUnit.z, priority: 60,
              unitFilter: function () { return true; },
              isKill: true, target: obj.targetUnit
            });
          }
          break;
        case 'evac_zone':
          targets.push({
            x: obj.x, z: obj.z, priority: -100, // negative = avoid
            unitFilter: function () { return true; },
            isEvac: true, radius: obj.radius || 3
          });
          break;
      }
    }
    return targets;
  }

  // -----------------------------------------------------------------
  //  UNIT MERGE CONSIDERATION
  // -----------------------------------------------------------------

  async function tryMergeUnit(unit, allies, grid) {
    if (typeof IRON.mergeUnits !== 'function') return false;

    var stats = unitStats(unit);
    var hpPct = unit.hp / stats.hp;
    var threshold = IRON.MERGE_HP_THRESHOLD || 0.50;
    if (hpPct >= threshold) return false;

    var typeKey = unit.type || unit.unitType;

    // Find adjacent same-type ally also below threshold
    for (var i = 0; i < allies.length; i++) {
      var a = allies[i];
      if (a === unit || a.hp <= 0) continue;
      var aKey = a.type || a.unitType;
      if (aKey !== typeKey) continue;
      var aStats = unitStats(a);
      var aPct = a.hp / aStats.hp;
      if (aPct >= threshold) continue;
      if (dist(unit.x, unit.z, a.x, a.z) !== 1) continue;

      // Merge them
      await IRON.mergeUnits(unit, a);
      IRON.addLog('Enemy merges two ' + uName(unit) + ' units!', 'ai');
      return true;
    }
    return false;
  }

  // -----------------------------------------------------------------
  //  PHASE 3: UNIT ACTIONS — SCORING
  // -----------------------------------------------------------------

  /** Score an attack target. Higher = better target. */
  function scoreTarget(attacker, target, damageMap) {
    var dmg = (typeof IRON.calculateDamage === 'function')
      ? IRON.calculateDamage(attacker, target) : unitStats(attacker).atk;
    var tStats = unitStats(target);
    var canKill = dmg >= target.hp;
    var alreadyDamaged = target.hp < tStats.hp;
    var val = unitValue(target);

    var score = 0;
    if (canKill) score += 500 + val; // Kill priority
    if (alreadyDamaged) score += 100;  // Focus fire bonus
    score += val;                      // Value targeting
    score += dmg;                      // Raw damage

    // Focus fire bonus: if already attacked this turn
    if (damageMap && damageMap.has(target)) {
      score += 150; // Strong focus fire incentive
    }

    // Veterancy consideration: penalize attacking high-vet units unless we can kill them
    var vetRank = getVetRankIndex(target);
    if (vetRank >= 2 && !canKill) {
      score -= vetRank * 15; // Elite/Legend units are tougher, prefer softer targets
    }

    // Elevation advantage: bonus if attacker is higher
    var grid = IRON.state.grid;
    if (grid) {
      var attackerElev = terrainElevation(grid, attacker.x, attacker.z);
      var targetElev = terrainElevation(grid, target.x, target.z);
      if (attackerElev > targetElev) {
        score += 20; // We have elevation advantage
      }
    }

    // Weather ATK modifier awareness
    var weather = currentWeather();
    if (weather && weather.atkMod) {
      // If weather reduces attack, lower confidence in kills
      if (weather.atkMod < 0 && !canKill) {
        score -= 10;
      }
    }

    // Difficulty noise (easy mode: add random noise to make worse decisions)
    if (IRON.SETTINGS.difficulty === 'easy') {
      score = addNoise(score, 40);
    }

    return score;
  }

  /** Score a potential move tile for a unit. */
  function scoreTile(unit, tx, tz, enemies, allies, grid, red) {
    var score = 0;
    var stats = unitStats(unit);
    var typeKey = unit.type || unit.unitType;
    var hpPct = unit.hp / stats.hp;
    var weather = currentWeather();

    // --- Distance to nearest enemy (closer = better, for attackers) ---
    var nearestEnemyDist = 999;
    for (var i = 0; i < enemies.length; i++) {
      var d = dist(tx, tz, enemies[i].x, enemies[i].z);
      if (d < nearestEnemyDist) nearestEnemyDist = d;
    }
    var atkRange = stats.atkRange || 1;

    // For ranged units, prefer being at optimal range
    if (atkRange >= 3) {
      var optimalDist = atkRange;
      var distFromOptimal = Math.abs(nearestEnemyDist - optimalDist);
      score -= distFromOptimal * 3;
    } else {
      // Melee/short range: closer is better
      score -= nearestEnemyDist * 3;
    }

    // --- Terrain defense bonus ---
    var tDef = terrainDef(grid, tx, tz);
    score += tDef * 5;

    // --- MINEFIELD avoidance ---
    if (isMinefield(grid, tx, tz)) {
      score -= 200; // Strongly avoid minefields
    }

    // --- SANDBAGS bonus ---
    if (isSandbags(grid, tx, tz)) {
      score += 25; // Excellent defensive position
    }

    // --- Elevation scoring ---
    var tileElev = terrainElevation(grid, tx, tz);
    // Bonus for higher elevation relative to enemy positions
    for (var ei = 0; ei < enemies.length; ei++) {
      var enemyElev = terrainElevation(grid, enemies[ei].x, enemies[ei].z);
      if (tileElev > enemyElev) {
        score += 8; // Elevation advantage for attacks
      }
    }

    // --- Can attack from this tile ---
    for (var j = 0; j < enemies.length; j++) {
      var d2 = dist(tx, tz, enemies[j].x, enemies[j].z);
      if (d2 <= atkRange && d2 >= 1) {
        score += 20;
        var dmg = (typeof IRON.calculateDamage === 'function')
          ? IRON.calculateDamage(unit, enemies[j]) : stats.atk;
        if (dmg >= enemies[j].hp) {
          score += 50; // Can get a kill from here
        }
        break;
      }
    }

    // --- Avoid enemy artillery range ---
    for (var k = 0; k < enemies.length; k++) {
      var es = unitStats(enemies[k]);
      var ek = enemies[k].type || enemies[k].unitType;
      if (ek === 'ARTILLERY' || ek === 'SNIPER' || ek === 'MISSILE_LAUNCHER') {
        var d3 = dist(tx, tz, enemies[k].x, enemies[k].z);
        if (d3 <= (es.atkRange || 1)) {
          score -= 10;
        }
      }
    }

    // --- Clustering penalty (don't stack on allies) ---
    for (var l = 0; l < allies.length; l++) {
      if (allies[l] === unit) continue;
      if (dist(tx, tz, allies[l].x, allies[l].z) <= 1) {
        score -= 3;
      }
    }

    // --- Depot capture bonus ---
    var tile = grid && grid[tx] && grid[tx][tz];
    if (tile) {
      var isDepot = tile.terrain === IRON.TERRAIN.DEPOT;
      if (isDepot) {
        var redDepots = red.depots || [];
        var ownsThis = redDepots.some(function (dep) { return dep.x === tx && dep.z === tz; });
        if (!ownsThis) {
          score += 20; // Increased depot capture priority
        }
      }
    }

    // --- Protect HQ (if enemies near) ---
    var hq = red.hqTile;
    if (hq) {
      var enemiesNearHQ = enemies.filter(function (e) { return dist(e.x, e.z, hq.x, hq.z) <= 5; });
      if (enemiesNearHQ.length > 0) {
        var dToHQ = dist(tx, tz, hq.x, hq.z);
        if (dToHQ <= 4) {
          score += 10;
        }
      }
    }

    // --- Supply line awareness ---
    var mode = IRON.GAME_MODES[IRON.SETTINGS.gameMode];
    if (mode && mode.supply) {
      var sDist = supplyDistance(tx, tz, red);
      var supplyRange = IRON.SUPPLY_RANGE || 10;
      if (sDist > supplyRange) {
        score -= (sDist - supplyRange) * 5; // Penalize going out of supply
      } else if (sDist > supplyRange * 0.7) {
        score -= 3; // Slight penalty for being near supply limit
      }
    }

    // --- Weather-based caution ---
    if (weather) {
      // In foggy weather, be more cautious
      if (weather.visionMod && weather.visionMod <= -2) {
        // Increase retreat scoring, prefer defensive positions
        score += tDef * 3;
        if (nearestEnemyDist <= 2) score -= 5;
      }
    }

    // --- Retreat logic (low HP) ---
    var retreatThreshold = 0.3;
    // Protect own veteran units: retreat earlier
    var vetRank = getVetRankIndex(unit);
    if (vetRank >= 1) retreatThreshold = 0.4;
    if (vetRank >= 2) retreatThreshold = 0.5;

    if (hpPct < retreatThreshold) {
      // Prefer tiles further from enemies and with better defense
      score += nearestEnemyDist * 8;
      score += tDef * 10;
      // Move toward own HQ
      if (hq) {
        var dToHQ2 = dist(tx, tz, hq.x, hq.z);
        score -= dToHQ2 * 2;
      }
      // Foggy weather: increase retreat desire
      if (weather && weather.visionMod && weather.visionMod <= -2) {
        score += nearestEnemyDist * 3;
      }
    }

    // --- Commander protection: keep behind frontline ---
    if (typeKey === 'COMMANDER') {
      var alliesBetween = 0;
      for (var m = 0; m < allies.length; m++) {
        if (allies[m] === unit) continue;
        for (var n = 0; n < enemies.length; n++) {
          if (dist(allies[m].x, allies[m].z, enemies[n].x, enemies[n].z) < dist(tx, tz, enemies[n].x, enemies[n].z)) {
            alliesBetween++;
            break;
          }
        }
      }
      score += alliesBetween * 5;
      if (nearestEnemyDist <= 2) {
        score -= 20;
      }
    }

    // --- Objective scoring ---
    var objTargets = getObjectiveTargets(allies, enemies);
    for (var oi = 0; oi < objTargets.length; oi++) {
      var obj = objTargets[oi];
      if (obj.isEvac) {
        // Avoid evac zones
        if (dist(tx, tz, obj.x, obj.z) <= (obj.radius || 3)) {
          score += obj.priority; // negative = penalty
        }
      } else if (obj.unitFilter && obj.unitFilter(unit)) {
        // Move toward objective
        var objDist = dist(tx, tz, obj.x, obj.z);
        score -= objDist * (obj.priority / 10);
      }
    }

    // --- Difficulty noise ---
    if (IRON.SETTINGS.difficulty === 'easy') {
      score = addNoise(score, 30);
    }

    return score;
  }

  /** Calculate action priority for a unit. Higher = act first. */
  function actionPriority(unit, enemies, allies, grid) {
    var priority = 0;
    var stats = unitStats(unit);
    var typeKey = unit.type || unit.unitType;
    var hpPct = unit.hp / stats.hp;

    // Can we kill someone this turn from current position?
    if (typeof IRON.getAttackableTiles === 'function') {
      var targets = IRON.getAttackableTiles(unit);
      if (targets && targets.length > 0) {
        for (var i = 0; i < targets.length; i++) {
          if (targets[i].unit) {
            var dmg = (typeof IRON.calculateDamage === 'function')
              ? IRON.calculateDamage(unit, targets[i].unit) : stats.atk;
            if (dmg >= targets[i].unit.hp) {
              priority += 100; // Can kill
            }
          }
        }
        // Ranged units that can attack get high priority
        if (isRangedFireFirst(unit)) {
          priority += 60;
        } else {
          priority += 30;
        }
      }
    }

    // Scouts near depots
    if (typeKey === 'SCOUT' || typeKey === 'DRONE') {
      var tile = grid && grid[unit.x] && grid[unit.x][unit.z];
      if (tile && tile.terrain === IRON.TERRAIN.DEPOT) {
        priority += 50;
      }
    }

    // Low HP units might need to retreat
    if (hpPct < 0.3) {
      priority += 20;
    }

    // Medics should go after combat units
    if (isMedic(unit)) {
      priority -= 10;
    }

    // Commander acts later (after frontline moves, so rally is more useful)
    if (typeKey === 'COMMANDER') {
      priority -= 5;
    }

    // Bounty targets: prioritize units that can reach the bounty
    var objTargets = getObjectiveTargets(allies, enemies);
    for (var oi = 0; oi < objTargets.length; oi++) {
      if (objTargets[oi].isKill && objTargets[oi].target) {
        var bDist = dist(unit.x, unit.z, objTargets[oi].target.x, objTargets[oi].target.z);
        if (bDist <= (stats.atkRange || 1) + (stats.moveRange || 3)) {
          priority += 40; // Can potentially reach bounty target
        }
      }
    }

    return priority;
  }

  // -----------------------------------------------------------------
  //  PHASE 3: PROCESS SINGLE UNIT
  // -----------------------------------------------------------------

  /** Process a single unit's turn. Returns a Promise. */
  async function processUnit(unit, enemies, allies, grid, red, damageMap) {
    if (unit.hp <= 0) return;
    if (unit.hasMoved && unit.hasAttacked) return;

    var stats = unitStats(unit);
    var typeKey = unit.type || unit.unitType;
    var hpPct = unit.hp / stats.hp;
    var name = uName(unit);
    var weather = currentWeather();

    // Skip flying units entirely when air is disabled by weather
    if (isFlying(unit) && weather && weather.airDisabled) {
      unit.hasMoved = true; unit.hasAttacked = true;
      IRON.addLog('Enemy ' + name + ' grounded by weather.', 'ai');
      return;
    }

    var hasMoved = false;
    var hasAttacked = false;

    // --- TRY MERGE (low HP same-type adjacency) ---
    try {
      var merged = await tryMergeUnit(unit, allies, grid);
      if (merged) {
        unit.hasMoved = true; unit.hasAttacked = true;
        return;
      }
    } catch (e) {
      console.warn('[AI] Merge error:', e);
    }

    // --- TRY ABILITY USAGE (before move/attack) ---
    try {
      var usedAbility = await tryUseAbility(unit, enemies, allies, grid, red, damageMap);
      if (usedAbility) {
        // Some abilities may consume the unit's turn, some may not
        // Check if unit can still act
        if (unit.hasMoved && unit.hasAttacked) return;
      }
    } catch (e) {
      console.warn('[AI] Ability error:', e);
    }

    // --- MEDIC LOGIC ---
    if (isMedic(unit)) {
      // Try to heal most damaged adjacent ally
      if (typeof IRON.getHealableTiles === 'function') {
        var healables = IRON.getHealableTiles(unit);
        if (healables && healables.length > 0) {
          var bestTarget = null;
          var worstHpPct = 1;
          for (var h = 0; h < healables.length; h++) {
            if (healables[h].unit && healables[h].unit.team === 'red' && healables[h].unit.hp > 0) {
              var tStats = unitStats(healables[h].unit);
              var pct = healables[h].unit.hp / tStats.hp;
              if (pct < worstHpPct) {
                worstHpPct = pct;
                bestTarget = healables[h].unit;
              }
            }
          }
          if (bestTarget && worstHpPct < 0.95) {
            await IRON.performHeal(unit, bestTarget);
            IRON.addLog('Enemy ' + name + ' heals ' + uName(bestTarget), 'ai');
            hasAttacked = true;
          }
        }
      }

      // If no heal target, move toward most damaged ally
      if (!hasAttacked && typeof IRON.getMovableTiles === 'function') {
        var movable = IRON.getMovableTiles(unit);
        if (movable && movable.length > 0) {
          var bestTile = null;
          var bestScore = -Infinity;
          for (var mi = 0; mi < movable.length; mi++) {
            var m = movable[mi];
            var adjDamagedAlly = false;
            var nearDmg = 999;
            for (var ai = 0; ai < allies.length; ai++) {
              if (allies[ai] === unit || allies[ai].hp <= 0) continue;
              var as = unitStats(allies[ai]);
              var apct = allies[ai].hp / as.hp;
              if (apct < 0.9 && dist(m.x, m.z, allies[ai].x, allies[ai].z) <= 1) {
                adjDamagedAlly = true;
                nearDmg = Math.min(nearDmg, apct);
              }
            }
            var sc = 0;
            if (adjDamagedAlly) sc += 50 + (1 - nearDmg) * 30;
            sc += terrainDef(grid, m.x, m.z) * 3;
            if (isMinefield(grid, m.x, m.z)) sc -= 200;
            for (var eni = 0; eni < enemies.length; eni++) {
              if (dist(m.x, m.z, enemies[eni].x, enemies[eni].z) <= 2) sc -= 10;
            }
            if (sc > bestScore) {
              bestScore = sc;
              bestTile = m;
            }
          }
          if (bestTile && (bestTile.x !== unit.x || bestTile.z !== unit.z)) {
            await IRON.moveUnitAnim(unit, bestTile.x, bestTile.z, grid);
            IRON.addLog('Enemy ' + name + ' moves', 'ai');
            hasMoved = true;
          }
        }
      }

      // Try heal again after moving
      if (!hasAttacked && typeof IRON.getHealableTiles === 'function') {
        var healables2 = IRON.getHealableTiles(unit);
        if (healables2 && healables2.length > 0) {
          var bestTarget2 = null;
          var worstHpPct2 = 1;
          for (var h2 = 0; h2 < healables2.length; h2++) {
            if (healables2[h2].unit && healables2[h2].unit.team === 'red' && healables2[h2].unit.hp > 0) {
              var tStats2 = unitStats(healables2[h2].unit);
              var pct2 = healables2[h2].unit.hp / tStats2.hp;
              if (pct2 < worstHpPct2) {
                worstHpPct2 = pct2;
                bestTarget2 = healables2[h2].unit;
              }
            }
          }
          if (bestTarget2 && worstHpPct2 < 0.95) {
            await IRON.performHeal(unit, bestTarget2);
            IRON.addLog('Enemy ' + name + ' heals ' + uName(bestTarget2), 'ai');
            hasAttacked = true;
          }
        }
      }

      unit.hasMoved = true; unit.hasAttacked = true;
      return;
    }

    // --- ATTACK-FIRST LOGIC (Artillery / Snipers / Missiles) ---
    if (isRangedFireFirst(unit) && !hasAttacked) {
      if (typeof IRON.getAttackableTiles === 'function') {
        var targets = IRON.getAttackableTiles(unit);
        if (targets && targets.length > 0) {
          var bestTarget3 = null;
          var bestScore2 = -Infinity;
          for (var t = 0; t < targets.length; t++) {
            if (!targets[t].unit || targets[t].unit.hp <= 0) continue;
            var sc2 = scoreTarget(unit, targets[t].unit, damageMap);
            if (sc2 > bestScore2) {
              bestScore2 = sc2;
              bestTarget3 = targets[t].unit;
            }
          }
          if (bestTarget3) {
            await IRON.performAttack(unit, bestTarget3);
            IRON.addLog('Enemy ' + name + ' attacks ' + uName(bestTarget3) + '!', 'ai');
            damageMap.set(bestTarget3, (damageMap.get(bestTarget3) || 0) + 1);
            hasAttacked = true;
          }
        }
      }
    }

    // --- MOVE LOGIC ---
    if (!hasMoved && typeof IRON.getMovableTiles === 'function') {
      // Retreat check: low HP and can't kill anyone, prefer retreating
      var retreatThreshold = 0.3;
      var vetIdx = getVetRankIndex(unit);
      if (vetIdx >= 1) retreatThreshold = 0.4;
      if (vetIdx >= 2) retreatThreshold = 0.5;
      var shouldRetreat = hpPct < retreatThreshold && !hasAttacked;

      var movable2 = IRON.getMovableTiles(unit);
      if (movable2 && movable2.length > 0) {
        var bestTile2 = null;
        var bestScore3 = -Infinity;

        // Refresh enemy/ally lists (some may have died)
        var currentEnemies = teamUnits('blue');
        var currentAllies = teamUnits('red');

        for (var mi2 = 0; mi2 < movable2.length; mi2++) {
          var mv = movable2[mi2];
          // Check tile is not occupied by another unit
          var occupied = IRON.state.units.some(
            function (u) { return u !== unit && u.hp > 0 && u.x === mv.x && u.z === mv.z; }
          );
          if (occupied) continue;

          var sc3 = scoreTile(unit, mv.x, mv.z, currentEnemies, currentAllies, grid, red);

          // Retreat override for wounded units
          if (shouldRetreat) {
            var nearestED = 999;
            for (var rei = 0; rei < currentEnemies.length; rei++) {
              var rd = dist(mv.x, mv.z, currentEnemies[rei].x, currentEnemies[rei].z);
              if (rd < nearestED) nearestED = rd;
            }
            sc3 = nearestED * 8 + terrainDef(grid, mv.x, mv.z) * 10;
            if (isMinefield(grid, mv.x, mv.z)) sc3 -= 200;
            if (red.hqTile) {
              sc3 -= dist(mv.x, mv.z, red.hqTile.x, red.hqTile.z) * 2;
            }
            // But override retreat if we can get a kill
            for (var rk = 0; rk < currentEnemies.length; rk++) {
              var rkd = dist(mv.x, mv.z, currentEnemies[rk].x, currentEnemies[rk].z);
              var atkR = stats.atkRange || 1;
              if (rkd <= atkR && rkd >= 1) {
                var rkDmg = (typeof IRON.calculateDamage === 'function')
                  ? IRON.calculateDamage(unit, currentEnemies[rk]) : stats.atk;
                if (rkDmg >= currentEnemies[rk].hp) {
                  sc3 += 200; // Kill opportunity overrides retreat
                }
              }
            }
          }

          if (sc3 > bestScore3) {
            bestScore3 = sc3;
            bestTile2 = mv;
          }
        }

        if (bestTile2 && (bestTile2.x !== unit.x || bestTile2.z !== unit.z)) {
          await IRON.moveUnitAnim(unit, bestTile2.x, bestTile2.z, grid);
          IRON.addLog('Enemy ' + name + ' moves', 'ai');
          hasMoved = true;
        }
      }
    }

    // --- POST-MOVE ATTACK ---
    if (!hasAttacked && typeof IRON.getAttackableTiles === 'function') {
      var targets2 = IRON.getAttackableTiles(unit);
      if (targets2 && targets2.length > 0) {
        var bestTarget4 = null;
        var bestScore4 = -Infinity;
        for (var t2 = 0; t2 < targets2.length; t2++) {
          if (!targets2[t2].unit || targets2[t2].unit.hp <= 0) continue;
          var sc4 = scoreTarget(unit, targets2[t2].unit, damageMap);
          // Bounty target bonus
          var objTargets = getObjectiveTargets(allies, enemies);
          for (var bo = 0; bo < objTargets.length; bo++) {
            if (objTargets[bo].isKill && objTargets[bo].target === targets2[t2].unit) {
              sc4 += 200; // Strong incentive to kill bounty target
            }
          }
          if (sc4 > bestScore4) {
            bestScore4 = sc4;
            bestTarget4 = targets2[t2].unit;
          }
        }
        if (bestTarget4) {
          await IRON.performAttack(unit, bestTarget4);
          IRON.addLog('Enemy ' + name + ' attacks ' + uName(bestTarget4) + '!', 'ai');
          damageMap.set(bestTarget4, (damageMap.get(bestTarget4) || 0) + 1);
          hasAttacked = true;
        }
      }
    }

    // --- DEPOT CAPTURE CHECK ---
    if (typeof IRON.checkDepotCapture === 'function') {
      IRON.checkDepotCapture();
    }

    unit.hasMoved = true; unit.hasAttacked = true;
  }

  // -----------------------------------------------------------------
  //  MAIN AI TURN
  // -----------------------------------------------------------------

  IRON.aiTurn = async function () {
    // Hot-seat mode: AI should not act
    if (IRON.SETTINGS.multiplayer) return;

    var red = IRON.state.red;
    var grid = IRON.state.grid;
    var diff = diffSettings();
    var delay = diff.aiDelay || 350;

    IRON.addLog('--- Enemy Turn ---', 'ai');
    await IRON.sleep(delay);

    // === PHASE 1: RESEARCH ===
    try {
      aiResearchPhase();
    } catch (e) {
      console.warn('[AI] Research phase error:', e);
    }
    await IRON.sleep(Math.floor(delay * 0.8));

    // === PHASE 2: PRODUCTION ===
    try {
      aiProductionPhase();
    } catch (e) {
      console.warn('[AI] Production phase error:', e);
    }
    await IRON.sleep(Math.floor(delay * 0.8));

    // === PHASE 2.5: COMMANDER ABILITIES ===
    try {
      var cmdAllies = teamUnits('red');
      var cmdEnemies = teamUnits('blue');
      await tryCommanderAbilities(red, cmdEnemies, cmdAllies);
    } catch (e) {
      console.warn('[AI] Commander abilities error:', e);
    }

    // === PHASE 3: UNIT ACTIONS ===
    var aiUnits = teamUnits('red');
    var enemies = teamUnits('blue');

    // Reset acted flags
    for (var i = 0; i < aiUnits.length; i++) {
      aiUnits[i].hasMoved = false; aiUnits[i].hasAttacked = false;
    }

    // Sort by action priority (highest first)
    var sorted = aiUnits.slice().sort(function (a, b) {
      return actionPriority(b, enemies, aiUnits, grid)
        - actionPriority(a, enemies, aiUnits, grid);
    });

    // Track focus fire targets
    var damageMap = new Map();

    for (var j = 0; j < sorted.length; j++) {
      var unit = sorted[j];
      if (unit.hp <= 0) continue;
      try {
        await processUnit(unit, teamUnits('blue'), teamUnits('red'), grid, red, damageMap);
      } catch (e) {
        console.warn('[AI] Unit action error for', uName(unit), ':', e);
      }
      // Delay between unit actions for visual feedback (difficulty-scaled)
      var minDelay = Math.floor(delay * 0.6);
      var maxDelay = Math.floor(delay * 1.2);
      await IRON.sleep(randInt(minDelay, maxDelay));
    }

    await IRON.sleep(delay);
    IRON.addLog('--- Enemy Turn Ends ---', 'ai');

    // End the AI turn
    IRON.endTurn();
  };

})();
