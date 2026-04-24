/* ============================================================
   Board3D.js  (Phase 2.1)

   A 40-tile Monopoly board laid flat on the scene.
   Layout:
     - 11x11 grid footprint, tiles only on perimeter
     - Corners are 2x2 tile equivalents
     - Regular tiles: narrow (1 wide) and long (going inward)
     - Center is a glassmorphic dice plate

   Phase 2.1: Structural geometry + color bands only.
   Phase 2.2 will add text labels, icons, prices.
   ============================================================ */

(function (global) {
    'use strict';

    const THREE = global.THREE;

    // --- Board dimensions ---
    // Board is square. Tile width = 1 unit. Corner = 2x2. 9 regular tiles
    // per side. Total side length = 2 + 9*1 + 2 = 13 units.
    const TILE_W = 1.0;          // regular tile short side
    const TILE_L = 2.0;          // regular tile long side (toward center)
    const CORNER = 2.0;          // corner tile side
    const BOARD_SIDE = CORNER * 2 + TILE_W * 9; // = 13
    const HALF = BOARD_SIDE / 2;

    // --- Color group palette ---
    // Classic Monopoly colors, tuned slightly for dark theme visibility
    const GROUP_COLORS = {
        brown:     0x8B4513,
        lightblue: 0x87CEEB,
        pink:      0xFF69B4,
        orange:    0xFFA500,
        red:       0xFF3B30,
        yellow:    0xFFD60A,
        green:     0x34C759,
        blue:      0x0A84FF,
        railroad:  0x2c2c2e,  // dark gray
        utility:   0xFFD60A,  // yellow-ish
        tax:       0xff9500,  // orange accent
        chance:    0xff9500,
        chest:     0x5ac8fa,
        corner:    0x1c1c1e,  // darker for GO/JAIL/PARKING/GOTO_JAIL
    };

    // --- Board spec (40 tiles, index 0..39 starting from GO) ---
    // type: one of 'corner', 'property', 'railroad', 'utility', 'tax',
    //       'chance', 'chest'
    // group: color group name for 'property' type
    // name: short label (used in Phase 2.2)
    const TILES = [
        // --- Bottom row (0..10), moving left (from bottom-right corner) ---
        { type: 'corner',    name: 'GO' },                                      // 0
        { type: 'property',  group: 'brown',     name: 'Mediterranean' },       // 1
        { type: 'chest',     name: 'Community Chest' },                          // 2
        { type: 'property',  group: 'brown',     name: 'Baltic' },              // 3
        { type: 'tax',       name: 'Income Tax' },                               // 4
        { type: 'railroad',  name: 'Reading RR' },                              // 5
        { type: 'property',  group: 'lightblue', name: 'Oriental' },            // 6
        { type: 'chance',    name: 'Chance' },                                   // 7
        { type: 'property',  group: 'lightblue', name: 'Vermont' },             // 8
        { type: 'property',  group: 'lightblue', name: 'Connecticut' },         // 9
        { type: 'corner',    name: 'JAIL' },                                     // 10

        // --- Left column (11..20), moving up ---
        { type: 'property',  group: 'pink',      name: 'St. Charles' },         // 11
        { type: 'utility',   name: 'Electric Co' },                              // 12
        { type: 'property',  group: 'pink',      name: 'States' },              // 13
        { type: 'property',  group: 'pink',      name: 'Virginia' },            // 14
        { type: 'railroad',  name: 'Pennsylvania RR' },                         // 15
        { type: 'property',  group: 'orange',    name: 'St. James' },           // 16
        { type: 'chest',     name: 'Community Chest' },                          // 17
        { type: 'property',  group: 'orange',    name: 'Tennessee' },           // 18
        { type: 'property',  group: 'orange',    name: 'New York' },            // 19
        { type: 'corner',    name: 'FREE PARKING' },                             // 20

        // --- Top row (21..30), moving right ---
        { type: 'property',  group: 'red',       name: 'Kentucky' },            // 21
        { type: 'chance',    name: 'Chance' },                                   // 22
        { type: 'property',  group: 'red',       name: 'Indiana' },             // 23
        { type: 'property',  group: 'red',       name: 'Illinois' },            // 24
        { type: 'railroad',  name: 'B & O RR' },                                // 25
        { type: 'property',  group: 'yellow',    name: 'Atlantic' },            // 26
        { type: 'property',  group: 'yellow',    name: 'Ventnor' },             // 27
        { type: 'utility',   name: 'Water Works' },                              // 28
        { type: 'property',  group: 'yellow',    name: 'Marvin Gardens' },      // 29
        { type: 'corner',    name: 'GO TO JAIL' },                               // 30

        // --- Right column (31..39), moving down ---
        { type: 'property',  group: 'green',     name: 'Pacific' },             // 31
        { type: 'property',  group: 'green',     name: 'North Carolina' },      // 32
        { type: 'chest',     name: 'Community Chest' },                          // 33
        { type: 'property',  group: 'green',     name: 'Pennsylvania' },        // 34
        { type: 'railroad',  name: 'Short Line RR' },                           // 35
        { type: 'chance',    name: 'Chance' },                                   // 36
        { type: 'property',  group: 'blue',      name: 'Park Place' },          // 37
        { type: 'tax',       name: 'Luxury Tax' },                               // 38
        { type: 'property',  group: 'blue',      name: 'Boardwalk' },           // 39
    ];

    /**
     * For each tile index, compute its center position (x, z) and rotation.
     * Side convention:
     *   side=0: bottom row (z = +HALF - halfDepth), tiles move left as i grows
     *   side=1: left column (x = -HALF + halfDepth), tiles move up (z negative)
     *   side=2: top row   (z = -HALF + halfDepth), tiles move right
     *   side=3: right col (x = +HALF - halfDepth), tiles move down
     *
     * Rotation around Y: tiles face the board center. Color band is on the
     * inner (center-facing) edge of each property tile.
     */
    function tileTransform(i) {
        // Map index -> side + position-along-side
        // Corners at indices 0, 10, 20, 30
        // Each side has 9 regular tiles between its two corners.
        let side, posOnSide, isCorner;
        if (i === 0)      { side = 0; posOnSide = 0;     isCorner = true; }
        else if (i < 10)  { side = 0; posOnSide = i;     isCorner = false; }
        else if (i === 10){ side = 1; posOnSide = 0;     isCorner = true; }
        else if (i < 20)  { side = 1; posOnSide = i-10;  isCorner = false; }
        else if (i === 20){ side = 2; posOnSide = 0;     isCorner = true; }
        else if (i < 30)  { side = 2; posOnSide = i-20;  isCorner = false; }
        else if (i === 30){ side = 3; posOnSide = 0;     isCorner = true; }
        else              { side = 3; posOnSide = i-30;  isCorner = false; }

        // Corners: fixed positions
        const cornerHalf = CORNER / 2;
        const corners = [
            [ HALF - cornerHalf,  HALF - cornerHalf],  // 0  bottom-right (GO)
            [-HALF + cornerHalf,  HALF - cornerHalf],  // 10 bottom-left (JAIL)
            [-HALF + cornerHalf, -HALF + cornerHalf],  // 20 top-left (FREE PARKING)
            [ HALF - cornerHalf, -HALF + cornerHalf],  // 30 top-right (GO TO JAIL)
        ];

        if (isCorner) {
            const [x, z] = corners[side];
            return { x, z, rotY: 0, isCorner: true };
        }

        // Regular tile: position along its side, between the two corners
        // Tile center offset from first-corner's edge = CORNER + (posOnSide - 0.5) * TILE_W
        // (posOnSide goes 1..9, tile 1 is nearest first corner)
        const halfDepth = TILE_L / 2;
        const alongOffset = CORNER + (posOnSide - 0.5) * TILE_W;

        let x, z, rotY;
        if (side === 0) {
            // Bottom row: first corner is at +HALF (right), moving left as i grows
            x = HALF - alongOffset;
            z = HALF - halfDepth;
            rotY = 0; // long side along Z, color band faces -Z (toward center)
        } else if (side === 1) {
            // Left column: first corner at +HALF z (bottom), moving to -HALF z (top)
            x = -HALF + halfDepth;
            z = HALF - alongOffset;
            rotY = Math.PI / 2;
        } else if (side === 2) {
            // Top row: first corner at -HALF x (left), moving to +HALF x (right)
            x = -HALF + alongOffset;
            z = -HALF + halfDepth;
            rotY = Math.PI;
        } else {
            // Right column: first corner at -HALF z (top), moving to +HALF z (bottom)
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
            this.tileMeshes = [];  // index -> mesh (for later highlighting)

            this._buildBaseboard();
            this._buildTiles();
            this._buildCenterPlate();

            sceneManager.scene.add(this.group);

            // Expose dimensions for camera framing
            global.__boardDebug = {
                boardSide: BOARD_SIDE,
                tileCount: TILES.length,
            };
        }

        /**
         * The "table" under the whole board - large dark slab so the board
         * visibly sits on a surface.
         */
        _buildBaseboard() {
            const baseGeom = new THREE.BoxGeometry(
                BOARD_SIDE + 0.8, 0.25, BOARD_SIDE + 0.8
            );
            const baseMat = new THREE.MeshStandardMaterial({
                color:     0x0a0c14,
                metalness: 0.2,
                roughness: 0.7,
            });
            const base = new THREE.Mesh(baseGeom, baseMat);
            base.position.y = -0.125;
            base.receiveShadow = true;
            this.group.add(base);

            // Subtle outer glow rim - app brand blue
            const rimGeom = new THREE.BoxGeometry(
                BOARD_SIDE + 0.8, 0.002, BOARD_SIDE + 0.8
            );
            const rimEdges = new THREE.EdgesGeometry(rimGeom);
            const rim = new THREE.LineSegments(
                rimEdges,
                new THREE.LineBasicMaterial({
                    color: 0x0a84ff,
                    transparent: true,
                    opacity: 0.6,
                })
            );
            rim.position.y = 0.005;
            this.group.add(rim);
        }

        /**
         * Build all 40 tiles as glassmorphic slabs with color bands.
         */
        _buildTiles() {
            for (let i = 0; i < TILES.length; i++) {
                const tile = TILES[i];
                const t = tileTransform(i);

                let mesh;
                if (t.isCorner) {
                    mesh = this._makeCornerTile(tile);
                } else {
                    mesh = this._makeRegularTile(tile);
                }

                mesh.position.set(t.x, 0.01, t.z);
                mesh.rotation.y = t.rotY;
                mesh.userData.tileIndex = i;
                this.tileMeshes[i] = mesh;
                this.group.add(mesh);
            }
        }

        _makeCornerTile(tile) {
            const g = new THREE.Group();

            // Main tile surface - slightly lighter than baseboard
            const baseGeom = new THREE.BoxGeometry(CORNER, 0.08, CORNER);
            const baseMat = new THREE.MeshStandardMaterial({
                color:     0x1c1e28,
                metalness: 0.15,
                roughness: 0.55,
            });
            const base = new THREE.Mesh(baseGeom, baseMat);
            base.position.y = 0.04;
            base.receiveShadow = true;
            g.add(base);

            // Thin highlight edge on top for glassy feel
            const edgeGeom = new THREE.BoxGeometry(CORNER, 0.002, CORNER);
            const edges = new THREE.EdgesGeometry(edgeGeom);
            const edge = new THREE.LineSegments(
                edges,
                new THREE.LineBasicMaterial({
                    color: 0x3a4a6e,
                    transparent: true,
                    opacity: 0.7,
                })
            );
            edge.position.y = 0.082;
            g.add(edge);

            return g;
        }

        _makeRegularTile(tile) {
            const g = new THREE.Group();

            // Main body of the tile: rectangle with long side toward center
            // In local coords: X = short (TILE_W), Z = long (TILE_L)
            // Color band should be on the -Z side (inner edge facing center)
            const baseGeom = new THREE.BoxGeometry(TILE_W, 0.08, TILE_L);
            const baseMat = new THREE.MeshStandardMaterial({
                color:     0x1c1e28,
                metalness: 0.15,
                roughness: 0.55,
            });
            const base = new THREE.Mesh(baseGeom, baseMat);
            base.position.y = 0.04;
            base.receiveShadow = true;
            g.add(base);

            // Color band (only for properties)
            if (tile.type === 'property' && tile.group) {
                const bandColor = GROUP_COLORS[tile.group];
                const bandGeom = new THREE.BoxGeometry(TILE_W, 0.09, TILE_L * 0.28);
                const bandMat = new THREE.MeshStandardMaterial({
                    color:     bandColor,
                    metalness: 0.05,
                    roughness: 0.4,
                    emissive:  bandColor,
                    emissiveIntensity: 0.12,
                });
                const band = new THREE.Mesh(bandGeom, bandMat);
                // Place band at inner edge (-Z in local = toward center)
                band.position.set(0, 0.045, -TILE_L/2 + (TILE_L * 0.14));
                band.receiveShadow = true;
                g.add(band);
            }

            // Icon/accent for special tiles (simple colored disc for now)
            if (tile.type === 'railroad' || tile.type === 'utility' ||
                tile.type === 'chance'   || tile.type === 'chest' ||
                tile.type === 'tax') {
                const accentColor = GROUP_COLORS[tile.type] || 0x888888;
                const iconGeom = new THREE.CircleGeometry(0.25, 16);
                const iconMat = new THREE.MeshBasicMaterial({
                    color: accentColor,
                    transparent: true,
                    opacity: 0.85,
                });
                const icon = new THREE.Mesh(iconGeom, iconMat);
                icon.rotation.x = -Math.PI / 2;
                icon.position.set(0, 0.082, 0);
                g.add(icon);
            }

            // Top highlight edge
            const edgeGeom = new THREE.BoxGeometry(TILE_W, 0.002, TILE_L);
            const edges = new THREE.EdgesGeometry(edgeGeom);
            const edge = new THREE.LineSegments(
                edges,
                new THREE.LineBasicMaterial({
                    color: 0x3a4a6e,
                    transparent: true,
                    opacity: 0.5,
                })
            );
            edge.position.y = 0.082;
            g.add(edge);

            return g;
        }

        /**
         * Center dice plate - glassmorphic, matches app card styling.
         * Inner dimensions of the board = BOARD_SIDE - 2*TILE_L = 13 - 4 = 9
         * So plate must be small enough to leave visible board ring around it.
         */
        _buildCenterPlate() {
            // Inner playable area is 9x9 units.
            // Make the dice plate a bit smaller so there's visible board around it.
            const plateSide = 6.5;

            // Glass plate - translucent light surface with rounded visual vibe
            const plateGeom = new THREE.BoxGeometry(plateSide, 0.06, plateSide);
            const plateMat = new THREE.MeshStandardMaterial({
                color:     0x2a3448,
                metalness: 0.35,
                roughness: 0.25,
                transparent: true,
                opacity: 0.55,
            });
            const plate = new THREE.Mesh(plateGeom, plateMat);
            plate.position.y = 0.05;
            plate.receiveShadow = true;
            this.group.add(plate);

            // Bright rim for the glass plate
            const rimEdgeGeom = new THREE.BoxGeometry(plateSide, 0.001, plateSide);
            const rimEdges = new THREE.EdgesGeometry(rimEdgeGeom);
            const rim = new THREE.LineSegments(
                rimEdges,
                new THREE.LineBasicMaterial({
                    color: 0x5ac8fa,
                    transparent: true,
                    opacity: 0.9,
                })
            );
            rim.position.y = 0.085;
            this.group.add(rim);

            // Store plate bounds for Dice code to read
            this.centerPlateBounds = {
                size: plateSide,
                topY: 0.08,
            };
        }

        /** Board dimensions (for camera framing, dice positioning) */
        get dimensions() {
            return {
                side: BOARD_SIDE,
                half: HALF,
                centerPlateSize: 6.5,
                centerPlateTopY: 0.08,
            };
        }
    }

    global.Board3D = Board3D;
    global.Board3D_TILES = TILES; // expose for debugging / later phases
})(window);