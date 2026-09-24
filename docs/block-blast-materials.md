# Block Blast: materials and motion

The palette button beside the best score opens eleven choices: the original style and ten new materials. Selection and gentle effects are saved on this device. The board, tray and dragged piece share the material. Material choice never affects the board, score, offered shapes or server checkpoint.

| Material | Clear motion |
| --- | --- |
| Jelly | Squash, vertical stretch and droplets |
| Wool | Soft contraction and drifting yarn loops |
| Crystal | Faceted contraction and angular shards |
| Paint | A horizontal smear and spreading flecks |
| Cheese | Compression and falling crumbs |
| Honey | Stretching drops that fall downward |
| Porcelain | A small recoil, rotation and ceramic chips |
| Wood | A short lift followed by falling slivers |
| Candy | A springy pop and spinning fragments |
| Ice | A restrained fade and rising icy flecks |

Ten separate texture tasks produced original SVG overlays. All ten textures together are 23,375 bytes before compression; none contains raster data, scripts, filters or external resources. Only the selected texture is needed during play. The catalog loads the other previews when opened.

## Research and design decisions

- [Hungry Studio's Chinese Google Play listing](https://play.google.com/store/apps/details?hl=zh-CN&id=com.block.juggle) emphasizes readable 8×8 placement, combos, audiovisual clearing and lightweight play. Those are the interaction priorities here.
- [Jelly Block Blast's developer listing](https://play.google.com/store/apps/details?hl=zh_TW&id=com.dopaminefactory.jellyblockblast) describes soft visuals and elastic animation. It is a separate game, used as a material reference.
- [The Chinese TapTap listing for 俄罗斯方块拼图](https://www.taptap.cn/app/764432) and its screenshots supplied additional palette/material references, including porcelain. This is also a separate product, not Hungry Studio's original.
- Player discussions about [jelly textures](https://www.reddit.com/r/blockblast/comments/1vjbyfh/specific_texture/) and [fabric/cheese-like blocks](https://www.reddit.com/r/blockblast/comments/1shfxox/block_type_different/) informed the range. These are anecdotal observations, not a verified complete catalog of the original app.

The motion recipes are our own interpretation of each material, not a frame-for-frame reconstruction of proprietary animations. No third-party artwork was copied. The theme stays fixed until the player changes it, keeping the board predictable. Combo feedback is a compact label; points use an ivory fill and a dark outline rather than rainbow text. Scores and leaderboard values use narrow non-breaking spaces, for example `1 248 000`.

## Performance and state integrity

- Line-clear bursts have at most 24 transient particles, or 10 when the device reports limited CPU/memory; gentle effects, Lite mode and reduced-motion preference disable particles.
- A burst has at most 64 visual cell copies. A new clear cancels the previous burst and removes its nodes synchronously. Copies cannot clear newly placed live cells.
- Motion uses transforms and opacity, without animated filters or a permanent render loop. The score counter owns one cancellable animation frame sequence. Closing or hiding the game clears transient effects.
- Intersecting lines deduplicate their shared cell. Line/all-clear bonuses settle immediately, before saving and generating the next hand. Intermediate server replies cannot replace newer optimistic points.
- The score animation, fill/drain indicators and material-specific placement motion all respect reduced motion. A primary-pointer guard keeps a second finger from taking over sheet dismissal.

## Validation

Run `node --test server/test/*.test.js` for scoring, deterministic hand generation, queue reconciliation, gesture cancellation, number formatting and resource-budget regression coverage.

Run `node scripts/preview-block-blast.cjs`, then open `http://127.0.0.1:4173/bb-qa`. This local harness extracts production board/drag/scoring functions and supplies isolated fixtures, with no account or network mutations. It includes single-line, crossing-line, full-board and repeated-clear scenarios. Query options: `touch=1`, `light=1`, `lang=en`, `lang=zh`, and `frame=170` to inspect a frozen animation frame.

Browser QA covered 320×568 and 390×844 mobile layouts, desktop layout, light/dark contrast, material previews, theme persistence, dragging a piece, sheet dismissal and intermediate animation frames. Twenty consecutive clears left zero transient nodes; the observed particle peaks were 24 with full effects and 0 in gentle mode. These are desktop-browser checks at mobile viewport sizes, not physical iPhone/Android GPU measurements.
