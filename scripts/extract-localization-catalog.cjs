const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const monopolySource = fs.readFileSync(path.join(root, 'monopoly/js/v2/i18n.js'), 'utf8');

const appStart = appSource.indexOf('const translations = {');
const appEnd = appSource.indexOf('\n        };', appStart);
if (appStart < 0 || appEnd < 0) throw new Error('App translations not found');
const appExpression = appSource.slice(appStart + 'const translations = '.length, appEnd + '\n        }'.length);
const app = vm.runInNewContext(`(${appExpression})`);

const monoStart = monopolySource.indexOf('    const EN = {');
const monoEnd = monopolySource.indexOf('\n    let table =', monoStart);
if (monoStart < 0 || monoEnd < 0) throw new Error('Monopoly translations not found');
const mono = vm.runInNewContext(`${monopolySource.slice(monoStart, monoEnd)}\n({ EN, ZH })`);

const privacyMatch = appSource.match(/<div data-lang-content="ru">([\s\S]*?)\n            <\/div>/);
if (!privacyMatch) throw new Error('Russian privacy text not found');
const privacyEnglish = appSource.match(/<div data-lang-content="en" hidden>([\s\S]*?)\n            <\/div>/);
const privacyChinese = appSource.match(/<div data-lang-content="zh" hidden>([\s\S]*?)\n            <\/div>/);
if (!privacyEnglish || !privacyChinese) throw new Error('English or Chinese privacy text not found');

const titleStart = appSource.indexOf('const TITLE_UI_COPY = {');
const titleEnd = appSource.indexOf('\n        };', titleStart);
if (titleStart < 0 || titleEnd < 0) throw new Error('Title UI copy not found');
const titleExpression = appSource.slice(titleStart + 'const TITLE_UI_COPY = '.length, titleEnd + '\n        }'.length);
const titleUiCopy = vm.runInNewContext(`(${titleExpression})`);
const { TITLES, GAME_LABELS } = require('../server/player-titles');
const extras = new Set(Object.values(titleUiCopy.ru));
for (const item of TITLES) {
    for (const field of ['name', 'description', 'note']) if (item[field]?.ru) extras.add(item[field].ru);
}
for (const item of Object.values(GAME_LABELS)) extras.add(item.ru);
const visuals = fs.readFileSync(path.join(root, 'assets/block-blast/visuals.js'), 'utf8');
const picker = fs.readFileSync(path.join(root, 'assets/block-blast/picker.js'), 'utf8');
const extraEnglish = {};
const extraChinese = {};
const addExtra = (ru, en, zh) => { extras.add(ru); extraEnglish[ru] = en; extraChinese[ru] = zh; };
for (const key of Object.keys(titleUiCopy.ru)) addExtra(titleUiCopy.ru[key], titleUiCopy.en[key], titleUiCopy.zh[key]);
for (const item of TITLES) {
    for (const field of ['name', 'description', 'note']) if (item[field]?.ru) addExtra(item[field].ru, item[field].en, item[field].zh);
}
for (const item of Object.values(GAME_LABELS)) addExtra(item.ru, item.en, item.zh);
const materialCatalog = visuals.slice(visuals.indexOf('    const catalog = ['), visuals.indexOf('    ].map(([id, ru, en, zh'));
for (const match of materialCatalog.matchAll(/\['[^']+',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'/g)) addExtra(match[1], match[2], match[3]);
for (const source of [visuals, picker]) {
    for (const match of source.matchAll(/(?:text|copy)\('([^']+)',\s*'([^']+)',\s*'([^']+)'\)/g)) addExtra(match[1], match[2], match[3]);
}
for (const [ru, en, zh] of [
    ['2–4 игрока · локально или онлайн', '2–4 players · local or online', '2–4 人 · 本地或在线'],
    ['Локальная игра', 'Local game', '本地游戏'],
    ['На одном устройстве по очереди', 'Take turns on one device', '在同一设备上轮流游戏'],
    ['Присоединиться к комнате друга', "Join a friend's room", '加入好友房间'],
    ['Найти комнату', 'Find a room', '查找房间'],
    ['Список открытых игр', 'List of open games', '公开房间列表'],
    ['Текст', 'Text', '文本'],
    ['Титул', 'Title', '称号']
]) addExtra(ru, en, zh);

const catalog = {
    notes: [
        'Translate every app value; keep keys and template placeholders like {name}, ${value}, HTML entities and punctuation semantics.',
        'Monopoly keys are Russian source fragments; translate every value while preserving placeholders, brand names and game terms.',
        'Translate all visible text in privacyHtml; retain tag structure, URL targets and Telegram handles.'
    ],
    app: app.ru,
    appEnglish: app.en,
    appChinese: app.zh,
    monopoly: Object.fromEntries(Object.keys(mono.EN).map(key => [key, key])),
    monopolyEnglish: mono.EN,
    monopolyChinese: mono.ZH,
    extras: Object.fromEntries([...extras].map(value => [value, value])),
    extrasEnglish: extraEnglish,
    extrasChinese: extraChinese,
    botStart: {
        welcome: 'Добро пожаловать в Spark Games!',
        pitch: 'Играйте в крутые игры и соревнуйтесь с друзьями!',
        leaderboards: 'Топы',
        game: 'игра',
        chatGames: 'Игры в чате',
        ticTacToe: 'крестики',
        checkers: 'шашки',
        openGames: 'Открыть игры',
        play: 'Играть'
    },
    privacyHtml: privacyMatch[1].trim()
};

const output = path.join(root, 'locales', 'source.ru.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(catalog, null, 2) + '\n');
for (const [lang, appKey, monoKey, extra, privacy] of [
    ['en', 'appEnglish', 'monopolyEnglish', extraEnglish, privacyEnglish],
    ['zh', 'appChinese', 'monopolyChinese', extraChinese, privacyChinese]
]) {
    fs.writeFileSync(path.join(root, 'locales', `${lang}.json`), JSON.stringify({
        app: catalog[appKey], monopoly: catalog[monoKey], extras: extra, privacyHtml: privacy[1].trim()
    }, null, 2) + '\n');
}
console.log(`Wrote ${output}: ${Object.keys(catalog.app).length} app keys, ${Object.keys(catalog.monopoly).length} Monopoly fragments, ${Object.keys(catalog.extras).length} extra strings.`);
