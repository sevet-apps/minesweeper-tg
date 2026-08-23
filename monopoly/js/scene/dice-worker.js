/* Подбор гарантированных траекторий кубиков вне главного UI-потока. */
'use strict';

importScripts('../../libs/cannon.min.js');

(function (worker) {
    const CANNON = worker.CANNON;
    const DIE_MASS = 0.3;
    const SETTLE_LINEAR_THRESHOLD = 0.05;
    const SETTLE_ANGULAR_THRESHOLD = 0.05;
    const SETTLE_FRAMES_REQUIRED = 10;
    const MAX_OUTER_RETRIES = 5;
    const MAX_INNER_RETRIES = 20;
    const HEADLESS_MAX_STEPS = 600;
    const DIE_A_X = -1.3;
    const DIE_B_X = 1.3;
    const FACE_NORMALS = {
        1: [1, 0, 0], 6: [-1, 0, 0],
        2: [0, 1, 0], 5: [0, -1, 0],
        3: [0, 0, 1], 4: [0, 0, -1],
    };
    const cache = new Map();

    function addArena(world, arena, materials) {
        const floor = new CANNON.Body({ mass: 0, material: materials.floor });
        floor.addShape(new CANNON.Plane());
        floor.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        floor.position.y = arena.floorY;
        world.addBody(floor);

        const thickness = 0.4;
        const y = arena.floorY + arena.height / 2;
        const walls = [
            [[arena.width / 2, arena.height / 2, thickness / 2], [0, y, arena.depth / 2 + thickness / 2]],
            [[arena.width / 2, arena.height / 2, thickness / 2], [0, y, -arena.depth / 2 - thickness / 2]],
            [[thickness / 2, arena.height / 2, arena.depth / 2], [arena.width / 2 + thickness / 2, y, 0]],
            [[thickness / 2, arena.height / 2, arena.depth / 2], [-arena.width / 2 - thickness / 2, y, 0]],
        ];
        walls.forEach(([half, position]) => {
            const body = new CANNON.Body({ mass: 0, material: materials.wall });
            body.addShape(new CANNON.Box(new CANNON.Vec3(...half)));
            body.position.set(...position);
            world.addBody(body);
        });
    }

    function createWorld(arena) {
        const world = new CANNON.World();
        world.gravity.set(0, -20, 0);
        world.broadphase = new CANNON.SAPBroadphase(world);
        world.allowSleep = true;
        world.defaultContactMaterial.restitution = 0.3;
        const materials = {
            floor: new CANNON.Material('floor'),
            wall: new CANNON.Material('wall'),
            dice: new CANNON.Material('dice'),
        };
        world.addContactMaterial(new CANNON.ContactMaterial(
            materials.floor, materials.dice, { friction: 0.35, restitution: 0.35 }));
        world.addContactMaterial(new CANNON.ContactMaterial(
            materials.wall, materials.dice, { friction: 0.25, restitution: 0.35 }));
        world.addContactMaterial(new CANNON.ContactMaterial(
            materials.dice, materials.dice, { friction: 0.25, restitution: 0.4 }));
        addArena(world, arena, materials);
        return { world, materials };
    }

    function makeBody(seed, half, material) {
        const body = new CANNON.Body({
            mass: DIE_MASS,
            material,
            linearDamping: 0.08,
            angularDamping: 0.08,
            allowSleep: true,
            sleepSpeedLimit: 0.1,
            sleepTimeLimit: 0.3,
        });
        body.addShape(new CANNON.Box(new CANNON.Vec3(half, half, half)));
        body.position.set(...seed.pos);
        body.quaternion.set(...seed.quat);
        body.velocity.set(...seed.vel);
        body.angularVelocity.set(...seed.angVel);
        return body;
    }

    function settled(body) {
        return body.sleepState === CANNON.Body.SLEEPING ||
            (body.velocity.length() < SETTLE_LINEAR_THRESHOLD &&
             body.angularVelocity.length() < SETTLE_ANGULAR_THRESHOLD);
    }

    function readFace(body) {
        let bestFace = 1;
        let confidence = -Infinity;
        Object.keys(FACE_NORMALS).forEach(face => {
            const normal = new CANNON.Vec3(...FACE_NORMALS[face]);
            const worldNormal = body.quaternion.vmult(normal);
            if (worldNormal.y > confidence) {
                confidence = worldNormal.y;
                bestFace = Number(face);
            }
        });
        return { face: bestFace, confidence };
    }

    function generateSeed(xOffset, dirHint, strength, arena) {
        const startZ = 2.0 + (Math.random() - 0.5) * 0.5;
        const startY = arena.floorY + 1.8 + Math.random();
        const startX = xOffset + (Math.random() - 0.5) * 0.4 + dirHint * 0.6;
        const quat = new CANNON.Quaternion();
        quat.setFromEuler(Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
        const outward = Math.sign(xOffset) * 0.3;
        const speed = (3.5 + Math.random() * 1.5) * strength;
        return {
            pos: [startX, startY, startZ],
            quat: [quat.x, quat.y, quat.z, quat.w],
            vel: [
                outward + (Math.random() - 0.5) - dirHint * 0.8,
                2 + Math.random(),
                -speed,
            ],
            angVel: [
                (Math.random() - 0.5) * 30,
                (Math.random() - 0.5) * 30,
                (Math.random() - 0.5) * 30,
            ],
        };
    }

    function simulateSingle(seed, arena, half) {
        const env = createWorld(arena);
        const body = makeBody(seed, half, env.materials.dice);
        env.world.addBody(body);
        let stableFrames = 0;
        for (let step = 0; step < HEADLESS_MAX_STEPS; step++) {
            env.world.step(1 / 60);
            if (settled(body)) {
                if (++stableFrames >= SETTLE_FRAMES_REQUIRED) break;
            } else stableFrames = 0;
        }
        const result = readFace(body);
        return { face: result.face, valid: result.confidence > 0.85 };
    }

    function simulatePair(seedA, seedB, arena, half) {
        const env = createWorld(arena);
        const bodyA = makeBody(seedA, half, env.materials.dice);
        const bodyB = makeBody(seedB, half, env.materials.dice);
        env.world.addBody(bodyA);
        env.world.addBody(bodyB);
        let stableFrames = 0;
        for (let step = 0; step < HEADLESS_MAX_STEPS; step++) {
            env.world.step(1 / 60);
            if (settled(bodyA) && settled(bodyB)) {
                if (++stableFrames >= SETTLE_FRAMES_REQUIRED) break;
            } else stableFrames = 0;
        }
        const a = readFace(bodyA);
        const b = readFace(bodyB);
        return {
            a: a.face,
            b: b.face,
            valid: a.confidence > 0.85 && b.confidence > 0.85,
        };
    }

    function findSeeds(message) {
        const arena = message.arena;
        const half = Number(message.dieSize || 1) / 2;
        const dirHint = Number(message.dirHint) || 0;
        const strength = Number(message.strength) || 1;
        const cacheKey = [
            arena.width.toFixed(2), arena.depth.toFixed(2),
            message.targetA, message.targetB,
            dirHint.toFixed(2), strength.toFixed(2),
        ].join(':');
        if (cache.has(cacheKey)) return { ...cache.get(cacheKey), attempts: 0, cached: true };

        let attempts = 0;
        for (let outer = 0; outer < MAX_OUTER_RETRIES; outer++) {
            let seedA = null;
            for (let i = 0; i < MAX_INNER_RETRIES; i++) {
                attempts++;
                const candidate = generateSeed(DIE_A_X, dirHint, strength, arena);
                const result = simulateSingle(candidate, arena, half);
                if (result.valid && result.face === message.targetA) {
                    seedA = candidate;
                    break;
                }
            }
            if (!seedA) continue;
            for (let j = 0; j < MAX_INNER_RETRIES; j++) {
                attempts++;
                const seedB = generateSeed(DIE_B_X, -dirHint * 0.5, strength, arena);
                const resultB = simulateSingle(seedB, arena, half);
                if (!(resultB.valid && resultB.face === message.targetB)) continue;
                const pair = simulatePair(seedA, seedB, arena, half);
                if (pair.valid && pair.a === message.targetA && pair.b === message.targetB) {
                    const result = { seedA, seedB };
                    cache.set(cacheKey, result);
                    return { ...result, attempts, cached: false };
                }
            }
        }
        throw new Error('trajectory search exhausted');
    }

    worker.onmessage = event => {
        const message = event.data || {};
        try {
            worker.postMessage({ id: message.id, ...findSeeds(message) });
        } catch (error) {
            worker.postMessage({ id: message.id, error: error && error.message || 'dice worker failed' });
        }
    };
})(self);
