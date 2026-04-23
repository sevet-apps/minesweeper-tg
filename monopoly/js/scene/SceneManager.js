/* ============================================================
   SceneManager.js
   Sets up Three.js scene + Cannon-es physics world.
   Owns: renderer, scene, camera rig, lights, arena floor/walls,
         render loop, resize handling, and a headless physics
         world for pre-rolling dice outcomes.
   ============================================================ */

(function (global) {
    'use strict';

    const THREE = global.THREE;
    const CANNON = global.CANNON;

    // ---- Arena dimensions (in world units) ----
    // Picked so two dice of size ~1 can land comfortably visible on phone.
    const ARENA = {
        width: 8,      // X
        depth: 10,     // Z
        wallHeight: 6, // Y
    };

    // ---- Physics materials (shared) ----
    const MATERIALS = {
        // Constructed lazily once world exists
        floor: null,
        wall: null,
        dice: null,
    };

    class SceneManager {
        constructor(container) {
            this.container = container;
            this.width = container.clientWidth;
            this.height = container.clientHeight;

            // --- Three.js ---
            this.scene = new THREE.Scene();
            this.scene.background = null; // we use CSS gradient under canvas

            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: true,
                powerPreference: 'high-performance',
            });
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.setSize(this.width, this.height);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.05;
            container.appendChild(this.renderer.domElement);

            // --- Camera rig ---
            // Perspective camera looking down at the arena at ~50° from horizontal.
            this.camera = new THREE.PerspectiveCamera(
                45, this.width / this.height, 0.1, 100
            );
            this.cameraHome = new THREE.Vector3(0, 9, 8);
            this.camera.position.copy(this.cameraHome);
            this.camera.lookAt(0, 0, 0);

            this._setupLights();
            this._setupPhysics();
            this._setupArena();

            // --- Render loop state ---
            this.clock = new THREE.Clock();
            this.running = false;
            this.updateCallbacks = []; // per-frame subscribers

            // FPS tracking
            this._fpsSamples = [];
            this._lastFpsUpdate = 0;
            this.currentFps = 0;

            // Resize
            this._onResize = this._onResize.bind(this);
            window.addEventListener('resize', this._onResize);
            window.addEventListener('orientationchange', this._onResize);
        }

        _setupLights() {
            // Ambient fill — soft cold light, matches dark theme
            const ambient = new THREE.AmbientLight(0x9ab8ff, 0.35);
            this.scene.add(ambient);

            // Key light — warm, casting shadows
            const key = new THREE.DirectionalLight(0xffffff, 1.1);
            key.position.set(4, 10, 5);
            key.castShadow = true;
            key.shadow.mapSize.set(1024, 1024);
            key.shadow.camera.left = -8;
            key.shadow.camera.right = 8;
            key.shadow.camera.top = 8;
            key.shadow.camera.bottom = -8;
            key.shadow.camera.near = 0.1;
            key.shadow.camera.far = 25;
            key.shadow.bias = -0.0005;
            this.scene.add(key);

            // Rim / accent light — app brand blue, no shadow
            const rim = new THREE.DirectionalLight(0x0a84ff, 0.6);
            rim.position.set(-5, 4, -4);
            this.scene.add(rim);

            // Subtle ground bounce
            const bounce = new THREE.HemisphereLight(0x88aaff, 0x111122, 0.25);
            this.scene.add(bounce);
        }

        _setupPhysics() {
            // Main visible-world physics
            this.world = new CANNON.World({
                gravity: new CANNON.Vec3(0, -20, 0),
            });
            this.world.broadphase = new CANNON.SAPBroadphase(this.world);
            this.world.allowSleep = true;
            this.world.defaultContactMaterial.restitution = 0.3;

            MATERIALS.floor = new CANNON.Material('floor');
            MATERIALS.wall  = new CANNON.Material('wall');
            MATERIALS.dice  = new CANNON.Material('dice');

            // Contact tuning — dice should feel "weighty" but bouncy enough to be fun.
            this.world.addContactMaterial(new CANNON.ContactMaterial(
                MATERIALS.floor, MATERIALS.dice,
                { friction: 0.35, restitution: 0.35 }
            ));
            this.world.addContactMaterial(new CANNON.ContactMaterial(
                MATERIALS.wall, MATERIALS.dice,
                { friction: 0.15, restitution: 0.55 }
            ));
            this.world.addContactMaterial(new CANNON.ContactMaterial(
                MATERIALS.dice, MATERIALS.dice,
                { friction: 0.25, restitution: 0.4 }
            ));
        }

        _setupArena() {
            // --- Floor (visible disc / plate) ---
            // Low-poly glass-like plate with emissive rim vibe
            const floorGeom = new THREE.BoxGeometry(ARENA.width, 0.4, ARENA.depth);
            const floorMat = new THREE.MeshStandardMaterial({
                color: 0x1a1a24,
                metalness: 0.15,
                roughness: 0.55,
                transparent: true,
                opacity: 0.85,
            });
            const floorMesh = new THREE.Mesh(floorGeom, floorMat);
            floorMesh.position.y = -0.2;
            floorMesh.receiveShadow = true;
            this.scene.add(floorMesh);

            // Emissive edge trim — gives the glass-plate look
            const trimGeom = new THREE.BoxGeometry(
                ARENA.width + 0.05, 0.06, ARENA.depth + 0.05
            );
            const trimMat = new THREE.MeshBasicMaterial({
                color: 0x0a84ff,
                transparent: true,
                opacity: 0.55,
            });
            const trim = new THREE.Mesh(trimGeom, trimMat);
            trim.position.y = 0.03;
            this.scene.add(trim);

            // --- Physics floor (infinite plane is fine) ---
            const floorBody = new CANNON.Body({
                mass: 0,
                material: MATERIALS.floor,
                shape: new CANNON.Plane(),
            });
            floorBody.quaternion.setFromAxisAngle(
                new CANNON.Vec3(1, 0, 0), -Math.PI / 2
            );
            this.world.addBody(floorBody);

            // --- Invisible walls ---
            const wallThickness = 0.5;
            const wallDefs = [
                // [halfExtents, position]
                [[ARENA.width / 2, ARENA.wallHeight / 2, wallThickness / 2],
                 [0, ARENA.wallHeight / 2,  ARENA.depth / 2 + wallThickness / 2]],
                [[ARENA.width / 2, ARENA.wallHeight / 2, wallThickness / 2],
                 [0, ARENA.wallHeight / 2, -ARENA.depth / 2 - wallThickness / 2]],
                [[wallThickness / 2, ARENA.wallHeight / 2, ARENA.depth / 2],
                 [ ARENA.width / 2 + wallThickness / 2, ARENA.wallHeight / 2, 0]],
                [[wallThickness / 2, ARENA.wallHeight / 2, ARENA.depth / 2],
                 [-ARENA.width / 2 - wallThickness / 2, ARENA.wallHeight / 2, 0]],
            ];

            for (const [half, pos] of wallDefs) {
                const shape = new CANNON.Box(new CANNON.Vec3(...half));
                const body = new CANNON.Body({ mass: 0, material: MATERIALS.wall });
                body.addShape(shape);
                body.position.set(...pos);
                this.world.addBody(body);
            }
        }

        // ---- Headless physics world for pre-rolling dice outcomes ----
        // Creates a fresh isolated world identical in geometry to the real one.
        // Used by Dice.js to simulate forward and check final orientation
        // without rendering — fast enough for real-time retry.
        createHeadlessWorld() {
            const world = new CANNON.World({
                gravity: new CANNON.Vec3(0, -20, 0),
            });
            world.broadphase = new CANNON.SAPBroadphase(world);
            world.allowSleep = true;
            world.defaultContactMaterial.restitution = 0.3;

            world.addContactMaterial(new CANNON.ContactMaterial(
                MATERIALS.floor, MATERIALS.dice,
                { friction: 0.35, restitution: 0.35 }
            ));
            world.addContactMaterial(new CANNON.ContactMaterial(
                MATERIALS.wall, MATERIALS.dice,
                { friction: 0.15, restitution: 0.55 }
            ));
            world.addContactMaterial(new CANNON.ContactMaterial(
                MATERIALS.dice, MATERIALS.dice,
                { friction: 0.25, restitution: 0.4 }
            ));

            // Floor
            const floorBody = new CANNON.Body({
                mass: 0, material: MATERIALS.floor, shape: new CANNON.Plane(),
            });
            floorBody.quaternion.setFromAxisAngle(
                new CANNON.Vec3(1, 0, 0), -Math.PI / 2
            );
            world.addBody(floorBody);

            // Walls (same as real arena)
            const wallThickness = 0.5;
            const wallDefs = [
                [[ARENA.width / 2, ARENA.wallHeight / 2, wallThickness / 2],
                 [0, ARENA.wallHeight / 2,  ARENA.depth / 2 + wallThickness / 2]],
                [[ARENA.width / 2, ARENA.wallHeight / 2, wallThickness / 2],
                 [0, ARENA.wallHeight / 2, -ARENA.depth / 2 - wallThickness / 2]],
                [[wallThickness / 2, ARENA.wallHeight / 2, ARENA.depth / 2],
                 [ ARENA.width / 2 + wallThickness / 2, ARENA.wallHeight / 2, 0]],
                [[wallThickness / 2, ARENA.wallHeight / 2, ARENA.depth / 2],
                 [-ARENA.width / 2 - wallThickness / 2, ARENA.wallHeight / 2, 0]],
            ];
            for (const [half, pos] of wallDefs) {
                const shape = new CANNON.Box(new CANNON.Vec3(...half));
                const body = new CANNON.Body({ mass: 0, material: MATERIALS.wall });
                body.addShape(shape);
                body.position.set(...pos);
                world.addBody(body);
            }

            return world;
        }

        // ---- Public: register per-frame updates (e.g. dice sync) ----
        onUpdate(fn) {
            this.updateCallbacks.push(fn);
        }

        // ---- Render loop ----
        start() {
            if (this.running) return;
            this.running = true;
            this._tick();
        }

        _tick() {
            if (!this.running) return;
            requestAnimationFrame(() => this._tick());

            const dt = Math.min(this.clock.getDelta(), 1 / 30); // clamp huge deltas

            // Step physics at fixed substeps for stability
            this.world.step(1 / 60, dt, 3);

            // Run subscribers (dice meshes sync to bodies here)
            for (const fn of this.updateCallbacks) fn(dt);

            this.renderer.render(this.scene, this.camera);

            // FPS sampling
            this._fpsSamples.push(dt);
            if (this._fpsSamples.length > 30) this._fpsSamples.shift();
            const now = performance.now();
            if (now - this._lastFpsUpdate > 500) {
                const avg = this._fpsSamples.reduce((a, b) => a + b, 0)
                          / this._fpsSamples.length;
                this.currentFps = Math.round(1 / avg);
                this._lastFpsUpdate = now;
            }
        }

        _onResize() {
            this.width = this.container.clientWidth;
            this.height = this.container.clientHeight;
            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.width, this.height);
        }

        // Expose shared handles for other modules
        get arena() { return ARENA; }
        get materials() { return MATERIALS; }
    }

    global.SceneManager = SceneManager;
})(window);
