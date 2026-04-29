/* ============================================================
   SceneManager.js  (v3 — Board3D compatible)

   Owns: renderer, scene, camera, lights, physics world.
   Does NOT own: the visible plate/arena geometry — that comes
   from Board3D now (the center plate of the Monopoly board
   serves as the dice arena).
   ============================================================ */

(function (global) {
    'use strict';

    const THREE = global.THREE;
    const CANNON = global.CANNON;

    // Arena size matches the Board3D center plate (plateSide = 6.5).
    // Walls just inside the plate edges so dice never escape visually.
    // floorY matches Board3D._buildCenterPlate Y_PLATE + 0.02 (must stay in sync).
    const ARENA = {
        width:  6.3,
        depth:  6.3,
        height: 3.5,
        floorY: 0.16,
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
                antialias: true, alpha: true,
                powerPreference: 'high-performance',
            });
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.setSize(this.width, this.height);
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.0;
            container.appendChild(this.renderer.domElement);

            // --- Camera ---
            // Board is 13×13. Sized to FIT WITH VISIBLE MARGIN on portrait phones.
            // At y=34, z=2, fov=32 the full board renders at ~85% of viewport
            // height, leaving dark margin all around so board reads as a
            // self-contained object.
            this.camera = new THREE.PerspectiveCamera(
                32, this.width / this.height, 0.1, 100
            );
            this.camera.position.set(0, 34, 2);
            this.camera.lookAt(0, 0, 0);

            this._setupLights();
            this._setupPhysics();

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
            // Brighter ambient for overall scene readability on mobile displays
            const ambient = new THREE.AmbientLight(0xbbcdff, 0.55);
            this.scene.add(ambient);

            // Key light - stronger, mostly top-down to match camera
            const key = new THREE.DirectionalLight(0xffffff, 1.4);
            key.position.set(4, 18, 5);
            key.castShadow = true;
            key.shadow.mapSize.set(2048, 2048);
            key.shadow.camera.left   = -10;
            key.shadow.camera.right  =  10;
            key.shadow.camera.top    =  10;
            key.shadow.camera.bottom = -10;
            key.shadow.camera.near   = 0.1;
            key.shadow.camera.far    = 50;
            key.shadow.bias = -0.0005;
            this.scene.add(key);

            // Cool blue fill from opposite side
            const fill = new THREE.DirectionalLight(0x5ac8fa, 0.6);
            fill.position.set(-8, 8, -4);
            this.scene.add(fill);

            // Warm rim light for accent
            const rim = new THREE.DirectionalLight(0xffd1a4, 0.3);
            rim.position.set(6, 4, -6);
            this.scene.add(rim);
        }

        _setupPhysics() {
            this.world = new CANNON.World();
            this.world.gravity.set(0, -20, 0);
            this.world.broadphase = new CANNON.SAPBroadphase(this.world);
            this.world.allowSleep = true;
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

            this._addArenaFloorAndWalls(this.world);
        }

        /**
         * Physics floor matches Board3D center plate top (y=0.08).
         * Walls positioned just inside the plate perimeter.
         */
        _addArenaFloorAndWalls(world) {
            const floorBody = new CANNON.Body({ mass: 0, material: MATERIALS.floor });
            floorBody.addShape(new CANNON.Plane());
            floorBody.quaternion.setFromAxisAngle(
                new CANNON.Vec3(1, 0, 0), -Math.PI / 2
            );
            floorBody.position.y = ARENA.floorY;
            world.addBody(floorBody);

            const t = 0.4, h = ARENA.height;
            const w = ARENA.width, d = ARENA.depth;
            const y = ARENA.floorY + h/2;
            const walls = [
                [[w/2, h/2, t/2], [0, y,  d/2 + t/2]],
                [[w/2, h/2, t/2], [0, y, -d/2 - t/2]],
                [[t/2, h/2, d/2], [ w/2 + t/2, y, 0]],
                [[t/2, h/2, d/2], [-w/2 - t/2, y, 0]],
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
            world.allowSleep = true;
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

            this._addArenaFloorAndWalls(world);
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