// ============================================================================
// IRONFRONT v4.0 - systems.js
// Visual effects, fog of war, weather, status effects, ability visuals
// Runs AFTER engine.js, BEFORE ai.js
// ============================================================================

(function () {
  "use strict";

  const T = IRON.TILE_SIZE;   // 2
  const GW = IRON.GRID_W;     // 24
  const GH = IRON.GRID_H;     // 18
  const TH = IRON.TILE_HEIGHT; // 0.3

  // ---- Shared geometry / material pools (reuse for performance) ----

  const _planeGeo = new THREE.PlaneBufferGeometry(T, T);
  _planeGeo.rotateX(-Math.PI / 2);

  const _fogMatDark = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  const _fogMatExplored = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });

  const _particleGeo = new THREE.BufferGeometry();
  const PARTICLE_COUNT = 300;

  // ========================================================================
  // INIT
  // ========================================================================

  // These are initialized in initSystems(), NOT at load time
  // to avoid overwriting groups created by renderer.js
  IRON.weatherParticles = null;
  IRON.objectiveMarkers = [];

  IRON.initSystems = function () {
    // Groups — create only if not already set up by renderer
    if (!IRON.fogGroup) {
      IRON.fogGroup = new THREE.Group();
      IRON.fogGroup.name = "fogGroup";
      IRON.scene.add(IRON.fogGroup);
    }

    if (!IRON.weatherGroup) {
      IRON.weatherGroup = new THREE.Group();
      IRON.weatherGroup.name = "weatherGroup";
      IRON.scene.add(IRON.weatherGroup);
    }

    if (!IRON.effectGroup) {
      IRON.effectGroup = new THREE.Group();
      IRON.effectGroup.name = "effectGroup";
      IRON.scene.add(IRON.effectGroup);
    }

    if (!IRON.objectiveGroup) {
      IRON.objectiveGroup = new THREE.Group();
      IRON.objectiveGroup.name = "objectiveGroup";
      IRON.scene.add(IRON.objectiveGroup);
    }

    // Explored state per team
    if (!IRON.state.explored) {
      IRON.state.explored = { blue: {}, red: {} };
    }

    // Fog meshes pool (indexed by "x,z")
    IRON._fogMeshes = {};

    // Init weather particle system
    _initWeatherParticles();

    // Track previous weather so we can detect changes
    IRON._prevWeather = (IRON.state.weather && IRON.state.weather.current) ? IRON.state.weather.current.id : "clear";
  };

  // ========================================================================
  // 1. FOG OF WAR RENDERING
  // ========================================================================

  IRON.updateFogOfWar = function () {
    if (!IRON.state.fogOfWar) return;

    var viewingTeam = IRON.state.viewingTeam || "blue";
    var explored = IRON.state.explored[viewingTeam];
    if (!explored) {
      IRON.state.explored[viewingTeam] = {};
      explored = IRON.state.explored[viewingTeam];
    }

    // Build set of currently visible tile keys
    var visibleSet = {};
    var units = IRON.state.units || [];
    for (var u = 0; u < units.length; u++) {
      var unit = units[u];
      if (unit.team !== viewingTeam || unit.isDead) continue;
      var sight = (unit.typeData && unit.typeData.vision) || 3;
      var ux = unit.x;
      var uz = unit.z;
      for (var dx = -sight; dx <= sight; dx++) {
        for (var dz = -sight; dz <= sight; dz++) {
          if (dx * dx + dz * dz > sight * sight) continue;
          var tx = ux + dx;
          var tz = uz + dz;
          if (tx < 0 || tx >= GW || tz < 0 || tz >= GH) continue;
          var key = tx + "," + tz;
          visibleSet[key] = true;
          explored[key] = true;
        }
      }
    }

    // Update fog meshes for each tile
    for (var x = 0; x < GW; x++) {
      for (var z = 0; z < GH; z++) {
        var key = x + "," + z;
        var visible = !!visibleSet[key];
        var wasExplored = !!explored[key];
        var mesh = IRON._fogMeshes[key];

        if (visible) {
          // Tile is visible - no overlay
          if (mesh) mesh.visible = false;
        } else if (wasExplored) {
          // Previously explored but not currently visible
          if (!mesh) {
            mesh = _createFogMesh(x, z);
            IRON._fogMeshes[key] = mesh;
            IRON.fogGroup.add(mesh);
          }
          mesh.material = _fogMatExplored;
          mesh.visible = true;
        } else {
          // Unexplored
          if (!mesh) {
            mesh = _createFogMesh(x, z);
            IRON._fogMeshes[key] = mesh;
            IRON.fogGroup.add(mesh);
          }
          mesh.material = _fogMatDark;
          mesh.visible = true;
        }
      }
    }

    // Hide/show enemy units based on visibility
    for (var u = 0; u < units.length; u++) {
      var unit = units[u];
      if (!unit.mesh) continue;
      if (unit.team === viewingTeam) {
        unit.mesh.visible = !unit.isDead;
      } else {
        var ukey = unit.x + "," + unit.z;
        unit.mesh.visible = !unit.isDead && !!visibleSet[ukey];
      }
    }
  };

  function _createFogMesh(x, z) {
    var mesh = new THREE.Mesh(_planeGeo, _fogMatDark);
    mesh.position.set(x * T + T / 2, TH + 0.05, z * T + T / 2);
    mesh.renderOrder = 900;
    return mesh;
  }

  // ========================================================================
  // 2. WEATHER VISUAL EFFECTS
  // ========================================================================

  function _initWeatherParticles() {
    var positions = new Float32Array(PARTICLE_COUNT * 3);
    var velocities = new Float32Array(PARTICLE_COUNT * 3);
    var colors = new Float32Array(PARTICLE_COUNT * 3);

    for (var i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = Math.random() * GW * T;
      positions[i * 3 + 1] = Math.random() * 20 + 2;
      positions[i * 3 + 2] = Math.random() * GH * T;
      velocities[i * 3] = 0;
      velocities[i * 3 + 1] = 0;
      velocities[i * 3 + 2] = 0;
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    var mat = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });

    IRON.weatherParticles = new THREE.Points(geo, mat);
    IRON.weatherParticles.visible = false;
    IRON.weatherGroup.add(IRON.weatherParticles);

    // Store velocities for update loop
    IRON._weatherVelocities = velocities;
    IRON._lightningTimer = 0;
  }

  IRON.updateWeatherVisuals = function (dt) {
    if (!dt) dt = 0.016;
    var weatherObj = IRON.state.weather ? IRON.state.weather.current : null;
    var weather = weatherObj ? (weatherObj.id || "clear") : "clear";

    // Detect weather change
    if (weather !== IRON._prevWeather) {
      IRON._prevWeather = weather;
      if (IRON.onWeatherChange) IRON.onWeatherChange(weather);
      _transitionWeather(weather);
    }

    if (weather === "clear") {
      IRON.weatherParticles.visible = false;
      if (IRON.scene.fog) {
        IRON.scene.fog.far = _lerp(IRON.scene.fog.far, 200, dt * 2);
      }
      return;
    }

    IRON.weatherParticles.visible = true;
    var posAttr = IRON.weatherParticles.geometry.getAttribute("position");
    var pos = posAttr.array;
    var vel = IRON._weatherVelocities;
    var colAttr = IRON.weatherParticles.geometry.getAttribute("color");
    var cols = colAttr.array;

    var maxX = GW * T;
    var maxZ = GH * T;

    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var i3 = i * 3;

      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;

      // Wrap particles that go out of bounds
      if (pos[i3 + 1] < 0) {
        pos[i3 + 1] = 18 + Math.random() * 5;
        pos[i3] = Math.random() * maxX;
        pos[i3 + 2] = Math.random() * maxZ;
      }
      if (pos[i3] < 0) pos[i3] += maxX;
      if (pos[i3] > maxX) pos[i3] -= maxX;
      if (pos[i3 + 2] < 0) pos[i3 + 2] += maxZ;
      if (pos[i3 + 2] > maxZ) pos[i3 + 2] -= maxZ;
    }

    posAttr.needsUpdate = true;

    // Scene fog density per weather
    if (IRON.scene.fog) {
      var targetFar = 200;
      if (weather === "rain") targetFar = 80;
      else if (weather === "fog") targetFar = 30;
      else if (weather === "storm") targetFar = 60;
      else if (weather === "sandstorm") targetFar = 40;
      IRON.scene.fog.far = _lerp(IRON.scene.fog.far, targetFar, dt * 2);
    }

    // Lightning for storm
    if (weather === "storm") {
      IRON._lightningTimer -= dt;
      if (IRON._lightningTimer <= 0) {
        _flashLightning();
        IRON._lightningTimer = 3 + Math.random() * 7;
      }
    }
  };

  function _transitionWeather(weather) {
    var vel = IRON._weatherVelocities;
    var colAttr = IRON.weatherParticles.geometry.getAttribute("color");
    var cols = colAttr.array;

    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var i3 = i * 3;
      switch (weather) {
        case "rain":
          vel[i3] = (Math.random() - 0.5) * 0.5;
          vel[i3 + 1] = -(8 + Math.random() * 4);
          vel[i3 + 2] = (Math.random() - 0.5) * 0.5;
          cols[i3] = 0.4; cols[i3 + 1] = 0.5; cols[i3 + 2] = 0.9;
          break;
        case "fog":
          vel[i3] = (Math.random() - 0.5) * 1.0;
          vel[i3 + 1] = (Math.random() - 0.5) * 0.3;
          vel[i3 + 2] = (Math.random() - 0.5) * 1.0;
          cols[i3] = 0.85; cols[i3 + 1] = 0.85; cols[i3 + 2] = 0.9;
          break;
        case "storm":
          vel[i3] = (Math.random() - 0.5) * 3;
          vel[i3 + 1] = -(12 + Math.random() * 6);
          vel[i3 + 2] = (Math.random() - 0.5) * 3;
          cols[i3] = 0.3; cols[i3 + 1] = 0.4; cols[i3 + 2] = 0.85;
          break;
        case "sandstorm":
          vel[i3] = 6 + Math.random() * 4;
          vel[i3 + 1] = (Math.random() - 0.5) * 1.5;
          vel[i3 + 2] = (Math.random() - 0.5) * 2;
          cols[i3] = 0.8; cols[i3 + 1] = 0.65; cols[i3 + 2] = 0.3;
          break;
        default:
          vel[i3] = 0; vel[i3 + 1] = 0; vel[i3 + 2] = 0;
          break;
      }
    }
    colAttr.needsUpdate = true;

    // Update particle material size
    if (weather === "fog") {
      IRON.weatherParticles.material.size = 0.4;
      IRON.weatherParticles.material.opacity = 0.4;
    } else if (weather === "sandstorm") {
      IRON.weatherParticles.material.size = 0.25;
      IRON.weatherParticles.material.opacity = 0.8;
    } else {
      IRON.weatherParticles.material.size = 0.15;
      IRON.weatherParticles.material.opacity = 0.7;
    }
  }

  function _flashLightning() {
    var ambientLights = [];
    IRON.scene.traverse(function (obj) {
      if (obj.isAmbientLight) ambientLights.push(obj);
    });
    if (ambientLights.length === 0) return;

    var light = ambientLights[0];
    var origIntensity = light.intensity;
    light.intensity = origIntensity * 4;

    setTimeout(function () {
      light.intensity = origIntensity;
    }, 80);
    setTimeout(function () {
      light.intensity = origIntensity * 2.5;
      setTimeout(function () {
        light.intensity = origIntensity;
      }, 50);
    }, 150);
  }

  // ========================================================================
  // 3. STEALTH VISUAL
  // ========================================================================

  IRON.setUnitStealth = function (unit, stealthed) {
    if (!unit || !unit.mesh) return;
    unit.stealthed = stealthed;

    if (stealthed) {
      unit.mesh.traverse(function (child) {
        if (child.isMesh && child.material) {
          var mat = child.material;
          if (!mat._origOpacity) mat._origOpacity = mat.opacity;
          mat.transparent = true;
          mat.opacity = 0.3;
        }
      });
      // Add shimmer effect
      if (!unit._shimmerEffect) {
        unit._shimmerEffect = _createShimmerEffect();
        unit.mesh.add(unit._shimmerEffect);
      }
      unit._shimmerEffect.visible = true;
    } else {
      unit.mesh.traverse(function (child) {
        if (child.isMesh && child.material) {
          var mat = child.material;
          if (mat._origOpacity !== undefined) {
            mat.opacity = mat._origOpacity;
            mat.transparent = mat._origOpacity < 1.0;
            delete mat._origOpacity;
          }
        }
      });
      if (unit._shimmerEffect) {
        unit._shimmerEffect.visible = false;
      }
    }
  };

  function _createShimmerEffect() {
    var geo = new THREE.RingBufferGeometry(0.3, 0.6, 16);
    var mat = new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    var ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;

    var group = new THREE.Group();
    group.name = "shimmerEffect";
    group.add(ring);

    // Store reference for animation
    group.userData.ring = ring;
    group.userData.time = 0;

    // Register for animation update
    if (!IRON._shimmerEffects) IRON._shimmerEffects = [];
    IRON._shimmerEffects.push(group);

    return group;
  }

  // Call in render loop to animate shimmers
  IRON.updateShimmerEffects = function (dt) {
    if (!IRON._shimmerEffects) return;
    for (var i = 0; i < IRON._shimmerEffects.length; i++) {
      var fx = IRON._shimmerEffects[i];
      if (!fx.visible) continue;
      fx.userData.time += dt || 0.016;
      var ring = fx.userData.ring;
      if (ring) {
        var s = 1.0 + 0.3 * Math.sin(fx.userData.time * 3.0);
        ring.scale.set(s, s, s);
        ring.material.opacity = 0.15 + 0.15 * Math.sin(fx.userData.time * 4.0);
      }
    }
  };

  // ========================================================================
  // 4. STATUS EFFECT VISUALS
  // ========================================================================

  IRON.showStatusEffectVisual = function (unit, effectType) {
    if (!unit || !unit.mesh) return;
    if (!unit._statusVisuals) unit._statusVisuals = {};
    if (unit._statusVisuals[effectType]) return; // Already showing

    var visual = null;

    switch (effectType) {
      case "burn":
        visual = _createBurnVisual();
        break;
      case "entrenched":
        visual = _createEntrenchedVisual();
        break;
      case "marked":
        visual = _createMarkedVisual();
        break;
      case "disabled":
        visual = _createDisabledVisual();
        break;
      case "suppressed":
        visual = _createSuppressedVisual();
        break;
      case "siege":
        visual = _createSiegeVisual();
        break;
      default:
        return;
    }

    if (visual) {
      visual.name = "status_" + effectType;
      unit.mesh.add(visual);
      unit._statusVisuals[effectType] = visual;
    }
  };

  IRON.clearStatusVisuals = function (unit) {
    if (!unit || !unit.mesh || !unit._statusVisuals) return;
    for (var key in unit._statusVisuals) {
      var vis = unit._statusVisuals[key];
      if (vis) {
        unit.mesh.remove(vis);
        _disposeGroup(vis);
      }
    }
    unit._statusVisuals = {};
  };

  function _createBurnVisual() {
    var group = new THREE.Group();
    var count = 20;
    var positions = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 0.6;
      positions[i * 3 + 1] = Math.random() * 1.0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    var mat = new THREE.PointsMaterial({
      color: 0xff6600,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    var points = new THREE.Points(geo, mat);
    group.add(points);
    group.userData.type = "burn";
    group.userData.particles = points;
    group.userData.time = 0;
    _registerStatusAnim(group);
    return group;
  }

  function _createEntrenchedVisual() {
    var group = new THREE.Group();
    var segments = 8;
    var radius = 0.55;
    for (var i = 0; i < segments; i++) {
      var angle = (i / segments) * Math.PI * 2;
      var bagGeo = new THREE.BoxBufferGeometry(0.25, 0.12, 0.15);
      var bagMat = new THREE.MeshLambertMaterial({ color: 0x8b7d5b });
      var bag = new THREE.Mesh(bagGeo, bagMat);
      bag.position.set(Math.cos(angle) * radius, 0.06, Math.sin(angle) * radius);
      bag.rotation.y = -angle;
      group.add(bag);
    }
    group.userData.type = "entrenched";
    return group;
  }

  function _createMarkedVisual() {
    var group = new THREE.Group();
    var ringGeo = new THREE.RingBufferGeometry(0.35, 0.45, 32);
    var ringMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    var ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 1.5;
    group.add(ring);

    // Crosshair lines
    var lineGeo = new THREE.BufferGeometry();
    var lineVerts = new Float32Array([
      -0.5, 1.5, 0, 0.5, 1.5, 0,
      0, 1.5, -0.5, 0, 1.5, 0.5,
    ]);
    lineGeo.setAttribute("position", new THREE.BufferAttribute(lineVerts, 3));
    var lineMat = new THREE.LineBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.6 });
    var lines = new THREE.LineSegments(lineGeo, lineMat);
    group.add(lines);

    group.userData.type = "marked";
    group.userData.ring = ring;
    group.userData.time = 0;
    _registerStatusAnim(group);
    return group;
  }

  function _createDisabledVisual() {
    var group = new THREE.Group();
    var count = 15;
    var positions = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 0.8;
      positions[i * 3 + 1] = Math.random() * 0.8 + 0.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    var mat = new THREE.PointsMaterial({
      color: 0x44aaff,
      size: 0.1,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    var points = new THREE.Points(geo, mat);
    group.add(points);
    group.userData.type = "disabled";
    group.userData.particles = points;
    group.userData.time = 0;
    _registerStatusAnim(group);
    return group;
  }

  function _createSuppressedVisual() {
    var group = new THREE.Group();
    // Warning triangle made from a simple cone + exclamation
    var coneGeo = new THREE.ConeBufferGeometry(0.15, 0.25, 3);
    var coneMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    var cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = 1.8;
    group.add(cone);

    // Exclamation mark
    var dotGeo = new THREE.SphereBufferGeometry(0.03, 8, 8);
    var dotMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    var dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(0, 1.72, 0.08);
    group.add(dot);

    var barGeo = new THREE.BoxBufferGeometry(0.03, 0.1, 0.03);
    var bar = new THREE.Mesh(barGeo, dotMat.clone());
    bar.position.set(0, 1.82, 0.08);
    group.add(bar);

    group.userData.type = "suppressed";
    return group;
  }

  function _createSiegeVisual() {
    var group = new THREE.Group();
    var glowGeo = new THREE.SphereBufferGeometry(0.8, 16, 16);
    var glowMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });
    var glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.y = 0.5;
    group.add(glow);
    group.userData.type = "siege";
    group.userData.glow = glow;
    group.userData.time = 0;
    _registerStatusAnim(group);
    return group;
  }

  // Status animation registry
  var _statusAnims = [];

  function _registerStatusAnim(group) {
    _statusAnims.push(group);
  }

  IRON.updateStatusEffects = function (dt) {
    if (!dt) dt = 0.016;
    for (var i = _statusAnims.length - 1; i >= 0; i--) {
      var g = _statusAnims[i];
      if (!g.parent) {
        _statusAnims.splice(i, 1);
        continue;
      }
      g.userData.time += dt;
      var t = g.userData.time;

      switch (g.userData.type) {
        case "burn":
          var pts = g.userData.particles;
          if (pts) {
            var pa = pts.geometry.getAttribute("position").array;
            for (var j = 0; j < pa.length; j += 3) {
              pa[j + 1] += dt * (1.5 + Math.random());
              if (pa[j + 1] > 1.2) {
                pa[j + 1] = 0;
                pa[j] = (Math.random() - 0.5) * 0.6;
                pa[j + 2] = (Math.random() - 0.5) * 0.6;
              }
            }
            pts.geometry.getAttribute("position").needsUpdate = true;
            pts.material.opacity = 0.5 + 0.3 * Math.sin(t * 5);
          }
          break;
        case "marked":
          if (g.userData.ring) {
            var s = 1.0 + 0.2 * Math.sin(t * 4);
            g.userData.ring.scale.set(s, s, 1);
            g.userData.ring.material.opacity = 0.4 + 0.3 * Math.sin(t * 3);
          }
          break;
        case "disabled":
          var pts2 = g.userData.particles;
          if (pts2) {
            var pa2 = pts2.geometry.getAttribute("position").array;
            for (var j2 = 0; j2 < pa2.length; j2 += 3) {
              pa2[j2] += (Math.random() - 0.5) * 0.15;
              pa2[j2 + 1] += (Math.random() - 0.5) * 0.15;
              pa2[j2 + 2] += (Math.random() - 0.5) * 0.15;
              // Keep loosely contained
              if (Math.abs(pa2[j2]) > 0.6) pa2[j2] *= 0.5;
              if (pa2[j2 + 1] > 1.2 || pa2[j2 + 1] < 0) pa2[j2 + 1] = Math.random() * 0.8 + 0.2;
              if (Math.abs(pa2[j2 + 2]) > 0.6) pa2[j2 + 2] *= 0.5;
            }
            pts2.geometry.getAttribute("position").needsUpdate = true;
          }
          break;
        case "siege":
          if (g.userData.glow) {
            var pulseS = 1.0 + 0.15 * Math.sin(t * 2);
            g.userData.glow.scale.set(pulseS, pulseS, pulseS);
            g.userData.glow.material.opacity = 0.1 + 0.08 * Math.sin(t * 2.5);
          }
          break;
      }
    }
  };

  // ========================================================================
  // 5. ABILITY EFFECT VISUALS
  // ========================================================================

  IRON.spawnAbilityEffect = function (type, x, z, radius) {
    if (!radius) radius = 1;
    var worldX = x * T + T / 2;
    var worldZ = z * T + T / 2;

    switch (type) {
      case "smoke":
        _spawnSmokeEffect(worldX, worldZ, radius);
        break;
      case "airstrike":
        _spawnAirstrikeEffect(worldX, worldZ, radius);
        break;
      case "emp":
        _spawnEMPEffect(worldX, worldZ, radius);
        break;
      case "rally":
        _spawnRallyEffect(worldX, worldZ);
        break;
      case "barrage":
        _spawnBarrageEffect(worldX, worldZ, radius);
        break;
      case "turret_spawn":
        _spawnTurretBuildEffect(worldX, worldZ);
        break;
    }
  };

  function _spawnSmokeEffect(wx, wz, radius) {
    var group = new THREE.Group();
    group.position.set(wx, TH + 0.1, wz);

    var count = 40;
    var positions = new Float32Array(count * 3);
    var vels = [];
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var r = Math.random() * radius * T * 0.5;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = Math.random() * 2;
      positions[i * 3 + 2] = Math.sin(angle) * r;
      vels.push({
        x: (Math.random() - 0.5) * 0.3,
        y: 0.2 + Math.random() * 0.3,
        z: (Math.random() - 0.5) * 0.3,
      });
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    var mat = new THREE.PointsMaterial({
      color: 0x888888,
      size: 0.5,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    var pts = new THREE.Points(geo, mat);
    group.add(pts);
    IRON.effectGroup.add(group);

    var elapsed = 0;
    var duration = 4.0;
    var animId = _registerEffectAnim(function (dt) {
      elapsed += dt;
      if (elapsed > duration) {
        IRON.effectGroup.remove(group);
        _disposeGroup(group);
        return true; // done
      }
      var posArr = pts.geometry.getAttribute("position").array;
      for (var j = 0; j < count; j++) {
        posArr[j * 3] += vels[j].x * dt;
        posArr[j * 3 + 1] += vels[j].y * dt;
        posArr[j * 3 + 2] += vels[j].z * dt;
      }
      pts.geometry.getAttribute("position").needsUpdate = true;
      mat.opacity = 0.6 * (1.0 - elapsed / duration);
      return false;
    });
  }

  function _spawnAirstrikeEffect(wx, wz, radius) {
    var group = new THREE.Group();
    group.position.set(wx, TH + 0.02, wz);

    // Warning circle
    var ringGeo = new THREE.RingBufferGeometry(
      radius * T * 0.45,
      radius * T * 0.5,
      32
    );
    var ringMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    var ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    IRON.effectGroup.add(group);

    var elapsed = 0;
    var warningDur = 1.5;
    var explosionSpawned = false;
    var totalDur = 3.5;

    _registerEffectAnim(function (dt) {
      elapsed += dt;
      if (elapsed > totalDur) {
        IRON.effectGroup.remove(group);
        _disposeGroup(group);
        return true;
      }
      // Pulsing warning
      if (elapsed < warningDur) {
        ringMat.opacity = 0.4 + 0.4 * Math.sin(elapsed * 10);
      } else if (!explosionSpawned) {
        explosionSpawned = true;
        ring.visible = false;
        // Explosion flash
        var flashGeo = new THREE.SphereBufferGeometry(radius * T * 0.6, 16, 16);
        var flashMat = new THREE.MeshBasicMaterial({
          color: 0xff6600,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        });
        var flash = new THREE.Mesh(flashGeo, flashMat);
        flash.position.y = 0.5;
        group.add(flash);
        group.userData.flash = flash;
        group.userData.flashMat = flashMat;
      }

      if (group.userData.flash) {
        var t = elapsed - warningDur;
        var s = 1.0 + t * 2;
        group.userData.flash.scale.set(s, s, s);
        group.userData.flashMat.opacity = Math.max(0, 0.9 - t * 0.6);
      }
      return false;
    });
  }

  function _spawnEMPEffect(wx, wz, radius) {
    var group = new THREE.Group();
    group.position.set(wx, TH + 0.5, wz);

    var ringGeo = new THREE.RingBufferGeometry(0.1, 0.3, 32);
    var ringMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    var ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    IRON.effectGroup.add(group);

    var elapsed = 0;
    var duration = 1.5;
    var maxScale = radius * T;

    _registerEffectAnim(function (dt) {
      elapsed += dt;
      if (elapsed > duration) {
        IRON.effectGroup.remove(group);
        _disposeGroup(group);
        return true;
      }
      var prog = elapsed / duration;
      var s = prog * maxScale;
      ring.scale.set(s, s, s);
      ringMat.opacity = 0.9 * (1.0 - prog);
      return false;
    });
  }

  function _spawnRallyEffect(wx, wz) {
    var group = new THREE.Group();
    group.position.set(wx, TH + 0.3, wz);

    var count = 30;
    var positions = new Float32Array(count * 3);
    var vels = [];
    for (var i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
      var angle = Math.random() * Math.PI * 2;
      var speed = 2 + Math.random() * 3;
      vels.push({
        x: Math.cos(angle) * speed,
        y: 2 + Math.random() * 3,
        z: Math.sin(angle) * speed,
      });
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    var mat = new THREE.PointsMaterial({
      color: 0x00ff44,
      size: 0.2,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    var pts = new THREE.Points(geo, mat);
    group.add(pts);
    IRON.effectGroup.add(group);

    var elapsed = 0;
    var duration = 2.0;

    _registerEffectAnim(function (dt) {
      elapsed += dt;
      if (elapsed > duration) {
        IRON.effectGroup.remove(group);
        _disposeGroup(group);
        return true;
      }
      var posArr = pts.geometry.getAttribute("position").array;
      for (var j = 0; j < count; j++) {
        posArr[j * 3] += vels[j].x * dt;
        posArr[j * 3 + 1] += vels[j].y * dt - 4 * dt * elapsed;
        posArr[j * 3 + 2] += vels[j].z * dt;
      }
      pts.geometry.getAttribute("position").needsUpdate = true;
      mat.opacity = 0.9 * (1.0 - elapsed / duration);
      return false;
    });
  }

  function _spawnBarrageEffect(wx, wz, radius) {
    var group = new THREE.Group();
    group.position.set(wx, TH + 0.02, wz);

    // Multiple suppression markers on the ground
    var markerCount = 5;
    for (var i = 0; i < markerCount; i++) {
      var angle = (i / markerCount) * Math.PI * 2;
      var r = radius * T * 0.3 * (0.5 + Math.random() * 0.5);
      var circGeo = new THREE.CircleBufferGeometry(0.3, 16);
      var circMat = new THREE.MeshBasicMaterial({
        color: 0xff8800,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      var circ = new THREE.Mesh(circGeo, circMat);
      circ.rotation.x = -Math.PI / 2;
      circ.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      group.add(circ);
    }
    IRON.effectGroup.add(group);

    var elapsed = 0;
    var duration = 3.0;

    _registerEffectAnim(function (dt) {
      elapsed += dt;
      if (elapsed > duration) {
        IRON.effectGroup.remove(group);
        _disposeGroup(group);
        return true;
      }
      // Pulse markers
      group.children.forEach(function (child) {
        if (child.material) {
          child.material.opacity = 0.3 + 0.3 * Math.sin(elapsed * 6 + child.position.x);
        }
      });
      return false;
    });
  }

  function _spawnTurretBuildEffect(wx, wz) {
    var group = new THREE.Group();
    group.position.set(wx, TH, wz);

    // Parts that "assemble"
    var parts = [];
    var partCount = 6;
    for (var i = 0; i < partCount; i++) {
      var geo = new THREE.BoxBufferGeometry(
        0.15 + Math.random() * 0.2,
        0.1 + Math.random() * 0.15,
        0.15 + Math.random() * 0.2
      );
      var mat = new THREE.MeshLambertMaterial({
        color: 0x556655,
        transparent: true,
        opacity: 0.0,
      });
      var part = new THREE.Mesh(geo, mat);
      var angle = (i / partCount) * Math.PI * 2;
      part.userData.startPos = new THREE.Vector3(
        Math.cos(angle) * 2,
        2 + Math.random() * 2,
        Math.sin(angle) * 2
      );
      part.userData.endPos = new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        i * 0.15,
        (Math.random() - 0.5) * 0.4
      );
      part.position.copy(part.userData.startPos);
      group.add(part);
      parts.push(part);
    }
    IRON.effectGroup.add(group);

    var elapsed = 0;
    var duration = 2.5;

    _registerEffectAnim(function (dt) {
      elapsed += dt;
      if (elapsed > duration) {
        IRON.effectGroup.remove(group);
        _disposeGroup(group);
        return true;
      }
      var prog = Math.min(elapsed / (duration * 0.8), 1.0);
      var eased = prog * prog * (3 - 2 * prog); // smoothstep
      for (var j = 0; j < parts.length; j++) {
        var p = parts[j];
        p.position.lerpVectors(p.userData.startPos, p.userData.endPos, eased);
        p.material.opacity = eased;
      }
      return false;
    });
  }

  // Effect animation registry
  var _effectAnims = [];

  function _registerEffectAnim(updateFn) {
    _effectAnims.push(updateFn);
  }

  IRON.updateEffects = function (dt) {
    if (!dt) dt = 0.016;
    for (var i = _effectAnims.length - 1; i >= 0; i--) {
      var done = _effectAnims[i](dt);
      if (done) {
        _effectAnims.splice(i, 1);
      }
    }
  };

  // ========================================================================
  // 6. OBJECTIVE MARKERS
  // ========================================================================

  IRON.showObjectiveMarker = function (objective) {
    if (!objective) return;
    var wx = objective.x * T + T / 2;
    var wz = objective.z * T + T / 2;

    var group = new THREE.Group();
    group.name = "objective_" + (objective.id || objective.x + "_" + objective.z);
    group.position.set(wx, 0, wz);

    // Tall pillar of light
    var pillarGeo = new THREE.CylinderBufferGeometry(0.08, 0.15, 12, 8, 1, true);
    var pillarMat = new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    var pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 6;
    group.add(pillar);

    // Ground ring
    var ringGeo = new THREE.RingBufferGeometry(0.5, 0.65, 32);
    var ringMat = new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    var ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = TH + 0.05;
    group.add(ring);

    // Label (using a small sprite)
    var canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = "#ffdd44";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(objective.label || "OBJ", 64, 40);
    var tex = new THREE.CanvasTexture(canvas);
    var spriteMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    });
    var sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.5, 0.75, 1);
    sprite.position.y = 2.5;
    group.add(sprite);

    group.userData.pillar = pillar;
    group.userData.pillarMat = pillarMat;
    group.userData.ring = ring;
    group.userData.ringMat = ringMat;
    group.userData.time = 0;
    group.userData.objectiveRef = objective;

    IRON.objectiveGroup.add(group);
    IRON.objectiveMarkers.push(group);
  };

  IRON.removeObjectiveMarker = function (objective) {
    for (var i = IRON.objectiveMarkers.length - 1; i >= 0; i--) {
      var marker = IRON.objectiveMarkers[i];
      if (marker.userData.objectiveRef === objective) {
        IRON.objectiveGroup.remove(marker);
        _disposeGroup(marker);
        IRON.objectiveMarkers.splice(i, 1);
        return;
      }
    }
  };

  IRON.updateObjectiveMarkers = function (dt) {
    if (!dt) dt = 0.016;
    for (var i = 0; i < IRON.objectiveMarkers.length; i++) {
      var m = IRON.objectiveMarkers[i];
      m.userData.time += dt;
      var t = m.userData.time;
      // Pulse pillar
      if (m.userData.pillarMat) {
        m.userData.pillarMat.opacity = 0.25 + 0.15 * Math.sin(t * 2);
      }
      // Pulse ring
      if (m.userData.ring) {
        var s = 1.0 + 0.1 * Math.sin(t * 3);
        m.userData.ring.scale.set(s, s, 1);
      }
    }
  };

  // ========================================================================
  // 7. MERGE EFFECT
  // ========================================================================

  IRON.spawnMergeEffect = function (unitA, unitB) {
    if (!unitA || !unitB || !unitA.mesh || !unitB.mesh) return;

    var posA = unitA.mesh.position.clone();
    var posB = unitB.mesh.position.clone();

    // Glow on both units
    var glowA = _createGlowSphere(0x44ff88, 0.6);
    glowA.position.copy(posA);
    glowA.position.y += 0.5;
    IRON.effectGroup.add(glowA);

    var glowB = _createGlowSphere(0x44ff88, 0.6);
    glowB.position.copy(posB);
    glowB.position.y += 0.5;
    IRON.effectGroup.add(glowB);

    // Particle stream from B to A
    var streamCount = 20;
    var streamPositions = new Float32Array(streamCount * 3);
    for (var i = 0; i < streamCount; i++) {
      var t = i / streamCount;
      streamPositions[i * 3] = posB.x + (posA.x - posB.x) * t + (Math.random() - 0.5) * 0.3;
      streamPositions[i * 3 + 1] = posB.y + 0.5 + (Math.random() - 0.5) * 0.3;
      streamPositions[i * 3 + 2] = posB.z + (posA.z - posB.z) * t + (Math.random() - 0.5) * 0.3;
    }
    var streamGeo = new THREE.BufferGeometry();
    streamGeo.setAttribute("position", new THREE.BufferAttribute(streamPositions, 3));
    var streamMat = new THREE.PointsMaterial({
      color: 0x88ffbb,
      size: 0.12,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    var stream = new THREE.Points(streamGeo, streamMat);
    IRON.effectGroup.add(stream);

    var elapsed = 0;
    var duration = 1.5;

    _registerEffectAnim(function (dt) {
      elapsed += dt;
      if (elapsed > duration) {
        IRON.effectGroup.remove(glowA);
        IRON.effectGroup.remove(glowB);
        IRON.effectGroup.remove(stream);
        _disposeGroup(glowA);
        _disposeGroup(glowB);
        _disposeGroup(stream);
        return true;
      }
      var prog = elapsed / duration;

      // Move particles toward A
      var sArr = stream.geometry.getAttribute("position").array;
      for (var j = 0; j < streamCount; j++) {
        var j3 = j * 3;
        sArr[j3] += (posA.x - sArr[j3]) * dt * 2;
        sArr[j3 + 1] += (posA.y + 0.5 - sArr[j3 + 1]) * dt * 2;
        sArr[j3 + 2] += (posA.z - sArr[j3 + 2]) * dt * 2;
      }
      stream.geometry.getAttribute("position").needsUpdate = true;

      // Fade out unitB
      if (unitB.mesh) {
        unitB.mesh.traverse(function (child) {
          if (child.isMesh && child.material) {
            child.material.transparent = true;
            child.material.opacity = 1.0 - prog;
          }
        });
      }

      // Fade out glows toward end
      if (prog > 0.7) {
        var fadeProg = (prog - 0.7) / 0.3;
        glowA.children[0].material.opacity = 0.3 * (1.0 - fadeProg);
        glowB.children[0].material.opacity = 0.3 * (1.0 - fadeProg);
        streamMat.opacity = 0.8 * (1.0 - fadeProg);
      }

      return false;
    });
  };

  // ========================================================================
  // 8. VETERANCY RANK UP EFFECT
  // ========================================================================

  IRON.spawnRankUpEffect = function (unit) {
    if (!unit || !unit.mesh) return;

    var group = new THREE.Group();
    var pos = unit.mesh.position;
    group.position.set(pos.x, pos.y + 0.5, pos.z);

    // Golden ring expanding outward
    var ringGeo = new THREE.RingBufferGeometry(0.1, 0.25, 32);
    var ringMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    var ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    // Golden starburst particles
    var count = 25;
    var starPositions = new Float32Array(count * 3);
    var starVels = [];
    for (var i = 0; i < count; i++) {
      starPositions[i * 3] = 0;
      starPositions[i * 3 + 1] = 0;
      starPositions[i * 3 + 2] = 0;
      var angle = Math.random() * Math.PI * 2;
      var speed = 1.5 + Math.random() * 2;
      starVels.push({
        x: Math.cos(angle) * speed,
        y: 1 + Math.random() * 2,
        z: Math.sin(angle) * speed,
      });
    }
    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    var starMat = new THREE.PointsMaterial({
      color: 0xffdd44,
      size: 0.18,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    var stars = new THREE.Points(starGeo, starMat);
    group.add(stars);

    IRON.effectGroup.add(group);

    // Brief glow on unit
    var unitGlow = _createGlowSphere(0xffcc00, 0.5);
    unit.mesh.add(unitGlow);
    unitGlow.position.set(0, 0.5, 0);

    var elapsed = 0;
    var duration = 2.0;

    _registerEffectAnim(function (dt) {
      elapsed += dt;
      if (elapsed > duration) {
        IRON.effectGroup.remove(group);
        _disposeGroup(group);
        if (unitGlow.parent) unitGlow.parent.remove(unitGlow);
        _disposeGroup(unitGlow);
        return true;
      }

      var prog = elapsed / duration;

      // Expand ring
      var rs = 1.0 + prog * 4;
      ring.scale.set(rs, rs, 1);
      ringMat.opacity = 0.9 * (1.0 - prog);

      // Move starburst particles
      var sArr = stars.geometry.getAttribute("position").array;
      for (var j = 0; j < count; j++) {
        sArr[j * 3] += starVels[j].x * dt;
        sArr[j * 3 + 1] += starVels[j].y * dt - 3 * dt * elapsed;
        sArr[j * 3 + 2] += starVels[j].z * dt;
      }
      stars.geometry.getAttribute("position").needsUpdate = true;
      starMat.opacity = 0.9 * (1.0 - prog);

      // Fade unit glow
      if (unitGlow.children[0]) {
        unitGlow.children[0].material.opacity = 0.4 * (1.0 - prog);
      }

      return false;
    });
  };

  // ========================================================================
  // UTILITY HELPERS
  // ========================================================================

  function _createGlowSphere(color, radius) {
    var group = new THREE.Group();
    var geo = new THREE.SphereBufferGeometry(radius, 12, 12);
    var mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    var mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    return group;
  }

  function _disposeGroup(group) {
    group.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
  }

  function _lerp(a, b, t) {
    return a + (b - a) * Math.min(t, 1);
  }

  // ========================================================================
  // MASTER UPDATE (call from render loop)
  // ========================================================================

  IRON.updateSystems = function (dt) {
    if (!dt) dt = 0.016;
    IRON.updateFogOfWar();
    IRON.updateWeatherVisuals(dt);
    IRON.updateShimmerEffects(dt);
    IRON.updateStatusEffects(dt);
    IRON.updateEffects(dt);
    IRON.updateObjectiveMarkers(dt);
  };

})();
