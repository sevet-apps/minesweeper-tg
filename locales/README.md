Spark locale packs
==================

`source.ru.json` is generated from the app, current Monopoly dictionary, title
catalog, Block Blast labels, bot greeting, and privacy policy. Run
`node scripts/extract-localization-catalog.cjs` after changing any of those
sources. This also regenerates the existing English and Chinese packs.

Each of the nine added languages has a `locales/<language>.json` file with
`app`, `monopoly`, `extras`, `botStart`, and `privacyHtml` sections. Keep keys,
placeholders such as `{code}`, links, Telegram handles, and HTML tags intact.
Run `node scripts/check-locales.cjs` to verify complete key coverage and
structural integrity, or pass a language code (for example, `ja`) to check one
new pack while it is being edited. Every language has a matching circular flag in
`assets/flags/`.
