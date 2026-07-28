/* ============================================================
   setup-screen.js
   Pre-game setup: choose number of players (2-4), edit names,
   pick colors. Calls onStart(configs) when the user is ready.
   ============================================================ */

(function (global) {
    'use strict';

    const COLORS = [
        { id: 'blue',   hex: '#0a84ff' },
        { id: 'red',    hex: '#ff2a2a' },
        { id: 'green',  hex: '#29c463' },
        { id: 'yellow', hex: '#ffd60a' },
        { id: 'purple', hex: '#bf5af2' },
        { id: 'orange', hex: '#ff9f0a' },
        { id: 'pink',   hex: '#ff5fa2' },
        { id: 'cyan',   hex: '#64d2ff' },
    ];

    let rootEl = null;
    let onStartCb = null;

    // Working config: 4 slots, first 2 enabled by default
    let count = 4;
    let slots = [
        { name: 'Игрок 1', color: '#0a84ff' },
        { name: 'Игрок 2', color: '#ff2a2a' },
        { name: 'Игрок 3', color: '#29c463' },
        { name: 'Игрок 4', color: '#ffd60a' },
    ];

    function show(onStart) {
        onStartCb = onStart;
        rootEl = document.createElement('div');
        rootEl.className = 'setup-screen';
        document.body.appendChild(rootEl);
        render();
    }

    function hide() {
        if (rootEl) {
            rootEl.classList.add('closing');
            setTimeout(() => { rootEl?.remove(); rootEl = null; }, 350);
        }
    }

    function usedColors(exceptIdx) {
        return slots.slice(0, count)
            .filter((_, i) => i !== exceptIdx)
            .map(s => s.color);
    }

    function render() {
        const playerCards = renderPlayersHTML();

        rootEl.innerHTML = `
            <div class="setup-inner">
                <button class="setup-back-btn" id="setupBackBtn" aria-label="Меню">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M15 18l-6-6 6-6"/>
                    </svg>
                    <span>Меню</span>
                </button>
                <div class="setup-logo">
                    <div class="setup-logo-icon">🎲</div>
                    <div class="setup-logo-text">Spark Monopoly</div>
                </div>

                <div class="setup-section-label">Количество игроков</div>
                <div class="setup-count-segment" id="setupCountSegment">
                    <div class="setup-count-glider" id="setupCountGlider"
                         style="transform: translateX(${(count - 2) * 100}%)"></div>
                    ${[2, 3, 4].map(n => `
                        <button class="setup-count-item ${count === n ? 'is-active' : ''}" data-count="${n}">
                            ${n}
                        </button>
                    `).join('')}
                </div>

                <div class="setup-section-label">Игроки</div>
                <div class="setup-players" id="setupPlayers">
                    ${playerCards}
                </div>

                <button class="setup-start-btn" id="setupStartBtn">
                    Начать игру
                </button>
            </div>
        `;

        // Count segment: springy glider slides to the picked value; only the
        // player list re-renders so the glider animation stays visible.
        rootEl.querySelectorAll('.setup-count-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const n = parseInt(btn.dataset.count);
                if (n === count) return;
                count = n;
                ensureUniqueColors();
                const glider = document.getElementById('setupCountGlider');
                if (glider) glider.style.transform = `translateX(${(count - 2) * 100}%)`;
                rootEl.querySelectorAll('.setup-count-item').forEach(b => {
                    b.classList.toggle('is-active', parseInt(b.dataset.count) === count);
                });
                renderPlayersInto();
                try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
            });
        });

        bindPlayerEvents();

        // Start
        document.getElementById('setupStartBtn').addEventListener('click', () => {
            const configs = slots.slice(0, count).map((s, i) => ({
                name: (s.name || '').trim() || `Игрок ${i + 1}`,
                color: s.color,
            }));
            try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success'); } catch (_) {}
            hide();
            if (onStartCb) onStartCb(configs);
        });

        // Back to Spark menu
        const backBtn = document.getElementById('setupBackBtn');
        if (backBtn) backBtn.addEventListener('click', () => {
            if (window.MonopolyExit) window.MonopolyExit();
        });
    }

    // ---- Player cards: partial render + event binding ----
    function renderPlayersHTML() {
        return slots.slice(0, count).map((s, i) => {
            const taken = usedColors(i);
            const swatches = COLORS.map(c => {
                const isUsed = taken.includes(c.hex);
                const isSel = s.color === c.hex;
                return `
                    <button class="setup-swatch ${isSel ? 'is-selected' : ''} ${isUsed ? 'is-used' : ''}"
                            data-player="${i}" data-color="${c.hex}"
                            style="background: ${c.hex}" ${isUsed ? 'disabled' : ''}>
                        ${isSel ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' : ''}
                    </button>
                `;
            }).join('');

            return `
                <div class="setup-player-card">
                    <div class="setup-player-head">
                        <div class="setup-player-avatar" style="background: ${s.color}">
                            ${(s.name.charAt(0) || '?').toUpperCase()}
                        </div>
                        <input class="setup-name-input" data-player="${i}"
                               value="${escapeHtml(s.name)}" maxlength="14"
                               placeholder="Игрок ${i + 1}"/>
                    </div>
                    <div class="setup-swatches">
                        ${swatches}
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderPlayersInto() {
        const holder = document.getElementById('setupPlayers');
        if (!holder) return;
        holder.innerHTML = renderPlayersHTML();
        bindPlayerEvents();
    }

    function bindPlayerEvents() {
        // Name inputs
        rootEl.querySelectorAll('.setup-name-input').forEach(inp => {
            inp.addEventListener('input', () => {
                const i = parseInt(inp.dataset.player);
                slots[i].name = inp.value;
                // Update avatar letter live
                const card = inp.closest('.setup-player-card');
                const av = card.querySelector('.setup-player-avatar');
                av.textContent = (inp.value.charAt(0) || '?').toUpperCase();
            });
        });

        // Color swatches — re-render only the player list (keeps the count
        // segment untouched so its glider never jumps).
        rootEl.querySelectorAll('.setup-swatch').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                const i = parseInt(btn.dataset.player);
                slots[i].color = btn.dataset.color;
                renderPlayersInto();
                try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
            });
        });
    }

    // If two enabled players share a color (after count change), fix collisions
    function ensureUniqueColors() {
        const seen = new Set();
        for (let i = 0; i < count; i++) {
            if (seen.has(slots[i].color)) {
                const free = COLORS.find(c => !seen.has(c.hex));
                if (free) slots[i].color = free.hex;
            }
            seen.add(slots[i].color);
        }
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    global.SetupScreen = { show, hide };
})(window);