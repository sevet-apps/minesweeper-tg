require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http'); 
const { Server } = require("socket.io"); 
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Telegram Bot Token for subscription check
const BOT_TOKEN = process.env.BOT_TOKEN;
const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL || '@spark_game_news';
const OWNER_ID = '1482228376'; // Твой Telegram ID

// ============================
// SECURITY: Telegram initData validation
// ============================
function validateInitData(initDataString) {
    if (!initDataString || !BOT_TOKEN) return null;
    
    try {
        const params = new URLSearchParams(initDataString);
        const hash = params.get('hash');
        if (!hash) return null;
        
        params.delete('hash');
        
        // Sort params alphabetically and build check string
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        // HMAC-SHA256 with secret key derived from bot token
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        if (computedHash !== hash) return null;
        
        // Check auth_date is not too old (allow 24h window)
        const authDate = parseInt(params.get('auth_date'));
        if (!authDate || (Date.now() / 1000 - authDate) > 86400) return null;
        
        // Extract user
        const userStr = params.get('user');
        if (!userStr) return null;
        
        return JSON.parse(userStr);
    } catch (e) {
        console.error('initData validation error:', e.message);
        return null;
    }
}

// Middleware: extract and validate user from initData header
function authMiddleware(req, res, next) {
    const initData = req.headers['x-init-data'];
    
    if (!initData) {
        return res.status(401).json({ error: 'Missing authentication' });
    }
    
    const user = validateInitData(initData);
    if (!user) {
        return res.status(403).json({ error: 'Invalid authentication' });
    }
    
    // Check if user is banned
    if (bannedUsers.has(String(user.id))) {
        return res.status(403).json({ error: 'Account suspended' });
    }
    
    req.telegramUser = user;
    next();
}

// ============================
// SECURITY: Rate limiting (in-memory)
// ============================
const rateLimitMap = new Map(); // key -> { count, resetTime }
const RATE_LIMITS = {
    'save-stat': { max: 30, windowMs: 60000 },      // 30 saves per minute
    'register-referral': { max: 5, windowMs: 60000 }, // 5 per minute
    'profile': { max: 60, windowMs: 60000 },           // 60 per minute
    'leaderboard': { max: 30, windowMs: 60000 },       // 30 per minute
};

function checkRateLimit(userId, action) {
    const config = RATE_LIMITS[action];
    if (!config) return true;
    
    const key = `${action}:${userId}`;
    const now = Date.now();
    const entry = rateLimitMap.get(key);
    
    if (!entry || now > entry.resetTime) {
        rateLimitMap.set(key, { count: 1, resetTime: now + config.windowMs });
        return true;
    }
    
    if (entry.count >= config.max) return false;
    entry.count++;
    return true;
}

// Cleanup rate limit map every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap) {
        if (now > entry.resetTime) rateLimitMap.delete(key);
    }
}, 300000);

// ============================
// SECURITY: Score validation limits
// ============================
const SCORE_LIMITS = {
    'bb_best_score':      { min: 1, max: 10000000 },
    'bb_total_games':     { min: 1, max: 10000000 },
    'saper_wins':         { min: 1, max: 10000000 },
    'saper_best_6':       { min: 1, max: 86400 },   // seconds, max 24h
    'saper_best_8':       { min: 1, max: 86400 },
    'saper_best_10':      { min: 1, max: 86400 },
    'saper_best_15':      { min: 1, max: 86400 },
    'checkers_total':     { min: 1, max: 10000000 },
    'checkers_wins_pve':  { min: 1, max: 10000000 },
    'sudoku_wins':        { min: 1, max: 10000000 },
    'tower_best':         { min: 1, max: 10000000 },
    'tower_combo':        { min: 1, max: 10000000 },
    'wordle_wins':        { min: 1, max: 10000000 },
};

// Time-based game types that allow float scores (seconds with ms precision)
const TIME_BASED_TYPES = ['saper_best_6', 'saper_best_8', 'saper_best_10', 'saper_best_15'];

function validateScore(gameType, score) {
    const limits = SCORE_LIMITS[gameType];
    if (!limits) return false;
    
    if (TIME_BASED_TYPES.includes(gameType)) {
        // Allow float scores for time-based types, must be a finite number
        if (typeof score !== 'number' || !Number.isFinite(score)) return false;
    } else {
        if (!Number.isInteger(score)) return false;
    }
    if (score < limits.min || score > limits.max) return false;
    
    return true;
}

// ============================
// SECURITY: Game Session Tracking
// ============================
const gameSessions = new Map(); // `${userId}:${gameType}` -> { startTime, token, moves }

// Minimum game durations in ms (impossible to play faster)
const MIN_GAME_DURATION = {
    'bb_best_score': 5000,       // BB game takes at least 5 sec
    'tower_best': 3000,          // Tower takes at least 3 sec
    'tower_combo': 3000,
    'saper_best_6': 2000,        // Minesweeper 6x6 at least 2 sec
    'saper_best_8': 3000,
    'saper_best_10': 5000,
    'saper_best_15': 10000,
    'sudoku_wins': 10000,        // Sudoku takes at least 10 sec
    'wordle_wins': 3000,         // Wordle at least 3 sec
    'checkers_wins_pve': 15000,  // Checkers game at least 15 sec
};

// Generate session token (HMAC-signed, can't be forged by client)
function createSessionToken(userId, gameType, startTime) {
    const data = `${userId}:${gameType}:${startTime}`;
    return crypto.createHmac('sha256', BOT_TOKEN || 'fallback-secret').update(data).digest('hex').substring(0, 32);
}

// Start game session
app.post('/game-session/start', authMiddleware, (req, res) => {
    const user = req.telegramUser;
    const userId = String(user.id);
    const { game_type } = req.body;
    
    if (!checkRateLimit(userId, 'save-stat')) {
        return res.status(429).json({ error: 'Too many requests' });
    }
    
    const allowedTypes = Object.keys(SCORE_LIMITS);
    if (!allowedTypes.includes(game_type)) {
        return res.status(400).json({ error: 'Invalid game type' });
    }
    
    const startTime = Date.now();
    const token = createSessionToken(userId, game_type, startTime);
    const key = `${userId}:${game_type}`;
    
    gameSessions.set(key, { 
        startTime, 
        token, 
        moveCount: 0,
        lastMoveTime: startTime,
        // BB server-side validation state
        ...(game_type === 'bb_best_score' ? {
            bbGrid: Array(8).fill(null).map(() => Array(8).fill(0)),
            bbScore: 0,
            bbCombo: 0,
            bbComboBuffer: 0,
            bbSynced: false  // Set true after first successful move or bb-sync
        } : {})
    });
    
    // Cleanup old sessions (older than 24h)
    const now = Date.now();
    for (const [k, v] of gameSessions) {
        if (now - v.startTime > 86400000) gameSessions.delete(k);
    }
    
    res.json({ session_token: token });
});

// ============================
// BB Server-Side Game Simulation
// ============================
const BB_ROWS = 8, BB_COLS = 8;

function bbCanPlace(grid, matrix, r, c) {
    for (let i = 0; i < matrix.length; i++) {
        for (let j = 0; j < matrix[0].length; j++) {
            if (matrix[i][j] === 1) {
                const nr = r + i, nc = c + j;
                if (nr < 0 || nr >= BB_ROWS || nc < 0 || nc >= BB_COLS || grid[nr][nc] !== 0) return false;
            }
        }
    }
    return true;
}

function bbPlaceAndScore(session, matrix, r, c) {
    const grid = session.bbGrid;
    
    // Place shape, count cells
    let placedCount = 0;
    for (let i = 0; i < matrix.length; i++) {
        for (let j = 0; j < matrix[0].length; j++) {
            if (matrix[i][j] === 1) {
                grid[r + i][c + j] = 1; // 1 = filled (server doesn't need color)
                placedCount++;
            }
        }
    }
    session.bbScore += placedCount;
    
    // Check lines
    const rowsToClear = [];
    const colsToClear = [];
    for (let row = 0; row < BB_ROWS; row++) {
        if (grid[row].every(v => v !== 0)) rowsToClear.push(row);
    }
    for (let col = 0; col < BB_COLS; col++) {
        let full = true;
        for (let row = 0; row < BB_ROWS; row++) { if (grid[row][col] === 0) { full = false; break; } }
        if (full) colsToClear.push(col);
    }
    
    const totalCleared = rowsToClear.length + colsToClear.length;
    
    if (totalCleared > 0) {
        session.bbCombo++;
        session.bbComboBuffer = 3;
        
        // Clear lines
        rowsToClear.forEach(row => { for (let c2 = 0; c2 < BB_COLS; c2++) grid[row][c2] = 0; });
        colsToClear.forEach(col => { for (let r2 = 0; r2 < BB_ROWS; r2++) grid[r2][col] = 0; });
        
        // Score: base 10 per line, multi-line multiplier, combo multiplier
        let points = totalCleared * 20;
        if (totalCleared >= 2) points = points * totalCleared;
        if (session.bbCombo > 1) points = points * session.bbCombo;
        session.bbScore += points;
        
        // Check all-clear bonus
        let allClear = true;
        for (let row = 0; row < BB_ROWS && allClear; row++) {
            for (let col = 0; col < BB_COLS; col++) {
                if (grid[row][col] !== 0) { allClear = false; break; }
            }
        }
        if (allClear) {
            const bonus = 500 * (session.bbCombo > 0 ? session.bbCombo : 1);
            session.bbScore += bonus;
        }
    } else {
        if (session.bbCombo > 0) {
            session.bbComboBuffer--;
            if (session.bbComboBuffer <= 0) session.bbCombo = 0;
        }
    }
    
    return { placedCount, linesCleared: totalCleared };
}

// Record game move (lightweight telemetry + BB server validation)
app.post('/game-session/move', authMiddleware, (req, res) => {
    const user = req.telegramUser;
    const userId = String(user.id);
    const { game_type, session_token, move_data } = req.body;
    
    const key = `${userId}:${game_type}`;
    const session = gameSessions.get(key);
    
    if (!session || session.token !== session_token) {
        return res.json({ ok: false });
    }
    
    // Anti-spam: minimum 300ms between moves (no human plays faster)
    const now = Date.now();
    if (now - session.lastMoveTime < 300) {
        session.suspiciousCount = (session.suspiciousCount || 0) + 1;
        if (session.suspiciousCount > 5) {
            return res.json({ ok: false });
        }
    }
    
    // === BB Server-side validation ===
    if (game_type === 'bb_best_score' && move_data && typeof move_data === 'object' && move_data.matrix) {
        const { matrix, r, c } = move_data;
        
        // Validate matrix format
        if (!Array.isArray(matrix) || matrix.length === 0 || matrix.length > 5) {
            return res.json({ ok: false, reason: 'invalid_matrix' });
        }
        const colLen = matrix[0].length;
        if (!matrix.every(row => Array.isArray(row) && row.length === colLen && row.length <= 5 && row.every(v => v === 0 || v === 1))) {
            return res.json({ ok: false, reason: 'invalid_matrix' });
        }
        
        // Validate position
        if (typeof r !== 'number' || typeof c !== 'number' || r < 0 || c < 0 || r >= BB_ROWS || c >= BB_COLS) {
            return res.json({ ok: false, reason: 'invalid_position' });
        }
        
        // Check placement validity on server grid
        if (!bbCanPlace(session.bbGrid, matrix, r, c)) {
            const fullName = (user.first_name + ' ' + (user.last_name || '')).trim();
            logSuspiciousActivity(userId, fullName, user.username, game_type, session.bbScore, `BB_INVALID_PLACEMENT (r=${r}, c=${c})`);
            return res.json({ ok: false, reason: 'cannot_place' });
        }
        
        // Simulate placement and scoring
        bbPlaceAndScore(session, matrix, r, c);
        session.bbSynced = true;
        
        session.moveCount++;
        session.lastMoveTime = now;
        
        return res.json({ ok: true, server_score: session.bbScore });
    }
    
    // === Default: lightweight hash-based telemetry for other games ===
    if (!move_data || typeof move_data !== 'string' || move_data.length < 4 || move_data.length > 64) {
        return res.json({ ok: false });
    }
    
    // Store move hashes to detect duplicate/replayed moves
    if (!session.moveHashes) session.moveHashes = new Set();
    if (session.moveHashes.has(move_data)) {
        session.suspiciousCount = (session.suspiciousCount || 0) + 1;
        return res.json({ ok: false });
    }
    session.moveHashes.add(move_data);
    
    session.moveCount++;
    session.lastMoveTime = now;
    
    res.json({ ok: true });
});

// Sync BB game state on resume (client sends current grid + score)
app.post('/game-session/bb-sync', authMiddleware, (req, res) => {
    const user = req.telegramUser;
    const userId = String(user.id);
    const { session_token, grid, score, combo, comboBuffer } = req.body;
    
    const key = `${userId}:bb_best_score`;
    const session = gameSessions.get(key);
    
    if (!session || session.token !== session_token) {
        return res.json({ ok: false });
    }
    
    // Validate grid format
    if (!Array.isArray(grid) || grid.length !== BB_ROWS) {
        return res.json({ ok: false, reason: 'invalid_grid' });
    }
    for (const row of grid) {
        if (!Array.isArray(row) || row.length !== BB_COLS) {
            return res.json({ ok: false, reason: 'invalid_grid' });
        }
    }
    
    // Sync server state to match client's saved state
    // Server grid uses 0/1 (doesn't need colors)
    session.bbGrid = grid.map(row => row.map(cell => cell === 0 ? 0 : 1));
    session.bbScore = typeof score === 'number' ? score : 0;
    session.bbCombo = typeof combo === 'number' ? combo : 0;
    session.bbComboBuffer = typeof comboBuffer === 'number' ? comboBuffer : 0;
    session.bbSynced = true;
    
    console.log(`BB session synced for user ${userId}: score=${session.bbScore}, combo=${session.bbCombo}`);
    res.json({ ok: true, server_score: session.bbScore });
});

// ============================  
// SECURITY: Score anomaly detection log
// ============================

// In-memory cheat strike tracker: userId -> { count, username, reasons[] }
const cheatStrikes = new Map();
const CHEAT_BAN_THRESHOLD = 5;

// Banned users set (in-memory + synced to DB)
const bannedUsers = new Set();

// Load bans from DB on startup
async function loadBannedUsers() {
    try {
        const { data } = await supabase.from('banned_users').select('telegram_id');
        if (data) data.forEach(row => bannedUsers.add(String(row.telegram_id)));
        console.log(`Loaded ${bannedUsers.size} banned users`);
    } catch(e) { console.log('No banned_users table yet'); }
}
loadBannedUsers();

async function notifyOwner(message) {
    if (!BOT_TOKEN) return;
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: OWNER_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
    } catch(e) { console.error('Failed to notify owner:', e.message); }
}

async function banUser(userId, username) {
    bannedUsers.add(String(userId));
    try {
        await supabase.from('banned_users').upsert({
            telegram_id: String(userId),
            username: username,
            banned_at: new Date().toISOString()
        }, { onConflict: 'telegram_id' }).catch(() => {});
    } catch(e) {}
}

// Human-readable reason descriptions
const REASON_NAMES = {
    'BB_INVALID_PLACEMENT': 'Невалидное размещение фигуры',
    'NO_SESSION': 'Попытка сохранить результат без игровой сессии',
    'TOO_FAST': 'Игра завершена слишком быстро',
    'TOO_FEW_MOVES': 'Слишком мало ходов за игру',
    'SCORE_VS_MOVES': 'Очки не соответствуют количеству ходов',
    'COUNTER_JUMP': 'Попытка перескочить значение счётчика',
    'BB_SCORE_MISMATCH': 'Очки не совпадают с серверным подсчётом',
};

function formatReason(reason) {
    // Extract base reason key (before parentheses with details)
    const baseKey = reason.split(' (')[0];
    const humanName = REASON_NAMES[baseKey];
    if (!humanName) return reason;
    // Extract details if any
    const detailMatch = reason.match(/\((.+)\)/);
    return detailMatch ? `${humanName} (${detailMatch[1]})` : humanName;
}

function formatGameName(gameType) {
    const info = GAME_NAMES[gameType];
    return info ? `${info.ru} — ${info.category}` : gameType;
}

async function logSuspiciousActivity(userId, username, tgHandle, gameType, score, reason) {
    console.log(`⚠️ SUSPICIOUS [${reason}]: user=${userId} (${username}), game=${gameType}, score=${score}`);
    
    // Save to DB
    try {
        await supabase.from('suspicious_scores').insert({
            telegram_id: userId,
            username: username,
            game_type: gameType,
            score: score,
            reason: reason,
            created_at: new Date().toISOString()
        }).catch(() => {});
    } catch(e) {}
    
    // Don't track owner
    if (String(userId) === OWNER_ID) return;
    
    // Increment strike counter
    const strikes = cheatStrikes.get(String(userId)) || { count: 0, username, tgHandle, reasons: [] };
    strikes.count++;
    strikes.username = username;
    strikes.tgHandle = tgHandle || strikes.tgHandle;
    strikes.reasons.push({ gameType, reason, score, time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) });
    cheatStrikes.set(String(userId), strikes);
    
    const handleStr = strikes.tgHandle ? ` (@${strikes.tgHandle})` : '';
    const warnEmoji = '<tg-emoji emoji-id="5447644880824181073">⚠️</tg-emoji>';
    const banEmoji = '<tg-emoji emoji-id="5240241223632954241">🚫</tg-emoji>';
    const progressBar = '█'.repeat(strikes.count) + '░'.repeat(Math.max(0, CHEAT_BAN_THRESHOLD - strikes.count));
    
    if (strikes.count >= CHEAT_BAN_THRESHOLD && !bannedUsers.has(String(userId))) {
        // Auto-ban
        await banUser(userId, username);
        
        const historyLines = strikes.reasons.slice(-5).map((r, i) => 
            `  ${i + 1}. ${r.time} · ${formatGameName(r.gameType)}\n     ${formatReason(r.reason)}`
        ).join('\n\n');
        
        await notifyOwner(
            `${banEmoji} <b>Игрок заблокирован</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `<b>${username}</b>${handleStr}\n` +
            `ID: <code>${userId}</code>\n\n` +
            `Нарушений: ${progressBar} ${strikes.count}/${CHEAT_BAN_THRESHOLD}\n\n` +
            `<b>Последние нарушения:</b>\n\n` +
            `${historyLines}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Разбанить: /unban ${userId}`
        );
    } else {
        await notifyOwner(
            `${warnEmoji} <b>Подозрительная активность</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `<b>${username}</b>${handleStr}\n` +
            `ID: <code>${userId}</code>\n\n` +
            `${formatGameName(gameType)}\n` +
            `${formatReason(reason)}\n` +
            `Очки: ${score}\n\n` +
            `Страйки: ${progressBar} ${strikes.count}/${CHEAT_BAN_THRESHOLD}`
        );
    }
}

// --- API РОУТЫ ---
app.get('/', (req, res) => res.send('Glass API v39.2 (secured)'));

// Check if user is subscribed to the required channel
app.get('/check-subscription', async (req, res) => {
    const { user_id } = req.query;
    
    if (!user_id) {
        return res.json({ subscribed: false, error: 'No user_id provided' });
    }
    
    if (!BOT_TOKEN) {
        console.log('BOT_TOKEN not set, skipping subscription check');
        return res.json({ subscribed: true }); // Skip check if no token
    }
    
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${REQUIRED_CHANNEL}&user_id=${user_id}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.ok) {
            const status = data.result.status;
            // member, administrator, creator = subscribed
            // left, kicked, restricted = not subscribed
            const subscribed = ['member', 'administrator', 'creator'].includes(status);
            return res.json({ subscribed, status });
        } else {
            console.log('Telegram API error:', data);
            // If error (e.g., user never interacted with bot), assume not subscribed
            return res.json({ subscribed: false, error: data.description });
        }
    } catch (e) {
        console.error('Subscription check error:', e);
        return res.json({ subscribed: true }); // On error, allow access
    }
});

app.get('/api/profile/:id', async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('users').select('*').eq('telegram_id', id).single();
    if (error) return res.status(200).json({});
    res.json(data);
});

// Game type display names for notifications
const GAME_NAMES = {
    'bb_best_score': { ru: 'Блок Бласт', category: 'Лучший счёт' },
    'saper_wins': { ru: 'Сапёр', category: 'Победы' },
    'saper_best_6': { ru: 'Сапёр 6×6', category: 'Лучшее время' },
    'saper_best_8': { ru: 'Сапёр 8×8', category: 'Лучшее время' },
    'saper_best_10': { ru: 'Сапёр 10×10', category: 'Лучшее время' },
    'saper_best_15': { ru: 'Сапёр 15×15', category: 'Лучшее время' },
    'checkers_wins_pve': { ru: 'Шашки', category: 'Победы PvE' },
    'sudoku_wins': { ru: 'Судоку', category: 'Победы' },
    'tower_best': { ru: 'Башня', category: 'Лучший результат' },
    'tower_combo': { ru: 'Башня', category: 'Лучшее комбо' },
    'wordle_wins': { ru: 'Вордли', category: 'Победы' },
};

// Send notification when someone gets displaced from their position
async function notifyDisplaced(displacedUserId, displacedUsername, newLeaderUsername, gameType, oldRank, newRank) {
    if (!bot || !displacedUserId) return;
    
    const gameInfo = GAME_NAMES[gameType];
    if (!gameInfo) return;
    
    try {
        const alertEmoji = '<tg-emoji emoji-id="5406745015365943482">⚡</tg-emoji>';
        const message = oldRank === 1
            ? `${alertEmoji} <b>Кто-то</b> обошёл вас в топе <b>${gameInfo.ru}</b> (${gameInfo.category})!\n\nВы были на 1 месте, теперь вы на 2 месте. Попробуйте вернуть лидерство!`
            : `${alertEmoji} <b>Кто-то</b> сместил вас с <b>${oldRank}</b> на <b>${newRank}</b> место в топе <b>${gameInfo.ru}</b> (${gameInfo.category})!`;
        
        const APP_SHORT_NAME = process.env.APP_SHORT_NAME || 'sparkapp';
        
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: displacedUserId,
                text: message,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🏆 Посмотреть топ', url: `https://t.me/spark_game_bot/sparkapp?startapp=top_${gameType}` }
                    ]]
                }
            })
        });
        console.log(`Notified user ${displacedUserId} about displacement in ${gameType}`);
    } catch (e) {
        console.log(`Failed to notify displaced user ${displacedUserId}:`, e.message);
    }
}

app.post('/save-stat', authMiddleware, async (req, res) => {
    const user = req.telegramUser;
    const user_id = String(user.id);
    const username = (user.first_name + ' ' + (user.last_name || '')).trim();
    const tgUsername = user.username || '';
    const photo_url = user.photo_url || '';
    const { game_type, score, session_token } = req.body;
    
    // Rate limit
    if (!checkRateLimit(user_id, 'save-stat')) {
        return res.status(429).json({ error: 'Too many requests' });
    }
    
    // Validate game_type is allowed
    const allowedTypes = Object.keys(SCORE_LIMITS);
    if (!allowedTypes.includes(game_type)) {
        return res.status(400).json({ error: 'Invalid game type' });
    }
    
    // Validate score
    if (!validateScore(game_type, score)) {
        return res.status(400).json({ error: 'Invalid score' });
    }
    
    // ---- SESSION VALIDATION ----
    // Counter games (wins, total) don't need sessions — they increment by 1
    const isCounter = ['saper_wins', 'bb_total_games', 'checkers_total', 'checkers_wins_pve', 'sudoku_wins', 'wordle_wins'].includes(game_type);
    
    // tower_combo shares session with tower_best (same game, submitted together)
    const sessionGameType = (game_type === 'tower_combo') ? 'tower_best' : game_type;
    const needsSession = !isCounter;
    
    if (needsSession) {
        const key = `${user_id}:${sessionGameType}`;
        const session = gameSessions.get(key);
        
        if (!session || session.token !== session_token) {
            // No strike — session loss is common after server restart/deploy
            console.log(`NO_SESSION: user=${user_id}, game=${game_type}, score=${score}`);
            return res.status(400).json({ error: 'Invalid session' });
        }
        
        const duration = Date.now() - session.startTime;
        const minDuration = MIN_GAME_DURATION[game_type] || 2000;
        
        if (duration < minDuration) {
            console.log(`TOO_FAST: user=${user_id}, game=${game_type}, score=${score}, duration=${duration}ms`);
            gameSessions.delete(key);
            return res.status(400).json({ error: 'Game completed too quickly' });
        }
        
        // Check minimum moves for action games
        if (game_type === 'bb_best_score' && session.moveCount < 3) {
            console.log(`TOO_FEW_MOVES: user=${user_id}, game=${game_type}, moves=${session.moveCount}`);
            gameSessions.delete(key);
            return res.status(400).json({ error: 'Insufficient gameplay' });
        }
        
        // Score-to-moves ratio check (only for non-BB games, BB is validated per-move)
        const SCORE_PER_MOVE_MAX = {
            'tower_best': 1.5,
        };
        const maxPerMove = SCORE_PER_MOVE_MAX[game_type];
        if (maxPerMove && session.moveCount > 0) {
            const maxPossibleScore = Math.ceil(session.moveCount * maxPerMove);
            if (score > maxPossibleScore) {
                console.log(`SCORE_VS_MOVES: user=${user_id}, game=${game_type}, score=${score}, moves=${session.moveCount}`);
                gameSessions.delete(key);
                return res.status(400).json({ error: 'Score inconsistent with gameplay' });
            }
        }
        
        // BB server-side: log score comparison (informational only, no reject)
        // Real protection happens per-move: bbCanPlace + bbPlaceAndScore validate every placement
        // If session was lost (server restart), we simply can't compare — that's fine
        if (game_type === 'bb_best_score' && session.bbSynced) {
            const diff = score - session.bbScore;
            if (Math.abs(diff) > 10) {
                console.log(`BB score diff: client=${score}, server=${session.bbScore}, diff=${diff}, user=${user_id}`);
            }
        }
        
        // Session used — delete it (but keep for tower_combo if tower_best was just saved)
        if (game_type !== 'tower_best') {
            gameSessions.delete(key);
        } else {
            // Mark session as used for tower_best, but keep alive briefly for tower_combo
            session.bestSubmitted = true;
            setTimeout(() => gameSessions.delete(key), 5000);
        }
    }
    
    // ---- COUNTER HANDLING: server-side increment ----
    if (isCounter) {
        let { data: checkUser } = await supabase.from('users').select(game_type).eq('telegram_id', user_id).single();
        const currentVal = checkUser ? (checkUser[game_type] || 0) : 0;
        // Server increments by 1 regardless of what client sends
        // This prevents both COUNTER_JUMP false positives and cheating
        const updateData = { username: username, photo_url: photo_url };
        updateData[game_type] = currentVal + 1;
        
        if (!checkUser) {
            const { error } = await supabase.from('users').insert({ telegram_id: user_id, ...updateData });
            if (error) return res.status(500).json({ error: 'DB error' });
        } else {
            const { error } = await supabase.from('users').update(updateData).eq('telegram_id', user_id);
            if (error) return res.status(500).json({ error: 'DB error' });
        }
        return res.json({ ok: true, value: currentVal + 1 });
    }
    
    try {
        let { data: existingUser } = await supabase.from('users').select('*').eq('telegram_id', user_id).single();
        
        const updateData = { username: username, photo_url: photo_url };
        updateData[game_type] = score;
        
        const isTime = game_type.includes('best') && game_type.includes('saper');
        
        // Before saving, get current top players for this category to detect displacement
        let topBefore = [];
        if (GAME_NAMES[game_type]) {
            const { data: topData } = await supabase
                .from('users')
                .select(`telegram_id, username, ${game_type}`)
                .not(game_type, 'is', null)
                .gt(game_type, 0)
                .order(game_type, { ascending: isTime })
                .limit(10);
            topBefore = topData || [];
        }
        
        if (!existingUser) {
            await supabase.from('users').insert({ telegram_id: user_id, ...updateData });
        } else {
            const currentScore = existingUser[game_type];
            let isRecord = false;
            if (currentScore === null || currentScore === undefined) isRecord = true;
            else if (isTime) { if (score < currentScore) isRecord = true; }
            else { if (score > currentScore) isRecord = true; }
            if (isRecord) await supabase.from('users').update(updateData).eq('telegram_id', user_id);
            else await supabase.from('users').update({ username: username, photo_url: photo_url }).eq('telegram_id', user_id);
        }
        
        // After saving, get new top and detect who got displaced
        if (GAME_NAMES[game_type]) {
            const { data: topAfter } = await supabase
                .from('users')
                .select(`telegram_id, username, ${game_type}`)
                .not(game_type, 'is', null)
                .gt(game_type, 0)
                .order(game_type, { ascending: isTime })
                .limit(10);
            
            if (topAfter && topBefore.length > 0) {
                for (const beforeUser of topBefore) {
                    if (String(beforeUser.telegram_id) === String(user_id)) continue;
                    
                    const oldRank = topBefore.findIndex(u => String(u.telegram_id) === String(beforeUser.telegram_id)) + 1;
                    const newRank = topAfter.findIndex(u => String(u.telegram_id) === String(beforeUser.telegram_id)) + 1;
                    
                    if (oldRank > 0 && newRank > oldRank) {
                        notifyDisplaced(
                            beforeUser.telegram_id,
                            beforeUser.username,
                            username,
                            game_type,
                            oldRank,
                            newRank
                        );
                    }
                }
            }
        }
        
        // Referral activation: when user scores 1000+ in Block Blast
        if (game_type === 'bb_best_score' && score >= 1000) {
            const { data: freshUser } = await supabase.from('users').select('referred_by, referral_activated').eq('telegram_id', user_id).single();
            if (freshUser && freshUser.referred_by && !freshUser.referral_activated) {
                await supabase.from('users').update({ referral_activated: true }).eq('telegram_id', user_id);
                console.log(`Referral activated: user ${user_id} scored ${score} in BB, referrer ${freshUser.referred_by}`);
            }
        }
        
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/leaderboard', async (req, res) => {
    const { category } = req.query;
    const allowed = [
        'saper_total', 'saper_wins', 'saper_best_6', 'saper_best_8', 'saper_best_10', 'saper_best_15', 
        'checkers_total', 'checkers_wins_pve', 
        'bb_total_games', 'bb_best_score', 
        'sudoku_wins',
        'tower_best', 'tower_combo',
        'wordle_wins'
    ];
    if (!allowed.includes(category)) return res.json([]); 
    const isTime = category.includes('best') && category.includes('saper');
    const { data, error } = await supabase.from('users').select(`telegram_id, username, photo_url, ${category}`).not(category, 'is', null).order(category, { ascending: isTime }).limit(50);
    if (error) return res.json([]);
    const result = data.map(u => ({ user_id: u.telegram_id, username: u.username, photo_url: u.photo_url, score: u[category] }));
    res.json(result);
});

// Get user ranks for all games
app.get('/user-ranks', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.json({});
    
    const categories = [
        { key: 'bb_best_score', asc: false },
        { key: 'saper_best_8', asc: true },
        { key: 'saper_wins', asc: false },
        { key: 'tower_best', asc: false },
        { key: 'sudoku_wins', asc: false },
        { key: 'checkers_wins_pve', asc: false },
        { key: 'wordle_wins', asc: false }
    ];
    
    const ranks = {};
    
    for (const cat of categories) {
        const { data } = await supabase
            .from('users')
            .select(`telegram_id, ${cat.key}`)
            .not(cat.key, 'is', null)
            .gt(cat.key, 0)
            .order(cat.key, { ascending: cat.asc });
        
        if (data) {
            const idx = data.findIndex(u => String(u.telegram_id) === String(user_id));
            const userEntry = data.find(u => String(u.telegram_id) === String(user_id));
            ranks[cat.key] = {
                rank: idx >= 0 ? idx + 1 : null,
                score: userEntry ? userEntry[cat.key] : null,
                total: data.length
            };
        }
    }
    
    res.json(ranks);
});

// --- REFERRAL SYSTEM ---

// Register a new referral
app.post('/register-referral', authMiddleware, async (req, res) => {
    const user = req.telegramUser;
    const user_id = String(user.id);
    const username = (user.first_name + ' ' + (user.last_name || '')).trim();
    const photo_url = user.photo_url || '';
    const { referrer_id } = req.body;
    
    console.log('Register referral request:', { user_id, referrer_id, username });
    
    // Rate limit
    if (!checkRateLimit(user_id, 'register-referral')) {
        return res.status(429).json({ error: 'Too many requests' });
    }
    
    if (!referrer_id) {
        return res.status(400).json({ error: 'Missing referrer_id' });
    }
    
    // Don't allow self-referral
    if (user_id === String(referrer_id)) {
        return res.status(400).json({ error: 'Cannot refer yourself' });
    }
    
    try {
        // Check if user already exists and has a referrer
        const { data: existingUser } = await supabase
            .from('users')
            .select('telegram_id, referred_by')
            .eq('telegram_id', user_id)
            .single();
        
        // If user already has a referrer, skip
        if (existingUser && existingUser.referred_by) {
            console.log('User already has a referrer, skipping');
            return res.json({ success: false, message: 'User already has a referrer' });
        }
        
        // Update or create the referred user with referrer info
        // referral_activated defaults to false — will be set to true when they score 1000+ in Block Blast
        if (existingUser) {
            await supabase
                .from('users')
                .update({ referred_by: referrer_id, referral_activated: false })
                .eq('telegram_id', user_id);
            console.log('Updated existing user with referrer');
        } else {
            await supabase.from('users').insert({
                telegram_id: user_id,
                username: username,
                photo_url: photo_url,
                referred_by: referrer_id,
                referral_activated: false,
                referral_count: 0
            });
            console.log('Created new user with referrer');
        }
        
        // Increment the referrer's total referral_count (shown in profile)
        const { data: referrer } = await supabase
            .from('users')
            .select('telegram_id, referral_count')
            .eq('telegram_id', referrer_id)
            .single();
        
        if (referrer) {
            const newCount = (referrer.referral_count || 0) + 1;
            await supabase
                .from('users')
                .update({ referral_count: newCount })
                .eq('telegram_id', referrer_id);
            console.log('Incremented referrer total count to', newCount);
        } else {
            await supabase.from('users').insert({ 
                telegram_id: referrer_id,
                referral_count: 1
            });
            console.log('Created referrer with count 1');
        }
        
        res.json({ success: true });
    } catch (e) {
        console.error('Referral error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Get referral stats for a user
app.get('/referral-stats', async (req, res) => {
    const { user_id } = req.query;
    
    if (!user_id) {
        return res.json({ referral_count: 0, active_count: 0, rank: null });
    }
    
    try {
        // Get user's total referral count (for profile display)
        const { data: user } = await supabase
            .from('users')
            .select('referral_count')
            .eq('telegram_id', user_id)
            .single();
        
        const referralCount = user?.referral_count || 0;
        
        // Count activated referrals for this user (for leaderboard ranking)
        const { data: activatedReferrals, count: activeCount } = await supabase
            .from('users')
            .select('telegram_id', { count: 'exact' })
            .eq('referred_by', user_id)
            .eq('referral_activated', true);
        
        const activated = activeCount || 0;
        
        // Get rank based on activated referrals (compare with all other users)
        // Fetch all users who have at least 1 activated referral
        const { data: allReferrers } = await supabase
            .from('users')
            .select('telegram_id, referred_by')
            .eq('referral_activated', true);
        
        // Count activated referrals per referrer
        const referrerCounts = {};
        if (allReferrers) {
            allReferrers.forEach(u => {
                const ref = String(u.referred_by);
                referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
            });
        }
        
        // Sort by count descending
        const sorted = Object.entries(referrerCounts).sort((a, b) => b[1] - a[1]);
        
        let rank = null;
        if (activated > 0) {
            const idx = sorted.findIndex(([id]) => id === String(user_id));
            if (idx >= 0) rank = idx + 1;
        }
        
        res.json({ referral_count: referralCount, active_count: activated, rank: rank });
    } catch (e) {
        console.error('Referral stats error:', e);
        res.json({ referral_count: 0, active_count: 0, rank: null });
    }
});

// Get referral leaderboard (based on activated referrals only)
app.get('/referral-leaderboard', async (req, res) => {
    try {
        // Get all activated referrals
        const { data: activatedReferrals } = await supabase
            .from('users')
            .select('referred_by')
            .eq('referral_activated', true);
        
        if (!activatedReferrals || activatedReferrals.length === 0) return res.json([]);
        
        // Count activated referrals per referrer
        const referrerCounts = {};
        activatedReferrals.forEach(u => {
            const ref = String(u.referred_by);
            referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
        });
        
        // Get referrer user info
        const referrerIds = Object.keys(referrerCounts);
        const { data: referrerUsers } = await supabase
            .from('users')
            .select('telegram_id, username, photo_url')
            .in('telegram_id', referrerIds);
        
        if (!referrerUsers) return res.json([]);
        
        // Build leaderboard
        const result = referrerUsers.map(u => ({
            user_id: u.telegram_id,
            username: u.username,
            photo_url: u.photo_url,
            score: referrerCounts[String(u.telegram_id)] || 0
        }))
        .filter(u => u.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);
        
        res.json(result);
    } catch (e) {
        res.json([]);
    }
});

// --- SOCKET.IO ЛОГИКА (Шашки с таймером) ---
const rooms = new Map();
const TURN_TIME_LIMIT = 60000; // 60 секунд на ход

// Track online users (users with app open)
const onlineUsers = new Map(); // socket.id -> { oderId, odername, connectedAt }

// BB Live streaming
const bbLiveStreamers = new Map(); // oderId -> { socketId, username, grid, score, combo }
const bbLiveWatchers = new Map(); // oderId (streamer) -> Set of watcher socket.ids

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // User registers when app opens
    socket.on('register_online', async ({ oderId, odername }) => {
        if (oderId) {
            onlineUsers.set(socket.id, { oderId, odername, connectedAt: Date.now() });
            console.log(`User ${oderId} online. Total online: ${onlineUsers.size}`);
            
            // Log activity to database
            try {
                await supabase.from('user_activity').insert({
                    telegram_id: oderId,
                    activity_type: 'app_open'
                });
            } catch (e) {
                console.error('Failed to log activity:', e);
            }
        }
    });

    // --- BB LIVE STREAMING ---
    
    // Streamer starts broadcasting
    socket.on('bb_live_start', ({ userId, username }) => {
        if (!userId) return;
        bbLiveStreamers.set(String(userId), {
            socketId: socket.id,
            username: username,
            grid: [],
            score: 0,
            combo: 0
        });
        bbLiveWatchers.set(String(userId), new Set());
        console.log(`BB LIVE: ${username} (${userId}) started streaming`);
    });
    
    // Streamer sends board update
    socket.on('bb_live_update', ({ userId, grid, score, combo, shapes }) => {
        const uid = String(userId);
        const streamer = bbLiveStreamers.get(uid);
        if (!streamer || streamer.socketId !== socket.id) return;
        
        streamer.grid = grid;
        streamer.score = score;
        streamer.combo = combo;
        streamer.shapes = shapes;
        
        // Broadcast to all watchers
        const watchers = bbLiveWatchers.get(uid);
        if (watchers && watchers.size > 0) {
            watchers.forEach(watcherSocketId => {
                io.to(watcherSocketId).emit('bb_live_frame', {
                    userId: uid,
                    grid, score, combo, shapes
                });
            });
        }
    });
    
    // Streamer stops (game over or exit)
    socket.on('bb_live_stop', ({ userId }) => {
        const uid = String(userId);
        const streamer = bbLiveStreamers.get(uid);
        if (!streamer || streamer.socketId !== socket.id) return;
        
        // Notify all watchers
        const watchers = bbLiveWatchers.get(uid);
        if (watchers) {
            watchers.forEach(watcherSocketId => {
                io.to(watcherSocketId).emit('bb_live_ended', { userId: uid });
            });
        }
        
        bbLiveStreamers.delete(uid);
        bbLiveWatchers.delete(uid);
        console.log(`BB LIVE: ${uid} stopped streaming`);
    });
    
    // Watcher starts watching a streamer
    socket.on('bb_watch', ({ streamerId }) => {
        const uid = String(streamerId);
        const watchers = bbLiveWatchers.get(uid);
        const streamer = bbLiveStreamers.get(uid);
        if (!watchers || !streamer) {
            socket.emit('bb_live_ended', { userId: uid });
            return;
        }
        
        watchers.add(socket.id);
        
        // Send current state immediately
        socket.emit('bb_live_frame', {
            userId: uid,
            grid: streamer.grid,
            score: streamer.score,
            combo: streamer.combo,
            shapes: streamer.shapes,
            username: streamer.username
        });
    });
    
    // Watcher stops watching
    socket.on('bb_unwatch', ({ streamerId }) => {
        const uid = String(streamerId);
        const watchers = bbLiveWatchers.get(uid);
        if (watchers) watchers.delete(socket.id);
    });
    
    // Get list of active live streamers
    socket.on('bb_live_list', (callback) => {
        const list = [];
        bbLiveStreamers.forEach((data, oderId) => {
            list.push({ userId: oderId, username: data.username, score: data.score });
        });
        if (typeof callback === 'function') callback(list);
    });

    // Синхронизация времени - клиент отправляет ping, сервер отвечает с серверным временем
    socket.on('time_sync', (clientTime, callback) => {
        callback({ serverTime: Date.now(), clientTime: clientTime });
    });

    // Создание игры
    socket.on('create_game', ({ username, photo_url }) => {
        let roomCode = Math.floor(10000 + Math.random() * 90000).toString();
        while(rooms.has(roomCode)) { roomCode = Math.floor(10000 + Math.random() * 90000).toString(); }
        
        socket.join(roomCode);
        
        rooms.set(roomCode, {
            players: [{ 
                id: socket.id, 
                name: username, 
                avatar: photo_url,
                color: 'white'
            }],
            status: 'waiting',
            currentTurn: 'white',
            turnStartedAt: null,
            turnTimer: null
        });

        socket.emit('game_created', { roomCode, color: 'white' });
        console.log(`Room ${roomCode} created by ${username}`);
    });

    // Вход в игру
    socket.on('join_game', ({ roomCode, userData }) => {
        const room = rooms.get(roomCode);
        if (!room) { socket.emit('error_message', 'Комната не найдена'); return; }
        if (room.players.length >= 2) { socket.emit('error_message', 'Комната переполнена'); return; }

        socket.join(roomCode);
        
        const newPlayer = { 
            id: socket.id, 
            name: userData.username, 
            avatar: userData.photo_url,
            color: 'black'
        };

        room.players.push(newPlayer);
        room.status = 'playing';
        
        // Запускаем таймер для первого хода (белые)
        room.turnStartedAt = Date.now();
        startTurnTimer(roomCode);

        // Старт игры - отправляем с серверным временем начала хода
        io.to(room.players[0].id).emit('start_game', { 
            opponent: { name: newPlayer.name, avatar: newPlayer.avatar }, 
            color: 'white',
            turnStartedAt: room.turnStartedAt,
            serverTime: Date.now()
        });
        io.to(newPlayer.id).emit('start_game', { 
            opponent: { name: room.players[0].name, avatar: room.players[0].avatar }, 
            color: 'black',
            turnStartedAt: room.turnStartedAt,
            serverTime: Date.now()
        });
    });

    // Ход в шашках
    socket.on('move', ({ roomCode, move }) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        // Проверяем что ходит правильный игрок
        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.color !== room.currentTurn) {
            console.log(`Invalid move attempt: ${player?.color} tried to move on ${room.currentTurn}'s turn`);
            socket.emit('sync_state', { currentTurn: room.currentTurn, turnStartedAt: room.turnStartedAt, serverTime: Date.now() });
            return;
        }

        // Останавливаем текущий таймер
        if (room.turnTimer) {
            clearTimeout(room.turnTimer);
            room.turnTimer = null;
        }

        // Меняем ход
        room.currentTurn = room.currentTurn === 'white' ? 'black' : 'white';
        room.turnStartedAt = Date.now();

        // Отправляем ход сопернику с серверным временем и текущим ходом
        socket.to(roomCode).emit('opponent_move', { 
            move: move, 
            turnStartedAt: room.turnStartedAt,
            currentTurn: room.currentTurn,
            serverTime: Date.now()
        });

        // Подтверждаем ход отправителю с синхронизированным временем
        socket.emit('move_confirmed', {
            turnStartedAt: room.turnStartedAt,
            currentTurn: room.currentTurn,
            serverTime: Date.now()
        });

        // Запускаем таймер для следующего хода
        startTurnTimer(roomCode);
    });

    // Запрос синхронизации таймера (при возвращении в приложение)
    socket.on('request_sync', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room || !room.turnStartedAt) return;

        socket.emit('sync_timer', { 
            turnStartedAt: room.turnStartedAt,
            currentTurn: room.currentTurn,
            serverTime: Date.now()
        });
    });

    // Игрок сообщает о своём таймауте
    socket.on('timeout', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        // Оповещаем соперника о таймауте
        socket.to(roomCode).emit('opponent_timeout');
        
        // Завершаем игру
        cleanupRoom(roomCode);
    });

    // Игрок вышел из игры (сдался)
    socket.on('player_left', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        socket.to(roomCode).emit('opponent_left');
        cleanupRoom(roomCode);
    });

    // Конец игры
    socket.on('game_over', ({ roomCode, winner }) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        io.to(roomCode).emit('game_finished', { winner });
        cleanupRoom(roomCode);
    });

    // Отключение
    socket.on('disconnect', () => {
        // Remove from online users
        if (onlineUsers.has(socket.id)) {
            const user = onlineUsers.get(socket.id);
            console.log(`User ${user.oderId} offline. Total online: ${onlineUsers.size - 1}`);
            
            // Clean up BB live stream if this user was streaming
            const uid = String(user.oderId);
            if (bbLiveStreamers.has(uid) && bbLiveStreamers.get(uid).socketId === socket.id) {
                const watchers = bbLiveWatchers.get(uid);
                if (watchers) {
                    watchers.forEach(watcherSocketId => {
                        io.to(watcherSocketId).emit('bb_live_ended', { userId: uid });
                    });
                }
                bbLiveStreamers.delete(uid);
                bbLiveWatchers.delete(uid);
            }
            
            // Clean up if this user was watching someone
            bbLiveWatchers.forEach((watchers) => {
                watchers.delete(socket.id);
            });
            
            onlineUsers.delete(socket.id);
        }
        
        rooms.forEach((room, code) => {
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                socket.to(code).emit('opponent_disconnected');
                cleanupRoom(code);
            }
        });
    });
});

// Запуск таймера хода
function startTurnTimer(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.turnStartedAt = Date.now();

    // Очищаем предыдущий таймер если есть
    if (room.turnTimer) {
        clearTimeout(room.turnTimer);
    }

    // Устанавливаем таймер на 60 секунд
    room.turnTimer = setTimeout(() => {
        const currentRoom = rooms.get(roomCode);
        if (!currentRoom) return;

        // Находим игрока, у которого вышло время
        const timedOutPlayer = currentRoom.players.find(p => p.color === currentRoom.currentTurn);
        const winner = currentRoom.players.find(p => p.color !== currentRoom.currentTurn);

        if (timedOutPlayer && winner) {
            // Сообщаем проигравшему
            io.to(timedOutPlayer.id).emit('timeout_loss');
            // Сообщаем победителю
            io.to(winner.id).emit('opponent_timeout');
        }

        cleanupRoom(roomCode);
    }, TURN_TIME_LIMIT);
}

// Очистка комнаты
function cleanupRoom(roomCode) {
    const room = rooms.get(roomCode);
    if (room) {
        if (room.turnTimer) {
            clearTimeout(room.turnTimer);
        }
        rooms.delete(roomCode);
        console.log(`Room ${roomCode} cleaned up`);
    }
}

// --- TELEGRAM BOT INLINE MODE ---
const TelegramBot = require('node-telegram-bot-api');

// Premium эмодзи ID
const EMOJI = {
    first: '<tg-emoji emoji-id="5440539497383087970">🥇</tg-emoji>',
    second: '<tg-emoji emoji-id="5447203607294265305">🥈</tg-emoji>',
    third: '<tg-emoji emoji-id="5453902265922376865">🥉</tg-emoji>',
    sparkle: '<tg-emoji emoji-id="5325547803936572038">✨</tg-emoji>',
    game: '<tg-emoji emoji-id="5361741454685256344">🎮</tg-emoji>',
    play: '<tg-emoji emoji-id="5427168083074628963">▶️</tg-emoji>',
    chart: '<tg-emoji emoji-id="5231200819986047254">📊</tg-emoji>',
    joystick: '<tg-emoji emoji-id="5317048952716039773">🕹</tg-emoji>',
    trophy: '<tg-emoji emoji-id="5280769763398671636">🏆</tg-emoji>',
    handshake: '<tg-emoji emoji-id="5357080225463149588">🤝</tg-emoji>',
};

// Обычные эмодзи для inline (Premium не поддерживается)
const EMOJI_INLINE = {
    first: '🥇',
    second: '🥈',
    third: '🥉',
    sparkle: '✨',
    game: '🎮',
    chart: '📊',
};

// --- TIC-TAC-TOE GAME ---
const tttGames = new Map(); // inline_message_id -> game state

const TTT_X = '❌';
const TTT_O = '⭕';
const TTT_EMPTY = '▫️';

function createTTTBoard() {
    return [
        [TTT_EMPTY, TTT_EMPTY, TTT_EMPTY],
        [TTT_EMPTY, TTT_EMPTY, TTT_EMPTY],
        [TTT_EMPTY, TTT_EMPTY, TTT_EMPTY]
    ];
}

function getTTTKeyboard(board, gameId) {
    return {
        inline_keyboard: board.map((row, r) => 
            row.map((cell, c) => ({
                text: cell,
                callback_data: `ttt_${gameId}_${r}_${c}`
            }))
        )
    };
}

function checkTTTWinner(board) {
    // Проверяем строки
    for (let i = 0; i < 3; i++) {
        if (board[i][0] !== TTT_EMPTY && board[i][0] === board[i][1] && board[i][1] === board[i][2]) {
            return board[i][0];
        }
    }
    // Проверяем столбцы
    for (let i = 0; i < 3; i++) {
        if (board[0][i] !== TTT_EMPTY && board[0][i] === board[1][i] && board[1][i] === board[2][i]) {
            return board[0][i];
        }
    }
    // Проверяем диагонали
    if (board[0][0] !== TTT_EMPTY && board[0][0] === board[1][1] && board[1][1] === board[2][2]) {
        return board[0][0];
    }
    if (board[0][2] !== TTT_EMPTY && board[0][2] === board[1][1] && board[1][1] === board[2][0]) {
        return board[0][2];
    }
    // Проверяем ничью
    let isDraw = true;
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            if (board[r][c] === TTT_EMPTY) isDraw = false;
        }
    }
    if (isDraw) return 'draw';
    return null;
}

// --- CHECKERS GAME ---
const checkersGames = new Map(); // inline_message_id -> game state

const CH_WHITE = '⚪';
const CH_BLACK = '⚫';
const CH_EMPTY = '·';

function createCheckersBoard() {
    // 8x8 доска, шашки на тёмных клетках
    const board = [];
    for (let r = 0; r < 8; r++) {
        const row = [];
        for (let c = 0; c < 8; c++) {
            const isDark = (r + c) % 2 === 1;
            if (!isDark) {
                row.push({ type: 'light' }); // светлые клетки - нельзя ходить
            } else if (r < 3) {
                row.push({ type: 'piece', color: 'black', isKing: false });
            } else if (r > 4) {
                row.push({ type: 'piece', color: 'white', isKing: false });
            } else {
                row.push({ type: 'empty' }); // пустая тёмная клетка
            }
        }
        board.push(row);
    }
    return board;
}

function getCheckersKeyboard(board, gameId, selectedPos = null) {
    const keyboard = [];
    for (let r = 0; r < 8; r++) {
        const row = [];
        for (let c = 0; c < 8; c++) {
            const cell = board[r][c];
            let text;
            
            if (selectedPos && selectedPos.r === r && selectedPos.c === c) {
                text = '🟢';
            } else if (cell.type === 'light') {
                text = ' ';
            } else if (cell.type === 'empty') {
                text = CH_EMPTY;
            } else if (cell.type === 'piece') {
                if (cell.isKing) {
                    text = cell.color === 'white' ? '⬜' : '⬛';
                } else {
                    text = cell.color === 'white' ? CH_WHITE : CH_BLACK;
                }
            }
            
            row.push({
                text: text,
                callback_data: `ch_${gameId}_${r}_${c}`
            });
        }
        keyboard.push(row);
    }
    return { inline_keyboard: keyboard };
}

function getValidMoves(board, r, c, color) {
    const moves = [];
    const captures = [];
    const piece = board[r][c];
    if (piece.type !== 'piece' || piece.color !== color) return { moves: [], captures: [] };
    
    const allDirections = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    
    // Обычные ходы - только вперёд для обычных шашек, все направления для дамок
    const moveDirections = piece.isKing ? 
        allDirections : 
        (color === 'white' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);
    
    // Взятие - во все стороны для всех шашек!
    const captureDirections = allDirections;
    
    if (piece.isKing) {
        // Дамка - ходит на любое количество клеток по диагонали
        for (const [dr, dc] of moveDirections) {
            let nr = r + dr;
            let nc = c + dc;
            
            // Ищем пустые клетки или вражескую шашку
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const target = board[nr][nc];
                
                if (target.type === 'empty') {
                    moves.push({ r: nr, c: nc });
                } else if (target.type === 'piece' && target.color !== color) {
                    // Нашли вражескую шашку - проверяем можно ли перепрыгнуть
                    const jr = nr + dr;
                    const jc = nc + dc;
                    if (jr >= 0 && jr < 8 && jc >= 0 && jc < 8 && board[jr][jc].type === 'empty') {
                        // Можно бить, добавляем все пустые клетки за шашкой
                        let lr = jr;
                        let lc = jc;
                        while (lr >= 0 && lr < 8 && lc >= 0 && lc < 8 && board[lr][lc].type === 'empty') {
                            captures.push({ r: lr, c: lc, capturedR: nr, capturedC: nc });
                            lr += dr;
                            lc += dc;
                        }
                    }
                    break; // Дальше этой шашки не смотрим
                } else {
                    break; // Своя шашка или край доски
                }
                
                nr += dr;
                nc += dc;
            }
        }
    } else {
        // Обычная шашка - ходит на 1 клетку вперёд
        for (const [dr, dc] of moveDirections) {
            const nr = r + dr;
            const nc = c + dc;
            
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const target = board[nr][nc];
                if (target.type === 'empty') {
                    moves.push({ r: nr, c: nc });
                }
            }
        }
        
        // Взятие - во все 4 стороны
        for (const [dr, dc] of captureDirections) {
            const nr = r + dr;
            const nc = c + dc;
            
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const target = board[nr][nc];
                if (target.type === 'piece' && target.color !== color) {
                    const jr = nr + dr;
                    const jc = nc + dc;
                    if (jr >= 0 && jr < 8 && jc >= 0 && jc < 8 && board[jr][jc].type === 'empty') {
                        captures.push({ r: jr, c: jc, capturedR: nr, capturedC: nc });
                    }
                }
            }
        }
    }
    
    return { moves, captures };
}

function hasAnyCaptures(board, color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = board[r][c];
            if (cell.type === 'piece' && cell.color === color) {
                const { captures } = getValidMoves(board, r, c, color);
                if (captures.length > 0) return true;
            }
        }
    }
    return false;
}

function hasAnyMoves(board, color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = board[r][c];
            if (cell.type === 'piece' && cell.color === color) {
                const { moves, captures } = getValidMoves(board, r, c, color);
                if (moves.length > 0 || captures.length > 0) return true;
            }
        }
    }
    return false;
}

function countPieces(board, color) {
    let count = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c].type === 'piece' && board[r][c].color === color) count++;
        }
    }
    return count;
}

// Функция для обновления статистики игр в шашки
async function incrementCheckersGames(oderId) {
    try {
        // Получаем текущее значение
        const { data } = await supabase
            .from('users')
            .select('checkers_total_pvp')
            .eq('telegram_id', oderId)
            .single();
        
        const current = data?.checkers_total_pvp || 0;
        
        // Обновляем
        await supabase
            .from('users')
            .update({ checkers_total_pvp: current + 1 })
            .eq('telegram_id', oderId);
            
        console.log(`Checkers games updated for user ${oderId}: ${current + 1}`);
    } catch (e) {
        console.error('Error updating checkers stats:', e.message);
    }
}

function getUserDisplayName(user) {
    if (user.username) return '@' + user.username;
    return user.first_name || 'Игрок';
}

// Helper function to edit inline message with play button
async function editInlineMessageWithPlayButton(inlineMessageId, text, userId) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            inline_message_id: inlineMessageId,
            text: text,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { 
                        text: '🎮 Играть', 
                        url: `https://t.me/spark_game_bot/sparkapp?startapp=ref_${userId}`
                    }
                ]]
            }
        })
    });
    const result = await response.json();
    if (!result.ok) {
        console.error('Edit message API error:', result.description);
    }
    return result;
}

// Конфигурация игр для inline режима
const GAME_CONFIG = {
    'block blast': { column: 'bb_best_score', name: 'Блок Бласт', isHigherBetter: true },
    'bb': { column: 'bb_best_score', name: 'Блок Бласт', isHigherBetter: true },
    'блок бласт': { column: 'bb_best_score', name: 'Блок Бласт', isHigherBetter: true },
    'blockblast': { column: 'bb_best_score', name: 'Блок Бласт', isHigherBetter: true },
    'сапёр': { column: 'saper_wins', name: 'Сапёр', isHigherBetter: true },
    'сапер': { column: 'saper_wins', name: 'Сапёр', isHigherBetter: true },
    'saper': { column: 'saper_wins', name: 'Сапёр', isHigherBetter: true },
    'minesweeper': { column: 'saper_wins', name: 'Сапёр', isHigherBetter: true },
    'башня': { column: 'tower_best', name: 'Башня', isHigherBetter: true },
    'tower': { column: 'tower_best', name: 'Башня', isHigherBetter: true },
    'судоку': { column: 'sudoku_wins', name: 'Судоку', isHigherBetter: true },
    'sudoku': { column: 'sudoku_wins', name: 'Судоку', isHigherBetter: true },
    'шашки': { column: 'checkers_wins_pve', name: 'Шашки', isHigherBetter: true },
    'checkers': { column: 'checkers_wins_pve', name: 'Шашки', isHigherBetter: true },
    'вордли': { column: 'wordle_wins', name: 'Вордли', isHigherBetter: true },
    'wordle': { column: 'wordle_wins', name: 'Вордли', isHigherBetter: true },
    'рефоводы': { column: 'referral', name: 'Рефоводы', isHigherBetter: true, isReferral: true },
    'рефералы': { column: 'referral', name: 'Рефоводы', isHigherBetter: true, isReferral: true },
    'referrals': { column: 'referral', name: 'Рефоводы', isHigherBetter: true, isReferral: true },
};

// Получить топ-3 + пользователя (с Premium эмодзи для бота)
async function getTopForGame(gameConfig, userId, usePremiumEmoji = true) {
    const { column, name, isHigherBetter } = gameConfig;
    const emojis = usePremiumEmoji ? EMOJI : EMOJI_INLINE;
    
    // Получаем топ-3
    const { data: top3 } = await supabase
        .from('users')
        .select(`telegram_id, username, ${column}`)
        .not(column, 'is', null)
        .gt(column, 0)
        .order(column, { ascending: !isHigherBetter })
        .limit(3);
    
    if (!top3 || top3.length === 0) {
        return { text: `<b>${name}</b>\n\nПока нет результатов`, userRank: null };
    }
    
    // Получаем все для определения места пользователя
    const { data: allUsers } = await supabase
        .from('users')
        .select(`telegram_id, username, ${column}`)
        .not(column, 'is', null)
        .gt(column, 0)
        .order(column, { ascending: !isHigherBetter });
    
    let userRank = null;
    let userData = null;
    
    if (userId && allUsers) {
        const userIndex = allUsers.findIndex(u => String(u.telegram_id) === String(userId));
        if (userIndex >= 0) {
            userRank = userIndex + 1;
            userData = allUsers[userIndex];
        }
    }
    
    // Формируем текст
    const medals = [emojis.first, emojis.second, emojis.third];
    let text = `<b>${name} — Топ игроков</b>\n\n`;
    
    top3.forEach((user, index) => {
        const medal = medals[index];
        const score = user[column];
        const username = user.username || 'Игрок';
        text += `${medal} ${username} — <b>${score}</b>\n`;
    });
    
    // Добавляем информацию о пользователе если он не в топ-3
    if (userRank && userRank > 3 && userData) {
        text += `\n━━━━━━━━━━━━━━━\n`;
        text += `📍 Вы: #${userRank} — <b>${userData[column]}</b>`;
    } else if (userRank && userRank <= 3) {
        text += `\n${emojis.sparkle} Вы в топ-${userRank}!`;
    }
    
    return { text, userRank };
}

// Получить топ рефералов (только активированные)
async function getTopForReferrals(userId, usePremiumEmoji = true) {
    const emojis = usePremiumEmoji ? EMOJI : EMOJI_INLINE;
    const name = 'Рефералы';
    
    // Get all activated referrals
    const { data: activatedReferrals } = await supabase
        .from('users')
        .select('referred_by')
        .eq('referral_activated', true);
    
    if (!activatedReferrals || activatedReferrals.length === 0) {
        return { text: `<b>${name}</b>\n\nПока нет результатов`, userRank: null };
    }
    
    // Count per referrer
    const referrerCounts = {};
    activatedReferrals.forEach(u => {
        const ref = String(u.referred_by);
        referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
    });
    
    // Get referrer info
    const referrerIds = Object.keys(referrerCounts);
    const { data: referrerUsers } = await supabase
        .from('users')
        .select('telegram_id, username')
        .in('telegram_id', referrerIds);
    
    if (!referrerUsers) {
        return { text: `<b>${name}</b>\n\nПока нет результатов`, userRank: null };
    }
    
    // Build sorted list
    const sorted = referrerUsers.map(u => ({
        telegram_id: u.telegram_id,
        username: u.username,
        score: referrerCounts[String(u.telegram_id)] || 0
    }))
    .filter(u => u.score > 0)
    .sort((a, b) => b.score - a.score);
    
    const top3 = sorted.slice(0, 3);
    
    let userRank = null;
    let userData = null;
    if (userId) {
        const idx = sorted.findIndex(u => String(u.telegram_id) === String(userId));
        if (idx >= 0) {
            userRank = idx + 1;
            userData = sorted[idx];
        }
    }
    
    const medals = [emojis.first, emojis.second, emojis.third];
    let text = `<b>${name} — Топ игроков</b>\n\n`;
    
    top3.forEach((user, index) => {
        const medal = medals[index];
        const username = user.username || 'Игрок';
        text += `${medal} ${username} — <b>${user.score}</b>\n`;
    });
    
    if (userRank && userRank > 3 && userData) {
        text += `\n━━━━━━━━━━━━━━━\n`;
        text += `📍 Вы: #${userRank} — <b>${userData.score}</b>`;
    } else if (userRank && userRank <= 3) {
        text += `\n${emojis.sparkle} Вы в топ-${userRank}!`;
    }
    
    return { text, userRank };
}

// URL Mini App
const WEBAPP_URL = 'https://sevet-apps.github.io/minesweeper-tg/';

// Кэш для хранения данных inline запросов
const inlineCache = new Map();

// Инициализация бота
let bot = null;

if (BOT_TOKEN) {
    bot = new TelegramBot(BOT_TOKEN, { polling: true });
    
    // Обработчик ошибок polling - чтобы бот не падал
    bot.on('polling_error', (error) => {
        console.error('Polling error:', error.code, error.message);
    });
    
    bot.on('error', (error) => {
        console.error('Bot error:', error.message);
    });
    
    // Обработка inline запросов
    bot.on('inline_query', async (query) => {
        try {
        const queryText = query.query.toLowerCase().trim();
        const userId = query.from.id;
        const user = query.from;
        
        const results = [];
        
        // Если запрос пустой - показываем все доступные команды
        if (!queryText) {
            const userName = getUserDisplayName(user);
            
            // 1. Крестики-нолики
            const tttId = `ttt_${userId}_${Date.now()}`;
            inlineCache.set(tttId, {
                type: 'ttt',
                creator: user,
                creatorName: userName
            });
            setTimeout(() => inlineCache.delete(tttId), 10 * 60 * 1000);
            
            results.push({
                type: 'article',
                id: tttId,
                title: 'Крестики-нолики',
                description: 'Сыграйте с кем-то из чата!',
                input_message_content: {
                    message_text: `🕹 <b>${userName}</b> хочет сыграть в крестики-нолики!\n\nНажмите любую клетку, чтобы принять вызов.`,
                    parse_mode: 'HTML'
                },
                reply_markup: getTTTKeyboard(createTTTBoard(), tttId)
            });
            
            // 2. Шашки
            const chId = `ch_${userId}_${Date.now() + 1}`;
            inlineCache.set(chId, {
                type: 'checkers',
                creator: user,
                creatorName: userName
            });
            setTimeout(() => inlineCache.delete(chId), 10 * 60 * 1000);
            
            results.push({
                type: 'article',
                id: chId,
                title: 'Шашки',
                description: 'Сыграйте в шашки с кем-то из чата!',
                input_message_content: {
                    message_text: `🕹 <b>${userName}</b> хочет сыграть в шашки!\n\nНажмите на любую свою шашку, чтобы принять вызов.`,
                    parse_mode: 'HTML'
                },
                reply_markup: getCheckersKeyboard(createCheckersBoard(), chId)
            });
            
            // 3. Топы игр
            const topGames = [
                { key: 'bb_best_score', name: 'Блок Бласт' },
                { key: 'saper_best_6', name: 'Сапёр' },
                { key: 'tower_best', name: 'Башня' },
                { key: 'sudoku_wins', name: 'Судоку' },
                { key: 'checkers_wins_pve', name: 'Шашки' },
                { key: 'wordle_wins', name: 'Вордли' }
            ];
            
            for (const game of topGames) {
                const config = Object.values(GAME_CONFIG).find(c => c.column === game.key);
                if (config) {
                    const resultId = `top_${game.key}_${Date.now()}`;
                    inlineCache.set(resultId, { gameConfig: config, userId });
                    setTimeout(() => inlineCache.delete(resultId), 5 * 60 * 1000);
                    
                    results.push({
                        type: 'article',
                        id: resultId,
                        title: `Топ ${game.name}`,
                        description: `Показать топ игроков в ${game.name}`,
                        input_message_content: {
                            message_text: `⏳ Загрузка топа ${game.name}...`,
                            parse_mode: 'HTML'
                        },
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🎮 Играть', url: `https://t.me/spark_game_bot/sparkapp?startapp=ref_${userId}` }
                            ]]
                        }
                    });
                }
            }
        } 
        // Крестики-нолики
        else if (queryText.includes('крестики') || queryText.includes('нолики') || queryText.includes('ttt') || queryText.includes('xo')) {
            const gameId = `ttt_${userId}_${Date.now()}`;
            const userName = getUserDisplayName(user);
            
            // Сохраняем данные создателя игры
            inlineCache.set(gameId, {
                type: 'ttt',
                creator: user,
                creatorName: userName
            });
            setTimeout(() => inlineCache.delete(gameId), 10 * 60 * 1000);
            
            results.push({
                type: 'article',
                id: gameId,
                title: '❌⭕ Крестики-нолики',
                description: 'Сыграйте с кем-то из чата!',
                input_message_content: {
                    message_text: `🕹 <b>${userName}</b> хочет сыграть в крестики-нолики!\n\nНажмите любую клетку, чтобы принять вызов.`,
                    parse_mode: 'HTML'
                },
                reply_markup: getTTTKeyboard(createTTTBoard(), gameId)
            });
        }
        // Шашки
        else if (queryText.includes('шашки') || queryText.includes('checkers')) {
            const gameId = `ch_${userId}_${Date.now()}`;
            const userName = getUserDisplayName(user);
            
            inlineCache.set(gameId, {
                type: 'checkers',
                creator: user,
                creatorName: userName
            });
            setTimeout(() => inlineCache.delete(gameId), 10 * 60 * 1000);
            
            results.push({
                type: 'article',
                id: gameId,
                title: '⚪⚫ Шашки',
                description: 'Сыграйте в шашки с кем-то из чата!',
                input_message_content: {
                    message_text: `🕹 <b>${userName}</b> хочет сыграть в шашки!\n\nНажмите на любую свою шашку, чтобы принять вызов.`,
                    parse_mode: 'HTML'
                },
                reply_markup: getCheckersKeyboard(createCheckersBoard(), gameId)
            });
        }
        else {
            // Ищем совпадение с игрой для топов
            let matchedGame = null;
            for (const [key, config] of Object.entries(GAME_CONFIG)) {
                if (queryText.includes(key)) {
                    matchedGame = config;
                    break;
                }
            }
            
            if (matchedGame) {
                try {
                    // Отправляем временное сообщение с обычными эмодзи
                    let result;
                    if (matchedGame.isReferral) {
                        result = await getTopForReferrals(userId, false);
                    } else {
                        result = await getTopForGame(matchedGame, userId, false);
                    }
                    const { text } = result;
                    
                    const resultId = `top_${matchedGame.column}_${Date.now()}`;
                    
                    // Сохраняем в кэш
                    inlineCache.set(resultId, { gameConfig: matchedGame, userId });
                    setTimeout(() => inlineCache.delete(resultId), 5 * 60 * 1000);
                    
                    results.push({
                        type: 'article',
                        id: resultId,
                        title: `Топ ${matchedGame.name}`,
                        description: 'Нажмите чтобы отправить топ в чат',
                        input_message_content: {
                            message_text: text,
                            parse_mode: 'HTML'
                        },
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🎮 Играть', url: `https://t.me/spark_game_bot/sparkapp?startapp=ref_${userId}` }
                            ]]
                        }
                    });
                } catch (e) {
                    console.error('Inline query error:', e);
                }
            } else {
                // Предлагаем варианты
                const suggested = new Set();
                for (const [key, config] of Object.entries(GAME_CONFIG)) {
                    if ((key.includes(queryText) || config.name.toLowerCase().includes(queryText)) && !suggested.has(config.column)) {
                        suggested.add(config.column);
                        const resultId = `suggest_${config.column}_${Date.now()}`;
                        inlineCache.set(resultId, { gameConfig: config, userId });
                        setTimeout(() => inlineCache.delete(resultId), 5 * 60 * 1000);
                        
                        results.push({
                            type: 'article',
                            id: resultId,
                            title: `${config.name}`,
                            description: `Показать топ ${config.name}`,
                            input_message_content: {
                                message_text: `⏳ Загрузка...`,
                                parse_mode: 'HTML'
                            },
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '🎮 Играть', url: `https://t.me/spark_game_bot/sparkapp?startapp=ref_${userId}` }
                                ]]
                            }
                        });
                    }
                }
            }
        }
        
        try {
            await bot.answerInlineQuery(query.id, results, { cache_time: 0 });
        } catch (e) {
            console.error('Answer inline query error:', e.message);
        }
        } catch (err) {
            console.error('Inline query handler error:', err.message);
        }
    });
    
    // Обработка chosen_inline_result
    bot.on('chosen_inline_result', async (result) => {
        try {
        const resultId = result.result_id;
        const inlineMessageId = result.inline_message_id;
        const userId = result.from.id;
        
        console.log('Chosen inline result:', resultId);
        
        // Log inline command usage
        try {
            await supabase.from('user_activity').insert({
                telegram_id: userId,
                activity_type: 'inline_command'
            });
        } catch (e) {
            console.error('Failed to log inline usage:', e);
        }
        
        if (!inlineMessageId) return;
        
        const cached = inlineCache.get(resultId);
        
        // Если это крестики-нолики - сохраняем игру
        if (cached?.type === 'ttt') {
            tttGames.set(inlineMessageId, {
                board: createTTTBoard(),
                playerX: cached.creator,
                playerO: null,
                playerXName: cached.creatorName,
                playerOName: null,
                currentTurn: 'X',
                gameId: resultId,
                status: 'waiting'
            });
            console.log('TTT game created:', inlineMessageId);
            setTimeout(() => tttGames.delete(inlineMessageId), 30 * 60 * 1000);
            
            try {
                await bot.editMessageText(
                    `${EMOJI.joystick} <b>${cached.creatorName}</b> хочет сыграть в крестики-нолики!\n\nНажмите любую клетку, чтобы принять вызов.`,
                    {
                        inline_message_id: inlineMessageId,
                        parse_mode: 'HTML',
                        reply_markup: getTTTKeyboard(createTTTBoard(), resultId)
                    }
                );
            } catch (e) {
                console.error('TTT edit error:', e.message);
            }
            return;
        }
        
        // Если это шашки - сохраняем игру
        if (cached?.type === 'checkers') {
            checkersGames.set(inlineMessageId, {
                board: createCheckersBoard(),
                playerWhite: cached.creator,
                playerBlack: null,
                playerWhiteName: cached.creatorName,
                playerBlackName: null,
                currentTurn: 'white',
                selected: null,
                gameId: resultId,
                status: 'waiting'
            });
            console.log('Checkers game created:', inlineMessageId);
            setTimeout(() => checkersGames.delete(inlineMessageId), 30 * 60 * 1000);
            
            try {
                await bot.editMessageText(
                    `${EMOJI.joystick} <b>${cached.creatorName}</b> хочет сыграть в шашки!\n\nНажмите на любую шашку, чтобы принять вызов.`,
                    {
                        inline_message_id: inlineMessageId,
                        parse_mode: 'HTML',
                        reply_markup: getCheckersKeyboard(createCheckersBoard(), resultId)
                    }
                );
            } catch (e) {
                console.error('Checkers edit error:', e.message);
            }
            return;
        }
        
        // Если это help - редактируем с Premium эмодзи
        if (cached?.type === 'help') {
            try {
                const helpText = `${EMOJI.game} <b>Spark Games</b>\n\n<b>Топы:</b>\n• Блок Бласт\n• Сапёр\n• Башня\n• Судоку\n• Шашки\n• Вордли\n\n<b>Игры:</b>\n• крестики-нолики\n• шашки\n\n${EMOJI.chart} Напишите: @spark_game_bot [команда]`;
                await editInlineMessageWithPlayButton(inlineMessageId, helpText, userId);
            } catch (e) {
                console.error('Help edit error:', e.message);
            }
            inlineCache.delete(resultId);
            return;
        }
        
        // Получаем данные из кэша для топов
        let gameConfig = cached?.gameConfig;
        
        if (!gameConfig) {
            for (const config of Object.values(GAME_CONFIG)) {
                if (resultId.includes(config.column)) {
                    gameConfig = config;
                    break;
                }
            }
        }
        
        if (gameConfig) {
            try {
                let result;
                if (gameConfig.isReferral) {
                    result = await getTopForReferrals(userId, true);
                } else {
                    result = await getTopForGame(gameConfig, userId, true);
                }
                await editInlineMessageWithPlayButton(inlineMessageId, result.text, userId);
                console.log('Message edited with premium emoji!');
            } catch (e) {
                console.error('Edit message error:', e.message);
            }
        }
        
        inlineCache.delete(resultId);
        } catch (err) {
            console.error('Chosen inline result error:', err.message);
        }
    });
    
    // Обработка нажатий на кнопки (для крестиков-ноликов)
    bot.on('callback_query', async (callbackQuery) => {
        try {
        const data = callbackQuery.data;
        const user = callbackQuery.from;
        const inlineMessageId = callbackQuery.inline_message_id;
        
        if (!inlineMessageId) {
            try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e) {}
            return;
        }
        
        // === КРЕСТИКИ-НОЛИКИ ===
        if (data.startsWith('ttt_')) {
            const parts = data.split('_');
            const row = parseInt(parts[parts.length - 2]);
            const col = parseInt(parts[parts.length - 1]);
            
            const game = tttGames.get(inlineMessageId);
            
            if (!game) {
                try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Игра не найдена или истекла' }); } catch(e) {}
                return;
            }
            
            const userName = getUserDisplayName(user);
            
            // Если игра ждёт второго игрока
            if (game.status === 'waiting') {
                if (user.id === game.playerX.id) {
                    try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ожидайте соперника!' }); } catch(e) {}
                    return;
                }
                
                // Второй игрок присоединяется
                game.playerO = user;
                game.playerOName = userName;
                game.status = 'playing';
                
                // Рандомно определяем кто ходит первым
                const firstIsX = Math.random() < 0.5;
                game.currentTurn = firstIsX ? 'X' : 'O';
                const firstPlayerName = firstIsX ? game.playerXName : game.playerOName;
                const firstSymbol = firstIsX ? '❌' : '⭕';
                
                try {
                    await bot.editMessageText(
                        `${EMOJI.joystick} <b>Крестики-нолики</b>\n\n${game.playerXName} (❌) vs ${game.playerOName} (⭕)\n\nПервый ход: ${firstPlayerName} (${firstSymbol})`,
                        {
                            inline_message_id: inlineMessageId,
                            parse_mode: 'HTML',
                            reply_markup: getTTTKeyboard(game.board, game.gameId)
                        }
                    );
                    await bot.answerCallbackQuery(callbackQuery.id, { text: `Игра началась! Ход ${firstPlayerName}` });
                } catch (e) {
                    console.error('Edit error:', e.message);
                    try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e2) {}
                }
                return;
            }
            
            // Игра идёт
            if (game.status === 'playing') {
                const isPlayerX = user.id === game.playerX.id;
                const isPlayerO = user.id === game.playerO?.id;
                
                if (!isPlayerX && !isPlayerO) {
                    try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Вы не участвуете в этой игре!' }); } catch(e) {}
                    return;
                }
                
                const expectedSymbol = game.currentTurn;
                const isCorrectTurn = (expectedSymbol === 'X' && isPlayerX) || (expectedSymbol === 'O' && isPlayerO);
                
                if (!isCorrectTurn) {
                    try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Сейчас не ваш ход!' }); } catch(e) {}
                    return;
                }
                
                if (game.board[row][col] !== TTT_EMPTY) {
                    try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Клетка уже занята!' }); } catch(e) {}
                    return;
                }
                
                game.board[row][col] = expectedSymbol === 'X' ? TTT_X : TTT_O;
                
                const winner = checkTTTWinner(game.board);
                
                if (winner) {
                    game.status = 'finished';
                    let resultText;
                    
                    if (winner === 'draw') {
                        resultText = `${EMOJI.joystick} <b>Крестики-нолики</b>\n\n${game.playerXName} (❌) vs ${game.playerOName} (⭕)\n\n${EMOJI.handshake} <b>Ничья!</b>`;
                    } else {
                        const winnerName = winner === TTT_X ? game.playerXName : game.playerOName;
                        resultText = `${EMOJI.joystick} <b>Крестики-нолики</b>\n\n${game.playerXName} (❌) vs ${game.playerOName} (⭕)\n\n${EMOJI.trophy} <b>${winnerName}</b> победил! ${winner}`;
                    }
                    
                    try {
                        await bot.editMessageText(resultText, {
                            inline_message_id: inlineMessageId,
                            parse_mode: 'HTML',
                            reply_markup: getTTTKeyboard(game.board, game.gameId)
                        });
                        await bot.answerCallbackQuery(callbackQuery.id, { text: winner === 'draw' ? 'Ничья!' : 'Победа!' });
                    } catch (e) {
                        console.error('Edit error:', e.message);
                    }
                    
                    tttGames.delete(inlineMessageId);
                    return;
                }
                
                game.currentTurn = game.currentTurn === 'X' ? 'O' : 'X';
                const nextPlayerName = game.currentTurn === 'X' ? game.playerXName : game.playerOName;
                const nextSymbol = game.currentTurn === 'X' ? '❌' : '⭕';
                
                try {
                    await bot.editMessageText(
                        `${EMOJI.joystick} <b>Крестики-нолики</b>\n\n${game.playerXName} (❌) vs ${game.playerOName} (⭕)\n\nХод: ${nextPlayerName} (${nextSymbol})`,
                        {
                            inline_message_id: inlineMessageId,
                            parse_mode: 'HTML',
                            reply_markup: getTTTKeyboard(game.board, game.gameId)
                        }
                    );
                    await bot.answerCallbackQuery(callbackQuery.id);
                } catch (e) {
                    console.error('Edit error:', e.message);
                }
                return;
            }
            
            if (game.status === 'finished') {
                try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Игра уже завершена!' }); } catch(e) {}
                return;
            }
        }
        
        // === ШАШКИ ===
        else if (data.startsWith('ch_')) {
            const parts = data.split('_');
            const row = parseInt(parts[parts.length - 2]);
            const col = parseInt(parts[parts.length - 1]);
            
            const game = checkersGames.get(inlineMessageId);
            
            if (!game) {
                try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Игра не найдена или истекла' }); } catch(e) {}
                return;
            }
            
            const userName = getUserDisplayName(user);
            
            // Ожидание второго игрока
            if (game.status === 'waiting') {
                if (user.id === game.playerWhite.id) {
                    try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ожидайте соперника!' }); } catch(e) {}
                    return;
                }
                
                game.playerBlack = user;
                game.playerBlackName = userName;
                game.status = 'playing';
                
                // Рандомно определяем кто ходит первым
                const whiteFirst = Math.random() < 0.5;
                game.currentTurn = whiteFirst ? 'white' : 'black';
                const firstPlayerName = whiteFirst ? game.playerWhiteName : game.playerBlackName;
                const firstSymbol = whiteFirst ? '⚪' : '⚫';
                
                try {
                    await bot.editMessageText(
                        `${EMOJI.joystick} <b>Шашки</b>\n\n${game.playerWhiteName} (⚪) vs ${game.playerBlackName} (⚫)\n\nПервый ход: ${firstPlayerName} (${firstSymbol})`,
                        {
                            inline_message_id: inlineMessageId,
                            parse_mode: 'HTML',
                            reply_markup: getCheckersKeyboard(game.board, game.gameId)
                        }
                    );
                    await bot.answerCallbackQuery(callbackQuery.id, { text: `Игра началась! Ход ${firstPlayerName}` });
                } catch (e) {
                    console.error('Edit error:', e.message);
                }
                return;
            }
            
            // Игра идёт
            if (game.status === 'playing') {
                const isWhite = user.id === game.playerWhite.id;
                const isBlack = user.id === game.playerBlack?.id;
                
                if (!isWhite && !isBlack) {
                    try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Вы не участвуете в этой игре!' }); } catch(e) {}
                    return;
                }
                
                const playerColor = isWhite ? 'white' : 'black';
                
                if (game.currentTurn !== playerColor) {
                    try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Сейчас не ваш ход!' }); } catch(e) {}
                    return;
                }
                
                const cell = game.board[row][col];
                
                // Если есть выбранная шашка
                if (game.selected) {
                    const { moves, captures } = getValidMoves(game.board, game.selected.r, game.selected.c, playerColor);
                    const mustCapture = hasAnyCaptures(game.board, playerColor);
                    
                    // Клик на свою шашку - меняем выбор
                    if (cell.type === 'piece' && cell.color === playerColor) {
                        game.selected = { r: row, c: col };
                        try {
                            await bot.editMessageReplyMarkup(getCheckersKeyboard(game.board, game.gameId, game.selected), {
                                inline_message_id: inlineMessageId
                            });
                            await bot.answerCallbackQuery(callbackQuery.id);
                        } catch (e) {}
                        return;
                    }
                    
                    // Проверяем ход
                    const capture = captures.find(c => c.r === row && c.c === col);
                    const move = moves.find(m => m.r === row && m.c === col);
                    
                    if (mustCapture && !capture) {
                        try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Нужно бить!' }); } catch(e) {}
                        return;
                    }
                    
                    if (capture) {
                        // Выполняем взятие
                        const piece = game.board[game.selected.r][game.selected.c];
                        game.board[row][col] = piece;
                        game.board[game.selected.r][game.selected.c] = { type: 'empty' };
                        game.board[capture.capturedR][capture.capturedC] = { type: 'empty' };
                        
                        // Проверяем превращение в дамку
                        if ((playerColor === 'white' && row === 0) || (playerColor === 'black' && row === 7)) {
                            game.board[row][col].isKing = true;
                        }
                        
                        // Проверяем можно ли бить ещё
                        const { captures: moreCaps } = getValidMoves(game.board, row, col, playerColor);
                        if (moreCaps.length > 0) {
                            game.selected = { r: row, c: col };
                            try {
                                await bot.editMessageReplyMarkup(getCheckersKeyboard(game.board, game.gameId, game.selected), {
                                    inline_message_id: inlineMessageId
                                });
                                await bot.answerCallbackQuery(callbackQuery.id, { text: 'Бей ещё!' });
                            } catch (e) {}
                            return;
                        }
                    } else if (move && !mustCapture) {
                        // Обычный ход
                        const piece = game.board[game.selected.r][game.selected.c];
                        game.board[row][col] = piece;
                        game.board[game.selected.r][game.selected.c] = { type: 'empty' };
                        
                        // Проверяем превращение в дамку
                        if ((playerColor === 'white' && row === 0) || (playerColor === 'black' && row === 7)) {
                            game.board[row][col].isKing = true;
                        }
                    } else {
                        try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Нельзя туда ходить!' }); } catch(e) {}
                        return;
                    }
                    
                    game.selected = null;
                    
                    // Меняем ход
                    const opponentColor = playerColor === 'white' ? 'black' : 'white';
                    
                    // Проверяем победу
                    const opponentPieces = countPieces(game.board, opponentColor);
                    const opponentCanMove = hasAnyMoves(game.board, opponentColor);
                    
                    if (opponentPieces === 0 || !opponentCanMove) {
                        game.status = 'finished';
                        const winnerName = playerColor === 'white' ? game.playerWhiteName : game.playerBlackName;
                        const winnerSymbol = playerColor === 'white' ? '⚪' : '⚫';
                        
                        // Обновляем статистику обоих игроков
                        await incrementCheckersGames(game.playerWhite.id);
                        await incrementCheckersGames(game.playerBlack.id);
                        
                        try {
                            await bot.editMessageText(
                                `${EMOJI.joystick} <b>Шашки</b>\n\n${game.playerWhiteName} (⚪) vs ${game.playerBlackName} (⚫)\n\n${EMOJI.trophy} <b>${winnerName}</b> победил! ${winnerSymbol}`,
                                {
                                    inline_message_id: inlineMessageId,
                                    parse_mode: 'HTML',
                                    reply_markup: getCheckersKeyboard(game.board, game.gameId)
                                }
                            );
                            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Победа!' });
                        } catch (e) {}
                        
                        checkersGames.delete(inlineMessageId);
                        return;
                    }
                    
                    game.currentTurn = opponentColor;
                    const nextName = opponentColor === 'white' ? game.playerWhiteName : game.playerBlackName;
                    const nextSymbol = opponentColor === 'white' ? '⚪' : '⚫';
                    
                    try {
                        await bot.editMessageText(
                            `${EMOJI.joystick} <b>Шашки</b>\n\n${game.playerWhiteName} (⚪) vs ${game.playerBlackName} (⚫)\n\nХод: ${nextName} (${nextSymbol})`,
                            {
                                inline_message_id: inlineMessageId,
                                parse_mode: 'HTML',
                                reply_markup: getCheckersKeyboard(game.board, game.gameId)
                            }
                        );
                        await bot.answerCallbackQuery(callbackQuery.id);
                    } catch (e) {}
                    return;
                } else {
                    // Выбираем шашку
                    if (cell.type === 'piece' && cell.color === playerColor) {
                        const { moves, captures } = getValidMoves(game.board, row, col, playerColor);
                        if (moves.length === 0 && captures.length === 0) {
                            try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Эта шашка не может ходить!' }); } catch(e) {}
                            return;
                        }
                        
                        // Проверяем обязательное взятие
                        const mustCapture = hasAnyCaptures(game.board, playerColor);
                        if (mustCapture && captures.length === 0) {
                            try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Выберите шашку которая может бить!' }); } catch(e) {}
                            return;
                        }
                        
                        game.selected = { r: row, c: col };
                        try {
                            await bot.editMessageReplyMarkup(getCheckersKeyboard(game.board, game.gameId, game.selected), {
                                inline_message_id: inlineMessageId
                            });
                            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Выберите куда ходить' });
                        } catch (e) {}
                    } else {
                        try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Выберите свою шашку!' }); } catch(e) {}
                    }
                    return;
                }
            }
            
            if (game.status === 'finished') {
                try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Игра уже завершена!' }); } catch(e) {}
                return;
            }
        }
        
        try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e) {}
        } catch (err) {
            console.error('Callback query error:', err.message);
            try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e) {}
        }
    });
    
    // Команда /stats - только для владельца
    bot.onText(/\/stats/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        // Проверка что это владелец
        if (String(userId) !== String(OWNER_ID)) {
            return; // Молча игнорируем для других
        }
        
        try {
            const now = new Date();
            const oneHourAgo = new Date(now - 60 * 60 * 1000);
            const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
            const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
            const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
            
            // Общее количество пользователей
            const { count: totalUsers } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true });
            
            // Уникальные пользователи за 1 час
            const { data: hourData } = await supabase
                .from('user_activity')
                .select('telegram_id')
                .gte('created_at', oneHourAgo.toISOString())
                .eq('activity_type', 'app_open');
            const uniqueHour = new Set(hourData?.map(r => r.telegram_id) || []).size;
            
            // Уникальные пользователи за 1 день
            const { data: dayData } = await supabase
                .from('user_activity')
                .select('telegram_id')
                .gte('created_at', oneDayAgo.toISOString())
                .eq('activity_type', 'app_open');
            const uniqueDay = new Set(dayData?.map(r => r.telegram_id) || []).size;
            
            // Уникальные пользователи за 1 неделю
            const { data: weekData } = await supabase
                .from('user_activity')
                .select('telegram_id')
                .gte('created_at', oneWeekAgo.toISOString())
                .eq('activity_type', 'app_open');
            const uniqueWeek = new Set(weekData?.map(r => r.telegram_id) || []).size;
            
            // Уникальные пользователи за 1 месяц
            const { data: monthData } = await supabase
                .from('user_activity')
                .select('telegram_id')
                .gte('created_at', oneMonthAgo.toISOString())
                .eq('activity_type', 'app_open');
            const uniqueMonth = new Set(monthData?.map(r => r.telegram_id) || []).size;
            
            // Новые пользователи за день (зарегистрированные в users)
            const { count: newUsersDay } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', oneDayAgo.toISOString());
            
            // Инлайн команды за день
            const { count: inlineDay } = await supabase
                .from('user_activity')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', oneDayAgo.toISOString())
                .eq('activity_type', 'inline_command');
            
            // Онлайн сейчас
            const onlineNow = onlineUsers.size;
            
            const statsMessage = 
                `<tg-emoji emoji-id="5258513401784573443">📊</tg-emoji> Общее количество пользователей: <b>${totalUsers || 0}</b>\n\n` +
                `Количество уникальных пользователей за:\n` +
                `<tg-emoji emoji-id="5260280853841321805">⏰</tg-emoji> 1 час: <b>${uniqueHour}</b>\n` +
                `<tg-emoji emoji-id="5258226313285607065">📅</tg-emoji> 1 день: <b>${uniqueDay}</b>\n` +
                `<tg-emoji emoji-id="5258123337149717894">📆</tg-emoji> 1 неделю: <b>${uniqueWeek}</b>\n` +
                `<tg-emoji emoji-id="5258071638628377037">🗓</tg-emoji> 1 месяц: <b>${uniqueMonth}</b>\n\n` +
                `<tg-emoji emoji-id="5258362837411045098">👤</tg-emoji> Новых пользователей за день: <b>${newUsersDay || 0}</b>\n` +
                `<tg-emoji emoji-id="5258093637450866522">🎮</tg-emoji> Инлайн команд за день: <b>${inlineDay || 0}</b>\n\n` +
                `<tg-emoji emoji-id="5323761960829862762">🟢</tg-emoji> Онлайн сейчас: <b>${onlineNow}</b>`;
            
            bot.sendMessage(chatId, statsMessage, { parse_mode: 'HTML' });
            
        } catch (e) {
            console.error('Stats error:', e);
            bot.sendMessage(chatId, 'Ошибка получения статистики: ' + e.message);
        }
    });
    
    // Команда /unban <id> - только для владельца
    bot.onText(/\/unban\s+(\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        if (String(msg.from.id) !== String(OWNER_ID)) return;
        
        const targetId = match[1];
        const strikes = cheatStrikes.get(targetId);
        const name = strikes ? `${strikes.username}${strikes.tgHandle ? ` (@${strikes.tgHandle})` : ''}` : targetId;
        bannedUsers.delete(targetId);
        cheatStrikes.delete(targetId);
        
        try {
            await supabase.from('banned_users').delete().eq('telegram_id', targetId);
        } catch(e) {}
        
        const checkEmoji = '<tg-emoji emoji-id="5427009714745517609">✅</tg-emoji>';
        bot.sendMessage(chatId, 
            `${checkEmoji} <b>Разбан</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `<b>${name}</b>\n` +
            `ID: <code>${targetId}</code>\n\n` +
            `Страйки сброшены, блокировка снята.`,
            { parse_mode: 'HTML' }
        );
    });
    
    // Команда /bans - список забаненных
    bot.onText(/\/bans/, async (msg) => {
        const chatId = msg.chat.id;
        if (String(msg.from.id) !== String(OWNER_ID)) return;
        
        const banEmoji = '<tg-emoji emoji-id="5240241223632954241">🚫</tg-emoji>';
        const checkEmoji = '<tg-emoji emoji-id="5427009714745517609">✅</tg-emoji>';
        
        if (bannedUsers.size === 0) {
            return bot.sendMessage(chatId, 
                `${checkEmoji} <b>Список блокировок пуст</b>\n\nНет заблокированных игроков.`,
                { parse_mode: 'HTML' }
            );
        }
        
        let entries = [];
        for (const id of bannedUsers) {
            const strikes = cheatStrikes.get(id);
            const name = strikes ? strikes.username : '—';
            const handle = strikes && strikes.tgHandle ? `@${strikes.tgHandle}` : '';
            const count = strikes ? strikes.count : '?';
            entries.push(`  <b>${name}</b>${handle ? ` (${handle})` : ''}\n  ID: <code>${id}</code> · ${count} страйков\n  → /unban ${id}`);
        }
        
        bot.sendMessage(chatId, 
            `${banEmoji} <b>Заблокированные игроки</b> (${bannedUsers.size})\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            entries.join('\n\n'),
            { parse_mode: 'HTML' }
        );
    });
    
    // Команда /start
    bot.onText(/\/start(.*)/, (msg, match) => {
        const chatId = msg.chat.id;
        const param = match[1].trim();
        
        // Build web_app URL with ref param if present
        let webAppUrl = WEBAPP_URL;
        if (param && param.startsWith('ref_')) {
            webAppUrl += `?tgWebAppStartParam=${param}`;
        }
        
        bot.sendMessage(chatId, 
            `${EMOJI.game} <b>Добро пожаловать в Spark Games!</b>\n` +
            `Играйте в крутые игры и соревнуйтесь с друзьями!\n\n` +
            `${EMOJI.chart} <b>Топы:</b> @spark_game_bot [игра]\n\n` +
            `${EMOJI.joystick} <b>Игры в чате:</b>\n` +
            `• @spark_game_bot крестики\n` +
            `• @spark_game_bot шашки\n\n` +
            `<blockquote>${EMOJI.play} <b>Открыть игры:</b> нажмите кнопку ниже</blockquote>`,
            { 
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🎮 Играть', web_app: { url: webAppUrl } }
                    ]]
                }
            }
        );
    });
    
    // Команда /top [игра] - с Premium эмодзи!
    bot.onText(/\/top(.*)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const gameName = match[1].trim().toLowerCase();
        
        if (!gameName) {
            bot.sendMessage(chatId,
                `${EMOJI.chart} <b>Доступные топы:</b>\n\n` +
                `• /top блок бласт\n` +
                `• /top сапёр\n` +
                `• /top башня\n` +
                `• /top судоку\n` +
                `• /top шашки\n` +
                `• /top вордли\n` +
                `• /top рефоводы`,
                { parse_mode: 'HTML' }
            );
            return;
        }
        
        let matchedGame = null;
        for (const [key, config] of Object.entries(GAME_CONFIG)) {
            if (gameName.includes(key) || key.includes(gameName)) {
                matchedGame = config;
                break;
            }
        }
        
        if (matchedGame) {
            try {
                let result;
                if (matchedGame.isReferral) {
                    result = await getTopForReferrals(userId, true);
                } else {
                    result = await getTopForGame(matchedGame, userId, true);
                }
                bot.sendMessage(chatId, result.text, { parse_mode: 'HTML' });
            } catch (e) {
                console.error('Top command error:', e);
                bot.sendMessage(chatId, 'Ошибка загрузки топа');
            }
        } else {
            bot.sendMessage(chatId, 'Игра не найдена. Напишите /top для списка.', { parse_mode: 'HTML' });
        }
    });
    
    console.log('Telegram Bot initialized with inline + premium emoji support');
} else {
    console.log('BOT_TOKEN not set, Telegram Bot disabled');
}

// Cleanup old activity records (older than 35 days) - runs every 24 hours
async function cleanupOldActivity() {
    try {
        const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
        const { error } = await supabase
            .from('user_activity')
            .delete()
            .lt('created_at', cutoff);
        
        if (error) {
            console.error('Cleanup error:', error);
        } else {
            console.log('Old activity records cleaned up');
        }
    } catch (e) {
        console.error('Cleanup failed:', e);
    }
}

// Run cleanup every 24 hours
setInterval(cleanupOldActivity, 24 * 60 * 60 * 1000);
// Also run once on startup (after 1 minute delay)
setTimeout(cleanupOldActivity, 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Glass API v39.1 (secured) running on port ${PORT}`));