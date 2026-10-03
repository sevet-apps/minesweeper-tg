'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../monopoly/js/v2/i18n.js'), 'utf8');
const monopolyRoot = path.join(__dirname, '../../monopoly');

function load(lang) {
    const window = {};
    const document = {
        title: 'Монополия — Spark Games',
        documentElement: {},
        addEventListener() {},
    };
    const context = {
        window,
        document,
        location: { search: `?lang=${lang}` },
        fetch: async url => ({
            ok: true,
            json: async () => JSON.parse(fs.readFileSync(path.resolve(monopolyRoot, url), 'utf8')),
        }),
        URLSearchParams,
        Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_NODE: 9 },
        NodeFilter: { SHOW_TEXT: 4 },
        MutationObserver: class { observe() {} },
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return window.MonopolyI18n;
}

test('Monopoly translates static and dynamic phrases to English', () => {
    const i18n = load('en');
    assert.equal(i18n.translate('Монополия'), 'Monopoly');
    assert.equal(i18n.translate('Игрок 1 покупает **Парфюмерия** за $1000'),
        'Player 1 buys **Perfume** for $1000');
});

test('Monopoly translates static and dynamic phrases to Chinese', () => {
    const i18n = load('zh');
    assert.equal(i18n.translate('Монополия'), '大富翁');
    assert.equal(i18n.translate('Ваш ход!'), '轮到您！');
    assert.equal(i18n.translate('Код комнаты'), '房间代码');
});

test('Monopoly keeps variable exchange and rent messages grammatical in Japanese', async () => {
    const i18n = load('ja');
    await i18n.ready;
    assert.equal(i18n.translate('Первый экземпляр уже хранится в коллекции. Этот можно обменять на 300 монет.'),
        '最初の1枚はコレクションに残ります。この重複分は300コインと交換できます。');
    assert.equal(i18n.translate('Авто · +4% ко всем уровням аренды после сбора монополии.'),
        '自動車 · 同じ色の物件をすべてそろえると、すべての家賃に+4%のボーナスが適用されます。');
    assert.equal(i18n.translate('Один лишний экземпляр «Tesla» исчезнет. Вы получите 300 монет. Первый экземпляр останется навсегда.'),
        '重複している「Tesla」1枚が消えます。300コインを受け取ります。最初の1枚はずっと残ります。');
});

function collectSourceStrings(directory) {
    const values = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === 'libs') continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            values.push(...collectSourceStrings(file));
            continue;
        }
        if (!/\.(?:html|js)$/.test(entry.name)) continue;
        if (file.endsWith(path.join('js', 'v2', 'i18n.js'))) continue;
        let text = fs.readFileSync(file, 'utf8');
        if (entry.name.endsWith('.js')) {
            text = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        }
        const quoted = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`/g;
        for (const match of text.matchAll(quoted)) {
            const value = match[1] ?? match[2] ?? match[3] ?? '';
            if (/[А-Яа-яЁё]/.test(value)) values.push(value);
        }
    }
    return values;
}

test('Monopoly source strings have no untranslated Cyrillic in English or Chinese', () => {
    const sourceStrings = collectSourceStrings(monopolyRoot);
    for (const lang of ['en', 'zh']) {
        const i18n = load(lang);
        const untranslated = sourceStrings
            .map(value => i18n.translate(value))
            .flatMap(value => value.match(/[А-Яа-яЁё][А-Яа-яЁё0-9 .,!?…—–:;«»()/$*-]*/g) || [])
            .map(value => value.trim())
            .filter(Boolean)
            // The lightweight string scanner can join JS comments or split the
            // `пол${...}` plural-building template. Neither reaches the DOM.
            .filter(value => ![
                'сразу показываем то, что уже знаем', 'разметку обновляем сами,', 'пустыми полями',
                'Слой', 'Слой 1', 'недоступно, включаю 2', 'фолбэк —', 'Эмодзи',
                'слушатель', 'упал:', 'пол$', 'е', 'я'
            ].includes(value));
        const unique = [...new Set(untranslated)];
        assert.equal(unique.length, 0, `${lang} untranslated strings:\n${unique.join('\n')}`);
    }
});
