// ===================================================================
//  IRONFRONT v3.0 — THREE.JS RENDERER
//  Scene setup, lighting, tile building, unit models, visual effects,
//  camera controls, minimap, particle systems.
// ===================================================================

(function () {
  'use strict';

  var TILE_SIZE = IRON.TILE_SIZE;
  var TILE_GAP = IRON.TILE_GAP;
  var TILE_HEIGHT = IRON.TILE_HEIGHT;
  var GRID_W = IRON.GRID_W;
  var GRID_H = IRON.GRID_H;
  var TERRAIN = IRON.TERRAIN;

  // ---------------------------------------------------------------
  //  1. RENDERER INIT
  // ---------------------------------------------------------------
  IRON.initRenderer = function () {
    var canvas = document.getElementById('game-canvas');

    // WebGL renderer
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    IRON.renderer = renderer;

    // Scene
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1018);
    scene.fog = new THREE.FogExp2(0x0a1018, 0.008);
    IRON.scene = scene;

    // Camera
    var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
    camera.position.set(GRID_W * TILE_SIZE / 2, 35, GRID_H * TILE_SIZE / 2 + 35);
    camera.lookAt(GRID_W * TILE_SIZE / 2, 0, GRID_H * TILE_SIZE / 2);
    IRON.camera = camera;

    // Raycaster
    IRON.raycaster = new THREE.Raycaster();
    IRON.mouse = new THREE.Vector2();

    // Lighting
    scene.add(new THREE.AmbientLight(0x334466, 0.6));

    var dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight.position.set(30, 45, 25);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 120;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    var fillLight = new THREE.DirectionalLight(0x4488cc, 0.3);
    fillLight.position.set(-20, 15, -15);
    scene.add(fillLight);

    scene.add(new THREE.HemisphereLight(0x446688, 0x223322, 0.4));

    // Scene groups
    IRON.tileGroup = new THREE.Group();
    IRON.unitGroup = new THREE.Group();
    IRON.highlightGroup = new THREE.Group();
    IRON.effectGroup = new THREE.Group();
    scene.add(IRON.tileGroup, IRON.unitGroup, IRON.highlightGroup, IRON.effectGroup);

    // Ground
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x0a1410, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    var grid = new THREE.GridHelper(100, 100, 0x112211, 0x0a1a0a);
    grid.position.y = -0.05;
    scene.add(grid);

    // Ambient particles
    var particleGeo = new THREE.BufferGeometry();
    var pCount = 400;
    var positions = new Float32Array(pCount * 3);
    for (var i = 0; i < pCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60 + GRID_W * TILE_SIZE / 2;
      positions[i * 3 + 1] = Math.random() * 10 + 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50 + GRID_H * TILE_SIZE / 2;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var particleMat = new THREE.PointsMaterial({ color: 0x88ffaa, size: 0.05, transparent: true, opacity: 0.3 });
    var particles = new THREE.Points(particleGeo, particleMat);
    particles.userData.isParticles = true;
    scene.add(particles);

    // Camera state
    IRON.camState = {
      angle: Math.PI / 4,
      dist: 45,
      height: 35,
      center: new THREE.Vector3(GRID_W * TILE_SIZE / 2, 0, GRID_H * TILE_SIZE / 2),
      targetAngle: Math.PI / 4,
      targetDist: 45,
      targetHeight: 35,
      targetCenter: new THREE.Vector3(GRID_W * TILE_SIZE / 2, 0, GRID_H * TILE_SIZE / 2),
      keys: {},
      rotDeltaX: 0,
      rotDeltaY: 0,
      zoomDelta: 0,
    };
  };

  // ---------------------------------------------------------------
  //  2. TILE BUILDING
  // ---------------------------------------------------------------
  IRON.buildTileMesh = function (tile) {
    var elev = 0;
    if (tile.terrain === TERRAIN.MOUNTAIN) elev = 0.6;
    else if (tile.terrain === TERRAIN.WATER) elev = -0.15;
    else if (tile.terrain === TERRAIN.HQ) elev = 0.3;
    else if (tile.terrain === TERRAIN.DEPOT) elev = 0.15;
    tile.elevation = elev;

    var h = TILE_HEIGHT + elev;
    var geo = new THREE.BoxGeometry(TILE_SIZE - TILE_GAP, h, TILE_SIZE - TILE_GAP);
    var mat = new THREE.MeshStandardMaterial({ color: tile.terrain.color, roughness: 0.8, metalness: 0.1 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(tile.x * TILE_SIZE + TILE_SIZE / 2, h / 2, tile.z * TILE_SIZE + TILE_SIZE / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { type: 'tile', x: tile.x, z: tile.z };
    tile.mesh = mesh;
    IRON.tileGroup.add(mesh);

    // Decorators
    if (tile.terrain === TERRAIN.FOREST) _addTrees(tile);
    else if (tile.terrain === TERRAIN.MOUNTAIN) _addRocks(tile);
    else if (tile.terrain === TERRAIN.WATER) _addWater(tile);
    else if (tile.terrain === TERRAIN.BRIDGE) _addBridge(tile);
    else if (tile.terrain === TERRAIN.HQ) _addHQBuilding(tile);
    else if (tile.terrain === TERRAIN.DEPOT) _addDepotBuilding(tile);

    return mesh;
  };

  function _addTrees(tile) {
    var n = 2 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      var tree = new THREE.Group();
      var trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.09, 0.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 })
      );
      var leaves = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: 0x1a5a1a + Math.floor(Math.random() * 0x102010), roughness: 0.85 })
      );
      leaves.position.y = 0.45;
      tree.add(trunk, leaves);
      tree.position.set(
        tile.x * TILE_SIZE + 0.4 + Math.random() * 1.2,
        TILE_HEIGHT + tile.elevation,
        tile.z * TILE_SIZE + 0.4 + Math.random() * 1.2
      );
      tree.scale.setScalar(0.7 + Math.random() * 0.6);
      tree.castShadow = true;
      IRON.tileGroup.add(tree);
    }
  }

  function _addRocks(tile) {
    var n = 1 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      var rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.3, 0),
        new THREE.MeshStandardMaterial({ color: 0x556655, roughness: 0.95 })
      );
      rock.position.set(
        tile.x * TILE_SIZE + 0.3 + Math.random() * 1.4,
        TILE_HEIGHT + tile.elevation + 0.15,
        tile.z * TILE_SIZE + 0.3 + Math.random() * 1.4
      );
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      rock.castShadow = true;
      IRON.tileGroup.add(rock);
    }
  }

  function _addWater(tile) {
    var water = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE_SIZE - TILE_GAP, TILE_SIZE - TILE_GAP),
      new THREE.MeshStandardMaterial({
        color: 0x2a6888, roughness: 0.2, metalness: 0.4,
        transparent: true, opacity: 0.85
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(
      tile.x * TILE_SIZE + TILE_SIZE / 2,
      TILE_HEIGHT + tile.elevation + 0.16,
      tile.z * TILE_SIZE + TILE_SIZE / 2
    );
    water.receiveShadow = true;
    water.userData.isWater = true;
    IRON.tileGroup.add(water);
  }

  function _addBridge(tile) {
    // Wooden planks
    for (var i = 0; i < 4; i++) {
      var plank = new THREE.Mesh(
        new THREE.BoxGeometry(TILE_SIZE * 0.9, 0.06, 0.35),
        new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 })
      );
      plank.position.set(
        tile.x * TILE_SIZE + TILE_SIZE / 2,
        TILE_HEIGHT + 0.03,
        tile.z * TILE_SIZE + 0.35 + i * 0.42
      );
      plank.castShadow = true;
      IRON.tileGroup.add(plank);
    }
    // Railings
    [-1, 1].forEach(function (side) {
      var rail = new THREE.Mesh(
        new THREE.BoxGeometry(TILE_SIZE * 0.9, 0.3, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.9 })
      );
      rail.position.set(
        tile.x * TILE_SIZE + TILE_SIZE / 2,
        TILE_HEIGHT + 0.2,
        tile.z * TILE_SIZE + TILE_SIZE / 2 + side * 0.85
      );
      IRON.tileGroup.add(rail);
    });
  }

  function _addHQBuilding(tile) {
    var teamColor = tile.owner === 'blue' ? 0x0066cc : 0xcc2222;
    var accentColor = tile.owner === 'blue' ? 0x44bbff : 0xff6644;
    // Main building
    var building = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.8, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x445544, roughness: 0.6, metalness: 0.3 })
    );
    building.position.set(
      tile.x * TILE_SIZE + TILE_SIZE / 2,
      TILE_HEIGHT + tile.elevation + 0.4,
      tile.z * TILE_SIZE + TILE_SIZE / 2
    );
    building.castShadow = true;
    IRON.tileGroup.add(building);

    // Roof
    var roof = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.08, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x334433, roughness: 0.5 })
    );
    roof.position.set(building.position.x, building.position.y + 0.44, building.position.z);
    IRON.tileGroup.add(roof);

    // Antenna
    var antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4),
      new THREE.MeshStandardMaterial({ color: 0x666666 })
    );
    antenna.position.set(building.position.x + 0.5, building.position.y + 0.9, building.position.z - 0.4);
    IRON.tileGroup.add(antenna);

    // Glowing team light
    var light = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 1.5 })
    );
    light.position.set(antenna.position.x, antenna.position.y + 0.55, antenna.position.z);
    IRON.tileGroup.add(light);

    // Team flag (colored stripe)
    var flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.3, 0.2),
      new THREE.MeshStandardMaterial({ color: teamColor, emissive: teamColor, emissiveIntensity: 0.5 })
    );
    flag.position.set(building.position.x - 0.6, building.position.y + 0.3, building.position.z);
    IRON.tileGroup.add(flag);
  }

  function _addDepotBuilding(tile) {
    // Shed
    var shed = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.5, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x5a5a3a, roughness: 0.8 })
    );
    shed.position.set(
      tile.x * TILE_SIZE + TILE_SIZE / 2 - 0.3,
      TILE_HEIGHT + tile.elevation + 0.25,
      tile.z * TILE_SIZE + TILE_SIZE / 2
    );
    shed.castShadow = true;
    IRON.tileGroup.add(shed);

    // Supply crates
    for (var i = 0; i < 3; i++) {
      var crate = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.2, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x665533, roughness: 0.9 })
      );
      crate.position.set(
        tile.x * TILE_SIZE + TILE_SIZE / 2 + 0.4 + (i % 2) * 0.3,
        TILE_HEIGHT + tile.elevation + 0.1 + Math.floor(i / 2) * 0.2,
        tile.z * TILE_SIZE + TILE_SIZE / 2 + (i - 1) * 0.25
      );
      crate.castShadow = true;
      IRON.tileGroup.add(crate);
    }
  }

  // ---------------------------------------------------------------
  //  3. UNIT MODEL BUILDER
  // ---------------------------------------------------------------
  IRON.buildUnitModel = function (unitData) {
    var group = new THREE.Group();
    var tc = unitData.team === 'blue' ? 0x0088ff : 0xdd2222;
    var ac = unitData.team === 'blue' ? 0x44bbff : 0xff6644;
    var s = unitData.typeData.scale;

    switch (unitData.unitType) {
      case 'TANK': _buildTankModel(group, tc, ac, s); break;
      case 'ARTILLERY': _buildArtilleryModel(group, tc, ac, s); break;
      case 'SCOUT': _buildScoutModel(group, tc, ac, s); break;
      case 'COMMANDER': _buildCommanderModel(group, tc, ac, s); break;
      case 'SNIPER': _buildSniperModel(group, tc, ac, s); break;
      case 'MEDIC': _buildMedicModel(group, tc, ac, s); break;
      case 'ENGINEER': _buildEngineerModel(group, tc, ac, s); break;
      case 'HELICOPTER': _buildHelicopterModel(group, tc, ac, s); break;
      case 'MISSILE_LAUNCHER': _buildMissileLauncherModel(group, tc, ac, s); break;
      case 'HEAVY_MECH': _buildHeavyMechModel(group, tc, ac, s); break;
      case 'DRONE': _buildDroneModel(group, tc, ac, s); break;
      default: _buildInfantryModel(group, tc, ac, s); break;
    }

    // HP bar
    var hpBar = new THREE.Group();
    var hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.8 })
    );
    var hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.18, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x00ff66 })
    );
    hpFill.position.z = 0.001;
    hpBar.add(hpBg, hpFill);
    hpBar.position.y = 1.8 * s;
    hpBar.userData = { isHpBar: true, fill: hpFill };
    group.add(hpBar);

    // Selection ring
    var selRing = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.72, 24),
      new THREE.MeshBasicMaterial({ color: ac, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    selRing.rotation.x = -Math.PI / 2;
    selRing.position.y = 0.02;
    selRing.userData = { isSelRing: true };
    group.add(selRing);

    // Position on tile
    if (IRON.state && IRON.state.grid && IRON.state.grid[unitData.x]) {
      var tile = IRON.state.grid[unitData.x][unitData.z];
      if (tile) {
        group.position.set(
          unitData.x * TILE_SIZE + TILE_SIZE / 2,
          TILE_HEIGHT + (tile.elevation || 0),
          unitData.z * TILE_SIZE + TILE_SIZE / 2
        );
      }
    }

    group.userData = { type: 'unit', unitId: unitData.id, unitRef: unitData };
    return group;
  };

  // ---------------------------------------------------------------
  //  INFANTRY
  // ---------------------------------------------------------------
  function _buildInfantryModel(g, tc, ac, s) {
    // Body
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(0.35 * s, 0.5 * s, 0.25 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.6, metalness: 0.3 })
    );
    body.position.y = 0.55 * s; body.castShadow = true; g.add(body);

    // Chest plate
    var plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.32 * s, 0.3 * s, 0.08 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.4, metalness: 0.5 })
    );
    plate.position.set(0, 0.6 * s, 0.15 * s); g.add(plate);

    // Head
    var head = new THREE.Mesh(
      new THREE.SphereGeometry(0.14 * s, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xddbb99, roughness: 0.7 })
    );
    head.position.y = 0.95 * s; head.castShadow = true; g.add(head);

    // Helmet
    var helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.16 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.5, metalness: 0.4 })
    );
    helmet.position.y = 1.0 * s; g.add(helmet);

    // Visor
    var visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.28 * s, 0.05 * s, 0.05 * s),
      new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 0.6, transparent: true, opacity: 0.8 })
    );
    visor.position.set(0, 0.94 * s, 0.14 * s); g.add(visor);

    // Weapon
    var gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.06 * s, 0.06 * s, 0.55 * s),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.6 })
    );
    gun.position.set(0.25 * s, 0.5 * s, 0.15 * s);
    gun.rotation.x = 0.3; g.add(gun);

    // Arms
    [-1, 1].forEach(function (side) {
      var arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.1 * s, 0.35 * s, 0.1 * s),
        new THREE.MeshStandardMaterial({ color: tc, roughness: 0.6 })
      );
      arm.position.set(side * 0.22 * s, 0.5 * s, 0.08 * s);
      g.add(arm);
    });

    // Legs
    [-1, 1].forEach(function (side) {
      var leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.12 * s, 0.35 * s, 0.14 * s),
        new THREE.MeshStandardMaterial({ color: 0x334433, roughness: 0.8 })
      );
      leg.position.set(side * 0.1 * s, 0.17 * s, 0);
      leg.castShadow = true; g.add(leg);

      var boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.14 * s, 0.08 * s, 0.18 * s),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
      );
      boot.position.set(side * 0.1 * s, 0.04 * s, 0.02 * s);
      g.add(boot);
    });

    // Backpack
    var bp = new THREE.Mesh(
      new THREE.BoxGeometry(0.25 * s, 0.25 * s, 0.12 * s),
      new THREE.MeshStandardMaterial({ color: 0x445544, roughness: 0.8 })
    );
    bp.position.set(0, 0.6 * s, -0.2 * s); g.add(bp);

    // Shoulder patch
    var patch = new THREE.Mesh(
      new THREE.BoxGeometry(0.08 * s, 0.08 * s, 0.02 * s),
      new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 0.5 })
    );
    patch.position.set(0.2 * s, 0.7 * s, 0.14 * s); g.add(patch);
  }

  // ---------------------------------------------------------------
  //  TANK
  // ---------------------------------------------------------------
  function _buildTankModel(g, tc, ac, s) {
    var hull = new THREE.Mesh(
      new THREE.BoxGeometry(1.4 * s, 0.45 * s, 0.9 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.5, metalness: 0.6 })
    );
    hull.position.y = 0.3 * s; hull.castShadow = true; g.add(hull);

    // Front armor
    var frontPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.15 * s, 0.35 * s, 0.85 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.4, metalness: 0.7 })
    );
    frontPlate.position.set(0.75 * s, 0.33 * s, 0);
    frontPlate.rotation.z = 0.2; g.add(frontPlate);

    // Turret
    var turret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32 * s, 0.35 * s, 0.25 * s, 8),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.4, metalness: 0.7 })
    );
    turret.position.y = 0.65 * s; turret.castShadow = true; g.add(turret);

    // Barrel
    var barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * s, 0.08 * s, 0.9 * s, 8),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.8 })
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.6 * s, 0.65 * s, 0);
    barrel.castShadow = true; g.add(barrel);

    // Muzzle brake
    var muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09 * s, 0.07 * s, 0.08 * s, 8),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.9 })
    );
    muzzle.rotation.z = Math.PI / 2;
    muzzle.position.set(1.05 * s, 0.65 * s, 0); g.add(muzzle);

    // Tracks
    [-1, 1].forEach(function (side) {
      var track = new THREE.Mesh(
        new THREE.BoxGeometry(1.5 * s, 0.2 * s, 0.2 * s),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })
      );
      track.position.set(0, 0.12 * s, side * 0.5 * s);
      track.castShadow = true; g.add(track);

      for (var i = -2; i <= 2; i++) {
        var wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08 * s, 0.08 * s, 0.05 * s, 8),
          new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
        );
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(i * 0.3 * s, 0.12 * s, side * 0.52 * s);
        g.add(wheel);
      }
    });

    // Accent stripe
    var stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.1 * s, 0.08 * s, 0.92 * s),
      new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 0.5 })
    );
    stripe.position.set(0, 0.55 * s, 0); g.add(stripe);

    // Exhaust
    [-1, 1].forEach(function (side) {
      var exhaust = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.15 * s, 6),
        new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 })
      );
      exhaust.position.set(-0.65 * s, 0.35 * s, side * 0.3 * s);
      g.add(exhaust);
    });
  }

  // ---------------------------------------------------------------
  //  ARTILLERY
  // ---------------------------------------------------------------
  function _buildArtilleryModel(g, tc, ac, s) {
    var base = new THREE.Mesh(
      new THREE.BoxGeometry(1.0 * s, 0.2 * s, 1.0 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.6, metalness: 0.5 })
    );
    base.position.y = 0.15 * s; base.castShadow = true; g.add(base);

    // Support legs
    [-1, 1].forEach(function (side) {
      var leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.6 * s, 0.06 * s, 0.08 * s),
        new THREE.MeshStandardMaterial({ color: 0x444444 })
      );
      leg.position.set(-0.5 * s, 0.08 * s, side * 0.45 * s);
      leg.rotation.y = side * 0.3; g.add(leg);
    });

    // Mount
    var mount = new THREE.Mesh(
      new THREE.BoxGeometry(0.3 * s, 0.35 * s, 0.3 * s),
      new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.7 })
    );
    mount.position.y = 0.42 * s; mount.castShadow = true; g.add(mount);

    // Long barrel
    var barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * s, 0.1 * s, 1.3 * s, 8),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.8 })
    );
    barrel.rotation.z = Math.PI / 3;
    barrel.position.set(0.45 * s, 0.75 * s, 0);
    barrel.castShadow = true; g.add(barrel);

    // Recoil mechanism
    var recoil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12 * s, 0.12 * s, 0.3 * s, 8),
      new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6 })
    );
    recoil.rotation.z = Math.PI / 3;
    recoil.position.set(0.1 * s, 0.52 * s, 0); g.add(recoil);

    // Wheels
    [-1, 1].forEach(function (side) {
      var wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18 * s, 0.18 * s, 0.08 * s, 12),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(-0.3 * s, 0.18 * s, side * 0.55 * s); g.add(wheel);
    });

    // Accent ring
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.12 * s, 0.03 * s, 8, 16),
      new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 0.6 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.62 * s; g.add(ring);

    // Ammo crate
    var crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.2 * s, 0.15 * s, 0.15 * s),
      new THREE.MeshStandardMaterial({ color: 0x665533 })
    );
    crate.position.set(-0.35 * s, 0.32 * s, 0.3 * s); g.add(crate);
  }

  // ---------------------------------------------------------------
  //  SCOUT
  // ---------------------------------------------------------------
  function _buildScoutModel(g, tc, ac, s) {
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(0.9 * s, 0.3 * s, 0.6 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.4, metalness: 0.5 })
    );
    body.position.y = 0.28 * s; body.castShadow = true; g.add(body);

    var front = new THREE.Mesh(
      new THREE.BoxGeometry(0.2 * s, 0.2 * s, 0.55 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.4, metalness: 0.5 })
    );
    front.position.set(0.45 * s, 0.22 * s, 0);
    front.rotation.z = -0.3; g.add(front);

    var wind = new THREE.Mesh(
      new THREE.BoxGeometry(0.15 * s, 0.2 * s, 0.5 * s),
      new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.7 })
    );
    wind.position.set(0.25 * s, 0.48 * s, 0); g.add(wind);

    var antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015 * s, 0.015 * s, 0.6 * s, 4),
      new THREE.MeshStandardMaterial({ color: 0x666666 })
    );
    antenna.position.set(-0.3 * s, 0.65 * s, 0); g.add(antenna);

    var tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 * s, 8, 8),
      new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 1.0 })
    );
    tip.position.set(-0.3 * s, 0.97 * s, 0); g.add(tip);

    // Wheels
    [-1, 1].forEach(function (xi) {
      [-1, 1].forEach(function (zi) {
        var w = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1 * s, 0.1 * s, 0.06 * s, 10),
          new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 })
        );
        w.rotation.x = Math.PI / 2;
        w.position.set(xi * 0.32 * s, 0.1 * s, zi * 0.33 * s);
        g.add(w);
      });
    });

    // Side stripes
    [-1, 1].forEach(function (side) {
      var st = new THREE.Mesh(
        new THREE.BoxGeometry(0.85 * s, 0.03 * s, 0.02 * s),
        new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 0.4 })
      );
      st.position.set(0, 0.3 * s, side * 0.31 * s);
      g.add(st);
    });
  }

  // ---------------------------------------------------------------
  //  COMMANDER
  // ---------------------------------------------------------------
  function _buildCommanderModel(g, tc, ac, s) {
    var hull = new THREE.Mesh(
      new THREE.BoxGeometry(1.2 * s, 0.5 * s, 0.8 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.35, metalness: 0.65 })
    );
    hull.position.y = 0.35 * s; hull.castShadow = true; g.add(hull);

    // Command dome
    var dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.28 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x88aacc, roughness: 0.15, metalness: 0.8, transparent: true, opacity: 0.6 })
    );
    dome.position.y = 0.6 * s; g.add(dome);

    // Star emblem
    var star = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12 * s, 0),
      new THREE.MeshStandardMaterial({ color: 0xffdd44, emissive: 0xffdd44, emissiveIntensity: 0.8 })
    );
    star.position.y = 0.95 * s;
    star.rotation.y = Math.PI / 4; g.add(star);

    // Antennas
    [-1, 1].forEach(function (side) {
      var a = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015 * s, 0.02 * s, 0.5 * s, 4),
        new THREE.MeshStandardMaterial({ color: 0x666666 })
      );
      a.position.set(side * 0.3 * s, 0.85 * s, -0.25 * s);
      a.rotation.z = side * 0.2; g.add(a);

      var t = new THREE.Mesh(
        new THREE.SphereGeometry(0.03 * s, 6, 6),
        new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 0.8 })
      );
      t.position.set(side * 0.35 * s, 1.1 * s, -0.25 * s);
      g.add(t);
    });

    // Gun
    var gun = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04 * s, 0.05 * s, 0.6 * s, 6),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 })
    );
    gun.rotation.z = Math.PI / 2;
    gun.position.set(0.5 * s, 0.55 * s, -0.15 * s); g.add(gun);

    // Tracks
    [-1, 1].forEach(function (side) {
      var t = new THREE.Mesh(
        new THREE.BoxGeometry(1.3 * s, 0.18 * s, 0.15 * s),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 })
      );
      t.position.set(0, 0.1 * s, side * 0.45 * s); g.add(t);
    });

    // Accent line
    var line = new THREE.Mesh(
      new THREE.BoxGeometry(1.22 * s, 0.03 * s, 0.82 * s),
      new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 0.5 })
    );
    line.position.y = 0.62 * s; g.add(line);
  }

  // ---------------------------------------------------------------
  //  SNIPER
  // ---------------------------------------------------------------
  function _buildSniperModel(g, tc, ac, s) {
    // Prone body
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(0.6 * s, 0.18 * s, 0.3 * s),
      new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.8 })
    );
    body.position.set(0, 0.18 * s, 0); body.castShadow = true; g.add(body);

    // Ghillie cape
    var cape = new THREE.Mesh(
      new THREE.BoxGeometry(0.55 * s, 0.08 * s, 0.35 * s),
      new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 0.95 })
    );
    cape.position.set(-0.05 * s, 0.26 * s, 0); g.add(cape);

    // Head
    var head = new THREE.Mesh(
      new THREE.SphereGeometry(0.1 * s, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.8 })
    );
    head.position.set(0.3 * s, 0.3 * s, 0); g.add(head);

    // Long rifle
    var rifle = new THREE.Mesh(
      new THREE.BoxGeometry(0.9 * s, 0.05 * s, 0.05 * s),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.7 })
    );
    rifle.position.set(0.3 * s, 0.22 * s, 0); g.add(rifle);

    // Scope
    var scope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.15 * s, 6),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 })
    );
    scope.rotation.z = Math.PI / 2;
    scope.position.set(0.2 * s, 0.28 * s, 0); g.add(scope);

    // Scope lens glow
    var lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.025 * s, 8, 8),
      new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 1.2 })
    );
    lens.position.set(0.28 * s, 0.28 * s, 0); g.add(lens);

    // Team accent
    var patch = new THREE.Mesh(
      new THREE.BoxGeometry(0.1 * s, 0.04 * s, 0.08 * s),
      new THREE.MeshStandardMaterial({ color: tc, emissive: tc, emissiveIntensity: 0.3 })
    );
    patch.position.set(-0.2 * s, 0.27 * s, 0.12 * s); g.add(patch);
  }

  // ---------------------------------------------------------------
  //  MEDIC
  // ---------------------------------------------------------------
  function _buildMedicModel(g, tc, ac, s) {
    // Body (similar to infantry but lighter color)
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(0.35 * s, 0.5 * s, 0.25 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.6, metalness: 0.3 })
    );
    body.position.y = 0.55 * s; body.castShadow = true; g.add(body);

    // Cross symbol on body
    var crossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.2 * s, 0.06 * s, 0.02 * s),
      new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff3333, emissiveIntensity: 0.5 })
    );
    crossH.position.set(0, 0.6 * s, 0.14 * s); g.add(crossH);

    var crossV = new THREE.Mesh(
      new THREE.BoxGeometry(0.06 * s, 0.2 * s, 0.02 * s),
      new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff3333, emissiveIntensity: 0.5 })
    );
    crossV.position.set(0, 0.6 * s, 0.14 * s); g.add(crossV);

    // Head
    var head = new THREE.Mesh(
      new THREE.SphereGeometry(0.14 * s, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xddbb99, roughness: 0.7 })
    );
    head.position.y = 0.95 * s; g.add(head);

    // White helmet
    var helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.16 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 })
    );
    helmet.position.y = 1.0 * s; g.add(helmet);

    // Medical pack
    var medpack = new THREE.Mesh(
      new THREE.BoxGeometry(0.3 * s, 0.3 * s, 0.15 * s),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 })
    );
    medpack.position.set(0, 0.6 * s, -0.2 * s); g.add(medpack);

    // Cross on pack
    var packCrossH = new THREE.Mesh(
      new THREE.BoxGeometry(0.15 * s, 0.04 * s, 0.02 * s),
      new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff3333, emissiveIntensity: 0.4 })
    );
    packCrossH.position.set(0, 0.6 * s, -0.28 * s); g.add(packCrossH);

    // Arms and legs
    [-1, 1].forEach(function (side) {
      var arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.1 * s, 0.35 * s, 0.1 * s),
        new THREE.MeshStandardMaterial({ color: tc, roughness: 0.6 })
      );
      arm.position.set(side * 0.22 * s, 0.5 * s, 0); g.add(arm);

      var leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.12 * s, 0.35 * s, 0.14 * s),
        new THREE.MeshStandardMaterial({ color: 0x334433, roughness: 0.8 })
      );
      leg.position.set(side * 0.1 * s, 0.17 * s, 0); g.add(leg);
    });
  }

  // ---------------------------------------------------------------
  //  ENGINEER
  // ---------------------------------------------------------------
  function _buildEngineerModel(g, tc, ac, s) {
    // Bulky body
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(0.4 * s, 0.5 * s, 0.35 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.6, metalness: 0.3 })
    );
    body.position.y = 0.55 * s; body.castShadow = true; g.add(body);

    // Head with construction hat
    var head = new THREE.Mesh(
      new THREE.SphereGeometry(0.14 * s, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xddbb99, roughness: 0.7 })
    );
    head.position.y = 0.95 * s; g.add(head);

    // Hard hat (yellow)
    var hat = new THREE.Mesh(
      new THREE.SphereGeometry(0.17 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0xddaa00, roughness: 0.5 })
    );
    hat.position.y = 1.02 * s; g.add(hat);

    // Hat brim
    var brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 0.03 * s, 12),
      new THREE.MeshStandardMaterial({ color: 0xddaa00, roughness: 0.5 })
    );
    brim.position.y = 0.97 * s; g.add(brim);

    // Tool belt
    var belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.42 * s, 0.06 * s, 0.37 * s),
      new THREE.MeshStandardMaterial({ color: 0x553311, roughness: 0.9 })
    );
    belt.position.set(0, 0.35 * s, 0); g.add(belt);

    // Wrench
    var wrench = new THREE.Mesh(
      new THREE.BoxGeometry(0.05 * s, 0.4 * s, 0.05 * s),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7 })
    );
    wrench.position.set(0.25 * s, 0.5 * s, 0.1 * s);
    wrench.rotation.z = 0.3; g.add(wrench);

    // Turret backpack
    var turretPack = new THREE.Mesh(
      new THREE.BoxGeometry(0.3 * s, 0.3 * s, 0.2 * s),
      new THREE.MeshStandardMaterial({ color: 0x445544, roughness: 0.7, metalness: 0.3 })
    );
    turretPack.position.set(0, 0.6 * s, -0.25 * s); g.add(turretPack);

    // Accent
    var accent = new THREE.Mesh(
      new THREE.BoxGeometry(0.1 * s, 0.1 * s, 0.02 * s),
      new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 0.5 })
    );
    accent.position.set(0, 0.65 * s, 0.19 * s); g.add(accent);

    // Legs
    [-1, 1].forEach(function (side) {
      var leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.12 * s, 0.35 * s, 0.14 * s),
        new THREE.MeshStandardMaterial({ color: 0x334433, roughness: 0.8 })
      );
      leg.position.set(side * 0.1 * s, 0.17 * s, 0); g.add(leg);
    });
  }

  // ---------------------------------------------------------------
  //  HELICOPTER
  // ---------------------------------------------------------------
  function _buildHelicopterModel(g, tc, ac, s) {
    // Fuselage
    var fuselage = new THREE.Mesh(
      new THREE.BoxGeometry(1.0 * s, 0.35 * s, 0.4 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.4, metalness: 0.6 })
    );
    fuselage.position.y = 0.6 * s; fuselage.castShadow = true; g.add(fuselage);

    // Cockpit
    var cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.22 * s, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.7, transparent: true, opacity: 0.6 })
    );
    cockpit.position.set(0.4 * s, 0.7 * s, 0);
    cockpit.rotation.z = -0.3; g.add(cockpit);

    // Tail boom
    var tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.8 * s, 0.12 * s, 0.1 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.5, metalness: 0.5 })
    );
    tail.position.set(-0.8 * s, 0.6 * s, 0); g.add(tail);

    // Tail fin
    var fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.06 * s, 0.25 * s, 0.15 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.5, metalness: 0.5 })
    );
    fin.position.set(-1.15 * s, 0.7 * s, 0); g.add(fin);

    // Main rotor hub
    var hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.1 * s, 8),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 })
    );
    hub.position.set(0, 0.85 * s, 0); g.add(hub);

    // Main rotor blades - tagged for animation
    var rotorGroup = new THREE.Group();
    rotorGroup.userData.isMainRotor = true;
    for (var i = 0; i < 4; i++) {
      var blade = new THREE.Mesh(
        new THREE.BoxGeometry(1.2 * s, 0.02 * s, 0.08 * s),
        new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5, transparent: true, opacity: 0.7 })
      );
      blade.rotation.y = (Math.PI / 2) * i;
      rotorGroup.add(blade);
    }
    rotorGroup.position.set(0, 0.9 * s, 0);
    g.add(rotorGroup);

    // Tail rotor
    var tailRotor = new THREE.Group();
    tailRotor.userData.isTailRotor = true;
    for (var j = 0; j < 2; j++) {
      var tb = new THREE.Mesh(
        new THREE.BoxGeometry(0.02 * s, 0.3 * s, 0.04 * s),
        new THREE.MeshStandardMaterial({ color: 0x444444, transparent: true, opacity: 0.7 })
      );
      tb.rotation.z = (Math.PI / 2) * j;
      tailRotor.add(tb);
    }
    tailRotor.position.set(-1.15 * s, 0.7 * s, 0.1 * s);
    g.add(tailRotor);

    // Landing skids
    [-1, 1].forEach(function (side) {
      var skid = new THREE.Mesh(
        new THREE.BoxGeometry(0.8 * s, 0.03 * s, 0.03 * s),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
      );
      skid.position.set(0.05 * s, 0.3 * s, side * 0.25 * s); g.add(skid);

      // Struts
      [-1, 1].forEach(function (fb) {
        var strut = new THREE.Mesh(
          new THREE.BoxGeometry(0.02 * s, 0.2 * s, 0.02 * s),
          new THREE.MeshStandardMaterial({ color: 0x333333 })
        );
        strut.position.set(fb * 0.25 * s, 0.4 * s, side * 0.2 * s); g.add(strut);
      });
    });

    // Missile pods
    [-1, 1].forEach(function (side) {
      var pod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.25 * s, 6),
        new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6 })
      );
      pod.rotation.z = Math.PI / 2;
      pod.position.set(0.1 * s, 0.5 * s, side * 0.3 * s); g.add(pod);
    });

    // Accent stripe
    var aStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.04 * s, 0.04 * s, 0.42 * s),
      new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 0.5 })
    );
    aStripe.position.set(0, 0.79 * s, 0); g.add(aStripe);
  }

  // ---------------------------------------------------------------
  //  MISSILE LAUNCHER
  // ---------------------------------------------------------------
  function _buildMissileLauncherModel(g, tc, ac, s) {
    // Truck bed
    var bed = new THREE.Mesh(
      new THREE.BoxGeometry(1.3 * s, 0.3 * s, 0.8 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.5, metalness: 0.5 })
    );
    bed.position.y = 0.25 * s; bed.castShadow = true; g.add(bed);

    // Cab
    var cab = new THREE.Mesh(
      new THREE.BoxGeometry(0.4 * s, 0.35 * s, 0.7 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.5, metalness: 0.4 })
    );
    cab.position.set(0.55 * s, 0.35 * s, 0); cab.castShadow = true; g.add(cab);

    // Windshield
    var windshield = new THREE.Mesh(
      new THREE.BoxGeometry(0.04 * s, 0.2 * s, 0.6 * s),
      new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.6 })
    );
    windshield.position.set(0.73 * s, 0.4 * s, 0); g.add(windshield);

    // Missile rack (4 tubes)
    for (var row = 0; row < 2; row++) {
      for (var col = 0; col < 2; col++) {
        var tube = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08 * s, 0.08 * s, 0.7 * s, 8),
          new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.7 })
        );
        tube.rotation.z = Math.PI / 3;
        tube.position.set(
          -0.1 * s + row * 0.05 * s,
          0.55 * s + row * 0.18 * s,
          (col - 0.5) * 0.2 * s
        );
        g.add(tube);

        // Missile tip
        var tip = new THREE.Mesh(
          new THREE.ConeGeometry(0.07 * s, 0.12 * s, 8),
          new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 0.4 })
        );
        tip.rotation.z = -Math.PI / 6;
        tip.position.set(
          0.18 * s + row * 0.05 * s,
          0.7 * s + row * 0.18 * s,
          (col - 0.5) * 0.2 * s
        );
        g.add(tip);
      }
    }

    // Stabilizer legs
    [-1, 1].forEach(function (side) {
      var leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.5 * s, 0.05 * s, 0.05 * s),
        new THREE.MeshStandardMaterial({ color: 0x444444 })
      );
      leg.position.set(-0.5 * s, 0.08 * s, side * 0.45 * s);
      leg.rotation.y = side * 0.2; g.add(leg);
    });

    // Wheels
    [-1, 1].forEach(function (side) {
      [-1, 0, 1].forEach(function (pos) {
        var w = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1 * s, 0.1 * s, 0.06 * s, 10),
          new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 })
        );
        w.rotation.x = Math.PI / 2;
        w.position.set(pos * 0.4 * s, 0.1 * s, side * 0.43 * s);
        g.add(w);
      });
    });

    // Targeting dish
    var dish = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01 * s, 0.1 * s, 0.05 * s, 8),
      new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.7 })
    );
    dish.position.set(0.55 * s, 0.58 * s, 0.3 * s);
    dish.rotation.z = 0.3; g.add(dish);
  }

  // ---------------------------------------------------------------
  //  HEAVY MECH
  // ---------------------------------------------------------------
  function _buildHeavyMechModel(g, tc, ac, s) {
    // Torso
    var torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.7 * s, 0.6 * s, 0.5 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.35, metalness: 0.7 })
    );
    torso.position.y = 1.1 * s; torso.castShadow = true; g.add(torso);

    // Cockpit dome
    var cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.18 * s, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, metalness: 0.7, transparent: true, opacity: 0.6 })
    );
    cockpit.position.set(0, 1.45 * s, 0.15 * s); g.add(cockpit);

    // Glowing core in chest
    var core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.1 * s, 0),
      new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 1.5 })
    );
    core.position.set(0, 1.1 * s, 0.26 * s); g.add(core);

    // Shoulder cannons
    [-1, 1].forEach(function (side) {
      // Shoulder mount
      var shoulder = new THREE.Mesh(
        new THREE.BoxGeometry(0.2 * s, 0.2 * s, 0.2 * s),
        new THREE.MeshStandardMaterial({ color: tc, roughness: 0.4, metalness: 0.6 })
      );
      shoulder.position.set(side * 0.45 * s, 1.3 * s, 0); g.add(shoulder);

      // Cannon
      var cannon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.5 * s, 6),
        new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 })
      );
      cannon.rotation.z = Math.PI / 2;
      cannon.position.set(side * 0.45 * s + side * 0.1 * s, 1.35 * s, 0.2 * s);
      g.add(cannon);
    });

    // Legs
    [-1, 1].forEach(function (side) {
      // Upper leg
      var upperLeg = new THREE.Mesh(
        new THREE.BoxGeometry(0.18 * s, 0.4 * s, 0.18 * s),
        new THREE.MeshStandardMaterial({ color: tc, roughness: 0.4, metalness: 0.6 })
      );
      upperLeg.position.set(side * 0.22 * s, 0.65 * s, 0);
      upperLeg.castShadow = true; g.add(upperLeg);

      // Knee joint
      var knee = new THREE.Mesh(
        new THREE.SphereGeometry(0.1 * s, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7 })
      );
      knee.position.set(side * 0.22 * s, 0.45 * s, 0); g.add(knee);

      // Lower leg
      var lowerLeg = new THREE.Mesh(
        new THREE.BoxGeometry(0.15 * s, 0.35 * s, 0.2 * s),
        new THREE.MeshStandardMaterial({ color: tc, roughness: 0.5, metalness: 0.5 })
      );
      lowerLeg.position.set(side * 0.22 * s, 0.2 * s, 0.03 * s);
      lowerLeg.castShadow = true; g.add(lowerLeg);

      // Foot
      var foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.2 * s, 0.06 * s, 0.25 * s),
        new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5 })
      );
      foot.position.set(side * 0.22 * s, 0.03 * s, 0.05 * s);
      g.add(foot);
    });

    // Accent glow strip
    var glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.72 * s, 0.04 * s, 0.02 * s),
      new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 0.8 })
    );
    glow.position.set(0, 0.85 * s, 0.26 * s); g.add(glow);
  }

  // ---------------------------------------------------------------
  //  DRONE
  // ---------------------------------------------------------------
  function _buildDroneModel(g, tc, ac, s) {
    // Central body
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(0.25 * s, 0.1 * s, 0.25 * s),
      new THREE.MeshStandardMaterial({ color: tc, roughness: 0.3, metalness: 0.6 })
    );
    body.position.y = 0.7 * s; body.castShadow = true; g.add(body);

    // Camera underneath
    var cam = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 * s, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 })
    );
    cam.position.set(0, 0.63 * s, 0.05 * s); g.add(cam);

    // Camera lens
    var lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.02 * s, 6, 6),
      new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 1.0 })
    );
    lens.position.set(0, 0.63 * s, 0.08 * s); g.add(lens);

    // Arms + rotors
    var rotorGroup = new THREE.Group();
    rotorGroup.userData.isDroneRotor = true;
    rotorGroup.position.y = 0.75 * s;

    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (pos) {
      // Arm
      var arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.2 * s, 0.03 * s, 0.03 * s),
        new THREE.MeshStandardMaterial({ color: 0x444444 })
      );
      arm.position.set(pos[0] * 0.15 * s, 0, pos[1] * 0.15 * s);
      arm.rotation.y = Math.atan2(pos[1], pos[0]);
      rotorGroup.add(arm);

      // Motor
      var motor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.04 * s, 6),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
      );
      motor.position.set(pos[0] * 0.22 * s, 0.02 * s, pos[1] * 0.22 * s);
      rotorGroup.add(motor);

      // Rotor disc (visual)
      var rotor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1 * s, 0.1 * s, 0.01 * s, 12),
        new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.3 })
      );
      rotor.position.set(pos[0] * 0.22 * s, 0.04 * s, pos[1] * 0.22 * s);
      rotorGroup.add(rotor);
    });
    g.add(rotorGroup);

    // LED lights
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (pos) {
      var led = new THREE.Mesh(
        new THREE.SphereGeometry(0.015 * s, 4, 4),
        new THREE.MeshStandardMaterial({ color: ac, emissive: ac, emissiveIntensity: 1.2 })
      );
      led.position.set(pos[0] * 0.13 * s, 0.68 * s, pos[1] * 0.13 * s);
      g.add(led);
    });
  }

  // ---------------------------------------------------------------
  //  4. HIGHLIGHTS
  // ---------------------------------------------------------------
  IRON.clearHighlights = function () {
    while (IRON.highlightGroup.children.length) {
      var c = IRON.highlightGroup.children[0];
      IRON.highlightGroup.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    IRON.state.moveHighlights = [];
    IRON.state.attackHighlights = [];
    if (IRON.state.healHighlights) IRON.state.healHighlights = [];
  };

  function _makeHighlight(x, z, color, opacity, userData) {
    var tile = IRON.state.grid[x][z];
    var mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE_SIZE - 0.2, TILE_SIZE - 0.2),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x * TILE_SIZE + TILE_SIZE / 2, TILE_HEIGHT + (tile.elevation || 0) + 0.02, z * TILE_SIZE + TILE_SIZE / 2);
    mesh.userData = userData;
    IRON.highlightGroup.add(mesh);
    return mesh;
  }

  IRON.showMoveHighlights = function (tiles) {
    IRON.clearHighlights();
    IRON.state.moveHighlights = tiles;
    tiles.forEach(function (t) {
      _makeHighlight(t.x, t.z, 0x00ff88, 0.25, { type: 'moveHighlight', x: t.x, z: t.z, tileX: t.x, tileZ: t.z });
    });
  };

  IRON.showAttackHighlights = function (tiles) {
    IRON.clearHighlights();
    IRON.state.attackHighlights = tiles;
    tiles.forEach(function (t) {
      _makeHighlight(t.x, t.z, 0xff3355, 0.35, { type: 'attackHighlight', x: t.x, z: t.z, tileX: t.x, tileZ: t.z });

      // Pulse ring
      var tile = IRON.state.grid[t.x][t.z];
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 0.85, 6),
        new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(t.x * TILE_SIZE + TILE_SIZE / 2, TILE_HEIGHT + (tile.elevation || 0) + 0.03, t.z * TILE_SIZE + TILE_SIZE / 2);
      ring.userData = { pulseRing: true };
      IRON.highlightGroup.add(ring);
    });
  };

  IRON.showHealHighlights = function (tiles) {
    IRON.clearHighlights();
    IRON.state.healHighlights = tiles;
    tiles.forEach(function (t) {
      _makeHighlight(t.x, t.z, 0x00ff44, 0.3, { type: 'healHighlight', x: t.x, z: t.z, tileX: t.x, tileZ: t.z });
    });
  };

  // ---------------------------------------------------------------
  //  5. VISUAL EFFECTS
  // ---------------------------------------------------------------
  IRON.updateHealthBar = function (unit) {
    if (!unit.mesh) return;
    unit.mesh.traverse(function (c) {
      if (c.userData && c.userData.isHpBar) {
        var pct = unit.hp / unit.maxHp;
        var fill = c.userData.fill;
        fill.scale.x = Math.max(0.01, pct);
        fill.position.x = -(1.18 * (1 - pct)) / 2;
        fill.material.color.setHex(pct > 0.6 ? 0x00ff66 : pct > 0.3 ? 0xffaa00 : 0xff3344);
      }
    });
  };

  IRON.setSelectionRing = function (unit, visible) {
    if (!unit || !unit.mesh) return;
    unit.mesh.traverse(function (c) {
      if (c.userData && c.userData.isSelRing) {
        c.material.opacity = visible ? 0.7 : 0;
      }
    });
  };

  IRON.flashUnit = function (unit) {
    if (!unit.mesh) return;
    var orig = [];
    unit.mesh.traverse(function (c) {
      if (c.isMesh && c.material && !(c.userData && c.userData.isHpBar) && !(c.userData && c.userData.isSelRing)) {
        orig.push({ m: c, col: c.material.color.clone() });
        c.material.color.setHex(0xffffff);
      }
    });
    setTimeout(function () {
      orig.forEach(function (o) { if (o.m.material) o.m.material.color.copy(o.col); });
    }, 150);
  };

  IRON.spawnDamageEffect = function (unit, damage) {
    var cv = document.createElement('canvas');
    cv.width = 128; cv.height = 64;
    var ctx = cv.getContext('2d');
    ctx.font = 'bold 36px Orbitron, monospace';
    ctx.fillStyle = '#ff3355';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.strokeText('-' + damage, 64, 42);
    ctx.fillText('-' + damage, 64, 42);

    var tex = new THREE.CanvasTexture(cv);
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    var tile = IRON.state.grid[unit.x][unit.z];
    sprite.position.set(unit.x * TILE_SIZE + TILE_SIZE / 2, TILE_HEIGHT + (tile.elevation || 0) + 2.5, unit.z * TILE_SIZE + TILE_SIZE / 2);
    sprite.scale.set(1.5, 0.75, 1);
    IRON.effectGroup.add(sprite);

    // Particles
    var particles = [];
    for (var i = 0; i < 15; i++) {
      var p = new THREE.Mesh(
        new THREE.SphereGeometry(0.05 + Math.random() * 0.08, 4, 4),
        new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xff6622 : 0xffaa00, transparent: true })
      );
      p.position.set(
        sprite.position.x + (Math.random() - 0.5) * 0.5,
        sprite.position.y - 1.5 + Math.random() * 0.5,
        sprite.position.z + (Math.random() - 0.5) * 0.5
      );
      p.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.08 + Math.random() * 0.12, (Math.random() - 0.5) * 0.15);
      IRON.effectGroup.add(p);
      particles.push(p);
    }

    var f = 0;
    var iv = setInterval(function () {
      f++;
      sprite.position.y += 0.04;
      sprite.material.opacity = Math.max(0, 1 - f / 40);
      particles.forEach(function (p) {
        p.position.add(p.userData.vel);
        p.userData.vel.y -= 0.005;
        p.material.opacity = Math.max(0, 1 - f / 25);
      });
      if (f > 45) {
        clearInterval(iv);
        IRON.effectGroup.remove(sprite);
        sprite.material.map.dispose();
        sprite.material.dispose();
        particles.forEach(function (p) {
          IRON.effectGroup.remove(p);
          p.geometry.dispose();
          p.material.dispose();
        });
      }
    }, 30);
  };

  IRON.spawnHealEffect = function (unit, amount) {
    var cv = document.createElement('canvas');
    cv.width = 128; cv.height = 64;
    var ctx = cv.getContext('2d');
    ctx.font = 'bold 36px Orbitron, monospace';
    ctx.fillStyle = '#00ff66';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.strokeText('+' + amount, 64, 42);
    ctx.fillText('+' + amount, 64, 42);

    var tex = new THREE.CanvasTexture(cv);
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    var tile = IRON.state.grid[unit.x][unit.z];
    sprite.position.set(unit.x * TILE_SIZE + TILE_SIZE / 2, TILE_HEIGHT + (tile.elevation || 0) + 2.5, unit.z * TILE_SIZE + TILE_SIZE / 2);
    sprite.scale.set(1.5, 0.75, 1);
    IRON.effectGroup.add(sprite);

    // Green particles rising
    var particles = [];
    for (var i = 0; i < 10; i++) {
      var p = new THREE.Mesh(
        new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true })
      );
      p.position.set(
        sprite.position.x + (Math.random() - 0.5) * 0.6,
        sprite.position.y - 2 + Math.random() * 0.5,
        sprite.position.z + (Math.random() - 0.5) * 0.6
      );
      p.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.06 + Math.random() * 0.04, (Math.random() - 0.5) * 0.02);
      IRON.effectGroup.add(p);
      particles.push(p);
    }

    var f = 0;
    var iv = setInterval(function () {
      f++;
      sprite.position.y += 0.03;
      sprite.material.opacity = Math.max(0, 1 - f / 40);
      particles.forEach(function (p) {
        p.position.add(p.userData.vel);
        p.material.opacity = Math.max(0, 1 - f / 30);
      });
      if (f > 45) {
        clearInterval(iv);
        IRON.effectGroup.remove(sprite);
        sprite.material.map.dispose();
        sprite.material.dispose();
        particles.forEach(function (p) {
          IRON.effectGroup.remove(p);
          p.geometry.dispose();
          p.material.dispose();
        });
      }
    }, 30);
  };

  IRON.spawnExplosionEffect = function (x, z) {
    var tile = IRON.state.grid[x] ? IRON.state.grid[x][z] : null;
    var elev = tile ? (tile.elevation || 0) : 0;
    var cx = x * TILE_SIZE + TILE_SIZE / 2;
    var cy = TILE_HEIGHT + elev + 0.5;
    var cz = z * TILE_SIZE + TILE_SIZE / 2;

    // Flash sphere
    var flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9 })
    );
    flash.position.set(cx, cy, cz);
    IRON.effectGroup.add(flash);

    // Smoke particles
    var parts = [];
    for (var i = 0; i < 20; i++) {
      var p = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 + Math.random() * 0.12, 4, 4),
        new THREE.MeshBasicMaterial({ color: Math.random() > 0.3 ? 0xff6600 : 0x444444, transparent: true })
      );
      p.position.set(cx + (Math.random() - 0.5) * 0.3, cy + Math.random() * 0.3, cz + (Math.random() - 0.5) * 0.3);
      p.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.1 + Math.random() * 0.15, (Math.random() - 0.5) * 0.2);
      IRON.effectGroup.add(p);
      parts.push(p);
    }

    var f = 0;
    var iv = setInterval(function () {
      f++;
      flash.scale.setScalar(1 + f * 0.1);
      flash.material.opacity = Math.max(0, 0.9 - f / 15);
      parts.forEach(function (p) {
        p.position.add(p.userData.vel);
        p.userData.vel.y -= 0.003;
        p.material.opacity = Math.max(0, 1 - f / 30);
      });
      if (f > 35) {
        clearInterval(iv);
        IRON.effectGroup.remove(flash);
        flash.geometry.dispose();
        flash.material.dispose();
        parts.forEach(function (p) {
          IRON.effectGroup.remove(p);
          p.geometry.dispose();
          p.material.dispose();
        });
      }
    }, 30);
  };

  IRON.spawnProjectileEffect = function (attacker, defender) {
    return new Promise(function (resolve) {
      var fromTile = IRON.state.grid[attacker.x][attacker.z];
      var toTile = IRON.state.grid[defender.x][defender.z];
      var start = new THREE.Vector3(
        attacker.x * TILE_SIZE + TILE_SIZE / 2,
        TILE_HEIGHT + (fromTile.elevation || 0) + 0.7,
        attacker.z * TILE_SIZE + TILE_SIZE / 2
      );
      var end = new THREE.Vector3(
        defender.x * TILE_SIZE + TILE_SIZE / 2,
        TILE_HEIGHT + (toTile.elevation || 0) + 0.7,
        defender.z * TILE_SIZE + TILE_SIZE / 2
      );

      var bullet = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffaa00 })
      );
      bullet.position.copy(start);
      IRON.effectGroup.add(bullet);

      // Trail particles
      var trail = [];
      var dur = 300;
      var startTime = Date.now();

      function animProjectile() {
        var t = Math.min(1, (Date.now() - startTime) / dur);
        bullet.position.lerpVectors(start, end, t);
        bullet.position.y += Math.sin(t * Math.PI) * 0.5;

        // Add trail particle
        if (trail.length < 15) {
          var tp = new THREE.Mesh(
            new THREE.SphereGeometry(0.03, 4, 4),
            new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.6 })
          );
          tp.position.copy(bullet.position);
          IRON.effectGroup.add(tp);
          trail.push({ mesh: tp, life: 15 });
        }

        // Fade trail
        trail.forEach(function (tp) {
          tp.life--;
          tp.mesh.material.opacity = Math.max(0, tp.life / 15);
        });

        if (t < 1) {
          requestAnimationFrame(animProjectile);
        } else {
          // Clean up
          IRON.effectGroup.remove(bullet);
          bullet.geometry.dispose();
          bullet.material.dispose();
          setTimeout(function () {
            trail.forEach(function (tp) {
              IRON.effectGroup.remove(tp.mesh);
              tp.mesh.geometry.dispose();
              tp.mesh.material.dispose();
            });
          }, 200);
          resolve();
        }
      }
      animProjectile();
    });
  };

  IRON.spawnMissileEffect = function (attacker, targets) {
    return new Promise(function (resolve) {
      if (!targets || targets.length === 0) { resolve(); return; }
      var target = targets[0];
      var fromTile = IRON.state.grid[attacker.x][attacker.z];
      var toTile = IRON.state.grid[target.x][target.z];
      var start = new THREE.Vector3(
        attacker.x * TILE_SIZE + TILE_SIZE / 2,
        TILE_HEIGHT + (fromTile.elevation || 0) + 1.0,
        attacker.z * TILE_SIZE + TILE_SIZE / 2
      );
      var end = new THREE.Vector3(
        target.x * TILE_SIZE + TILE_SIZE / 2,
        TILE_HEIGHT + (toTile.elevation || 0) + 0.5,
        target.z * TILE_SIZE + TILE_SIZE / 2
      );
      var mid = start.clone().add(end).multiplyScalar(0.5);
      mid.y += 6; // Arc high

      var missile = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.25, 6),
        new THREE.MeshBasicMaterial({ color: 0xff4400 })
      );
      missile.position.copy(start);
      IRON.effectGroup.add(missile);

      var trail = [];
      var dur = 600;
      var startTime = Date.now();

      function animMissile() {
        var t = Math.min(1, (Date.now() - startTime) / dur);
        // Quadratic bezier
        var invT = 1 - t;
        missile.position.x = invT * invT * start.x + 2 * invT * t * mid.x + t * t * end.x;
        missile.position.y = invT * invT * start.y + 2 * invT * t * mid.y + t * t * end.y;
        missile.position.z = invT * invT * start.z + 2 * invT * t * mid.z + t * t * end.z;

        // Point missile in direction of travel
        if (t < 0.98) {
          var nextT = Math.min(1, t + 0.02);
          var invN = 1 - nextT;
          var nextPos = new THREE.Vector3(
            invN * invN * start.x + 2 * invN * nextT * mid.x + nextT * nextT * end.x,
            invN * invN * start.y + 2 * invN * nextT * mid.y + nextT * nextT * end.y,
            invN * invN * start.z + 2 * invN * nextT * mid.z + nextT * nextT * end.z
          );
          missile.lookAt(nextPos);
        }

        // Smoke trail
        if (trail.length < 25) {
          var smoke = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 4, 4),
            new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 })
          );
          smoke.position.copy(missile.position);
          IRON.effectGroup.add(smoke);
          trail.push({ mesh: smoke, life: 20 });
        }

        trail.forEach(function (tp) {
          tp.life--;
          tp.mesh.material.opacity = Math.max(0, tp.life / 20 * 0.5);
          tp.mesh.scale.setScalar(1 + (20 - tp.life) * 0.05);
        });

        if (t < 1) {
          requestAnimationFrame(animMissile);
        } else {
          IRON.effectGroup.remove(missile);
          missile.geometry.dispose();
          missile.material.dispose();
          setTimeout(function () {
            trail.forEach(function (tp) {
              IRON.effectGroup.remove(tp.mesh);
              tp.mesh.geometry.dispose();
              tp.mesh.material.dispose();
            });
          }, 300);
          resolve();
        }
      }
      animMissile();
    });
  };

  IRON.destroyUnitAnim = function (unit) {
    if (!unit.mesh) return Promise.resolve();
    var startY = unit.mesh.position.y;
    return new Promise(function (resolve) {
      var f = 0;
      var iv = setInterval(function () {
        f++;
        unit.mesh.position.y = startY - f * 0.03;
        unit.mesh.traverse(function (c) {
          if (c.isMesh && c.material) {
            c.material.transparent = true;
            c.material.opacity = Math.max(0, 1 - f / 30);
          }
        });
        if (f > 30) {
          clearInterval(iv);
          if (unit.mesh.parent) unit.mesh.parent.remove(unit.mesh);
          resolve();
        }
      }, 30);
    });
  };

  IRON.moveUnitAnim = function (unit, tx, tz, grid) {
    return new Promise(function (resolve) {
      if (!grid || !grid[unit.x]) { resolve(); return; }
      var srcTile = grid[unit.x][unit.z];
      grid[unit.x][unit.z].unit = null;

      var startPos = unit.mesh.position.clone();
      var targetTile = grid[tx][tz];
      var endPos = new THREE.Vector3(
        tx * TILE_SIZE + TILE_SIZE / 2,
        TILE_HEIGHT + (targetTile.elevation || 0),
        tz * TILE_SIZE + TILE_SIZE / 2
      );

      // Rotate unit to face direction
      var dx = endPos.x - startPos.x;
      var dz = endPos.z - startPos.z;
      if (dx !== 0 || dz !== 0) {
        unit.mesh.rotation.y = Math.atan2(dx, dz);
      }

      var dur = 400;
      var startTime = Date.now();

      (function anim() {
        var t = Math.min(1, (Date.now() - startTime) / dur);
        var e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease in-out
        unit.mesh.position.lerpVectors(startPos, endPos, e);
        unit.mesh.position.y += Math.sin(t * Math.PI) * 0.5;
        if (t < 1) {
          requestAnimationFrame(anim);
        } else {
          unit.mesh.position.copy(endPos);
          unit.x = tx;
          unit.z = tz;
          grid[tx][tz].unit = unit;
          unit.hasMoved = true;
          resolve();
        }
      })();
    });
  };

  // ---------------------------------------------------------------
  //  6. MINIMAP
  // ---------------------------------------------------------------
  IRON.updateMinimap = function (grid, units) {
    var cvEl = document.getElementById('minimapCanvas');
    if (!cvEl || !grid || !grid[0]) return;
    var ctx = cvEl.getContext('2d');
    ctx.clearRect(0, 0, 160, 160);
    var tw = 160 / GRID_W;
    var th = 160 / GRID_H;

    for (var x = 0; x < GRID_W; x++) {
      for (var z = 0; z < GRID_H; z++) {
        if (!grid[x] || !grid[x][z]) continue;
        var tile = grid[x][z];
        ctx.fillStyle = '#' + tile.terrain.color.toString(16).padStart(6, '0');
        ctx.fillRect(x * tw, z * th, tw - 0.5, th - 0.5);
        if (tile.unit && !tile.unit.isDead) {
          ctx.fillStyle = tile.unit.team === 'blue' ? '#00aaff' : '#ff4444';
          ctx.beginPath();
          ctx.arc(x * tw + tw / 2, z * th + th / 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Camera indicator
    if (IRON.camState) {
      var camX = IRON.camState.center.x / TILE_SIZE;
      var camZ = IRON.camState.center.z / TILE_SIZE;
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1;
      ctx.strokeRect(camX * tw - 15, camZ * th - 10, 30, 20);
    }
  };

  // ---------------------------------------------------------------
  //  7. CAMERA
  // ---------------------------------------------------------------
  IRON.updateCamera = function () {
    var cs = IRON.camState;
    if (!cs) return;

    var spd = 0.3;
    if (cs.keys['w'] || cs.keys['arrowup']) cs.targetCenter.z -= spd;
    if (cs.keys['s'] || cs.keys['arrowdown']) cs.targetCenter.z += spd;
    if (cs.keys['a'] || cs.keys['arrowleft']) cs.targetCenter.x -= spd;
    if (cs.keys['d'] || cs.keys['arrowright']) cs.targetCenter.x += spd;
    if (cs.keys['q']) cs.targetAngle -= 0.02;
    if (cs.keys['e']) cs.targetAngle += 0.02;

    // Apply rotation delta from mouse drag
    if (cs.rotDeltaX) {
      cs.targetAngle -= cs.rotDeltaX;
      cs.rotDeltaX = 0;
    }
    if (cs.rotDeltaY) {
      cs.targetHeight = Math.max(10, Math.min(60, cs.targetHeight + cs.rotDeltaY * 20));
      cs.rotDeltaY = 0;
    }

    // Apply zoom delta
    if (cs.zoomDelta) {
      cs.targetDist = Math.max(15, Math.min(70, cs.targetDist + cs.zoomDelta * 3));
      cs.zoomDelta = 0;
    }

    // Smooth interpolation
    cs.angle += (cs.targetAngle - cs.angle) * 0.08;
    cs.dist += (cs.targetDist - cs.dist) * 0.08;
    cs.height += (cs.targetHeight - cs.height) * 0.08;
    cs.center.lerp(cs.targetCenter, 0.08);

    IRON.camera.position.set(
      cs.center.x + Math.cos(cs.angle) * cs.dist,
      cs.height,
      cs.center.z + Math.sin(cs.angle) * cs.dist
    );
    IRON.camera.lookAt(cs.center);
  };

  // ---------------------------------------------------------------
  //  8. ANIMATE SCENE (per-frame)
  // ---------------------------------------------------------------
  IRON.animateScene = function (time) {
    // Pulse highlights
    IRON.highlightGroup.children.forEach(function (c) {
      if (c.userData && c.userData.pulseRing) {
        c.material.opacity = 0.2 + Math.sin(time * 4) * 0.2;
        c.scale.setScalar(1 + Math.sin(time * 3) * 0.05);
      } else if (c.userData && c.userData.type) {
        c.material.opacity = 0.15 + Math.sin(time * 3) * 0.1;
      }
    });

    // Idle bob for units
    if (IRON.state && IRON.state.units) {
      IRON.state.units.forEach(function (u) {
        if (u.isDead || !u.mesh || !IRON.state.grid[u.x]) return;
        var tile = IRON.state.grid[u.x][u.z];
        if (!tile) return;
        var baseY = TILE_HEIGHT + (tile.elevation || 0);
        // Flying units hover higher
        if (u.typeData && u.typeData.flying) {
          u.mesh.position.y = baseY + 0.8 + Math.sin(time * 2 + u.x * 0.5) * 0.1;
        } else {
          u.mesh.position.y = baseY + Math.sin(time * 2 + u.x * 0.5) * 0.03;
        }
      });
    }

    // HP bars face camera
    IRON.unitGroup.children.forEach(function (g) {
      g.traverse(function (c) {
        if (c.userData && c.userData.isHpBar) {
          c.lookAt(IRON.camera.position);
        }
      });
    });

    // Rotate helicopter rotors
    IRON.unitGroup.children.forEach(function (g) {
      g.traverse(function (c) {
        if (c.userData && c.userData.isMainRotor) {
          c.rotation.y += 0.3;
        }
        if (c.userData && c.userData.isTailRotor) {
          c.rotation.z += 0.4;
        }
        if (c.userData && c.userData.isDroneRotor) {
          c.rotation.y += 0.25;
        }
      });
    });

    // Ambient particles drift
    IRON.scene.children.forEach(function (c) {
      if (c.userData && c.userData.isParticles) {
        var pos = c.geometry.attributes.position;
        for (var i = 0; i < pos.count; i++) {
          pos.array[i * 3] += Math.sin(time + i) * 0.002;
          pos.array[i * 3 + 1] += Math.cos(time * 0.5 + i * 0.3) * 0.001;
        }
        pos.needsUpdate = true;
      }
    });

    // Water shimmer
    IRON.tileGroup.children.forEach(function (c) {
      if (c.userData && c.userData.isWater) {
        c.position.y += Math.sin(time * 2 + c.position.x) * 0.0005;
      }
    });
  };

})();
