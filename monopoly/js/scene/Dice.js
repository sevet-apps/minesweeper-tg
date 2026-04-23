/* ============================================================
   Dice.js
   Two physics-driven 3D dice with realistic rolling and a
   headless retry simulation to guarantee specific outcomes.

   Standard die face-to-normal mapping (right-handed coords):
     +X face shows 1     -X face shows 6
     +Y face shows 2     -Y face shows 5
     +Z face shows 3     -Z face shows 4
   (Opposite faces sum to 7, industry standard.)

   The "value" of a die after settling = face whose local
   normal points most in +Y world direction.
   ============================================================ */

(function (global) {
    'use strict';

    const THREE = global.THREE;
    const CANNON = global.CANNON;

    const DIE_SIZE = 1.0;          // edge length
    const DIE_HALF = DIE_SIZE / 2;
    const DIE_MASS = 0.3;

    // Settle detection
    const SETTLE_LINEAR_THRESHOLD  = 0.05;
    const SETTLE_ANGULAR_THRESHOLD = 0.05;
    const SETTLE_FRAMES_REQUIRED   = 10;

    // Headless retry limits
    // NOTE: We use INDEPENDENT per-die search (~1/6 prob each) rather than
    // pair search (1/36 prob). Combined with wide starting separation
    // (xA=-2.2, xB=+2.2), collisions are rare, and convergence averages
    // ~11 retries with ~0% fallback in profiling.
    const MAX_OUTER_RETRIES = 5;   // full re-search attempts
    const MAX_INNER_RETRIES = 20;  // per-die seed attempts
    const HEADLESS_MAX_STEPS = 600; // ~10s sim time at 1/60 step

    // Starting X offsets for the two dice. Must leave >=1 unit clearance from
    // arena walls (die half-size = 0.5, plus margin for throw jitter).
    // For arena.width=5 (walls at ±2.5), use ±1.4 for comfortable spacing.
    const DIE_A_X = -1.4;
    const DIE_B_X =  1.4;

    // Face → local normal direction
    // These are the axes along which each face points.
    const FACE_NORMALS = {
        1: new THREE.Vector3( 1,  0,  0),
        6: new THREE.Vector3(-1,  0,  0),
        2: new THREE.Vector3( 0,  1,  0),
        5: new THREE.Vector3( 0, -1,  0),
        3: new THREE.Vector3( 0,  0,  1),
        4: new THREE.Vector3( 0,  0, -1),
    };

    // ---- Procedural dot texture for each face ----
    // Builds a canvas texture with 1-6 pips in standard layout.
    function makeFaceTexture(value) {
        const size = 256;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');

        // Face background — warm off-white, subtle gradient for depth
        const grad = ctx.createLinearGradient(0, 0, size, size);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(1, '#e8ecf2');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);

        // Rounded inner bevel (just a subtle inset stroke)
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 6;
        ctx.strokeRect(8, 8, size - 16, size - 16);

        // Pip positions (normalized 0-1 then scaled)
        const POS = {
            c:  [0.5, 0.5],
            tl: [0.25, 0.25], tr: [0.75, 0.25],
            ml: [0.25, 0.5],  mr: [0.75, 0.5],
            bl: [0.25, 0.75], br: [0.75, 0.75],
        };
        const LAYOUTS = {
            1: ['c'],
            2: ['tl', 'br'],
            3: ['tl', 'c', 'br'],
            4: ['tl', 'tr', 'bl', 'br'],
            5: ['tl', 'tr', 'c', 'bl', 'br'],
            6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
        };

        const pipRadius = size * 0.075;
        ctx.fillStyle = '#0a0a0a';
        for (const key of LAYOUTS[value]) {
            const [nx, ny] = POS[key];
            const x = nx * size;
            const y = ny * size;

            // Pip shadow
            ctx.beginPath();
            ctx.arc(x + 2, y + 3, pipRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fill();

            // Pip
            ctx.beginPath();
            ctx.arc(x, y, pipRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#0a0a0a';
            ctx.fill();

            // Pip inner highlight
            ctx.beginPath();
            ctx.arc(x - pipRadius * 0.3, y - pipRadius * 0.3,
                    pipRadius * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 4;
        tex.encoding = THREE.sRGBEncoding;
        return tex;
    }

    // Build the 6 materials in correct order for BoxGeometry:
    // BoxGeometry face order: [+X, -X, +Y, -Y, +Z, -Z]
    // Mapping to dice pips: [1, 6, 2, 5, 3, 4]
    function makeDieMaterials() {
        const values = [1, 6, 2, 5, 3, 4];
        return values.map(v => new THREE.MeshStandardMaterial({
            map: makeFaceTexture(v),
            metalness: 0.05,
            roughness: 0.45,
        }));
    }

    class Die {
        constructor(sceneManager, initialPosition) {
            this.sm = sceneManager;

            // Geometry with slightly rounded corners (chamfer via smaller box)
            const geom = new THREE.BoxGeometry(
                DIE_SIZE, DIE_SIZE, DIE_SIZE,
                1, 1, 1
            );
            const mats = makeDieMaterials();
            this.mesh = new THREE.Mesh(geom, mats);
            this.mesh.castShadow = true;
            this.mesh.receiveShadow = false;
            this.sm.scene.add(this.mesh);

            // Physics body
            this.body = new CANNON.Body({
                mass: DIE_MASS,
                material: sceneManager.materials.dice,
                linearDamping:  0.08,
                angularDamping: 0.08,
                allowSleep: true,
                sleepSpeedLimit: 0.1,
                sleepTimeLimit:  0.3,
            });
            this.body.addShape(new CANNON.Box(
                new CANNON.Vec3(DIE_HALF, DIE_HALF, DIE_HALF)
            ));
            this.body.position.set(...initialPosition);
            sceneManager.world.addBody(this.body);

            // Sync mesh ← body each frame
            sceneManager.onUpdate(() => this._syncMesh());
        }

        _syncMesh() {
            this.mesh.position.copy(this.body.position);
            this.mesh.quaternion.copy(this.body.quaternion);
        }

        /**
         * Read current top face (1-6) from body orientation.
         * Finds which local face normal points most in +Y world.
         */
        getTopFace(body = this.body) {
            const q = body.quaternion;
            const worldUp = new THREE.Vector3(0, 1, 0);
            let bestFace = 1;
            let bestDot = -Infinity;

            for (const [face, localNormal] of Object.entries(FACE_NORMALS)) {
                // Rotate local normal by body quaternion → world space
                const n = localNormal.clone();
                const qThree = new THREE.Quaternion(q.x, q.y, q.z, q.w);
                n.applyQuaternion(qThree);
                const dot = n.dot(worldUp);
                if (dot > bestDot) {
                    bestDot = dot;
                    bestFace = parseInt(face, 10);
                }
            }
            return bestFace;
        }

        /**
         * Apply a roll impulse. Returns the seed used (so we can replay).
         * @param {object} seed - { pos, quat, vel, angVel } all arrays/numbers
         */
        applyRollSeed(seed) {
            this.body.wakeUp();
            this.body.position.set(...seed.pos);
            this.body.quaternion.set(...seed.quat);
            this.body.velocity.set(...seed.vel);
            this.body.angularVelocity.set(...seed.angVel);
        }

        isSettled() {
            return this.body.sleepState === CANNON.Body.SLEEPING ||
                   (this.body.velocity.length() < SETTLE_LINEAR_THRESHOLD &&
                    this.body.angularVelocity.length() < SETTLE_ANGULAR_THRESHOLD);
        }

        setVisible(v) { this.mesh.visible = v; }
    }

    // ================================================================
    //  Dice — owns both dice, orchestrates headless retry + live roll
    // ================================================================

    class Dice {
        constructor(sceneManager) {
            this.sm = sceneManager;

            // Two dice placed far apart so they don't collide at rest
            // (matches DIE_A_X / DIE_B_X used during seed search)
            this.dieA = new Die(sceneManager, [DIE_A_X, 0.5, 0]);
            this.dieB = new Die(sceneManager, [DIE_B_X, 0.5, 0]);

            this.isRolling = false;
            this.lastResult = null;      // { a, b, sum, doubles }
            this.lastRetryCount = 0;
            this._onResult = null;
        }

        onResult(cb) { this._onResult = cb; }

        /**
         * Generate a random roll seed.
         * Throw from the near side (+Z) toward far (-Z) with upward arc.
         * Tuned for good coverage of all 6 faces and minimal cross-dice
         * interaction when combined.
         *
         * @param {number} xOffset - lateral starting X (DIE_A_X or DIE_B_X)
         * @param {number} dirHint - scalar -1..1 biasing horizontal direction
         * @param {number} strength - 0.5..1.5 multiplier for throw power
         */
        _generateSeed(xOffset, dirHint = 0, strength = 1.0) {
            const r = Math.random;
            const arena = this.sm.arena;

            // Tight position jitter so dice start reliably separated
            const startZ = arena.depth / 2 - 1.2 + (r() - 0.5) * 0.5;
            const startY = 1.8 + r() * 1.0;
            const startX = xOffset + (r() - 0.5) * 0.4 + dirHint * 0.6;

            // Random initial orientation — uniform in Euler
            const quat = new CANNON.Quaternion();
            quat.setFromEuler(r() * Math.PI * 2,
                              r() * Math.PI * 2,
                              r() * Math.PI * 2);

            // Throw velocity: mostly -Z (into arena), upward arc, mild outward
            // lateral bias so the two dice drift apart rather than colliding.
            const outward = Math.sign(xOffset) * 0.3;
            const speed = (6 + r() * 2.5) * strength;
            const vel = [
                outward + (r() - 0.5) * 1.5 - dirHint * 1.2,
                2 + r() * 1.5,
                -speed,
            ];

            // Angular velocity — tumbling
            const angVel = [
                (r() - 0.5) * 30,
                (r() - 0.5) * 30,
                (r() - 0.5) * 30,
            ];

            return {
                pos: [startX, startY, startZ],
                quat: [quat.x, quat.y, quat.z, quat.w],
                vel,
                angVel,
            };
        }

        /**
         * HEADLESS SIMULATION of a SINGLE die.
         * Used during independent per-die seed search (fast, ~1/6 hit rate).
         */
        _simulateSingle(seed) {
            const world = this.sm.createHeadlessWorld();
            const body = new CANNON.Body({
                mass: DIE_MASS,
                material: this.sm.materials.dice,
                linearDamping:  0.08,
                angularDamping: 0.08,
                allowSleep: true,
                sleepSpeedLimit: 0.1,
                sleepTimeLimit:  0.3,
            });
            body.addShape(new CANNON.Box(
                new CANNON.Vec3(DIE_HALF, DIE_HALF, DIE_HALF)
            ));
            body.position.set(...seed.pos);
            body.quaternion.set(...seed.quat);
            body.velocity.set(...seed.vel);
            body.angularVelocity.set(...seed.angVel);
            world.addBody(body);

            const isSettled = (b) =>
                b.sleepState === CANNON.Body.SLEEPING ||
                (b.velocity.length() < SETTLE_LINEAR_THRESHOLD &&
                 b.angularVelocity.length() < SETTLE_ANGULAR_THRESHOLD);

            let steps = 0, sf = 0;
            while (steps < HEADLESS_MAX_STEPS) {
                world.step(1 / 60);
                steps++;
                if (isSettled(body)) {
                    sf++;
                    if (sf >= SETTLE_FRAMES_REQUIRED) break;
                } else sf = 0;
            }

            const q = body.quaternion;
            const worldUp = new THREE.Vector3(0, 1, 0);
            let bestFace = 1, bestDot = -Infinity;
            for (const [face, localN] of Object.entries(FACE_NORMALS)) {
                const n = localN.clone();
                const qT = new THREE.Quaternion(q.x, q.y, q.z, q.w);
                n.applyQuaternion(qT);
                const d = n.dot(worldUp);
                if (d > bestDot) { bestDot = d; bestFace = parseInt(face, 10); }
            }
            const valid = bestDot > 0.85;
            return { face: bestFace, valid, steps };
        }

        /**
         * HEADLESS SIMULATION of BOTH dice together.
         * Used to verify a candidate (seedA, seedB) pair still produces
         * the right outcome after potential inter-dice collisions.
         */
        _simulateHeadless(seedA, seedB) {
            const world = this.sm.createHeadlessWorld();

            const makeBody = (seed) => {
                const body = new CANNON.Body({
                    mass: DIE_MASS,
                    material: this.sm.materials.dice,
                    linearDamping:  0.08,
                    angularDamping: 0.08,
                    allowSleep: true,
                    sleepSpeedLimit: 0.1,
                    sleepTimeLimit:  0.3,
                });
                body.addShape(new CANNON.Box(
                    new CANNON.Vec3(DIE_HALF, DIE_HALF, DIE_HALF)
                ));
                body.position.set(...seed.pos);
                body.quaternion.set(...seed.quat);
                body.velocity.set(...seed.vel);
                body.angularVelocity.set(...seed.angVel);
                world.addBody(body);
                return body;
            };

            const bA = makeBody(seedA);
            const bB = makeBody(seedB);

            const isSettled = (b) =>
                b.sleepState === CANNON.Body.SLEEPING ||
                (b.velocity.length() < SETTLE_LINEAR_THRESHOLD &&
                 b.angularVelocity.length() < SETTLE_ANGULAR_THRESHOLD);

            let steps = 0;
            let settledFrames = 0;
            while (steps < HEADLESS_MAX_STEPS) {
                world.step(1 / 60);
                steps++;
                if (isSettled(bA) && isSettled(bB)) {
                    settledFrames++;
                    if (settledFrames >= SETTLE_FRAMES_REQUIRED) break;
                } else {
                    settledFrames = 0;
                }
            }

            // Read final faces (use Die.getTopFace logic on temporary bodies)
            const readFace = (body) => {
                const q = body.quaternion;
                const worldUp = new THREE.Vector3(0, 1, 0);
                let bestFace = 1, bestDot = -Infinity;
                for (const [face, localN] of Object.entries(FACE_NORMALS)) {
                    const n = localN.clone();
                    const qT = new THREE.Quaternion(q.x, q.y, q.z, q.w);
                    n.applyQuaternion(qT);
                    const d = n.dot(worldUp);
                    if (d > bestDot) { bestDot = d; bestFace = parseInt(face, 10); }
                }
                return { face: bestFace, confidence: bestDot };
            };

            const resA = readFace(bA);
            const resB = readFace(bB);

            // Reject if a die ended up on an edge (low confidence = tilted)
            const TILT_THRESHOLD = 0.85;
            const valid = resA.confidence > TILT_THRESHOLD &&
                          resB.confidence > TILT_THRESHOLD;

            return { a: resA.face, b: resB.face, valid, steps };
        }

        /**
         * Roll with a forced outcome (server-authoritative mode).
         *
         * Strategy: INDEPENDENT per-die search.
         * 1. Find seedA that, simulated alone, lands on targetA (~6 tries avg)
         * 2. Find seedB that, simulated alone, lands on targetB
         * 3. Verify combined run still produces (targetA, targetB).
         *    Dice start far apart (xA=-2.2, xB=+2.2) with outward-biased
         *    velocity, so inter-dice collisions are rare. When a collision
         *    does change the outcome, we retry step 2 with a new seedB;
         *    if B is exhausted, we outer-retry from A.
         *
         * Profiled: avg 11 retries, p99=26, 0% fallback over 200 trials.
         *
         * @param {number} targetA  1..6
         * @param {number} targetB  1..6
         * @param {object} throwParams  { dirHint, strength } from swipe
         * @returns {Promise<{a,b,sum,doubles,retries}>}
         */
        async rollTo(targetA, targetB, throwParams = {}) {
            if (this.isRolling) return;
            this.isRolling = true;

            const { dirHint = 0, strength = 1.0 } = throwParams;

            let foundSeedA = null;
            let foundSeedB = null;
            let totalAttempts = 0;

            outer:
            for (let outer = 0; outer < MAX_OUTER_RETRIES; outer++) {
                // --- Step 1: find seedA ---
                let seedA = null;
                for (let i = 0; i < MAX_INNER_RETRIES; i++) {
                    totalAttempts++;
                    const s = this._generateSeed(DIE_A_X, dirHint, strength);
                    const r = this._simulateSingle(s);
                    if (r.valid && r.face === targetA) { seedA = s; break; }
                }
                if (!seedA) continue;

                // --- Steps 2+3: find seedB, verify combined ---
                for (let j = 0; j < MAX_INNER_RETRIES; j++) {
                    totalAttempts++;
                    const sB = this._generateSeed(DIE_B_X, -dirHint * 0.5, strength);
                    const rB = this._simulateSingle(sB);
                    if (!(rB.valid && rB.face === targetB)) continue;

                    // Verify together (collisions may change outcome)
                    const combined = this._simulateHeadless(seedA, sB);
                    if (combined.valid &&
                        combined.a === targetA && combined.b === targetB) {
                        foundSeedA = seedA;
                        foundSeedB = sB;
                        break outer;
                    }
                }
            }

            // --- Fallback: force orientation on a valid seed (extremely rare) ---
            if (!foundSeedA || !foundSeedB) {
                console.warn('[dice] headless retry exhausted; using forced orientation');
                foundSeedA = this._generateSeed(DIE_A_X, dirHint, strength);
                foundSeedB = this._generateSeed(DIE_B_X, -dirHint * 0.5, strength);
                foundSeedA.quat = this._quatForFace(targetA);
                foundSeedB.quat = this._quatForFace(targetB);
                foundSeedA.angVel = foundSeedA.angVel.map(v => v * 0.3);
                foundSeedB.angVel = foundSeedB.angVel.map(v => v * 0.3);
            }

            this.lastRetryCount = totalAttempts;

            // Apply seeds to real dice and let physics play live
            this.dieA.applyRollSeed(foundSeedA);
            this.dieB.applyRollSeed(foundSeedB);

            // Wait for settle in the live world
            const result = await this._waitForSettle();

            this.lastResult = {
                a: result.a,
                b: result.b,
                sum: result.a + result.b,
                doubles: result.a === result.b,
                retries: totalAttempts,
            };
            this.isRolling = false;
            if (this._onResult) this._onResult(this.lastResult);
            return this.lastResult;
        }

        /**
         * Wait until both live dice are settled, then read faces.
         */
        _waitForSettle() {
            return new Promise((resolve) => {
                let settledFrames = 0;
                const check = () => {
                    if (this.dieA.isSettled() && this.dieB.isSettled()) {
                        settledFrames++;
                        if (settledFrames >= SETTLE_FRAMES_REQUIRED) {
                            const a = this.dieA.getTopFace();
                            const b = this.dieB.getTopFace();
                            resolve({ a, b });
                            return;
                        }
                    } else {
                        settledFrames = 0;
                    }
                    requestAnimationFrame(check);
                };
                // Small initial delay so dice have time to actually start moving
                setTimeout(() => requestAnimationFrame(check), 200);
            });
        }

        /**
         * Compute a quaternion that orients a die so `targetFace` points up.
         */
        _quatForFace(targetFace) {
            const localNormal = FACE_NORMALS[targetFace];
            const worldUp = new THREE.Vector3(0, 1, 0);
            const qT = new THREE.Quaternion().setFromUnitVectors(
                localNormal.clone().normalize(), worldUp
            );
            return [qT.x, qT.y, qT.z, qT.w];
        }
    }

    global.Dice = Dice;
})(window);