/* One bounded canvas, pre-baked material sprites, no per-fragment DOM or live-board writes. */
(function (root) {
    'use strict';
    const clamp = n => Math.max(0, Math.min(1, n));
    const ease = n => 1 - Math.pow(1 - clamp(n), 3);
    const duration = effect => ({ classic: 650, paint: 760, honey: 760, soft: 1150, porcelain: 880, squish: 1015, ice: 800, candy: 720, shatter: 820, crumb: 820, wood: 840 })[effect] || 930;
    const budget = (cells, reduced, lowPower) => reduced ? 0 : Math.min(lowPower ? 192 : 360, cells * 12);
    const colors = [
        ['#ff5c52','#ff3b30','#d62d24'], ['#ffab30','#ff9500','#d67e00'], ['#ffe033','#ffcc00','#d6ab00'],
        ['#4cd964','#34c759','#28a745'], ['#339aff','#007aff','#0062cc'], ['#7472e8','#5856d6','#4745ab'], ['#c76ef0','#af52de','#8c42b2'],
    ];
    const mono = { cheese: ['#ffe487','#f8bd44','#e8a630'], honey: ['#ffcb38','#f5a409','#c97404'], porcelain: ['#fffdf4','#eef4f7','#d4e3ef'], wood: ['#dfb184','#c28d61','#aa7149'], ice: ['#d9f9ff','#8bd5ed','#479abd'] };
    // A small Voronoi fracture is baked once, never recomputed during animation.
    // Unequal cells preserve the material's texture, instead of sampling rectangular confetti.
    function fractureMesh(effect) {
        if (!['shatter', 'porcelain', 'ice', 'crumb', 'wood'].includes(effect)) return null;
        const sites = [[8,12],[34,8],[64,19],[86,7],[18,43],[43,31],[74,45],[91,65],[8,79],[37,68],[58,90],[83,87]];
        const weightY = effect === 'wood' ? .22 : 1;
        return sites.map(([x, y], index) => {
            let points = [[5,0],[91,0],[96,5],[96,91],[91,96],[5,96],[0,91],[0,5]];
            sites.forEach(([ox, oy], other) => {
                if (other === index) return;
                const nx = ox - x, ny = (oy - y) * weightY;
                const edge = (ox * ox - x * x + (oy * oy - y * y) * weightY) / 2;
                const next = [];
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
                    } else if (bank.theme.effect === 'squish') {
                        const g = a.createLinearGradient(8, 8, 32, 35); g.addColorStop(0, palette[0]); g.addColorStop(1, palette[2]);
                        a.fillStyle = g; a.beginPath();
                        a.moveTo(10, 12); a.bezierCurveTo(17, 4, 33, 9, 33, 21); a.bezierCurveTo(35, 35, 10, 37, 8, 24); a.bezierCurveTo(7, 19, 6, 16, 10, 12);
                        a.fill();
                        a.strokeStyle = '#fff6cf90'; a.lineWidth = 2; a.beginPath(); a.moveTo(15, 23); a.quadraticCurveTo(12, 30, 18, 32); a.stroke();
                    } else {
                        const effect = bank.theme.effect, fragment = bank.mesh?.[i];
                        if (fragment) {
                            const points = fragment.points.map(([px, py]) => [2 + (px - fragment.left) / fragment.w * 36, 2 + (py - fragment.top) / fragment.h * 36]);
                            a.beginPath(); a.moveTo(...points[0]);
                            points.forEach((point, j) => {
                                const next = points[(j + 1) % points.length];
                                if (effect === 'crumb') {
                                    // Torn, scalloped edges, not straight chips or yarn.
                                    const mx = (point[0] + next[0]) / 2, my = (point[1] + next[1]) / 2;
                                    a.quadraticCurveTo(mx + (20 - mx) * .2, my + (20 - my) * .2, ...next);
                                } else if (effect === 'wood') {
                                    a.lineTo(point[0] * .55 + next[0] * .45 + (j % 2 ? 1.8 : -1.8), point[1] * .55 + next[1] * .45);
                                    a.lineTo(...next);
                                } else a.lineTo(...next);
                            });
                            a.closePath(); a.save(); a.clip();
                            a.drawImage(tile, fragment.left, fragment.top, fragment.w, fragment.h, 2, 2, 36, 36);
                            if (effect === 'crumb') {
                                a.fillStyle = '#bf770e80'; a.beginPath(); a.ellipse(12 + i % 4 * 4, 15 + i % 3 * 5, 3.5, 2.5, i, 0, Math.PI * 2); a.fill();
                            } else if (['shatter', 'ice'].includes(effect)) {
                                a.fillStyle = effect === 'ice' ? '#ffffff65' : '#ffffff38'; a.beginPath(); a.moveTo(...points[0]); a.lineTo(...points[1]); a.lineTo(20, 20); a.closePath(); a.fill();
                                a.strokeStyle = '#ffffffb0'; a.lineWidth = .8; a.beginPath(); a.moveTo(...points[0]); a.lineTo(20, 20); a.stroke();
                            }
                            a.restore();
                            a.beginPath(); a.moveTo(...points[0]);
                            points.slice(1).forEach(point => a.lineTo(...point)); a.closePath();
                            if (effect !== 'crumb' && effect !== 'wood') { a.strokeStyle = '#ffffff70'; a.lineWidth = .7; a.stroke(); }
                        } else if (effect === 'honey') {
                            a.beginPath(); a.moveTo(20, 2); a.lineTo(36, 11); a.lineTo(36, 29); a.lineTo(20, 38); a.lineTo(4, 29); a.lineTo(4, 11); a.closePath();
                            a.fillStyle = palette[1]; a.fill(); a.strokeStyle = '#9d5004'; a.lineWidth = 3; a.stroke();
                            a.beginPath(); a.moveTo(20, 9); a.lineTo(30, 15); a.lineTo(30, 25); a.lineTo(20, 31); a.lineTo(10, 25); a.lineTo(10, 15); a.closePath();
                            a.fillStyle = '#c97706'; a.fill(); a.strokeStyle = '#ffdf58'; a.lineWidth = 2.3; a.stroke();
                            a.strokeStyle = '#fff1a5'; a.lineWidth = 1.3; a.beginPath(); a.moveTo(10, 15); a.lineTo(20, 9); a.lineTo(30, 15); a.stroke();
                        } else {
                            roundRect(a, effect === 'classic' ? 6 : 4, effect === 'classic' ? 6 : 4, effect === 'classic' ? 28 : 32, effect === 'classic' ? 28 : 32, effect === 'classic' ? 3 : 11);
                            a.save(); a.clip();
                            a.drawImage(tile, i % 3 * 24, Math.floor(i / 3) * 16, 40, 40, 0, 0, FRAG, FRAG); a.restore();
                        }
                    }
                    a.restore();
                }
            }
        }
        function prepare(theme) {
            if (banks.has(theme.id)) return banks.get(theme.id);
            const bank = { theme, mesh: fractureMesh(theme.effect), atlas: makeCanvas(SIZE + TYPES * FRAG, SIZE * 7) };
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
            const density = ({ soft: 16, porcelain: 12, shatter: 12, ice: 12, crumb: 12, wood: 12, honey: 7, squish: 7, classic: 4, paint: 0 })[theme.effect] ?? 8;
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
                const cellIndex = Math.floor(i * snapshots.length / count), cell = snapshots[cellIndex];
                const localIndex = i - Math.ceil(cellIndex * count / snapshots.length);
                const localCount = Math.ceil((cellIndex + 1) * count / snapshots.length) - Math.ceil(cellIndex * count / snapshots.length);
                const type = bank.mesh ? Math.floor(localIndex * TYPES / localCount) : i % TYPES;
                const fragment = bank.mesh?.[type], angle = (i * 2.39996) % (Math.PI * 2), power = 14 + Math.random() * 40;
                const size = theme.effect === 'soft' ? 12 + Math.random() * 9 : theme.effect === 'honey' ? cell.w * .44 : 8 + Math.random() * 12;
                const honeySite = theme.effect === 'honey' ? [[33,22],[63,22],[18,48],[48,48],[78,48],[33,74],[63,74]][localIndex % 7] : null;
                const x = cell.x + cell.w * (fragment ? (fragment.left + fragment.w / 2) / SIZE : honeySite ? honeySite[0] / SIZE : .2 + Math.random() * .6);
                const y = cell.y + cell.w * (fragment ? (fragment.top + fragment.h / 2) / SIZE : honeySite ? honeySite[1] / SIZE : .2 + Math.random() * .6);
                return { cell, x, y, dx: Math.cos(angle) * power, dy: Math.sin(angle) * power - (['soft', 'squish'].includes(theme.effect) ? 14 : 24), spin: (Math.random() - .5) * 5, type, size,
                    w: fragment ? cell.w * fragment.w / SIZE * FRAG / 36 : honeySite ? cell.w * .38 : size, h: fragment ? cell.w * fragment.h / SIZE * FRAG / 36 : size };
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
            const kick = 1 - Math.pow(1 - u, 2);
            let x = p.x + p.dx * kick, y = p.y + p.dy * kick + 82 * u * u, stretch = 1, spin = p.spin * u;
            if (effect === 'soft') { y = p.y - 20 * u + Math.sin(u * 5 + p.type) * u * 12; x = p.x + p.dx * ease(u) + Math.sin(u * 4 + p.type) * u * 9; spin = p.spin * ease(u); }
            if (effect === 'honey') {
                // Honeycomb peels apart, pulls inward on short sticky bridges, then snaps free.
                x = p.x + p.dx * .35 * kick; y = p.y - 13 * kick + 83 * u * u;
                stretch = 1 + Math.sin(Math.PI * clamp(u / .45)) * .12; spin *= .65;
            }
            if (effect === 'squish') { x = p.x + p.dx * ease(u); y = p.y + p.dy * ease(u) + 45 * u * u; stretch = 1 + Math.sin(u * 7) * .2; spin = p.spin * ease(u); }
            if (effect === 'wood') { x = p.x + p.dx * .7 * kick; y = p.y + p.dy * .45 * kick + 90 * u * u; spin *= .85; }
            if (effect === 'ice') { x = p.x + p.dx * 1.15 * kick; y = p.y + p.dy * .75 * kick + 85 * u * u; spin *= 1.3; }
            if (effect === 'crumb') { y = p.y + p.dy * .6 * kick + 92 * u * u; x = p.x + p.dx * .85 * kick; }
            if (effect === 'candy') { x = p.x + p.dx * u; y = p.y - (45 + p.type * 2) * u + 150 * u * u; spin *= 2.1; }
            if (effect === 'shatter') { x = p.x + p.dx * 1.25 * kick; y = p.y + p.dy * kick + 90 * u * u; }
            if (effect === 'classic') { x = p.x + p.dx * 1.5 * u; y = p.y - (50 + p.type * 4) * u + 120 * u * u; spin *= 2; }
            const alpha = effect === 'classic' ? 1 - clamp((u - .8) / .2) : 1 - Math.pow(u, ['soft', 'squish'].includes(effect) ? 1.8 : 2.5);
            const scale = effect === 'classic' ? 1 - .55 * u : ['soft', 'squish'].includes(effect) ? 1 - .25 * u : .97 - .2 * u;
            ctx.save(); ctx.globalAlpha = alpha;
            if (effect === 'honey' && u > 0 && u < .34) {
                ctx.strokeStyle = '#eca10b'; ctx.lineWidth = Math.max(.4, 2.3 * (1 - u / .34)); ctx.beginPath();
                ctx.moveTo(p.x + PAD, p.y + PAD); ctx.quadraticCurveTo(p.x + PAD + 4, p.y + PAD + 10 * u, x + PAD, y + PAD); ctx.stroke();
            }
            ctx.translate(x + PAD, y + PAD); ctx.rotate(spin);
            ctx.drawImage(b.bank.atlas, SIZE + p.type * FRAG, p.cell.color * SIZE, FRAG, FRAG, -p.w * scale / 2, -p.h * stretch * scale / 2, p.w * scale, p.h * stretch * scale); ctx.restore();
        }
        function classic(b, t) {
            if (b.bank.theme.effect !== 'classic' || t > .4) return;
            const scale = 1 - ease(t / .4);
            for (const cell of b.cells) {
                if (b.excluded.has(cell.r * 8 + cell.c)) continue;
                const w = cell.w * scale;
                ctx.save(); ctx.globalAlpha = 1 - t / .4;
                ctx.drawImage(b.bank.atlas, 0, cell.color * SIZE, SIZE, SIZE, PAD + cell.x + (cell.w - w) / 2, PAD + cell.y + (cell.w - w) / 2, w, w); ctx.restore();
            }
        }
        function paint(b, t) {
            if (!b.bands.length) return;
            const { head, tail } = paintProgress(t);
            // Canvas copies live above the board while the brush covers them; board state is already clear.
            for (const cell of b.cells) {
                if (b.excluded.has(cell.r * 8 + cell.c)) continue;
                const covered = b.bands.some(band => {
                    if (!band.cells.includes(cell)) return false;
                    return head <= (band.vertical ? cell.r : cell.c) / 8;
                });
                if (!covered) ctx.drawImage(b.bank.atlas, 0, cell.color * SIZE, SIZE, SIZE, PAD + cell.x, PAD + cell.y, cell.w, cell.w);
            }
            for (const band of b.bands) {
                const first = band.cells[0], step = first.w + 4, length = 8 * step - 4;
                ctx.save(); ctx.globalAlpha = 1;
                const origin = band.vertical ? { x: first.x + first.w, y: 4 } : { x: 4, y: first.y };
                ctx.translate(origin.x + PAD, origin.y + PAD);
                if (band.vertical) ctx.rotate(Math.PI / 2);
                if (b.excluded.size) {
                    ctx.beginPath();
                    for (const cell of band.cells) if (!b.excluded.has(cell.r * 8 + cell.c)) ctx.rect((band.vertical ? cell.r : cell.c) * step, 0, step, first.w);
                    ctx.clip();
                }
                for (let lane = 0; lane < 10; lane++) {
                    const bristle = Math.sin(lane * 2.4) * .008;
                    const left = clamp(head + bristle * Math.sin(head * Math.PI)), right = clamp(tail + bristle * Math.sin(tail * Math.PI));
                    if (right <= left) continue;
                    ctx.drawImage(band.image, 640 * left, lane * 8.4, 640 * (right - left), 8.4,
                        length * left, first.w * lane / 10, length * (right - left), first.w / 10 + .2);
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
                classic(b, t);
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
    const api = { create, duration, budget, fractureMesh, paintProgress };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BBMaterialMotion = api;
})(typeof window !== 'undefined' ? window : globalThis);
