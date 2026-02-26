// ===================================================================
//  IRONFRONT v4.0 — UI MANAGEMENT
//  DOM UI: unit info, action buttons, panels, research, production,
//  input handling, tooltips, notifications, battle log, abilities,
//  veterancy, weather, objectives, merge, stealth, commander panel
// ===================================================================

(function () {
  'use strict';

  // ---------------------------------------------------------------
  //  DOM ELEMENT CACHE
  // ---------------------------------------------------------------
  const $ = id => document.getElementById(id);

  const DOM = {
    canvas:        $('game-canvas'),
    unitIcon:      $('unitIcon'),
    unitName:      $('unitName'),
    unitType:      $('unitType'),
    statBars:      $('statBars'),
    actionsPanel:  $('actionsPanel'),
    btnMove:       $('btnMove'),
    btnAttack:     $('btnAttack'),
    btnWait:       $('btnWait'),
    btnEndTurn:    $('btnEndTurn'),
    logPanel:      $('logPanel'),
    turnNum:       $('turnNum'),
    currentPlayer: $('currentPlayer'),
    blueCount:     $('blueCount'),
    redCount:      $('redCount'),
    notification:  $('notification'),
    gameOverScreen:   $('gameOverScreen'),
    gameOverTitle:    $('gameOverTitle'),
    gameOverSubtitle: $('gameOverSubtitle'),
    tileTooltip:   $('tileTooltip'),
    // New v4.0 elements
    btnAbility:    $('btnAbility'),
    btnMerge:      $('btnMerge'),
    btnStealth:    $('btnStealth'),
    unitRank:      $('unitRank'),
    weatherIndicator: $('weatherIndicator'),
    objectiveBanner:  $('objectiveBanner'),
  };

  // ---------------------------------------------------------------
  //  DYNAMICALLY INJECTED BUTTONS (heal / build)
  // ---------------------------------------------------------------
  let btnHeal  = null;
  let btnBuild = null;

  // Insert heal button after attack
  btnHeal = document.createElement('button');
  btnHeal.id = 'btnHeal';
  btnHeal.className = 'action-btn';
  btnHeal.textContent = 'HEAL';
  btnHeal.disabled = true;
  btnHeal.style.display = 'none';
  btnHeal.style.borderColor = 'rgba(0,255,136,0.4)';
  btnHeal.style.background = 'rgba(0,255,136,0.1)';
  btnHeal.style.color = '#00ff88';
  DOM.btnAttack.after(btnHeal);

  // Insert build button after heal
  btnBuild = document.createElement('button');
  btnBuild.id = 'btnBuild';
  btnBuild.className = 'action-btn';
  btnBuild.textContent = 'BUILD';
  btnBuild.disabled = true;
  btnBuild.style.display = 'none';
  btnBuild.style.borderColor = 'rgba(0,200,255,0.4)';
  btnBuild.style.background = 'rgba(0,200,255,0.1)';
  btnBuild.style.color = '#00ccff';
  btnHeal.after(btnBuild);

  // ---------------------------------------------------------------
  //  RESOURCE DISPLAY (create if not present)
  // ---------------------------------------------------------------
  let resourceBar = document.querySelector('.resource-bar');
  if (!resourceBar) {
    resourceBar = document.createElement('div');
    resourceBar.className = 'resource-bar';
    resourceBar.style.cssText =
      'display:flex;gap:16px;align-items:center;font-family:"Share Tech Mono",monospace;font-size:12px;';
    resourceBar.innerHTML =
      '<span style="color:#ffcc00;">&#9733; <span id="blueCredits">500</span></span>' +
      '<span style="color:#cc88ff;">&#9670; <span id="blueRP">0</span> RP</span>' +
      '<span style="color:#44dd88;">+<span id="blueIncome">100</span>/t</span>';
    const topHud = document.querySelector('.top-hud');
    if (topHud) {
      const scores = topHud.querySelector('.scores');
      topHud.insertBefore(resourceBar, scores);
    }
  }

  DOM.blueCredits = $('blueCredits');
  DOM.blueRP      = $('blueRP');
  DOM.blueIncome  = $('blueIncome');

  // ---------------------------------------------------------------
  //  HELPER: Is it the local player's turn?
  //  In multiplayer (hot-seat) both teams can act on their turn.
  //  In single-player only 'blue' is the human.
  // ---------------------------------------------------------------
  function _isPlayerTeam(team) {
    if (IRON.SETTINGS && IRON.SETTINGS.multiplayer) {
      return team === IRON.state.currentTeam;
    }
    return team === 'blue';
  }

  function _currentTeamLabel(team) {
    if (IRON.SETTINGS && IRON.SETTINGS.multiplayer) {
      return team === 'blue' ? 'PLAYER 1' : 'PLAYER 2';
    }
    return team === 'blue' ? 'YOUR' : 'ENEMY';
  }

  // ---------------------------------------------------------------
  //  RANK DISPLAY COLORS
  // ---------------------------------------------------------------
  var RANK_COLORS = {
    'Recruit': '#999999',
    'Veteran': '#44dd44',
    'Elite':   '#4488ff',
    'Legend':  '#ffcc00',
  };

  // ---------------------------------------------------------------
  //  STATUS EFFECT BADGE CONFIG
  // ---------------------------------------------------------------
  var STATUS_BADGES = {
    burn:       { label: 'BURNING',     color: '#ff3333', bg: 'rgba(255,51,51,0.15)' },
    entrenched: { label: 'ENTRENCHED',  color: '#00ff88', bg: 'rgba(0,255,136,0.15)' },
    marked:     { label: 'MARKED',      color: '#ff3333', bg: 'rgba(255,51,51,0.15)' },
    disabled:   { label: 'DISABLED',    color: '#ffcc00', bg: 'rgba(255,204,0,0.15)' },
    suppressed: { label: 'SUPPRESSED',  color: '#ff8800', bg: 'rgba(255,136,0,0.15)' },
  };

  // ---------------------------------------------------------------
  //  1. UNIT SELECTION
  // ---------------------------------------------------------------
  IRON.selectUnit = function (unit) {
    if (!unit || unit.isDead) return;
    // In multiplayer, allow selecting units of the current team
    if (!_isPlayerTeam(unit.team)) return;

    // Deselect current first
    if (IRON.state.selectedUnit) {
      IRON.deselectUnit();
    }

    IRON.state.selectedUnit = unit;
    IRON.setSelectionRing(unit, true);
    IRON.updateUnitInfo(unit);
    IRON.updateActionButtons(unit);
    IRON.addLog('Selected ' + unit.typeData.name, 'info');
  };

  IRON.deselectUnit = function () {
    const unit = IRON.state.selectedUnit;
    if (unit) {
      IRON.setSelectionRing(unit, false);
    }
    IRON.state.selectedUnit = null;
    IRON.state.phase = 'select';
    IRON.clearHighlights();
    IRON.resetUnitInfo();
    IRON.resetActionButtons();
    _closeCommanderPanel();
  };

  // ---------------------------------------------------------------
  //  2. UNIT INFO PANEL
  // ---------------------------------------------------------------
  IRON.updateUnitInfo = function (unit) {
    if (!unit || !unit.typeData) return;
    const td = unit.typeData;

    DOM.unitIcon.textContent = td.icon;
    DOM.unitName.textContent = td.name.toUpperCase();
    DOM.unitType.textContent = td.type;

    var maxHp = td.hp;
    // Account for veterancy HP bonus
    if (IRON.VETERANCY && typeof unit.rank === 'number' && IRON.VETERANCY.ranks[unit.rank]) {
      maxHp = td.hp + (IRON.VETERANCY.ranks[unit.rank].hpBonus || 0);
    }

    const hpPct = Math.max(0, Math.min(100, (unit.hp / maxHp) * 100));
    const atkPct = Math.max(0, Math.min(100, (unit.atk / 100) * 100));
    const defPct = Math.max(0, Math.min(100, (unit.def / 60) * 100));

    var barsHTML =
      _statBarHTML('HP',  'hp',  hpPct,  unit.hp + '/' + maxHp) +
      _statBarHTML('ATK', 'atk', atkPct, unit.atk) +
      _statBarHTML('DEF', 'def', defPct, unit.def) +
      '<div class="stat-bar">' +
        '<span class="label" style="color:rgba(200,216,232,0.6);width:30px;font-size:9px;letter-spacing:1px;">MOV</span>' +
        '<span class="value" style="color:#eef4ff;font-size:11px;width:auto;margin-left:4px;">' + td.moveRange + '</span>' +
        '<span class="label" style="color:rgba(200,216,232,0.6);width:30px;font-size:9px;letter-spacing:1px;margin-left:12px;">RNG</span>' +
        '<span class="value" style="color:#eef4ff;font-size:11px;width:auto;margin-left:4px;">' + td.atkRange + '</span>' +
      '</div>';

    DOM.statBars.innerHTML = barsHTML;

    // --- Veterancy display ---
    _updateVeterancyDisplay(unit);

    // --- Status effects ---
    _updateStatusEffects(unit);
  };

  function _statBarHTML(label, cls, pct, value) {
    return (
      '<div class="stat-bar">' +
        '<span class="label">' + label + '</span>' +
        '<div class="bar-track"><div class="bar-fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
        '<span class="value">' + value + '</span>' +
      '</div>'
    );
  }

  // --- Veterancy rank display ---
  function _updateVeterancyDisplay(unit) {
    if (!DOM.unitRank) return;
    if (!IRON.VETERANCY || !IRON.VETERANCY.ranks) {
      DOM.unitRank.innerHTML = '';
      return;
    }
    var rank = (typeof unit.rank === 'number') ? unit.rank : 0;
    var rd = IRON.VETERANCY.ranks[rank];
    if (!rd) { DOM.unitRank.innerHTML = ''; return; }

    var color = RANK_COLORS[rd.name] || '#aaaaaa';
    var xp = unit.xp || 0;
    // Calculate next rank XP threshold
    var nextRank = IRON.VETERANCY.ranks[rank + 1];
    var xpNeeded = nextRank ? nextRank.xp : rd.xp;
    var xpBase = rd.xp;
    var xpProgress = 100;
    if (nextRank) {
      xpProgress = Math.max(0, Math.min(100, ((xp - xpBase) / (xpNeeded - xpBase)) * 100));
    }

    var html = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">';
    html += '<span style="font-size:12px;">' + (rd.icon || '') + '</span>';
    html += '<span style="font-family:Orbitron,monospace;font-size:10px;font-weight:700;color:' + color + ';letter-spacing:1px;">' + rd.name.toUpperCase() + '</span>';
    html += '</div>';
    // XP bar
    html += '<div style="display:flex;align-items:center;gap:6px;">';
    html += '<span style="font-family:Share Tech Mono,monospace;font-size:9px;color:rgba(200,216,232,0.5);">XP</span>';
    html += '<div style="flex:1;height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;">';
    html += '<div style="height:100%;width:' + xpProgress + '%;background:' + color + ';border-radius:2px;"></div>';
    html += '</div>';
    html += '<span style="font-family:Share Tech Mono,monospace;font-size:9px;color:rgba(200,216,232,0.5);">' + xp + '/' + xpNeeded + '</span>';
    html += '</div>';

    DOM.unitRank.innerHTML = html;
  }

  // --- Status effect badges ---
  function _updateStatusEffects(unit) {
    // Insert status badges into the stat bars area
    var container = DOM.statBars;
    if (!container) return;

    var effects = unit.statusEffects || unit.effects || {};
    var html = '';

    for (var key in STATUS_BADGES) {
      if (!STATUS_BADGES.hasOwnProperty(key)) continue;
      // Check if unit has this effect active
      var active = false;
      if (typeof effects === 'object' && effects[key]) {
        active = true;
      }
      // Also check direct flags
      if (unit[key] || unit['is' + key.charAt(0).toUpperCase() + key.slice(1)]) {
        active = true;
      }
      if (unit.entrenched && key === 'entrenched') active = true;

      if (active) {
        var badge = STATUS_BADGES[key];
        html += '<span style="display:inline-block;font-family:Orbitron,monospace;font-size:8px;font-weight:700;' +
          'color:' + badge.color + ';background:' + badge.bg + ';border:1px solid ' + badge.color + ';' +
          'border-radius:3px;padding:2px 6px;margin-right:4px;margin-top:4px;letter-spacing:1px;">' +
          badge.label + '</span>';
      }
    }

    if (html) {
      container.innerHTML += '<div style="margin-top:4px;">' + html + '</div>';
    }
  }

  IRON.resetUnitInfo = function () {
    DOM.unitIcon.textContent = '\u2B21'; // hexagon
    DOM.unitName.textContent = 'SELECT A UNIT';
    DOM.unitType.textContent = 'CLICK ON YOUR UNITS';
    DOM.statBars.innerHTML = '';
    if (DOM.unitRank) DOM.unitRank.innerHTML = '';
  };

  // ---------------------------------------------------------------
  //  3. ACTION BUTTONS
  // ---------------------------------------------------------------
  IRON.updateActionButtons = function (unit) {
    if (!unit) { IRON.resetActionButtons(); return; }
    const td = unit.typeData;

    DOM.btnMove.disabled    = !!unit.hasMoved;
    DOM.btnAttack.disabled  = !!unit.hasAttacked;
    DOM.btnWait.disabled    = !!(unit.hasMoved && unit.hasAttacked);
    DOM.btnEndTurn.disabled = false;

    // Heal button: only visible for medics
    if (td.canHeal) {
      btnHeal.style.display = '';
      btnHeal.disabled = !!unit.hasAttacked;
    } else {
      btnHeal.style.display = 'none';
    }

    // Build button: only visible for engineers
    if (td.canBuild) {
      btnBuild.style.display = '';
      btnBuild.disabled = !!unit.hasAttacked;
    } else {
      btnBuild.style.display = 'none';
    }

    // --- Ability button ---
    _updateAbilityButton(unit);

    // --- Merge button ---
    _updateMergeButton(unit);

    // --- Stealth button ---
    _updateStealthButton(unit);

    // --- Commander strategic button ---
    _updateCommanderButton(unit);
  };

  // --- Ability button logic ---
  function _updateAbilityButton(unit) {
    if (!DOM.btnAbility) return;
    var abilityDef = IRON.ABILITIES ? IRON.ABILITIES[unit.unitType] : null;
    if (!abilityDef) {
      DOM.btnAbility.style.display = 'none';
      DOM.btnAbility.disabled = true;
      return;
    }

    DOM.btnAbility.style.display = '';
    var cd = unit.abilityCooldown || 0;
    if (cd > 0) {
      DOM.btnAbility.textContent = abilityDef.name.toUpperCase() + ' (' + cd + ')';
      DOM.btnAbility.disabled = true;
    } else {
      DOM.btnAbility.textContent = abilityDef.name.toUpperCase();
      DOM.btnAbility.disabled = !!unit.hasAttacked;
    }
  }

  // --- Merge button logic ---
  function _updateMergeButton(unit) {
    if (!DOM.btnMerge) return;
    var canMerge = false;
    if (typeof IRON.canMerge === 'function') {
      canMerge = IRON.canMerge(unit);
    }
    if (canMerge) {
      DOM.btnMerge.style.display = '';
      DOM.btnMerge.disabled = false;
    } else {
      DOM.btnMerge.style.display = 'none';
      DOM.btnMerge.disabled = true;
    }
  }

  // --- Stealth button logic ---
  function _updateStealthButton(unit) {
    if (!DOM.btnStealth) return;
    // Show for Scout, Drone, or Sniper with Stealth Tech research
    var canStealth = false;
    var utype = unit.unitType;

    if (utype === 'SCOUT' || utype === 'DRONE') {
      canStealth = true;
    } else if (utype === 'SNIPER') {
      // Requires Stealth Tech research
      var teamSt = IRON.state[unit.team] || {};
      if (teamSt.research && teamSt.research.stealthTech && teamSt.research.stealthTech.completed) {
        canStealth = true;
      }
      // Also check via getResearchStatus if available
      if (!canStealth && typeof IRON.getResearchStatus === 'function') {
        if (IRON.getResearchStatus(unit.team, 'stealthTech') === 'completed') {
          canStealth = true;
        }
      }
    }

    if (canStealth) {
      DOM.btnStealth.style.display = '';
      DOM.btnStealth.disabled = false;
      DOM.btnStealth.textContent = unit.stealthed ? 'UNSTEALTH' : 'STEALTH';
    } else {
      DOM.btnStealth.style.display = 'none';
      DOM.btnStealth.disabled = true;
    }
  }

  // --- Commander strategic button ---
  var _commanderPanelOpen = false;

  function _updateCommanderButton(unit) {
    // Only for Commander units
    var stratBtn = $('btnStrategic');
    if (unit.unitType !== 'COMMANDER') {
      if (stratBtn) stratBtn.style.display = 'none';
      _closeCommanderPanel();
      return;
    }

    // Create strategic button if it doesn't exist
    if (!stratBtn) {
      stratBtn = document.createElement('button');
      stratBtn.id = 'btnStrategic';
      stratBtn.className = 'action-btn';
      stratBtn.textContent = 'STRATEGIC';
      stratBtn.style.borderColor = 'rgba(255,204,0,0.4)';
      stratBtn.style.background = 'rgba(255,204,0,0.1)';
      stratBtn.style.color = '#ffcc00';
      if (DOM.actionsPanel) {
        DOM.actionsPanel.appendChild(stratBtn);
      }
      stratBtn.addEventListener('click', function () {
        if (_commanderPanelOpen) {
          _closeCommanderPanel();
        } else {
          _openCommanderPanel();
        }
      });
    }

    stratBtn.style.display = '';
    stratBtn.disabled = false;
  }

  function _openCommanderPanel() {
    _commanderPanelOpen = true;
    var panel = $('commanderAbilityPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'commanderAbilityPanel';
      panel.style.cssText =
        'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);z-index:120;' +
        'background:rgba(4,6,10,0.95);border:1px solid rgba(255,204,0,0.3);border-radius:8px;' +
        'padding:16px;display:flex;gap:12px;backdrop-filter:blur(6px);';
      document.body.appendChild(panel);
    }

    var unit = IRON.state.selectedUnit;
    if (!unit) { _closeCommanderPanel(); return; }

    var teamSt = IRON.state[unit.team] || {};
    var credits = teamSt.credits || 0;

    var html = '';
    // Airstrike
    var airUsed = (teamSt.commanderAbilities && teamSt.commanderAbilities.airstrike && teamSt.commanderAbilities.airstrike.used) || false;
    html += '<div style="text-align:center;min-width:110px;">';
    html += '<div style="font-size:20px;margin-bottom:4px;">💣</div>';
    html += '<div style="font-family:Orbitron,monospace;font-size:9px;color:#eef4ff;letter-spacing:1px;margin-bottom:4px;">AIRSTRIKE</div>';
    html += '<div style="font-family:Share Tech Mono,monospace;font-size:9px;color:#ffcc00;margin-bottom:6px;">200 CREDITS</div>';
    if (airUsed) {
      html += '<button disabled style="font-family:Orbitron,monospace;font-size:8px;padding:4px 10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.02);color:rgba(255,255,255,0.3);cursor:not-allowed;letter-spacing:1px;">USED</button>';
    } else if (credits < 200) {
      html += '<button disabled style="font-family:Orbitron,monospace;font-size:8px;padding:4px 10px;border:1px solid rgba(255,170,0,0.3);background:rgba(255,170,0,0.05);color:rgba(255,170,0,0.5);cursor:not-allowed;letter-spacing:1px;">NO FUNDS</button>';
    } else {
      html += '<button class="cmd-ability-btn" data-cmd="airstrike" style="font-family:Orbitron,monospace;font-size:8px;padding:4px 10px;border:1px solid rgba(255,204,0,0.5);background:rgba(255,204,0,0.1);color:#ffcc00;cursor:pointer;letter-spacing:1px;">ACTIVATE</button>';
    }
    html += '</div>';

    // Emergency Drop
    var dropUsed = (teamSt.commanderAbilities && teamSt.commanderAbilities.emergencyDrop && teamSt.commanderAbilities.emergencyDrop.used) || false;
    html += '<div style="text-align:center;min-width:110px;">';
    html += '<div style="font-size:20px;margin-bottom:4px;">📦</div>';
    html += '<div style="font-family:Orbitron,monospace;font-size:9px;color:#eef4ff;letter-spacing:1px;margin-bottom:4px;">EMERGENCY DROP</div>';
    html += '<div style="font-family:Share Tech Mono,monospace;font-size:9px;color:rgba(200,216,232,0.5);margin-bottom:6px;">FREE</div>';
    if (dropUsed) {
      html += '<button disabled style="font-family:Orbitron,monospace;font-size:8px;padding:4px 10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.02);color:rgba(255,255,255,0.3);cursor:not-allowed;letter-spacing:1px;">USED</button>';
    } else {
      html += '<button class="cmd-ability-btn" data-cmd="emergencyDrop" style="font-family:Orbitron,monospace;font-size:8px;padding:4px 10px;border:1px solid rgba(0,255,136,0.5);background:rgba(0,255,136,0.1);color:#00ff88;cursor:pointer;letter-spacing:1px;">ACTIVATE</button>';
    }
    html += '</div>';

    // Iron Will
    var willUsed = (teamSt.commanderAbilities && teamSt.commanderAbilities.ironWill && teamSt.commanderAbilities.ironWill.used) || false;
    html += '<div style="text-align:center;min-width:110px;">';
    html += '<div style="font-size:20px;margin-bottom:4px;">🛡️</div>';
    html += '<div style="font-family:Orbitron,monospace;font-size:9px;color:#eef4ff;letter-spacing:1px;margin-bottom:4px;">IRON WILL</div>';
    html += '<div style="font-family:Share Tech Mono,monospace;font-size:9px;color:rgba(200,216,232,0.5);margin-bottom:6px;">FREE</div>';
    if (willUsed) {
      html += '<button disabled style="font-family:Orbitron,monospace;font-size:8px;padding:4px 10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.02);color:rgba(255,255,255,0.3);cursor:not-allowed;letter-spacing:1px;">USED</button>';
    } else {
      html += '<button class="cmd-ability-btn" data-cmd="ironWill" style="font-family:Orbitron,monospace;font-size:8px;padding:4px 10px;border:1px solid rgba(68,136,255,0.5);background:rgba(68,136,255,0.1);color:#4488ff;cursor:pointer;letter-spacing:1px;">ACTIVATE</button>';
    }
    html += '</div>';

    panel.innerHTML = html;
    panel.style.display = 'flex';

    // Attach handlers
    var cmdBtns = panel.querySelectorAll('.cmd-ability-btn');
    for (var i = 0; i < cmdBtns.length; i++) {
      cmdBtns[i].addEventListener('click', function () {
        var cmd = this.getAttribute('data-cmd');
        _executeCommanderAbility(cmd);
      });
    }
  }

  function _closeCommanderPanel() {
    _commanderPanelOpen = false;
    var panel = $('commanderAbilityPanel');
    if (panel) {
      panel.style.display = 'none';
    }
  }

  function _executeCommanderAbility(cmd) {
    var unit = IRON.state.selectedUnit;
    if (!unit || unit.unitType !== 'COMMANDER') return;
    var teamSt = IRON.state[unit.team] || {};

    if (cmd === 'airstrike') {
      if (teamSt.commanderAbilities && teamSt.commanderAbilities.airstrike && teamSt.commanderAbilities.airstrike.used) return;
      if ((teamSt.credits || 0) < 200) return;
      // Enter airstrike targeting mode
      IRON.state.phase = 'airstrike';
      IRON.addLog('Select target tile for AIRSTRIKE', 'ability');
      IRON.showNotification('SELECT AIRSTRIKE TARGET', 2000);
      _closeCommanderPanel();
      return;
    }

    if (cmd === 'emergencyDrop') {
      if (teamSt.commanderAbilities && teamSt.commanderAbilities.emergencyDrop && teamSt.commanderAbilities.emergencyDrop.used) return;
      if (typeof IRON.useCommanderAbility === 'function') {
        IRON.useCommanderAbility(unit.team, 'emergencyDrop', unit.x, unit.z);
      }
      if (teamSt.commanderAbilities && teamSt.commanderAbilities.emergencyDrop) {
        teamSt.commanderAbilities.emergencyDrop.used = true;
      }
      IRON.addLog('EMERGENCY DROP deployed!', 'ability');
      IRON.showNotification('EMERGENCY DROP', 1800);
      _closeCommanderPanel();
      _openCommanderPanel(); // refresh
      return;
    }

    if (cmd === 'ironWill') {
      if (teamSt.commanderAbilities && teamSt.commanderAbilities.ironWill && teamSt.commanderAbilities.ironWill.used) return;
      if (typeof IRON.useCommanderAbility === 'function') {
        IRON.useCommanderAbility(unit.team, 'ironWill', unit.x, unit.z);
      }
      if (teamSt.commanderAbilities && teamSt.commanderAbilities.ironWill) {
        teamSt.commanderAbilities.ironWill.used = true;
      }
      IRON.addLog('IRON WILL activated! All units buffed!', 'ability');
      IRON.showNotification('IRON WILL', 1800);
      _closeCommanderPanel();
      _openCommanderPanel(); // refresh
      return;
    }
  }

  IRON.resetActionButtons = function () {
    DOM.btnMove.disabled   = true;
    DOM.btnAttack.disabled = true;
    DOM.btnWait.disabled   = true;
    btnHeal.disabled  = true;
    btnHeal.style.display  = 'none';
    btnBuild.disabled = true;
    btnBuild.style.display = 'none';

    // Ability button
    if (DOM.btnAbility) {
      DOM.btnAbility.disabled = true;
      DOM.btnAbility.style.display = 'none';
    }

    // Merge button
    if (DOM.btnMerge) {
      DOM.btnMerge.disabled = true;
      DOM.btnMerge.style.display = 'none';
    }

    // Stealth button
    if (DOM.btnStealth) {
      DOM.btnStealth.disabled = true;
      DOM.btnStealth.style.display = 'none';
    }

    // Strategic button
    var stratBtn = $('btnStrategic');
    if (stratBtn) stratBtn.style.display = 'none';

    // End turn: enabled for the player's team
    DOM.btnEndTurn.disabled = !_isPlayerTeam(IRON.state.currentTeam);
  };

  // ---------------------------------------------------------------
  //  BUTTON CLICK HANDLERS
  // ---------------------------------------------------------------

  DOM.btnMove.addEventListener('click', function () {
    const unit = IRON.state.selectedUnit;
    if (!unit || unit.hasMoved) return;
    IRON.state.phase = 'move';
    const tiles = IRON.getMovableTiles(unit);
    IRON.clearHighlights();
    IRON.showMoveHighlights(tiles);
    IRON.addLog('Showing move range for ' + unit.typeData.name, 'move');
  });

  DOM.btnAttack.addEventListener('click', function () {
    const unit = IRON.state.selectedUnit;
    if (!unit || unit.hasAttacked) return;
    IRON.state.phase = 'attack';
    const tiles = IRON.getAttackableTiles(unit);
    IRON.clearHighlights();
    if (tiles.length === 0) {
      IRON.addLog('No targets in range!', 'info');
      IRON.state.phase = 'select';
      return;
    }
    IRON.showAttackHighlights(tiles);
    IRON.addLog('Select a target to attack', 'damage');
  });

  btnHeal.addEventListener('click', function () {
    const unit = IRON.state.selectedUnit;
    if (!unit || unit.hasAttacked) return;
    IRON.state.phase = 'heal';
    const tiles = IRON.getHealableTiles(unit);
    IRON.clearHighlights();
    if (tiles.length === 0) {
      IRON.addLog('No allies to heal nearby!', 'info');
      IRON.state.phase = 'select';
      return;
    }
    IRON.showHealHighlights(tiles);
    IRON.addLog('Select a friendly unit to heal', 'heal');
  });

  btnBuild.addEventListener('click', function () {
    const unit = IRON.state.selectedUnit;
    if (!unit || unit.hasAttacked) return;
    IRON.addLog('Build menu not yet available', 'info');
  });

  // Ability button handler
  if (DOM.btnAbility) {
    DOM.btnAbility.addEventListener('click', function () {
      var unit = IRON.state.selectedUnit;
      if (!unit) return;
      var abilityDef = IRON.ABILITIES ? IRON.ABILITIES[unit.unitType] : null;
      if (!abilityDef) return;
      var cd = unit.abilityCooldown || 0;
      if (cd > 0) return;
      if (unit.hasAttacked) return;

      // Self-buff abilities fire immediately
      if (abilityDef.type === 'self_buff') {
        _executeAbilityOnSelf(unit, abilityDef);
        return;
      }

      // Targeted abilities enter ability phase
      IRON.state.phase = 'ability';
      IRON.clearHighlights();
      if (typeof IRON.getAbilityTargets === 'function') {
        var targets = IRON.getAbilityTargets(unit);
        if (targets.length === 0) {
          IRON.addLog('No valid ability targets!', 'info');
          IRON.state.phase = 'select';
          return;
        }
        if (typeof IRON.showAbilityHighlights === 'function') {
          IRON.showAbilityHighlights(targets);
        } else if (typeof IRON.showAttackHighlights === 'function') {
          IRON.showAttackHighlights(targets);
        }
      }
      IRON.addLog('Select target for ' + abilityDef.name, 'ability');
    });
  }

  function _executeAbilityOnSelf(unit, abilityDef) {
    if (typeof IRON.useAbility === 'function') {
      IRON.useAbility(unit, unit.x, unit.z);
    }
    unit.abilityCooldown = abilityDef.cooldown || 3;
    unit.hasAttacked = true;
    IRON.state.phase = 'select';
    IRON.addLog(unit.typeData.name + ' used ' + abilityDef.name + '!', 'ability');
    IRON.showNotification(abilityDef.name.toUpperCase() + '!', 1500);
    IRON.updateActionButtons(unit);
    IRON.updateUnitInfo(unit);
  }

  // Merge button handler
  if (DOM.btnMerge) {
    DOM.btnMerge.addEventListener('click', function () {
      var unit = IRON.state.selectedUnit;
      if (!unit) return;
      if (typeof IRON.canMerge !== 'function' || !IRON.canMerge(unit)) return;

      IRON.state.phase = 'merge';
      IRON.clearHighlights();

      // Highlight adjacent merge-able units
      if (typeof IRON.getMergeTargets === 'function') {
        var targets = IRON.getMergeTargets(unit);
        if (targets.length === 0) {
          IRON.addLog('No merge targets nearby!', 'info');
          IRON.state.phase = 'select';
          return;
        }
        if (typeof IRON.showMergeHighlights === 'function') {
          IRON.showMergeHighlights(targets);
        } else if (typeof IRON.showHealHighlights === 'function') {
          IRON.showHealHighlights(targets);
        }
      }
      IRON.addLog('Select a unit to merge with', 'info');
    });
  }

  // Stealth button handler
  if (DOM.btnStealth) {
    DOM.btnStealth.addEventListener('click', function () {
      var unit = IRON.state.selectedUnit;
      if (!unit) return;
      if (typeof IRON.setUnitStealth === 'function') {
        IRON.setUnitStealth(unit, !unit.stealthed);
      } else {
        unit.stealthed = !unit.stealthed;
      }
      var stealthState = unit.stealthed ? 'ENGAGED' : 'DISENGAGED';
      IRON.addLog(unit.typeData.name + ' stealth ' + stealthState, 'ability');
      IRON.showNotification('STEALTH ' + stealthState, 1500);
      IRON.updateActionButtons(unit);
    });
  }

  DOM.btnWait.addEventListener('click', function () {
    const unit = IRON.state.selectedUnit;
    if (!unit) return;
    unit.hasMoved = true;
    unit.hasAttacked = true;
    IRON.addLog(unit.typeData.name + ' is holding position', 'info');
    IRON.deselectUnit();
  });

  DOM.btnEndTurn.addEventListener('click', function () {
    if (!_isPlayerTeam(IRON.state.currentTeam)) return;
    IRON.deselectUnit();
    IRON.endTurn();
  });

  // ---------------------------------------------------------------
  //  4. CANVAS CLICK HANDLER
  // ---------------------------------------------------------------
  IRON.onCanvasClick = function (event) {
    // Ignore clicks during gameover or animation
    if (IRON.state.phase === 'gameover') return;
    if (IRON.state.animating) return;

    // In single-player, only allow clicks during blue turn
    // In multiplayer, allow clicks during the current team's turn
    if (!_isPlayerTeam(IRON.state.currentTeam)) return;

    // Compute mouse position in NDC
    const rect = DOM.canvas.getBoundingClientRect();
    IRON.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    IRON.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    IRON.raycaster.setFromCamera(IRON.mouse, IRON.camera);
    const phase = IRON.state.phase;

    // ----- MOVE PHASE -----
    if (phase === 'move') {
      const hits = IRON.raycaster.intersectObjects(IRON.highlightGroup.children, true);
      if (hits.length > 0) {
        let hit = hits[0].object;
        while (hit && !hit.userData.tileX && hit.userData.tileX !== 0 && hit.parent) {
          hit = hit.parent;
        }
        const tx = hit.userData.tileX;
        const tz = hit.userData.tileZ;
        if (tx !== undefined && tz !== undefined) {
          const unit = IRON.state.selectedUnit;
          IRON.clearHighlights();
          IRON.state.animating = true;
          IRON.moveUnitAnim(unit, tx, tz, IRON.state.grid).then(function () {
            IRON.state.animating = false;
            unit.hasMoved = true;
            IRON.state.phase = 'select';
            IRON.checkDepotCapture();
            IRON.updateActionButtons(unit);
            IRON.updateScores();
            IRON.addLog(unit.typeData.name + ' moved to (' + tx + ',' + tz + ')', 'move');
            if (IRON.updateMinimap) {
              IRON.updateMinimap(IRON.state.grid, IRON.state.units);
            }
          });
        }
      }
      return;
    }

    // ----- ATTACK PHASE -----
    if (phase === 'attack') {
      const hits = IRON.raycaster.intersectObjects(IRON.highlightGroup.children, true);
      if (hits.length > 0) {
        let hit = hits[0].object;
        while (hit && !hit.userData.tileX && hit.userData.tileX !== 0 && hit.parent) {
          hit = hit.parent;
        }
        const tx = hit.userData.tileX;
        const tz = hit.userData.tileZ;
        if (tx !== undefined && tz !== undefined) {
          const tile = IRON.state.grid[tx] && IRON.state.grid[tx][tz];
          if (tile && tile.unit && tile.unit.team !== IRON.state.currentTeam && tile.unit.isDead !== true) {
            const attacker = IRON.state.selectedUnit;
            const defender = tile.unit;
            IRON.clearHighlights();
            IRON.performAttack(attacker, defender);
            attacker.hasAttacked = true;
            IRON.state.phase = 'select';
            IRON.updateActionButtons(attacker);
            IRON.updateScores();
            IRON.updateUnitInfo(attacker);
            if (IRON.updateMinimap) {
              IRON.updateMinimap(IRON.state.grid, IRON.state.units);
            }
          }
        }
      }
      return;
    }

    // ----- HEAL PHASE -----
    if (phase === 'heal') {
      const hits = IRON.raycaster.intersectObjects(IRON.highlightGroup.children, true);
      if (hits.length > 0) {
        let hit = hits[0].object;
        while (hit && !hit.userData.tileX && hit.userData.tileX !== 0 && hit.parent) {
          hit = hit.parent;
        }
        const tx = hit.userData.tileX;
        const tz = hit.userData.tileZ;
        if (tx !== undefined && tz !== undefined) {
          const tile = IRON.state.grid[tx] && IRON.state.grid[tx][tz];
          if (tile && tile.unit && tile.unit.team === IRON.state.currentTeam && tile.unit.isDead !== true) {
            const healer = IRON.state.selectedUnit;
            const target = tile.unit;
            IRON.clearHighlights();
            IRON.performHeal(healer, target);
            healer.hasAttacked = true;
            IRON.state.phase = 'select';
            IRON.updateActionButtons(healer);
            IRON.updateUnitInfo(healer);
          }
        }
      }
      return;
    }

    // ----- ABILITY PHASE -----
    if (phase === 'ability') {
      const hits = IRON.raycaster.intersectObjects(IRON.highlightGroup.children, true);
      if (hits.length > 0) {
        let hit = hits[0].object;
        while (hit && !hit.userData.tileX && hit.userData.tileX !== 0 && hit.parent) {
          hit = hit.parent;
        }
        const tx = hit.userData.tileX;
        const tz = hit.userData.tileZ;
        if (tx !== undefined && tz !== undefined) {
          const unit = IRON.state.selectedUnit;
          if (!unit) return;
          var abilityDef = IRON.ABILITIES ? IRON.ABILITIES[unit.unitType] : null;
          IRON.clearHighlights();
          if (typeof IRON.useAbility === 'function') {
            IRON.useAbility(unit, tx, tz);
          }
          unit.abilityCooldown = abilityDef ? (abilityDef.cooldown || 3) : 3;
          unit.hasAttacked = true;
          IRON.state.phase = 'select';
          IRON.addLog(unit.typeData.name + ' used ' + (abilityDef ? abilityDef.name : 'ability') + '!', 'ability');
          IRON.showNotification((abilityDef ? abilityDef.name.toUpperCase() : 'ABILITY') + '!', 1500);
          IRON.updateActionButtons(unit);
          IRON.updateScores();
          IRON.updateUnitInfo(unit);
          if (typeof IRON.updateMinimap === 'function') {
            IRON.updateMinimap(IRON.state.grid, IRON.state.units);
          }
        }
      }
      return;
    }

    // ----- MERGE PHASE -----
    if (phase === 'merge') {
      const hits = IRON.raycaster.intersectObjects(IRON.highlightGroup.children, true);
      if (hits.length > 0) {
        let hit = hits[0].object;
        while (hit && !hit.userData.tileX && hit.userData.tileX !== 0 && hit.parent) {
          hit = hit.parent;
        }
        const tx = hit.userData.tileX;
        const tz = hit.userData.tileZ;
        if (tx !== undefined && tz !== undefined) {
          const tile = IRON.state.grid[tx] && IRON.state.grid[tx][tz];
          if (tile && tile.unit && tile.unit.team === IRON.state.currentTeam && tile.unit.isDead !== true) {
            const unit = IRON.state.selectedUnit;
            const target = tile.unit;
            if (!unit || target === unit) return;
            IRON.clearHighlights();
            if (typeof IRON.mergeUnits === 'function') {
              IRON.mergeUnits(unit, target);
            }
            IRON.state.phase = 'select';
            IRON.addLog(unit.typeData.name + ' merged with ' + target.typeData.name + '!', 'info');
            IRON.showNotification('UNITS MERGED', 1500);
            IRON.updateScores();
            IRON.deselectUnit();
            if (typeof IRON.updateMinimap === 'function') {
              IRON.updateMinimap(IRON.state.grid, IRON.state.units);
            }
          }
        }
      }
      return;
    }

    // ----- AIRSTRIKE TARGETING PHASE (Commander) -----
    if (phase === 'airstrike') {
      var tileHitsAS = IRON.raycaster.intersectObjects(IRON.tileGroup.children, true);
      if (tileHitsAS.length > 0) {
        var objAS = tileHitsAS[0].object;
        while (objAS && objAS.userData.type !== 'tile' && objAS.parent) {
          objAS = objAS.parent;
        }
        if (objAS && objAS.userData.type === 'tile') {
          var axTx = objAS.userData.x;
          var axTz = objAS.userData.z;
          var unit = IRON.state.selectedUnit;
          if (!unit) return;
          var teamSt = IRON.state[unit.team] || {};
          // Deduct credits
          if ((teamSt.credits || 0) >= 200) {
            teamSt.credits -= 200;
            if (teamSt.commanderAbilities && teamSt.commanderAbilities.airstrike) {
              teamSt.commanderAbilities.airstrike.used = true;
            }
            if (typeof IRON.useCommanderAbility === 'function') {
              IRON.useCommanderAbility(unit.team, 'airstrike', axTx, axTz);
            }
            IRON.addLog('AIRSTRIKE at (' + axTx + ',' + axTz + ')!', 'ability');
            IRON.showNotification('AIRSTRIKE INCOMING!', 2000);
            IRON.updateResources();
            IRON.updateScores();
          }
          IRON.state.phase = 'select';
          if (typeof IRON.updateMinimap === 'function') {
            IRON.updateMinimap(IRON.state.grid, IRON.state.units);
          }
        }
      }
      return;
    }

    // ----- DEFAULT SELECT PHASE -----
    // Check unit clicks first, then tile clicks
    const unitHits = IRON.raycaster.intersectObjects(IRON.unitGroup.children, true);
    if (unitHits.length > 0) {
      let obj = unitHits[0].object;
      while (obj && !obj.userData.unitRef && obj.parent && obj.parent !== IRON.unitGroup) {
        obj = obj.parent;
      }
      if (obj && obj.userData.unitRef) {
        const clicked = obj.userData.unitRef;
        if (clicked.team === IRON.state.currentTeam && clicked.isDead !== true) {
          IRON.selectUnit(clicked);
          return;
        }
      }
    }

    // Check tile clicks
    const tileHits = IRON.raycaster.intersectObjects(IRON.tileGroup.children, true);
    if (tileHits.length > 0) {
      let obj = tileHits[0].object;
      while (obj && obj.userData.type !== 'tile' && obj.parent) {
        obj = obj.parent;
      }
      if (obj && obj.userData.type === 'tile') {
        const tx = obj.userData.x;
        const tz = obj.userData.z;
        const tile = IRON.state.grid[tx] && IRON.state.grid[tx][tz];
        if (tile && tile.unit && tile.unit.team === IRON.state.currentTeam && tile.unit.isDead !== true) {
          IRON.selectUnit(tile.unit);
          return;
        }
      }
    }

    // Clicked empty space - deselect
    IRON.deselectUnit();
  };

  DOM.canvas.addEventListener('click', IRON.onCanvasClick);

  // ---------------------------------------------------------------
  //  5. CANVAS MOUSEMOVE HANDLER (Tooltip)
  // ---------------------------------------------------------------
  DOM.canvas.addEventListener('mousemove', function (event) {
    const rect = DOM.canvas.getBoundingClientRect();
    const mx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    IRON.raycaster.setFromCamera({ x: mx, y: my }, IRON.camera);
    const hits = IRON.raycaster.intersectObjects(IRON.tileGroup.children, true);

    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj && obj.userData.type !== 'tile' && obj.parent) {
        obj = obj.parent;
      }
      if (obj && obj.userData.type === 'tile') {
        const tx = obj.userData.x;
        const tz = obj.userData.z;
        const tile = IRON.state.grid[tx] && IRON.state.grid[tx][tz];
        if (tile) {
          // Fog of war check: if fog is on and tile is not visible, limit info
          var fogActive = false;
          var tileVisible = true;
          var modeKey = IRON.SETTINGS ? IRON.SETTINGS.gameMode : 'CLASSIC';
          var gameMode = IRON.GAME_MODES ? IRON.GAME_MODES[modeKey] : null;
          if (gameMode && gameMode.fogOfWar) {
            fogActive = true;
            if (typeof tile.visible !== 'undefined') {
              tileVisible = tile.visible;
            } else if (typeof IRON.isTileVisible === 'function') {
              tileVisible = IRON.isTileVisible(IRON.state.currentTeam, tx, tz);
            }
          }

          if (fogActive && !tileVisible) {
            // Hidden tile - minimal info
            DOM.tileTooltip.innerHTML = '<div style="color:#666;font-weight:700;">FOG OF WAR</div>' +
              '<div style="font-size:10px;color:#444;">Tile not visible</div>';
            DOM.tileTooltip.classList.add('show');
            var ttX1 = event.clientX + 16;
            var ttY1 = event.clientY + 16;
            if (ttX1 + 160 > window.innerWidth)  ttX1 = event.clientX - 170;
            if (ttY1 + 120 > window.innerHeight) ttY1 = event.clientY - 130;
            DOM.tileTooltip.style.left = ttX1 + 'px';
            DOM.tileTooltip.style.top  = ttY1 + 'px';
            return;
          }

          let html = '<div style="color:#00ff88;font-weight:700;margin-bottom:4px;">' +
            tile.terrain.name.toUpperCase() + '</div>';
          html += '<div>DEF Bonus: <span style="color:#4488ff;">' +
            (tile.terrain.defBonus >= 0 ? '+' : '') + tile.terrain.defBonus + '</span></div>';
          html += '<div>Move Cost: <span style="color:#ffaa00;">' + tile.terrain.moveCost + '</span></div>';

          if (tile.unit && tile.unit.isDead !== true) {
            const u = tile.unit;
            const teamColor = u.team === 'blue' ? '#00aaff' : '#ff4444';
            html += '<div style="margin-top:6px;border-top:1px solid rgba(255,255,255,0.1);padding-top:4px;">';
            html += '<span style="color:' + teamColor + ';">' + u.typeData.icon + ' ' + u.typeData.name + '</span>';
            html += '<div>HP: ' + u.hp + '/' + u.typeData.hp + '</div>';

            // Veterancy rank in tooltip
            if (IRON.VETERANCY && IRON.VETERANCY.ranks && typeof u.rank === 'number') {
              var rd = IRON.VETERANCY.ranks[u.rank];
              if (rd && rd.name !== 'Recruit') {
                var rkColor = RANK_COLORS[rd.name] || '#aaa';
                html += '<div style="color:' + rkColor + ';font-size:10px;">' + (rd.icon || '') + ' ' + rd.name + '</div>';
              }
            }

            // Status effects in tooltip
            var effects = u.statusEffects || u.effects || {};
            var effectHtml = '';
            for (var key in STATUS_BADGES) {
              if (!STATUS_BADGES.hasOwnProperty(key)) continue;
              var active = false;
              if (typeof effects === 'object' && effects[key]) active = true;
              if (u[key] || u['is' + key.charAt(0).toUpperCase() + key.slice(1)]) active = true;
              if (u.entrenched && key === 'entrenched') active = true;
              if (active) {
                effectHtml += '<span style="color:' + STATUS_BADGES[key].color + ';font-size:9px;margin-right:4px;">' + STATUS_BADGES[key].label + '</span>';
              }
            }
            if (effectHtml) {
              html += '<div style="margin-top:2px;">' + effectHtml + '</div>';
            }

            html += '</div>';
          }

          DOM.tileTooltip.innerHTML = html;
          DOM.tileTooltip.classList.add('show');

          // Position near cursor
          let ttX = event.clientX + 16;
          let ttY = event.clientY + 16;
          if (ttX + 160 > window.innerWidth)  ttX = event.clientX - 170;
          if (ttY + 120 > window.innerHeight) ttY = event.clientY - 130;
          DOM.tileTooltip.style.left = ttX + 'px';
          DOM.tileTooltip.style.top  = ttY + 'px';
          return;
        }
      }
    }

    DOM.tileTooltip.classList.remove('show');
  });

  // ---------------------------------------------------------------
  //  6. SCORES & RESOURCES
  // ---------------------------------------------------------------
  IRON.updateScores = function () {
    const units = IRON.state.units;
    let blue = 0, red = 0;
    for (let i = 0; i < units.length; i++) {
      if (units[i].isDead) continue;
      if (units[i].team === 'blue') blue++;
      else red++;
    }
    DOM.blueCount.textContent = blue;
    DOM.redCount.textContent  = red;
  };

  IRON.updateResources = function () {
    var blue = IRON.state.blue || {};
    if (DOM.blueCredits) DOM.blueCredits.textContent = blue.credits || 0;
    if (DOM.blueRP)      DOM.blueRP.textContent      = blue.rp || 0;
    if (DOM.blueIncome)  DOM.blueIncome.textContent   = blue.income || IRON.HQ_INCOME;
  };

  // ---------------------------------------------------------------
  //  7. BATTLE LOG
  // ---------------------------------------------------------------
  const LOG_COLORS = {
    damage:     'damage',
    heal:       'heal',
    move:       'move',
    info:       'info',
    research:   'research',
    production: 'production',
    ai:         'ai',
    ability:    'ability',
    objective:  'objective',
  };

  IRON.addLog = function (msg, type) {
    type = type || 'info';
    const entry = document.createElement('div');
    entry.className = 'log-entry ' + (LOG_COLORS[type] || '');

    // Extra color classes not in CSS - apply inline
    if (type === 'research') {
      entry.style.color = '#cc88ff';
    } else if (type === 'production') {
      entry.style.color = '#00ddcc';
    } else if (type === 'ai') {
      entry.style.color = '#ff6666';
    } else if (type === 'ability') {
      entry.style.color = '#ffaa00';
    } else if (type === 'objective') {
      entry.style.color = '#44ddaa';
    }

    entry.textContent = msg;
    DOM.logPanel.appendChild(entry);
    DOM.logPanel.scrollTop = DOM.logPanel.scrollHeight;
  };

  // ---------------------------------------------------------------
  //  8. NOTIFICATIONS
  // ---------------------------------------------------------------
  IRON.showNotification = function (text, duration) {
    duration = duration || 1800;
    DOM.notification.textContent = text;
    DOM.notification.classList.add('show');
    setTimeout(function () {
      DOM.notification.classList.remove('show');
    }, duration);
  };

  // ---------------------------------------------------------------
  //  9. RESEARCH PANEL
  // ---------------------------------------------------------------

  // Create overlay container if it doesn't exist
  let researchPanel = $('researchPanel');
  if (!researchPanel) {
    researchPanel = document.createElement('div');
    researchPanel.id = 'researchPanel';
    researchPanel.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;z-index:150;' +
      'background:rgba(4,6,10,0.94);display:none;align-items:center;justify-content:center;' +
      'flex-direction:column;backdrop-filter:blur(8px);overflow-y:auto;';
    document.body.appendChild(researchPanel);
  }

  IRON.openResearchPanel = function () {
    _buildResearchContent();
    researchPanel.style.display = 'flex';
  };

  IRON.closeResearchPanel = function () {
    researchPanel.style.display = 'none';
  };

  IRON.updateResearchPanel = function () {
    if (researchPanel.style.display !== 'none') {
      _buildResearchContent();
    }
  };

  function _buildResearchContent() {
    const st = IRON.state;
    const tree = IRON.RESEARCH_TREE;
    const team = 'blue';
    const teamSt = st.blue || {};
    const credits = teamSt.credits || 0;
    const rp = teamSt.rp || 0;

    const branches = [
      { key: 'offense',  label: '\u2694\uFE0F OFFENSE',    color: '#ff6644' },
      { key: 'defense',  label: '\uD83D\uDEE1\uFE0F DEFENSE',    color: '#4488ff' },
      { key: 'tech',     label: '\uD83D\uDD2C TECHNOLOGY', color: '#cc88ff' },
      { key: 'intel',    label: '\uD83D\uDCE1 INTELLIGENCE', color: '#44ddaa' },
    ];

    let html = '';
    // Header
    html += '<div style="width:90%;max-width:1200px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">';
    html += '<div style="font-family:Orbitron,monospace;font-size:22px;font-weight:800;color:#00ff88;letter-spacing:4px;">RESEARCH TREE</div>';
    html += '<div style="display:flex;gap:24px;font-family:Share Tech Mono,monospace;font-size:14px;">';
    html += '<span style="color:#ffcc00;">\u2605 ' + credits + ' CREDITS</span>';
    html += '<span style="color:#cc88ff;">\u2666 ' + rp + ' RP</span>';
    html += '</div>';
    html += '<button id="closeResearch" style="font-family:Orbitron,monospace;font-size:12px;font-weight:700;' +
      'padding:8px 20px;border:1px solid rgba(255,51,85,0.5);background:rgba(255,51,85,0.1);color:#ff3355;' +
      'cursor:pointer;letter-spacing:2px;">CLOSE</button>';
    html += '</div>';

    // Branches
    for (let b = 0; b < branches.length; b++) {
      const br = branches[b];
      // Collect nodes for this branch sorted by tier
      const nodes = [];
      for (const id in tree) {
        if (tree[id].branch === br.key) {
          nodes.push({ id: id, data: tree[id] });
        }
      }
      nodes.sort(function (a, b) { return a.data.tier - b.data.tier; });

      html += '<div style="display:flex;align-items:stretch;margin-bottom:12px;">';

      // Branch label
      html += '<div style="width:130px;display:flex;align-items:center;justify-content:center;' +
        'font-family:Orbitron,monospace;font-size:11px;font-weight:700;letter-spacing:2px;color:' + br.color + ';' +
        'writing-mode:horizontal-tb;flex-shrink:0;">' + br.label + '</div>';

      // Nodes row
      html += '<div style="display:flex;gap:8px;flex:1;align-items:stretch;position:relative;flex-wrap:wrap;">';

      for (let n = 0; n < nodes.length; n++) {
        const node = nodes[n];
        const nd = node.data;
        const status = IRON.getResearchStatus(team, node.id);
        // status: 'completed', 'researching', 'available', 'locked'

        let borderColor, bg, opacity, cursor, glow;
        if (status === 'completed') {
          borderColor = '#ffcc00';
          bg = 'rgba(255,204,0,0.08)';
          opacity = '1';
          cursor = 'default';
          glow = 'box-shadow:0 0 16px rgba(255,204,0,0.3);';
        } else if (status === 'researching') {
          borderColor = '#00ff88';
          bg = 'rgba(0,255,136,0.06)';
          opacity = '1';
          cursor = 'default';
          glow = 'animation:researchPulse 1.5s infinite;';
        } else if (status === 'available') {
          // Check if player can actually afford it (credits AND rp)
          var canAfford = credits >= nd.cost && rp >= (nd.rpCost || 0);
          borderColor = canAfford ? br.color : 'rgba(255,170,0,0.3)';
          bg = canAfford ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)';
          opacity = canAfford ? '1' : '0.7';
          cursor = canAfford ? 'pointer' : 'pointer';
          glow = '';
        } else {
          borderColor = 'rgba(255,255,255,0.1)';
          bg = 'rgba(255,255,255,0.01)';
          opacity = '0.4';
          cursor = 'not-allowed';
          glow = '';
        }

        // Connection line between nodes
        const connector = n > 0
          ? '<div style="position:absolute;left:-8px;top:50%;width:8px;height:2px;background:' +
            (status === 'locked' ? 'rgba(255,255,255,0.1)' : br.color) + ';"></div>'
          : '';

        html += '<div class="research-node" data-rid="' + node.id + '" style="position:relative;flex:1;' +
          'border:1px solid ' + borderColor + ';background:' + bg + ';border-radius:6px;padding:12px;' +
          'opacity:' + opacity + ';cursor:' + cursor + ';transition:all 0.3s;min-width:160px;max-width:220px;' + glow + '">';
        html += connector;
        html += '<div style="font-size:22px;margin-bottom:6px;">' + nd.icon + '</div>';
        html += '<div style="font-family:Orbitron,monospace;font-size:11px;font-weight:700;color:#eef4ff;letter-spacing:1px;margin-bottom:4px;">' +
          nd.name.toUpperCase() + '</div>';
        html += '<div style="font-family:Share Tech Mono,monospace;font-size:10px;color:rgba(200,216,232,0.6);margin-bottom:8px;">' +
          nd.desc + '</div>';
        html += '<div style="display:flex;gap:12px;font-family:Share Tech Mono,monospace;font-size:10px;flex-wrap:wrap;">';
        html += '<span style="color:#ffcc00;">\u2605 ' + nd.cost + '</span>';
        if (nd.rpCost) {
          html += '<span style="color:#cc88ff;">\u2666 ' + nd.rpCost + ' RP</span>';
        }
        html += '<span style="color:rgba(200,216,232,0.5);">' + nd.turns + ' turns</span>';
        html += '</div>';

        // Progress bar for researching
        if (status === 'researching') {
          const resState = teamSt.research && teamSt.research[node.id];
          const turnsLeft = resState ? resState.turnsLeft : nd.turns;
          const progress = ((nd.turns - turnsLeft) / nd.turns) * 100;
          html += '<div style="margin-top:8px;height:4px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;">';
          html += '<div style="height:100%;width:' + progress + '%;background:linear-gradient(90deg,#00aa55,#00ff88);border-radius:2px;"></div>';
          html += '</div>';
          html += '<div style="font-family:Share Tech Mono,monospace;font-size:9px;color:#00ff88;margin-top:4px;">' +
            turnsLeft + ' TURNS REMAINING</div>';
        }

        if (status === 'completed') {
          html += '<div style="font-family:Orbitron,monospace;font-size:9px;color:#ffcc00;margin-top:6px;letter-spacing:2px;">COMPLETED</div>';
        }

        // Show if can't afford when available
        if (status === 'available') {
          var needsCredits = credits < nd.cost;
          var needsRP = rp < (nd.rpCost || 0);
          if (needsCredits || needsRP) {
            var insuffHtml = '<div style="font-family:Share Tech Mono,monospace;font-size:9px;color:#ff6644;margin-top:4px;">';
            if (needsCredits) insuffHtml += 'NEED ' + (nd.cost - credits) + ' MORE CREDITS ';
            if (needsRP) insuffHtml += 'NEED ' + ((nd.rpCost || 0) - rp) + ' MORE RP';
            insuffHtml += '</div>';
            html += insuffHtml;
          }
        }

        html += '</div>';
      }

      html += '</div>'; // nodes row
      html += '</div>'; // branch row
    }

    html += '</div>'; // wrapper

    // Inject pulse animation style
    if (!document.getElementById('researchPulseStyle')) {
      const style = document.createElement('style');
      style.id = 'researchPulseStyle';
      style.textContent =
        '@keyframes researchPulse { 0%,100%{box-shadow:0 0 8px rgba(0,255,136,0.2);} 50%{box-shadow:0 0 20px rgba(0,255,136,0.5);} }';
      document.head.appendChild(style);
    }

    researchPanel.innerHTML = html;

    // Close button
    var closeBtn = researchPanel.querySelector('#closeResearch');
    if (closeBtn) {
      closeBtn.addEventListener('click', IRON.closeResearchPanel);
    }

    // Node click handlers
    var nodeEls = researchPanel.querySelectorAll('.research-node');
    for (var i = 0; i < nodeEls.length; i++) {
      nodeEls[i].addEventListener('click', function () {
        var rid = this.getAttribute('data-rid');
        if (typeof IRON.canResearch === 'function' && IRON.canResearch('blue', rid)) {
          // Double-check RP cost affordability
          var nodeDef = IRON.RESEARCH_TREE[rid];
          var teamData = IRON.state.blue || {};
          var playerCredits = teamData.credits || 0;
          var playerRP = teamData.rp || 0;
          if (nodeDef && playerCredits >= nodeDef.cost && playerRP >= (nodeDef.rpCost || 0)) {
            IRON.startResearch('blue', rid);
            IRON.addLog('Started researching ' + IRON.RESEARCH_TREE[rid].name, 'research');
            IRON.updateResources();
            _buildResearchContent();
          } else {
            IRON.showNotification('INSUFFICIENT RESOURCES', 1500);
          }
        }
      });
    }
  }

  // ---------------------------------------------------------------
  //  10. PRODUCTION PANEL
  // ---------------------------------------------------------------

  let productionPanel = $('productionPanel');
  if (!productionPanel) {
    productionPanel = document.createElement('div');
    productionPanel.id = 'productionPanel';
    productionPanel.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;z-index:150;' +
      'background:rgba(4,6,10,0.94);display:none;align-items:center;justify-content:center;' +
      'flex-direction:column;backdrop-filter:blur(8px);overflow-y:auto;';
    document.body.appendChild(productionPanel);
  }

  IRON.openProductionPanel = function () {
    _buildProductionContent();
    productionPanel.style.display = 'flex';
  };

  IRON.closeProductionPanel = function () {
    productionPanel.style.display = 'none';
  };

  IRON.updateProductionPanel = function () {
    if (productionPanel.style.display !== 'none') {
      _buildProductionContent();
    }
  };

  function _buildProductionContent() {
    const st = IRON.state;
    const team = 'blue';
    const teamSt = st.blue || {};
    const credits = teamSt.credits || 0;
    const types = IRON.UNIT_TYPES;

    let html = '<div style="width:90%;max-width:1000px;padding:30px 0;">';

    // Header
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">';
    html += '<div style="font-family:Orbitron,monospace;font-size:22px;font-weight:800;color:#00ff88;letter-spacing:4px;">PRODUCTION</div>';
    html += '<div style="font-family:Share Tech Mono,monospace;font-size:14px;color:#ffcc00;">\u2605 ' + credits + ' CREDITS</div>';
    html += '<button id="closeProduction" style="font-family:Orbitron,monospace;font-size:12px;font-weight:700;' +
      'padding:8px 20px;border:1px solid rgba(255,51,85,0.5);background:rgba(255,51,85,0.1);color:#ff3355;' +
      'cursor:pointer;letter-spacing:2px;">CLOSE</button>';
    html += '</div>';

    // Unit grid
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:24px;">';

    for (const key in types) {
      const ut = types[key];
      const canBuild = IRON.canBuild(team, key);
      const affordable = credits >= ut.cost;

      // Determine availability state
      const available = IRON.STARTING_UNITS.indexOf(key) !== -1 || canBuild;
      let borderColor, bg, opacity, statusLabel;

      if (!available && !canBuild) {
        borderColor = 'rgba(255,255,255,0.08)';
        bg = 'rgba(255,255,255,0.01)';
        opacity = '0.4';
        statusLabel = '<div style="font-family:Orbitron,monospace;font-size:8px;color:#ff3355;letter-spacing:1px;margin-top:8px;">LOCKED - RESEARCH REQUIRED</div>';
      } else if (!affordable) {
        borderColor = 'rgba(255,170,0,0.3)';
        bg = 'rgba(255,255,255,0.02)';
        opacity = '0.7';
        statusLabel = '';
      } else {
        borderColor = 'rgba(0,255,136,0.3)';
        bg = 'rgba(0,255,136,0.04)';
        opacity = '1';
        statusLabel = '';
      }

      html += '<div style="border:1px solid ' + borderColor + ';background:' + bg + ';border-radius:6px;' +
        'padding:14px;opacity:' + opacity + ';transition:all 0.3s;">';

      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
      html += '<span style="font-size:28px;">' + ut.icon + '</span>';
      html += '<div>';
      html += '<div style="font-family:Orbitron,monospace;font-size:12px;font-weight:700;color:#eef4ff;letter-spacing:1px;">' +
        ut.name.toUpperCase() + '</div>';
      html += '<div style="font-family:Share Tech Mono,monospace;font-size:9px;color:rgba(200,216,232,0.5);letter-spacing:1px;">' +
        ut.type + '</div>';
      html += '</div>';
      html += '</div>';

      // Stats
      html += '<div style="font-family:Share Tech Mono,monospace;font-size:10px;display:flex;gap:10px;margin-bottom:6px;flex-wrap:wrap;">';
      html += '<span style="color:#00ff88;">HP:' + ut.hp + '</span>';
      html += '<span style="color:#ff6644;">ATK:' + ut.atk + '</span>';
      html += '<span style="color:#4488ff;">DEF:' + ut.def + '</span>';
      html += '</div>';

      // Cost & build time
      html += '<div style="font-family:Share Tech Mono,monospace;font-size:10px;display:flex;gap:12px;margin-bottom:6px;">';
      html += '<span style="color:#ffcc00;">\u2605 ' + ut.cost + '</span>';
      html += '<span style="color:#aaa;">' + ut.buildTime + ' turn' + (ut.buildTime > 1 ? 's' : '') + '</span>';
      html += '</div>';

      // Description
      html += '<div style="font-family:Share Tech Mono,monospace;font-size:9px;color:rgba(200,216,232,0.5);margin-bottom:8px;">' +
        ut.desc + '</div>';

      // Action
      if (!available && !canBuild) {
        html += statusLabel;
      } else if (!affordable) {
        html += '<button disabled style="font-family:Orbitron,monospace;font-size:9px;font-weight:600;' +
          'padding:6px 16px;border:1px solid rgba(255,170,0,0.3);background:rgba(255,170,0,0.05);' +
          'color:rgba(255,170,0,0.5);cursor:not-allowed;letter-spacing:1px;width:100%;">INSUFFICIENT CREDITS</button>';
      } else {
        html += '<button class="prod-build-btn" data-utype="' + key + '" style="font-family:Orbitron,monospace;font-size:10px;font-weight:700;' +
          'padding:6px 16px;border:1px solid rgba(0,255,136,0.5);background:rgba(0,255,136,0.1);' +
          'color:#00ff88;cursor:pointer;letter-spacing:2px;width:100%;transition:all 0.2s;"' +
          ' onmouseover="this.style.background=\'rgba(0,255,136,0.25)\'" onmouseout="this.style.background=\'rgba(0,255,136,0.1)\'">BUILD</button>';
      }

      html += '</div>';
    }

    html += '</div>'; // grid

    // Build queue
    html += '<div style="border-top:1px solid rgba(0,255,136,0.15);padding-top:16px;">';
    html += '<div style="font-family:Orbitron,monospace;font-size:12px;font-weight:700;color:#00ff88;letter-spacing:2px;margin-bottom:10px;">BUILD QUEUE</div>';
    html += '<div style="display:flex;gap:12px;">';

    const queue = teamSt.buildQueue || [];
    for (let s = 0; s < 3; s++) {
      const item = queue[s];
      if (item) {
        const ud = types[item.unitType] || {};
        html += '<div style="width:160px;border:1px solid rgba(0,255,136,0.3);border-radius:6px;padding:10px;' +
          'background:rgba(0,255,136,0.04);text-align:center;">';
        html += '<div style="font-size:24px;margin-bottom:4px;">' + (ud.icon || '?') + '</div>';
        html += '<div style="font-family:Orbitron,monospace;font-size:10px;color:#eef4ff;letter-spacing:1px;">' +
          (ud.name || item.unitType).toUpperCase() + '</div>';
        html += '<div style="font-family:Share Tech Mono,monospace;font-size:10px;color:#ffaa00;margin-top:4px;">' +
          (item.turnsLeft || '?') + ' TURNS LEFT</div>';
        html += '</div>';
      } else {
        html += '<div style="width:160px;border:1px dashed rgba(255,255,255,0.08);border-radius:6px;padding:10px;' +
          'text-align:center;color:rgba(255,255,255,0.15);font-family:Share Tech Mono,monospace;font-size:10px;">' +
          'EMPTY SLOT</div>';
      }
    }

    html += '</div>'; // queue flex
    html += '</div>'; // queue section
    html += '</div>'; // wrapper

    productionPanel.innerHTML = html;

    // Close button
    var closeBtn = productionPanel.querySelector('#closeProduction');
    if (closeBtn) {
      closeBtn.addEventListener('click', IRON.closeProductionPanel);
    }

    // Build buttons
    var buildBtns = productionPanel.querySelectorAll('.prod-build-btn');
    for (var i = 0; i < buildBtns.length; i++) {
      buildBtns[i].addEventListener('click', function () {
        var utype = this.getAttribute('data-utype');
        if (IRON.canBuild(team, utype)) {
          IRON.startBuild(team, utype);
          IRON.addLog('Started building ' + (IRON.UNIT_TYPES[utype].name || utype), 'production');
          IRON.updateResources();
          _buildProductionContent();
        }
      });
    }
  }

  // ---------------------------------------------------------------
  //  11. TURN CHANGE UI
  // ---------------------------------------------------------------
  IRON.showTurnChange = function (team) {
    DOM.turnNum.textContent = 'TURN ' + IRON.state.turn;

    var label = _currentTeamLabel(team);

    if (IRON.SETTINGS && IRON.SETTINGS.multiplayer) {
      // Hot-seat multiplayer
      var mpColor = team === 'blue' ? 'blue' : 'red';
      DOM.currentPlayer.textContent = label + ' TURN';
      DOM.currentPlayer.className = 'current-player ' + mpColor;
      IRON.showNotification(label + ' TURN', 1800);
    } else {
      if (team === 'blue') {
        DOM.currentPlayer.textContent = 'YOUR TURN';
        DOM.currentPlayer.className = 'current-player blue';
        IRON.showNotification('YOUR TURN', 1800);
      } else {
        DOM.currentPlayer.textContent = 'ENEMY TURN';
        DOM.currentPlayer.className = 'current-player red';
        IRON.showNotification('ENEMY TURN', 1200);
      }
    }

    DOM.btnEndTurn.disabled = !_isPlayerTeam(team);
  };

  // ---------------------------------------------------------------
  //  12. GAME OVER UI
  // ---------------------------------------------------------------
  IRON.showGameOver = function (winner) {
    const st = IRON.state;

    if (IRON.SETTINGS && IRON.SETTINGS.multiplayer) {
      var winLabel = winner === 'blue' ? 'PLAYER 1' : 'PLAYER 2';
      DOM.gameOverTitle.textContent = winLabel + ' WINS';
      DOM.gameOverTitle.className = winner === 'blue' ? 'victory' : 'defeat';
      DOM.gameOverSubtitle.textContent = winLabel + ' HAS ACHIEVED VICTORY';
    } else {
      if (winner === 'blue') {
        DOM.gameOverTitle.textContent = 'VICTORY';
        DOM.gameOverTitle.className = 'victory';
        DOM.gameOverSubtitle.textContent = 'ALL ENEMY FORCES ELIMINATED';
      } else {
        DOM.gameOverTitle.textContent = 'DEFEAT';
        DOM.gameOverTitle.className = 'defeat';
        DOM.gameOverSubtitle.textContent = 'YOUR FORCES HAVE BEEN DESTROYED';
      }
    }

    // Calculate stats
    const turnsPlayed = st.turn || 1;
    const blueKilled  = st.units ? st.units.filter(function (u) { return u.team === 'blue' && u.isDead; }).length : 0;
    const redKilled   = st.units ? st.units.filter(function (u) { return u.team === 'red' && u.isDead; }).length : 0;

    // Insert stats before restart button if not already present
    let statsEl = DOM.gameOverScreen.querySelector('.gameover-stats');
    if (!statsEl) {
      statsEl = document.createElement('div');
      statsEl.className = 'gameover-stats';
      statsEl.style.cssText =
        'font-family:Share Tech Mono,monospace;font-size:14px;color:rgba(200,216,232,0.7);' +
        'margin-bottom:30px;text-align:center;line-height:2;';
      const restartBtn = DOM.gameOverScreen.querySelector('.restart-btn');
      DOM.gameOverScreen.insertBefore(statsEl, restartBtn);
    }
    statsEl.innerHTML =
      'TURNS PLAYED: <span style="color:#ffcc00;">' + turnsPlayed + '</span><br>' +
      'UNITS LOST: <span style="color:#ff3355;">' + blueKilled + '</span><br>' +
      'ENEMIES DESTROYED: <span style="color:#00ff88;">' + redKilled + '</span>';

    DOM.gameOverScreen.classList.add('show');
  };

  // ---------------------------------------------------------------
  //  13. WEATHER HUD
  // ---------------------------------------------------------------
  IRON.updateWeatherHUD = function () {
    if (!DOM.weatherIndicator) return;
    var weather = IRON.state.weather;
    if (!weather) {
      DOM.weatherIndicator.style.display = 'none';
      return;
    }

    // weather can be an object or string id
    var wd = null;
    if (typeof weather === 'object') {
      wd = weather;
    } else if (typeof weather === 'string' && IRON.WEATHER_TYPES) {
      for (var i = 0; i < IRON.WEATHER_TYPES.length; i++) {
        if (IRON.WEATHER_TYPES[i].id === weather) {
          wd = IRON.WEATHER_TYPES[i];
          break;
        }
      }
    }

    if (!wd) {
      DOM.weatherIndicator.style.display = 'none';
      return;
    }

    DOM.weatherIndicator.style.display = '';
    DOM.weatherIndicator.innerHTML =
      '<span style="font-size:16px;margin-right:6px;">' + (wd.icon || '') + '</span>' +
      '<span style="font-family:Orbitron,monospace;font-size:10px;font-weight:700;color:#eef4ff;letter-spacing:1px;">' +
      wd.name.toUpperCase() + '</span>';
  };

  // ---------------------------------------------------------------
  //  14. OBJECTIVE DISPLAY
  // ---------------------------------------------------------------
  IRON.showObjective = function (objective) {
    if (!DOM.objectiveBanner) return;
    if (!objective) { IRON.hideObjective(); return; }

    var icon = objective.icon || '';
    var text = objective.text || '';

    DOM.objectiveBanner.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:18px;">' + icon + '</span>' +
        '<span style="font-family:Share Tech Mono,monospace;font-size:12px;color:#eef4ff;">' + text + '</span>' +
      '</div>';
    DOM.objectiveBanner.style.display = '';
    IRON.addLog(text, 'objective');
  };

  IRON.hideObjective = function () {
    if (!DOM.objectiveBanner) return;
    DOM.objectiveBanner.style.display = 'none';
  };

  IRON.updateObjectiveDisplay = function () {
    if (!DOM.objectiveBanner) return;
    var objectives = IRON.state.objectives;
    if (!objectives || objectives.length === 0) {
      IRON.hideObjective();
      return;
    }
    // Show the most recent active objective
    var active = null;
    for (var i = objectives.length - 1; i >= 0; i--) {
      if (!objectives[i].completed && !objectives[i].expired) {
        active = objectives[i];
        break;
      }
    }
    if (active) {
      IRON.showObjective(active);
    } else {
      IRON.hideObjective();
    }
  };

  // ---------------------------------------------------------------
  //  15. KEYBOARD INPUT
  // ---------------------------------------------------------------
  if (!IRON.camState) {
    IRON.camState = { keys: {} };
  }

  window.addEventListener('keydown', function (e) {
    IRON.camState.keys[e.key.toLowerCase()] = true;

    // Don't process shortcuts if typing in input
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

    // ESC: deselect / close panels
    if (e.key === 'Escape') {
      if (researchPanel.style.display !== 'none') {
        IRON.closeResearchPanel();
      } else if (productionPanel.style.display !== 'none') {
        IRON.closeProductionPanel();
      } else if (_commanderPanelOpen) {
        _closeCommanderPanel();
      } else {
        IRON.deselectUnit();
      }
    }

    // R: open research
    if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
      if (researchPanel.style.display !== 'none') {
        IRON.closeResearchPanel();
      } else {
        IRON.openResearchPanel();
      }
    }

    // P: open production
    if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) {
      if (productionPanel.style.display !== 'none') {
        IRON.closeProductionPanel();
      } else {
        IRON.openProductionPanel();
      }
    }

    // Space: end turn
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (_isPlayerTeam(IRON.state.currentTeam) && IRON.state.phase !== 'gameover') {
        IRON.deselectUnit();
        IRON.endTurn();
      }
    }

    // F: use ability
    if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) {
      if (DOM.btnAbility && DOM.btnAbility.style.display !== 'none' && !DOM.btnAbility.disabled) {
        DOM.btnAbility.click();
      }
    }

    // M: merge
    if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey) {
      if (DOM.btnMerge && DOM.btnMerge.style.display !== 'none' && !DOM.btnMerge.disabled) {
        DOM.btnMerge.click();
      }
    }

    // T: toggle stealth
    if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey) {
      if (DOM.btnStealth && DOM.btnStealth.style.display !== 'none' && !DOM.btnStealth.disabled) {
        DOM.btnStealth.click();
      }
    }
  });

  window.addEventListener('keyup', function (e) {
    IRON.camState.keys[e.key.toLowerCase()] = false;
  });

  // ---------------------------------------------------------------
  //  16. MOUSE INPUT (Camera Controls)
  // ---------------------------------------------------------------
  let _rmb = false;
  let _rmbStartX = 0;
  let _rmbStartY = 0;

  DOM.canvas.addEventListener('mousedown', function (e) {
    if (e.button === 2) {
      _rmb = true;
      _rmbStartX = e.clientX;
      _rmbStartY = e.clientY;
    }
  });

  window.addEventListener('mousemove', function (e) {
    if (_rmb) {
      const dx = e.clientX - _rmbStartX;
      const dy = e.clientY - _rmbStartY;
      _rmbStartX = e.clientX;
      _rmbStartY = e.clientY;

      if (IRON.camState) {
        IRON.camState.rotDeltaX = (IRON.camState.rotDeltaX || 0) + dx * 0.005;
        IRON.camState.rotDeltaY = (IRON.camState.rotDeltaY || 0) + dy * 0.005;
      }
    }
  });

  window.addEventListener('mouseup', function (e) {
    if (e.button === 2) {
      _rmb = false;
    }
  });

  // Mouse wheel: zoom
  DOM.canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (IRON.camState) {
      IRON.camState.zoomDelta = (IRON.camState.zoomDelta || 0) + e.deltaY * 0.01;
    }
  }, { passive: false });

  // Prevent context menu
  DOM.canvas.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

})();
