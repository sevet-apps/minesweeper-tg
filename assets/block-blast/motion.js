/* One bounded canvas, pre-baked material sprites, no per-fragment DOM or live-board writes. */
(function (root) {
    'use strict';
    const clamp = n => Math.max(0, Math.min(1, n));
    const ease = n => 1 - Math.pow(1 - clamp(n), 3);
    const duration = effect => ({ paint: 720, honey: 820, soft: 1150, porcelain: 1050, squish: 1015, ice: 980 })[effect] || 930;
    const budget = (cells, reduced, lowPower) => reduced ? 0 : Math.min(lowPower ? 192 : 360, cells * 12);
    const colors = [
        ['#ff5c52','#ff3b30','#d62d24'], ['#ffab30','#ff9500','#d67e00'], ['#ffe033','#ffcc00','#d6ab00'],
        ['#4cd964','#34c759','#28a745'], ['#339aff','#007aff','#0062cc'], ['#7472e8','#5856d6','#4745ab'], ['#c76ef0','#af52de','#8c42b2'],
    ];
    const mono = { cheese: ['#ffe487','#f8bd44','#e8a630'], honey: ['#ffd473','#efaf45','#dc9226'], porcelain: ['#fffdf4','#eef4f7','#d4e3ef'], wood: ['#dfb184','#c28d61','#aa7149'], ice: ['#d2faff','#9cdef0','#66bedf'] };
    function create({ document: doc, textureBase, lowPower = false, now = () => performance.now(), schedule = requestAnimationFrame, cancel = cancelAnimationFrame }) {
        let canvas, ctx, frame = 0, bursts = [], geometry, slowFrames = 0, previous = 0, constrained = lowPower;
        const banks = new Map(), occupied = new Set();
        const PAD = 64, SIZE = 96, FRAG = 40, TYPES = 12;
        function makeCanvas(w, h) { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; }
        function roundRect(c, x, y, w, h, r) {
            c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
        }
        function bake(bank, overlay) {
            const a = bank.atlas.getContext('2d');
            a.clearRect(0, 0, bank.atlas.width, bank.atlas.height);
            for (let color = 0; color < 7; color++) {
                const palette = mono[bank.theme.id] || colors[color];
                const tile = makeCanvas(SIZE, SIZE), t = tile.getContext('2d');
                const gradient = t.createLinearGradient(0, 0, SIZE, SIZE);
                palette.forEach((v, i) => gradient.addColorStop(i / 2, v));
                roundRect(t, 0, 0, SIZE, SIZE, bank.theme.id === 'jelly' ? 25 : 14);
                t.fillStyle = gradient; t.fill(); t.save(); t.clip();
                t.strokeStyle = '#ffffff40'; t.lineWidth = 5; t.stroke();
                if (overlay) t.drawImage(overlay, 0, 0, SIZE, SIZE);
                t.restore(); a.drawImage(tile, 0, color * SIZE);
                for (let i = 0; i < TYPES; i++) {
                    const x = SIZE + i * FRAG, y = color * SIZE;
                    a.save(); a.translate(x, y);
                    if (bank.theme.effect === 'soft') {
                        a.lineWidth = 2.2 + i % 3 * .4; a.lineCap = 'round'; a.strokeStyle = palette[1];
                        a.beginPath(); a.moveTo(5, 20); a.bezierCurveTo(2, 2 + i, 26, 3, 29, 14); a.bezierCurveTo(38, 28, 12, 36, 9, 22); a.bezierCurveTo(6, 13, 27, 12, 35, 32); a.stroke();
                        a.strokeStyle = '#ffffff35'; a.lineWidth = .7; a.stroke();
                    } else if (['honey', 'squish'].includes(bank.theme.effect)) {
                        const g = a.createLinearGradient(8, 8, 32, 35); g.addColorStop(0, palette[0]); g.addColorStop(1, palette[2]);
                        a.fillStyle = g; a.beginPath();
                        if (bank.theme.effect === 'squish') { a.moveTo(10, 12); a.bezierCurveTo(17, 4, 33, 9, 33, 21); a.bezierCurveTo(35, 35, 10, 37, 8, 24); a.bezierCurveTo(7, 19, 6, 16, 10, 12); }
                        else { a.moveTo(20, 3); a.bezierCurveTo(19, 13, 8, 18, 9, 27); a.bezierCurveTo(10, 40, 33, 39, 32, 26); a.bezierCurveTo(31, 17, 21, 11, 20, 3); }
                        a.fill();
                        a.strokeStyle = '#fff6cf90'; a.lineWidth = 2; a.beginPath(); a.moveTo(15, 23); a.quadraticCurveTo(12, 30, 18, 32); a.stroke();
                    } else {
                        const effect = bank.theme.effect;
                        a.beginPath();
                        if (effect === 'wood') { a.moveTo(15, 2); a.lineTo(25, 5); a.lineTo(22, 38); a.lineTo(13, 34); }
                        else if (effect === 'shatter') { a.moveTo(20, 2); a.lineTo(37, 19); a.lineTo(18, 38); a.lineTo(3, 17); }
                        else if (effect === 'ice') { a.moveTo(7, 8); a.lineTo(25, 2); a.lineTo(36, 33); a.lineTo(18, 37); }
                        else if (effect === 'crumb') roundRect(a, 7, 8, 26, 25, 7);
                        else if (effect === 'candy') roundRect(a, 4, 4, 32, 32, 11);
                        else if (effect === 'classic') a.rect(6, 6, 28, 28);
                        else { a.moveTo(4 + i % 4, 3); a.lineTo(35, 5 + i % 5); a.lineTo(32 - i % 7, 21); a.lineTo(35, 31); a.lineTo(11, 37); a.lineTo(3, 19); }
                        a.closePath(); a.clip();
                        // Real fragments retain the original grain, facets and porcelain decoration.
                        a.drawImage(tile, (i % 3) * 28, Math.floor(i / 3) * 20, 40, 40, 0, 0, FRAG, FRAG);
                        a.strokeStyle = '#ffffff80'; a.lineWidth = 1.5; a.stroke();
                    }
                    a.restore();
                }
            }
        }
        function prepare(theme) {
            if (banks.has(theme.id)) return banks.get(theme.id);
            const bank = { theme, atlas: makeCanvas(SIZE + TYPES * FRAG, SIZE * 7) };
            banks.set(theme.id, bank); bake(bank);
            // Two small atlases bound memory even after visiting every material.
            while (banks.size > 2) banks.delete(banks.keys().next().value);
            if (theme.id !== 'classic') {
                const img = new root.Image();
                img.onload = () => { if (banks.get(theme.id) === bank) bake(bank, img); };
                img.src = textureBase + theme.id + '.svg';
            }
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
                ctx.setTransform(canvas.width / side, 0, 0, canvas.height / side, 0, 0);
            }
            canvas.style.left = canvas.style.top = -PAD + 'px';
            canvas.dataset.particles = '0';
        }
        function makeBand(bank, color) {
            if (!bank.brushes) bank.brushes = new Map();
            if (bank.brushes.has(color)) return bank.brushes.get(color);
            const band = makeCanvas(640, 84), b = band.getContext('2d');
            // Constant coverage and a single piece colour along the entire stroke.
            b.fillStyle = colors[color][1]; b.fillRect(0, 0, 640, 84);
            for (let i = 0; i < 24; i++) {
                b.strokeStyle = i % 3 ? '#ffffff16' : '#18263724'; b.lineWidth = 1 + i % 3;
                b.beginPath(); b.moveTo(0, 2 + i * 3.5); b.lineTo(640, 2 + i * 3.5); b.stroke();
            }
            bank.brushes.set(color, band);
            return band;
        }
        function clear(theme, snapshots, rows, cols, grid, size) {
            if (!snapshots.length) return;
            const bank = prepare(theme), start = now();
            snapshots.forEach(s => occupied.delete(s.r * 8 + s.c));
            if (geometry !== size || !canvas?.isConnected) { bursts = []; geometry = size; }
            ensure(grid, size);
            // Natural fast moves may overlap. Only extreme synthetic bursts replace the oldest.
            bursts = bursts.filter(b => start - b.start < b.duration).slice(-2);
            const density = ({ soft: 16, porcelain: 12, shatter: 10, ice: 9, honey: 5, squish: 7, paint: 0 })[theme.effect] ?? 8;
            const limit = budget(64, false, constrained);
            let remaining = Math.max(0, limit - bursts.reduce((n, b) => n + b.particles.length, 0));
            // An overlapping clear still needs an immediate burst, even with no intact-tile layer.
            let needed = Math.max(0, Math.min(snapshots.length * density, Math.floor(limit / 2)) - remaining);
            for (const old of bursts) {
                if (!needed) break;
                const length = old.particles.length, release = Math.min(needed, length), keep = length - release;
                old.particles = old.particles.filter((_, i) => Math.floor((i + 1) * keep / length) > Math.floor(i * keep / length));
                remaining += release; needed -= release;
            }
            const count = Math.min(remaining, snapshots.length * density);
            const particles = Array.from({ length: count }, (_, i) => {
                const cell = snapshots[Math.floor(i * snapshots.length / count)], angle = (i * 2.39996) % (Math.PI * 2), power = 14 + Math.random() * 40;
                const size = theme.effect === 'soft' ? 12 + Math.random() * 9 : theme.effect === 'crumb' ? 7 + Math.random() * 7 : theme.effect === 'wood' ? 17 + Math.random() * 13 : 8 + Math.random() * 12;
                return { cell, x: cell.x + cell.w * (.2 + Math.random() * .6), y: cell.y + cell.w * (.2 + Math.random() * .6), dx: Math.cos(angle) * power, dy: Math.sin(angle) * power - 14, spin: (Math.random() - .5) * 5, type: i % TYPES, size };
            });
            const bands = theme.effect === 'paint' ? [
                ...rows.map(r => ({ cells: snapshots.filter(s => s.r === r), vertical: false })),
                ...cols.map(c => ({ cells: snapshots.filter(s => s.c === c), vertical: true })),
            ].map(b => ({ ...b, image: makeBand(bank, b.cells[0].color) })) : [];
            bursts.push({ start, duration: duration(theme.effect), bank, cells: snapshots, particles, bands, excluded: new Set() });
            // Present fragments in the same frame as release, with no intact-tile hold.
            render(start);
            if (!frame) { previous = start; frame = schedule(tick); }
        }
        function particle(b, p, t) {
            const effect = b.bank.theme.effect, u = clamp(t);
            if (u >= 1 || b.excluded.has(p.cell.r * 8 + p.cell.c)) return;
            let x = p.x + p.dx * ease(u), y = p.y + p.dy * ease(u) + 50 * u * u, stretch = 1, spin = p.spin * ease(u);
            if (effect === 'soft') { y = p.y - 20 * u + Math.sin(u * 5 + p.type) * u * 12; x += Math.sin(u * 4 + p.type) * u * 9; }
            if (effect === 'honey') { x = p.x + p.dx * .2 * ease(u); y = p.y + (25 + p.type * 2) * (.55 * ease(u) + .45 * u * u); stretch = 1 + Math.sin(u * Math.PI) * .3; spin = 0; }
            if (effect === 'squish') { y = p.y + p.dy * ease(u) + 45 * u * u; stretch = 1 + Math.sin(u * 7) * .2; }
            if (effect === 'wood') { x = p.x + p.dx * .55 * ease(u); y = p.y - 12 * Math.sin(u * Math.PI) + 65 * u * u; spin *= .55; }
            if (effect === 'ice') { x = p.x + p.dx * .65 * ease(u); y = p.y - 26 * ease(u) + Math.sin(p.type + u * 3) * 7 * u; spin *= .4; }
            if (effect === 'crumb') { y = p.y + p.dy * .35 * u + 64 * u * u; x = p.x + p.dx * .65 * ease(u); }
            if (effect === 'candy') { y = p.y - (25 + p.type * 2) * Math.sin(u * Math.PI) + 28 * u * u; spin *= 1.8; }
            if (effect === 'shatter') { x = p.x + p.dx * 1.25 * ease(u); y = p.y + p.dy * ease(u) + 23 * u * u; }
            const alpha = 1 - Math.pow(u, 1.8), size = p.size * (1 - .25 * u);
            ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x + PAD, y + PAD); ctx.rotate(spin);
            if (effect === 'honey' && u < .3) {
                ctx.strokeStyle = '#e9a83ba0'; ctx.lineWidth = Math.max(.6, 2 * (1 - u)); ctx.beginPath(); ctx.moveTo(0, -(y - p.y)); ctx.quadraticCurveTo(3, -8, 0, 0); ctx.stroke();
            }
            ctx.drawImage(b.bank.atlas, SIZE + p.type * FRAG, p.cell.color * SIZE, FRAG, FRAG, -size / 2, -size * stretch / 2, size, size * stretch); ctx.restore();
        }
        function paint(b, t) {
            const wipe = ease(t / .92), alpha = 1 - clamp((t - .65) / .35);
            for (const band of b.bands) {
                const first = band.cells[0], step = first.w + 4, length = 8 * step - 4;
                ctx.save(); ctx.globalAlpha = alpha;
                const origin = band.vertical ? { x: first.x + first.w, y: 4 } : { x: 4, y: first.y };
                ctx.translate(origin.x + PAD, origin.y + PAD);
                if (band.vertical) ctx.rotate(Math.PI / 2);
                if (b.excluded.size) {
                    ctx.beginPath();
                    for (const cell of band.cells) if (!b.excluded.has(cell.r * 8 + cell.c)) {
                        ctx.rect((band.vertical ? cell.r : cell.c) * step, 0, step, first.w);
                    }
                    ctx.clip();
                }
                // Ten bristle lanes keep a crisp moving edge without a tapered/rainbow band.
                for (let lane = 0; lane < 10; lane++) {
                    const edge = clamp(wipe + Math.sin(lane * 2.4) * .018 * Math.sin(t * Math.PI));
                    if (edge >= 1) continue;
                    ctx.drawImage(band.image, 640 * edge, lane * 8.4, 640 * (1 - edge), 8.4,
                        length * edge, first.w * lane / 10, length * (1 - edge), first.w / 10 + .2);
                }
                ctx.restore();
            }
        }
        function render(time) {
            if (!ctx || !canvas?.isConnected) return;
            ctx.clearRect(0, 0, geometry + PAD * 2, geometry + PAD * 2);
            bursts = bursts.filter(b => time - b.start < b.duration);
            for (const b of bursts) {
                const t = clamp((time - b.start) / b.duration);
                b.particles.forEach(p => particle(b, p, t));
                paint(b, t);
            }
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
        return { prepare, clear, cleanup, occlude(cells) { cells.forEach(({ r, c }) => occupied.add(r * 8 + c)); for (const b of bursts) cells.forEach(({ r, c }) => b.excluded.add(r * 8 + c)); },
            // Deterministic local visual QA; never used by the game loop.
            inspectFrame(elapsed) { cancel(frame); frame = 0; if (bursts.length) render(bursts[bursts.length - 1].start + elapsed); } };
    }
    const api = { create, duration, budget };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BBMaterialMotion = api;
})(typeof window !== 'undefined' ? window : globalThis);
