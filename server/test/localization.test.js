const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../../scripts/check-locales.cjs');

test('all twelve languages cover app, Monopoly, titles, Block Blast, bot greeting and privacy', () => {
    assert.deepEqual(validate(), []);
});
