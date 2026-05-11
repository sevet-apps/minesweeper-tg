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
            description: 'Банк выплачивает вам $50. Не транжирьте.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 50, 'Дивиденд'); }
        },
        {
            id: 'c3', title: 'Штраф ГАИ',
            description: 'Превысили скорость в жилой зоне. $15 в казну.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, -15, 'Штраф'); }
        },
        {
            id: 'c4', title: 'Ремонт улиц',
            description: 'Город ремонтирует ваши улицы. Заплатите $40 муниципалитету.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, -40, 'Ремонт'); }
        },
        {
            id: 'c5', title: 'Идите на Boardwalk',
            description: 'Свежий воздух у моря не повредит.',
            async effect(ctx) { await ctx.movePlayerTo(39, /*awardGo*/ false); }
        },
        {
            id: 'c6', title: 'Идите на St. Charles Place',
            description: 'Если пройдёте СТАРТ — получите $200.',
            async effect(ctx) { await ctx.movePlayerTo(11, /*awardGo*/ true); }
        },
        {
            id: 'c7', title: 'Премия за красоту',
            description: 'Вас выбрали мисс/мистер Монополия. Получите $10.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 10, 'Премия'); }
        },
        {
            id: 'c8', title: 'Назад на 3 клетки',
            description: 'Передумали? Возвращайтесь.',
            async effect(ctx) {
                const pos = Players.getPlayerState(ctx.playerId).position;
                const newPos = (pos - 3 + 40) % 40;
                await ctx.movePlayerTo(newPos, /*awardGo*/ false);
            }
        },
        {
            id: 'c9', title: 'Выигрыш в лотерею',
            description: 'Вы случайно нашли в кармане билет. Получите $100.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 100, 'Лотерея'); }
        },
        {
            id: 'c10', title: 'Идите в тюрьму',
            description: 'Не проходите СТАРТ, не получайте $200.',
            async effect(ctx) {
                await ctx.movePlayerTo(10, /*awardGo*/ false);
                GameState.sendToJail(ctx.playerId);
            }
        },
        {
            id: 'c11', title: 'Налог на роскошь',
            description: 'Соседи завидуют вашему BMW. Заплатите $75.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, -75, 'Налог'); }
        },
        {
            id: 'c12', title: 'Идите на Reading Railroad',
            description: 'Если пройдёте СТАРТ — получите $200.',
            async effect(ctx) { await ctx.movePlayerTo(5, /*awardGo*/ true); }
        },
        {
            id: 'c13', title: 'Инвестиции в стартап',
            description: 'Ваш племянник занял $50 «на будущее».',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, -50, 'Стартап'); }
        },
        {
            id: 'c14', title: 'Возврат акций',
            description: 'Брокер вернул депозит. $150 ваши.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 150, 'Брокер'); }
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
            description: 'Простуда на пустом месте. Оплатите визит $50.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, -50, 'Доктор'); }
        },
        {
            id: 'b4', title: 'Дивиденды от акций',
            description: 'Старые бумаги принесли $50.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 50, 'Дивиденды'); }
        },
        {
            id: 'b5', title: 'Возврат налога',
            description: 'Бухгалтерия удивила. Получите $20.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 20, 'Возврат'); }
        },
        {
            id: 'b6', title: 'День рождения!',
            description: 'Каждый игрок дарит вам $10.',
            async effect(ctx) {
                for (const p of ctx.players) {
                    if (p.id !== ctx.playerId && !GameState.isBankrupt(p.id)) {
                        GameState.changeMoney(p.id, -10, 'ДР');
                        GameState.changeMoney(ctx.playerId, 10, 'ДР');
                    }
                }
            }
        },
        {
            id: 'b7', title: 'Страховая выплата',
            description: 'Соседский кот разбил вашу вазу. $100 от страховой.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 100, 'Страховка'); }
        },
        {
            id: 'b8', title: 'Школьный сбор',
            description: 'На ремонт классов. $50 школе.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, -50, 'Сбор'); }
        },
        {
            id: 'b9', title: 'Наследство',
            description: 'Дальний родственник вспомнил о вас. $100 ваши.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 100, 'Наследство'); }
        },
        {
            id: 'b10', title: 'Алименты',
            description: 'Бывшая в курсе ваших успехов. Заплатите $100.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, -100, 'Алименты'); }
        },
        {
            id: 'b11', title: 'В тюрьму',
            description: 'Соседи донесли. Не проходите СТАРТ.',
            async effect(ctx) {
                await ctx.movePlayerTo(10, /*awardGo*/ false);
                GameState.sendToJail(ctx.playerId);
            }
        },
        {
            id: 'b12', title: 'Книжный гонорар',
            description: 'Мемуары неожиданно популярны. $25.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 25, 'Гонорар'); }
        },
        {
            id: 'b13', title: 'Победа в покере',
            description: 'Партия с приятелями оказалась прибыльной. $50.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, 50, 'Покер'); }
        },
        {
            id: 'b14', title: 'Услуги сантехника',
            description: 'Снова прорыв в подвале. $40 мастеру.',
            async effect(ctx) { GameState.changeMoney(ctx.playerId, -40, 'Сантехник'); }
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