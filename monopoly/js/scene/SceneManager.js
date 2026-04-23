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
    // Sized so the plate fits within ~60% of a portrait phone viewport with
    // visible dark margin around it - the plate must read as an OBJECT, not
    // as the background. Kept slightly taller (Z) than wide (X) because the
    // camera looks down at an angle, foreshortening depth.
    const ARENA = {
        width: 5,      // X
        depth: 6,      // Z
        wallHeight: 4, // Y
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
            // Positioned so the smaller 5×6 plate occupies the center of a
            // portrait screen with visible dark margin around it. If the plate
            // fills the whole screen, it stops reading as an object.
            this.camera = new THREE.PerspectiveCamera(
                40, this.width / this.height, 0.1, 100
            );
            this.cameraHome = new THREE.Vector3(0, 8, 5.5);
            this.camera.position.copy(this.cameraHome);
            this.camera.lookAt(0, 0, -0.3);

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
            // NOTE: classic cannon.js World() ignores options object - must
            // set gravity via method call, not constructor argument.
            this.world = new CANNON.World();
            this.world.gravity.set(0, -20, 0);
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
            // --- Visible plate ("stage") ---
            // A dark stone-like slab that anchors the scene. The key to making
            // it read as a plate (not a background) is keeping it DARK - the
            // rim trim + emissive underside provide the "lit object" feel.
            const floorGeom = new THREE.BoxGeometry(ARENA.width, 0.35, ARENA.depth);
            const floorMat = new THREE.MeshStandardMaterial({
                color: 0x12151f,
                metalness: 0.3,
                roughness: 0.45,
                emissive: 0x000000,
            });
            const floorMesh = new THREE.Mesh(floorGeom, floorMat);
            floorMesh.position.y = -0.175;
            floorMesh.receiveShadow = true;
            this.scene.add(floorMesh);

            // Top playing surface - just marginally lighter so dice cast
            // readable shadows. Still dark overall.
            const topGeom = new THREE.BoxGeometry(
                ARENA.width - 0.08, 0.015, ARENA.depth - 0.08
            );
            const topMat = new THREE.MeshStandardMaterial({
                color: 0x1a1f2e,
                metalness: 0.2,
                roughness: 0.5,
            });
            const topMesh = new THREE.Mesh(topGeom, topMat);
            topMesh.position.y = 0.001;
            topMesh.receiveShadow = true;
            this.scene.add(topMesh);

            // Glowing edge trim - app-brand blue. This is what makes the plate
            // visually "pop" as a lit object against the dark scene.
            const trimGeom = new THREE.BoxGeometry(
                ARENA.width + 0.1, 0.1, ARENA.depth + 0.1
            );
            const trimMat = new THREE.MeshBasicMaterial({
                color: 0x0a84ff,
                transparent: true,
                opacity: 0.85,
            });
            const trim = new THREE.Mesh(trimGeom, trimMat);
            trim.position.y = 0.02;
            this.scene.add(trim);

            // --- Physics floor (infinite plane is fine) ---
            // NOTE: classic cannon.js Body() does not accept shape in options -
            // must call addShape() after construction.
            const floorBody = new CANNON.Body({
                mass: 0,
                material: MATERIALS.floor,
            });
            floorBody.addShape(new CANNON.Plane());
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
            const world = new CANNON.World();
            world.gravity.set(0, -20, 0);
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
                mass: 0, material: MATERIALS.floor,
            });
            floorBody.addShape(new CANNON.Plane());
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