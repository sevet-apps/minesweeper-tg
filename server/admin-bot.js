// ============================================================
// admin-bot.js
// /admin command + inline keyboard for tournament management.
//
// Admin: telegram_id 1482228376 (@lagaet).
// Add more admins to ADMIN_IDS if needed.
//
// Usage from index.js (after `bot` is created):
//     const { registerAdminBot } = require('./admin-bot');
//     registerAdminBot({ bot, supabase });
// ============================================================

const ADMIN_IDS = new Set([
    '1482228376', // @lagaet
]);

// Conversation state per admin: what input we're waiting for.
// Map<adminTelegramId, { action, payload, chatId, messageId }>
const pendingInput = new Map();

// ---- helpers ----------------------------------------------------------------

function isAdmin(userId) {
    return ADMIN_IDS.has(String(userId));
}

function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' });
}

function statusLabel(s) {
    return ({
        upcoming: '🕐 Ожидает',
        active:   '🟢 Активен',
        ended:    '🔴 Завершён',
        archived: '📦 В архиве',
    })[s] || s;
}

function kindLabel(k) {
    return k === 'bb' ? '🧱 Block Blast' : k === 'referral' ? '👥 Рефоводы' : k;
}

// Parse '7d' / '48h' / '2026-04-30' / '2026-04-30 18:00' into a Date.
function parseDuration(input) {
    if (!input) return null;
    const s = String(input).trim();
    const rel = s.match(/^(\d+)\s*(d|h|m|day|days|hour|hours|min|minutes|д|ч|м)$/i);
    if (rel) {
        const n = parseInt(rel[1], 10);
        const u = rel[2].toLowerCase();
        const ms =
            u.startsWith('d') || u === 'д'                ? n * 86_400_000 :
            u.startsWith('h') || u === 'ч'                ? n * 3_600_000  :
            u.startsWith('m') || u === 'min' || u === 'м' ? n * 60_000     :
            null;
        if (ms === null) return null;
        return new Date(Date.now() + ms);
    }
    const dt = new Date(s.replace(' ', 'T'));
    return isNaN(dt.getTime()) ? null : dt;
}

// ---- bot UI -----------------------------------------------------------------

function rootMenuKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '📋 Список турниров',     callback_data: 'admin:list' }],
            [{ text: '➕ Создать (BB)',         callback_data: 'admin:create:bb' },
             { text: '➕ Создать (Реф)',        callback_data: 'admin:create:referral' }],
            [{ text: '🏁 Завершить + снапшот', callback_data: 'admin:end_menu' }],
            [{ text: '🗂 История турниров',    callback_data: 'admin:history' }],
        ],
    };
}

async function sendRootMenu(bot, chatId, messageId) {
    const text = '*Админ-панель турниров*\n\nВыберите действие:';
    const opts = { parse_mode: 'Markdown', reply_markup: rootMenuKeyboard() };
    if (messageId) {
        try { await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts }); return; }
        catch (e) { /* fall through to send */ }
    }
    await bot.sendMessage(chatId, text, opts);
}

// ---- list / history ---------------------------------------------------------

async function showList(bot, supabase, chatId, messageId) {
    const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, kind, status, start_at, end_at, prize_text')
        .in('status', ['upcoming', 'active', 'ended'])
        .order('start_at', { ascending: false })
        .limit(20);

    let text = '*Турниры (без архивных)*\n\n';
    if (error) {
        text += '_Ошибка чтения базы._';
    } else if (!data || data.length === 0) {
        text += '_Турниров нет. Создайте новый._';
    } else {
        for (const t of data) {
            text += `*#${t.id}* ${kindLabel(t.kind)} — ${t.name}\n`;
            text += `${statusLabel(t.status)} · ${t.prize_text || '—'} · до ${fmtDate(t.end_at)}\n\n`;
        }
    }

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin:root' }]] },
    });
}

async function showHistory(bot, supabase, chatId, messageId) {
    const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, kind, end_at, prize_text')
        .eq('status', 'archived')
        .order('end_at', { ascending: false })
        .limit(20);

    let text = '*Архив турниров*\n\n';
    if (error) {
        text += '_Ошибка чтения базы._';
    } else if (!data || data.length === 0) {
        text += '_Архив пуст._';
    } else {
        for (const t of data) {
            text += `*#${t.id}* ${kindLabel(t.kind)} — ${t.name}\n`;
            text += `завершён ${fmtDate(t.end_at)} · ${t.prize_text || '—'}\n\n`;
        }
        text += '_Подробные таблицы доступны во фронте, во вкладке «История»._';
    }

    await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin:root' }]] },
    });
}

// ---- create flow ------------------------------------------------------------

async function startCreateFlow(bot, chatId, messageId, adminId, kind) {
    pendingInput.set(String(adminId), {
        action: 'create',
        chatId, messageId,
        payload: { kind, step: 'name' },
    });

    const example = kind === 'bb'
        ? 'BB турнир — Май 2026'
        : 'Реф турнир — Май 2026';

    const totalSteps = kind === 'bb' ? '5' : '3';

    await bot.editMessageText(
        `*Создание турнира (${kindLabel(kind)})*\n\n` +
        `Шаг 1/${totalSteps} — отправьте *название* турнира (как покажется на плашке).\n\n` +
        `Пример: \`${example}\``,
        {
            chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '✖️ Отмена', callback_data: 'admin:cancel' }]] },
        }
    );
}

async function continueCreateFlow(bot, supabase, msg, state) {
    const { chatId } = state;
    const text = msg.text.trim();
    const totalSteps = state.payload.kind === 'bb' ? 5 : 3;

    if (state.payload.step === 'name') {
        if (text.length < 3 || text.length > 80) {
            await bot.sendMessage(chatId, '⚠️ Название от 3 до 80 символов. Повторите.');
            return;
        }
        state.payload.name = text;
        state.payload.step = 'duration';
        await bot.sendMessage(chatId,
            `Шаг 2/${totalSteps} — *длительность* или дата окончания.\n\n` +
            'Примеры: `7d` (7 дней), `48h` (48 часов), `2026-05-15`, `2026-05-15 21:00`',
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (state.payload.step === 'duration') {
        const endAt = parseDuration(text);
        if (!endAt || endAt.getTime() < Date.now() + 60_000) {
            await bot.sendMessage(chatId, '⚠️ Не понял дату/длительность, или она в прошлом. Примеры: `7d`, `48h`, `2026-05-15`.', { parse_mode: 'Markdown' });
            return;
        }
        state.payload.endAt = endAt;
        state.payload.step = 'prize';
        await bot.sendMessage(chatId,
            `Шаг 3/${totalSteps} — *призовой фонд* (текст на плашке).\n\n` +
            'Пример: `150$` или `5000 ⭐`. Можно прислать `-` чтобы оставить пустым.',
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (state.payload.step === 'prize') {
        state.payload.prize = (text === '-' || text === '—') ? null : text.slice(0, 40);

        // For referral tournaments — done; insert now.
        if (state.payload.kind !== 'bb') {
            return await finalizeCreate(bot, supabase, msg, state);
        }

        // BB tournaments get multiplier + CTA url
        state.payload.step = 'multiplier';
        await bot.sendMessage(chatId,
            'Шаг 4/5 — *множитель очков* для подписчиков партнёра.\n\n' +
            'Введите число, например `1.5`. Если множителя нет — пришлите `1` или `-`.',
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (state.payload.step === 'multiplier') {
        let mult = 1.0;
        if (text !== '-' && text !== '—') {
            const parsed = parseFloat(text.replace(',', '.'));
            if (!isFinite(parsed) || parsed < 1.0 || parsed > 10.0) {
                await bot.sendMessage(chatId, '⚠️ Множитель должен быть числом от 1.0 до 10.0. Например `1.5`.', { parse_mode: 'Markdown' });
                return;
            }
            mult = parsed;
        }
        state.payload.multiplier = mult;
        state.payload.step = 'cta';
        await bot.sendMessage(chatId,
            'Шаг 5/5 — *ссылка партнёра* (CTA на турнирной карточке).\n\n' +
            'Например: `https://t.me/phantomio_bot?start=spark`. Если множителя нет или ссылка не нужна — пришлите `-`.',
            { parse_mode: 'Markdown' }
        );
        return;
    }

    if (state.payload.step === 'cta') {
        let cta = null;
        if (text !== '-' && text !== '—') {
            if (!/^https?:\/\//i.test(text)) {
                await bot.sendMessage(chatId, '⚠️ Ссылка должна начинаться с `http://` или `https://`. Или пришлите `-`.', { parse_mode: 'Markdown' });
                return;
            }
            cta = text.slice(0, 500);
        }
        state.payload.cta = cta;
        return await finalizeCreate(bot, supabase, msg, state);
    }
}

async function finalizeCreate(bot, supabase, msg, state) {
    const { chatId } = state;
    const { kind, name, endAt, prize, multiplier, cta } = state.payload;

    // Build slug: kind_YYYYMMDD_HHMM (unique enough)
    const ts = endAt.toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const slug = `${kind}_${ts}`;

    const insertRow = {
        slug,
        name,
        kind,
        start_at: new Date().toISOString(),
        end_at: endAt.toISOString(),
        multiplier: multiplier || 1.0,
        status: 'active',
        prize_text: prize || null,
    };
    if (cta) insertRow.partner_cta_url = cta;
    if (multiplier && multiplier > 1.0) insertRow.partner_slug = 'vpn_partner';

    const { data, error } = await supabase
        .from('tournaments').insert(insertRow).select('id').single();

    pendingInput.delete(String(msg.from.id));

    if (error) {
        await bot.sendMessage(chatId, `❌ Ошибка создания: ${error.message}`);
        return;
    }

    let summary = `✅ Турнир создан: *#${data.id}* ${kindLabel(kind)} — ${name}\n` +
                  `Завершится ${fmtDate(endAt)}. Призовой фонд: ${prize || '—'}.`;
    if (multiplier && multiplier > 1.0) {
        summary += `\nМножитель: *×${multiplier}* для подписчиков партнёра.`;
    }
    if (cta) summary += `\nCTA: ${cta}`;

    await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' });
    await sendRootMenu(bot, chatId);
}

// ---- end-tournament flow ----------------------------------------------------

async function showEndMenu(bot, supabase, chatId, messageId) {
    const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, kind, end_at, prize_text')
        .in('status', ['active', 'ended'])
        .order('end_at', { ascending: true })
        .limit(20);

    if (error || !data || data.length === 0) {
        await bot.editMessageText('_Нет турниров для завершения._', {
            chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin:root' }]] },
        });
        return;
    }

    const buttons = data.map(t => [{
        text: `${kindLabel(t.kind)} #${t.id} — ${t.name}`,
        callback_data: `admin:end:${t.id}`,
    }]);
    buttons.push([{ text: '⬅️ Назад', callback_data: 'admin:root' }]);

    await bot.editMessageText(
        '*Какой турнир завершить?*\n\nПри завершении будет создан снапшот топ-50 (для BB — из текущего лидерборда, для рефов — из активированных рефералов).',
        { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
    );
}

async function snapshotAndArchive(bot, supabase, chatId, messageId, tournamentId) {
    // 1) Load tournament
    const { data: t, error: tErr } = await supabase
        .from('tournaments').select('*').eq('id', tournamentId).single();
    if (tErr || !t) {
        await bot.editMessageText(`❌ Турнир не найден.`, { chat_id: chatId, message_id: messageId });
        return;
    }
    if (t.status === 'archived') {
        await bot.editMessageText(`ℹ️ Турнир #${tournamentId} уже в архиве.`, {
            chat_id: chatId, message_id: messageId,
            reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'admin:root' }]] },
        });
        return;
    }

    // 2) Build top-50 list according to tournament kind
    let topRows = [];
    if (t.kind === 'bb') {
        const { data, error } = await supabase
            .from('users')
            .select('telegram_id, username, photo_url, bb_best_score')
            .not('bb_best_score', 'is', null)
            .gt('bb_best_score', 0)
            .order('bb_best_score', { ascending: false })
            .limit(50);
        if (error) {
            await bot.editMessageText(`❌ Ошибка чтения BB-лидерборда: ${error.message}`, { chat_id: chatId, message_id: messageId });
            return;
        }
        topRows = (data || []).map((u, i) => ({
            tournament_id: t.id,
            rank: i + 1,
            telegram_id: String(u.telegram_id),
            username: u.username,
            photo_url: u.photo_url,
            score: u.bb_best_score,
        }));
    } else if (t.kind === 'referral') {
        // Same logic as /referral-leaderboard: count activated referrals per referrer.
        const { data: activated, error: aErr } = await supabase
            .from('users')
            .select('referred_by')
            .eq('referral_activated', true);
        if (aErr) {
            await bot.editMessageText(`❌ Ошибка чтения рефов: ${aErr.message}`, { chat_id: chatId, message_id: messageId });
            return;
        }
        const counts = {};
        for (const r of (activated || [])) {
            const ref = String(r.referred_by);
            if (!ref || ref === 'null') continue;
            counts[ref] = (counts[ref] || 0) + 1;
        }
        const ids = Object.keys(counts);
        let infoMap = {};
        if (ids.length > 0) {
            const { data: refs } = await supabase
                .from('users').select('telegram_id, username, photo_url').in('telegram_id', ids);
            for (const u of (refs || [])) infoMap[String(u.telegram_id)] = u;
        }
        topRows = ids
            .map(id => ({
                telegram_id: id,
                username:    infoMap[id]?.username || null,
                photo_url:   infoMap[id]?.photo_url || null,
                score:       counts[id],
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 50)
            .map((u, i) => ({ tournament_id: t.id, rank: i + 1, ...u }));
    }

    // 3) Insert history rows (clear any partial previous attempt first)
    if (topRows.length > 0) {
        await supabase.from('tournament_history_entries').delete().eq('tournament_id', t.id);
        const { error: insErr } = await supabase.from('tournament_history_entries').insert(topRows);
        if (insErr) {
            await bot.editMessageText(`❌ Ошибка снапшота: ${insErr.message}`, { chat_id: chatId, message_id: messageId });
            return;
        }
    }

    // 4) Mark tournament archived
    const { error: updErr } = await supabase
        .from('tournaments')
        .update({ status: 'archived', end_at: new Date().toISOString() })
        .eq('id', t.id);
    if (updErr) {
        await bot.editMessageText(`⚠️ Снапшот сохранён, но не удалось обновить статус: ${updErr.message}`, { chat_id: chatId, message_id: messageId });
        return;
    }

    const winner = topRows[0];
    const winnerLine = winner
        ? `🏆 Победитель: *${winner.username || winner.telegram_id}* — ${winner.score}`
        : '_Участников не было._';

    await bot.editMessageText(
        `✅ Турнир *#${t.id}* (${kindLabel(t.kind)}) завершён.\n` +
        `Снапшот: ${topRows.length} участников.\n${winnerLine}`,
        {
            chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '⬅️ В меню', callback_data: 'admin:root' }]] },
        }
    );
}

// ---- registration -----------------------------------------------------------

function registerAdminBot({ bot, supabase }) {
    if (!bot) {
        console.warn('[admin-bot] bot instance not available — skipping');
        return;
    }

    // /admin command
    bot.onText(/^\/admin(?:@\w+)?\s*$/, async (msg) => {
        if (!isAdmin(msg.from.id)) return; // silently ignore non-admins
        await sendRootMenu(bot, msg.chat.id);
    });

    // Free-text input handler — only fires when admin is mid-flow
    bot.on('message', async (msg) => {
        if (!msg.text || msg.text.startsWith('/')) return;
        if (!isAdmin(msg.from.id)) return;
        const state = pendingInput.get(String(msg.from.id));
        if (!state) return;
        try {
            if (state.action === 'create') await continueCreateFlow(bot, supabase, msg, state);
        } catch (e) {
            console.error('[admin-bot] flow error:', e);
            pendingInput.delete(String(msg.from.id));
            await bot.sendMessage(msg.chat.id, '❌ Внутренняя ошибка, отменил операцию.');
        }
    });

    // Callback queries — namespaced 'admin:*' so we don't clash with existing handlers
    bot.on('callback_query', async (cq) => {
        const data = cq.data || '';
        if (!data.startsWith('admin:')) return;
        if (!isAdmin(cq.from.id)) {
            try { await bot.answerCallbackQuery(cq.id, { text: 'Нет доступа' }); } catch (_) {}
            return;
        }

        const chatId = cq.message.chat.id;
        const messageId = cq.message.message_id;
        const parts = data.split(':');

        try { await bot.answerCallbackQuery(cq.id); } catch (_) {}

        try {
            if (parts[1] === 'root') {
                pendingInput.delete(String(cq.from.id));
                await sendRootMenu(bot, chatId, messageId);
            } else if (parts[1] === 'list') {
                await showList(bot, supabase, chatId, messageId);
            } else if (parts[1] === 'history') {
                await showHistory(bot, supabase, chatId, messageId);
            } else if (parts[1] === 'create') {
                const kind = parts[2];
                if (kind !== 'bb' && kind !== 'referral') return;
                await startCreateFlow(bot, chatId, messageId, cq.from.id, kind);
            } else if (parts[1] === 'cancel') {
                pendingInput.delete(String(cq.from.id));
                await sendRootMenu(bot, chatId, messageId);
            } else if (parts[1] === 'end_menu') {
                await showEndMenu(bot, supabase, chatId, messageId);
            } else if (parts[1] === 'end') {
                const id = parseInt(parts[2], 10);
                if (Number.isInteger(id)) await snapshotAndArchive(bot, supabase, chatId, messageId, id);
            }
        } catch (e) {
            console.error('[admin-bot] callback error:', e);
            try { await bot.sendMessage(chatId, `❌ Ошибка: ${e.message}`); } catch (_) {}
        }
    });

    console.log('[admin-bot] registered, admins:', [...ADMIN_IDS]);
}

module.exports = { registerAdminBot, isAdmin };