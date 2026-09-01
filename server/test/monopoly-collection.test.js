'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    makeCollection, chooseRarity, chooseSkin, applyRentBonus, catalog,
} = require('../monopoly-collection');
const MonopolyV2 = require('../monopoly-v2');

const root = path.join(__dirname, '..', '..');
const migration = fs.readFileSync(path.join(
    root, 'supabase', 'migrations', '202609010001_add_monopoly_collectibles.sql'
), 'utf8');
const collectionUi = fs.readFileSync(path.join(root, 'monopoly', 'js', 'v2', 'collection-ui.js'), 'utf8');
const gameUi = fs.readFileSync(path.join(root, 'monopoly', 'js', 'v2', 'game-ui.js'), 'utf8');
const tradesUi = fs.readFileSync(path.join(root, 'monopoly', 'js', 'v2', 'trades.js'), 'utf8');

test('Monopoly skin catalog contains the complete four-group test collection', () => {
    assert.equal(catalog.skins.length, 96);
    assert.equal(new Set(catalog.skins.map(skin => skin.id)).size, 96);
    assert.deepEqual(catalog.case.odds, { common: 70, rare: 22, epic: 7, mythic: 1 });

    const expectedGroups = { cars: 32, web: 24, food: 24, tech: 16 };
    const expectedTiles = {
        cars: [5, 15, 25, 35], web: [11, 13, 14],
        food: [26, 27, 29], tech: [37, 39],
    };
    const groupCounts = {}, rarityCounts = {};
    for (const skin of catalog.skins) {
        groupCounts[skin.groupId] = (groupCounts[skin.groupId] || 0) + 1;
        rarityCounts[skin.rarity] = (rarityCounts[skin.rarity] || 0) + 1;
        assert.deepEqual(skin.compatibleTiles, expectedTiles[skin.groupId]);
        assert.equal(skin.bonusBps, catalog.rarities[skin.rarity].bonusBps);
        assert.equal(skin.exchangeValue, catalog.rarities[skin.rarity].exchangeValue);
        assert.ok(['badge', 'wordmark'].includes(skin.layout));
        assert.ok(fs.existsSync(path.join(root, 'monopoly', skin.asset)), skin.asset);
    }
    assert.deepEqual(groupCounts, expectedGroups);
    assert.deepEqual(rarityCounts, { common: 24, rare: 24, epic: 24, mythic: 24 });
});

test('case rarity boundaries exactly implement 70/22/7/1 odds', () => {
    const rarityAt = value => chooseRarity(() => value);
    assert.equal(rarityAt(0), 'common');
    assert.equal(rarityAt(0.699999), 'common');
    assert.equal(rarityAt(0.70), 'rare');
    assert.equal(rarityAt(0.919999), 'rare');
    assert.equal(rarityAt(0.92), 'epic');
    assert.equal(rarityAt(0.989999), 'epic');
    assert.equal(rarityAt(0.99), 'mythic');
    assert.equal(rarityAt(1), 'mythic');
    for (const rarity of Object.keys(catalog.rarities)) {
        assert.equal(chooseSkin(rarity, () => 0).rarity, rarity);
        assert.equal(chooseSkin(rarity, () => 0.999999).rarity, rarity);
    }
});

test('rent bonuses use nearest-integer rounding for every rarity', () => {
    assert.equal(applyRentBonus(260, 250), 267);
    assert.equal(applyRentBonus(260, 1000), 286);
    assert.equal(applyRentBonus(260, 2000), 312);
    assert.equal(applyRentBonus(260, 3300), 346);
    assert.equal(applyRentBonus(-10, 3300), 0);
});

test('server rejects an incompatible skin placement before touching Supabase', async () => {
    let rpcCalls = 0;
    const service = makeCollection({
        supabase: { rpc() { rpcCalls++; return { data: null, error: null }; } },
        log() {},
    });
    const skin = catalog.skins.find(row => row.groupId === 'cars');
    await assert.rejects(service.equip('tg42', skin.id, 11), /incompatible_skin/);
    assert.equal(rpcCalls, 0);
});

test('collectible SQL serializes openings and protects all mutations from clients', () => {
    assert.match(migration, /monopoly_collectible_accounts[\s\S]*where telegram_id = p_telegram_id for update/i);
    assert.match(migration, /pending_opening/);
    assert.match(migration, /unique \(telegram_id, skin_id\)/i);
    for (const table of [
        'monopoly_collectible_accounts', 'monopoly_skin_inventory', 'monopoly_skin_loadout',
        'monopoly_case_openings', 'monopoly_case_grants', 'monopoly_skin_exchanges',
    ]) {
        assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon, authenticated`, 'i'));
    }
    assert.match(migration, /grant execute on function public\.monopoly_open_case[\s\S]*to service_role/i);
});

test('collection UI never retries a mutating request on another backend', () => {
    assert.match(collectionUi, /method === 'GET' \|\| method === 'HEAD'/);
    assert.match(collectionUi, /skinCard\(row, data\.loadout \|\| \[\]\)/);
    assert.match(collectionUi, /headers\['Content-Type'\] = 'application\/json'/);
});

test('collection UI renders individual cases and duplicate company instances', () => {
    assert.match(collectionUi, /function companyInstances/);
    assert.match(collectionUi, /copyIndex > 0/);
    assert.match(collectionUi, /mc-case-carousel/);
    assert.doesNotMatch(collectionUi, /mc-rarity-strip/);
});

test('active company names and skins are used throughout match UI', () => {
    assert.match(gameUi, /activeSkins\?\.\[i\]\?\.name/);
    assert.match(gameUi, /activeSkins: S\.activeSkins \|\| \{\}/);
    assert.match(tradesUi, /activeSkins\?\.\[i\]\?\.name/);
});

test('concurrent game starts share one complete loadout preparation', async () => {
    let release;
    let calls = 0;
    const blocked = new Promise(resolve => { release = resolve; });
    MonopolyV2.setCollectionService({
        async loadLoadout(id) {
            calls++;
            await blocked;
            return { 5: { id: `skin-${id}` } };
        },
    });
    const game = new MonopolyV2.Game('QA', {});
    game.order = ['a', 'b'];
    game.players = { a: { bot: false }, b: { bot: false } };

    const first = game.prepareSkins();
    const second = game.prepareSkins();
    await Promise.resolve();
    assert.equal(calls, 2);
    assert.equal(game.skinsPrepared, false);
    release();
    await Promise.all([first, second]);
    assert.equal(game.skinsPrepared, true);
    assert.deepEqual(game.skinLoadouts.a, { 5: { id: 'skin-a' } });
    assert.deepEqual(game.skinLoadouts.b, { 5: { id: 'skin-b' } });
    MonopolyV2.setCollectionService(null);
});

test('company skin and rent bonus activate only for a complete monopoly', () => {
    const game = new MonopolyV2.Game('SKINS', {});
    const owner = 'owner';
    const carTiles = [5, 15, 25, 35];
    const skin = catalog.skins.find(row => row.groupId === 'cars' && row.rarity === 'mythic');

    for (const tile of carTiles.slice(0, -1)) game.owners[tile] = owner;
    game.skinLoadouts[owner] = { 5: skin };
    assert.equal(game.activeSkin(5), null);

    game.owners[35] = owner;
    const active = game.activeSkin(5);
    assert.equal(active.id, skin.id);

    const loadout = game.skinLoadouts[owner];
    game.skinLoadouts[owner] = {};
    const baseRent = game.rentFor(5, { diceSum: 7 });
    game.skinLoadouts[owner] = loadout;
    assert.equal(game.rentFor(5, { diceSum: 7 }), applyRentBonus(baseRent, skin.bonusBps));

    game.mortgaged[15] = owner;
    assert.equal(game.activeSkin(5).id, skin.id, 'a mortgage must not deactivate the assembled skin set');
    assert.equal(game.rentFor(5, { diceSum: 7 }), applyRentBonus(baseRent, skin.bonusBps));

    game.mortgaged[5] = owner;
    assert.equal(game.rentFor(5, { diceSum: 7 }), 0, 'a mortgaged skinned property still charges no rent');
});
