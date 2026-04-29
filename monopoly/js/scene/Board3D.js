/* ============================================================
   Board3D.js  (v3 — Monopoly GO style)

   Visual language: bright saturated tiles on black baseboard.
   No glass, no frosted plate. Top-down readable.

   Layout:
     - 13×13 unit footprint, tiles only on perimeter
     - Each property tile: white body + colored top band on inner edge
     - Corner tiles: dark with single bright accent
     - Special tiles: full-tile colored bands (not discs) for max readability
     - Center plate: simple dark recessed area for dice
   ============================================================ */

(function (global) {
    'use strict';

    const THREE = global.THREE;

    const TILE_W   = 1.0;
    const TILE_L   = 2.0;
    const CORNER   = 2.0;
    const BOARD_SIDE = CORNER * 2 + TILE_W * 9;
    const HALF     = BOARD_SIDE / 2;

    // Tile depths (Y heights)
    const BASE_Y       = 0;
    const TILE_TOP_Y   = 0.18;   // top surface of tile body
    const BAND_TOP_Y   = 0.20;   // top of color band (raised slightly above body)

    // Color palette — saturated, board-game style (NOT muted for dark mode)
    const GROUP_COLORS = {
        brown:     0x8B4513,
        lightblue: 0x84d1f1,
        pink:      0xff5fa2,
        orange:    0xff9b1f,
        red:       0xff2a2a,
        yellow:    0xffd60a,
        green:     0x29c463,
        blue:      0x1a7df0,
        railroad:  0x111111,
        utility:   0xb8b8c4,
        tax:       0xff8a3d,
        chance:    0xff7a00,
        chest:     0x4ab8ff,
    };

    // Tile body colors (the white-ish part, not the color band)
    const TILE_BODY = 0xeeeef2;       // bright off-white for properties / specials
    const CORNER_BODY = 0x2a2a32;     // dark for GO/JAIL/PARKING/GOTOJAIL

    // Accent stripe colors (for corner tiles which don't get a regular band)
    const CORNER_ACCENT = {
        'GO':           0x29c463,   // green
        'JAIL':         0xff9b1f,   // orange
        'FREE PARKING': 0xff2a2a,   // red
        'GO TO JAIL':   0xff5fa2,   // pink
    };

    // The 40 tiles, classic order from GO going clockwise (when viewed top-down
    // from above, 0 is at +X +Z corner, indices increase going to -X then -Z then +X)
    const TILES = [
        { type: 'corner',    name: 'GO' },
        { type: 'property',  group: 'brown',     name: 'Mediterranean', price: 60 },
        { type: 'chest',     name: 'Community Chest' },
        { type: 'property',  group: 'brown',     name: 'Baltic',        price: 60 },
        { type: 'tax',       name: 'Income Tax' },
        { type: 'railroad',  name: 'Reading RR',                        price: 200 },
        { type: 'property',  group: 'lightblue', name: 'Oriental',      price: 100 },
        { type: 'chance',    name: 'Chance' },
        { type: 'property',  group: 'lightblue', name: 'Vermont',       price: 100 },
        { type: 'property',  group: 'lightblue', name: 'Connecticut',   price: 120 },
        { type: 'corner',    name: 'JAIL' },
        { type: 'property',  group: 'pink',      name: 'St. Charles',   price: 140 },
        { type: 'utility',   name: 'Electric Co',                       price: 150 },
        { type: 'property',  group: 'pink',      name: 'States',        price: 140 },
        { type: 'property',  group: 'pink',      name: 'Virginia',      price: 160 },
        { type: 'railroad',  name: 'Pennsylvania RR',                   price: 200 },
        { type: 'property',  group: 'orange',    name: 'St. James',     price: 180 },
        { type: 'chest',     name: 'Community Chest' },
        { type: 'property',  group: 'orange',    name: 'Tennessee',     price: 180 },
        { type: 'property',  group: 'orange',    name: 'New York',      price: 200 },
        { type: 'corner',    name: 'FREE PARKING' },
        { type: 'property',  group: 'red',       name: 'Kentucky',      price: 220 },
        { type: 'chance',    name: 'Chance' },
        { type: 'property',  group: 'red',       name: 'Indiana',       price: 220 },
        { type: 'property',  group: 'red',       name: 'Illinois',      price: 240 },
        { type: 'railroad',  name: 'B & O RR',                          price: 200 },
        { type: 'property',  group: 'yellow',    name: 'Atlantic',      price: 260 },
        { type: 'property',  group: 'yellow',    name: 'Ventnor',       price: 260 },
        { type: 'utility',   name: 'Water Works',                       price: 150 },
        { type: 'property',  group: 'yellow',    name: 'Marvin Gardens',price: 280 },
        { type: 'corner',    name: 'GO TO JAIL' },
        { type: 'property',  group: 'green',     name: 'Pacific',       price: 300 },
        { type: 'property',  group: 'green',     name: 'North Carolina',price: 300 },
        { type: 'chest',     name: 'Community Chest' },
        { type: 'property',  group: 'green',     name: 'Pennsylvania',  price: 320 },
        { type: 'railroad',  name: 'Short Line RR',                     price: 200 },
        { type: 'chance',    name: 'Chance' },
        { type: 'property',  group: 'blue',      name: 'Park Place',    price: 350 },
        { type: 'tax',       name: 'Luxury Tax' },
        { type: 'property',  group: 'blue',      name: 'Boardwalk',     price: 400 },
    ];

    /**
     * Given a tile index 0..39, return:
     *   x, z      world position of tile center
     *   rotY      rotation around Y so the inner color band faces center
     *   isCorner
     */
    function tileTransform(i) {
        let side, posOnSide, isCorner;
        if (i === 0)      { side = 0; posOnSide = 0;     isCorner = true; }
        else if (i < 10)  { side = 0; posOnSide = i;     isCorner = false; }
        else if (i === 10){ side = 1; posOnSide = 0;     isCorner = true; }
        else if (i < 20)  { side = 1; posOnSide = i-10;  isCorner = false; }
        else if (i === 20){ side = 2; posOnSide = 0;     isCorner = true; }
        else if (i < 30)  { side = 2; posOnSide = i-20;  isCorner = false; }
        else if (i === 30){ side = 3; posOnSide = 0;     isCorner = true; }
        else              { side = 3; posOnSide = i-30;  isCorner = false; }

        const cornerHalf = CORNER / 2;
        const corners = [
            [ HALF - cornerHalf,  HALF - cornerHalf],
            [-HALF + cornerHalf,  HALF - cornerHalf],
            [-HALF + cornerHalf, -HALF + cornerHalf],
            [ HALF - cornerHalf, -HALF + cornerHalf],
        ];

        if (isCorner) {
            const [x, z] = corners[side];
            return { x, z, rotY: 0, isCorner: true };
        }

        const halfDepth = TILE_L / 2;
        const alongOffset = CORNER + (posOnSide - 0.5) * TILE_W;

        let x, z, rotY;
        if (side === 0) {
            x = HALF - alongOffset;
            z = HALF - halfDepth;
            rotY = 0;
        } else if (side === 1) {
            x = -HALF + halfDepth;
            z = HALF - alongOffset;
            rotY = Math.PI / 2;
        } else if (side === 2) {
            x = -HALF + alongOffset;
            z = -HALF + halfDepth;
            rotY = Math.PI;
        } else {
            x = HALF - halfDepth;
            z = -HALF + alongOffset;
            rotY = -Math.PI / 2;
        }

        return { x, z, rotY, isCorner: false };
    }

    class Board3D {
        constructor(sceneManager) {
            this.sm = sceneManager;
            this.group = new THREE.Group();
            this.tileMeshes = [];

            this._buildBaseboard();
            this._buildTiles();
            this._buildCenterPlate();

            sceneManager.scene.add(this.group);

            global.__boardDebug = {
                boardSide: BOARD_SIDE,
                tileCount: TILES.length,
            };
        }

        _buildBaseboard() {
            // Dark baseboard - tiles sit ON it. Slightly larger than tile ring.
            const margin = 0.4;
            const sz = BOARD_SIDE + margin * 2;
            const baseGeom = new THREE.BoxGeometry(sz, 0.12, sz);
            const baseMat = new THREE.MeshStandardMaterial({
                color:     0x000000,
                metalness: 0.0,
                roughness: 1.0,
            });
            const base = new THREE.Mesh(baseGeom, baseMat);
            base.position.y = -0.06;
            base.receiveShadow = true;
            this.group.add(base);

            // Subtle rim line on the absolute outer edge - app brand blue
            const rimGeom = new THREE.BoxGeometry(sz, 0.001, sz);
            const rimEdges = new THREE.EdgesGeometry(rimGeom);
            const rim = new THREE.LineSegments(
                rimEdges,
                new THREE.LineBasicMaterial({
                    color: 0x0a84ff,
                    transparent: true,
                    opacity: 0.55,
                })
            );
            rim.position.y = 0.005;
            this.group.add(rim);
        }

        _buildTiles() {
            for (let i = 0; i < TILES.length; i++) {
                const tile = TILES[i];
                const t = tileTransform(i);

                let mesh = t.isCorner
                    ? this._makeCornerTile(tile)
                    : this._makeRegularTile(tile);

                mesh.position.set(t.x, BASE_Y, t.z);
                mesh.rotation.y = t.rotY;
                mesh.userData = { tileIndex: i, tile };
                this.tileMeshes[i] = mesh;
                this.group.add(mesh);
            }
        }

        _makeCornerTile(tile) {
            const g = new THREE.Group();

            // Dark base
            const baseGeom = new THREE.BoxGeometry(CORNER, 0.18, CORNER);
            const baseMat = new THREE.MeshStandardMaterial({
                color:     CORNER_BODY,
                metalness: 0.1,
                roughness: 0.65,
            });
            const base = new THREE.Mesh(baseGeom, baseMat);
            base.position.y = 0.09;
            base.receiveShadow = true;
            base.castShadow = true;
            g.add(base);

            // Bright accent stripe on top - color depends on which corner
            const accentColor = CORNER_ACCENT[tile.name] || 0x0a84ff;
            const stripeGeom = new THREE.BoxGeometry(CORNER * 0.65, 0.02, CORNER * 0.18);
            const stripeMat = new THREE.MeshStandardMaterial({
                color: accentColor,
                emissive: accentColor,
                emissiveIntensity: 0.7,
                metalness: 0.0,
                roughness: 0.4,
            });
            const stripe = new THREE.Mesh(stripeGeom, stripeMat);
            stripe.position.y = 0.19;
            g.add(stripe);

            return g;
        }

        _makeRegularTile(tile) {
            const g = new THREE.Group();

            // White body - this is the PROMINENT part
            const bodyGeom = new THREE.BoxGeometry(TILE_W, 0.18, TILE_L);
            const bodyMat = new THREE.MeshStandardMaterial({
                color:     TILE_BODY,
                metalness: 0.0,
                roughness: 0.7,
            });
            const body = new THREE.Mesh(bodyGeom, bodyMat);
            body.position.y = 0.09;
            body.receiveShadow = true;
            body.castShadow = true;
            g.add(body);

            // Color band on inner edge (-Z in local coords = toward board center)
            // For PROPERTIES: colored band per group
            // For SPECIALS (chance/chest/tax/railroad/utility): full-width band of accent color
            let bandColor = null;
            let bandLengthRatio = 0.30; // for properties

            if (tile.type === 'property' && tile.group) {
                bandColor = GROUP_COLORS[tile.group];
            } else if (tile.type in GROUP_COLORS) {
                bandColor = GROUP_COLORS[tile.type];
                bandLengthRatio = 1.0; // fill the entire long side for specials
            }

            if (bandColor !== null) {
                const bandLen = TILE_L * bandLengthRatio;
                const bandGeom = new THREE.BoxGeometry(TILE_W, 0.04, bandLen);
                const bandMat = new THREE.MeshStandardMaterial({
                    color:    bandColor,
                    emissive: bandColor,
                    emissiveIntensity: 0.4,
                    metalness: 0.0,
                    roughness: 0.5,
                });
                const band = new THREE.Mesh(bandGeom, bandMat);

                // Position: properties = at inner edge; specials = centered
                const zOffset = (tile.type === 'property')
                    ? -TILE_L/2 + bandLen/2
                    : 0;
                band.position.set(0, 0.20, zOffset);
                g.add(band);
            }

            return g;
        }

        _buildCenterPlate() {
            // Simple recessed dark square. NO glass, NO transparency, NO frosted.
            // Just a darker tone that reads as "table center where dice live".
            const plateSide = 6.5;

            const plateGeom = new THREE.BoxGeometry(plateSide, 0.10, plateSide);
            const plateMat = new THREE.MeshStandardMaterial({
                color:     0x0e1a2e,
                metalness: 0.15,
                roughness: 0.55,
            });
            const plate = new THREE.Mesh(plateGeom, plateMat);
            plate.position.y = 0.05;
            plate.receiveShadow = true;
            this.group.add(plate);

            // Bright neon outline so the plate reads as a distinct zone
            const rimGeom = new THREE.BoxGeometry(plateSide, 0.001, plateSide);
            const rimEdges = new THREE.EdgesGeometry(rimGeom);
            const rim = new THREE.LineSegments(
                rimEdges,
                new THREE.LineBasicMaterial({
                    color: 0x0a84ff,
                    transparent: true,
                    opacity: 1.0,
                })
            );
            rim.position.y = 0.105;
            this.group.add(rim);

            // Inner softer outline for depth
            const innerRimGeom = new THREE.BoxGeometry(plateSide - 0.4, 0.001, plateSide - 0.4);
            const innerRimEdges = new THREE.EdgesGeometry(innerRimGeom);
            const innerRim = new THREE.LineSegments(
                innerRimEdges,
                new THREE.LineBasicMaterial({
                    color: 0x5ac8fa,
                    transparent: true,
                    opacity: 0.4,
                })
            );
            innerRim.position.y = 0.106;
            this.group.add(innerRim);

            this.centerPlateBounds = {
                size: plateSide,
                topY: 0.10,
            };
        }

        get dimensions() {
            return {
                side: BOARD_SIDE,
                half: HALF,
                centerPlateSize: 6.5,
                centerPlateTopY: 0.10,
            };
        }
    }

    global.Board3D = Board3D;
    global.Board3D_TILES = TILES;
})(window);