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
    richGameHtml,
    richMessageContent,
};
