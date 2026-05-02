/* ============================================================
   board-ui.js
   Renders 40 Monopoly tiles as DOM elements positioned in
   an 11x11 CSS Grid. The center 9x9 area is reserved for the
   3D dice canvas.

   Grid positions (1-indexed for CSS):
     (11,11) = bottom-right = GO (index 0)
     Bottom row goes right→left (cols 11→1) for tiles 0..10
     Left col goes bottom→top (rows 11→1) for tiles 10..20
     Top row goes left→right (cols 1→11) for tiles 20..30
     Right col goes top→bottom (rows 1→11) for tiles 30..0
   ============================================================ */

(function (global) {
    'use strict';

    const TILES = global.MonopolyData.TILES;

    /**
     * Compute CSS Grid (col, row, colSpan, rowSpan) for tile at index i.
     * Grid is 11x11. Corners take 2x2 cells, regular tiles 1x2 cells.
     */
    function gridPosition(i) {
        // Corners: 4 fixed positions, each 2x2 cells
        if (i === 0)  return { col: 10, row: 10, cw: 2, rh: 2 }; // bottom-right (GO)
        if (i === 10) return { col: 1,  row: 10, cw: 2, rh: 2 }; // bottom-left (JAIL)
        if (i === 20) return { col: 1,  row: 1,  cw: 2, rh: 2 }; // top-left (FREE PARKING)
        if (i === 30) return { col: 10, row: 1,  cw: 2, rh: 2 }; // top-right (GO TO JAIL)

        // Regular tiles between corners
        if (i < 10) {
            // Bottom row, between GO (i=0) and JAIL (i=10)
            // tiles 1..9 occupy cols 9 down to 1, at rows 10-11
            // i=1 -> col 9, i=9 -> col 3? Let me reconsider:
            // Wait — corner GO is at col 10-11 (2 wide), JAIL at col 1-2.
            // So 9 regular tiles go between col 3 and col 9 (7 wide?). No, 9 tiles
            // need 9 cols. Grid must be 13 wide actually for 2+9+2 = 13.
            // Let me redo with 13×13 grid.
        }
        return null; // fallback
    }

    // ---- Use a 13x13 grid: 2 corners (each 2x2) + 9 regular tiles per side ----
    // Total = 2 + 9 + 2 = 13. Corners take cols 1-2 and 12-13, rows 1-2 and 12-13.
    // Regular tiles are 1 col × 2 rows (or 2 cols × 1 row depending on side).
    function gridPositionFinal(i) {
        // Corners (2x2 each)
        if (i === 0)  return { col: 12, row: 12, cw: 2, rh: 2 };
        if (i === 10) return { col: 1,  row: 12, cw: 2, rh: 2 };
        if (i === 20) return { col: 1,  row: 1,  cw: 2, rh: 2 };
        if (i === 30) return { col: 12, row: 1,  cw: 2, rh: 2 };

        if (i >= 1 && i <= 9) {
            // Bottom row: tile 1 next to GO (i=0), tile 9 next to JAIL (i=10)
            // GO is at cols 12-13, JAIL at cols 1-2.
            // Tile 1 → col 11, tile 9 → col 3.
            const col = 12 - i;
            return { col, row: 12, cw: 1, rh: 2 };
        }
        if (i >= 11 && i <= 19) {
            // Left column: tile 11 next to JAIL (i=10), tile 19 next to FREE PARKING (i=20)
            // JAIL at rows 12-13, FREE PARKING at rows 1-2.
            const row = 12 - (i - 10);
            return { col: 1, row, cw: 2, rh: 1 };
        }
        if (i >= 21 && i <= 29) {
            // Top row: tile 21 next to FREE PARKING (i=20), tile 29 next to GO TO JAIL (i=30)
            const col = 2 + (i - 20);
            return { col, row: 1, cw: 1, rh: 2 };
        }
        if (i >= 31 && i <= 39) {
            // Right column: tile 31 next to GO TO JAIL (i=30), tile 39 next to GO (i=0)
            const row = 2 + (i - 30);
            return { col: 12, row, cw: 2, rh: 1 };
        }
        return null;
    }

    /**
     * Determine which side each tile sits on for rotation purposes.
     * 'bottom' tiles read normally (text upright)
     * 'left'   tiles rotated 90° clockwise
     * 'top'    tiles rotated 180°
     * 'right'  tiles rotated 90° counter-clockwise
     * Corners stay normal.
     */
    function tileSide(i) {
        if (i === 0 || i === 10 || i === 20 || i === 30) return 'corner';
        if (i >= 1  && i <= 9)  return 'bottom';
        if (i >= 11 && i <= 19) return 'left';
        if (i >= 21 && i <= 29) return 'top';
        if (i >= 31 && i <= 39) return 'right';
        return 'corner';
    }

    function formatPrice(p) {
        return '$' + p;
    }

    /**
     * Build the inner HTML for a tile based on its data + side orientation.
     * Layout convention: color band always faces the BOARD CENTER,
     * which differs by side. The CSS handles the rotation.
     */
    function tileInnerHtml(tile) {
        if (tile.type === 'corner') {
            return `
                <div class="tile-inner tile-inner-corner">
                    <div class="corner-name">${tile.name}</div>
                    ${tile.subname ? `<div class="corner-subname">${tile.subname}</div>` : ''}
                </div>
            `;
        }

        if (tile.type === 'property') {
            return `
                <div class="tile-inner">
                    <div class="tile-band tile-band-${tile.group}"></div>
                    <div class="tile-content">
                        <div class="tile-name">${tile.name}</div>
                        <div class="tile-price">${formatPrice(tile.price)}</div>
                    </div>
                </div>
            `;
        }

        if (tile.type === 'railroad') {
            return `
                <div class="tile-inner">
                    <div class="tile-icon tile-icon-railroad">🚂</div>
                    <div class="tile-content">
                        <div class="tile-name tile-name-small">${tile.name}</div>
                        <div class="tile-price">${formatPrice(tile.price)}</div>
                    </div>
                </div>
            `;
        }

        if (tile.type === 'utility') {
            const icon = tile.name.startsWith('Electric') ? '💡' : '💧';
            return `
                <div class="tile-inner">
                    <div class="tile-icon tile-icon-utility">${icon}</div>
                    <div class="tile-content">
                        <div class="tile-name tile-name-small">${tile.name}</div>
                        <div class="tile-price">${formatPrice(tile.price)}</div>
                    </div>
                </div>
            `;
        }

        if (tile.type === 'chance') {
            return `
                <div class="tile-inner">
                    <div class="tile-special tile-special-chance">
                        <div class="special-icon">?</div>
                        <div class="special-label">CHANCE</div>
                    </div>
                </div>
            `;
        }

        if (tile.type === 'chest') {
            return `
                <div class="tile-inner">
                    <div class="tile-special tile-special-chest">
                        <div class="special-icon">$</div>
                        <div class="special-label">CHEST</div>
                    </div>
                </div>
            `;
        }

        if (tile.type === 'tax') {
            return `
                <div class="tile-inner">
                    <div class="tile-special tile-special-tax">
                        <div class="special-icon">💰</div>
                        <div class="special-label">${tile.name}</div>
                        <div class="special-sub">${tile.subname || ''}</div>
                    </div>
                </div>
            `;
        }

        return `<div class="tile-inner">${tile.name}</div>`;
    }

    /**
     * Render all 40 tiles into the #board element.
     */
    function renderBoard() {
        const board = document.getElementById('board');
        if (!board) return;

        for (const tile of TILES) {
            const pos = gridPositionFinal(tile.i);
            if (!pos) continue;

            const side = tileSide(tile.i);

            const el = document.createElement('div');
            el.className = `tile tile-${tile.type} tile-side-${side}`;
            el.dataset.idx = tile.i;
            el.style.gridColumn = `${pos.col} / span ${pos.cw}`;
            el.style.gridRow    = `${pos.row} / span ${pos.rh}`;

            el.innerHTML = tileInnerHtml(tile);
            board.appendChild(el);
        }
    }

    global.BoardUI = { renderBoard };
})(window);
