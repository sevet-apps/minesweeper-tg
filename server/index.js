require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http'); 
const { Server } = require("socket.io"); 
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const path = require('path');
const { verifyTelegramInitData } = require('./telegram-init-data');
const {
    createRichInlineArticle,
    escapeRichHtml,
    richActionHtml,
    richCheckersHtml,
    richGameHtml,
    richMessageContent,
} = require('./telegram-rich-messages');
const { createCheckpoint: createBBCheckpoint, readCheckpoint: readBBCheckpoint } = require('./block-blast-checkpoint');
const {
    advanceSeed: advanceBBHandSeed,
    generateHand: generateBBHand,
    repairLockedShapes: repairBBLockedShapes,
} = require('./block-blast-hand');
const MonopolyEngine = require('./monopoly-engine');
const MonopolyV2 = require('./monopoly-v2');   // новая монополия (namespace /mono2)
const { makeTitleService } = require('./player-titles');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
MonopolyV2.attach(io);                        // комнаты и матчи новой монополии

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const titleService = makeTitleService({ supabase });

// Telegram Bot Token for subscription check
const BOT_TOKEN = process.env.BOT_TOKEN;
const GAME_SESSION_SECRET = process.env.GAME_SESSION_SECRET || BOT_TOKEN;
const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL || '@spark_game_news';
const OWNER_ID = '1482228376'; // Твой Telegram ID

// ============================
// TOURNAMENTS: shared helpers
// ============================
const { hasPartnerVpnSubscription } = require('./partner-vpn');
const { registerAdminBot } = require('./admin-bot');

// Cache of currently-active tournaments PER KIND (bb / referral).
const _activeCache = new Map();
const ACTIVE_TTL_MS = 30_000;

async function getActiveTournament(kind) {
    const cached = _activeCache.get(kind);
    if (cached && Date.now() - cached.ts < ACTIVE_TTL_MS) return cached.data;

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('kind', kind)
        .eq('status', 'active')
        .lte('start_at', nowIso)
        .gte('end_at', nowIso)
        .order('start_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.warn(`[tournaments] active fetch error (${kind}):`, error.message);
        return null;
    }
    _activeCache.set(kind, { data: data || null, ts: Date.now() });
    return data || null;
}

function invalidateActiveTournamentCache(kind) {
    if (kind) _activeCache.delete(kind);
    else _activeCache.clear();
}

// Auto-transition: tournaments whose end_at passed should move from
// 'active' -> 'ended' (admin still needs to take the snapshot to archive).
setInterval(async () => {
    try {
        const nowIso = new Date().toISOString();
        await supabase
            .from('tournaments')
            .update({ status: 'ended' })
            .eq('status', 'active')
            .lt('end_at', nowIso);
        invalidateActiveTournamentCache();
    } catch (e) {
        console.warn('[tournaments] auto-transition error:', e.message);
    }
}, 5 * 60_000);

// ============================
// SECURITY: Telegram initData validation
// ============================
function validateInitData(initDataString) {
    return verifyTelegramInitData(initDataString, BOT_TOKEN);
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

/** Нативное окно Telegram для отправки приглашения. Prepared messages
    сохраняют кнопку Mini App и custom emoji, чего обычная share/url-ссылка
    сделать не умеет. */
app.post('/prepare-share', authMiddleware, async (req, res) => {
    if (!BOT_TOKEN) return res.status(503).json({ error: 'Bot is unavailable' });
    const kind = req.body && req.body.kind;
    const userId = Number(req.telegramUser.id);
    let text, url, title, entities, roomId;
    if (kind === 'referral') {
        url = `https://t.me/spark_game_bot/spark?startapp=ref_${userId}`;
        text = `✨ Присоединяйся к Spark! Играй в крутые игры и соревнуйся в топах!\n${url}`;
        title = 'Приглашение в Spark';
        entities = [{ type: 'custom_emoji', offset: 0, length: 2,
            custom_emoji_id: '5271604874419647061' }];
    } else if (kind === 'monopoly') {
        roomId = String(req.body.room_id || '').toUpperCase();
        if (!/^[A-Z0-9]{4,8}$/.test(roomId))
            return res.status(400).json({ error: 'Invalid room' });
        url = `https://t.me/spark_game_bot/sparkapp?startapp=mono_${roomId}`;
        text = `🎲 Заходи в мою комнату в Монополии Spark! Код комнаты: ${roomId}`;
        title = 'Приглашение в Монополию';
        entities = [];
    } else {
        return res.status(400).json({ error: 'Unknown share type' });
    }

    const actionText = kind === 'monopoly' ? '🎲 Войти в комнату' : 'Открыть Spark';
    const richText = kind === 'monopoly'
        ? `🎲 <b>Монополия Spark</b>\nКомната <code>${roomId}</code> уже ждёт игроков.`
        : '✨ <b>Spark Games</b>\nИграй, соревнуйся с друзьями и поднимайся в топах.';
    const prepared = createRichInlineArticle({
        id: crypto.randomBytes(12).toString('hex'),
        title,
        description: kind === 'monopoly' ? `Комната ${roomId}` : 'Приглашение в Spark Games',
        thumbnailUrl: kind === 'monopoly'
            ? 'https://sevet-apps.github.io/minesweeper-tg/assets/game-icons/monopoly.png'
            : 'https://sevet-apps.github.io/minesweeper-tg/assets/spark-logo.png?v=20260823',
        richHtml: richActionHtml(richText, {
            text: actionText,
            url,
            // A green button keeps the referral action readable in Telegram
            // themes where a primary button becomes white-on-white.
            style: kind === 'referral' ? 'success' : 'primary',
        }),
        fallbackText: text,
        fallbackReplyMarkup: { inline_keyboard: [[{ text: actionText, url }]] },
    });
    prepared.fallback.input_message_content.entities = entities;
    if (entities.length) delete prepared.fallback.input_message_content.parse_mode;
    const savePrepared = (result) => fetch(`https://api.telegram.org/bot${BOT_TOKEN}/savePreparedInlineMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: userId, result,
            allow_user_chats: true, allow_bot_chats: false,
            allow_group_chats: true, allow_channel_chats: false,
        }),
    });
    try {
        let response = await savePrepared(prepared.rich);
        let payload = await response.json();
        /* Rich Messages требуют свежего клиента и Bot API 10.3. Если новый
           формат временно недоступен, сохраняем прежний HTML-вариант. */
        if (!payload.ok) {
            response = await savePrepared(prepared.fallback);
            payload = await response.json();
        }
        /* Некоторые аккаунты не могут отправлять custom emoji. */
        if (!payload.ok && prepared.fallback.input_message_content.entities.length) {
            prepared.fallback.input_message_content.entities = [];
            response = await savePrepared(prepared.fallback);
            payload = await response.json();
        }
        if (!payload.ok) throw new Error(payload.description || 'Telegram rejected prepared message');
        res.json({ id: payload.result.id, fallback_url: url, fallback_text: text.split('\n')[0] });
    } catch (error) {
        console.error('[share] prepare:', error.message);
        res.status(502).json({ error: 'Could not prepare share', fallback_url: url });
    }
});

// ============================
// SECURITY: Rate limiting (in-memory)
// ============================
const rateLimitMap = new Map(); // key -> { count, resetTime }
const RATE_LIMITS = {
    'save-stat': { max: 30, windowMs: 60000 },      // 30 saves per minute
    'playtime': { max: 60, windowMs: 60000 },       // visibility/open/close syncs
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
    'bb_best_score':      { min: 1, max: 1000000000 },
    'bb_total_games':     { min: 1, max: 10000000 },
    'bb_tournament_score':{ min: 1, max: 1500000000 },
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

// Time-based game types that allow float scores (seconds with ms precision).
// Older clients initialized these columns with 9999. It was a UI sentinel,
// never a completed game, so it must not participate in ranks or profiles.
const TIME_BASED_TYPES = ['saper_best_6', 'saper_best_8', 'saper_best_10', 'saper_best_15'];
const LEGACY_MINESWEEPER_TIME_SENTINEL = 9999;

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
const completedStatSubmissions = new Map(); // signed completion token -> last successful response
const COMPLETED_STAT_TTL_MS = 10 * 60 * 1000;

// Minimum game durations in ms (impossible to play faster)
const MIN_GAME_DURATION = {
    'bb_best_score': 5000,       // BB game takes at least 5 sec
    'bb_tournament_score': 5000, // Tournament BB — same minimum
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
function sessionTokenSignature(userId, gameType, startTime) {
    const data = `${userId}:${gameType}:${startTime}`;
    return crypto.createHmac('sha256', GAME_SESSION_SECRET || 'fallback-secret')
        .update(data).digest('hex').substring(0, 32);
}

function createSessionToken(userId, gameType, startTime) {
    return `${startTime}.${sessionTokenSignature(userId, gameType, startTime)}`;
}

// Minesweeper has no server-authoritative board yet, but its signed start
// time can still survive a Render restart. Previously every in-memory session
// disappeared during a deploy and a legitimate completed board was rejected.
function readSignedSessionStart(userId, gameType, token) {
    if (typeof token !== 'string') return null;
    const separator = token.indexOf('.');
    if (separator <= 0 || token.indexOf('.', separator + 1) !== -1) return null;
    const startTimeText = token.slice(0, separator);
    if (!/^\d{13}$/.test(startTimeText)) return null;
    const startTime = Number(startTimeText);
    const now = Date.now();
    if (!Number.isSafeInteger(startTime) || startTime > now + 30_000 || now - startTime > 24 * 60 * 60 * 1000) {
        return null;
    }
    const expected = createSessionToken(userId, gameType, startTime);
    const actualBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
        return null;
    }
    return startTime;
}

// Start game session
app.post('/game-session/start', authMiddleware, (req, res) => {
    const user = req.telegramUser;
    const userId = String(user.id);
    const { game_type, new_game = false } = req.body;
    
    if (!checkRateLimit(userId, 'save-stat')) {
        return res.status(429).json({ error: 'Too many requests' });
    }
    
    const allowedTypes = Object.keys(SCORE_LIMITS);
    if (!allowedTypes.includes(game_type)) {
        return res.status(400).json({ error: 'Invalid game type' });
    }
    
    const key = `${userId}:${game_type}`;
    const current = gameSessions.get(key);
    if (game_type === 'bb_best_score' && current && !new_game) {
        bbRepairLegacyShapes(current);
        return res.json(bbSessionResponse(current, userId, { resumed: true }));
    }

    const startTime = Date.now();
    const token = createSessionToken(userId, game_type, startTime);
    
    const session = {
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
            bbMaxCombo: 0,
            bbMaxLines: 0,
            bbCleanBoard: false,
            bbRevision: 0,
            bbShapes: [null, null, null],
            bbNextHandSeed: null,
            bbEnded: false,
            bbRestorable: !new_game,
            bbMoveResults: new Map()
        } : {})
    };
    if (game_type === 'bb_best_score') {
        bbGenerateShapes(session, bbFreshHandSeed());
        session.bbNextHandSeed = bbFreshHandSeed();
    }
    gameSessions.set(key, session);
    
    // Cleanup old sessions (older than 24h)
    const now = Date.now();
    for (const [k, v] of gameSessions) {
        if (now - v.startTime > 86400000) gameSessions.delete(k);
    }
    
    res.json(game_type === 'bb_best_score'
        ? bbSessionResponse(session, userId, { resumed: false })
        : { session_token: token });
});

// ============================
// BB Server-Side Game Simulation
// ============================
const BB_ROWS = 8, BB_COLS = 8;

// ===================== BLOCK BLAST SCORING CONFIG (server) =====================
// ДОЛЖНО совпадать с BB_SCORING на клиенте (index.html).
const BB_SCORING = {
    BASE_LINE_POINTS: 20,
    COMBO_TIER_1_MAX: 5,
    COMBO_TIER_2_MAX: 10,
    COMBO_MULT_TIER_1: 1.0,
    COMBO_MULT_TIER_2: 1.5,
    COMBO_MULT_CAP: 2.0,
    SIMULTANEOUS_MULT: { 1: 1.0, 2: 1.5, 3: 2.2, 4: 3.0, 5: 4.0 },
    SIMULTANEOUS_MULT_DEFAULT: 4.0,
    COMBO_BUFFER_MOVES: 3
};
function bbComboMultiplier(N) {
    if (N <= BB_SCORING.COMBO_TIER_1_MAX) return BB_SCORING.COMBO_MULT_TIER_1;
    if (N <= BB_SCORING.COMBO_TIER_2_MAX) return BB_SCORING.COMBO_MULT_TIER_2;
    return BB_SCORING.COMBO_MULT_CAP;
}
function bbSimultaneousMultiplier(k) {
    return BB_SCORING.SIMULTANEOUS_MULT[k] || BB_SCORING.SIMULTANEOUS_MULT_DEFAULT;
}
function bbLineScore(k, N) {
    return Math.round(k * BB_SCORING.BASE_LINE_POINTS * N * bbComboMultiplier(N) * bbSimultaneousMultiplier(k));
}
// ==============================================================================

// All valid shapes (serialized for fast lookup)
const BB_VALID_SHAPES = new Set();
const BB_SHAPE_LIST = [];
const BB_COLORS = ['bb-c-1', 'bb-c-2', 'bb-c-3', 'bb-c-4', 'bb-c-5', 'bb-c-6', 'bb-c-7'];
function initValidShapes() {
    const SHAPES = [
        [[1]],[[1,1]],[[1],[1]],[[1,1,1]],[[1],[1],[1]],
        [[1,1,1,1]],[[1],[1],[1],[1]],[[1,1,1,1,1]],[[1],[1],[1],[1],[1]],
        [[1,1],[1,1]],[[1,1,1],[1,1,1],[1,1,1]],[[1,1],[1,1],[1,1]],[[1,1,1],[1,1,1]],
        [[1,0],[1,0],[1,1]],[[1,1],[0,1],[0,1]],[[1,1,1],[1,0,0]],[[0,0,1],[1,1,1]],
        [[0,1],[0,1],[1,1]],[[1,1],[1,0],[1,0]],[[1,0,0],[1,1,1]],[[1,1,1],[0,0,1]],
        [[1,1],[1,0]],[[1,1],[0,1]],[[1,0],[1,1]],[[0,1],[1,1]],
        [[1,1,1],[1,0,0],[1,0,0]],[[1,1,1],[0,0,1],[0,0,1]],[[1,0,0],[1,0,0],[1,1,1]],[[0,0,1],[0,0,1],[1,1,1]],
        [[0,1,0],[1,1,1]],[[1,1,1],[0,1,0]],[[0,1],[1,1],[0,1]],[[1,0],[1,1],[1,0]],
        [[1,1,0],[0,1,1]],[[0,1],[1,1],[1,0]],[[0,1,1],[1,1,0]],[[1,0],[1,1],[0,1]],
        [[0,1],[1,0]],[[1,0],[0,1]],[[0,0,1],[0,1,0],[1,0,0]],[[1,0,0],[0,1,0],[0,0,1]],
        // Hard shapes
        [[1,0,1],[1,1,1]],[[1,1],[1,0],[1,1]],[[1,1,1],[1,0,1]],[[1,1],[0,1],[1,1]],
        [[0,1],[0,1],[1,0],[1,0]],[[1,0],[1,0],[0,1],[0,1]],
        [[0,1,0],[0,1,0],[1,1,1]],[[1,0,0],[1,1,1],[1,0,0]],[[1,1,1],[0,1,0],[0,1,0]],[[0,0,1],[1,1,1],[0,0,1]],
        [[1,1,0],[0,1,1],[0,1,0]],[[0,1],[0,1],[1,0]],[[1,0],[1,0],[0,1]],[[0,1],[1,0],[1,0]],[[1,0],[0,1],[0,1]]
    ];
    for (const s of SHAPES) {
        BB_VALID_SHAPES.add(JSON.stringify(s));
        BB_SHAPE_LIST.push(s);
    }
}
initValidShapes();

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

function bbFreshHandSeed() {
    return crypto.randomBytes(4).readUInt32LE(0);
}

function bbGenerateShapes(session, seed) {
    session.bbShapes = generateBBHand({
        grid: session.bbGrid,
        score: session.bbScore,
        shapeList: BB_SHAPE_LIST,
        baseShapeCount: 41,
        colors: BB_COLORS,
        seed,
    });
}

/**
 * Checkpoints created by the first server-side hand implementation briefly
 * unlocked every hard shape at 10,000 points.  Those checkpoints are signed,
 * so they are authentic, but their remaining hand can violate the restored
 * 100,000,000 + 10,000,000-per-shape progression.  Replace only the illegal
 * occupied slots: consumed (null) slots stay consumed and a resume can never
 * turn one remaining piece back into a fresh hand of three.
 */
function bbRepairLegacyShapes(session) {
    if (!Array.isArray(session.bbShapes) || session.bbShapes.length !== 3) return false;
    const seed = Number.isInteger(session.bbNextHandSeed)
        ? session.bbNextHandSeed >>> 0
        : bbFreshHandSeed();
    const repaired = repairBBLockedShapes({
        shapes: session.bbShapes,
        grid: session.bbGrid,
        score: session.bbScore,
        shapeList: BB_SHAPE_LIST,
        baseShapeCount: 41,
        colors: BB_COLORS,
        seed,
    });
    if (!repaired.repaired) return false;
    session.bbShapes = repaired.shapes;
    session.bbNextHandSeed = advanceBBHandSeed(seed);
    return true;
}

function bbPublicState(session) {
    return {
        server_score: session.bbScore,
        server_grid: session.bbGrid,
        combo: session.bbCombo,
        comboBuffer: session.bbComboBuffer,
        revision: session.bbRevision || 0,
        shapes: session.bbShapes,
        next_hand_seed: session.bbNextHandSeed,
        finished: !!session.bbEnded,
    };
}

function bbSessionResponse(session, userId, extra = {}) {
    return {
        ok: true,
        session_token: session.token,
        bb_checkpoint: createBBCheckpoint(session, userId, GAME_SESSION_SECRET),
        ...bbPublicState(session),
        ...extra,
    };
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
        // Комбо растёт на число закрытых линий за ход; буфер держит серию 3 хода
        session.bbCombo += totalCleared;
        session.bbMaxCombo = Math.max(session.bbMaxCombo || 0, session.bbCombo);
        session.bbMaxLines = Math.max(session.bbMaxLines || 0, totalCleared);
        session.bbComboBuffer = BB_SCORING.COMBO_BUFFER_MOVES;
        
        // Clear lines
        rowsToClear.forEach(row => { for (let c2 = 0; c2 < BB_COLS; c2++) grid[row][c2] = 0; });
        colsToClear.forEach(col => { for (let r2 = 0; r2 < BB_ROWS; r2++) grid[r2][col] = 0; });
        
        // Score: round( k * BASE * N * M(N) * S(k) ), N = combo после увеличения
        session.bbScore += bbLineScore(totalCleared, session.bbCombo);
        
        // Check all-clear bonus
        let allClear = true;
        for (let row = 0; row < BB_ROWS && allClear; row++) {
            for (let col = 0; col < BB_COLS; col++) {
                if (grid[row][col] !== 0) { allClear = false; break; }
            }
        }
        if (allClear) {
            session.bbCleanBoard = true;
            const bonus = 500 * (session.bbCombo > 0 ? session.bbCombo : 1);
            session.bbScore += bonus;
        }
    } else {
        // Серия держится буфером: комбо гаснет через COMBO_BUFFER_MOVES ходов без линий
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
        return res.json({ ok: false, reason: 'invalid_session' });
    }
    if (game_type === 'bb_best_score' && session.bbEnded) {
        return res.json({ ok: false, reason: 'session_finished', ...bbPublicState(session) });
    }

    // A response may be lost after the move was already accepted. Return the
    // cached result before anti-spam checks so a safe retry is truly idempotent.
    if (game_type === 'bb_best_score' && move_data && typeof move_data === 'object') {
        const retryId = move_data.move_id;
        if (typeof retryId === 'string' && session.bbMoveResults && session.bbMoveResults.has(retryId)) {
            return res.json(session.bbMoveResults.get(retryId));
        }
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
        const { matrix, r, c, move_id, revision, slot } = move_data;

        if (typeof move_id !== 'string' || move_id.length < 6 || move_id.length > 80) {
            return res.json({ ok: false, reason: 'invalid_move_id' });
        }
        if (!session.bbMoveResults) session.bbMoveResults = new Map();
        const previousResult = session.bbMoveResults.get(move_id);
        if (previousResult) return res.json(previousResult);

        if (!Number.isInteger(revision) || revision !== session.bbRevision) {
            return res.json({
                ok: false,
                reason: 'stale_session',
                ...bbPublicState(session),
                bb_checkpoint: createBBCheckpoint(session, userId, GAME_SESSION_SECRET),
            });
        }
        if (!Number.isInteger(slot) || slot < 0 || slot > 2) {
            return res.json({ ok: false, reason: 'invalid_slot' });
        }
        
        // Validate matrix format
        if (!Array.isArray(matrix) || matrix.length === 0 || matrix.length > 5) {
            return res.json({ ok: false, reason: 'invalid_matrix' });
        }
        const colLen = matrix[0].length;
        if (!matrix.every(row => Array.isArray(row) && row.length === colLen && row.length <= 5 && row.every(v => v === 0 || v === 1))) {
            return res.json({ ok: false, reason: 'invalid_matrix' });
        }
        
        // Validate shape exists in game
        if (!BB_VALID_SHAPES.has(JSON.stringify(matrix))) {
            return res.json({ ok: false, reason: 'invalid_shape' });
        }
        const offered = session.bbShapes && session.bbShapes[slot];
        if (!offered || JSON.stringify(offered.matrix) !== JSON.stringify(matrix)) {
            return res.json({ ok: false, reason: 'shape_not_offered', ...bbPublicState(session) });
        }
        
        // Validate position
        if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= BB_ROWS || c >= BB_COLS) {
            return res.json({ ok: false, reason: 'invalid_position' });
        }
        
        // Check placement validity on server grid
        if (!bbCanPlace(session.bbGrid, matrix, r, c)) {
            session.suspiciousCount = (session.suspiciousCount || 0) + 1;
            console.log(`BB rejected placement: user=${userId}, r=${r}, c=${c}, score=${session.bbScore}`);
            return res.json({ ok: false, reason: 'occupied' });
        }
        
        // Simulate placement and scoring
        bbPlaceAndScore(session, matrix, r, c);
        // Once the first authoritative move is accepted, an older signed
        // checkpoint must never be allowed to roll this live branch back.
        session.bbRestorable = false;
        session.bbShapes[slot] = null;
        if (session.bbShapes.every(shape => shape === null)) {
            const handSeed = session.bbNextHandSeed;
            bbGenerateShapes(session, handSeed);
            session.bbNextHandSeed = advanceBBHandSeed(handSeed);
        }
        session.moveCount++;
        session.bbRevision++;
        session.lastMoveTime = now;
        
        const result = bbSessionResponse(session, userId);
        session.bbMoveResults.set(move_id, result);
        if (session.bbMoveResults.size > 128) {
            session.bbMoveResults.delete(session.bbMoveResults.keys().next().value);
        }
        return res.json(result);
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

// Resume BB only from a server-signed checkpoint. Client grid/score are untrusted.
app.post('/game-session/bb-sync', authMiddleware, (req, res) => {
    const user = req.telegramUser;
    const userId = String(user.id);
    const { session_token, checkpoint } = req.body;
    
    const key = `${userId}:bb_best_score`;
    const session = gameSessions.get(key);
    
    if (!session || session.token !== session_token) {
        return res.json({ ok: false, reason: 'invalid_session' });
    }
    
    const restored = readBBCheckpoint(checkpoint, userId, GAME_SESSION_SECRET);
    if (!restored) return res.json({ ok: false, reason: 'invalid_checkpoint' });

    // A checkpoint may restore a session only immediately after a server
    // restart. It must never roll back an already active game on another device.
    if (!session.bbRestorable) {
        return res.json({
            ok: false,
            reason: 'stale_session',
            ...bbPublicState(session),
            bb_checkpoint: createBBCheckpoint(session, userId, GAME_SESSION_SECRET),
        });
    }

    session.bbGrid = restored.bbGrid;
    session.bbScore = restored.bbScore;
    session.bbCombo = restored.bbCombo;
    session.bbComboBuffer = restored.bbComboBuffer;
    session.bbMaxCombo = restored.bbMaxCombo || 0;
    session.bbMaxLines = restored.bbMaxLines || 0;
    session.bbCleanBoard = !!restored.bbCleanBoard;
    session.moveCount = restored.moveCount;
    session.bbRevision = restored.bbRevision;
    session.bbShapes = restored.bbShapes;
    session.bbNextHandSeed = restored.bbNextHandSeed ?? bbFreshHandSeed();
    if (!Array.isArray(session.bbShapes) || session.bbShapes.length !== 3 || session.bbShapes.every(shape => shape === null)) {
        bbGenerateShapes(session, session.bbNextHandSeed);
        session.bbNextHandSeed = advanceBBHandSeed(session.bbNextHandSeed);
    } else {
        bbRepairLegacyShapes(session);
    }
    session.startTime = restored.startTime;
    session.lastMoveTime = Date.now();
    session.bbMoveResults = new Map();
    session.bbRestorable = false;
    console.log(`BB session restored for user ${userId}: score=${session.bbScore}, moves=${session.moveCount}`);
    res.json(bbSessionResponse(session, userId));
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

/* ---------- рейтинг монополии ----------
   Модуль сам считает очки и титулы, а проверки подозрительных серий
   присылает сюда — отсюда они уходят владельцу с кнопками. */
const MonopolyRating = require('./monopoly-rating');
const monoRating = MonopolyRating.makeRating({
    supabase,
    notify: (text, keyboard) => notifyOwner(text, keyboard),
});
MonopolyV2.setRating(monoRating);
MonopolyV2.setTitleService(titleService);

async function notifyOwner(message, replyMarkup) {
    if (!BOT_TOKEN) return;
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: OWNER_ID,
                text: message,
                parse_mode: 'HTML',
                ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
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

const PLAYTIME_FIELDS = Object.freeze({
    bb: 'playtime_bb_ms',
    saper: 'playtime_saper_ms',
    tower: 'playtime_tower_ms',
    sudoku: 'playtime_sudoku_ms',
    checkers: 'playtime_checkers_ms',
    wordle: 'playtime_wordle_ms',
    monopoly: 'playtime_monopoly_ms',
});
const PLAYTIME_ACTIVITY_PREFIX = 'playtime:';
const MAX_PROFILE_PLAYTIME_MS = 10 * 365 * 24 * 60 * 60 * 1000;

function normalizePlaytimeTotals(source) {
    const input = source && typeof source === 'object' ? source : {};
    return Object.keys(PLAYTIME_FIELDS).reduce((totals, game) => {
        const value = Number(input[game]);
        totals[game] = Number.isFinite(value)
            ? Math.max(0, Math.min(MAX_PROFILE_PLAYTIME_MS, Math.trunc(value)))
            : 0;
        return totals;
    }, {});
}

function profilePlaytime(row) {
    return Object.entries(PLAYTIME_FIELDS).reduce((totals, [game, field]) => {
        totals[game] = Math.max(0, Number(row && row[field]) || 0);
        return totals;
    }, {});
}

function parsePlaytimeActivity(rows) {
    const totals = normalizePlaytimeTotals({});
    for (const row of rows || []) {
        const match = String(row.activity_type || '').match(/^playtime:(bb|saper|tower|sudoku|checkers|wordle|monopoly):(\d+)$/);
        if (!match) continue;
        const value = Math.min(MAX_PROFILE_PLAYTIME_MS, Number(match[2]) || 0);
        totals[match[1]] = Math.max(totals[match[1]], value);
    }
    return totals;
}

async function readPlaytimeActivity(userId) {
    const { data, error } = await supabase.from('user_activity')
        .select('activity_type')
        .eq('telegram_id', userId)
        .like('activity_type', `${PLAYTIME_ACTIVITY_PREFIX}%`);
    if (error) throw error;
    return parsePlaytimeActivity(data);
}

async function persistPlaytimeActivity(userId, incoming, stored) {
    const totals = { ...stored };
    for (const game of Object.keys(PLAYTIME_FIELDS)) {
        if (incoming[game] <= (totals[game] || 0)) continue;
        const value = incoming[game];
        const { error } = await supabase.from('user_activity').insert({
            telegram_id: userId,
            activity_type: `${PLAYTIME_ACTIVITY_PREFIX}${game}:${value}`,
        });
        if (error) throw error;
        totals[game] = value;
    }
    return totals;
}

function isMissingPlaytimeSchema(error) {
    const message = String(error && error.message || '');
    return error && (error.code === '42703' || error.code === 'PGRST204' || /playtime_\w+_ms/i.test(message));
}

app.post('/api/playtime/sync', authMiddleware, async (req, res) => {
    const user = req.telegramUser;
    const userId = String(user.id);
    if (!checkRateLimit(userId, 'playtime')) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    const totals = normalizePlaytimeTotals(req.body && req.body.totals);
    let activityTotals = normalizePlaytimeTotals({});
    try {
        try {
            activityTotals = await readPlaytimeActivity(userId);
            Object.keys(totals).forEach(game => {
                totals[game] = Math.max(totals[game], activityTotals[game] || 0);
            });
        } catch (error) {
            console.warn('[playtime] compatibility read:', error.message);
        }
        const { error: ensureError } = await supabase.from('users').upsert({
            telegram_id: userId,
            username: tgDisplayName(user),
            photo_url: user.photo_url || '',
        }, { onConflict: 'telegram_id', ignoreDuplicates: true });
        if (ensureError) throw ensureError;

        // Every counter is a monotonic absolute total. Retried keepalive
        // requests are therefore idempotent and can never roll a device back.
        for (const [game, field] of Object.entries(PLAYTIME_FIELDS)) {
            const incoming = totals[game];
            if (incoming <= 0) continue;
            const { error } = await supabase.from('users')
                .update({ [field]: incoming })
                .eq('telegram_id', userId)
                .lt(field, incoming);
            if (error) throw error;
        }

        const fields = Object.values(PLAYTIME_FIELDS).join(',');
        const { data, error } = await supabase.from('users')
            .select(fields)
            .eq('telegram_id', userId)
            .single();
        if (error) throw error;
        const playtime = profilePlaytime(data);
        try { await titleService.record(userId, { type: 'playtime', totals: playtime }); }
        catch (titleError) { console.warn('[titles] playtime:', titleError.message); }
        return res.json({ playtime });
    } catch (error) {
        if (isMissingPlaytimeSchema(error)) {
            try {
                const playtime = await persistPlaytimeActivity(userId, totals, activityTotals);
                try { await titleService.record(userId, { type: 'playtime', totals: playtime }); }
                catch (titleError) { console.warn('[titles] playtime compatibility:', titleError.message); }
                return res.json({ playtime, storage: 'supabase-compatibility' });
            } catch (fallbackError) {
                console.error('[playtime] compatibility sync:', fallbackError.message);
            }
        }
        console.error('[playtime] sync:', error.message);
        return res.status(500).json({ error: 'Could not sync playtime' });
    }
});

app.get('/api/titles', authMiddleware, async (req, res) => {
    try {
        const result = await titleService.collection(String(req.telegramUser.id), { registerOpen: true });
        res.json(result);
    } catch (error) {
        console.error('[titles] collection:', error.message);
        res.status(500).json({ error: 'Could not load titles' });
    }
});

app.post('/api/titles/select', authMiddleware, async (req, res) => {
    try {
        const titleId = await titleService.select(String(req.telegramUser.id), req.body && req.body.title_id);
        res.json({ ok: true, selected_title_id: titleId });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/titles/acknowledge', authMiddleware, async (req, res) => {
    try {
        await titleService.acknowledge(String(req.telegramUser.id), req.body && req.body.title_ids);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Could not acknowledge titles' });
    }
});

// Losses only reset a streak and can never grant a title. The signed session
// prevents another account from resetting somebody else's progress.
app.post('/api/titles/game-event', authMiddleware, async (req, res) => {
    const userId = String(req.telegramUser.id);
    const kind = String(req.body && req.body.kind || '');
    const token = String(req.body && req.body.session_token || '');
    let event = null, sessionType = null;
    if (kind === 'saper_loss') {
        const mode = Number(req.body && req.body.mode);
        if (![6,8,10,15].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
        sessionType = `saper_best_${mode}`;
        event = { type: 'saper_loss', game: 'saper', eventId: `${token}:loss`, context: { mode } };
    } else if (kind === 'wordle_loss') {
        sessionType = 'wordle_wins';
        event = { type: 'wordle_loss', game: 'wordle', eventId: `${token}:loss` };
    } else if (kind === 'sudoku_loss') {
        sessionType = 'sudoku_wins';
        event = { type: 'sudoku_loss', game: 'sudoku', eventId: `${token}:loss` };
    } else return res.status(400).json({ error: 'Invalid event' });
    const session = gameSessions.get(`${userId}:${sessionType}`);
    const signed = readSignedSessionStart(userId, sessionType, token);
    if ((!session || session.token !== token) && signed === null) return res.status(400).json({ error: 'Invalid session' });
    try {
        const newTitles = await titleService.record(userId, event);
        res.json({ ok: true, new_titles: newTitles });
    } catch (error) {
        res.status(500).json({ error: 'Could not record event' });
    }
});

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
    /* Repair legacy rows produced before inline/online checkers shared one
       counter. A player can never have more wins than completed games. */
    const wins = Number(data.checkers_wins_pve) || 0;
    const total = Number(data.checkers_total) || 0;
    if (wins > total) {
        data.checkers_total = wins;
        const repaired = await supabase.from('users')
            .update({ checkers_total: wins }).eq('telegram_id', id);
        if (repaired.error) console.error('[checkers] profile repair:', repaired.error.message);
    }
    TIME_BASED_TYPES.forEach((category) => {
        const value = Number(data[category]);
        if (!Number.isFinite(value) || value <= 0 || value >= LEGACY_MINESWEEPER_TIME_SENTINEL) {
            data[category] = null;
        }
    });
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
    'checkers_wins_pve': { ru: 'Шашки', category: 'Победы' },
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

async function getLeaderboardSnapshot(gameType) {
    if (!GAME_NAMES[gameType]) return [];
    const isTime = TIME_BASED_TYPES.includes(gameType);
    let query = supabase
        .from('users')
        .select(`telegram_id, username, ${gameType}`)
        .not(gameType, 'is', null)
        .gt(gameType, 0);
    if (isTime) query = query.lt(gameType, LEGACY_MINESWEEPER_TIME_SENTINEL);
    const { data, error } = await query
        .order(gameType, { ascending: isTime })
        .limit(10);
    if (error) throw new Error(`Leaderboard read error: ${error.message}`);
    return data || [];
}

async function notifyLeaderboardDisplacements(topBefore, topAfter, currentUserId, username, gameType) {
    if (!GAME_NAMES[gameType] || !topBefore.length) return;
    const notifications = [];
    for (let oldIndex = 0; oldIndex < topBefore.length; oldIndex++) {
        const beforeUser = topBefore[oldIndex];
        if (String(beforeUser.telegram_id) === String(currentUserId)) continue;
        const newIndex = topAfter.findIndex(user =>
            String(user.telegram_id) === String(beforeUser.telegram_id));
        const oldRank = oldIndex + 1;
        const newRank = newIndex >= 0 ? newIndex + 1 : topAfter.length + 1;
        if (newRank > oldRank) {
            notifications.push(notifyDisplaced(
                beforeUser.telegram_id,
                beforeUser.username,
                username,
                gameType,
                oldRank,
                newRank
            ));
        }
    }
    await Promise.allSettled(notifications);
}

async function repairCheckersCounters(userId) {
    for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error } = await supabase.from('users')
            .select('checkers_total, checkers_wins_pve')
            .eq('telegram_id', userId)
            .maybeSingle();
        if (error) throw new Error(`DB read error: ${error.message}`);
        if (!data) return;
        const total = Number(data.checkers_total) || 0;
        const wins = Number(data.checkers_wins_pve) || 0;
        if (total >= wins) return;
        let update = supabase.from('users')
            .update({ checkers_total: wins })
            .eq('telegram_id', userId);
        update = data.checkers_total === null || data.checkers_total === undefined
            ? update.is('checkers_total', null)
            : update.eq('checkers_total', data.checkers_total);
        const { data: updated, error: updateError } = await update
            .select('checkers_total')
            .maybeSingle();
        if (updateError) throw new Error(`DB write error: ${updateError.message}`);
        if (updated) return;
    }
    throw new Error('DB conflict while repairing checkers counters');
}

async function incrementCounterStat(userId, username, photoUrl, gameType, delta) {
    const columns = gameType === 'checkers_total' || gameType === 'checkers_wins_pve'
        ? 'checkers_total, checkers_wins_pve'
        : gameType;
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data: currentUser, error: readError } = await supabase.from('users')
            .select(columns)
            .eq('telegram_id', userId)
            .maybeSingle();
        if (readError) throw new Error(`DB read error: ${readError.message}`);

        if (!currentUser) {
            const value = delta;
            const insertData = {
                telegram_id: userId,
                username,
                photo_url: photoUrl,
                [gameType]: value,
            };
            if (gameType === 'checkers_wins_pve') insertData.checkers_total = value;
            const { error: insertError } = await supabase.from('users').insert(insertData);
            if (!insertError) return value;
            // Another concurrent request may have created the row first.
            if (attempt < 7) continue;
            throw new Error(`DB write error: ${insertError.message}`);
        }

        const rawCurrent = currentUser[gameType];
        const current = Number(rawCurrent) || 0;
        const value = gameType === 'checkers_total'
            ? Math.max(current + delta, Number(currentUser.checkers_wins_pve) || 0)
            : current + delta;
        const updateData = { username, photo_url: photoUrl, [gameType]: value };
        let update = supabase.from('users')
            .update(updateData)
            .eq('telegram_id', userId);
        update = rawCurrent === null || rawCurrent === undefined
            ? update.is(gameType, null)
            : update.eq(gameType, rawCurrent);
        const { data: updated, error: updateError } = await update
            .select(gameType)
            .maybeSingle();
        if (updateError) throw new Error(`DB write error: ${updateError.message}`);
        if (updated) {
            if (gameType === 'checkers_total' || gameType === 'checkers_wins_pve') {
                await repairCheckersCounters(userId);
            }
            return Number(updated[gameType]);
        }
    }
    throw new Error('DB conflict while incrementing counter');
}

async function persistBestStat(userId, username, photoUrl, gameType, score) {
    const isTime = TIME_BASED_TYPES.includes(gameType);
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data: currentUser, error: readError } = await supabase.from('users')
            .select(gameType)
            .eq('telegram_id', userId)
            .maybeSingle();
        if (readError) throw new Error(`DB read error: ${readError.message}`);

        if (!currentUser) {
            const { error: insertError } = await supabase.from('users').insert({
                telegram_id: userId,
                username,
                photo_url: photoUrl,
                [gameType]: score,
            });
            if (!insertError) return { persistedBest: score, recordImproved: true };
            if (attempt < 7) continue;
            throw new Error(`DB write error: ${insertError.message}`);
        }

        const rawCurrent = currentUser[gameType];
        const current = Number(rawCurrent);
        const missing = rawCurrent === null || rawCurrent === undefined || !Number.isFinite(current);
        const improves = missing || (isTime ? score < current : score > current);
        if (!improves) {
            const { error: metadataError } = await supabase.from('users')
                .update({ username, photo_url: photoUrl })
                .eq('telegram_id', userId);
            if (metadataError) throw new Error(`DB write error: ${metadataError.message}`);
            return { persistedBest: current, recordImproved: false };
        }

        let update = supabase.from('users')
            .update({ username, photo_url: photoUrl, [gameType]: score })
            .eq('telegram_id', userId);
        update = missing ? update.is(gameType, null) : update.eq(gameType, rawCurrent);
        const { data: updated, error: updateError } = await update
            .select(gameType)
            .maybeSingle();
        if (updateError) throw new Error(`DB write error: ${updateError.message}`);
        if (updated) return { persistedBest: Number(updated[gameType]), recordImproved: true };
    }
    throw new Error('DB conflict while saving best result');
}

async function recordSavedStatTitles({
    userId, gameType, score, savedValue, session, duration, context, sessionToken, delta, recordImproved,
}) {
    const safeContext = context && typeof context === 'object' ? context : {};
    const eventId = sessionToken ? `${sessionToken}:${gameType}` : '';
    let event = { type: 'stat', eventId, stats: { [gameType]: savedValue }, checkRanks: !!recordImproved };
    if (/^saper_best_(6|8|10|15)$/.test(gameType)) {
        const usedFlag = typeof safeContext.used_flag === 'boolean'
            ? safeContext.used_flag
            : null;
        event = {
            ...event, type: 'saper_win', game: 'saper', score,
            context: { mode: Number(gameType.match(/\d+$/)[0]), usedFlag },
        };
    } else if (gameType === 'bb_best_score' || gameType === 'bb_tournament_score') {
        event = {
            ...event, type: 'bb_game', game: 'bb',
            context: {
                maxCombo: Number(session?.bbMaxCombo) || 0,
                maxLines: Number(session?.bbMaxLines) || 0,
                cleanBoard: !!session?.bbCleanBoard,
            },
        };
    } else if (gameType === 'sudoku_wins') {
        event = {
            ...event, type: 'sudoku_win', game: 'sudoku',
            context: {
                difficulty: Number(delta) || 1,
                mistakes: Math.max(0, Math.min(3, Math.trunc(Number(safeContext.mistakes) || 0))),
                durationMs: Math.max(0, Number(duration) || 0),
            },
        };
    } else if (gameType === 'tower_best') {
        event = {
            ...event, type: 'tower_game', game: 'tower',
            context: { closeCalls: Math.max(0, Math.min(Number(score) || 0, Math.trunc(Number(safeContext.close_calls) || 0))) },
        };
    } else if (gameType === 'wordle_wins') {
        event = {
            ...event, type: 'wordle_win', game: 'wordle',
            context: { attempts: Math.max(1, Math.min(6, Math.trunc(Number(safeContext.attempts) || 6))) },
        };
    } else {
        const games = {
            bb_total_games: 'bb', saper_wins: 'saper', checkers_total: 'checkers',
            checkers_wins_pve: 'checkers', tower_combo: 'tower',
        };
        event.game = games[gameType] || null;
    }
    try { return await titleService.record(userId, event); }
    catch (error) { console.warn('[titles] saved stat:', error.message); return []; }
}

app.post('/save-stat', authMiddleware, async (req, res) => {
    const user = req.telegramUser;
    const user_id = String(user.id);
    const username = tgDisplayName(user);
    const tgUsername = user.username || '';
    const photo_url = user.photo_url || '';
    let { game_type, score, session_token, stat_delta, achievement_context } = req.body;
    const requestedGameType = game_type;
    let validatedSession = null;
    let validatedDuration = 0;
    
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

    const completedSubmissionKey = game_type === 'sudoku_wins' && session_token
        ? `${user_id}:${game_type}:${session_token}`
        : null;
    if (completedSubmissionKey) {
        const completed = completedStatSubmissions.get(completedSubmissionKey);
        if (completed && Date.now() - completed.completedAt < COMPLETED_STAT_TTL_MS) {
            return res.json(completed.response);
        }
        if (completed) completedStatSubmissions.delete(completedSubmissionKey);
    }
    
    // ---- SESSION VALIDATION ----
    // Counter games (wins, total) don't need sessions — they increment by 1
    const isCounter = ['saper_wins', 'bb_total_games', 'checkers_total', 'checkers_wins_pve', 'sudoku_wins', 'wordle_wins'].includes(game_type);
    
    // tower_combo shares session with tower_best (same game, submitted together)
    // bb_tournament_score shares session with bb_best_score (identical gameplay)
    const sessionGameType =
        (game_type === 'tower_combo')         ? 'tower_best'    :
        (game_type === 'bb_tournament_score') ? 'bb_best_score' :
        game_type;
    const needsSession = !isCounter || game_type === 'sudoku_wins';
    
    if (needsSession) {
        const key = `${user_id}:${sessionGameType}`;
        let session = gameSessions.get(key);
        if ((!session || session.token !== session_token) &&
            (TIME_BASED_TYPES.includes(game_type) || game_type === 'sudoku_wins')) {
            const recoveredStartTime = readSignedSessionStart(user_id, sessionGameType, session_token);
            if (recoveredStartTime !== null) {
                session = {
                    startTime: recoveredStartTime,
                    token: session_token,
                    moveCount: 0,
                    lastMoveTime: recoveredStartTime,
                    recoveredAfterRestart: true,
                };
            }
        }
        
        if (!session || session.token !== session_token) {
            // No strike — session loss is common after server restart/deploy
            console.log(`NO_SESSION: user=${user_id}, game=${game_type}, score=${score}`);
            return res.status(400).json({ error: 'Invalid session' });
        }
        
        const duration = Date.now() - session.startTime;
        validatedSession = session;
        validatedDuration = duration;
        const minDuration = MIN_GAME_DURATION[game_type] || 2000;
        
        if (duration < minDuration) {
            console.log(`TOO_FAST: user=${user_id}, game=${game_type}, score=${score}, duration=${duration}ms`);
            gameSessions.delete(key);
            return res.status(400).json({ error: 'Game completed too quickly' });
        }
        
        // Check minimum moves for action games
        if ((game_type === 'bb_best_score' || game_type === 'bb_tournament_score') && session.moveCount < 3) {
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
        
        // BB server-side score enforcement at save time
        if (game_type === 'bb_best_score' || game_type === 'bb_tournament_score') {
            if (score !== session.bbScore) {
                logSuspiciousActivity(user_id, username, tgUsername, game_type, score,
                    `BB_SCORE_MISMATCH (client=${score}, server=${session.bbScore})`);
            }
            score = session.bbScore;
            console.log(`BB save [authoritative]: client=${req.body.score}, saved=${score}, moves=${session.moveCount}, user=${user_id}`);
        }
        
        req.body.score = score;
        
        // Keep the terminal BB marker briefly: another open device must learn
        // that this run is over instead of resurrecting an older checkpoint.
        if (game_type === 'bb_best_score' || game_type === 'bb_tournament_score') {
            session.bbEnded = true;
            session.finishedAt = Date.now();
        // Session used — delete it (but keep for tower_combo if tower_best was just saved)
        } else if (game_type === 'sudoku_wins') {
            // Keep the signed token until the database increment succeeds. If
            // the network drops after saving, the completed response cache
            // makes the retry idempotent instead of awarding points twice.
            session.statSubmissionPending = true;
        } else if (game_type !== 'tower_best') {
            gameSessions.delete(key);
        } else {
            // Mark session as used for tower_best, but keep alive briefly for tower_combo
            session.bestSubmitted = true;
            setTimeout(() => gameSessions.delete(key), 5000);
        }
    }
    
    // ---- COUNTER HANDLING: server-side increment ----
    if (isCounter) {
        // Older cached clients did not send stat_delta. Preserve their +1
        // behavior while current clients submit the difficulty award (1..3).
        const delta = game_type === 'sudoku_wins' ? Number(stat_delta ?? 1) : 1;
        if (!Number.isInteger(delta) || delta < 1 || delta > (game_type === 'sudoku_wins' ? 3 : 1)) {
            return res.status(400).json({ error: 'Invalid counter delta' });
        }
        try {
            const topBefore = await getLeaderboardSnapshot(game_type);
            const value = await incrementCounterStat(user_id, username, photo_url, game_type, delta);
            const topAfter = await getLeaderboardSnapshot(game_type);
            await notifyLeaderboardDisplacements(topBefore, topAfter, user_id, username, game_type);
            const newTitles = await recordSavedStatTitles({
                userId: user_id, gameType: requestedGameType, score, savedValue: value,
                session: validatedSession, duration: validatedDuration, context: achievement_context,
                sessionToken: session_token, delta, recordImproved: true,
            });
            const response = { ok: true, value, added: delta, new_titles: newTitles };
            if (completedSubmissionKey) {
                completedStatSubmissions.set(completedSubmissionKey, {
                    completedAt: Date.now(),
                    response,
                });
                gameSessions.delete(`${user_id}:${sessionGameType}`);
            }
            return res.json(response);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
    
    // ---- TOURNAMENT BB: write to tournament_scores AND ALSO fall through to
    // the global users.bb_best_score path so the player's raw score still
    // contributes to the global all-time leaderboard.
    let _tournamentResult = null;
    if (game_type === 'bb_tournament_score') {
        try {
            const tournament = await getActiveTournament('bb');
            if (!tournament) {
                return res.status(409).json({ error: 'No active tournament' });
            }

            let multiplier = 1.0;
            if (tournament.partner_slug) {
                const hasSub = await hasPartnerVpnSubscription(
                    supabase, user_id, tournament.partner_slug
                );
                if (hasSub) multiplier = Number(tournament.multiplier) || 1.5;
            }

            const rawScore = score; // already capped above by bbScore enforcement
            const finalScore = Math.floor(rawScore * multiplier);

            const { data: existing } = await supabase
                .from('tournament_scores')
                .select('final_score, games_played')
                .eq('tournament_id', tournament.id)
                .eq('telegram_id', user_id)
                .maybeSingle();

            if (!existing) {
                const { error: insErr } = await supabase
                    .from('tournament_scores')
                    .insert({
                        tournament_id:      tournament.id,
                        telegram_id:        user_id,
                        username,
                        photo_url,
                        raw_score:          rawScore,
                        multiplier_applied: multiplier,
                        final_score:        finalScore,
                        games_played:       1,
                    });
                if (insErr) {
                    console.error('[tournament] insert error:', insErr.message);
                    return res.status(500).json({ error: 'DB error' });
                }
            } else {
                const updateData = {
                    username, photo_url,
                    games_played: (existing.games_played || 0) + 1,
                    updated_at:   new Date().toISOString(),
                };
                if (finalScore > existing.final_score) {
                    updateData.raw_score          = rawScore;
                    updateData.multiplier_applied = multiplier;
                    updateData.final_score        = finalScore;
                }
                const { error: updErr } = await supabase
                    .from('tournament_scores').update(updateData)
                    .eq('tournament_id', tournament.id).eq('telegram_id', user_id);
                if (updErr) {
                    console.error('[tournament] update error:', updErr.message);
                    return res.status(500).json({ error: 'DB error' });
                }
            }

            // Stash the tournament outcome for the final response.
            _tournamentResult = {
                tournament_id: tournament.id,
                raw_score:     rawScore,
                multiplier,
                final_score:   finalScore,
                vpn_active:    multiplier > 1.0,
            };

            // Now fall through into the regular users.bb_best_score path with the
            // RAW score (no multiplier). The score variable is unchanged (= rawScore).
            // We just pretend the request was a regular bb_best_score for the
            // remaining DB write.
            game_type = 'bb_best_score';
            req.body.game_type = 'bb_best_score';
        } catch (e) {
            console.error('[tournament] error:', e);
            return res.status(500).json({ error: e.message });
        }
    }
    
    try {
        const topBefore = await getLeaderboardSnapshot(game_type);
        const { persistedBest, recordImproved } = await persistBestStat(
            user_id, username, photo_url, game_type, score);
        const topAfter = await getLeaderboardSnapshot(game_type);
        await notifyLeaderboardDisplacements(topBefore, topAfter, user_id, username, game_type);
        const newTitles = await recordSavedStatTitles({
            userId: user_id, gameType: requestedGameType, score, savedValue: persistedBest,
            session: validatedSession, duration: validatedDuration, context: achievement_context,
            sessionToken: session_token, delta: stat_delta, recordImproved,
        });
        
        // Referral activation: when user scores 1000+ in Block Blast
        if (game_type === 'bb_best_score' && score >= 1000) {
            const { data: freshUser } = await supabase.from('users').select('referred_by, referral_activated').eq('telegram_id', user_id).single();
            if (freshUser && freshUser.referred_by && !freshUser.referral_activated) {
                await supabase.from('users').update({ referral_activated: true }).eq('telegram_id', user_id);
                console.log(`Referral activated: user ${user_id} scored ${score} in BB, referrer ${freshUser.referred_by}`);
            }
        }
        
        if (_tournamentResult) {
            res.json({ success: true, saved_score: score, best_score: persistedBest, record_improved: recordImproved, tournament: _tournamentResult, new_titles: newTitles });
        } else {
            res.json({ success: true, saved_score: score, best_score: persistedBest, record_improved: recordImproved, new_titles: newTitles });
        }
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
    let leaderboardQuery = supabase.from('users')
        .select(`telegram_id, username, photo_url, ${category}`)
        .not(category, 'is', null)
        .gt(category, 0);
    if (isTime) leaderboardQuery = leaderboardQuery.lt(category, LEGACY_MINESWEEPER_TIME_SENTINEL);
    const { data, error } = await leaderboardQuery
        .order(category, { ascending: isTime })
        .limit(50);
    if (error) {
        console.error(`[leaderboard] ${category}:`, error.message);
        return res.status(500).json({ error: 'Leaderboard unavailable' });
    }
    const result = data.map(u => ({ user_id: u.telegram_id, username: u.username, photo_url: u.photo_url, score: u[category] }));
    res.json(result);
});

// ============================
// TOURNAMENTS: public endpoints
// ============================

// State of both banners (BB + Referral) for the home/leaderboard screens.
app.get('/tournaments/state', async (req, res) => {
    try {
        const [bb, referral] = await Promise.all([
            getActiveTournament('bb'),
            getActiveTournament('referral'),
        ]);

        // Optional per-user VPN status (cosmetic — for the BB tournament card badge)
        let vpnActive = false;
        try {
            const initData = req.headers['x-telegram-init-data'];
            if (initData && bb && bb.partner_slug) {
                const params = new URLSearchParams(initData);
                const userJson = params.get('user');
                if (userJson) {
                    const u = JSON.parse(userJson);
                    if (u && u.id) {
                        vpnActive = await hasPartnerVpnSubscription(supabase, String(u.id), bb.partner_slug);
                    }
                }
            }
        } catch (_) { /* ignore */ }

        const shape = (t) => t ? {
            id: t.id, slug: t.slug, name: t.name, kind: t.kind,
            description: t.description,
            start_at: t.start_at, end_at: t.end_at,
            multiplier: Number(t.multiplier),
            partner_slug: t.partner_slug,
            partner_cta_url: t.partner_cta_url,
            prize_text: t.prize_text,
        } : null;

        res.json({
            bb: shape(bb),
            referral: shape(referral),
            vpn_active: vpnActive,
            server_time: new Date().toISOString(),
        });
    } catch (e) {
        console.error('[tournaments/state] error:', e);
        res.status(500).json({ error: 'Internal error' });
    }
});

// Live leaderboard for an active BB tournament with multiplier.
app.get('/tournaments/:id/leaderboard', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.json([]);

    const { data, error } = await supabase
        .from('tournament_scores')
        .select('telegram_id, username, photo_url, raw_score, multiplier_applied, final_score')
        .eq('tournament_id', id)
        .order('final_score', { ascending: false })
        .limit(50);
    if (error) return res.json([]);

    res.json((data || []).map(u => ({
        user_id: u.telegram_id,
        username: u.username,
        photo_url: u.photo_url,
        score: u.final_score,
        raw_score: u.raw_score,
        multiplier: Number(u.multiplier_applied),
    })));
});

// History: list of archived tournaments.
app.get('/tournaments/history', async (req, res) => {
    const { kind } = req.query;
    let q = supabase
        .from('tournaments')
        .select('id, slug, name, kind, end_at, prize_text')
        .eq('status', 'archived')
        .order('end_at', { ascending: false })
        .limit(50);
    if (kind === 'bb' || kind === 'referral') q = q.eq('kind', kind);
    const { data, error } = await q;
    if (error) return res.json([]);
    res.json(data || []);
});

// Frozen final standings for one archived tournament.
app.get('/tournaments/:id/history', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.json({ tournament: null, entries: [] });

    const [{ data: t }, { data: entries }] = await Promise.all([
        supabase.from('tournaments').select('id, slug, name, kind, end_at, prize_text').eq('id', id).maybeSingle(),
        supabase.from('tournament_history_entries')
            .select('rank, telegram_id, username, photo_url, score')
            .eq('tournament_id', id)
            .order('rank', { ascending: true }),
    ]);

    res.json({
        tournament: t || null,
        entries: (entries || []).map(e => ({
            user_id: e.telegram_id,
            username: e.username,
            photo_url: e.photo_url,
            score: e.score,
            rank: e.rank,
        })),
    });
});

// Get user ranks for all games
app.get('/user-ranks', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.json({});
    
    const categories = [
        { key: 'bb_best_score', asc: false },
        { key: 'bb_total_games', asc: false },
        { key: 'saper_best_6', asc: true },
        { key: 'saper_best_8', asc: true },
        { key: 'saper_best_10', asc: true },
        { key: 'saper_best_15', asc: true },
        { key: 'saper_wins', asc: false },
        { key: 'tower_best', asc: false },
        { key: 'tower_combo', asc: false },
        { key: 'sudoku_wins', asc: false },
        { key: 'checkers_total', asc: false },
        { key: 'checkers_wins_pve', asc: false },
        { key: 'wordle_wins', asc: false }
    ];

    const milestones = [1, 3, 10, 25, 50, 100];
    const entries = await Promise.all(categories.map(async cat => {
        let rankQuery = supabase
            .from('users')
            .select(`telegram_id, ${cat.key}`)
            .not(cat.key, 'is', null)
            .gt(cat.key, 0);
        if (TIME_BASED_TYPES.includes(cat.key)) {
            rankQuery = rankQuery.lt(cat.key, LEGACY_MINESWEEPER_TIME_SENTINEL);
        }
        const { data, error } = await rankQuery
            .order(cat.key, { ascending: cat.asc });
        if (error) {
            console.error(`[user-ranks] ${cat.key}:`, error.message);
            return [cat.key, { rank: null, score: null, total: 0, goal: null }];
        }
        const rows = data || [];
        const idx = rows.findIndex(u => String(u.telegram_id) === String(user_id));
        const userEntry = idx >= 0 ? rows[idx] : null;
        const rank = idx >= 0 ? idx + 1 : null;
        let goal = null;
        if (rank && rank > 1) {
            const targetPlace = milestones.filter(place => place < rank).pop() || 1;
            const targetEntry = rows[targetPlace - 1];
            if (targetEntry) {
                const score = Number(userEntry[cat.key]);
                const targetScore = Number(targetEntry[cat.key]);
                const rawGap = cat.asc ? score - targetScore : targetScore - score;
                goal = {
                    place: targetPlace,
                    score: targetScore,
                    gap: Math.max(cat.asc ? 0.01 : 1, rawGap + (cat.asc ? 0.01 : 1))
                };
            }
        }
        return [cat.key, {
            rank,
            score: userEntry ? userEntry[cat.key] : null,
            total: rows.length,
            goal
        }];
    }));
    const ranks = Object.fromEntries(entries);
    
    res.json(ranks);
});

// --- REFERRAL SYSTEM ---

// Register a new referral
app.post('/register-referral', authMiddleware, async (req, res) => {
    const user = req.telegramUser;
    const user_id = String(user.id);
    const username = tgDisplayName(user);
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
const monopolyRooms = new Map();
const TURN_TIME_LIMIT = 60000; // 60 секунд на ход

// Track online users (users with app open)
const onlineUsers = new Map(); // socket.id -> { oderId, odername, connectedAt }
const statsMessages = new Map();

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

            // If this user is a disconnected slot in an active monopoly room,
            // offer them a chance to rejoin.
            let rejoinOffered = 0;
            monopolyRooms.forEach((room, code) => {
                if (room.status !== 'playing') return;
                const slot = room.players.find(p =>
                    String(p.oderId) === String(oderId) && p.id === null);
                if (slot) {
                    socket.emit('monopoly_rejoin_available', {
                        roomCode: code,
                        playerName: slot.username,
                    });
                    console.log(`[monopoly] Offering rejoin for user ${oderId} → room ${code}`);
                    rejoinOffered++;
                }
            });
            if (rejoinOffered === 0) {
                console.log(`[monopoly] No rejoin slots for user ${oderId} (rooms scanned: ${monopolyRooms.size})`);
            }

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
                oderId: onlineUsers.get(socket.id)?.oderId || null,
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
            oderId: onlineUsers.get(socket.id)?.oderId || null,
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
        const winner = room.players.find(p => p.id !== socket.id);
        recordRoomCheckersResult(room, winner?.color);
        
        // Завершаем игру
        cleanupRoom(roomCode);
    });

    // Игрок вышел из игры (сдался)
    socket.on('player_left', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        socket.to(roomCode).emit('opponent_left');
        const winner = room.players.find(p => p.id !== socket.id);
        recordRoomCheckersResult(room, winner?.color);
        cleanupRoom(roomCode);
    });

    // Конец игры
    socket.on('game_over', ({ roomCode, winner }) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        if (winner !== 'white' && winner !== 'black') return;

        io.to(roomCode).emit('game_finished', { winner });
        recordRoomCheckersResult(room, winner);
        cleanupRoom(roomCode);
    });

    // =============================================
    // MONOPOLY MULTIPLAYER
    // =============================================
    // Explicit client-initiated check (called after the iframe finishes
    // loading or whenever the client wants to refresh availability).
    socket.on('monopoly_check_rejoin', ({ userId }) => {
        if (!userId) {
            const cached = onlineUsers.get(socket.id);
            if (cached?.oderId) userId = cached.oderId;
        }
        if (!userId) return;
        monopolyRooms.forEach((room, code) => {
            if (room.status !== 'playing') return;
            const slot = room.players.find(p =>
                String(p.oderId) === String(userId) && p.id === null);
            if (slot) {
                socket.emit('monopoly_rejoin_available', {
                    roomCode: code,
                    playerName: slot.username,
                });
                console.log(`[monopoly] check_rejoin → offer for user ${userId} room ${code}`);
            }
        });
    });

    socket.on('monopoly_list', () => {
        const rooms = [];
        monopolyRooms.forEach((room, code) => {
            if (room.status === 'waiting' && room.players.length < 4) {
                rooms.push({
                    code,
                    host: room.players[0]?.username || 'Игрок',
                    count: room.players.length,
                    max: 4,
                });
            }
        });
        socket.emit('monopoly_room_list', { rooms });
    });

    socket.on('monopoly_create', ({ username, photo_url, userId }) => {
        // Fallback: if the client failed to read user.id from initDataUnsafe
        // (cold start race), use the one we cached during register_online.
        if (!userId) {
            const cached = onlineUsers.get(socket.id);
            if (cached?.oderId) userId = cached.oderId;
        }
        let roomCode = 'M' + Math.floor(1000 + Math.random() * 9000).toString();
        while (monopolyRooms.has(roomCode)) { roomCode = 'M' + Math.floor(1000 + Math.random() * 9000).toString(); }
        
        monopolyRooms.set(roomCode, {
            players: [{ id: socket.id, username, photo_url, oderId: userId }],
            status: 'waiting',
            hostId: socket.id
        });
        
        socket.join(roomCode);
        socket.emit('monopoly_created', { roomCode });
        io.to(roomCode).emit('monopoly_players', { players: monopolyRooms.get(roomCode).players });
        console.log(`Monopoly room ${roomCode} created by ${username} (oderId=${userId})`);
    });
    
    socket.on('monopoly_join', ({ roomCode, username, photo_url, userId }) => {
        if (!userId) {
            const cached = onlineUsers.get(socket.id);
            if (cached?.oderId) userId = cached.oderId;
        }
        const room = monopolyRooms.get(roomCode);
        if (!room) { socket.emit('monopoly_error', { message: 'Комната не найдена' }); return; }
        if (room.status !== 'waiting') { socket.emit('monopoly_error', { message: 'Игра уже началась' }); return; }
        if (room.players.length >= 4) { socket.emit('monopoly_error', { message: 'Комната заполнена (макс 4)' }); return; }
        
        room.players.push({ id: socket.id, username, photo_url, oderId: userId });
        socket.join(roomCode);
        socket.emit('monopoly_joined', { roomCode });
        io.to(roomCode).emit('monopoly_players', { players: room.players });
        console.log(`${username} joined Monopoly room ${roomCode} (${room.players.length}/4) oderId=${userId}`);
    });
    
    socket.on('monopoly_start', ({ roomCode }) => {
        const room = monopolyRooms.get(roomCode);
        if (!room || room.hostId !== socket.id) return;
        if (room.players.length < 2) { socket.emit('monopoly_error', { message: 'Нужно минимум 2 игрока' }); return; }
        
        room.status = 'playing';
        room.currentTurnIdx = 0;
        room.lastSnapshot = null;
        room.turnEndsAt = null;
        room.actionTimes = new Map();

        // Server-authoritative engine — runs in shadow mode for now (does
        // not yet authoritatively control the clients). Every action is
        // validated against it; mismatches are logged so we can confirm
        // before flipping the switch.
        try {
            room.engineState = MonopolyEngine.createGame(room.players.map(p => ({
                oderId: p.oderId,
                username: p.username,
                photo_url: p.photo_url,
            })));
            console.log(`[engine] shadow game created for ${roomCode}, players=${room.engineState.players.length}`);
        } catch (e) {
            console.error('[engine] createGame failed:', e);
        }
        
        const gamePlayers = room.players.map((p, i) => ({
            username: p.username,
            photo_url: p.photo_url,
            oderId: p.oderId
        }));
        
        room.players.forEach((p, i) => {
            io.to(p.id).emit('monopoly_game_start', {
                roomCode,
                players: gamePlayers,
                yourIndex: i
            });
        });
        
        console.log(`Monopoly game started in ${roomCode} with ${room.players.length} players`);
    });
    
    socket.on('monopoly_leave', ({ roomCode }) => {
        const room = monopolyRooms.get(roomCode);
        if (!room) return;
        
        const idx = room.players.findIndex(p => p.id === socket.id);
        if (idx === -1) return;
        
        const leftPlayer = room.players[idx];
        room.players.splice(idx, 1);
        socket.leave(roomCode);
        
        if (room.status === 'playing') {
            io.to(roomCode).emit('monopoly_player_left', { playerIndex: idx, playerName: leftPlayer.username });
        }
        
        if (room.players.length === 0) {
            monopolyRooms.delete(roomCode);
        } else {
            if (room.hostId === socket.id) room.hostId = room.players[0].id;
            io.to(roomCode).emit('monopoly_players', { players: room.players });
        }
    });
    
    // Relay monopoly game actions between players. Also keep the latest
    // full snapshot so reconnecting players can resume.
    //
    // ANTI-CHEAT: every action is validated before relay:
    //   - sender must be a real participant of the room
    //   - room must be in 'playing' status
    //   - rate limit: max 20 actions / second per socket
    //   - dice rolls must be 1..6
    //   - turn-affecting actions must come from the current active player
    //   - snapshot money values are sanity-checked (no negative impossible
    //     values, no insane jumps)
    // ============================================================
    // SERVER-AUTHORITATIVE PATH (Phase 2+)
    // Clients send INTENTS — the engine validates, applies, and
    // broadcasts canonical events. The legacy snapshot relay
    // (monopoly_action) still runs in parallel for actions not
    // yet migrated.
    // ============================================================
    socket.on('monopoly_intent', ({ roomCode, intent }) => {
        const room = monopolyRooms.get(roomCode);
        if (!room || room.status !== 'playing') {
            socket.emit('monopoly_engine_reject', { intent: intent?.type, error: 'room_not_playing' });
            return;
        }
        // Self-heal: if this room predates the engine (started before deploy),
        // create the engine state on the fly using the current player list.
        if (!room.engineState) {
            try {
                room.engineState = MonopolyEngine.createGame(room.players.map(p => ({
                    oderId: p.oderId,
                    username: p.username,
                    photo_url: p.photo_url,
                })));
                console.log(`[engine] late-init for legacy room ${roomCode}, players=${room.engineState.players.length}`);
            } catch (e) {
                console.error('[engine] late-init failed:', e);
                socket.emit('monopoly_engine_reject', { intent: intent?.type, error: 'engine_unavailable' });
                return;
            }
        }
        const slotIdx = room.players.findIndex(p => p.id === socket.id);
        if (slotIdx === -1) {
            console.log(`[engine] DROP intent from non-participant in ${roomCode}`);
            socket.emit('monopoly_engine_reject', { intent: intent?.type, error: 'not_in_room' });
            return;
        }

        // Rate limit shared with monopoly_action
        if (!room.actionTimes) room.actionTimes = new Map();
        const now = Date.now();
        const arr = room.actionTimes.get(socket.id) || [];
        const recent = arr.filter(t => now - t < 1000);
        if (recent.length >= 20) {
            console.log(`[engine] RATE LIMIT (intent) for ${socket.id}`);
            socket.emit('monopoly_engine_reject', { intent: intent?.type, error: 'rate_limited' });
            return;
        }
        recent.push(now);
        room.actionTimes.set(socket.id, recent);

        const result = MonopolyEngine.applyAction(room.engineState, slotIdx, intent);
        if (!result.ok) {
            console.log(`[engine] REJECT intent ${intent?.type} from slot ${slotIdx} in ${roomCode}: ${result.error}`);
            socket.emit('monopoly_engine_reject', { intent: intent?.type, error: result.error });
            return;
        }

        // Safety net: if the engine is parked in post_roll and the client
        // hasn't sent END_TURN within a grace window, a server-side timer
        // auto-ends (set up below). We no longer auto-clear buy decisions —
        // Phase 3 clients drive BUY/DECLINE/END_TURN themselves.

        const pub = MonopolyEngine.publicState(room.engineState);

        // Broadcast canonical events + full authoritative state to EVERYONE
        // (including sender) so all clients render from one source of truth.
        io.to(roomCode).emit('monopoly_engine_event', {
            events: result.events,
            state: pub,
        });

        // Keep the room's authoritative turn pointer in sync for validation
        room.currentTurnIdx = room.engineState.turnIdx;

        // Persist for reconnect resume (engine is now the source of truth)
        room.engineSnapshot = pub;

        // If the game just ended, record the winner for the wager payout layer
        if (room.engineState.phase === 'game_over') {
            room.winnerIdx = room.engineState.winnerIdx;
            console.log(`[engine] game over in ${roomCode}, winner slot=${room.winnerIdx}`);
        }

        // Arm an auto-end timer: if the active player goes idle in post_roll,
        // the server ends their turn after the turn timeout so the table
        // isn't stuck. Cleared whenever a new intent arrives.
        armEngineTurnTimeout(roomCode);
    });

    function armEngineTurnTimeout(roomCode) {
        const room = monopolyRooms.get(roomCode);
        if (!room || !room.engineState) return;
        if (room.engineTurnTimer) clearTimeout(room.engineTurnTimer);
        // Only arm when waiting for the active player to end their turn
        if (room.engineState.phase !== 'post_roll' &&
            room.engineState.phase !== 'awaiting_buy_decision') return;
        room.engineTurnTimer = setTimeout(() => {
            const r = monopolyRooms.get(roomCode);
            if (!r || !r.engineState) return;
            // Force-resolve: decline any pending buy, then end the turn
            const st = r.engineState;
            const events = [];
            if (st.phase === 'awaiting_buy_decision') {
                const dec = st.currentDecision;
                st.currentDecision = null;
                st.phase = st.lastRoll?.doubles ? 'awaiting_roll' : 'post_roll';
                if (dec) events.push({ type: 'TILE_DECLINED', playerIdx: st.turnIdx, tileIdx: dec.tileIdx, auto: true });
            }
            if (st.phase === 'post_roll') {
                const before = st.turnIdx;
                // reuse engine END_TURN logic
                const r2 = MonopolyEngine.applyAction(st, before, { type: 'END_TURN' });
                if (r2.ok) events.push(...r2.events);
            }
            if (events.length) {
                const pub = MonopolyEngine.publicState(st);
                io.to(roomCode).emit('monopoly_engine_event', { events, state: pub });
                r.currentTurnIdx = st.turnIdx;
                r.engineSnapshot = pub;
                console.log(`[engine] auto-ended idle turn in ${roomCode}`);
            }
        }, 125000); // 125s — slightly longer than the client's 2-min UI timer
    }

    socket.on('monopoly_action', ({ roomCode, action }) => {
        const room = monopolyRooms.get(roomCode);
        if (!room || room.status !== 'playing') return;
        if (!action || typeof action !== 'object') return;

        // Sender must be a slot in this room (and currently connected)
        const senderSlot = room.players.findIndex(p => p.id === socket.id);
        if (senderSlot === -1) {
            console.log(`[monopoly] DROP action from non-participant ${socket.id} in ${roomCode}`);
            return;
        }

        // Rate limit
        if (!room.actionTimes) room.actionTimes = new Map();
        const now = Date.now();
        const arr = room.actionTimes.get(socket.id) || [];
        const recent = arr.filter(t => now - t < 1000);
        if (recent.length >= 20) {
            console.log(`[monopoly] RATE LIMIT for ${socket.id} in ${roomCode}`);
            return;
        }
        recent.push(now);
        room.actionTimes.set(socket.id, recent);

        // Per-action validation
        const turnSensitiveTypes = new Set([
            'dice_rolled', 'turn_complete', 'interim_snapshot',
            'turn_timer_started', 'turn_timer_stopped',
            'auction_start', 'auction_end',
            'trade_proposed',
            'token_animate',
        ]);
        // PHASE 3: when the engine is authoritative, the turn pointer is
        // validated on the intent channel (monopoly_intent). The legacy
        // relay (monopoly_action) now carries advisory data (positions,
        // timers, animations) that can legitimately be sent by a player
        // whose engine-turn has already advanced — so validating it against
        // room.currentTurnIdx here wrongly DROPs valid messages and freezes
        // the game. Skip the strict turn check when an engine exists; keep
        // it only for legacy (engine-less) rooms.
        if (!room.engineState && turnSensitiveTypes.has(action.type)) {
            const activeSlot = room.currentTurnIdx ?? 0;
            if (senderSlot !== activeSlot) {
                console.log(`[monopoly] DROP ${action.type}: sender slot ${senderSlot} ≠ active ${activeSlot} in ${roomCode}`);
                return;
            }
        }

        // Dice values
        if (action.type === 'dice_rolled') {
            const ok = Number.isInteger(action.a) && action.a >= 1 && action.a <= 6
                    && Number.isInteger(action.b) && action.b >= 1 && action.b <= 6;
            if (!ok) {
                console.log(`[monopoly] DROP dice_rolled with invalid values from ${socket.id}`);
                return;
            }
        }

        // Snapshot sanity: money must be a number; sum of all balances
        // can't impossibly exceed the bank seeding (1500 * n + bonuses).
        // We cap at a generous upper bound to catch the most obvious cheats.
        if (action.type === 'turn_complete' || action.type === 'interim_snapshot') {
            if (!action.snapshot || typeof action.snapshot !== 'object') return;
            const players = action.snapshot.players || {};
            for (const pid of Object.keys(players)) {
                const m = players[pid]?.money;
                if (typeof m !== 'number' || !isFinite(m) || m > 1_000_000 || m < -100_000) {
                    console.log(`[monopoly] DROP snapshot with bogus money for ${pid}: ${m}`);
                    return;
                }
            }
        }

        // Auction bid amount: server doesn't track auction state in detail,
        // but at least the value must be a positive small integer.
        if (action.type === 'auction_bid' && action.amount != null) {
            if (!Number.isInteger(action.amount) || action.amount < 0 || action.amount > 100_000) {
                console.log(`[monopoly] DROP auction_bid with bogus amount: ${action.amount}`);
                return;
            }
        }

        // Persist for reconnect resume
        if (action.type === 'turn_complete' || action.type === 'interim_snapshot') {
            room.lastSnapshot = {
                snapshot: action.snapshot,
                positions: action.positions,
                turnIdx: action.turnIdx,
            };
            // Only trust the legacy snapshot's turnIdx for engine-less rooms.
            // When the engine is authoritative it owns currentTurnIdx and the
            // legacy value is stale (client lags the engine).
            if (!room.engineState && action.type === 'turn_complete' && typeof action.turnIdx === 'number') {
                room.currentTurnIdx = action.turnIdx;
            }
        } else if (action.type === 'turn_timer_started' && action.endsAt) {
            room.turnEndsAt = action.endsAt;
        } else if (action.type === 'turn_timer_stopped') {
            room.turnEndsAt = null;
        }

        socket.to(roomCode).emit('monopoly_action', { action });
    });

    // Rejoin an in-progress monopoly room after a disconnect.
    socket.on('monopoly_rejoin', ({ roomCode, userId }) => {
        if (!userId) {
            const cached = onlineUsers.get(socket.id);
            if (cached?.oderId) userId = cached.oderId;
        }
        const room = monopolyRooms.get(roomCode);
        if (!room || room.status !== 'playing') {
            socket.emit('monopoly_error', { message: 'Партия не найдена' });
            return;
        }
        const slotIdx = room.players.findIndex(p => String(p.oderId) === String(userId));
        if (slotIdx === -1) {
            socket.emit('monopoly_error', { message: 'Вас нет в этой партии' });
            return;
        }
        // Re-bind socket to the slot
        room.players[slotIdx].id = socket.id;
        room.players[slotIdx].disconnectedAt = null;
        if (room.graceTimers && room.graceTimers[userId]) {
            clearTimeout(room.graceTimers[userId]);
            delete room.graceTimers[userId];
        }
        socket.join(roomCode);

        // Send the game-start payload + last known snapshot so the client
        // can spin up the iframe and apply state.
        const gamePlayers = room.players.map(p => ({
            username: p.username,
            photo_url: p.photo_url,
            oderId: p.oderId,
        }));
        // Build the authoritative snapshot LIVE from the engine state at the
        // moment of rejoin (never trust the cached copy — it may be stale or
        // missing if the engine was late-initialized).
        let engineSnap = null;
        try {
            if (room.engineState) {
                engineSnap = MonopolyEngine.publicState(room.engineState);
            } else {
                engineSnap = room.engineSnapshot || null;
            }
        } catch (e) {
            console.error('[engine] publicState at rejoin failed:', e);
            engineSnap = room.engineSnapshot || null;
        }
        console.log(`[monopoly] rejoin_ok → ${roomCode} slot=${slotIdx}; engineSnap=${engineSnap ? 'yes (turnIdx=' + engineSnap.turnIdx + ', p0 money=' + (engineSnap.players?.[0]?.money) + ', p0 pos=' + (engineSnap.players?.[0]?.position) + ')' : 'NULL'}; lastSnapshot=${room.lastSnapshot ? 'yes' : 'null'}`);
        socket.emit('monopoly_rejoin_ok', {
            roomCode,
            players: gamePlayers,
            yourIndex: slotIdx,
            lastSnapshot: room.lastSnapshot || null,
            engineSnapshot: engineSnap,
            turnEndsAt: room.turnEndsAt || null,
        });
        socket.to(roomCode).emit('monopoly_player_reconnected', {
            playerIndex: slotIdx,
            playerName: room.players[slotIdx].username,
        });
        console.log(`Monopoly: ${room.players[slotIdx].username} rejoined ${roomCode}`);

        // ROBUST RESUME: besides the rejoin_ok payload (which the iframe must
        // pull via postMessage — fragile due to load races), also push the
        // authoritative engine state through the SAME live channel that
        // already works mid-game (monopoly_engine_event → applyEngineState).
        // We resend a few times so it lands after the iframe has booted and
        // registered its handlers, regardless of how slow the reload is.
        if (room.engineState) {
            const pushState = () => {
                const r = monopolyRooms.get(roomCode);
                if (!r || !r.engineState) return;
                const pub = MonopolyEngine.publicState(r.engineState);
                io.to(socket.id).emit('monopoly_engine_event', {
                    events: [{ type: 'RESUME_SYNC', turnIdx: pub.turnIdx }],
                    state: pub,
                });
            };
            setTimeout(pushState, 1500);
            setTimeout(pushState, 3000);
            setTimeout(pushState, 5000);
        }
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
                const winner = room.players.find(p => p.id !== socket.id);
                recordRoomCheckersResult(room, winner?.color);
                room.players.splice(index, 1);
                socket.to(code).emit('opponent_disconnected');
                cleanupRoom(code);
            }
        });
        
        // Cleanup monopoly rooms — with grace period for active games
        monopolyRooms.forEach((room, code) => {
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx === -1) return;
            const leftPlayer = room.players[idx];

            if (room.status === 'playing') {
                // Mark slot as disconnected; keep it for 90 seconds so the
                // player can rejoin. Their socket.id becomes null.
                room.players[idx].id = null;
                room.players[idx].disconnectedAt = Date.now();
                console.log(`[monopoly] ${leftPlayer.username} (oderId=${leftPlayer.oderId}) disconnected from ${code}; grace 90s`);
                io.to(code).emit('monopoly_player_disconnected', {
                    playerIndex: idx, playerName: leftPlayer.username,
                });

                // Reassign host if needed
                if (room.hostId === socket.id) {
                    const fallback = room.players.find(p => p.id);
                    if (fallback) room.hostId = fallback.id;
                }

                // Schedule final removal after grace period
                if (room.graceTimers) clearTimeout(room.graceTimers[leftPlayer.oderId]);
                else room.graceTimers = {};
                room.graceTimers[leftPlayer.oderId] = setTimeout(() => {
                    const r = monopolyRooms.get(code);
                    if (!r) return;
                    const stillIdx = r.players.findIndex(p =>
                        p.oderId === leftPlayer.oderId && p.id === null);
                    if (stillIdx === -1) return; // already rejoined
                    r.players.splice(stillIdx, 1);
                    io.to(code).emit('monopoly_player_left', {
                        playerIndex: stillIdx, playerName: leftPlayer.username,
                    });
                    if (r.players.filter(p => p.id).length === 0) {
                        monopolyRooms.delete(code);
                    }
                }, 90000);
            } else {
                // Lobby (waiting): remove immediately as before
                room.players.splice(idx, 1);
                if (room.players.length === 0) {
                    monopolyRooms.delete(code);
                } else {
                    if (room.hostId === socket.id) room.hostId = room.players[0].id;
                    io.to(code).emit('monopoly_players', { players: room.players });
                }
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
            recordRoomCheckersResult(currentRoom, winner.color);
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


/** Символы, которые Telegram рисует как пустоту: заполнители хангыля,
    нулевой ширины, соединители, вариационные селекторы, пустой Брайль.
    Обычные пробелы сюда не входят — их достаточно схлопнуть и обрезать. */
const INVISIBLE_CHARS = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\u2800\u3164\ufe00-\ufe0f\ufeff]/g;
function cleanName(s) {
    return String(s == null ? '' : s).replace(INVISIBLE_CHARS, '').replace(/\s+/g, ' ').trim();
}

/** Отображаемое имя игрока: имя+фамилия, иначе юзернейм, иначе «Игрок».
    Имя из одних невидимых символов считаем пустым. */
function tgDisplayName(user) {
    if (!user) return 'Игрок';
    const full = cleanName([user.first_name, user.last_name].filter(Boolean).join(' '));
    return full || cleanName(user.username) || 'Игрок';
}
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
// Telegram requires button text. The invisible separator keeps the control
// clickable, while two en-spaces restore the comfortable, plump button width
// without drawing the white square glyph used by the old placeholder.
const TTT_EMPTY = '\u2063\u2002\u2002';

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
const CH_WHITE_KING = '🟡';
const CH_BLACK_KING = '🔵';
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
                text = '🔴';
            } else if (cell.type === 'light') {
                text = ' ';
            } else if (cell.type === 'empty') {
                text = CH_EMPTY;
            } else if (cell.type === 'piece') {
                if (cell.isKing) {
                    text = cell.color === 'white' ? CH_WHITE_KING : CH_BLACK_KING;
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

let checkersStatsChain = Promise.resolve();
async function recordInlineCheckersResult(playerIds, winnerId, contexts = {}) {
    const run = async () => {
        for (const oderId of [...new Set(playerIds.map(String))]) {
            try {
                const { data, error } = await supabase.from('users')
                    .select('checkers_total, checkers_wins_pve')
                    .eq('telegram_id', oderId).single();
                if (error) throw error;
                const oldWins = Number(data?.checkers_wins_pve) || 0;
                const wins = oldWins + (oderId === String(winnerId) ? 1 : 0);
                /* Выравниваем уже повреждённые записи заодно: число партий
                   никогда не может быть меньше числа побед. */
                const total = Math.max((Number(data?.checkers_total) || 0) + 1, wins);
                const saved = await supabase.from('users')
                    .update({ checkers_total: total, checkers_wins_pve: wins })
                    .eq('telegram_id', oderId);
                if (saved.error) throw saved.error;
                const extra = contexts[oderId] || contexts[String(oderId)] || {};
                await titleService.record(oderId, {
                    type: 'checkers_match', game: 'checkers', checkRanks: true,
                    eventId: extra.eventId ? `${extra.eventId}:${oderId}` : '',
                    stats: { checkers_total: total, checkers_wins_pve: wins },
                    context: { ...extra, won: oderId === String(winnerId) },
                });
            } catch (e) {
                console.error('Error updating inline checkers stats:', e.message);
            }
        }
    };
    const result = checkersStatsChain.then(run, run);
    checkersStatsChain = result.catch(() => {});
    return result;
}

function recordRoomCheckersResult(room, winnerColor) {
    if (!room || room.statsRecorded || room.status !== 'playing') return;
    const players = room.players.filter(p => p.oderId);
    const winner = players.find(p => p.color === winnerColor);
    if (players.length !== 2 || !winner) return;
    room.statsRecorded = true;
    const contexts = Object.fromEntries(players.map(player => [String(player.oderId), {
        eventId: `checkers-room:${room.code || room.roomCode || room.id || room.createdAt || Date.now()}`,
    }]));
    void recordInlineCheckersResult(players.map(p => p.oderId), winner.oderId, contexts);
}

function checkersAchievement(game, color) {
    game.achievement ||= {};
    game.achievement[color] ||= { crowned: false, maxCapture: 0, captureChain: 0, maxDeficit: 0 };
    return game.achievement[color];
}

function updateCheckersDeficits(game) {
    for (const color of ['white', 'black']) {
        const opponent = color === 'white' ? 'black' : 'white';
        const deficit = countPieces(game.board, opponent) - countPieces(game.board, color);
        const state = checkersAchievement(game, color);
        state.maxDeficit = Math.max(state.maxDeficit, deficit);
    }
}

function getUserDisplayName(user) {
    if (user.username) return '@' + user.username;
    return tgDisplayName(user);
}

async function telegramBotApi(method, payload) {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return response.json();
}

async function editRichInlineMessage(inlineMessageId, richHtml, fallbackText, fallbackReplyMarkup) {
    let result = await telegramBotApi('editMessageText', {
        inline_message_id: inlineMessageId,
        ...richMessageContent(richHtml),
    });
    if (!result.ok) {
        result = await telegramBotApi('editMessageText', {
            inline_message_id: inlineMessageId,
            text: fallbackText,
            parse_mode: 'HTML',
            ...(fallbackReplyMarkup ? { reply_markup: fallbackReplyMarkup } : {}),
        });
    }
    if (!result.ok) {
        console.error('Edit inline message API error:', result.description);
    }
    return result;
}

function tttRichHtml(text, board, gameId) {
    const keyboard = getTTTKeyboard(board, gameId);
    return richGameHtml(text, keyboard, {
        isDisabled: (button) => button.text !== TTT_EMPTY,
        styleForButton: (button) => button.text === TTT_X ? 'danger' :
            (button.text === TTT_O ? 'primary' : ''),
    });
}

function checkersRichHtml(text, board, gameId, selectedPos = null) {
    const keyboard = getCheckersKeyboard(board, gameId, selectedPos);
    return richCheckersHtml(text, keyboard);
}

function editTTTInlineMessage(inlineMessageId, text, board, gameId) {
    const keyboard = getTTTKeyboard(board, gameId);
    return editRichInlineMessage(inlineMessageId, tttRichHtml(text, board, gameId), text, keyboard);
}

function editCheckersInlineMessage(inlineMessageId, text, board, gameId, selectedPos = null) {
    const keyboard = getCheckersKeyboard(board, gameId, selectedPos);
    return editRichInlineMessage(
        inlineMessageId,
        checkersRichHtml(text, board, gameId, selectedPos),
        text,
        keyboard,
    );
}

// Helper function to edit inline leaderboard/help message with an in-message button.
async function editInlineMessageWithPlayButton(inlineMessageId, text, userId) {
    const url = `https://t.me/spark_game_bot/spark?startapp=ref_${userId}`;
    const replyMarkup = { inline_keyboard: [[{ text: '🎮 Играть', url }]] };
    return editRichInlineMessage(
        inlineMessageId,
        richActionHtml(text, { text: 'Открыть Spark', url, style: 'success' }),
        text,
        replyMarkup,
    );
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
const GAME_ICON_BY_COLUMN = {
    bb_best_score: 'block-blast.png', saper_wins: 'minesweeper.png',
    saper_best_6: 'minesweeper.png', tower_best: 'tower.png',
    sudoku_wins: 'sudoku.png', checkers_wins_pve: 'checkers.png',
    wordle_wins: 'wordle.png',
};
function gameThumbnail(config) {
    if (!config || config.isReferral) return null;
    const file = GAME_ICON_BY_COLUMN[config.column];
    return file ? `https://sevet-apps.github.io/minesweeper-tg/assets/game-icons/${file}` : null;
}

function formatTopForGame(gameConfig, userId, users, usePremiumEmoji = true) {
    const { column, name, isHigherBetter } = gameConfig;
    const emojis = usePremiumEmoji ? EMOJI : EMOJI_INLINE;
    const allUsers = (users || [])
        .filter(user => Number(user[column]) > 0)
        .sort((left, right) => isHigherBetter
            ? Number(right[column]) - Number(left[column])
            : Number(left[column]) - Number(right[column]));
    const top3 = allUsers.slice(0, 3);

    if (top3.length === 0) {
        return { text: `<b>${name}</b>\n\nПока нет результатов`, userRank: null };
    }

    let userRank = null;
    let userData = null;
    if (userId) {
        const userIndex = allUsers.findIndex(u => String(u.telegram_id) === String(userId));
        if (userIndex >= 0) {
            userRank = userIndex + 1;
            userData = allUsers[userIndex];
        }
    }

    const medals = [emojis.first, emojis.second, emojis.third];
    let text = `<b>${name} — Топ игроков</b>\n\n`;
    top3.forEach((user, index) => {
        const medal = medals[index];
        const score = user[column];
        const username = escapeRichHtml(user.username || 'Игрок');
        text += `${medal} ${username} — <b>${score}</b>\n`;
    });

    if (userRank && userRank > 3 && userData) {
        text += `\n━━━━━━━━━━━━━━━\n`;
        const pin = usePremiumEmoji
            ? '<tg-emoji emoji-id="5258509201306557640">📍</tg-emoji>' : '📍';
        text += `${pin} Вы: #${userRank} — <b>${userData[column]}</b>`;
    } else if (userRank && userRank <= 3) {
        text += `\n${emojis.sparkle} Вы в топ-${userRank}!`;
    }
    return { text, userRank };
}

// One query is enough for every top shown by an empty inline request. This
// keeps the rich result fast enough for Telegram while still including the
// sender's exact place below the top three.
async function getTopsForGames(gameConfigs, userId, usePremiumEmoji = true) {
    const uniqueConfigs = [...new Map(gameConfigs.map(config => [config.column, config])).values()];
    const columns = uniqueConfigs.map(config => config.column);
    const { data, error } = await supabase.from('users')
        .select(['telegram_id', 'username', ...columns].join(', '));
    if (error) throw error;
    return new Map(uniqueConfigs.map(config => [
        config.column,
        formatTopForGame(config, userId, data, usePremiumEmoji),
    ]));
}

// Получить топ-3 + пользователя (с Premium эмодзи для бота)
async function getTopForGame(gameConfig, userId, usePremiumEmoji = true) {
    const tops = await getTopsForGames([gameConfig], userId, usePremiumEmoji);
    return tops.get(gameConfig.column);
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
        const username = escapeRichHtml(user.username || 'Игрок');
        text += `${medal} ${username} — <b>${user.score}</b>\n`;
    });
    
    if (userRank && userRank > 3 && userData) {
        text += `\n━━━━━━━━━━━━━━━\n`;
        const pin = usePremiumEmoji
            ? '<tg-emoji emoji-id="5258509201306557640">📍</tg-emoji>' : '📍';
        text += `${pin} Вы: #${userRank} — <b>${userData.score}</b>`;
    } else if (userRank && userRank <= 3) {
        text += `\n${emojis.sparkle} Вы в топ-${userRank}!`;
    }
    
    return { text, userRank };
}

// URL Mini App
const WEBAPP_URL = 'https://sevet-apps.github.io/minesweeper-tg/';

// Кэш для хранения данных inline запросов
const inlineCache = new Map();

function scheduleInlineGameCleanup(store, inlineMessageId, game) {
    setTimeout(() => {
        if (store.get(inlineMessageId) === game) store.delete(inlineMessageId);
    }, 30 * 60 * 1000);
}

function createTTTInlineGame(inlineMessageId, gameId, creator, creatorName) {
    const game = {
        board: createTTTBoard(),
        playerX: creator,
        playerO: null,
        playerXName: creatorName,
        playerOName: null,
        currentTurn: 'X',
        gameId,
        status: 'waiting',
    };
    tttGames.set(inlineMessageId, game);
    scheduleInlineGameCleanup(tttGames, inlineMessageId, game);
    return game;
}

function createCheckersInlineGame(inlineMessageId, gameId, creator, creatorName) {
    const game = {
        board: createCheckersBoard(),
        playerWhite: creator,
        playerBlack: null,
        playerWhiteName: creatorName,
        playerBlackName: null,
        currentTurn: 'white',
        selected: null,
        gameId,
        status: 'waiting',
    };
    checkersGames.set(inlineMessageId, game);
    scheduleInlineGameCleanup(checkersGames, inlineMessageId, game);
    return game;
}

async function resolveInlineCreator(gameId, type) {
    const cached = inlineCache.get(gameId);
    if (cached?.creator) {
        return { creator: cached.creator, creatorName: cached.creatorName };
    }

    // Rich inline results don't currently provide inline_message_id in
    // chosen_inline_result. Keep enough identity in the signed-by-us result
    // id to lazily create the waiting game on its first callback instead.
    const prefix = type === 'ttt' ? 'ttt' : 'ch';
    const match = String(gameId).match(new RegExp(`^${prefix}_(\\d+)_`));
    if (!match) return null;
    const creatorId = Number(match[1]);
    let username = '';
    try {
        const { data } = await supabase.from('users')
            .select('username').eq('telegram_id', String(creatorId)).maybeSingle();
        username = cleanName(data?.username);
    } catch (error) {
        console.warn('Inline creator lookup failed:', error.message);
    }
    const creator = { id: creatorId, ...(username ? { username } : {}) };
    return {
        creator,
        creatorName: escapeRichHtml(username ? `@${username}` : 'Игрок'),
    };
}

async function ensureTTTInlineGame(inlineMessageId, gameId) {
    const existing = tttGames.get(inlineMessageId);
    if (existing) return existing;
    const seed = await resolveInlineCreator(gameId, 'ttt');
    return seed ? createTTTInlineGame(
        inlineMessageId, gameId, seed.creator, seed.creatorName,
    ) : null;
}

async function ensureCheckersInlineGame(inlineMessageId, gameId) {
    const existing = checkersGames.get(inlineMessageId);
    if (existing) return existing;
    const seed = await resolveInlineCreator(gameId, 'checkers');
    return seed ? createCheckersInlineGame(
        inlineMessageId, gameId, seed.creator, seed.creatorName,
    ) : null;
}

// Инициализация бота
let bot = null;

if (BOT_TOKEN) {
    bot = new TelegramBot(BOT_TOKEN, { polling: true });

    const START_COPY = {
        ru: `${EMOJI.game} <b>Добро пожаловать в Spark Games!</b>\n` +
            `Играйте в крутые игры и соревнуйтесь с друзьями!\n\n` +
            `${EMOJI.chart} <b>Топы:</b> @spark_game_bot [игра]\n\n` +
            `${EMOJI.joystick} <b>Игры в чате:</b>\n` +
            `• @spark_game_bot крестики\n• @spark_game_bot шашки\n\n` +
            `<blockquote>${EMOJI.play} <b>Открыть игры:</b> нажмите кнопку ниже</blockquote>`,
        en: `${EMOJI.game} <b>Welcome to Spark Games!</b>\n` +
            `Play great games and compete with friends!\n\n` +
            `${EMOJI.chart} <b>Leaderboards:</b> @spark_game_bot [game]\n\n` +
            `${EMOJI.joystick} <b>Games in chat:</b>\n` +
            `• @spark_game_bot tic-tac-toe\n• @spark_game_bot checkers\n\n` +
            `<blockquote>${EMOJI.play} <b>Open games:</b> tap the button below</blockquote>`,
        zh: `${EMOJI.game} <b>欢迎来到 Spark Games！</b>\n` +
            `畅玩精彩游戏，与好友一较高下！\n\n` +
            `${EMOJI.chart} <b>排行榜：</b>@spark_game_bot [游戏]\n\n` +
            `${EMOJI.joystick} <b>聊天内游戏：</b>\n` +
            `• @spark_game_bot 井字棋\n• @spark_game_bot 跳棋\n\n` +
            `<blockquote>${EMOJI.play} <b>打开游戏：</b>点击下方按钮</blockquote>`,
    };
    const START_BUTTON = { ru: '🎮 Играть', en: '🎮 Play', zh: '🎮 开始游戏' };
    function botLanguage(code) {
        const c = String(code || '').toLowerCase();
        if (c.startsWith('ru')) return 'ru';
        if (c.startsWith('zh')) return 'zh';
        if (c.startsWith('en')) return 'en';
        return null;
    }
    function startWebAppUrl(param) {
        return param ? `${WEBAPP_URL}?tgWebAppStartParam=${encodeURIComponent(param)}` : WEBAPP_URL;
    }
    async function sendStartGreeting(chatId, lang, param) {
        const options = {
            caption: START_COPY[lang], parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{
                text: START_BUTTON[lang], web_app: { url: startWebAppUrl(param) },
            }]] },
        };
        return bot.sendAnimation(chatId,
            path.join(__dirname, '..', 'assets', 'media', 'bot-welcome.mp4'), options);
    }
    
    // Register admin tournament management commands (/admin)
    registerAdminBot({ bot, supabase });
    
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
        const fallbackResults = [];
        const addRichResult = (options) => {
            const pair = createRichInlineArticle(options);
            results.push(pair.rich);
            fallbackResults.push(pair.fallback);
        };
        
        // Если запрос пустой - показываем все доступные команды
        if (!queryText) {
            const userName = escapeRichHtml(getUserDisplayName(user));
            
            // 1. Крестики-нолики
            const tttId = `ttt_${userId}_${Date.now()}`;
            inlineCache.set(tttId, {
                type: 'ttt',
                creator: user,
                creatorName: userName
            });
            setTimeout(() => inlineCache.delete(tttId), 10 * 60 * 1000);
            
            const tttInviteText = `${EMOJI.joystick} <b>${userName}</b> хочет сыграть в крестики-нолики!\n\nНажмите любую клетку, чтобы принять вызов.`;
            const tttInviteKeyboard = getTTTKeyboard(createTTTBoard(), tttId);
            addRichResult({
                id: tttId,
                title: 'Крестики-нолики',
                description: 'Сыграйте с кем-то из чата!',
                thumbnailUrl: 'https://sevet-apps.github.io/minesweeper-tg/assets/inline-icons/tic-tac-toe.png?v=20260827-2',
                richHtml: tttRichHtml(tttInviteText, createTTTBoard(), tttId),
                fallbackText: tttInviteText,
                fallbackReplyMarkup: tttInviteKeyboard,
            });
            
            // 2. Шашки
            const chId = `ch_${userId}_${Date.now() + 1}`;
            inlineCache.set(chId, {
                type: 'checkers',
                creator: user,
                creatorName: userName
            });
            setTimeout(() => inlineCache.delete(chId), 10 * 60 * 1000);
            
            const checkersInviteText = `${EMOJI.joystick} <b>${userName}</b> хочет сыграть в шашки!\n\nНажмите на любую свою шашку, чтобы принять вызов.`;
            const checkersInviteKeyboard = getCheckersKeyboard(createCheckersBoard(), chId);
            addRichResult({
                id: chId,
                title: 'Шашки',
                description: 'Сыграйте в шашки с кем-то из чата!',
                thumbnailUrl: 'https://sevet-apps.github.io/minesweeper-tg/assets/inline-icons/checkers-versus.png?v=20260827-2',
                richHtml: checkersRichHtml(checkersInviteText, createCheckersBoard(), chId),
                fallbackText: checkersInviteText,
                fallbackReplyMarkup: checkersInviteKeyboard,
            });
            
            // 3. Топы игр
            const topGames = [
                { key: 'bb_best_score', name: 'Блок Бласт' },
                { key: 'saper_wins', name: 'Сапёр' },
                { key: 'tower_best', name: 'Башня' },
                { key: 'sudoku_wins', name: 'Судоку' },
                { key: 'checkers_wins_pve', name: 'Шашки' },
                { key: 'wordle_wins', name: 'Вордли' }
            ];
            
            // Rich inline results don't yield inline_message_id in
            // chosen_inline_result without a classic reply markup. Therefore
            // the selected rich message can't be repaired afterwards: send
            // the real leaderboard immediately instead of a loading shell.
            const topConfigs = topGames.map(game =>
                Object.values(GAME_CONFIG).find(config => config.column === game.key));
            let topData = new Map();
            try {
                topData = await getTopsForGames(topConfigs.filter(Boolean), userId, true);
            } catch (error) {
                console.error('Inline leaderboards error:', error.message);
            }
            const readyTopGames = topGames.map((game, index) => {
                const config = topConfigs[index];
                if (!config) return null;
                const result = topData.get(config.column);
                return {
                    game,
                    config,
                    text: result?.text || `<b>${game.name}</b>\n\nТоп временно недоступен`,
                };
            });

            readyTopGames.filter(Boolean).forEach(({ game, config, text }, index) => {
                const resultId = `top_${game.key}_${Date.now()}_${index}`;
                inlineCache.set(resultId, { gameConfig: config, userId });
                setTimeout(() => inlineCache.delete(resultId), 5 * 60 * 1000);
                const playUrl = `https://t.me/spark_game_bot/spark?startapp=ref_${userId}`;
                const replyMarkup = { inline_keyboard: [[{ text: '🎮 Играть', url: playUrl }]] };
                addRichResult({
                    id: resultId,
                    title: `Топ ${game.name}`,
                    description: `Показать топ игроков в ${game.name}`,
                    thumbnailUrl: gameThumbnail(config),
                    richHtml: richActionHtml(text, {
                        text: 'Открыть Spark', url: playUrl, style: 'success',
                    }),
                    fallbackText: text,
                    fallbackReplyMarkup: replyMarkup,
                });
            });
        } 
        // Крестики-нолики
        else if (queryText.includes('крестики') || queryText.includes('нолики') || queryText.includes('ttt') || queryText.includes('xo')) {
            const gameId = `ttt_${userId}_${Date.now()}`;
            const userName = escapeRichHtml(getUserDisplayName(user));
            
            // Сохраняем данные создателя игры
            inlineCache.set(gameId, {
                type: 'ttt',
                creator: user,
                creatorName: userName
            });
            setTimeout(() => inlineCache.delete(gameId), 10 * 60 * 1000);
            
            const inviteText = `${EMOJI.joystick} <b>${userName}</b> хочет сыграть в крестики-нолики!\n\nНажмите любую клетку, чтобы принять вызов.`;
            const inviteKeyboard = getTTTKeyboard(createTTTBoard(), gameId);
            addRichResult({
                id: gameId,
                title: '❌⭕ Крестики-нолики',
                description: 'Сыграйте с кем-то из чата!',
                thumbnailUrl: 'https://sevet-apps.github.io/minesweeper-tg/assets/inline-icons/tic-tac-toe.png?v=20260827-2',
                richHtml: tttRichHtml(inviteText, createTTTBoard(), gameId),
                fallbackText: inviteText,
                fallbackReplyMarkup: inviteKeyboard,
            });
        }
        // Шашки
        else if (queryText.includes('шашки') || queryText.includes('checkers')) {
            const gameId = `ch_${userId}_${Date.now()}`;
            const userName = escapeRichHtml(getUserDisplayName(user));
            
            inlineCache.set(gameId, {
                type: 'checkers',
                creator: user,
                creatorName: userName
            });
            setTimeout(() => inlineCache.delete(gameId), 10 * 60 * 1000);
            
            const inviteText = `${EMOJI.joystick} <b>${userName}</b> хочет сыграть в шашки!\n\nНажмите на любую свою шашку, чтобы принять вызов.`;
            const inviteKeyboard = getCheckersKeyboard(createCheckersBoard(), gameId);
            addRichResult({
                id: gameId,
                title: '⚪⚫ Шашки',
                description: 'Сыграйте в шашки с кем-то из чата!',
                thumbnailUrl: 'https://sevet-apps.github.io/minesweeper-tg/assets/inline-icons/checkers-versus.png?v=20260827-2',
                richHtml: checkersRichHtml(inviteText, createCheckersBoard(), gameId),
                fallbackText: inviteText,
                fallbackReplyMarkup: inviteKeyboard,
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
                        result = await getTopForReferrals(userId, true);
                    } else {
                        result = await getTopForGame(matchedGame, userId, true);
                    }
                    const { text } = result;
                    
                    const resultId = `top_${matchedGame.column}_${Date.now()}`;
                    
                    // Сохраняем в кэш
                    inlineCache.set(resultId, { gameConfig: matchedGame, userId });
                    setTimeout(() => inlineCache.delete(resultId), 5 * 60 * 1000);
                    
                    const playUrl = `https://t.me/spark_game_bot/spark?startapp=ref_${userId}`;
                    addRichResult({
                        id: resultId,
                        title: `Топ ${matchedGame.name}`,
                        description: 'Нажмите чтобы отправить топ в чат',
                        thumbnailUrl: gameThumbnail(matchedGame),
                        richHtml: richActionHtml(text, {
                            text: 'Открыть Spark', url: playUrl, style: 'success',
                        }),
                        fallbackText: text,
                        fallbackReplyMarkup: {
                            inline_keyboard: [[{ text: '🎮 Играть', url: playUrl }]],
                        },
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
                        
                        const playUrl = `https://t.me/spark_game_bot/spark?startapp=ref_${userId}`;
                        let topText;
                        try {
                            const top = config.isReferral
                                ? await getTopForReferrals(userId, true)
                                : await getTopForGame(config, userId, true);
                            topText = top.text;
                        } catch (error) {
                            console.error(`Inline ${config.column} suggestion error:`, error.message);
                            topText = `<b>${config.name}</b>\n\nТоп временно недоступен`;
                        }
                        addRichResult({
                            id: resultId,
                            title: `${config.name}`,
                            description: `Показать топ ${config.name}`,
                            thumbnailUrl: gameThumbnail(config),
                            richHtml: richActionHtml(topText, {
                                text: 'Открыть Spark', url: playUrl, style: 'success',
                            }),
                            fallbackText: topText,
                            fallbackReplyMarkup: {
                                inline_keyboard: [[{ text: '🎮 Играть', url: playUrl }]],
                            },
                        });
                    }
                }
            }
        }
        
        try {
            const richAnswer = await telegramBotApi('answerInlineQuery', {
                inline_query_id: query.id,
                results,
                cache_time: 0,
            });
            if (!richAnswer.ok) {
                console.warn('Rich inline query rejected, retrying classic format:', richAnswer.description);
                const fallbackAnswer = await telegramBotApi('answerInlineQuery', {
                    inline_query_id: query.id,
                    results: fallbackResults,
                    cache_time: 0,
                });
                if (!fallbackAnswer.ok) {
                    console.error('Answer inline query API error:', fallbackAnswer.description);
                }
            }
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
                const text = `${EMOJI.joystick} <b>${cached.creatorName}</b> хочет сыграть в крестики-нолики!\n\nНажмите любую клетку, чтобы принять вызов.`;
                await editTTTInlineMessage(
                    inlineMessageId, text, createTTTBoard(), resultId,
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
                const text = `${EMOJI.joystick} <b>${cached.creatorName}</b> хочет сыграть в шашки!\n\nНажмите на любую шашку, чтобы принять вызов.`;
                await editCheckersInlineMessage(
                    inlineMessageId, text, createCheckersBoard(), resultId,
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

        if (data && data.startsWith('start_lang_') && callbackQuery.message) {
            const parts = data.split('_');
            const lang = ['ru', 'en', 'zh'].includes(parts[2]) ? parts[2] : 'en';
            const param = parts.slice(3).join('_');
            try { await bot.deleteMessage(callbackQuery.message.chat.id, callbackQuery.message.message_id); } catch (_) {}
            await sendStartGreeting(callbackQuery.message.chat.id, lang, param);
            try { await bot.answerCallbackQuery(callbackQuery.id); } catch (_) {}
            return;
        }

        if (data && (data === 'stats_main' || data.startsWith('stats_online_')) && callbackQuery.message) {
            if (String(user.id) !== String(OWNER_ID)) {
                try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Нет доступа' }); } catch (_) {}
                return;
            }
            const chatId = callbackQuery.message.chat.id;
            if (data === 'stats_main') {
                const original = statsMessages.get(chatId) || 'Статистика устарела. Отправьте /stats ещё раз.';
                await bot.editMessageText(original, {
                    chat_id: chatId, message_id: callbackQuery.message.message_id,
                    parse_mode: 'HTML', reply_markup: { inline_keyboard: [[
                        { text: '👥 Кто сейчас онлайн', callback_data: 'stats_online_0' },
                    ]] },
                });
            } else {
                const unique = new Map();
                for (const entry of onlineUsers.values()) {
                    const id = String(entry.oderId || '');
                    if (!id) continue;
                    const previous = unique.get(id);
                    if (!previous || entry.connectedAt < previous.connectedAt) unique.set(id, entry);
                }
                const list = [...unique.values()].sort((a, b) => a.connectedAt - b.connectedAt);
                const pageSize = 8;
                const maxPage = Math.max(0, Math.ceil(list.length / pageSize) - 1);
                const requestedPage = parseInt(data.replace('stats_online_', ''), 10) || 0;
                const page = Math.max(0, Math.min(maxPage, requestedPage));
                const rows = list.slice(page * pageSize, (page + 1) * pageSize).map((entry, index) => {
                    const name = cleanName(entry.odername) || 'Без имени';
                    const mins = Math.max(0, Math.floor((Date.now() - entry.connectedAt) / 60000));
                    return `${page * pageSize + index + 1}. <b>${name.replace(/[<>&]/g, '')}</b> — <code>${entry.oderId}</code> · ${mins} мин`;
                });
                const nav = [];
                if (page > 0) nav.push({ text: '←', callback_data: `stats_online_${page - 1}` });
                nav.push({ text: `${page + 1}/${maxPage + 1}`, callback_data: `stats_online_${page}` });
                if (page < maxPage) nav.push({ text: '→', callback_data: `stats_online_${page + 1}` });
                await bot.editMessageText(
                    `👥 <b>Сейчас онлайн: ${list.length}</b>\n\n${rows.join('\n') || 'Сейчас никого нет.'}`,
                    { chat_id: chatId, message_id: callbackQuery.message.message_id, parse_mode: 'HTML',
                        reply_markup: { inline_keyboard: [nav, [{ text: '‹ Назад к статистике', callback_data: 'stats_main' }]] } },
                );
            }
            try { await bot.answerCallbackQuery(callbackQuery.id); } catch (_) {}
            return;
        }
        
        /* Проверка игрока монополии: сообщение приходит владельцу в личку,
           поэтому inline_message_id у него нет — обрабатываем до общей проверки. */
        if (data && data.startsWith('mrb_')) {
            if (String(user.id) !== OWNER_ID) {
                try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Нет доступа' }); } catch(e) {}
                return;
            }
            const ban = data.startsWith('mrb_ban_');
            const uid = data.replace(/^mrb_(ban|ok)_/, '');
            const rec = await monoRating.setBanned(uid, ban);
            const verdict = ban
                ? `🚫 Забанен. Очки не начисляются ни ему, ни соперникам в его партиях.`
                : `✅ Проверка пройдена. Всего проверок: ${rec.checked}.`;
            try {
                await bot.editMessageText(
                    (callbackQuery.message.text || '') + '\n\n' + verdict,
                    { chat_id: callbackQuery.message.chat.id, message_id: callbackQuery.message.message_id }
                );
            } catch (e) {}
            try { await bot.answerCallbackQuery(callbackQuery.id, { text: ban ? 'Забанен' : 'Отпущен' }); } catch(e) {}
            return;
        }

        if (!inlineMessageId) {
            try { await bot.answerCallbackQuery(callbackQuery.id); } catch(e) {}
            return;
        }
        
        // === КРЕСТИКИ-НОЛИКИ ===
        if (data.startsWith('ttt_')) {
            const parts = data.split('_');
            const row = parseInt(parts[parts.length - 2]);
            const col = parseInt(parts[parts.length - 1]);
            const gameId = parts.slice(1, -2).join('_');
            
            const game = await ensureTTTInlineGame(inlineMessageId, gameId);
            
            if (!game) {
                try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Игра не найдена или истекла' }); } catch(e) {}
                return;
            }
            if (game.processing) {
                try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ход уже обрабатывается' }); } catch (_) {}
                return;
            }
            game.processing = true;
            try {
            
            const userName = escapeRichHtml(getUserDisplayName(user));
            
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
                    await editTTTInlineMessage(
                        inlineMessageId,
                        `${EMOJI.joystick} <b>Крестики-нолики</b>\n\n${game.playerXName} (❌) vs ${game.playerOName} (⭕)\n\nПервый ход: ${firstPlayerName} (${firstSymbol})`,
                        game.board,
                        game.gameId,
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
                        await editTTTInlineMessage(inlineMessageId, resultText, game.board, game.gameId);
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
                    await editTTTInlineMessage(
                        inlineMessageId,
                        `${EMOJI.joystick} <b>Крестики-нолики</b>\n\n${game.playerXName} (❌) vs ${game.playerOName} (⭕)\n\nХод: ${nextPlayerName} (${nextSymbol})`,
                        game.board,
                        game.gameId,
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
            } finally {
                game.processing = false;
            }
        }
        
        // === ШАШКИ ===
        else if (data.startsWith('ch_')) {
            const parts = data.split('_');
            const row = parseInt(parts[parts.length - 2]);
            const col = parseInt(parts[parts.length - 1]);
            const gameId = parts.slice(1, -2).join('_');
            
            const game = await ensureCheckersInlineGame(inlineMessageId, gameId);
            
            if (!game) {
                try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Игра не найдена или истекла' }); } catch(e) {}
                return;
            }
            if (game.processing) {
                try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ход уже обрабатывается' }); } catch (_) {}
                return;
            }
            game.processing = true;
            try {
            
            const userName = escapeRichHtml(getUserDisplayName(user));
            
            // Ожидание второго игрока
            if (game.status === 'waiting') {
                if (String(user.id) === String(game.playerWhite.id)) {
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
                    await editCheckersInlineMessage(
                        inlineMessageId,
                        `${EMOJI.joystick} <b>Шашки</b>\n\n${game.playerWhiteName} (⚪) vs ${game.playerBlackName} (⚫)\n\nПервый ход: ${firstPlayerName} (${firstSymbol})`,
                        game.board,
                        game.gameId,
                    );
                    await bot.answerCallbackQuery(callbackQuery.id, { text: `Игра началась! Ход ${firstPlayerName}` });
                } catch (e) {
                    console.error('Edit error:', e.message);
                }
                return;
            }
            
            // Игра идёт
            if (game.status === 'playing') {
                const isWhite = String(user.id) === String(game.playerWhite.id);
                const isBlack = String(user.id) === String(game.playerBlack?.id);
                
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
                        const nextOptions = getValidMoves(game.board, row, col, playerColor);
                        if (mustCapture && nextOptions.captures.length === 0) {
                            try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Выберите шашку, которая может бить!' }); } catch (_) {}
                            return;
                        }
                        game.selected = { r: row, c: col };
                        try {
                            await editCheckersInlineMessage(
                                inlineMessageId,
                                `${EMOJI.joystick} <b>Шашки</b>\n\n${game.playerWhiteName} (⚪) vs ${game.playerBlackName} (⚫)\n\nХод: ${userName} — выберите клетку`,
                                game.board,
                                game.gameId,
                                game.selected,
                            );
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
                        const achievement = checkersAchievement(game, playerColor);
                        achievement.captureChain += 1;
                        achievement.maxCapture = Math.max(achievement.maxCapture, achievement.captureChain);
                        const piece = game.board[game.selected.r][game.selected.c];
                        game.board[row][col] = piece;
                        game.board[game.selected.r][game.selected.c] = { type: 'empty' };
                        game.board[capture.capturedR][capture.capturedC] = { type: 'empty' };
                        
                        // Проверяем превращение в дамку
                        if ((playerColor === 'white' && row === 0) || (playerColor === 'black' && row === 7)) {
                            if (!game.board[row][col].isKing) achievement.crowned = true;
                            game.board[row][col].isKing = true;
                        }
                        
                        // Проверяем можно ли бить ещё
                        const { captures: moreCaps } = getValidMoves(game.board, row, col, playerColor);
                        if (moreCaps.length > 0) {
                            game.selected = { r: row, c: col };
                            try {
                                await editCheckersInlineMessage(
                                    inlineMessageId,
                                    `${EMOJI.joystick} <b>Шашки</b>\n\n${game.playerWhiteName} (⚪) vs ${game.playerBlackName} (⚫)\n\n${userName}: бейте ещё`,
                                    game.board,
                                    game.gameId,
                                    game.selected,
                                );
                                await bot.answerCallbackQuery(callbackQuery.id, { text: 'Бей ещё!' });
                            } catch (e) {}
                            return;
                        }
                        achievement.captureChain = 0;
                    } else if (move && !mustCapture) {
                        // Обычный ход
                        const achievement = checkersAchievement(game, playerColor);
                        achievement.captureChain = 0;
                        const piece = game.board[game.selected.r][game.selected.c];
                        game.board[row][col] = piece;
                        game.board[game.selected.r][game.selected.c] = { type: 'empty' };
                        
                        // Проверяем превращение в дамку
                        if ((playerColor === 'white' && row === 0) || (playerColor === 'black' && row === 7)) {
                            if (!game.board[row][col].isKing) achievement.crowned = true;
                            game.board[row][col].isKing = true;
                        }
                    } else {
                        try { await bot.answerCallbackQuery(callbackQuery.id, { text: 'Нельзя туда ходить!' }); } catch(e) {}
                        return;
                    }
                    
                    game.selected = null;
                    
                    // Меняем ход
                    const opponentColor = playerColor === 'white' ? 'black' : 'white';
                    updateCheckersDeficits(game);
                    
                    // Проверяем победу
                    const opponentPieces = countPieces(game.board, opponentColor);
                    const opponentCanMove = hasAnyMoves(game.board, opponentColor);
                    
                    if (opponentPieces === 0 || !opponentCanMove) {
                        game.status = 'finished';
                        const winnerName = playerColor === 'white' ? game.playerWhiteName : game.playerBlackName;
                        const winnerSymbol = playerColor === 'white' ? '⚪' : '⚫';
                        const playerIds = {
                            white: String(game.playerWhite.id),
                            black: String(game.playerBlack.id),
                        };
                        const contexts = {};
                        for (const color of ['white', 'black']) {
                            const achievement = checkersAchievement(game, color);
                            contexts[playerIds[color]] = {
                                eventId: `checkers-inline:${game.gameId}`,
                                crowned: achievement.crowned,
                                maxCapture: achievement.maxCapture,
                                maxDeficit: achievement.maxDeficit,
                                lostPieces: 12 - countPieces(game.board, color),
                            };
                        }
                        
                        await recordInlineCheckersResult(
                            [game.playerWhite.id, game.playerBlack.id],
                            playerColor === 'white' ? game.playerWhite.id : game.playerBlack.id,
                            contexts,
                        );
                        
                        try {
                            await editCheckersInlineMessage(
                                inlineMessageId,
                                `${EMOJI.joystick} <b>Шашки</b>\n\n${game.playerWhiteName} (⚪) vs ${game.playerBlackName} (⚫)\n\n${EMOJI.trophy} <b>${winnerName}</b> победил! ${winnerSymbol}`,
                                game.board,
                                game.gameId,
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
                        await editCheckersInlineMessage(
                            inlineMessageId,
                            `${EMOJI.joystick} <b>Шашки</b>\n\n${game.playerWhiteName} (⚪) vs ${game.playerBlackName} (⚫)\n\nХод: ${nextName} (${nextSymbol})`,
                            game.board,
                            game.gameId,
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
                            await editCheckersInlineMessage(
                                inlineMessageId,
                                `${EMOJI.joystick} <b>Шашки</b>\n\n${game.playerWhiteName} (⚪) vs ${game.playerBlackName} (⚫)\n\nХод: ${userName} — выберите клетку`,
                                game.board,
                                game.gameId,
                                game.selected,
                            );
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
            } finally {
                game.processing = false;
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
            const onlineNow = new Set([...onlineUsers.values()].map(x => String(x.oderId))).size;
            
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
            
            statsMessages.set(chatId, statsMessage);
            bot.sendMessage(chatId, statsMessage, {
                parse_mode: 'HTML', reply_markup: { inline_keyboard: [[
                    { text: `👥 Кто онлайн (${onlineNow})`, callback_data: 'stats_online_0' },
                ]] },
            });
            
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
    bot.onText(/\/start(.*)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const param = String(match[1] || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
        const lang = botLanguage(msg.from && msg.from.language_code);
        if (lang) return sendStartGreeting(chatId, lang, param);
        return bot.sendMessage(chatId, 'Choose your language · Выберите язык · 请选择语言', {
            reply_markup: { inline_keyboard: [[
                { text: '🇷🇺 Русский', callback_data: `start_lang_ru_${param}` },
                { text: '🇺🇸 English', callback_data: `start_lang_en_${param}` },
                { text: '🇨🇳 中文', callback_data: `start_lang_zh_${param}` },
            ]] },
        });
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
            .not('activity_type', 'like', `${PLAYTIME_ACTIVITY_PREFIX}%`)
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
