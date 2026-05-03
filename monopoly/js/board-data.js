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
        { i: 4,  type: 'tax',      name: 'Income Tax',   subname: 'Заплати $200' },
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
        { i: 38, type: 'tax',      name: 'Luxury Tax',   subname: 'Заплати $100' },
        { i: 39, type: 'property', name: 'Boardwalk',    group: 'blue',      price: 400 },
    ];

    // Property economic data:
    //   price        — purchase price
    //   houseCost    — cost of building one house (4 max, then hotel)
    //   mortgage     — value when mortgaged (=price/2)
    //   rent         — [base, 1h, 2h, 3h, 4h, hotel]  (base = unimproved)
    //
    // Standard classic Monopoly numbers.
    const PROPERTY_DATA = {
        // brown
        1:  { houseCost: 50,  mortgage: 30,  rent: [2,  10, 30,  90,  160, 250] },
        3:  { houseCost: 50,  mortgage: 30,  rent: [4,  20, 60,  180, 320, 450] },
        // light blue
        6:  { houseCost: 50,  mortgage: 50,  rent: [6,  30, 90,  270, 400, 550] },
        8:  { houseCost: 50,  mortgage: 50,  rent: [6,  30, 90,  270, 400, 550] },
        9:  { houseCost: 50,  mortgage: 60,  rent: [8,  40, 100, 300, 450, 600] },
        // pink
        11: { houseCost: 100, mortgage: 70,  rent: [10, 50, 150, 450, 625, 750] },
        13: { houseCost: 100, mortgage: 70,  rent: [10, 50, 150, 450, 625, 750] },
        14: { houseCost: 100, mortgage: 80,  rent: [12, 60, 180, 500, 700, 900] },
        // orange
        16: { houseCost: 100, mortgage: 90,  rent: [14, 70, 200, 550, 750, 950] },
        18: { houseCost: 100, mortgage: 90,  rent: [14, 70, 200, 550, 750, 950] },
        19: { houseCost: 100, mortgage: 100, rent: [16, 80, 220, 600, 800, 1000] },
        // red
        21: { houseCost: 150, mortgage: 110, rent: [18, 90, 250, 700, 875, 1050] },
        23: { houseCost: 150, mortgage: 110, rent: [18, 90, 250, 700, 875, 1050] },
        24: { houseCost: 150, mortgage: 120, rent: [20, 100,300, 750, 925, 1100] },
        // yellow
        26: { houseCost: 150, mortgage: 130, rent: [22, 110,330, 800, 975, 1150] },
        27: { houseCost: 150, mortgage: 130, rent: [22, 110,330, 800, 975, 1150] },
        29: { houseCost: 150, mortgage: 140, rent: [24, 120,360, 850, 1025,1200] },
        // green
        31: { houseCost: 200, mortgage: 150, rent: [26, 130,390, 900, 1100,1275] },
        32: { houseCost: 200, mortgage: 150, rent: [26, 130,390, 900, 1100,1275] },
        34: { houseCost: 200, mortgage: 160, rent: [28, 150,450, 1000,1200,1400] },
        // dark blue
        37: { houseCost: 200, mortgage: 175, rent: [35, 175,500, 1100,1300,1500] },
        39: { houseCost: 200, mortgage: 200, rent: [50, 200,600, 1400,1700,2000] },
        // railroads (no houses, mortgage = 100)
        5:  { mortgage: 100, rent: [25, 50, 100, 200] },
        15: { mortgage: 100, rent: [25, 50, 100, 200] },
        25: { mortgage: 100, rent: [25, 50, 100, 200] },
        35: { mortgage: 100, rent: [25, 50, 100, 200] },
        // utilities (rent depends on dice roll, not housed)
        12: { mortgage: 75 },
        28: { mortgage: 75 },
    };

    global.MonopolyData = { TILES, PROPERTY_DATA };
})(window);