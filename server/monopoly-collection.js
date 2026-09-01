'use strict';

const catalog = require('../monopoly/assets/skins/catalog.json');
const { normalizeTelegramId } = require('./telegram-id');

const SKINS = new Map(catalog.skins.map(skin => [skin.id, Object.freeze({ ...skin })]));
const ODDS = Object.entries(catalog.case.odds);
const PUBLIC_USER_FIELDS = [
    'telegram_id', 'username', 'photo_url',
    'saper_total', 'saper_wins',
    'checkers_total', 'checkers_wins_pve',
    'bb_total_games', 'sudoku_wins', 'wordle_wins',
    'tower_best',
].join(',');

function cleanTelegramId(value) {
    const normalized = normalizeTelegramId(value);
    if (!normalized) throw new Error('invalid_user');
    return String(normalized);
}

function chooseRarity(random = Math.random) {
    const roll = Math.max(0, Math.min(.999999999, Number(random()) || 0)) * 100;
    let cursor = 0;
    for (const [rarity, chance] of ODDS) {
        cursor += Number(chance) || 0;
        if (roll < cursor) return rarity;
    }
    return ODDS[ODDS.length - 1][0];
}

function chooseSkin(rarity, random = Math.random) {
    const pool = catalog.skins.filter(skin => skin.rarity === rarity);
    if (!pool.length) throw new Error('empty_rarity_pool');
    return pool[Math.floor(Math.max(0, Math.min(.999999999, Number(random()) || 0)) * pool.length)];
}

function applyRentBonus(amount, bonusBps) {
    const base = Math.max(0, Number(amount) || 0);
    return Math.round(base * (1 + Math.max(0, Number(bonusBps) || 0) / 10000));
}

function publicCatalog() {
    return {
        version: catalog.version,
        case: catalog.case,
        rarities: catalog.rarities,
        skins: catalog.skins,
    };
}

function throwDb(error) {
    if (!error) return;
    const out = new Error(error.message || error.code || 'collection_database_error');
    out.code = error.code;
    throw out;
}

function makeCollection({ supabase, log = console.warn, random = Math.random }) {
    async function syncRatingCases(rawId) {
        const telegramId = cleanTelegramId(rawId);
        const { data, error } = await supabase.rpc('monopoly_sync_rating_cases', {
            p_telegram_id: telegramId,
        });
        throwDb(error);
        return (data && data[0]) || { cases_granted: 0, cases_balance: 0, milestones: 0 };
    }

    async function profile(rawId, { sync = false } = {}) {
        const telegramId = cleanTelegramId(rawId);
        if (sync) {
            try { await syncRatingCases(telegramId); }
            catch (error) { log('[monopoly-collection] sync:', error.message); }
        }
        const [accountRes, inventoryRes, loadoutRes, openingsRes, ratingRes, userRes] = await Promise.all([
            supabase.from('monopoly_collectible_accounts').select('*').eq('telegram_id', telegramId).maybeSingle(),
            supabase.from('monopoly_skin_inventory').select('skin_id,quantity,first_acquired_at').eq('telegram_id', telegramId),
            supabase.from('monopoly_skin_loadout').select('tile_id,skin_id,group_id').eq('telegram_id', telegramId),
            supabase.from('monopoly_case_openings').select('id,skin_id,rarity,opened_at').eq('telegram_id', telegramId).is('claimed_at', null).order('opened_at', { ascending: true }),
            supabase.from('monopoly_rating').select('points,wins,games').eq('uid', telegramId).maybeSingle(),
            /* Never expose the complete users row through a public player profile.
               The table also contains internal progress and referral fields. */
            supabase.from('users').select(PUBLIC_USER_FIELDS).eq('telegram_id', telegramId).maybeSingle(),
        ]);
        [accountRes, inventoryRes, loadoutRes, openingsRes, ratingRes].forEach(result => throwDb(result.error));
        if (userRes.error) log('[monopoly-collection] user profile:', userRes.error.message);
        const inventory = (inventoryRes.data || []).map(row => ({ ...row, skin: SKINS.get(row.skin_id) || null }));
        const loadout = (loadoutRes.data || []).map(row => ({ ...row, skin: SKINS.get(row.skin_id) || null }));
        const pendingOpenings = (openingsRes.data || []).map(row => ({ ...row, skin: SKINS.get(row.skin_id) || null }));
        return {
            telegramId,
            account: accountRes.data || { telegram_id: telegramId, cases_count: 0, coins: 0, rating_milestones: 0 },
            inventory,
            loadout,
            pendingOpenings,
            rating: ratingRes.data || { points: 0, wins: 0, games: 0 },
            user: userRes.data || null,
            catalog: publicCatalog(),
        };
    }

    async function loadLoadout(rawId) {
        const telegramId = cleanTelegramId(rawId);
        const { data, error } = await supabase.from('monopoly_skin_loadout')
            .select('tile_id,skin_id,group_id').eq('telegram_id', telegramId);
        throwDb(error);
        const out = {};
        for (const row of data || []) {
            const skin = SKINS.get(row.skin_id);
            if (!skin || !skin.compatibleTiles.includes(Number(row.tile_id)) || skin.groupId !== row.group_id) continue;
            out[row.tile_id] = skin;
        }
        return out;
    }

    async function openCase(rawId) {
        const telegramId = cleanTelegramId(rawId);
        const rarity = chooseRarity(random);
        const skin = chooseSkin(rarity, random);
        const { data, error } = await supabase.rpc('monopoly_open_case', {
            p_telegram_id: telegramId,
            p_skin_id: skin.id,
            p_rarity: rarity,
        });
        throwDb(error);
        const row = (data && data[0]) || {};
        return { ...row, rarity, skin };
    }

    async function claimOpening(rawId, openingId) {
        const telegramId = cleanTelegramId(rawId);
        const { data, error } = await supabase.rpc('monopoly_claim_opening', {
            p_telegram_id: telegramId, p_opening_id: openingId,
        });
        throwDb(error);
        return !!data;
    }

    async function equip(rawId, skinId, tileId) {
        const telegramId = cleanTelegramId(rawId);
        const skin = SKINS.get(String(skinId || ''));
        const tile = Number(tileId);
        if (!skin || !Number.isInteger(tile) || !skin.compatibleTiles.includes(tile)) throw new Error('incompatible_skin');
        const { data, error } = await supabase.rpc('monopoly_equip_skin', {
            p_telegram_id: telegramId, p_skin_id: skin.id, p_tile_id: tile, p_group_id: skin.groupId,
        });
        throwDb(error);
        return { ok: !!data, skin, tileId: tile };
    }

    async function unequip(rawId, tileId) {
        const telegramId = cleanTelegramId(rawId);
        const tile = Number(tileId);
        if (!Number.isInteger(tile)) throw new Error('invalid_tile');
        const { data, error } = await supabase.rpc('monopoly_unequip_skin', {
            p_telegram_id: telegramId, p_tile_id: tile,
        });
        throwDb(error);
        return { ok: !!data, tileId: tile };
    }

    async function exchange(rawId, skinId) {
        const telegramId = cleanTelegramId(rawId);
        const skin = SKINS.get(String(skinId || ''));
        if (!skin) throw new Error('unknown_skin');
        const { data, error } = await supabase.rpc('monopoly_exchange_duplicate', {
            p_telegram_id: telegramId, p_skin_id: skin.id, p_coins: skin.exchangeValue,
        });
        throwDb(error);
        return { ...((data && data[0]) || {}), skin };
    }

    async function grantCases(rawId, amount, options = {}) {
        const telegramId = cleanTelegramId(rawId);
        const count = Number(amount);
        if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('invalid_case_amount');
        const { data, error } = await supabase.rpc('monopoly_grant_cases', {
            p_telegram_id: telegramId,
            p_amount: count,
            p_source: options.source || 'admin',
            p_source_key: options.sourceKey || `admin:${Date.now()}:${telegramId}`,
            p_reason: options.reason || null,
            p_admin_id: options.adminId ? String(options.adminId) : null,
        });
        throwDb(error);
        return { telegramId, ...((data && data[0]) || {}) };
    }

    async function resolveUser(target) {
        const raw = String(target || '').trim();
        if (!raw) throw new Error('user_required');
        if (/^(?:tg)?\d+$/.test(raw)) return cleanTelegramId(raw);
        const username = raw.replace(/^@/, '').toLowerCase();
        const { data, error } = await supabase.from('users').select('telegram_id,username')
            .ilike('username', username).limit(1).maybeSingle();
        throwDb(error);
        if (!data || !data.telegram_id) throw new Error('user_not_found');
        return cleanTelegramId(data.telegram_id);
    }

    return {
        catalog: publicCatalog, profile, loadLoadout, openCase, claimOpening,
        equip, unequip, exchange, syncRatingCases, grantCases, resolveUser,
    };
}

module.exports = { makeCollection, chooseRarity, chooseSkin, applyRentBonus, catalog };
