/* One bounded canvas, pre-baked material sprites, no per-fragment DOM or live-board writes.
   A clear runs as a wave from the placed piece: the line flashes, every cell pops in turn and then
   breaks the way its material would. All motion is closed-form, so any frame is reproducible. */
(function (root) {
    'use strict';
    const clamp = n => Math.max(0, Math.min(1, n));
    const ease = n => 1 - Math.pow(1 - clamp(n), 3);
    const STEP = 30, FLASH = 170, GLOW = 260, APPEAR = 120;
    // Atlas: a 96px tile per colour row, then 16 sprite slots of 40px with a 2px gutter on each side,
    // so filtering a scaled or rotated sprite never samples its neighbour.
    const SIZE = 96, FRAG = 40, STRIDE = 44, TYPES = 16, MESH = 34;
    const slotX = slot => SIZE + 4 + slot * STRIDE + 2;
    const budget = (cells, reduced, lowPower) => reduced ? 0 : Math.min(lowPower ? 192 : 360, cells * 12);
    const vivid = [
        ['#ff7064', '#ff3b30', '#c41f17'], ['#ffb547', '#ff8a00', '#cc5f00'], ['#ffe55c', '#ffc600', '#c99300'],
        ['#63e27b', '#2cc149', '#1b8c31'], ['#4eabff', '#0a7bff', '#0053c2'], ['#8f86ff', '#5646f2', '#3424bd'], ['#d683ff', '#b03ff0', '#7c19b5'],
    ];
    const mono = color => Array(7).fill(color);
    const PALETTES = {
        classic: vivid, jelly: vivid, wool: vivid, candy: vivid,
        gem: [
            ['#ff86a1', '#ec1650', '#8f032a'], ['#ffc370', '#ff7a00', '#a33f00'], ['#fff07a', '#ffc905', '#a87500'],
            ['#83f6ad', '#0fc46a', '#036b38'], ['#80c9ff', '#1474ff', '#0735a0'], ['#ada2ff', '#5a3eff', '#281398'], ['#ec9fff', '#b52aff', '#6609a3'],
        ],
        paint: [
            ['#ff6152', '#ff2a1c', '#cc160a'], ['#ffa535', '#ff7d00', '#d65c00'], ['#ffe23f', '#ffce00', '#dba300'],
            ['#4fe172', '#14c444', '#0a952f'], ['#43a0ff', '#006fff', '#004ccc'], ['#8273ff', '#4e39ff', '#311dcc'], ['#d562ff', '#ac2bf0', '#7f12bf'],
        ],
        cheese: mono(['#ffe672', '#ffc21d', '#d98e00']),
        honey: mono(['#ffcf48', '#f49c06', '#b05c00']),
        porcelain: mono(['#ffffff', '#f2f6fb', '#cddcee']),
        wood: mono(['#ecb882', '#c4834d', '#8c5229']),
        ice: mono(['#ecfcff', '#94dff7', '#3c9dce']),
    };
    const palette = (id, color) => (PALETTES[id] || vivid)[Math.max(0, Math.min(6, color | 0))];
    const gradient = (id, color) => { const [a, b, c] = palette(id, color); return `linear-gradient(135deg,${a} 0%,${b} 50%,${c} 100%)`; };
    const monochrome = id => PALETTES[id] && PALETTES[id][0] === PALETTES[id][6];
    // pop: ms the cell bulges before it breaks; flash: white impact strength; white: glow is white-hot rather than tinted;
    // glow: strength of the light left where a cell burst.
    const SPEC = {
        classic: { pop: 70, flash: .7, white: true, glow: .85, life: 760 },
        squish: { pop: 100, flash: .35, white: false, glow: .7, life: 820 },
        soft: { pop: 90, flash: .2, white: false, glow: .45, life: 1000 },
        shatter: { pop: 80, flash: .75, white: true, glow: .85, life: 720 },
        paint: { pop: 0, flash: 0, white: false, glow: 0, life: 760 },
        crumb: { pop: 70, flash: .3, white: false, glow: .5, life: 780 },
        honey: { pop: 130, flash: .3, white: false, glow: .3, life: 860 },
        porcelain: { pop: 100, flash: .45, white: true, glow: .6, life: 800 },
        wood: { pop: 70, flash: .25, white: false, glow: .4, life: 820 },
        candy: { pop: 75, flash: .6, white: true, glow: .8, life: 760 },
        ice: { pop: 75, flash: .55, white: true, glow: .8, life: 860 },
    };
    // Particle groups per material. slots [from, to) index the sprite slots of a colour row; the first
    // group is the material's main body and appears exactly when the cell disappears.
    const GROUPS = {
        classic: [
            { n: 3, slots: [0, 8], kind: 'chunk', size: [14, 19], speed: [80, 220], up: [130, 270], g: 1150, spin: 7, life: 760, shrink: .45 },
            { n: 6, slots: [0, 8], kind: 'chunk', size: [7, 12], speed: [100, 270], up: [150, 310], g: 1150, spin: 10, life: 720, shrink: .5 },
            { n: 3, slots: [15, 16], kind: 'spark', size: [9, 15], speed: [10, 50], life: 520, add: true },
        ],
        squish: [
            { n: 4, slots: [0, 8], kind: 'blob', size: [17, 27], speed: [60, 190], up: [110, 240], g: 950, spin: 2, life: 820, shrink: .35 },
            { n: 3, slots: [12, 14], kind: 'chunk', size: [5, 9], speed: [110, 260], up: [150, 300], g: 1000, spin: 0, life: 680, shrink: .4 },
            { n: 1, slots: [15, 16], kind: 'mist', size: [34, 40], speed: [0, 0], life: 380, grow: 1.7 },
        ],
        soft: [
            { n: 5, slots: [0, 8], kind: 'float', size: [17, 25], speed: [50, 150], up: [90, 170], g: 210, drag: 3.2, sway: 9, spin: 2, life: 1000, shrink: .35 },
            { n: 2, slots: [12, 13], kind: 'float', size: [16, 22], speed: [40, 120], up: [70, 140], g: 190, drag: 3, sway: 7, spin: 3, life: 940, shrink: .3 },
            { n: 2, slots: [13, 14], kind: 'float', size: [8, 12], speed: [30, 90], up: [50, 110], g: 150, drag: 2.6, sway: 6, spin: 1, life: 900, shrink: .2 },
        ],
        shatter: [
            { n: 12, mesh: true, kind: 'chunk', speed: [110, 280], up: [120, 260], g: 1200, spin: 11, life: 720, shrink: .35 },
            { n: 2, slots: [12, 14], kind: 'chunk', size: [4, 7], speed: [80, 220], up: [100, 240], g: 900, spin: 8, life: 650, shrink: .3 },
            { n: 3, slots: [15, 16], kind: 'spark', size: [11, 19], speed: [10, 40], life: 460, add: true },
        ],
        crumb: [
            { n: 4, slots: [0, 8], kind: 'chunk', size: [19, 27], speed: [70, 200], up: [130, 260], g: 1250, spin: 6, life: 800, shrink: .2 },
            { n: 4, slots: [12, 14], kind: 'chunk', size: [5, 9], speed: [50, 180], up: [90, 200], g: 1050, spin: 6, life: 700, shrink: .2 },
        ],
        honey: [
            { n: 1, slots: [12, 13], kind: 'melt', size: [30, 36], life: 360 },
            { n: 4, slots: [0, 8], kind: 'drip', size: [20, 28], speed: [8, 40], up: [-60, -10], g: 900, life: 900 },
            { n: 2, slots: [12, 13], kind: 'chunk', size: [6, 10], speed: [50, 150], up: [90, 190], g: 950, spin: 0, life: 680, shrink: .3 },
            { n: 2, slots: [13, 14], kind: 'float', size: [7, 11], speed: [10, 40], up: [40, 80], g: -60, drag: 1.5, sway: 4, spin: 0, life: 700, shrink: 0 },
        ],
        porcelain: [
            { n: 12, mesh: true, kind: 'chunk', speed: [40, 130], up: [60, 150], g: 1450, spin: 7, life: 800, shrink: .15 },
            { n: 1, slots: [12, 13], kind: 'mist', size: [20, 28], life: 560, grow: 1.4, alpha: .55 },
            { n: 2, slots: [13, 14], kind: 'chunk', size: [4, 7], speed: [80, 200], up: [100, 200], g: 1200, spin: 9, life: 600, shrink: 0 },
        ],
        wood: [
            { n: 3, slots: [0, 8], kind: 'chunk', size: [28, 35], speed: [80, 220], up: [140, 260], g: 1200, spin: 6, life: 820, shrink: .12 },
            { n: 2, slots: [8, 12], kind: 'chunk', size: [18, 24], speed: [110, 260], up: [160, 290], g: 1150, spin: 9, life: 760, shrink: .2 },
            { n: 5, slots: [12, 14], kind: 'float', size: [4, 7], speed: [30, 120], up: [40, 110], g: 260, drag: 2.4, sway: 5, spin: 4, life: 900, shrink: 0 },
        ],
        candy: [
            { n: 5, slots: [0, 8], kind: 'chunk', size: [13, 20], speed: [120, 290], up: [180, 330], g: 1300, spin: 9, life: 760, shrink: .25 },
            { n: 3, slots: [12, 13], kind: 'chunk', size: [11, 15], speed: [130, 300], up: [220, 360], g: 1300, spin: 5, life: 760, shrink: .2 },
            { n: 3, slots: [13, 14], kind: 'chunk', size: [3, 5], speed: [60, 200], up: [100, 220], g: 900, spin: 6, life: 600, shrink: 0 },
            { n: 2, slots: [15, 16], kind: 'spark', size: [9, 14], speed: [10, 40], life: 480, add: true },
        ],
        ice: [
            { n: 12, mesh: true, kind: 'chunk', speed: [80, 230], up: [90, 220], g: 1150, spin: 9, life: 860, shrink: .3 },
            { n: 2, slots: [12, 13], kind: 'mist', size: [30, 42], life: 720, grow: 1.6 },
            { n: 3, slots: [13, 14], kind: 'chunk', size: [5, 9], speed: [60, 200], up: [80, 200], g: 900, spin: 8, life: 700, shrink: 0 },
            { n: 1, slots: [15, 16], kind: 'spark', size: [9, 14], speed: [5, 30], life: 420, add: true },
        ],
        // Paint droplets fly off the brush head and drip from the lifting tail; see clear().
        paint: [
            { n: 3, slots: [12, 13], kind: 'chunk', size: [8, 14], speed: [40, 130], up: [90, 210], g: 1100, spin: 0, life: 640, shrink: .2 },
            { n: 1, slots: [13, 14], kind: 'drip', size: [10, 15], speed: [0, 10], up: [-40, -10], g: 900, life: 620 },
        ],
    };
    const perCell = effect => (GROUPS[effect] || GROUPS.classic).reduce((n, g) => n + g.n, 0);
    // Longest visible time of a full-width line clear started at one end.
    const duration = effect => effect === 'paint' ? SPEC.paint.life + 620 : (SPEC[effect] || SPEC.classic).pop + 7 * STEP + Math.max(...(GROUPS[effect] || GROUPS.classic).map(g => g.life));
    // Small deterministic generator: identical clears replay identically, which keeps visual QA stable.
    function seeded(seed) {
        let s = seed >>> 0;
        return () => { s = (s + 0x6d2b79f5) >>> 0; let v = Math.imul(s ^ (s >>> 15), s | 1); v ^= v + Math.imul(v ^ (v >>> 7), v | 61); return ((v ^ (v >>> 14)) >>> 0) / 4294967296; };
    }
    const lerp = (range, k) => range[0] + (range[1] - range[0]) * k;
    const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
    // A small Voronoi fracture is baked once, never recomputed during animation.
    function fractureMesh(effect) {
        if (!['shatter', 'porcelain', 'ice'].includes(effect)) return null;
        const sites = [[8,12],[34,8],[64,19],[86,7],[18,43],[43,31],[74,45],[91,65],[8,79],[37,68],[58,90],[83,87]];
        return sites.map(([x, y], index) => {
            let points = [[5,0],[91,0],[96,5],[96,91],[91,96],[5,96],[0,91],[0,5]];
            sites.forEach(([ox, oy], other) => {
                if (other === index) return;
                const nx = ox - x, ny = oy - y, edge = (ox * ox - x * x + oy * oy - y * y) / 2, next = [];
                points.forEach((p, i) => {
                    const q = points[(i + 1) % points.length], a = p[0] * nx + p[1] * ny - edge, b = q[0] * nx + q[1] * ny - edge;
                    if (a <= 0) next.push(p);
                    if ((a <= 0) !== (b <= 0)) { const t = a / (a - b); next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
                });
                points = next;
            });
            const left = Math.min(...points.map(p => p[0])), top = Math.min(...points.map(p => p[1]));
            const w = Math.max(...points.map(p => p[0])) - left, h = Math.max(...points.map(p => p[1])) - top;
            return { points, left, top, w, h };
        });
    }
    // Two distinct right-to-left passes: cover, a 34ms hold, then lift the tail.
    const paintProgress = t => ({ head: 1 - ease(t / .46), tail: 1 - ease((t - .505) / .495) });
    // When the head (or tail) of the brush reaches a cell, as a fraction of the stroke.
    const paintReach = (index, phase) => phase === 'head' ? .46 * (1 - Math.cbrt(index / 8)) : .505 + .495 * (1 - Math.cbrt(index / 8));
    // Each cell breaks after the wave travels from the nearest placed cell of its own line.
    function waveDelays(cells, rows, cols, origin) {
        const placed = (origin || []).filter(p => Number.isInteger(p?.r) && Number.isInteger(p?.c));
        return cells.map(cell => {
            let best = Infinity;
            if (rows.includes(cell.r)) {
                const own = placed.filter(p => p.r === cell.r);
                best = Math.min(best, own.length ? Math.min(...own.map(p => Math.abs(p.c - cell.c))) : Math.abs(cell.c - 3.5) - .5);
            }
            if (cols.includes(cell.c)) {
                const own = placed.filter(p => p.c === cell.c);
                best = Math.min(best, own.length ? Math.min(...own.map(p => Math.abs(p.r - cell.r))) : Math.abs(cell.r - 3.5) - .5);
            }
            return Number.isFinite(best) ? Math.max(0, best) * STEP : 0;
        });
    }
    // The all-clear sweep spreads over the empty board outward from the lines that were just cleared.
    function sweepDelays(cells, rows, cols) {
        return cells.map(({ r, c }) => {
            const distances = [...rows.map(row => Math.abs(r - row)), ...cols.map(col => Math.abs(c - col))];
            const d = distances.length ? Math.min(...distances) : Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5)) - .5;
            return 280 + d * 45;
        });
    }
    function create({ document: doc, textureBase, textureQuery = '', lowPower = false, now = () => performance.now(), schedule = requestAnimationFrame, cancel = cancelAnimationFrame }) {
        let canvas, ctx, frame = 0, bursts = [], geometry, slowFrames = 0, previous = 0, constrained = lowPower, scale = 1, serial = 0;
        const banks = new Map(), occupied = new Set();
        const PAD = 64;
        const light = () => doc.documentElement?.dataset?.theme === 'light';
        function makeCanvas(w, h) { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; }
        function roundRect(c, x, y, w, h, r) {
            c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
        }
        function poly(c, points, fill) { c.beginPath(); c.moveTo(...points[0]); points.slice(1).forEach(p => c.lineTo(...p)); c.closePath(); c.fillStyle = fill; c.fill(); }
        function radial(c, x, y, r, stops) { const g = c.createRadialGradient(x, y, 0, x, y, r); stops.forEach(([o, v]) => g.addColorStop(o, v)); return g; }
        function linear(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, v]) => g.addColorStop(o, v)); return g; }
        function star(a, cx, cy, r, tint) {
            a.fillStyle = radial(a, cx, cy, r, [[0, '#ffffff'], [.3, tint], [1, 'rgba(255,255,255,0)']]);
            a.beginPath(); a.moveTo(cx, cy - r);
            for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) a.quadraticCurveTo(cx + (dx + dy) * r * .14, cy + (dy - dx) * r * .14, cx + dx * r, cy + dy * r);
            a.fill();
            a.fillStyle = radial(a, cx, cy, r * .45, [[0, 'rgba(255,255,255,.95)'], [1, 'rgba(255,255,255,0)']]); a.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
        function bevelCube(a, pal, x, y, s, r) {
            roundRect(a, x, y, s, s, r); a.fillStyle = linear(a, x, y, x + s, y + s, [[0, pal[0]], [.5, pal[1]], [1, pal[2]]]); a.fill();
            a.save(); a.clip(); const b = s * .17;
            poly(a, [[x, y], [x + s, y], [x + s - b, y + b], [x + b, y + b]], 'rgba(255,255,255,.52)');
            poly(a, [[x, y], [x + b, y + b], [x + b, y + s - b], [x, y + s]], 'rgba(255,255,255,.22)');
            poly(a, [[x + s, y], [x + s, y + s], [x + s - b, y + s - b], [x + s - b, y + b]], 'rgba(0,0,0,.16)');
            poly(a, [[x, y + s], [x + b, y + s - b], [x + s - b, y + s - b], [x + s, y + s]], 'rgba(0,0,0,.3)');
            a.restore();
        }
        function meshPiece(a, bank, tile, i, effect) {
            const piece = bank.mesh[i], o = (FRAG - MESH) / 2;
            const points = piece.points.map(([px, py]) => [o + (px - piece.left) / piece.w * MESH, o + (py - piece.top) / piece.h * MESH]);
            const outline = () => { a.beginPath(); a.moveTo(...points[0]); points.slice(1).forEach(p => a.lineTo(...p)); a.closePath(); };
            if (effect === 'porcelain') { a.save(); a.translate(1.4, 1.6); outline(); a.fillStyle = bank.light ? '#8197b3' : '#9fb2c9'; a.fill(); a.restore(); }
            outline(); a.save(); a.clip();
            if (effect === 'ice') a.globalAlpha = .9;
            a.drawImage(tile, piece.left, piece.top, piece.w, piece.h, o, o, MESH, MESH);
            a.globalAlpha = 1;
            const [p0, p1] = points;
            if (effect === 'shatter') {
                poly(a, [p0, p1, [20, 20]], 'rgba(255,255,255,.42)');
                poly(a, [points[2] || p1, points[3] || p0, [20, 20]], 'rgba(0,0,0,.14)');
            } else if (effect === 'ice') {
                poly(a, [p0, p1, [20, 20]], 'rgba(255,255,255,.35)');
                a.strokeStyle = 'rgba(255,255,255,.8)'; a.lineWidth = 1; a.beginPath(); a.moveTo((p0[0] + 20) / 2, (p0[1] + 20) / 2); a.lineTo(20, 20); a.stroke();
            }
            a.restore();
            outline();
            if (effect === 'porcelain') { a.strokeStyle = bank.light ? 'rgba(70,98,138,.75)' : 'rgba(255,255,255,.95)'; a.lineWidth = .9; }
            else if (effect === 'ice') { a.strokeStyle = bank.light ? 'rgba(36,118,170,.8)' : 'rgba(255,255,255,.95)'; a.lineWidth = 1.4; }
            else { a.strokeStyle = 'rgba(255,255,255,.8)'; a.lineWidth = 1.1; }
            a.stroke();
        }
        // One 40px sprite, already translated to its slot. pal = [light, mid, dark].
        function sprite(a, bank, pal, tile, slot) {
            const effect = bank.theme.effect, i = slot, rnd = seeded(slot * 97 + 13);
            if (slot === 14) {
                const core = SPEC[effect]?.white ? 'rgba(255,255,255,.95)' : rgba(pal[0], .95);
                a.fillStyle = radial(a, 20, 20, 20, [[0, core], [.32, rgba(pal[1], .5)], [1, rgba(pal[1], 0)]]); a.fillRect(0, 0, 40, 40);
                return;
            }
            if (slot === 15) {
                if (effect === 'porcelain') {
                    // Crack network laid over the intact tile just before it splits.
                    a.lineCap = 'round'; a.lineJoin = 'round';
                    const cracks = [[[21, 18], [27, 9], [31, 2]], [[21, 18], [33, 21], [39, 24]], [[21, 18], [16, 28], [18, 34], [13, 40]], [[21, 18], [9, 15], [1, 17]], [[27, 9], [22, 3]], [[16, 28], [7, 31]]];
                    for (const [width, color] of [[2.4, 'rgba(255,255,255,.85)'], [1.1, 'rgba(36,68,112,.85)']]) {
                        a.lineWidth = width; a.strokeStyle = color;
                        for (const line of cracks) { a.beginPath(); a.moveTo(...line[0]); line.slice(1).forEach(p => a.lineTo(...p)); a.stroke(); }
                    }
                } else if (effect === 'squish') {
                    // Glossy splash ring that spreads where a jelly cube bursts.
                    a.fillStyle = radial(a, 20, 20, 19, [[0, rgba(pal[1], 0)], [.72, rgba(pal[1], .2)], [1, rgba(pal[1], 0)]]); a.fillRect(0, 0, 40, 40);
                    a.lineWidth = 3.2; a.strokeStyle = rgba(pal[1], .8); a.beginPath(); a.arc(20, 20, 15, 0, Math.PI * 2); a.stroke();
                    a.lineWidth = 1.3; a.strokeStyle = 'rgba(255,255,255,.75)'; a.beginPath(); a.arc(20, 20, 15, Math.PI * 1.08, Math.PI * 1.62); a.stroke();
                } else star(a, 20, 20, 19, effect === 'ice' ? 'rgba(200,245,255,.8)' : rgba(pal[0], .8));
                return;
            }
            if (bank.mesh && slot < 12) { meshPiece(a, bank, tile, slot, effect); return; }
            if (effect === 'classic') {
                if (slot < 12) bevelCube(a, pal, 6, 6, 28, 5);
            } else if (effect === 'squish') {
                if (slot < 12) {
                    // Translucent, wobbly jelly chunk with a deep rim and a wet highlight.
                    const rx = 15 + (i % 3) - 1, ry = 13.5 - (i % 3) + 1, tilt = (i * .7) % 3;
                    a.fillStyle = radial(a, 15, 14, 21, [[0, rgba(pal[0], .95)], [.5, rgba(pal[1], .9)], [1, rgba(pal[2], .92)]]);
                    a.beginPath(); a.ellipse(20, 21, rx, ry, tilt, 0, Math.PI * 2); a.fill();
                    a.strokeStyle = rgba(pal[2], .55); a.lineWidth = 1.2; a.stroke();
                    a.fillStyle = 'rgba(255,255,255,.85)'; a.beginPath(); a.ellipse(14.5, 14.5, 5, 2.8, -.6, 0, Math.PI * 2); a.fill();
                    a.strokeStyle = 'rgba(255,255,255,.4)'; a.lineWidth = 1.6; a.beginPath(); a.ellipse(20, 21, rx - 3, ry - 3, tilt, Math.PI * .6, Math.PI * 1.05); a.stroke();
                } else {
                    const r = slot === 12 ? 12 : 8;
                    a.fillStyle = radial(a, 16, 16, r + 6, [[0, pal[0]], [.6, pal[1]], [1, pal[2]]]); a.beginPath(); a.arc(20, 20, r, 0, Math.PI * 2); a.fill();
                    a.fillStyle = 'rgba(255,255,255,.85)'; a.beginPath(); a.ellipse(20 - r * .4, 20 - r * .4, r * .32, r * .2, -.6, 0, Math.PI * 2); a.fill();
                }
            } else if (effect === 'soft') {
                a.lineCap = 'round';
                if (slot < 12 || slot === 13) {
                    // A light, fuzzy pom-pom: soft halo, short fibres in the two light tones, no dark spikes.
                    const r = slot < 12 ? 15 : 9, fibers = slot < 12 ? 64 : 32;
                    a.fillStyle = radial(a, 20, 20, r * 1.1, [[0, rgba(pal[0], .5)], [.7, rgba(pal[0], .22)], [1, rgba(pal[0], 0)]]); a.fillRect(0, 0, 40, 40);
                    for (let k = 0; k < fibers; k++) {
                        const ang = k / fibers * Math.PI * 2 + rnd() * .3, r0 = r * .55, r1 = r * (.84 + rnd() * .16);
                        a.strokeStyle = rgba(k % 2 ? pal[0] : pal[1], .75); a.lineWidth = 1 + rnd() * .8;
                        a.beginPath(); a.moveTo(20 + Math.cos(ang) * r0, 20 + Math.sin(ang) * r0); a.lineTo(20 + Math.cos(ang + .1) * r1, 20 + Math.sin(ang + .1) * r1); a.stroke();
                    }
                    a.fillStyle = radial(a, 16, 15, r * .9, [[0, '#ffffff'], [.25, pal[0]], [1, pal[1]]]); a.beginPath(); a.arc(20, 20, r * .68, 0, Math.PI * 2); a.fill();
                    a.strokeStyle = 'rgba(255,255,255,.35)'; a.lineWidth = 1.1;
                    if (slot < 12) for (let k = 0; k < 4; k++) { const cx = 16 + (k % 2) * 8, cy = 16 + Math.floor(k / 2) * 8; a.beginPath(); a.moveTo(cx - 2.4, cy - 1.8); a.lineTo(cx, cy + 1.8); a.lineTo(cx + 2.4, cy - 1.8); a.stroke(); }
                } else if (slot === 12) {
                    a.strokeStyle = pal[0]; a.lineWidth = 3.2; a.beginPath(); a.moveTo(6, 27); a.bezierCurveTo(4, 8, 22, 6, 24, 16); a.bezierCurveTo(26, 27, 13, 28, 15, 19); a.bezierCurveTo(17, 11, 33, 12, 34, 31); a.stroke();
                    a.strokeStyle = 'rgba(255,255,255,.5)'; a.lineWidth = 1; a.stroke();
                }
            } else if (effect === 'crumb') {
                if (slot < 12) {
                    // A Swiss-cheese wedge: pale top, front face with clearly visible holes.
                    const top = [[4, 15], [30, 8], [36, 12], [11, 20]], front = [[4, 15], [11, 20], [11, 34], [4, 30]], face = [[11, 20], [36, 12], [36, 27], [11, 34]];
                    poly(a, front, pal[2]); poly(a, face, pal[1]); poly(a, top, pal[0]);
                    for (const [x, y, r] of [[19 + i % 3, 25, 3.6], [29, 19 + i % 2 * 2, 2.6], [27 - i % 2 * 3, 28, 2], [7.5, 24, 1.8]]) {
                        a.fillStyle = 'rgba(150,84,0,.75)'; a.beginPath(); a.arc(x, y, r, 0, Math.PI * 2); a.fill();
                        a.fillStyle = rgba(pal[0], .9); a.beginPath(); a.arc(x + r * .25, y + r * .3, r * .55, 0, Math.PI * 2); a.fill();
                    }
                    a.strokeStyle = 'rgba(255,255,255,.65)'; a.lineWidth = 1.2; a.beginPath(); a.moveTo(4, 15); a.lineTo(30, 8); a.lineTo(36, 12); a.stroke();
                } else {
                    const r = slot === 12 ? 11 : 7, pts = Array.from({ length: 6 }, (_, k) => { const ang = k / 6 * Math.PI * 2, d = r * (.7 + rnd() * .4); return [20 + Math.cos(ang) * d, 20 + Math.sin(ang) * d]; });
                    poly(a, pts, slot === 12 ? pal[1] : pal[0]);
                    a.fillStyle = 'rgba(255,255,255,.35)'; a.beginPath(); a.arc(17, 17, r * .3, 0, Math.PI * 2); a.fill();
                }
            } else if (effect === 'honey') {
                if (slot < 12) {
                    // A heavy, round drop with only a short neck: it reads as honey, never as a flame.
                    const w = 11 + i % 3 * .8;
                    a.beginPath(); a.moveTo(20, 9); a.bezierCurveTo(22, 14, 20 + w, 17, 20 + w, 25); a.arc(20, 25, w, 0, Math.PI); a.bezierCurveTo(20 - w, 17, 18, 14, 20, 9); a.closePath();
                    a.fillStyle = radial(a, 16, 23, w + 7, [[0, pal[0]], [.5, pal[1]], [1, pal[2]]]); a.fill();
                    a.strokeStyle = 'rgba(122,58,0,.4)'; a.lineWidth = 1; a.stroke();
                    a.fillStyle = 'rgba(255,250,214,.9)'; a.beginPath(); a.ellipse(15.5, 22, 2.6, 4, .45, 0, Math.PI * 2); a.fill();
                    a.fillStyle = 'rgba(255,250,214,.5)'; a.beginPath(); a.arc(25, 30, 1.6, 0, Math.PI * 2); a.fill();
                } else if (slot === 12) {
                    a.fillStyle = radial(a, 16, 16, 18, [[0, pal[0]], [.55, pal[1]], [1, pal[2]]]); a.beginPath(); a.ellipse(20, 21, 16, 14, 0, 0, Math.PI * 2); a.fill();
                    a.fillStyle = 'rgba(255,250,214,.85)'; a.beginPath(); a.ellipse(14, 15, 4, 2.4, -.6, 0, Math.PI * 2); a.fill();
                } else {
                    a.fillStyle = 'rgba(255,240,170,.25)'; a.beginPath(); a.arc(20, 20, 12, 0, Math.PI * 2); a.fill();
                    a.strokeStyle = 'rgba(255,248,205,.85)'; a.lineWidth = 1.6; a.stroke();
                    a.fillStyle = 'rgba(255,255,255,.9)'; a.beginPath(); a.arc(15.5, 15.5, 2.4, 0, Math.PI * 2); a.fill();
                }
            } else if (effect === 'porcelain') {
                if (slot === 12) {
                    const dust = bank.light ? [190, 205, 225] : [255, 255, 255];
                    a.fillStyle = radial(a, 20, 20, 20, [[0, `rgba(${dust},.9)`], [.55, `rgba(${dust},.35)`], [1, `rgba(${dust},0)`]]); a.fillRect(0, 0, 40, 40);
                } else { poly(a, [[9, 30], [21, 8], [32, 27]], '#f4f7fb'); a.strokeStyle = bank.light ? 'rgba(70,98,138,.8)' : 'rgba(120,145,175,.8)'; a.lineWidth = 1.4; a.stroke(); }
            } else if (effect === 'wood') {
                if (slot < 8) {
                    // A short, thick broken plank: sawn end, splintered end, grain along its length.
                    const h = 15 + i % 3 * 1.6, y = 20 - h / 2, l = 7, r = 33;
                    poly(a, [[l, y], [r - 4, y], [r, y + h * .28], [r - 3, y + h * .5], [r - .5, y + h * .78], [r - 2.5, y + h], [l, y + h]], linear(a, 0, y, 0, y + h, [[0, pal[0]], [.45, pal[1]], [1, pal[2]]]));
                    a.strokeStyle = 'rgba(70,34,10,.45)'; a.lineWidth = 1;
                    for (let k = 1; k < 4; k++) { const gy = y + h * k / 4; a.beginPath(); a.moveTo(l + 1, gy); a.bezierCurveTo(15, gy + (k % 2 ? 1.4 : -1.2), 24, gy - (k % 2 ? 1 : -1.4), r - 5, gy); a.stroke(); }
                    a.fillStyle = rgba(pal[2], .9); a.fillRect(l, y, 2.6, h);
                    a.strokeStyle = 'rgba(255,236,204,.55)'; a.lineWidth = 1.2; a.beginPath(); a.moveTo(l + 3, y + 1); a.lineTo(r - 5, y + 1); a.stroke();
                } else if (slot < 12) {
                    const h = 7 + i % 4, y = 20 - h / 2, l = 3 + i % 3, r = 37 - (i % 2) * 3;
                    poly(a, [[l, y + h * .4], [l + 4, y], [r - 5, y + (i % 2)], [r, y + h * .55], [r - 3, y + h], [l + 6, y + h], [l + 2, y + h * .75]], linear(a, 0, y, 0, y + h, [[0, pal[0]], [.5, pal[1]], [1, pal[2]]]));
                    a.strokeStyle = 'rgba(70,34,10,.5)'; a.lineWidth = .9;
                    for (let k = 1; k < 3; k++) { a.beginPath(); a.moveTo(l + 5, y + h * k / 3); a.quadraticCurveTo(20, y + h * k / 3 + (k % 2 ? 1 : -1), r - 5, y + h * k / 3); a.stroke(); }
                    a.strokeStyle = 'rgba(255,236,204,.5)'; a.beginPath(); a.moveTo(l + 4, y + .9); a.lineTo(r - 5, y + .9 + (i % 2)); a.stroke();
                } else {
                    const r = slot === 12 ? 9 : 7, pts = Array.from({ length: 5 }, (_, k) => { const ang = k / 5 * Math.PI * 2 + rnd(), d = r * (.5 + rnd() * .5); return [20 + Math.cos(ang) * d, 20 + Math.sin(ang) * d * .6]; });
                    poly(a, pts, slot === 12 ? pal[0] : pal[1]);
                }
            } else if (effect === 'candy') {
                if (slot < 12) {
                    // A rounded hard-candy chunk with milky stripes and a glassy highlight.
                    const pts = Array.from({ length: 6 }, (_, k) => { const ang = k / 6 * Math.PI * 2 + i * .4, d = 13 * (.78 + rnd() * .28); return [20 + Math.cos(ang) * d, 20 + Math.sin(ang) * d]; });
                    a.save(); a.beginPath(); a.moveTo((pts[5][0] + pts[0][0]) / 2, (pts[5][1] + pts[0][1]) / 2);
                    pts.forEach((p, k) => { const q = pts[(k + 1) % 6]; a.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); });
                    a.closePath(); a.fillStyle = radial(a, 15, 14, 20, [[0, pal[0]], [.55, pal[1]], [1, pal[2]]]); a.fill(); a.clip();
                    a.strokeStyle = 'rgba(255,248,237,.72)'; a.lineWidth = 3.4;
                    for (let k = -2; k <= 3; k++) { a.beginPath(); a.moveTo(k * 9 - 4, 40); a.lineTo(k * 9 + 16, 0); a.stroke(); }
                    a.restore();
                    a.fillStyle = 'rgba(255,255,255,.9)'; a.beginPath(); a.ellipse(14, 13, 4, 2.2, -.6, 0, Math.PI * 2); a.fill();
                } else if (slot === 12) {
                    a.save(); a.beginPath(); a.arc(20, 20, 12, 0, Math.PI * 2); a.fillStyle = radial(a, 16, 16, 16, [[0, pal[0]], [.6, pal[1]], [1, pal[2]]]); a.fill(); a.clip();
                    a.strokeStyle = 'rgba(255,248,237,.75)'; a.lineWidth = 3;
                    for (let k = -2; k <= 2; k++) { a.beginPath(); a.arc(20 + k * 9, 20 - 18, 22, Math.PI * .35, Math.PI * .65); a.stroke(); }
                    a.restore();
                    a.fillStyle = 'rgba(255,255,255,.9)'; a.beginPath(); a.ellipse(15, 14, 3.4, 2, -.6, 0, Math.PI * 2); a.fill();
                } else { roundRect(a, 15, 15, 10, 10, 2.5); a.fillStyle = '#ffffff'; a.fill(); a.strokeStyle = rgba(pal[1], .45); a.lineWidth = 1; a.stroke(); }
            } else if (effect === 'ice') {
                if (slot === 13) {
                    const s = 16, x = 12, y = 12, b = s * .22;
                    roundRect(a, x, y, s, s, 3);
                    a.fillStyle = linear(a, x, y, x + s, y + s, [[0, 'rgba(242,253,255,.96)'], [.5, rgba(pal[1], .84)], [1, rgba(pal[2], .92)]]); a.fill();
                    a.save(); a.clip(); poly(a, [[x, y], [x + s, y], [x + s - b, y + b], [x + b, y + b]], 'rgba(255,255,255,.6)'); a.restore();
                    a.strokeStyle = bank.light ? 'rgba(36,118,170,.75)' : 'rgba(255,255,255,.85)'; a.lineWidth = 1.2; roundRect(a, x, y, s, s, 3); a.stroke();
                } else {
                    const mist = bank.light ? [150, 205, 235] : [240, 252, 255];
                    a.fillStyle = radial(a, 20, 20, 20, [[0, `rgba(${mist},.8)`], [.5, `rgba(${mist},.36)`], [1, `rgba(${mist},0)`]]); a.fillRect(0, 0, 40, 40);
                }
            } else if (effect === 'paint') {
                if (slot === 12) {
                    a.fillStyle = radial(a, 17, 17, 14, [[0, pal[0]], [.6, pal[1]], [1, pal[2]]]); a.beginPath(); a.arc(20, 20, 11, 0, Math.PI * 2); a.fill();
                    a.fillStyle = 'rgba(255,255,255,.75)'; a.beginPath(); a.ellipse(16, 15.5, 3, 1.8, -.6, 0, Math.PI * 2); a.fill();
                } else {
                    a.beginPath(); a.moveTo(20, 6); a.bezierCurveTo(23, 14, 29, 20, 29, 26); a.arc(20, 26, 9, 0, Math.PI); a.bezierCurveTo(11, 20, 17, 14, 20, 6); a.closePath();
                    a.fillStyle = radial(a, 17, 25, 14, [[0, pal[0]], [.6, pal[1]], [1, pal[2]]]); a.fill();
                    a.fillStyle = 'rgba(255,255,255,.7)'; a.beginPath(); a.ellipse(17, 24, 1.8, 3.2, .3, 0, Math.PI * 2); a.fill();
                }
            } else if (effect === 'shatter' && slot >= 12) {
                poly(a, [[20, 8], [28, 20], [20, 32], [12, 20]], slot === 12 ? 'rgba(255,255,255,.95)' : pal[0]);
            }
        }
        function bake(bank, overlay) {
            const a = bank.atlas.getContext('2d');
            a.clearRect(0, 0, bank.atlas.width, bank.atlas.height);
            const radius = bank.theme.id === 'jelly' ? 26 : 14;
            for (let color = 0; color < 7; color++) {
                const pal = palette(bank.theme.id, color);
                const tile = makeCanvas(SIZE, SIZE), t = tile.getContext('2d');
                roundRect(t, 0, 0, SIZE, SIZE, radius);
                t.fillStyle = linear(t, 0, 0, SIZE, SIZE, [[0, pal[0]], [.5, pal[1]], [1, pal[2]]]); t.fill(); t.save(); t.clip();
                t.strokeStyle = '#ffffff40'; t.lineWidth = 5; t.stroke();
                if (overlay) t.drawImage(overlay, 0, 0, SIZE, SIZE);
                t.restore(); a.drawImage(tile, 0, color * SIZE);
                for (let slot = 0; slot < TYPES; slot++) {
                    a.save(); a.translate(slotX(slot), color * SIZE);
                    a.beginPath(); a.rect(0, 0, FRAG, FRAG); a.clip();
                    sprite(a, bank, pal, tile, slot);
                    a.restore();
                }
            }
            const w = bank.white.getContext('2d');
            w.clearRect(0, 0, SIZE, SIZE); roundRect(w, 0, 0, SIZE, SIZE, radius); w.fillStyle = '#ffffff'; w.fill();
        }
        function prepare(theme) {
            // Light boards get darker sprite outlines, so white porcelain and pale ice stay readable.
            const key = theme.id + (light() ? ':light' : '');
            if (banks.has(key)) return banks.get(key);
            const bank = { theme, light: light(), mesh: fractureMesh(theme.effect), atlas: makeCanvas(slotX(TYPES), SIZE * 7), white: makeCanvas(SIZE, SIZE) };
            banks.set(key, bank); bake(bank);
            // Two small atlases bound memory even after visiting every material.
            while (banks.size > 2) banks.delete(banks.keys().next().value);
            const img = new root.Image();
            img.onload = () => { if (banks.get(key) === bank) { bank.brushes = null; bake(bank, img); } };
            img.src = textureBase + theme.id + '.svg' + textureQuery;
            return bank;
        }
        function ensure(grid, size) {
            if (!canvas || !canvas.isConnected) {
                if (canvas) canvas.remove();
                canvas = doc.createElement('canvas'); canvas.id = 'bbMaterialCanvas'; canvas.setAttribute('aria-hidden', 'true');
                grid.appendChild(canvas); ctx = canvas.getContext('2d', { alpha: true });
            }
            const side = size + PAD * 2, dpr = Math.min(root.devicePixelRatio || 1, constrained ? 1.25 : 1.75);
            if (canvas.width !== Math.round(side * dpr)) {
                canvas.width = canvas.height = Math.round(side * dpr);
                canvas.style.width = canvas.style.height = side + 'px';
            }
            scale = canvas.width / side;
            ctx.setTransform(scale, 0, 0, scale, 0, 0);
            canvas.style.left = canvas.style.top = -PAD + 'px';
            canvas.dataset.particles = '0';
        }
        function makeBand(bank, color) {
            if (!bank.brushes) bank.brushes = new Map();
            if (bank.brushes.has(color)) return bank.brushes.get(color);
            const pal = palette(bank.theme.id, color), band = makeCanvas(640, 84), b = band.getContext('2d'), rnd = seeded(color * 31 + 5);
            // Wet, saturated paint: light top, deep bottom, bristle streaks and a glossy sheen.
            b.fillStyle = linear(b, 0, 0, 0, 84, [[0, pal[0]], [.35, pal[1]], [.8, pal[1]], [1, pal[2]]]); b.fillRect(0, 0, 640, 84);
            for (let i = 0; i < 30; i++) {
                const y = 2 + i * 2.75 + rnd() * 1.5;
                b.strokeStyle = i % 3 ? rgba(pal[0], .22 + rnd() * .15) : rgba(pal[2], .3 + rnd() * .2); b.lineWidth = .8 + rnd() * 1.6;
                b.beginPath(); b.moveTo(0, y); b.bezierCurveTo(200, y + rnd() * 2 - 1, 420, y + rnd() * 2 - 1, 640, y); b.stroke();
            }
            b.fillStyle = linear(b, 0, 9, 0, 22, [[0, 'rgba(255,255,255,0)'], [.5, 'rgba(255,255,255,.34)'], [1, 'rgba(255,255,255,0)']]); b.fillRect(0, 9, 640, 13);
            b.fillStyle = linear(b, 0, 46, 0, 54, [[0, 'rgba(255,255,255,0)'], [.5, 'rgba(255,255,255,.14)'], [1, 'rgba(255,255,255,0)']]); b.fillRect(0, 46, 640, 8);
            bank.brushes.set(color, band);
            return band;
        }
        function spawn(bank, cell, delay, pop, groups, rnd, ratio, carry, sparse = false) {
            const effect = bank.theme.effect, out = [];
            const cx = cell.x + cell.w / 2, cy = cell.y + cell.w / 2;
            groups.forEach((group, gi) => {
                carry[gi] = (carry[gi] || 0) + group.n * ratio;
                let n = Math.floor(carry[gi]); carry[gi] -= n;
                if (gi === 0 && !n && ratio > 0 && !sparse) { n = 1; carry[gi] -= 1; }
                for (let k = 0; k < n; k++) {
                    // The main body replaces the tile in the same frame; secondary bits follow a moment later.
                    const lag = group.kind === 'spark' ? rnd() * 140 : gi === 0 ? 0 : rnd() * 24;
                    const p = { cell, kind: group.kind, add: !!group.add, start: delay + pop + lag, life: group.life * (.85 + rnd() * .3), amp: group.alpha || 1,
                        g: group.g || 0, drag: group.drag || 0, sway: group.sway || 0, phase: rnd() * 6.28, shrink: group.shrink || 0, grow: group.grow || 1, spin: (rnd() - .5) * 2 * (group.spin || 0), rot: (rnd() - .5) * 1.2 };
                    if (group.mesh && bank.mesh) {
                        const index = Math.floor((k + rnd() * .99) * 12 / n) % 12, piece = bank.mesh[index];
                        p.slot = index;
                        p.x = cell.x + cell.w * (piece.left + piece.w / 2) / SIZE; p.y = cell.y + cell.w * (piece.top + piece.h / 2) / SIZE;
                        p.w = cell.w * piece.w / SIZE * FRAG / MESH; p.h = cell.w * piece.h / SIZE * FRAG / MESH;
                        p.rot = 0;
                        const dx = p.x - cx, dy = p.y - cy, len = Math.hypot(dx, dy) || 1, v = lerp(group.speed, rnd());
                        p.vx = dx / len * v + (rnd() - .5) * 60; p.vy = dy / len * v * .6 - lerp(group.up, rnd());
                    } else {
                        p.slot = group.slots[0] + Math.floor(rnd() * (group.slots[1] - group.slots[0]));
                        p.w = p.h = lerp(group.size, rnd()) * (group.kind === 'melt' ? cell.w / 39 : 1);
                        if (group.kind === 'drip') { p.x = cell.x + cell.w * (.2 + .6 * rnd()); p.y = cell.y + cell.w * (.78 + .2 * rnd()); p.rot = 0; p.spin = 0; p.ax = cx + (p.x - cx) * .4; p.ay = cell.y + cell.w * .58; }
                        else if (group.kind === 'melt') { p.x = cx; p.y = cy + cell.w * .06; p.rot = 0; p.spin = 0; p.vx = p.vy = 0; }
                        else if (group.kind === 'mist') { p.x = cx + (rnd() - .5) * cell.w * .6; p.y = cy + (rnd() - .5) * cell.w * .5; }
                        else { p.x = cell.x + cell.w * (.18 + .64 * rnd()); p.y = cell.y + cell.w * (.18 + .64 * rnd()); }
                        if (group.kind === 'spark' || group.kind === 'mist') { const ang = rnd() * 6.28, v = group.speed ? lerp(group.speed, rnd()) : 12; p.vx = Math.cos(ang) * v; p.vy = Math.sin(ang) * v - (group.kind === 'mist' ? 16 : 0); }
                        else if (group.kind !== 'melt') {
                            const v = lerp(group.speed, rnd()), dir = (p.x - cx) / (cell.w / 2);
                            p.vx = (rnd() - .5) * 2 * v * .8 + dir * v * .4; p.vy = -lerp(group.up, rnd()) + (rnd() - .5) * v * .3;
                        }
                    }
                    if (effect === 'wood' && group.kind === 'chunk') p.rot = rnd() * 3.14;
                    out.push(p);
                }
            });
            return out;
        }
        // options.sweep: the all-clear celebration — every board cell appears in turn, then breaks lightly.
        function clear(theme, snapshots, rows, cols, grid, size, origin, options = {}) {
            if (!snapshots.length) return;
            const sweep = !!options.sweep, bank = prepare(theme), start = now(), effect = theme.effect;
            const base = SPEC[effect] || SPEC.classic, spec = sweep ? { ...base, pop: base.pop || 70, flash: 0, glow: base.glow * .5 || .3 } : base;
            snapshots.forEach(s => occupied.delete(s.r * 8 + s.c));
            if (geometry !== size || !canvas?.isConnected) { bursts = []; geometry = size; }
            // A slow moment earlier (a hidden tab, a GC pause) must not keep later clears in reduced quality.
            if (!bursts.length && constrained !== lowPower) { constrained = lowPower; slowFrames = 0; }
            ensure(grid, size);
            // Natural fast moves may overlap. Only extreme synthetic bursts replace the oldest.
            bursts = bursts.filter(b => start - b.start < b.duration).slice(-2);
            // The sweep keeps only flying pieces, thinly spread; residue like melting honey stays a line-clear detail.
            const groups = (GROUPS[effect] || GROUPS.classic).filter(g => !sweep || g.kind !== 'melt');
            const limit = budget(64, false, constrained);
            const want = snapshots.length * perCell(effect) * (sweep ? .22 : 1);
            let remaining = Math.max(0, limit - bursts.reduce((n, b) => n + b.particles.length, 0));
            // An overlapping clear still needs an immediate burst, even if older ones used the budget.
            let needed = sweep ? 0 : Math.max(0, Math.min(want, Math.floor(limit / 2)) - remaining);
            for (const old of bursts) {
                if (!needed) break;
                const length = old.particles.length, release = Math.min(needed, length), keep = length - release;
                old.particles = old.particles.filter((_, i) => Math.floor((i + 1) * keep / length) > Math.floor(i * keep / length));
                remaining += release; needed -= release;
            }
            const ratio = Math.min(sweep ? .22 : 1, remaining / (snapshots.length * perCell(effect)));
            const rnd = seeded(++serial * 7919 + snapshots.length * 31 + (snapshots[0].r * 8 + snapshots[0].c));
            const bands = effect === 'paint' && !sweep ? [
                ...rows.map(r => ({ cells: snapshots.filter(s => s.r === r), vertical: false })),
                ...cols.map(c => ({ cells: snapshots.filter(s => s.c === c), vertical: true })),
            ].filter(b => b.cells.length).map(b => ({ ...b, image: makeBand(bank, b.cells[0].color), jag: Array.from({ length: 10 }, () => rnd() * 2 - 1) })) : [];
            const delays = sweep ? sweepDelays(snapshots, rows, cols) : bands.length ? snapshots.map(() => 0) : waveDelays(snapshots, rows, cols, origin);
            const carry = [];
            let particles = [];
            const cells = snapshots.map((s, i) => ({ ...s, delay: delays[i] }));
            if (bands.length) {
                // Droplets leave the brush head as it passes a cell; one drip falls when the tail lifts.
                for (const band of bands) for (const cell of band.cells) {
                    const index = band.vertical ? cell.r : cell.c, own = cells.find(c => c.r === cell.r && c.c === cell.c);
                    const [splash, drip] = spawn(bank, own, 0, 0, groups, rnd, ratio, carry).reduce((acc, p) => { acc[p.kind === 'drip' ? 1 : 0].push(p); return acc; }, [[], []]);
                    splash.forEach(p => {
                        p.start = paintReach(index, 'head') * spec.life + rnd() * 30;
                        if (band.vertical) { const vx = p.vx; p.vx = (rnd() < .5 ? -1 : 1) * Math.abs(p.vy) * .7; p.vy = vx * .5 - 60; }
                    });
                    drip.forEach(p => { p.start = paintReach(index, 'tail') * spec.life; });
                    particles.push(...splash, ...drip);
                }
            } else {
                for (const cell of cells) particles.push(...spawn(bank, cell, cell.delay, spec.pop, groups, rnd, ratio, carry, sweep));
            }
            particles = particles.slice(0, remaining);
            // The impact streak of each line peaks where the piece landed in that line.
            const placed = (origin || []).filter(p => Number.isInteger(p?.r));
            const centre = (list, fallback) => list.length ? list.reduce((n, v) => n + v, 0) / list.length : fallback;
            const lines = sweep ? [] : [
                ...rows.map(r => ({ vertical: false, index: r, at: centre(placed.filter(p => p.r === r).map(p => p.c), 3.5) })),
                ...cols.map(c => ({ vertical: true, index: c, at: centre(placed.filter(p => p.c === c).map(p => p.r), 3.5) })),
            ];
            const end = Math.max(bands.length ? spec.life : 0, ...cells.map(c => c.delay + spec.pop + GLOW), ...particles.map(p => p.start + p.life));
            bursts.push({ start, duration: end + 16, bank, spec, sweep, cells, particles, bands, lines, color: snapshots[0].color, excluded: new Set() });
            // The release frame already shows the lit line, so there is never an empty board frame.
            render(start);
            if (!frame) { previous = start; frame = schedule(tick); }
        }
        function tile(b, cell, x, y, w, h, alpha) {
            ctx.globalAlpha = alpha;
            ctx.drawImage(b.bank.atlas, 0, cell.color * SIZE, SIZE, SIZE, PAD + x, PAD + y, w, h);
        }
        function whiten(b, x, y, w, h, alpha) {
            if (alpha <= .01) return;
            ctx.globalAlpha = alpha;
            ctx.drawImage(b.bank.white, 0, 0, SIZE, SIZE, PAD + x, PAD + y, w, h);
        }
        // Intact copy before the wave arrives, then the material's own pop.
        function cellFrame(b, cell, t) {
            const effect = b.bank.theme.effect, tau = t - cell.delay, spec = b.spec;
            if (b.sweep && tau < 0) {
                if (tau < -APPEAR) return;
                // A light, ghostly wave rather than a board that seems to fill up again.
                const k = ease((tau + APPEAR) / APPEAR), s = .5 + .36 * k, w = cell.w * s, o = (cell.w - w) / 2;
                tile(b, cell, cell.x + o, cell.y + o, w, w, .62 * k);
                whiten(b, cell.x + o, cell.y + o, w, w, .3 * k);
                return;
            }
            const flash = t < FLASH ? spec.flash * Math.pow(1 - t / FLASH, 2) : 0;
            if (tau < 0) { tile(b, cell, cell.x, cell.y, cell.w, cell.w, 1); whiten(b, cell.x, cell.y, cell.w, cell.w, flash * .8); return; }
            if (tau >= spec.pop) return;
            const u = tau / spec.pop, w = cell.w;
            if (b.sweep) { const g = cell.w * (.86 + .1 * Math.sin(u * Math.PI)), o = (cell.w - g) / 2; tile(b, cell, cell.x + o, cell.y + o, g, g, .62 * (1 - u)); whiten(b, cell.x + o, cell.y + o, g, g, .4 * (1 - u)); return; }
            let sx = 1 + .14 * Math.sin(u * Math.PI / 2), sy = sx, ox = 0, oy = 0, glow = Math.max(spec.flash, .35) * .75 * u;
            if (effect === 'squish') { sx = 1 + .3 * Math.sin(u * Math.PI); sy = 1 - .26 * Math.sin(u * Math.PI); oy = w * (1 - sy) / 2; glow = .2 * u; }
            else if (effect === 'honey') { sx = 1 - .1 * u; sy = 1 + .32 * u; oy = w * (sy - 1) / 2; glow = .12 * u; }
            else if (effect === 'wood') { sx = 1 + .06 * u; sy = 1 - .1 * u; glow = .2 * u; }
            else if (effect === 'soft') { sx = sy = 1 + .1 * u; glow = .12 * u; }
            else if (effect === 'porcelain') { sx = sy = 1; ox = Math.sin(tau * .9) * .9; glow = .1 * u; }
            else if (effect === 'ice') { sx = sy = 1 + .05 * u; ox = Math.sin(tau * 1.1) * 1.1; glow = .55 * u; }
            const dw = w * sx, dh = w * sy, x = cell.x + (w - dw) / 2 + ox, y = cell.y + (w - dh) / 2 + oy;
            tile(b, cell, x, y, dw, dh, effect === 'soft' ? 1 - .25 * u : 1);
            whiten(b, x, y, dw, dh, Math.max(glow, flash * .8));
            if (effect === 'porcelain') { ctx.globalAlpha = Math.min(1, u * 1.6); ctx.drawImage(b.bank.atlas, slotX(15), cell.color * SIZE, FRAG, FRAG, PAD + x, PAD + y, dw, dh); }
        }
        function drawParticle(b, p, t) {
            const s = (t - p.start) / 1000, life = p.life / 1000;
            if (s < 0 || s > life) return;
            const u = s / life;
            let x, y, rot = p.rot + p.spin * s, w = p.w, h = p.h, alpha = 1 - Math.pow(clamp((u - .62) / .38), 1.6);
            if (p.kind === 'float') {
                const k = p.drag, travel = (1 - Math.exp(-k * s)) / k;
                x = p.x + p.vx * travel + Math.sin(s * 5 + p.phase) * p.sway * Math.min(1, s * 3); y = p.y + p.vy * travel + .5 * p.g * s * s;
            } else if (p.kind === 'mist') {
                x = p.x + p.vx * s; y = p.y + p.vy * s; const grow = 1 + (p.grow - 1) * ease(u); w *= grow; h *= grow; alpha = .7 * Math.pow(1 - u, 1.5) * Math.min(1, u * 6);
            } else if (p.kind === 'spark') {
                x = p.x + p.vx * s; y = p.y + p.vy * s; const twinkle = Math.sin(Math.PI * u); w *= .4 + twinkle * .8; h = w; alpha = twinkle;
            } else if (p.kind === 'melt') {
                // The honey left behind sags and shrinks while the drops pull away from it.
                x = p.x; y = p.y + p.w * .25 * ease(u); w *= 1 - .45 * ease(u); h *= 1 - .25 * ease(u); alpha = 1 - u * u;
            } else {
                x = p.x + p.vx * s; y = p.y + p.vy * s + .5 * p.g * s * s;
                if (p.kind === 'drip') {
                    const v = p.vy + p.g * s, stretch = 1 + Math.min(.45, Math.max(0, v) / 1000);
                    h *= stretch; w /= Math.sqrt(stretch); rot = Math.atan2(-p.vx, v) * .4;
                    // A thick sticky thread ties the drop to the melting honey, then snaps.
                    if (u < .3) {
                        const k = 1 - u / .3;
                        ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.globalAlpha = .95 * Math.sqrt(k);
                        ctx.strokeStyle = palette(b.bank.theme.id, p.cell.color)[1]; ctx.lineWidth = Math.max(.6, p.w * .2 * k); ctx.lineCap = 'round';
                        ctx.beginPath(); ctx.moveTo(PAD + p.ax, PAD + p.ay); ctx.quadraticCurveTo(PAD + (p.ax + x) / 2, PAD + p.ay + (y - p.ay) * .7, PAD + x, PAD + y - h * .3); ctx.stroke();
                    }
                } else if (p.kind === 'blob') {
                    const wobble = Math.sin(s * 26 + p.phase) * .22 * Math.exp(-3 * s);
                    w *= 1 + wobble; h *= 1 - wobble;
                }
            }
            const shrink = 1 - p.shrink * u;
            w *= shrink; h *= shrink;
            // Fade near the canvas edge instead of being cut by it.
            const edge = Math.min(x + PAD, y + PAD, geometry + PAD - x, geometry + PAD - y);
            alpha *= p.amp * clamp(edge / 36);
            if (alpha <= .01) return;
            const c = Math.cos(rot) * scale, sn = Math.sin(rot) * scale;
            ctx.globalAlpha = alpha;
            ctx.setTransform(c, sn, -sn, c, scale * (PAD + x), scale * (PAD + y));
            ctx.drawImage(b.bank.atlas, slotX(p.slot), p.cell.color * SIZE, FRAG, FRAG, -w / 2, -h / 2, w, h);
        }
        function paint(b, t) {
            if (!b.bands.length) return;
            const { head, tail } = paintProgress(t / b.spec.life);
            // Canvas copies live above the board while the brush covers them; board state is already clear.
            for (const cell of b.cells) {
                if (b.excluded.has(cell.r * 8 + cell.c)) continue;
                const covered = b.bands.some(band => band.cells.some(c => c.r === cell.r && c.c === cell.c) && head <= (band.vertical ? cell.r : cell.c) / 8);
                if (!covered) tile(b, cell, cell.x, cell.y, cell.w, cell.w, 1);
            }
            for (const band of b.bands) {
                const first = band.cells[0], step = first.w + 4, length = 8 * step - 4;
                if (tail <= head) continue;
                ctx.save(); ctx.globalAlpha = 1;
                const origin = band.vertical ? { x: first.x + first.w, y: 4 } : { x: 4, y: first.y };
                ctx.translate(origin.x + PAD, origin.y + PAD);
                if (band.vertical) ctx.rotate(Math.PI / 2);
                if (b.excluded.size) {
                    ctx.beginPath();
                    for (const cell of band.cells) if (!b.excluded.has(cell.r * 8 + cell.c)) ctx.rect((band.vertical ? cell.r : cell.c) * step, 0, step, first.w);
                    ctx.clip();
                }
                // Ragged bristles: the outer lanes of the head lag behind and the tail tapers as it lifts.
                for (let lane = 0; lane < 10; lane++) {
                    const outer = Math.abs(lane - 4.5) / 4.5;
                    const lead = band.jag[lane] * .03 + outer * outer * .05, trail = band.jag[(lane + 3) % 10] * .03 - outer * outer * .07;
                    const left = clamp(head + lead * Math.sin(head * Math.PI)), right = clamp(tail + trail * Math.sin(tail * Math.PI));
                    if (right <= left) continue;
                    ctx.drawImage(band.image, 640 * left, lane * 8.4, 640 * (right - left), 8.4,
                        length * left, first.w * lane / 10, length * (right - left), first.w / 10 + .2);
                }
                ctx.restore();
            }
        }
        function render(time) {
            if (!ctx || !canvas?.isConnected) return;
            ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
            ctx.clearRect(0, 0, geometry + PAD * 2, geometry + PAD * 2);
            bursts = bursts.filter(b => time - b.start < b.duration);
            for (const b of bursts) {
                const t = time - b.start, glows = [];
                ctx.setTransform(scale, 0, 0, scale, 0, 0);
                if (b.bands.length) paint(b, t);
                else for (const cell of b.cells) {
                    if (b.excluded.has(cell.r * 8 + cell.c)) continue;
                    cellFrame(b, cell, t);
                    const since = t - cell.delay - b.spec.pop;
                    if (since >= 0 && since < GLOW) glows.push([cell, since / GLOW]);
                }
                for (const p of b.particles) if (!p.add && !(b.excluded.has(p.cell.r * 8 + p.cell.c) && t < p.start)) drawParticle(b, p, t);
                ctx.setTransform(scale, 0, 0, scale, 0, 0);
                ctx.globalCompositeOperation = 'lighter';
                // A soft light streak along each line at impact, then a glow where every cell burst.
                if (t < FLASH && b.spec.flash) {
                    const w = b.cells[0].w, step = w + 4;
                    ctx.globalAlpha = .55 * b.spec.flash * Math.pow(1 - t / FLASH, 2);
                    for (const l of b.lines) {
                        const half = (Math.max(l.at, 7 - l.at) + .9) * step, mid = 4 + l.at * step + w / 2;
                        const along = l.vertical ? { x: 4 + l.index * step - w * .4, y: mid - half, w: w * 1.8, h: half * 2 } : { x: mid - half, y: 4 + l.index * step - w * .4, w: half * 2, h: w * 1.8 };
                        ctx.drawImage(b.bank.atlas, slotX(14), b.color * SIZE, FRAG, FRAG, PAD + along.x, PAD + along.y, along.w, along.h);
                    }
                }
                for (const [cell, u] of glows) {
                    const size = cell.w * (1.25 + .7 * u);
                    ctx.globalAlpha = b.spec.glow * Math.pow(1 - u, 2);
                    ctx.drawImage(b.bank.atlas, slotX(14), cell.color * SIZE, FRAG, FRAG, PAD + cell.x + (cell.w - size) / 2, PAD + cell.y + (cell.w - size) / 2, size, size);
                }
                for (const p of b.particles) if (p.add && !(b.excluded.has(p.cell.r * 8 + p.cell.c) && t < p.start)) drawParticle(b, p, t);
                ctx.setTransform(scale, 0, 0, scale, 0, 0);
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.globalAlpha = 1;
            // New placements remain immediately visible even during a long, overlapping clear.
            if (bursts.length) {
                const w = bursts[0].cells[0].w;
                occupied.forEach(key => ctx.clearRect(PAD + 4 + key % 8 * (w + 4), PAD + 4 + Math.floor(key / 8) * (w + 4), w, w));
            }
            canvas.dataset.particles = String(bursts.reduce((n, b) => n + b.particles.length, 0));
            canvas.dataset.bursts = String(bursts.length);
        }
        function tick(time) {
            frame = 0;
            if (time - previous > 26) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
            if (slowFrames > 8 && !constrained) {
                constrained = true;
                let remaining = 192;
                for (const b of bursts) { b.particles = b.particles.slice(0, remaining); remaining -= b.particles.length; }
            }
            previous = time; render(time);
            if (bursts.length && canvas?.isConnected) frame = schedule(tick);
        }
        function cleanup() { cancel(frame); frame = 0; bursts = []; occupied.clear(); canvas?.remove(); canvas = ctx = null; }
        return { prepare, clear, cleanup,
            celebrate(theme, snapshots, rows, cols, grid, size) { clear(theme, snapshots, rows, cols, grid, size, [], { sweep: true }); },
            occlude(cells) { cells.forEach(({ r, c }) => occupied.add(r * 8 + c)); for (const b of bursts) cells.forEach(({ r, c }) => b.excluded.add(r * 8 + c)); },
            // Deterministic local visual QA; never used by the game loop.
            inspectFrame(elapsed) { cancel(frame); frame = 0; if (bursts.length) render(bursts[bursts.length - 1].start + elapsed); } };
    }
    const api = { create, duration, budget, fractureMesh, paintProgress, paintReach, waveDelays, sweepDelays, palette, gradient, monochrome, slotX, STEP };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BBMaterialMotion = api;
})(typeof window !== 'undefined' ? window : globalThis);
