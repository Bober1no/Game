// ===================================================================
//  IRONFRONT v4.0 — MAIN INITIALIZATION & GAME LOOP
// ===================================================================

(function() {
  let time = 0;

  // -----------------------------------------------------------------
  //  SETTINGS — populated from main menu before game starts
  // -----------------------------------------------------------------
  // Ensure SETTINGS exists (may already be set by inline menu script)
  if (!IRON.SETTINGS) {
    IRON.SETTINGS = {
      gameMode:    'CLASSIC',
      difficulty:  'normal',
      multiplayer: false
    };
  }

  // -----------------------------------------------------------------
  //  MAIN ANIMATION LOOP
  // -----------------------------------------------------------------
  function animate() {
    requestAnimationFrame(animate);
    time += 0.016;

    IRON.updateCamera();
    IRON.animateScene(time);

    // Fog of War updates (every frame when active)
    if (IRON.SETTINGS.gameMode !== 'CLASSIC'
        && IRON.state.fogOfWar
        && typeof IRON.updateFogOfWar === 'function') {
      IRON.updateFogOfWar();
    }

    // Weather visual updates (every frame when active)
    if (IRON.state.weatherActive
        && typeof IRON.updateWeatherVisuals === 'function') {
      IRON.updateWeatherVisuals();
    }

    // Update minimap every ~0.5 seconds
    if (Math.floor(time * 60) % 30 === 0) {
      IRON.updateMinimap(IRON.state.grid, IRON.state.units);
    }

    IRON.renderer.render(IRON.scene, IRON.camera);
  }

  // -----------------------------------------------------------------
  //  LOADING SEQUENCE
  // -----------------------------------------------------------------
  function init() {
    const bar = document.getElementById('loadingBar');
    const txt = document.getElementById('loadingText');
    const mode = IRON.SETTINGS.gameMode;

    // Derive active-system flags from the chosen game mode
    const fogActive       = (mode === 'FOG' || mode === 'WARFARE');
    const weatherActive   = (mode === 'WARFARE');
    const objectivesActive = (mode === 'WARFARE');
    const supplyActive    = (mode === 'WARFARE');

    // Sync settings to state so engine modules can check at runtime
    IRON.state.settings = {
      gameMode: mode,
      difficulty: IRON.SETTINGS.difficulty,
      multiplayer: IRON.SETTINGS.multiplayer,
    };
    IRON.state.fogOfWar        = fogActive;
    IRON.state.weatherActive   = weatherActive;
    IRON.state.objectivesActive = objectivesActive;
    IRON.state.supplyActive    = supplyActive;

    // ------ loading steps ------
    const steps = [
      // 1
      { text: 'INITIALIZING RENDER ENGINE...', pct: 10, fn: function() {
        IRON.initRenderer();
      }},
      // 2
      { text: 'INITIALIZING COMBAT SYSTEMS...', pct: 20, fn: function() {
        if (typeof IRON.initSystems === 'function') {
          IRON.initSystems();
        }
      }},
      // 3
      { text: 'GENERATING TERRAIN...', pct: 40, fn: function() {
        IRON.generateMap();
      }},
      // 4
      { text: 'DEPLOYING FORCES...', pct: 55, fn: function() {
        IRON.placeInitialUnits();
      }},
      // 5
      { text: 'CALIBRATING WEATHER SYSTEMS...', pct: 65, fn: function() {
        if (weatherActive && typeof IRON.initWeather === 'function') {
          IRON.initWeather();
        }
      }},
      // 6
      { text: 'ESTABLISHING FOG OF WAR...', pct: 72, fn: function() {
        if (fogActive && typeof IRON.initFogOfWar === 'function') {
          IRON.initFogOfWar();
        }
      }},
      // 7
      { text: 'SPAWNING INITIAL OBJECTIVES...', pct: 78, fn: function() {
        if (objectivesActive && typeof IRON.spawnObjective === 'function') {
          IRON.spawnObjective();
        }
      }},
      // 8
      { text: 'CALIBRATING AI SYSTEMS...', pct: 82, fn: function() {
        if (typeof IRON.applyDifficultyModifiers === 'function') {
          IRON.applyDifficultyModifiers(IRON.SETTINGS.difficulty);
        }
      }},
      // 9
      { text: 'ESTABLISHING COMMS...', pct: 90, fn: function() {
        IRON.updateScores();
        IRON.updateResources();
        IRON.updateMinimap(IRON.state.grid, IRON.state.units);
        if (typeof IRON.updateWeatherHUD === 'function') {
          IRON.updateWeatherHUD();
        }
      }},
      // 10
      { text: 'SETTING UP INPUT...', pct: 95, fn: function() {
        window.addEventListener('resize', function() {
          IRON.camera.aspect = window.innerWidth / window.innerHeight;
          IRON.camera.updateProjectionMatrix();
          IRON.renderer.setSize(window.innerWidth, window.innerHeight);
        });
      }},
      // 11
      { text: 'BATTLE READY', pct: 100, fn: function() {} }
    ];

    let i = 0;
    function step() {
      if (i >= steps.length) {
        setTimeout(function() {
          document.getElementById('loadingScreen').classList.add('hidden');
          animate();

          // --- Mode-specific notification ---
          if (mode === 'WARFARE') {
            IRON.showNotification('ALL SYSTEMS ACTIVE \u2014 TOTAL WARFARE', 2500);
          } else if (mode === 'FOG') {
            IRON.showNotification('VISIBILITY LIMITED \u2014 SCOUT AHEAD', 2500);
          } else {
            IRON.showNotification('DEPLOY YOUR FORCES', 2500);
          }

          // --- Common log entries ---
          IRON.addLog('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'info');
          IRON.addLog('IRONFRONT v4.0 \u2014 TACTICAL WARFARE', 'info');
          IRON.addLog('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550', 'info');
          IRON.addLog('Turn 1: Commander, your forces are ready.', 'info');
          IRON.addLog('Credits: ' + IRON.state.blue.credits + ' | Income: ' + IRON.state.blue.income + '/turn', 'info');

          // --- Mode-specific log entries ---
          if (mode === 'FOG') {
            IRON.addLog('Fog of War active. Vision is limited.', 'warning');
          }
          if (mode === 'WARFARE') {
            IRON.addLog('Weather system online. Supply lines matter. Watch for objectives.', 'warning');
          }

          IRON.addLog('Capture Supply Depots for extra income.', 'info');
          IRON.addLog('Research new tech with [R] key.', 'info');
          IRON.addLog('Build new units with [P] key.', 'info');
        }, 600);
        return;
      }

      txt.textContent = steps[i].text;
      bar.style.width = steps[i].pct + '%';

      try {
        console.log('[INIT] Step ' + (i+1) + '/' + steps.length + ': ' + steps[i].text);
        steps[i].fn();
      } catch(e) {
        console.error('[INIT] Step FAILED:', steps[i].text, e);
      }

      i++;
      setTimeout(step, 350 + Math.random() * 150);
    }

    step();
  }

  // -----------------------------------------------------------------
  //  MAIN MENU INTERACTIVITY
  // -----------------------------------------------------------------

  // Helper: toggle 'selected' class among siblings sharing an attribute
  function setupToggleGroup(selector, attribute) {
    var buttons = document.querySelectorAll(selector);
    buttons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        buttons.forEach(function(b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
      });
    });
  }

  // Mode buttons  (data-mode)
  setupToggleGroup('[data-mode]', 'data-mode');

  // Difficulty & multiplayer toggle handled by inline onclick in index.html

  // DEPLOY button
  var btnDeploy = document.getElementById('btnDeploy');
  if (btnDeploy) {
    btnDeploy.addEventListener('click', function() {
      IRON.startGame();
    });
  }

  // -----------------------------------------------------------------
  //  IRON.startGame — called from DEPLOY button
  // -----------------------------------------------------------------
  IRON.startGame = function() {
    console.log('[GAME] startGame called');
    // 1. Read game-mode selection
    var modeBtn = document.querySelector('[data-mode].selected');
    var modeMap = { classic: 'CLASSIC', fog: 'FOG', total: 'WARFARE' };
    var rawMode = modeBtn ? modeBtn.getAttribute('data-mode') : 'classic';
    IRON.SETTINGS.gameMode = modeMap[rawMode] || 'CLASSIC';

    // 2. Read difficulty selection
    var diffBtn = document.querySelector('[data-difficulty].active');
    IRON.SETTINGS.difficulty = diffBtn ? diffBtn.getAttribute('data-difficulty') : 'normal';

    // 3. Read multiplayer toggle
    var mpBtn = document.querySelector('[data-mp].active');
    IRON.SETTINGS.multiplayer = mpBtn ? (mpBtn.getAttribute('data-mp') === 'hotseat') : false;

    // 4. Hide main menu
    var mainMenu = document.getElementById('mainMenu');
    if (mainMenu) {
      mainMenu.style.display = 'none';
    }

    // 5. Show loading screen
    var loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      loadingScreen.classList.remove('hidden');
      loadingScreen.style.display = '';
    }

    // 6. Run loading / init sequence
    init();
  };

  // -----------------------------------------------------------------
  //  Do NOT auto-start — wait for main menu DEPLOY button
  // -----------------------------------------------------------------
})();
