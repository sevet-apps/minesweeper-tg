const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = require('../locales/source.ru.json');
const languages = ['es', 'pt', 'id', 'fr', 'ja', 'de', 'ko', 'tr', 'vi'];
const sections = ['app', 'monopoly', 'extras', 'botStart'];

const matches = (value, pattern) => [...String(value).matchAll(pattern)].map(match => match[0]).sort();
const placeholders = value => matches(value, /\{[A-Za-z][A-Za-z0-9_]*\}/g);
const tags = value => matches(value, /<\/?[a-z][a-z0-9]*(?:\s[^>]*)?>/gi).map(tag => tag.match(/^<\/?([a-z][a-z0-9]*)/i)?.[1] || '').sort();
const urls = value => matches(value, /https:\/\/[^"'\s<>]+/g);

function checkSection(errors, lang, pack, section) {
    const original = source[section];
    const translated = pack[section];
    if (!translated || typeof translated !== 'object' || Array.isArray(translated)) {
        errors.push(`${lang}.${section}: missing dictionary`);
        return;
    }
    for (const key of Object.keys(original)) {
        const value = translated[key];
        if (typeof value !== 'string' || !value.trim()) {
            errors.push(`${lang}.${section}.${key}: missing text`);
            continue;
        }
        if (/[А-Яа-яЁё]/.test(value)) errors.push(`${lang}.${section}.${key}: untranslated Cyrillic`);
        if (placeholders(value).join('|') !== placeholders(original[key]).join('|')) {
            errors.push(`${lang}.${section}.${key}: changed placeholders`);
        }
    }
    for (const key of Object.keys(translated)) {
        if (!(key in original)) errors.push(`${lang}.${section}.${key}: unexpected key`);
    }
}

function validate(selectedLanguages = languages) {
    const errors = [];
    for (const lang of selectedLanguages) {
        const file = path.join(root, 'locales', `${lang}.json`);
        if (!fs.existsSync(file)) { errors.push(`${lang}: missing locale file`); continue; }
        let pack;
        try { pack = JSON.parse(fs.readFileSync(file, 'utf8')); }
        catch (error) { errors.push(`${lang}: invalid JSON: ${error.message}`); continue; }
        for (const section of sections) checkSection(errors, lang, pack, section);
        if (typeof pack.privacyHtml !== 'string' || !pack.privacyHtml.trim()) {
            errors.push(`${lang}: missing privacy policy`);
            continue;
        }
        if (/[А-Яа-яЁё]/.test(pack.privacyHtml)) errors.push(`${lang}: untranslated privacy text`);
        if (tags(pack.privacyHtml).join('|') !== tags(source.privacyHtml).join('|')) errors.push(`${lang}: privacy HTML structure changed`);
        if (urls(pack.privacyHtml).join('|') !== urls(source.privacyHtml).join('|')) errors.push(`${lang}: privacy links changed`);
        for (const handle of ['@spark_game_bot', '@spark_game_news', '@spark_game_support']) {
            if (!pack.privacyHtml.includes(handle)) errors.push(`${lang}: privacy policy lost ${handle}`);
        }
        if (/<script\b/i.test(pack.privacyHtml)) errors.push(`${lang}: script tag in privacy policy`);
        if (!fs.existsSync(path.join(root, 'assets', 'flags', `${lang}.svg`))) errors.push(`${lang}: missing flag icon`);
    }
    for (const [original, translated] of [
        ['app', 'appEnglish'], ['app', 'appChinese'],
        ['monopoly', 'monopolyEnglish'], ['monopoly', 'monopolyChinese'],
        ['extras', 'extrasEnglish'], ['extras', 'extrasChinese']
    ]) {
        for (const key of Object.keys(source[original])) {
            const value = source[translated][key];
            if (typeof value !== 'string') errors.push(`${translated}: missing ${key}`);
            else if (/[А-Яа-яЁё]/.test(value)) errors.push(`${translated}.${key}: untranslated Cyrillic`);
        }
    }
    const appHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const match of appHtml.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)) {
        if (!(match[1] in source.app)) errors.push(`App markup: unknown i18n key ${match[1]}`);
    }
    return errors;
}

if (require.main === module) {
    const selectedLanguages = process.argv.slice(2);
    const unknown = selectedLanguages.filter(lang => !languages.includes(lang));
    if (unknown.length) {
        console.error(`Unknown language: ${unknown.join(', ')}`);
        process.exit(1);
    }
    const checkedLanguages = selectedLanguages.length ? selectedLanguages : languages;
    const errors = validate(checkedLanguages);
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log(`Checked ${checkedLanguages.join(', ')} plus built-in languages, ${Object.keys(source.app).length} app strings, ${Object.keys(source.monopoly).length} Monopoly fragments, ${Object.keys(source.extras).length} extra strings.`);
}

module.exports = { validate };
