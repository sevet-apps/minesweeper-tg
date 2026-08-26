'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createRichInlineArticle,
    escapeRichHtml,
    keyboardToRichHtml,
    richActionHtml,
    richCheckersHtml,
    richGameHtml,
    richMessageContent,
} = require('../telegram-rich-messages');

test('rich-message values are escaped before being placed in HTML or attributes', () => {
    assert.equal(
        escapeRichHtml(`<player name="O'Reilly">&`),
        '&lt;player name=&quot;O&#39;Reilly&quot;&gt;&amp;',
    );

    const html = richActionHtml('<b>Топ игроков</b>', {
        text: 'Играть <сейчас>',
        url: 'https://t.me/example?start=a&next="b"',
        style: 'primary',
    });
    assert.match(html, /<tg-button type="url" style="primary"/);
    assert.match(html, /url="https:\/\/t\.me\/example\?start=a&amp;next=&quot;b&quot;"/);
    assert.match(html, />Играть &lt;сейчас&gt;<\/tg-button>/);
});

test('game keyboards become rows of callback and disabled buttons inside the message', () => {
    const keyboard = {
        inline_keyboard: [
            [
                { text: '❌', callback_data: 'ttt_game_0_0' },
                { text: ' ', callback_data: 'ttt_game_0_1' },
                { text: '⭕', callback_data: 'ttt_game_0_2' },
            ],
            [
                { text: ' ', callback_data: 'ttt_game_1_0' },
                { text: ' ', callback_data: 'ttt_game_1_1' },
                { text: ' ', callback_data: 'ttt_game_1_2' },
            ],
            [
                { text: ' ', callback_data: 'ttt_game_2_0' },
                { text: ' ', callback_data: 'ttt_game_2_1' },
                { text: ' ', callback_data: 'ttt_game_2_2' },
            ],
        ],
    };
    const html = richGameHtml('<b>Крестики-нолики</b>\n\nВаш ход', keyboard, {
        isDisabled: (button) => button.text !== ' ',
        styleForButton: (button) => button.text === '❌' ? 'danger' :
            (button.text === '⭕' ? 'primary' : ''),
    });

    assert.equal((html.match(/<tg-button-row/g) || []).length, 3);
    assert.equal((html.match(/type="callback_data"/g) || []).length, 7);
    assert.match(html, /type="disabled" style="danger">❌/);
    assert.match(html, /type="disabled" style="primary">⭕/);
    assert.match(html, /data="ttt_game_2_2"/);
});

test('an 8 by 8 checkers board stays within Telegram rich row limits', () => {
    const keyboard = {
        inline_keyboard: Array.from({ length: 8 }, (_, row) =>
            Array.from({ length: 8 }, (_, col) => ({
                text: (row + col) % 2 ? '⚫' : '·',
                callback_data: `ch_game_${row}_${col}`,
            }))),
    };
    const html = keyboardToRichHtml(keyboard);
    assert.equal((html.match(/<tg-button-row/g) || []).length, 8);
    assert.equal((html.match(/type="callback_data"/g) || []).length, 64);
});

test('checkers rich message is a compact square board with coordinates', () => {
    const keyboard = {
        inline_keyboard: Array.from({ length: 8 }, (_, row) =>
            Array.from({ length: 8 }, (_, col) => ({
                text: (row + col) % 2 ? (row < 3 ? '⚫' : '·') : ' ',
                callback_data: `ch_ch_42_100_${row}_${col}`,
            }))),
    };
    const html = richCheckersHtml('<b>Шашки</b>', keyboard);
    assert.match(html, /<table compact>/);
    assert.doesNotMatch(html, /\bbordered\b/);
    assert.equal((html.match(/<tr>/g) || []).length, 10);
    assert.equal((html.match(/type="callback_data"/g) || []).length, 32);
    assert.match(html, /<th>a<\/th>[\s\S]*<th>h<\/th>/);
    assert.match(html, /<th>8<\/th>[\s\S]*<th>1<\/th>/);
    assert.match(html, /<code>　<\/code>/);
    assert.doesNotMatch(html, /[□■]/);
});

test('inline articles expose a rich message and retain a classic fallback', () => {
    const richHtml = '<h3>Spark</h3><p>Игра</p>';
    const pair = createRichInlineArticle({
        id: 'game-1',
        title: 'Игра',
        description: 'Описание',
        thumbnailUrl: 'https://example.com/icon.png',
        richHtml,
        fallbackText: '<b>Игра</b>',
        fallbackReplyMarkup: {
            inline_keyboard: [[{ text: 'Играть', callback_data: 'play' }]],
        },
    });

    assert.deepEqual(pair.rich.input_message_content, richMessageContent(richHtml));
    assert.equal(pair.rich.input_message_content.rich_message.skip_entity_detection, true);
    assert.equal(pair.fallback.input_message_content.message_text, '<b>Игра</b>');
    assert.equal(pair.fallback.input_message_content.parse_mode, 'HTML');
    assert.equal(pair.fallback.reply_markup.inline_keyboard[0][0].callback_data, 'play');
});
