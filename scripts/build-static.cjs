'use strict';

// Publish only tracked frontend files. Copying the repository root would expose
// the backend, database migrations, tests and any untracked local credentials.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createPublicUrls } = require('../server/public-urls');

const ROOT_FILES = new Set([
    'index.html', 'monopoly.html', 'Banner_IPhone_17.png',
    'referral-banner.png', 'tournament-banner.png',
    'checkmark.json', 'cup.json', 'globus.json', 'top.json', 'wave_hand.json',
    'wordle_answers.txt', 'wordle_dict.txt',
]);
const LANGUAGES = ['en', 'zh', 'es', 'pt', 'id', 'fr', 'ja', 'de', 'ko', 'tr', 'vi'];
const ASSET_EXTENSION = /\.(?:html|css|js|json|svg|png|jpg|jpeg|webp|gif|ico|woff2?|ttf|wav|mp3|mp4)$/i;

function isPublicFile(file) {
    if (file.includes('\\') || file.split('/').some(part => !part || part.startsWith('.'))) return false;
    if (ROOT_FILES.has(file) || LANGUAGES.some(lang => file === `locales/${lang}.json`)) return true;
    if (file === 'monopoly/assets/fonts/LICENSE-Inter.txt') return true;
    return /^(?:assets|monopoly|monopoly-legacy)\//.test(file) && ASSET_EXTENSION.test(file);
}

function buildStatic({ root = path.resolve(__dirname, '..'), publicUrl } = {}) {
    root = fs.realpathSync(root);
    const output = path.resolve(root, 'public');
    // The only directory this script may replace is <repository>/public.
    if (path.dirname(output) !== root || path.basename(output) !== 'public') {
        throw new Error('Unsafe static output directory');
    }
    if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
        throw new Error('Static output must not be a symlink');
    }
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
        .split('\0').filter(Boolean).filter(isPublicFile);
    for (const file of [...ROOT_FILES, ...LANGUAGES.map(lang => `locales/${lang}.json`), 'monopoly/index.html']) {
        if (!files.includes(file)) throw new Error(`Missing tracked frontend file: ${file}`);
    }
    // Validate everything before replacing an existing build.
    for (const file of files) {
        let parent = root;
        for (const segment of file.split('/')) {
            parent = path.join(parent, segment);
            if (fs.lstatSync(parent).isSymbolicLink()) throw new Error(`Cannot publish a symlink: ${file}`);
        }
        if (!fs.statSync(parent).isFile()) throw new Error(`Expected a regular frontend file: ${file}`);
    }
    const { assetUrl } = createPublicUrls(publicUrl);
    fs.rmSync(output, { recursive: true, force: true });
    fs.mkdirSync(output);
    for (const file of files) {
        const destination = path.join(output, file);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        if (file === 'index.html') {
            const html = fs.readFileSync(path.join(root, file), 'utf8');
            const meta = /(<meta property="og:image" content=")[^"]*(">)/;
            if (!meta.test(html)) throw new Error('Missing Spark preview image metadata');
            fs.writeFileSync(destination, html.replace(meta, (_, before, after) =>
                before + assetUrl('assets/spark-logo.png?v=20260823') + after));
        } else {
            fs.copyFileSync(path.join(root, file), destination);
        }
    }
    return { output, files };
}

if (require.main === module) {
    const result = buildStatic({ publicUrl: process.env.SPARK_PUBLIC_URL || process.env.CI_PAGES_URL });
    console.log(`Static website: ${result.files.length} frontend files in public/`);
}

module.exports = { buildStatic, isPublicFile, ROOT_FILES, LANGUAGES };
