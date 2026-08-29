'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TITLES, RARITIES, evaluate, applyEvent } = require('../player-titles');

const root = path.join(__dirname, '..', '..');
const client = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
const migration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '202608290001_add_player_titles.sql'),
    'utf8',
);

const byId = Object.fromEntries(TITLES.map(item => [item.id, item]));
const awardSet = (progress = {}, stats = {}, ranks = null, unlocked = []) =>
    new Set(evaluate(progress, stats, new Set(unlocked), ranks));

test('title rarity order and colors follow the approved visual system', () => {
    assert.deepEqual(RARITIES, {
        common: { order: 0, color: '#8e8e93' },
        uncommon: { order: 1, color: '#168cff' },
        rare: { order: 2, color: '#28c76f' },
        epic: { order: 3, color: '#9b5cff' },
        legendary: { order: 4, color: '#f5b82e' },
        mythic: { order: 5, color: '#ff3b30' },
    });
    assert.equal(byId.checkers_clean_win.rarity, 'legendary');
    assert.equal(byId.sudoku_expert.rarity, 'legendary');
    assert.equal(byId.wordle_sixth_sense.rarity, 'legendary');
    assert.equal(byId.mono_clean_assets.rarity, 'legendary');
    assert.equal(byId.mono_phoenix.rarity, 'epic');
    assert.equal(byId.spark_crown.dynamic, true);
});

test('Cold Head counts only ten consecutive Minesweeper wins on 8x8 or larger', () => {
    let progress = {};
    for (let i = 0; i < 10; i++) progress = applyEvent(progress, {
        type: 'saper_win', game: 'saper', score: 30, context: { mode: 6, usedFlag: false },
    });
    assert.equal(awardSet(progress).has('saper_cold_head'), false);

    progress = {};
    for (let i = 0; i < 9; i++) progress = applyEvent(progress, {
        type: 'saper_win', game: 'saper', score: 30, context: { mode: 8 },
    });
    progress = applyEvent(progress, { type: 'saper_loss', game: 'saper', context: { mode: 8 } });
    progress = applyEvent(progress, { type: 'saper_win', game: 'saper', score: 30, context: { mode: 8 } });
    assert.equal(awardSet(progress).has('saper_cold_head'), false);

    progress = {};
    for (let i = 0; i < 10; i++) progress = applyEvent(progress, {
        type: 'saper_win', game: 'saper', score: 30, context: { mode: i % 2 ? 8 : 15 },
    });
    assert.equal(awardSet(progress).has('saper_cold_head'), true);
});

test('the requested high-end Block Blast and Tower thresholds are exact', () => {
    let progress = applyEvent({}, {
        type: 'bb_game', game: 'bb', context: { maxCombo: 100, maxLines: 3, cleanBoard: true },
    });
    let awards = awardSet(progress, { bb_best_score: 999_999_999 });
    assert.equal(awards.has('bb_combo_100'), true);
    assert.equal(awards.has('bb_combo_1000'), false);
    assert.equal(awards.has('bb_singularity'), false);

    progress = applyEvent(progress, {
        type: 'bb_game', game: 'bb', context: { maxCombo: 1000, maxLines: 1, cleanBoard: false },
    });
    awards = awardSet(progress, { bb_best_score: 1_000_000_000 });
    assert.equal(awards.has('bb_combo_1000'), true);
    assert.equal(awards.has('bb_singularity'), true);

    progress = applyEvent({}, { type: 'tower_game', game: 'tower', context: { closeCalls: 9 } });
    awards = awardSet(progress, { tower_best: 499, tower_combo: 20 });
    assert.equal(awards.has('tower_stratosphere'), false);
    assert.equal(awards.has('tower_close_call'), false);
    progress = applyEvent(progress, { type: 'tower_game', game: 'tower', context: { closeCalls: 10 } });
    awards = awardSet(progress, { tower_best: 500, tower_combo: 20 });
    assert.equal(awards.has('tower_stratosphere'), true);
    assert.equal(awards.has('tower_close_call'), true);
});

test('Sudoku cumulative titles use solved games rather than the points column', () => {
    assert.equal(awardSet({}, { sudoku_wins: 200 }).has('sudoku_archivist'), false);
    let progress = {};
    for (let i = 0; i < 100; i++) progress = applyEvent(progress, {
        type: 'sudoku_win', game: 'sudoku', context: { difficulty: 2, mistakes: 1, durationMs: 60_000 },
    });
    assert.equal(awardSet(progress, { sudoku_wins: 200 }).has('sudoku_archivist'), true);
});

test('human-only Checkers and Monopoly wins never advance from bot matches', () => {
    const legacyCheckers = awardSet({}, { checkers_wins_pve: 500, checkers_total: 500 });
    assert.equal(legacyCheckers.has('checkers_grandmaster'), false);

    let monopoly = applyEvent({}, {
        type: 'monopoly_match', game: 'monopoly',
        context: { won: true, humanMatch: false, fullGroup: true, lowestNetWorth: 1800 },
    });
    let awards = awardSet(monopoly);
    assert.equal(awards.has('mono_first_capital'), false);
    assert.equal(awards.has('mono_monopolist'), true);
    assert.equal(awards.has('mono_last_asset'), true);

    for (let i = 0; i < 100; i++) monopoly = applyEvent(monopoly, {
        type: 'monopoly_match', game: 'monopoly', context: { won: true, humanMatch: true },
    });
    awards = awardSet(monopoly);
    assert.equal(awards.has('mono_city_owner'), true);
});

test('active playtime and all-rounder titles use server-synced progress', () => {
    const games = ['bb','saper','tower','sudoku','checkers','wordle','monopoly'];
    const progress = {
        completedGames: games,
        playtime: { bb: 25 * 60 * 60 * 1000 },
    };
    const awards = awardSet(progress);
    assert.equal(awards.has('all_rounder'), true);
    assert.equal(awards.has('regular'), true);
    assert.equal(awards.has('spark_veteran'), false);
});

test('historical server stats restore completed games without trusting referral totals', () => {
    const historical = {
        bb_total_games: 1,
        saper_wins: 1,
        tower_best: 1,
        sudoku_wins: 1,
        checkers_total: 1,
        wordle_wins: 1,
        monopoly_games: 1,
        referral_count: 999,
    };
    let awards = awardSet({}, historical);
    assert.equal(awards.has('all_rounder'), true);
    assert.equal(awards.has('ref_partner'), false,
        'unactivated referrals must never unlock referral titles');

    awards = awardSet({}, { ...historical, activated_referrals: 25 });
    assert.equal(awards.has('ref_partner'), true);
    assert.equal(awards.has('ref_company'), true);
    assert.equal(awards.has('ref_hub'), true);
    assert.equal(awards.has('ref_ambassador'), false);
});

test('rank-driven global titles use only the seven main leaderboards', () => {
    const allFirst = Object.fromEntries(['saper','checkers','bb','sudoku','tower','wordle','monopoly'].map(game => [game, true]));
    const awards = awardSet({}, {}, {
        first: allFirst, firstCount: 7, firstAny: true, topTenAny: true,
    });
    assert.equal(awards.has('top_ten'), true);
    assert.equal(awards.has('summit_conqueror'), true);
    // Dynamic crowns are intentionally granted by collection(), because they
    // must also be removed from the selectable set when rank is lost.
    assert.equal(awards.has('spark_crown'), false);
});

test('the title catalog is complete, localized and has stable unique ids', () => {
    assert.ok(TITLES.length >= 50, 'the launch catalog should contain dozens of titles');
    assert.equal(new Set(TITLES.map(item => item.id)).size, TITLES.length);
    for (const item of TITLES) {
        assert.ok(RARITIES[item.rarity], `${item.id} has an unknown rarity`);
        for (const locale of ['ru', 'en', 'zh']) {
            assert.ok(item.name[locale], `${item.id} needs a ${locale} name`);
            assert.ok(item.description[locale], `${item.id} needs a ${locale} description`);
        }
    }
});

test('title progress has private Supabase storage and idempotent unlock rows', () => {
    assert.match(migration, /create table if not exists public\.player_title_progress/);
    assert.match(migration, /create table if not exists public\.player_titles/);
    assert.match(migration, /primary key \(telegram_id, title_id\)/);
    assert.match(migration, /create or replace view public\.player_title_holder_counts/);
    assert.match(migration, /alter table public\.player_title_progress enable row level security/);
    assert.match(migration, /alter table public\.player_titles enable row level security/);
    assert.match(migration, /revoke all on table public\.player_title_progress from anon, authenticated/);
    assert.match(migration, /revoke all on table public\.player_titles from anon, authenticated/);
});

test('profile catalog, selection and reward presentation are wired end to end', () => {
    assert.match(server, /app\.get\('\/api\/titles', authMiddleware/);
    assert.match(server, /app\.post\('\/api\/titles\/select', authMiddleware/);
    assert.match(server, /app\.post\('\/api\/titles\/acknowledge', authMiddleware/);
    assert.match(server, /app\.post\('\/api\/titles\/game-event', authMiddleware/);
    assert.match(server, /new_titles: newTitles/);

    assert.match(client, /id="profileSelectedTitle"[^>]*onclick="openTitleLibrary\(\)"/);
    assert.match(client, /id="titleGameFilter"[\s\S]*?id="titleRarityFilter"[\s\S]*?id="titleSortFilter"/);
    assert.match(client, /id="titleHolderCount"/);
    assert.match(client, /function equipFocusedTitle\([\s\S]*?\/api\/titles\/select/);
    assert.match(client, /function titleRewardCanOpen\([\s\S]*?view-games[\s\S]*?\.game-overlay\.visible/,
        'reward animations must wait until the player returns to the games menu');
    assert.match(client, /title-reward-rays[\s\S]*?repeating-conic-gradient[\s\S]*?title-rays-spin/);
    assert.match(client, /titleRewardQueue\.length > 1[\s\S]*?nextTitle/);
});

test('active playtime is action-driven and stops after one idle minute', () => {
    const start = client.indexOf('Lightweight, account-backed profile playtime tracking');
    const end = client.indexOf('Profile overview/statistics switch', start);
    const playtime = client.slice(start, end);
    assert.match(playtime, /const PLAYTIME_IDLE_WINDOW_MS = 60 \* 1000/);
    assert.match(playtime, /pointerdown[\s\S]*?noteGamePlaytimeAction/);
    assert.match(playtime, /keydown[\s\S]*?noteGamePlaytimeAction/);
    assert.match(playtime, /spark-playtime-action/);
    assert.match(playtime, /Math\.min\([\s\S]*?PLAYTIME_IDLE_WINDOW_MS/);
    assert.doesNotMatch(playtime, /setInterval\(/);
});
