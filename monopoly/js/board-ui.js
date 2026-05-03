/* ============================================================
   board-ui.js  (v2)
   Renders 40 Monopoly tiles with monochrome SVG icons.
   Uses CSS Grid 13×13 to position perimeter tiles.
   ============================================================ */

(function (global) {
    'use strict';

    const TILES = global.MonopolyData.TILES;

    // ---- Inline SVG icons (monochrome, currentColor) ----
    const ICONS = {
        train: `
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C8 2 4 2.5 4 6v9.5C4 17.43 5.57 19 7.5 19L6 20.5V21h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
            </svg>
        `,
        bulb: `
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/>
            </svg>
        `,
        drop: `
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2.5c-1.4 2.4-3.4 5.5-5 8.4-1.5 2.7-2.5 4.7-2.5 6.6a7.5 7.5 0 0 0 15 0c0-1.9-1-3.9-2.5-6.6-1.6-2.9-3.6-6-5-8.4z"/>
            </svg>
        `,
        chance: `
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.07 12.85c.77-1.39 2.25-2.21 3.11-3.44.91-1.29.4-3.7-2.18-3.7-1.69 0-2.52 1.28-2.87 2.34L6.54 6.96C7.25 4.83 9.18 3 11.99 3c2.35 0 3.96 1.07 4.78 2.41.7 1.15 1.11 3.3.03 4.9-1.2 1.77-2.35 2.31-2.97 3.45-.25.46-.35.76-.35 2.24h-2.89c-.01-.78-.13-2.05.48-3.15zM14 20c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z"/>
            </svg>
        `,
        chest: `
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 4h14a2 2 0 0 1 2 2v3H3V6a2 2 0 0 1 2-2zm-2 7h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8zm9 2v3h2v-3h-2z"/>
            </svg>
        `,
        tax: `
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
            </svg>
        `,
    };

    function gridPositionFinal(i) {
        if (i === 0)  return { col: 12, row: 12, cw: 2, rh: 2 };
        if (i === 10) return { col: 1,  row: 12, cw: 2, rh: 2 };
        if (i === 20) return { col: 1,  row: 1,  cw: 2, rh: 2 };
        if (i === 30) return { col: 12, row: 1,  cw: 2, rh: 2 };

        if (i >= 1 && i <= 9) {
            return { col: 12 - i, row: 12, cw: 1, rh: 2 };
        }
        if (i >= 11 && i <= 19) {
            return { col: 1, row: 12 - (i - 10), cw: 2, rh: 1 };
        }
        if (i >= 21 && i <= 29) {
            return { col: 2 + (i - 20), row: 1, cw: 1, rh: 2 };
        }
        if (i >= 31 && i <= 39) {
            return { col: 12, row: 2 + (i - 30), cw: 2, rh: 1 };
        }
        return null;
    }

    function tileSide(i) {
        if (i === 0 || i === 10 || i === 20 || i === 30) return 'corner';
        if (i >= 1  && i <= 9)  return 'bottom';
        if (i >= 11 && i <= 19) return 'left';
        if (i >= 21 && i <= 29) return 'top';
        if (i >= 31 && i <= 39) return 'right';
        return 'corner';
    }

    function priceText(p) { return '$' + p; }

    /**
     * Build inner HTML for a tile.
     * Property tiles: <div.tile-band> + <div.tile-content>
     * Specials: <div.tile-special> with icon + label
     * Corners: <div.tile-inner-corner>
     */
    function tileInnerHtml(tile) {
        if (tile.type === 'corner') {
            return `
                <div class="tile-inner-corner">
                    <div class="corner-name">${tile.name}</div>
                    ${tile.subname ? `<div class="corner-subname">${tile.subname}</div>` : ''}
                </div>
            `;
        }

        if (tile.type === 'property') {
            return `
                <div class="tile-band tile-band-${tile.group}"></div>
                <div class="tile-content">
                    <div class="tile-num">${tile.i}</div>
                    <div class="tile-price">$${tile.price}</div>
                </div>
            `;
        }

        if (tile.type === 'railroad') {
            return `
                <div class="tile-content">
                    <div class="tile-icon">${ICONS.train}</div>
                    <div class="tile-num">${tile.i}</div>
                    <div class="tile-price">$${tile.price}</div>
                </div>
            `;
        }

        if (tile.type === 'utility') {
            const icon = tile.name.startsWith('Electric') ? ICONS.bulb : ICONS.drop;
            return `
                <div class="tile-content">
                    <div class="tile-icon">${icon}</div>
                    <div class="tile-num">${tile.i}</div>
                    <div class="tile-price">$${tile.price}</div>
                </div>
            `;
        }

        if (tile.type === 'chance') {
            return `
                <div class="tile-special">
                    <div class="special-icon-svg">${ICONS.chance}</div>
                </div>
            `;
        }

        if (tile.type === 'chest') {
            return `
                <div class="tile-special">
                    <div class="special-icon-svg">${ICONS.chest}</div>
                </div>
            `;
        }

        if (tile.type === 'tax') {
            return `
                <div class="tile-special">
                    <div class="special-icon-svg">${ICONS.tax}</div>
                </div>
            `;
        }

        return '';
    }

    function renderBoard(onTileClick) {
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

            if (onTileClick) {
                el.addEventListener('click', () => onTileClick(tile));
            }

            board.appendChild(el);
        }
    }

    global.BoardUI = { renderBoard, ICONS };
})(window);