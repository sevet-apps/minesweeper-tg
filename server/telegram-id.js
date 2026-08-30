'use strict';

/**
 * Monopoly keeps `tg123` identifiers inside live rooms, while the shared
 * profile/titles tables use the Telegram numeric id (`123`).  Normalize only
 * at persistence boundaries so room protocol identifiers stay untouched.
 */
function normalizeTelegramId(value) {
    const id = String(value == null ? '' : value).trim();
    const legacy = /^tg([0-9]+)$/.exec(id);
    return legacy ? legacy[1] : id;
}

function telegramIdAliases(value) {
    const id = normalizeTelegramId(value);
    if (!id) return [];
    return /^[0-9]+$/.test(id) ? [id, `tg${id}`] : [id];
}

module.exports = { normalizeTelegramId, telegramIdAliases };
