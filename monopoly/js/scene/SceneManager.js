/* ============================================================
   SceneManager.js  (v4 — dice-only)

   Three.js scene mounted inside a small square <div> in the
   center of the CSS Monopoly board. Renders ONLY:
     - lighting
     - physics floor + 4 invisible walls (the dice arena)
     - the two dice (added by Dice.js)

   No board geometry — that's the DOM's job now.
   ============================================================ */

(function (global) {
    'use strict';

    const THREE = global.THREE;
    const CANNON = global.CANNON;

    // Square arena. Camera is positioned so this fills the canvas.
    const ARENA = {
        width:  4.5,
        depth:  4.5,
        height: 3.0,
        floorY: 0.0,
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

            this.scene = new THREE.Scene();
            this.scene.background = null; // CSS handles background

            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha:     true,
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

            // Top-down camera. Pulled back so dice occupy ~30% of canvas
            // instead of dominating it.
            this.camera = new THREE.PerspectiveCamera(
                40, this.width / this.height, 0.1, 50
            );
            this.camera.position.set(0, 11, 0.01);
            this.camera.lookAt(0, 0, 0);

            this._setupLights();
            this._setupPhysics();

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
            // Strong ambient so dice read clearly from above
            const ambient = new THREE.AmbientLight(0xffffff, 0.7);
            this.scene.add(ambient);

            // Key light off-axis for dice depth + shadow
            const key = new THREE.DirectionalLight(0xffffff, 0.9);
            key.position.set(2, 8, 3);
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

            // Cool fill from opposite to lift shadow side
            const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
            fill.position.set(-3, 4, -2);
            this.scene.add(fill);
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
        }

        get arena()     { return ARENA; }
        get materials() { return MATERIALS; }
    }

    global.SceneManager = SceneManager;
})(window);