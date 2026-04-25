// ============================================================
// partner-vpn.js
// Single point of truth for "does this user have an active VPN
// subscription with the partner?"
//
// Right now we read from our own Supabase table `partner_vpn_subs`,
// which is a stub. When the partner gives us real access, we swap
// the body of `hasPartnerVpnSubscription` and nothing else changes.
//
// Possible future implementations:
//   A) same Supabase, table populated by partner via API key (current)
//   B) separate Supabase client (partner's own DB)
//   C) HTTP call to partner's REST API
// ============================================================

// Tiny in-memory cache so we don't hammer the DB on every game-over.
// 60s TTL is enough — subscription state changes rarely.
const cache = new Map(); // key: `${userId}:${partnerSlug}` -> { active, ts }
const TTL_MS = 60_000;

function cacheGet(userId, partnerSlug) {
    const key = `${userId}:${partnerSlug}`;
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.ts > TTL_MS) {
        cache.delete(key);
        return null;
    }
    return hit.active;
}

function cacheSet(userId, partnerSlug, active) {
    cache.set(`${userId}:${partnerSlug}`, { active, ts: Date.now() });
}

/**
 * @param {object} supabase - initialized supabase client (passed in to avoid circular import)
 * @param {string|number} telegramId
 * @param {string} partnerSlug - tournament's partner_slug, e.g. 'vpn_partner'
 * @returns {Promise<boolean>}
 */
async function hasPartnerVpnSubscription(supabase, telegramId, partnerSlug) {
    if (!telegramId || !partnerSlug) return false;

    const userId = String(telegramId);
    const cached = cacheGet(userId, partnerSlug);
    if (cached !== null) return cached;

    try {
        const { data, error } = await supabase
            .from('partner_vpn_subs')
            .select('active, expires_at')
            .eq('telegram_id', userId)
            .eq('partner_slug', partnerSlug)
            .maybeSingle();

        if (error) {
            console.warn(`[partner-vpn] supabase error for ${userId}:`, error.message);
            cacheSet(userId, partnerSlug, false);
            return false;
        }

        if (!data) {
            cacheSet(userId, partnerSlug, false);
            return false;
        }

        const notExpired = !data.expires_at || new Date(data.expires_at) > new Date();
        const active = Boolean(data.active) && notExpired;
        cacheSet(userId, partnerSlug, active);
        return active;
    } catch (e) {
        console.warn(`[partner-vpn] unexpected error for ${userId}:`, e.message);
        return false;
    }
}

/**
 * Manual cache bust — call after admin edits in the table or after
 * webhook from partner says "subscription updated for user X".
 */
function invalidateCache(telegramId, partnerSlug) {
    if (telegramId && partnerSlug) {
        cache.delete(`${String(telegramId)}:${partnerSlug}`);
    } else if (telegramId) {
        for (const k of cache.keys()) {
            if (k.startsWith(`${String(telegramId)}:`)) cache.delete(k);
        }
    } else {
        cache.clear();
    }
}

module.exports = {
    hasPartnerVpnSubscription,
    invalidateCache,
};
