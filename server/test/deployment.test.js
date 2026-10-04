'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPublicUrls, DEFAULT_WEBAPP_URL } = require('../public-urls');
const { buildStatic, isPublicFile } = require('../../scripts/build-static.cjs');
const root = path.resolve(__dirname, '../..');

test('website migration switches bot URLs and thumbnails together without losing a project prefix', () => {
    assert.equal(createPublicUrls().WEBAPP_URL, DEFAULT_WEBAPP_URL);
    assert.equal(createPublicUrls('').assetUrl('assets/spark-logo.png'), `${DEFAULT_WEBAPP_URL}assets/spark-logo.png`);
    for (const base of ['https://spark.example.test', 'https://spark.example.test/', 'https://example.test/spark']) {
        const { WEBAPP_URL, assetUrl } = createPublicUrls(base);
        assert.ok(WEBAPP_URL.endsWith('/'));
        assert.equal(assetUrl('assets/inline-icons/checkers-versus.png?v=20260827-2'),
            `${base.replace(/\/+$/, '')}/assets/inline-icons/checkers-versus.png?v=20260827-2`);
    }
    for (const base of ['http://example.test', 'https://user:password@example.test',
        'https://example.test/?token=value', 'https://example.test/#fragment', 'not a URL']) {
        assert.throws(() => createPublicUrls(base));
    }
    const { assetUrl } = createPublicUrls();
    for (const file of ['https://other.test/icon.png', '/assets/icon.png', 'assets/../server/index.js',
        '../server/index.js', 'assets/icon.png?secret=value']) assert.throws(() => assetUrl(file));
});

test('static build never publishes backend, database, credentials or development files', () => {
    for (const file of ['server/index.js', 'supabase/migrations/secret.sql', 'docs/design.html',
        'scripts/preview-ui.cjs', 'examples/ios26/LiquidGlassControls.swift', 'motion/index.html',
        '.env', '.git/config', 'assets/.env', 'assets/private/.secret.js', 'assets/ui/app.js.map',
        'locales/source.ru.json', 'assets/flags/README.md', '../index.html', 'assets/../server/index.js',
        'assets\\..\\server\\index.js']) assert.equal(isPublicFile(file), false, file);

    const { output, files } = buildStatic({ root, publicUrl: 'https://preview.example.test/spark/' });
    assert.ok(files.length > 250, 'the complete frontend assets must be retained');
    for (const directory of ['server', 'supabase', 'scripts', 'docs', 'examples', 'motion', '.git']) {
        assert.equal(fs.existsSync(path.join(output, directory)), false, directory);
    }
    assert.equal(fs.existsSync(path.join(output, 'locales/source.ru.json')), false);
    const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
    assert.match(html, /content="https:\/\/preview\.example\.test\/spark\/assets\/spark-logo\.png\?v=20260823"/);
    assert.ok(html.includes('https://spark-game-backend.onrender.com'), 'backend address stays unchanged');
    for (const file of ['assets/checkers/ai-worker.js', 'assets/block-blast/visuals.js',
        'assets/media/app-loader.mp4', 'locales/ja.json', 'monopoly/js/scene/dice-worker.js',
        'monopoly/libs/three.min.js', 'monopoly/assets/lottie/duck.json',
        'monopoly/assets/fonts/LICENSE-Inter.txt', 'wordle_dict.txt', 'wordle_answers.txt']) {
        assert.ok(fs.existsSync(path.join(output, file)), `${file} must still be available`);
    }
    // Stale or accidentally added files cannot survive the next build.
    fs.mkdirSync(path.join(output, 'server'));
    fs.writeFileSync(path.join(output, 'server/index.js'), 'private source');
    buildStatic({ root });
    assert.equal(fs.existsSync(path.join(output, 'server')), false);
});

test('published documents and styles retain their local image, module and font references', () => {
    const output = path.join(root, 'public');
    const { files } = buildStatic({ root });
    // Archived legacy pages already contain obsolete asset references. Verify
    // the active app and Monopoly bundle that players actually open.
    for (const file of files.filter(file => /\.(?:html|css)$/.test(file) && !file.startsWith('monopoly-legacy/'))) {
        const source = fs.readFileSync(path.join(output, file), 'utf8');
        const references = /(?:\b(?:src|href|poster)=["']([^"']+)["']|url\(\s*["']?([^\s)"']+))/g;
        for (const match of source.matchAll(references)) {
            const reference = match[1] || match[2];
            if (/^(?:[a-z]+:|\/\/|#)/i.test(reference) || reference.includes('${')) continue;
            const local = reference.split(/[?#]/)[0];
            if (!local) continue;
            const resolved = path.resolve(path.dirname(path.join(output, file)), decodeURIComponent(local));
            assert.ok(fs.existsSync(resolved), `${file} requires ${reference}`);
        }
    }
});
