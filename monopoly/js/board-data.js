/* ============================================================
   board-data.js
   Single source of truth for Monopoly tile definitions.
   Used by board-ui.js for rendering and (later) by the engine
   for game rules.
   ============================================================ */

(function (global) {
    'use strict';

    // 40 tiles in classic order, starting from GO going clockwise around
    // the board. Index 0 is bottom-right corner (GO when board is upright).
    const TILES = [
        { i: 0,  type: 'corner',   name: 'GO',           subname: 'СТАРТ' },
        { i: 1,  type: 'property', name: 'Mediterranean',group: 'brown',     price: 60 },
        { i: 2,  type: 'chest',    name: 'Community',    subname: 'Chest' },
        { i: 3,  type: 'property', name: 'Baltic',       group: 'brown',     price: 60 },
        { i: 4,  type: 'tax',      name: 'Income Tax',   subname: 'Pay $200' },
        { i: 5,  type: 'railroad', name: 'Reading',                          price: 200 },
        { i: 6,  type: 'property', name: 'Oriental',     group: 'lightblue', price: 100 },
        { i: 7,  type: 'chance',   name: 'Chance' },
        { i: 8,  type: 'property', name: 'Vermont',      group: 'lightblue', price: 100 },
        { i: 9,  type: 'property', name: 'Connecticut',  group: 'lightblue', price: 120 },
        { i: 10, type: 'corner',   name: 'JAIL',         subname: 'Just Visiting' },
        { i: 11, type: 'property', name: 'St. Charles',  group: 'pink',      price: 140 },
        { i: 12, type: 'utility',  name: 'Electric Co',  price: 150 },
        { i: 13, type: 'property', name: 'States',       group: 'pink',      price: 140 },
        { i: 14, type: 'property', name: 'Virginia',     group: 'pink',      price: 160 },
        { i: 15, type: 'railroad', name: 'Pennsylvania', price: 200 },
        { i: 16, type: 'property', name: 'St. James',    group: 'orange',    price: 180 },
        { i: 17, type: 'chest',    name: 'Community',    subname: 'Chest' },
        { i: 18, type: 'property', name: 'Tennessee',    group: 'orange',    price: 180 },
        { i: 19, type: 'property', name: 'New York',     group: 'orange',    price: 200 },
        { i: 20, type: 'corner',   name: 'FREE',         subname: 'PARKING' },
        { i: 21, type: 'property', name: 'Kentucky',     group: 'red',       price: 220 },
        { i: 22, type: 'chance',   name: 'Chance' },
        { i: 23, type: 'property', name: 'Indiana',      group: 'red',       price: 220 },
        { i: 24, type: 'property', name: 'Illinois',     group: 'red',       price: 240 },
        { i: 25, type: 'railroad', name: 'B & O',                            price: 200 },
        { i: 26, type: 'property', name: 'Atlantic',     group: 'yellow',    price: 260 },
        { i: 27, type: 'property', name: 'Ventnor',      group: 'yellow',    price: 260 },
        { i: 28, type: 'utility',  name: 'Water Works',  price: 150 },
        { i: 29, type: 'property', name: 'Marvin',       group: 'yellow',    price: 280 },
        { i: 30, type: 'corner',   name: 'GO TO',        subname: 'JAIL' },
        { i: 31, type: 'property', name: 'Pacific',      group: 'green',     price: 300 },
        { i: 32, type: 'property', name: 'N. Carolina',  group: 'green',     price: 300 },
        { i: 33, type: 'chest',    name: 'Community',    subname: 'Chest' },
        { i: 34, type: 'property', name: 'Pennsylvania', group: 'green',     price: 320 },
        { i: 35, type: 'railroad', name: 'Short Line',   price: 200 },
        { i: 36, type: 'chance',   name: 'Chance' },
        { i: 37, type: 'property', name: 'Park Place',   group: 'blue',      price: 350 },
        { i: 38, type: 'tax',      name: 'Luxury Tax',   subname: 'Pay $100' },
        { i: 39, type: 'property', name: 'Boardwalk',    group: 'blue',      price: 400 },
    ];

    global.MonopolyData = { TILES };
})(window);