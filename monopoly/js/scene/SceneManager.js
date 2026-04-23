/* ============================================================
   SceneManager.js  (rewrite v2)

   Minimal Three.js + cannon.js setup for Monopoly.
   Priorities in this rewrite:
     1. CORRECTNESS OVER POLISH. One plate, one rim, done.
     2. Arena sized so the plate is CLEARLY an object on phone
        portrait viewport (not a background).
     3. Size measurements logged to window.__sceneDebug so they
        can be inspected if anything looks wrong.
   ============================================================ */

(function (global) {
    'use strict';

    const THREE = global.THREE;
    const CANNON = global.CANNON;

    // Arena: narrow rectangle, clearly smaller than any phone viewport
    // when camera is at the configured position.
    const ARENA = {
        width:  4.5,
        depth:  5.5,
        height: 3.5,
    };

    const MATERIALS = {
        floor: null,
        wall:  null,
        dice:  null,
    };

    class SceneManager {
        constructor(container) {
            this.container = container;
            this.width  = container.clientWidth;
            this.height = container.clientHeight;

            // --- Three.js ---
            this.scene = new THREE.Scene();
            this.scene.background = null;

            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha:     true,
                powerPreference: 'high-performance',
            });
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.setSize(this.width, this.height);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
            this.renderer.outputEncoding    = THREE.sRGBEncoding;
            this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.0;
            container.appendChild(this.renderer.domElement);

            // --- Camera ---
            this.camera = new THREE.PerspectiveCamera(
                38, this.width / this.height, 0.1, 100
            );
            this.camera.position.set(0, 7.5, 5.0);
            this.camera.lookAt(0, 0, 0);

            this._setupLights();
            this._setupPhysics();
            this._setupArena();

            global.__sceneDebug = {
                arena: { ...ARENA },
                cameraPos: this.camera.position.toArray(),
                renderer: { w: this.width, h: this.height },
            };

            this.clock = new THREE.Clock();
            this.running = false;
            this.updateCallbacks = [];

            this._fpsSamples = [];
            this._lastFpsUpdate = 0;
            this.currentFps = 0;

            this._onResize = this._onResize.bind(this);
            window.addEventListener('resize', this._onResize);
            window.addEventListener('orientationchange', this._onResize);
        }

        _setupLights() {
            const ambient = new THREE.AmbientLight(0xaac0ff, 0.25);
            this.scene.add(ambient);

            const key = new THREE.DirectionalLight(0xffffff, 1.2);
            key.position.set(3, 8, 4);
            key.castShadow = true;
            key.shadow.mapSize.set(1024, 1024);
            key.shadow.camera.left   = -4;
            key.shadow.camera.right  =  4;
            key.shadow.camera.top    =  4;
            key.shadow.camera.bottom = -4;
            key.shadow.camera.near   = 0.1;
            key.shadow.camera.far    = 20;
            key.shadow.bias = -0.0005;
            this.scene.add(key);

            const fill = new THREE.DirectionalLight(0x5ac8fa, 0.35);
            fill.position.set(-4, 3, -2);
            this.scene.add(fill);
        }

        _setupPhysics() {
            this.world = new CANNON.World();
            this.world.gravity.set(0, -20, 0);
            this.world.broadphase = new CANNON.SAPBroadphase(this.world);
            this.world.allowSleep  = true;
            this.world.defaultContactMaterial.restitution = 0.3;

            MATERIALS.floor = new CANNON.Material('floor');
            MATERIALS.wall  = new CANNON.Material('wall');
            MATERIALS.dice  = new CANNON.Material('dice');

            this.world.addContactMaterial(new CANNON.ContactMaterial(
                MATERIALS.floor, MATERIALS.dice,
                { friction: 0.35, restitution: 0.35 }
            ));
            this.world.addContactMaterial(new CANNON.ContactMaterial(
                MATERIALS.wall, MATERIALS.dice,
                { friction: 0.25, restitution: 0.35 }
            ));
            this.world.addContactMaterial(new CANNON.ContactMaterial(
                MATERIALS.dice, MATERIALS.dice,
                { friction: 0.25, restitution: 0.4 }
            ));
        }

        _setupArena() {
            // ONE dark slab. No second surface. No emissive inner. Just a plate.
            const plateGeom = new THREE.BoxGeometry(ARENA.width, 0.25, ARENA.depth);
            const plateMat = new THREE.MeshStandardMaterial({
                color:     0x161925,
                metalness: 0.25,
                roughness: 0.55,
            });
            const plate = new THREE.Mesh(plateGeom, plateMat);
            plate.position.y = -0.125;
            plate.receiveShadow = true;
            this.scene.add(plate);

            // Glowing outline via LineSegments - does NOT cover plate surface.
            const outlineShape = new THREE.BoxGeometry(
                ARENA.width, 0.001, ARENA.depth
            );
            const outlineEdges = new THREE.EdgesGeometry(outlineShape);

            const rimMain = new THREE.LineSegments(
                outlineEdges,
                new THREE.LineBasicMaterial({
                    color: 0x0a84ff,
                    transparent: true,
                    opacity: 0.95,
                })
            );
            rimMain.position.y = 0.005;
            this.scene.add(rimMain);

            const rimGlow = new THREE.LineSegments(
                outlineEdges.clone(),
                new THREE.LineBasicMaterial({
                    color: 0x5ac8fa,
                    transparent: true,
                    opacity: 0.4,
                })
            );
            rimGlow.scale.set(1.05, 1, 1.05);
            rimGlow.position.y = 0.002;
            this.scene.add(rimGlow);

            const floorBody = new CANNON.Body({
                mass: 0, material: MATERIALS.floor,
            });
            floorBody.addShape(new CANNON.Plane());
            floorBody.quaternion.setFromAxisAngle(
                new CANNON.Vec3(1, 0, 0), -Math.PI / 2
            );
            this.world.addBody(floorBody);

            this._addWalls(this.world);
        }

        _addWalls(world) {
            const t = 0.4;
            const h = ARENA.height;
            const w = ARENA.width;
            const d = ARENA.depth;

            const walls = [
                [[w/2, h/2, t/2], [0, h/2,  d/2 + t/2]],
                [[w/2, h/2, t/2], [0, h/2, -d/2 - t/2]],
                [[t/2, h/2, d/2], [ w/2 + t/2, h/2, 0]],
                [[t/2, h/2, d/2], [-w/2 - t/2, h/2, 0]],
            ];

            for (const [half, pos] of walls) {
                const body = new CANNON.Body({ mass: 0, material: MATERIALS.wall });
                body.addShape(new CANNON.Box(new CANNON.Vec3(...half)));
                body.position.set(...pos);
                world.addBody(body);
            }
        }

        createHeadlessWorld() {
            const world = new CANNON.World();
            world.gravity.set(0, -20, 0);
            world.broadphase = new CANNON.SAPBroadphase(world);
            world.allowSleep  = true;
            world.defaultContactMaterial.restitution = 0.3;

            world.addContactMaterial(new CANNON.ContactMaterial(
                MATERIALS.floor, MATERIALS.dice,
                { friction: 0.35, restitution: 0.35 }
            ));
            world.addContactMaterial(new CANNON.ContactMaterial(
                MATERIALS.wall, MATERIALS.dice,
                { friction: 0.25, restitution: 0.35 }
            ));
            world.addContactMaterial(new CANNON.ContactMaterial(
                MATERIALS.dice, MATERIALS.dice,
                { friction: 0.25, restitution: 0.4 }
            ));

            const floorBody = new CANNON.Body({
                mass: 0, material: MATERIALS.floor,
            });
            floorBody.addShape(new CANNON.Plane());
            floorBody.quaternion.setFromAxisAngle(
                new CANNON.Vec3(1, 0, 0), -Math.PI / 2
            );
            world.addBody(floorBody);

            this._addWalls(world);
            return world;
        }

        onUpdate(fn) { this.updateCallbacks.push(fn); }

        start() {
            if (this.running) return;
            this.running = true;
            this._tick();
        }

        _tick() {
            if (!this.running) return;
            requestAnimationFrame(() => this._tick());

            const dt = Math.min(this.clock.getDelta(), 1/30);
            this.world.step(1/60, dt, 3);

            for (const fn of this.updateCallbacks) fn(dt);
            this.renderer.render(this.scene, this.camera);

            this._fpsSamples.push(dt);
            if (this._fpsSamples.length > 30) this._fpsSamples.shift();
            const now = performance.now();
            if (now - this._lastFpsUpdate > 500) {
                const avg = this._fpsSamples.reduce((a,b) => a+b, 0)
                          / this._fpsSamples.length;
                this.currentFps = Math.round(1 / avg);
                this._lastFpsUpdate = now;
            }
        }

        _onResize() {
            this.width  = this.container.clientWidth;
            this.height = this.container.clientHeight;
            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.width, this.height);
            if (global.__sceneDebug) {
                global.__sceneDebug.renderer = { w: this.width, h: this.height };
            }
        }

        get arena()     { return ARENA; }
        get materials() { return MATERIALS; }
    }

    global.SceneManager = SceneManager;
})(window);