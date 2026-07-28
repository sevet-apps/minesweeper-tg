/* ============================================================
   board-data-v2.js — ФИНАЛ
   Новая доска Spark Monopoly: 40 полей, бренды, цены .

   Движение по часовой. Углы:
   0 = Старт (ракета, верх-лево), 10 = Тюрьма (верх-право),
   20 = Казино (низ-право), 30 = Полицейский «в тюрьму» (низ-лево).
   ============================================================ */
(function (global) {
    'use strict';

    const ECONOMY = {
        startingCash: 15000,
        lapBonus: 2000,          // за круг
        landOnStartBonus: 1000,  // дополнительно за остановку ровно на Старте
        jailFine: 500,
        turnSeconds: 70,
        luxuryTax: 1000,         // 💎 поле 36
        incomeTaxPerBranch: 250, // 💵 поле 4: 250 за каждый построенный филиал
        creditUnlockRounds: 20,
        mortgageRounds: 15,      // через 15 раундов залог сгорает — поле свободно
    };

    const GROUPS = {
        perfume:  { name: 'Парфюмерия',       color: '#c65dc9' },
        clothes:  { name: 'Одежда',           color: '#d9a814' },
        cars:     { name: 'Автомобили',       color: '#e05a4e' },
        web:      { name: 'Веб-сервисы',      color: '#14a08a' },
        gamedev:  { name: 'Разработчики игр', color: '#9c2b2b' },
        drinks:   { name: 'Напитки',          color: '#2f6de0' },
        airlines: { name: 'Авиалинии',        color: '#57ab27' },
        food:     { name: 'Рестораны',        color: '#2f9fd8' },
        hotels:   { name: 'Отели',            color: '#8b5cf6' },
        tech:     { name: 'Электроника',      color: '#5b616e' },
    };

    const TILES = [
        { i: 0,  type: 'start',    name: 'Старт',            icon: 'rocket' },
        { i: 1,  type: 'prop',     name: 'Chanel',           group: 'perfume',  price: 600  },
        { i: 2,  type: 'chance',   name: 'Сюрприз' },
        { i: 3,  type: 'prop',     name: 'Hugo Boss',        group: 'perfume',  price: 600  },
        { i: 4,  type: 'tax',      name: 'Налог',            icon: 'money', taxKind: 'branches' },
        { i: 5,  type: 'prop',     name: 'Mercedes',         group: 'cars',     price: 2000 },
        { i: 6,  type: 'prop',     name: 'Adidas',           group: 'clothes',  price: 1000 },
        { i: 7,  type: 'chance',   name: 'Сюрприз' },
        { i: 8,  type: 'prop',     name: 'Puma',             group: 'clothes',  price: 1000 },
        { i: 9,  type: 'prop',     name: 'Lacoste',          group: 'clothes',  price: 1200 },
        { i: 10, type: 'jail',     name: 'Тюрьма',           icon: 'jail' },
        { i: 11, type: 'prop',     name: 'Circle+',          group: 'web',      price: 1400 },
        { i: 12, type: 'prop',     name: 'Rockstar Games',   group: 'gamedev',  price: 1500 },
        { i: 13, type: 'prop',     name: 'Friender',         group: 'web',      price: 1400 },
        { i: 14, type: 'prop',     name: 'Chirp',            group: 'web',      price: 1600 },
        { i: 15, type: 'prop',     name: 'Audi',             group: 'cars',     price: 2000 },
        { i: 16, type: 'prop',     name: 'Coca-Cola',        group: 'drinks',   price: 1800 },
        { i: 17, type: 'chance',   name: 'Сюрприз' },
        { i: 18, type: 'prop',     name: 'Pepsi',            group: 'drinks',   price: 1800 },
        { i: 19, type: 'prop',     name: 'Fanta',            group: 'drinks',   price: 2000 },
        { i: 20, type: 'casino',   name: 'Казино',           icon: 'jackpot' },
        { i: 21, type: 'prop',     name: 'American Airlines',group: 'airlines', price: 2200 },
        { i: 22, type: 'chance',   name: 'Сюрприз' },
        { i: 23, type: 'prop',     name: 'Lufthansa',        group: 'airlines', price: 2200 },
        { i: 24, type: 'prop',     name: 'British Airways',  group: 'airlines', price: 2400 },
        { i: 25, type: 'prop',     name: 'Ford',             group: 'cars',     price: 2000 },
        { i: 26, type: 'prop',     name: 'Max Burgers',      group: 'food',     price: 2600 },
        { i: 27, type: 'prop',     name: 'Burger King',      group: 'food',     price: 2600 },
        { i: 28, type: 'prop',     name: 'Rovio',            group: 'gamedev',  price: 1500 },
        { i: 29, type: 'prop',     name: 'KFC',              group: 'food',     price: 2800 },
        { i: 30, type: 'gotojail', name: 'Арест',            icon: 'police' },
        { i: 31, type: 'prop',     name: 'Holiday Inn',      group: 'hotels',   price: 3000 },
        { i: 32, type: 'prop',     name: 'Radisson Blu',     group: 'hotels',   price: 3000 },
        { i: 33, type: 'chance',   name: 'Сюрприз' },
        { i: 34, type: 'prop',     name: 'Novotel',          group: 'hotels',   price: 3200 },
        { i: 35, type: 'prop',     name: 'Land Rover',       group: 'cars',     price: 2000 },
        { i: 36, type: 'tax',      name: 'Налог на роскошь', icon: 'diamond', taxKind: 'flat', amount: 1000 },
        { i: 37, type: 'prop',     name: 'Apple',            group: 'tech',     price: 3500 },
        { i: 38, type: 'chance',   name: 'Сюрприз' },
        { i: 39, type: 'prop',     name: 'Nokia',            group: 'tech',     price: 4000 },
    ];

    // rent: [база, ★, ★★, ★★★, ★★★★, отель]; branch = стоимость филиала
    const PROP = {
        1:  { rent:[20,100,300,900,1600,2500],        mortgage:300,  unmortgage:360,  branch:500  },
        3:  { rent:[40,200,600,1800,3200,4500],       mortgage:300,  unmortgage:360,  branch:500  },
        6:  { rent:[60,300,900,2700,4000,5500],       mortgage:500,  unmortgage:600,  branch:500  },
        8:  { rent:[60,300,900,2700,4000,5500],       mortgage:500,  unmortgage:600,  branch:500  },
        9:  { rent:[80,400,1000,3000,4500,6000],      mortgage:600,  unmortgage:720,  branch:500  },
        11: { rent:[100,500,1500,4500,6250,7500],     mortgage:700,  unmortgage:840,  branch:750  },
        13: { rent:[100,500,1500,4500,6250,7500],     mortgage:700,  unmortgage:840,  branch:750  },
        14: { rent:[120,600,1800,5000,7000,9000],     mortgage:800,  unmortgage:960,  branch:750  },
        16: { rent:[140,700,2000,5500,7500,9500],     mortgage:900,  unmortgage:1080, branch:1000 },
        18: { rent:[140,700,2000,5500,7500,9500],     mortgage:900,  unmortgage:1080, branch:1000 },
        19: { rent:[160,800,2200,6000,8000,10000],    mortgage:1000, unmortgage:1200, branch:1000 },
        21: { rent:[180,900,2500,7000,8750,10500],    mortgage:1100, unmortgage:1320, branch:1250 },
        23: { rent:[180,900,2500,7000,8750,10500],    mortgage:1100, unmortgage:1320, branch:1250 },
        24: { rent:[200,1000,3000,7500,9250,11000],   mortgage:1200, unmortgage:1440, branch:1250 },
        26: { rent:[220,1100,3300,8000,9750,11500],   mortgage:1300, unmortgage:1560, branch:1500 },
        27: { rent:[220,1100,3300,8000,9750,11500],   mortgage:1300, unmortgage:1560, branch:1500 },
        29: { rent:[240,1200,3600,8500,10250,12000],  mortgage:1400, unmortgage:1680, branch:1500 },
        31: { rent:[260,1300,3900,9000,11000,12750],  mortgage:1500, unmortgage:1800, branch:1750 },
        32: { rent:[260,1300,3900,9000,11000,12750],  mortgage:1500, unmortgage:1800, branch:1750 },
        34: { rent:[280,1500,4500,10000,12000,14000], mortgage:1600, unmortgage:1920, branch:1750 },
        37: { rent:[350,1750,5000,11000,13000,15000], mortgage:1750, unmortgage:2100, branch:2000 },
        39: { rent:[500,2000,6000,14000,17000,20000], mortgage:2000, unmortgage:2400, branch:2000 },
        // Автомобили: аренда от количества машин, без филиалов
        5:  { carRent:[250,500,1000,2000], mortgage:1000, unmortgage:1200 },
        15: { carRent:[250,500,1000,2000], mortgage:1000, unmortgage:1200 },
        25: { carRent:[250,500,1000,2000], mortgage:1000, unmortgage:1200 },
        35: { carRent:[250,500,1000,2000], mortgage:1000, unmortgage:1200 },
        // Разработчики игр: аренда = сумма кубиков × множитель
        12: { diceMult:[100,250], mortgage:750, unmortgage:900 },
        28: { diceMult:[100,250], mortgage:750, unmortgage:900 },
    };

    // Колода «Сюрприз» (стиль monopoly-one; тексты/суммы легко править тут)
    const CHANCE = [
        { id:'div2000',  text:'Банк выплачивает вам дивиденды', effect:{ money:+2000 } },
        { id:'tax1000',  text:'Возврат налога! Получите деньги', effect:{ money:+1000 } },
        { id:'fine1500', text:'Штраф за неправильную парковку', effect:{ money:-1500 } },
        { id:'fine500',  text:'Оплатите услуги юриста',        effect:{ money:-500 } },
        { id:'toStart',  text:'Отправляйтесь на Старт',        effect:{ moveTo:0 } },
        { id:'toJail',   text:'Вас арестовали! В тюрьму',      effect:{ jail:true } },
        { id:'fwd3',     text:'Пройдите на 3 поля вперёд',     effect:{ moveBy:+3 } },
        { id:'back3',    text:'Вернитесь на 3 поля назад',     effect:{ moveBy:-3 } },
        { id:'repairs',  text:'Ремонт: заплатите $250 за каждый построенный филиал', effect:{ perBranch:-250 } },
        { id:'birthday', text:'День рождения! Каждый игрок дарит вам $250', effect:{ fromEach:+250 } },
    ];

    global.MonopolyDataV2 = { ECONOMY, GROUPS, TILES, PROP, CHANCE };
})(typeof window !== 'undefined' ? window : globalThis);
