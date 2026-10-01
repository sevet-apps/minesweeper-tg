'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const visuals = fs.readFileSync(path.join(root, 'assets/block-blast/visuals.css'), 'utf8');

test('Block Blast has a square board before newer viewport CSS is considered', () => {
    const base = visuals.match(/#bb-screen \.bb-grid\s*\{([^}]+)\}/)?.[1].replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(base, 'base board declaration exists');
    assert.match(base, /width:\s*90vw/);
    assert.match(base, /height:\s*90vw/);
    assert.match(base, /max-width:\s*350px/);
    assert.doesNotMatch(base, /(?:dvh|min\(|max\()/,
        'unsupported functions must not invalidate the fallback board');
    assert.match(visuals, /@supports \(height: 100dvh\)/,
        'viewport-sensitive sizing remains an enhancement');
});

test('Minesweeper dark cells use a standalone selector understood by older WebViews', () => {
    const base = html.match(/\.cell\s*\{([^}]+)\}/)?.[1];
    assert.ok(base);
    assert.doesNotMatch(base, /\[data-theme=|\s&\s*\{/);
    assert.match(html, /\[data-theme="dark"\] #saperGrid \.cell\s*\{[^}]*background:/);
    assert.match(html, /\[data-theme="dark"\] #saperGrid \.cell\.revealed\s*\{[^}]*background:/);
});
