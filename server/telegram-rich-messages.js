'use strict';

function escapeRichHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function classicHtmlToRichHtml(text) {
    const lines = String(text || '').split('\n');
    const heading = lines.shift() || 'Spark Games';
    const body = lines.join('\n').trim();
    return `<h3>${heading}</h3>` +
        (body ? `<p>${body.replace(/\n/g, '<br/>')}</p>` : '');
}

function richMessageContent(html) {
    return {
        rich_message: {
            html,
            skip_entity_detection: true,
        },
    };
}

function buttonStyle(button, options) {
    if (typeof options.styleForButton === 'function') {
        return options.styleForButton(button) || '';
    }
    return '';
}

function keyboardToRichHtml(replyMarkup, options = {}) {
    const rows = replyMarkup?.inline_keyboard || [];
    return rows.map((row) => {
        const buttons = row.map((button) => {
            const text = escapeRichHtml(button.text || ' ');
            const disabled = typeof options.isDisabled === 'function' && options.isDisabled(button);
            const style = buttonStyle(button, options);
            const styleAttr = style ? ` style="${escapeRichHtml(style)}"` : '';

            if (disabled) {
                return `<tg-button type="disabled"${styleAttr}>${text}</tg-button>`;
            }
            if (button.callback_data) {
                return `<tg-button type="callback_data"${styleAttr} data="${escapeRichHtml(button.callback_data)}">${text}</tg-button>`;
            }
            if (button.url) {
                return `<tg-button type="url"${styleAttr} url="${escapeRichHtml(button.url)}">${text}</tg-button>`;
            }
            return `<tg-button type="disabled"${styleAttr}>${text}</tg-button>`;
        }).join('');
        return `<tg-button-row align="center">${buttons}</tg-button-row>`;
    }).join('');
}

function richGameHtml(text, replyMarkup, options = {}) {
    return `${classicHtmlToRichHtml(text)}<hr/>${keyboardToRichHtml(replyMarkup, options)}`;
}

const CHECKERS_RICH_PIECES = Object.freeze({
    '⚫': '<tg-emoji emoji-id="5285320216824261814">⚫️</tg-emoji>',
    // This lighter stone is deliberately paired with the dark one above.
    // The previous white variant was silver-grey and looked almost identical
    // to the black stone on Telegram's dark message background.
    '⚪': '<tg-emoji emoji-id="5285226384673746174">⚪️</tg-emoji>',
    '⬛': '<tg-emoji emoji-id="5287515675256955990">⚫️</tg-emoji>',
    '⬜': '<tg-emoji emoji-id="5285226384673746174">⚪️</tg-emoji>',
    // A red checker-like stone marks selection without replacing the piece
    // with the unrelated lightning animation used before.
    '🔴': '<tg-emoji emoji-id="5287702059657734416">🔴</tg-emoji>',
});

/**
 * Render the 8×8 checkers controls as a compact chess-style board. Telegram rich
 * tables expose the blue coordinate surface through header cells. Alternating
 * them with regular cells paints the complete square board without gridlines.
 * Link-style callbacks stay visually transparent; custom emoji avoid the
 * underline Telegram adds to ordinary emoji links.
 */
function richCheckersHtml(text, replyMarkup) {
    const rows = replyMarkup?.inline_keyboard || [];
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const emptyCellBlock = '&nbsp;';
    const fileRow = `<tr><th></th>${files.map(file => `<th>${file}</th>`).join('')}<th></th></tr>`;
    const boardRows = rows.map((row, rowIndex) => {
        const rank = String(8 - rowIndex);
        const cells = row.map((button, columnIndex) => {
            const isDark = (rowIndex + columnIndex) % 2 === 1;
            if (!isDark) {
                return `<td align="center" valign="middle">${emptyCellBlock}</td>`;
            }
            const rawText = button.text && button.text.trim() ? button.text : '';
            const textHtml = !rawText || rawText === '·'
                ? emptyCellBlock
                : (CHECKERS_RICH_PIECES[rawText] || escapeRichHtml(rawText));
            const buttonHtml = `<tg-button type="callback_data" style="link" ` +
                `data="${escapeRichHtml(button.callback_data)}">${textHtml}</tg-button>`;
            return `<th align="center" valign="middle">${buttonHtml}</th>`;
        }).join('');
        return `<tr><th>${rank}</th>${cells}<th>${rank}</th></tr>`;
    }).join('');
    return `${classicHtmlToRichHtml(text)}<hr/><table compact>` +
        `${fileRow}${boardRows}${fileRow}</table>`;
}

function richActionHtml(text, action) {
    const style = action.style || 'primary';
    return `${classicHtmlToRichHtml(text)}<hr/>` +
        `<tg-button-row align="center"><tg-button type="url" style="${escapeRichHtml(style)}" ` +
        `url="${escapeRichHtml(action.url)}">${escapeRichHtml(action.text)}</tg-button></tg-button-row>`;
}

function createRichInlineArticle({
    id,
    title,
    description,
    thumbnailUrl,
    richHtml,
    fallbackText,
    fallbackReplyMarkup,
}) {
    const base = {
        type: 'article',
        id,
        title,
        description,
        ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {}),
    };
    return {
        rich: {
            ...base,
            input_message_content: richMessageContent(richHtml),
        },
        fallback: {
            ...base,
            input_message_content: {
                message_text: fallbackText,
                parse_mode: 'HTML',
            },
            ...(fallbackReplyMarkup ? { reply_markup: fallbackReplyMarkup } : {}),
        },
    };
}

module.exports = {
    classicHtmlToRichHtml,
    createRichInlineArticle,
    escapeRichHtml,
    keyboardToRichHtml,
    richActionHtml,
    richCheckersHtml,
    richGameHtml,
    richMessageContent,
};
