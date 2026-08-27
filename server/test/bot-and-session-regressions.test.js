'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const client = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
const richMessages = fs.readFileSync(path.join(root, 'server', 'telegram-rich-messages.js'), 'utf8');
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
    assert.match(client, /<video id="appLoaderVideo"[^>]*\bautoplay\b[^>]*\bmuted\b[^>]*\bplaysinline\b/,
        'mobile WebKit must receive native muted autoplay without a pre-play seek');
    assert.match(client, /\.app-loader video\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?object-fit:\s*contain;[\s\S]*?object-position:\s*50% 50%;[\s\S]*?transform:\s*none/,
        'the portrait source must stay centered and uncropped while the logo is visible');
    assert.match(client, /\.app-loader\.star-wipe video\s*\{[\s\S]*?object-fit:\s*cover;[\s\S]*?transform:\s*scale\(1\.02\)/,
        'only the final solid star wipe may cover the viewport');
    assert.doesNotMatch(client, /@media \(max-aspect-ratio:\s*4 \/ 5\)[\s\S]*?\.app-loader video/,
        'portrait sizing must not shrink the whole video element and reveal side bars');
    assert.match(client, /\.app-loader::after[\s\S]*?background:\s*#fff/,
        'a full-screen white cover must hide the black source frames before playback reaches white');
    assert.match(client, /\.app-loader\.video-visible::after\s*\{\s*display:\s*none/);
    assert.match(client, /\.app-loader\.ending-black\s*\{\s*background:\s*#000/,
        'the final star wipe must paint the full viewport black on every aspect ratio');
    assert.doesNotMatch(client, /viewport-fit=cover/,
        'Telegram already supplies the mobile safe area; viewport-fit would apply it twice');
    assert.match(client, /setSparkTelegramChrome\('#ffffff'\)[\s\S]*?requestFullscreen/,
        'Telegram safe areas must be painted before the opening animation');
    assert.match(client, /background:\s*#fff;[\s\S]*?\.app-loader video/,
        'the opening animation must not have black letterbox bars');
    assert.doesNotMatch(client, /video\.currentTime\s*=/,
        'programmatic pre-play seeking can stall muted autoplay on iOS');
    assert.match(client, /video\.currentTime\s*>=\s*0\.30[\s\S]*?classList\.add\('video-visible'\)/,
        'the black intro stays covered until the decoder reaches a real white frame');
    assert.match(client, /video\.currentTime\s*>=\s*4\.82[\s\S]*?classList\.add\('star-wipe'\)[\s\S]*?setSparkTelegramChrome\('#000000'\)/,
        'Telegram safe areas and cover sizing must join the final star wipe');
    assert.match(client, /video\.currentTime\s*>=\s*5\.38[\s\S]*?classList\.add\('ending-black'\)/,
        'the outer background turns black only once the source itself is almost fully black');
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

test('inline games, referral links and account language use the new app identity', () => {
    const checkersIcon = path.join(root, 'assets', 'inline-icons', 'checkers-versus.png');
    const tttIcon = path.join(root, 'assets', 'inline-icons', 'tic-tac-toe.png');
    for (const file of [checkersIcon, tttIcon]) {
        assert.ok(fs.existsSync(file), `${path.basename(file)} must be bundled`);
        assert.ok(fs.statSync(file).size > 100_000, `${path.basename(file)} must contain the supplied artwork`);
        const png = fs.readFileSync(file);
        assert.equal(png[25], 6, `${path.basename(file)} must use RGBA instead of a baked black background`);
    }
    assert.match(server, /assets\/inline-icons\/checkers-versus\.png/);
    assert.match(server, /assets\/inline-icons\/tic-tac-toe\.png/);
    assert.match(server, /checkers-versus\.png\?v=20260827-2/,
        'Telegram must receive a fresh URL after the transparent thumbnail replaces its cached copy');
    assert.match(server, /tic-tac-toe\.png\?v=20260827-2/);
    assert.match(server, /spark_game_bot\/spark\?startapp=ref_/);
    assert.doesNotMatch(server, /spark_game_bot\/sparkapp\?startapp=ref_/);
    assert.match(client, /const REFERRAL_APP_NAME = 'spark'/);
    assert.match(client, /languageStorageKey = languageUserId \? `language_\$\{languageUserId\}`/);
    assert.match(client, /legacyOwner === languageUserId/,
        'a language left by another Telegram account must not override the current account');
    assert.match(client, /code\.startsWith\('zh'\)[\s\S]*?code\.startsWith\('en'\)/);
    assert.match(client, /checking: 'Checking\.\.\.'[\s\S]*?welcome: 'Welcome!'/);
    assert.match(client, /t\('checking'\)[\s\S]*?t\('welcome'\)/);
});

test('inline games use Telegram rich messages with in-message buttons and classic fallback', () => {
    assert.match(server, /require\('\.\/telegram-rich-messages'\)/);
    assert.match(richMessages, /input_message_content:\s*richMessageContent\(richHtml\)/);
    assert.match(server, /telegramBotApi\('answerInlineQuery'[\s\S]*?fallbackResults/);
    assert.match(server, /telegramBotApi\('editMessageText'[\s\S]*?richMessageContent\(richHtml\)/);
    assert.match(server, /editTTTInlineMessage\([\s\S]*?editCheckersInlineMessage\(/);
    assert.match(server, /ensureTTTInlineGame\(inlineMessageId, gameId\)/);
    assert.match(server, /ensureCheckersInlineGame\(inlineMessageId, gameId\)/);
    assert.match(server, /topData = await getTopsForGames\([\s\S]*?const readyTopGames = topGames\.map/,
        'rich leaderboard results must contain data before Telegram sends them');
    assert.doesNotMatch(server, /Загружаем актуальный топ игроков|Загрузка топа/,
        'a rich inline result cannot depend on chosen_inline_result to replace a loading shell');
    assert.match(richMessages, /function richCheckersHtml[\s\S]*?<table compact>/,
        'checkers should render as an unbordered alternating-cell table rather than blue gridlines');
    assert.match(richMessages, /type="callback_data" style="link"/,
        'checkers cells must use transparent link-style callbacks instead of button capsules');
    assert.match(richMessages, /CHECKERS_RICH_PIECES[\s\S]*?<tg-emoji/,
        'custom emoji prevent Telegram from underlining checker pieces as ordinary links');
    assert.doesNotMatch(richMessages.slice(richMessages.indexOf('function richCheckersHtml'), richMessages.indexOf('function richActionHtml')), /[□■]/);
    assert.match(server, /const TTT_EMPTY = '\\u2063\\u2002\\u2002'/,
        'empty tic-tac-toe controls must stay wide without exposing white square glyphs');
    assert.doesNotMatch(server.slice(server.indexOf('const TTT_X'), server.indexOf('// --- CHECKERS GAME ---')), /▫️/);
    assert.match(server, /getTopsForGames\(topConfigs\.filter\(Boolean\), userId, true\)/,
        'rich leaderboards support custom premium emoji and should not downgrade them');
    assert.match(server, /text:\s*'Открыть Spark'[\s\S]*?style:\s*'success'/,
        'the rich action must remain readable in Telegram themes that render primary buttons white');
    assert.doesNotMatch(
        server.slice(server.indexOf('// === КРЕСТИКИ-НОЛИКИ ===')),
        /bot\.editMessageReplyMarkup\(/,
        'checkers selections must update the embedded rich board, not only a classic keyboard',
    );
    assert.equal(
        (server.match(/const (?:tttInviteText|checkersInviteText|inviteText) = `\$\{EMOJI\.joystick\}/g) || []).length,
        4,
        'premium game emoji must be present in the initial inline message, not only after its first edit',
    );
});

test('profile tabs, playtime and Minesweeper ranks stay lightweight and complete', () => {
    assert.match(client, /-webkit-text-size-adjust:\s*100%/,
        'iOS must not inflate profile sheet text after a relayout');
    assert.match(client, /id="profileOverviewTab"[\s\S]*?id="profileStatsTab"/);
    assert.match(client, /initProfileSegmentDrag[\s\S]*?setPointerCapture[\s\S]*?--profile-tab-progress/);
    assert.match(client, /\.profile-segment\s*\{[\s\S]*?touch-action:\s*none[\s\S]*?-webkit-touch-callout:\s*none/,
        'a held horizontal profile drag must not be stolen by native scrolling or callouts');
    assert.match(client, /profile-favorite-label[\s\S]*?data-i18n="favoriteGame"/);
    assert.match(client, /\.record-details\s*\{[\s\S]*?grid-template-rows:\s*0fr[\s\S]*?\.record-row\.open \.record-details\s*\{\s*grid-template-rows:\s*1fr/,
        'expanded game statistics should animate their real content height smoothly');
    assert.match(client, /data-profile-game="saper"[\s\S]*?id="details-saper"/);
    assert.match(client, /saper_best_6[\s\S]*?saper_best_8[\s\S]*?saper_best_10[\s\S]*?saper_best_15/);
    assert.match(client, /visibilitychange[\s\S]*?pagehide/);
    assert.doesNotMatch(client.slice(client.indexOf('Lightweight profile playtime tracking'), client.indexOf('Profile overview\/statistics switch')), /setInterval\(/,
        'playtime tracking must remain event-driven and add no recurring timer');
    assert.match(client, /const category='saper_best_' \+ sCols;[\s\S]*?sSessionReady=startGameSession\(category\)/);
    assert.match(client, /await sSessionReady;[\s\S]*?sendStatToBackend\(key,finishedTime\)/,
        'fast Minesweeper wins must wait for their signed session before saving the time');

    for (const category of ['saper_best_6', 'saper_best_8', 'saper_best_10', 'saper_best_15']) {
        assert.match(server, new RegExp(`\\{ key: '${category}', asc: true \\}`));
    }
    assert.match(server, /Promise\.all\(categories\.map/);
    assert.match(server, /\.gt\(cat\.key, 0\)/);
    assert.match(server, /rankQuery\.lt\(cat\.key, LEGACY_MINESWEEPER_TIME_SENTINEL\)/,
        'the legacy 9999 placeholder must never receive a leaderboard rank');
    assert.match(server, /readSignedSessionStart[\s\S]*?recoveredAfterRestart/,
        'a signed Minesweeper session must survive an in-memory backend restart');
    assert.match(client, /seconds > 0 && seconds < 9999/,
        'the profile must never print the legacy 9999 placeholder as a time');
    assert.match(server, /goal = \{[\s\S]*?place: targetPlace[\s\S]*?gap:/);
    assert.match(client, /allGoalsComplete:[\s\S]*?hasAnyRank[\s\S]*?'allGoalsComplete'/,
        'players who already own every available top spot must not be treated as new');
    assert.match(client, /function formatSaperSeconds[\s\S]*?seconds\.toFixed\(3\)/,
        'Minesweeper profile times keep thousandths');
    assert.match(client, /id="saperTimer">000\.000/);
    assert.match(client, /userVal = Number\(userValRaw\)/,
        'leaderboard rendering must not truncate Minesweeper thousandths');
    assert.match(client, /spark_theme_preference[\s\S]*?savedThemePreference === 'light'/,
        'an explicit light theme must win over Telegram system dark mode after reload');
    assert.match(client, /\.profile-favorite\s*\{[\s\S]*?width:\s*min\(100%, 340px\)[\s\S]*?min-height:\s*62px/,
        'the favorite game summary should be wide and compact rather than a tall badge');
});

test('score persistence is monotonic and leaderboard displacement is shared by every game', () => {
    assert.match(server, /function incrementCounterStat[\s\S]*?for \(let attempt = 0; attempt < 8; attempt\+\+\)/,
        'counter updates must retry compare-and-swap conflicts instead of losing wins');
    assert.match(server, /update\.eq\(gameType, rawCurrent\)/,
        'counter writes must be conditional on the value that was read');
    assert.match(server, /Number\(stat_delta \?\? 1\)[\s\S]*?delta > \(game_type === 'sudoku_wins' \? 3 : 1\)/,
        'Sudoku awards its real difficulty points while cached clients remain compatible');
    assert.match(server, /function persistBestStat[\s\S]*?isTime \? score < current : score > current/,
        'a slower Minesweeper result can never replace the minimum record');
    assert.match(server, /getLeaderboardSnapshot\(game_type\)[\s\S]*?notifyLeaderboardDisplacements/,
        'all saved leaderboard categories, including Sudoku, notify displaced players');
    assert.match(client, /sudokuResultSaving[\s\S]*?statDelta: points[\s\S]*?setTimeout\(resolve, 600\)/,
        'a completed Sudoku game is submitted once with an idempotent retry');
    assert.match(client, /sessionToken:\s*activeSessionTokens\.sudoku_wins\s*\|\|\s*null/,
        'a resumable Sudoku board keeps its original signed session');
    assert.match(client, /data\.sessionToken\)\s*activeSessionTokens\.sudoku_wins\s*=\s*data\.sessionToken/,
        'resuming Sudoku restores the original server-signed session');
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
    assert.match(server, /repairCheckersCounters[\s\S]*?Math\.max\(current \+ delta, Number\(currentUser\.checkers_wins_pve\)/);
    assert.match(server, /update = rawCurrent === null[\s\S]*?update\.eq\(gameType, rawCurrent\)/,
        'profile counters use a database compare-and-swap guard even across server processes');
});
