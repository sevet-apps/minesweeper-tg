'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const client = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
const monopoly = fs.readFileSync(path.join(root, 'server', 'monopoly-v2.js'), 'utf8');

test('branded videos are bundled and the app loader releases all resources', () => {
    for (const name of ['bot-welcome.mp4', 'app-loader.mp4']) {
        const file = path.join(root, 'assets', 'media', name);
        assert.ok(fs.existsSync(file), `${name} must be bundled`);
        assert.ok(fs.statSync(file).size > 50_000, `${name} must contain the supplied animation`);
    }
    assert.match(client, /<source src="assets\/media\/app-loader\.mp4" type="video\/mp4">/);
    assert.match(client, /<meta name="theme-color" content="#ffffff">[\s\S]*?<script src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"><\/script>/,
        'the document itself must be white before Telegram or the video decoder loads');
    assert.doesNotMatch(client, /<video id="appLoaderVideo"[^>]*\bautoplay\b/,
        'the decoder must seek past the supplied black intro before playback');
    assert.match(client, /object-fit:\s*contain/);
    assert.match(client, /\.app-loader video[\s\S]*?visibility:\s*hidden/);
    assert.doesNotMatch(client, /viewport-fit=cover/,
        'Telegram already supplies the mobile safe area; viewport-fit would apply it twice');
    assert.match(client, /setSparkTelegramChrome\('#ffffff'\)[\s\S]*?requestFullscreen/,
        'Telegram safe areas must be painted before the opening animation');
    assert.match(client, /background:\s*#fff;[\s\S]*?\.app-loader video/,
        'the opening animation must not have black letterbox bars');
    assert.match(client, /video\.addEventListener\('seeked', beginFromWhiteFrame[\s\S]*?video\.currentTime\s*=\s*Math\.min\(0\.30/,
        'the video must stay hidden until it reaches its first white frame');
    assert.match(client, /video\.currentTime\s*>=\s*5\.05[\s\S]*?setSparkTelegramChrome\('#000000'\)/,
        'Telegram safe areas must join the final black star wipe');
    assert.match(client, /root\.remove\(\)[\s\S]*?setSparkTelegramChrome\(color\)/,
        'Telegram chrome must return to the app theme after playback');
    assert.match(client, /video\.querySelectorAll\('source'\)[\s\S]*?source\.remove\(\)/);
    assert.match(client, /video\.pause\(\)[\s\S]*?video\.load\(\)[\s\S]*?root\.remove\(\)/);
    assert.match(client, /window\.setTimeout\(remove, 8000\)/,
        'a decoder failure may not trap the user behind the loader');
});

test('bot greeting follows Telegram language and admin online list is paginated', () => {
    assert.match(server, /const START_COPY = \{[\s\S]*?ru:[\s\S]*?en:[\s\S]*?zh:/);
    assert.match(server, /c\.startsWith\('ru'\)[\s\S]*?c\.startsWith\('zh'\)[\s\S]*?c\.startsWith\('en'\)/);
    assert.match(server, /bot\.sendAnimation\(chatId,[\s\S]*?bot-welcome\.mp4/);
    assert.match(server, /Choose your language[\s\S]*?start_lang_ru_[\s\S]*?start_lang_en_[\s\S]*?start_lang_zh_/);
    assert.match(server, /String\(msg\.from\.id\) !== String\(OWNER_ID\)/);
    assert.match(server, /stats_online_\$\{page - 1\}[\s\S]*?stats_online_\$\{page \+ 1\}/);
    assert.match(server, /Назад к статистике[\s\S]*?stats_main/);
    assert.match(server, /editMessageText\([\s\S]*?stats_online_/);
});

test('Telegram sharing and inline results use the supplied branding', () => {
    assert.ok(fs.statSync(path.join(root, 'assets', 'spark-logo.png')).size > 20_000);
    assert.match(server, /savePreparedInlineMessage/);
    assert.match(server, /custom_emoji_id:\s*'5271604874419647061'/);
    assert.match(server, /emoji-id="5258509201306557640"/);
    assert.match(server, /GAME_ICON_BY_COLUMN[\s\S]*?block-blast\.png[\s\S]*?checkers\.png[\s\S]*?wordle\.png/);
    assert.match(server, /if \(!config \|\| config\.isReferral\) return null/,
        'the referral leaderboard must remain the one icon-free result');
    assert.match(client, /property="og:image" content="https:\/\/sevet-apps\.github\.io\/minesweeper-tg\/assets\/spark-logo\.png\?v=20260823"/);
    assert.match(server, /spark-logo\.png\?v=20260823/,
        'prepared-message thumbnails must bypass Telegram image caches');
});

test('Block Blast retries a final save without forking the authoritative session', () => {
    assert.match(client, /pending\.sessionToken[\s\S]*?activeSessionTokens\.bb_best_score = pending\.sessionToken/);
    assert.match(client, /profile\?\.[Bb]b_best_score|profile\?\.bb_best_score/);
    assert.match(client, /persistedBest >= Number\(pending\.score\)[\s\S]*?clearPending\(\)/);
    assert.equal((client.match(/sessionToken:\s*activeSessionTokens\.bb_best_score/g) || []).length, 2);
    assert.match(server, /session\.bbRestorable = false;[\s\S]*?session\.bbShapes\[slot\] = null/);
    assert.match(server, /session\.bbEnded = true;[\s\S]*?session\.finishedAt = Date\.now\(\)/);
    assert.match(server, /generateBBHand\([\s\S]*?seed/,
        'shape ranking and randomness must remain authoritative on the server');
    assert.match(client, /bbShapes\.every\(shape => shape === null\)[\s\S]*?generateSeededBBHand\(bbNextHandSeed,/,
        'the next signed hand must render locally without a network gap');
    assert.match(client, /acceptBBServerMove\(data, bbMoveQueue\.length > 1\)/,
        'older queued acknowledgements must not replace an already predicted next hand');
    assert.match(client, /dragData && dragData\.slotId === slotId[\s\S]*?preview\.style\.opacity = 0/,
        'an in-flight server render must not reveal the held source shape');
});

test('finished Monopoly rooms and impossible checkers counters are repaired server-side', () => {
    assert.match(monopoly, /now - g\.lastHumanActionAt >= 20 \* 60e3/);
    assert.match(monopoly, /g\.phase === 'lobby' \|\| g\.phase === 'ended'/,
        'ended games must never be offered as resumable');
    assert.match(monopoly, /socket\.on\('m2:anim-done',[\s\S]*?false\)\)/,
        'automatic animation acknowledgements must not reset human inactivity');
    assert.match(server, /wins > total[\s\S]*?checkers_total: wins/);
    assert.match(server, /updateData\.checkers_total = Math\.max/);
    assert.match(server, /let checkersStatsChain = Promise\.resolve\(\)/);
});
