/* ============================================================
   cards.js
   Chance and Community Chest card decks. Each card has:
     - id           unique key
     - title        short label shown on the modal
     - description  card body text (Russian)
     - effect       function applied when card is drawn
   ============================================================ */

(function (global) {
    'use strict';

    // ---- Card decks (classic Monopoly cards adapted) ----
    // Effect signature: (ctx) => Promise<void>
    // ctx = { playerId, players, lastDiceSum, movePlayerTo, awardGo, ... }
    const CHANCE_CARDS = [
        {
            id: 'c1', title: 'Идите на СТАРТ',
            description: 'Получите $200 при прохождении.',
            async effect(ctx) { await ctx.movePlayerTo(0, /*awardGo*/ true); }
        },
        {
            id: 'c2', title: 'Банковский дивиденд',
            description: 'Банк выплачивает вам $50.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 50, 'Дивиденд'); }
        },
        {
            id: 'c3', title: 'Штраф за превышение скорости',
            description: 'Заплатите $15 штрафа.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, -15, 'Штраф'); }
        },
        {
            id: 'c4', title: 'Ремонт улиц',
            description: 'Заплатите $40 (мы не строим дома пока).',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, -40, 'Ремонт'); }
        },
        {
            id: 'c5', title: 'Идите на Boardwalk',
            description: 'Переместитесь на самую дорогую улицу.',
            async effect(ctx) { await ctx.movePlayerTo(39, /*awardGo*/ false); }
        },
        {
            id: 'c6', title: 'Идите на St. Charles Place',
            description: 'Если пройдёте СТАРТ — получите $200.',
            async effect(ctx) { await ctx.movePlayerTo(11, /*awardGo*/ true); }
        },
        {
            id: 'c7', title: 'Премия за красоту',
            description: 'Вы выиграли в конкурсе. Получите $10.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 10, 'Премия'); }
        },
        {
            id: 'c8', title: 'Назад на 3 клетки',
            description: 'Двигайтесь на 3 клетки назад.',
            async effect(ctx) {
                const pos = Players.getPlayerState(ctx.playerId).position;
                const newPos = (pos - 3 + 40) % 40;
                await ctx.movePlayerTo(newPos, /*awardGo*/ false);
            }
        },
    ];

    const CHEST_CARDS = [
        {
            id: 'b1', title: 'Идите на СТАРТ',
            description: 'Получите $200 при прохождении.',
            async effect(ctx) { await ctx.movePlayerTo(0, /*awardGo*/ true); }
        },
        {
            id: 'b2', title: 'Возврат от банка',
            description: 'Ошибка в вашу пользу. Получите $200.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 200, 'Возврат'); }
        },
        {
            id: 'b3', title: 'Доктор',
            description: 'Оплатите визит к врачу — $50.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, -50, 'Доктор'); }
        },
        {
            id: 'b4', title: 'Дивиденды от акций',
            description: 'Получите $50 дивидендов.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 50, 'Дивиденды'); }
        },
        {
            id: 'b5', title: 'Налог на доходы',
            description: 'Возврат налога. Получите $20.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 20, 'Возврат налога'); }
        },
        {
            id: 'b6', title: 'День рождения',
            description: 'Каждый игрок дарит вам $10.',
            async effect(ctx) {
                for (const p of ctx.players) {
                    if (p.id !== ctx.playerId) {
                        GameState.changeMoney(p.id, -10, 'ДР');
                        GameState.changeMoney(ctx.playerId, 10, 'ДР');
                    }
                }
            }
        },
        {
            id: 'b7', title: 'Страховка',
            description: 'Получите страховую выплату $100.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 100, 'Страховка'); }
        },
        {
            id: 'b8', title: 'Школьный сбор',
            description: 'Оплатите школьный сбор $50.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, -50, 'Сбор'); }
        },
    ];

    // ---- Deck state (shuffled, drawn-from) ----
    let chanceDeck = [];
    let chestDeck = [];

    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function init() {
        chanceDeck = shuffle(CHANCE_CARDS);
        chestDeck  = shuffle(CHEST_CARDS);
    }

    /** Draw the top card from a deck (and reshuffle when empty). */
    function drawChance() {
        if (chanceDeck.length === 0) chanceDeck = shuffle(CHANCE_CARDS);
        return chanceDeck.shift();
    }
    function drawChest() {
        if (chestDeck.length === 0) chestDeck = shuffle(CHEST_CARDS);
        return chestDeck.shift();
    }

    global.Cards = { init, drawChance, drawChest };
})(window);
