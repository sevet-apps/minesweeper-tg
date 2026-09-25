# Block Blast: materials and motion

The palette button beside the best score opens eleven choices: the original style and ten new materials. Selection and gentle effects are saved on this device. The board, tray and dragged piece share the material. Material choice never affects the board, score, offered shapes or server checkpoint.

| Material | Clear motion |
| --- | --- |
| Jelly | A held wobble, squash/stretch and soft gel droplets (1.22 s) |
| Wool | Unravelling into many drifting threads (1.38 s) |
| Crystal | Faceted contraction and angular shards |
| Paint | A blended brush stroke following each row/column, then dissolution (1.18 s) |
| Cheese | Compression and falling crumbs |
| Honey | Slow stretching and visible falling honey drops/strings (1.32 s) |
| Porcelain | Recoil and numerous ceramic shards retaining the blue pattern (1.26 s) |
| Wood | A short lift followed by falling slivers |
| Candy | A springy pop and spinning fragments |
| Ice | A restrained fade and rising icy flecks |

Ten separate texture tasks produced original SVG overlays. All ten textures together remain under 40 KB before compression; none contains raster data, scripts, filters or external resources. Only the selected texture is needed during play. The catalog loads the other previews when opened.

## Research and design decisions

- [Hungry Studio's Chinese Google Play listing](https://play.google.com/store/apps/details?hl=zh-CN&id=com.block.juggle) emphasizes readable 8×8 placement, combos, audiovisual clearing and lightweight play. Those are the interaction priorities here.
- [Jelly Block Blast's developer listing](https://play.google.com/store/apps/details?hl=zh_TW&id=com.dopaminefactory.jellyblockblast) describes soft visuals and elastic animation. It is a separate game, used as a material reference.
- [The Chinese TapTap listing for 俄罗斯方块拼图](https://www.taptap.cn/app/764432) and its screenshots supplied additional palette/material references, including porcelain. This is also a separate product, not Hungry Studio's original.
- Player discussions about [jelly textures](https://www.reddit.com/r/blockblast/comments/1vjbyfh/specific_texture/) and [fabric/cheese-like blocks](https://www.reddit.com/r/blockblast/comments/1shfxox/block_type_different/) informed the range. These are anecdotal observations, not a verified complete catalog of the original app.

The motion recipes are our own interpretation of each material, not a frame-for-frame reconstruction of proprietary animations. No third-party artwork was copied. The theme stays fixed until the player changes it, keeping the board predictable. Combo feedback combines a compact label with warm score glow and a restrained pulse; points use an ivory fill and a dark outline rather than rainbow text. Scores and leaderboard values use narrow non-breaking spaces, for example `1 248 000`.

## Performance and state integrity

- One canvas draws pre-baked texture/fragment atlases. There are no cloned board cells and no per-fragment DOM nodes. Two cached atlases bound texture memory. Canvas resolution is capped at 1.75×, or 1.25× on constrained devices.
- Up to three bursts may overlap. All bursts together are limited to 360 fragments, or 192 on constrained devices. Repeated slow frames also reduce the budget. Gentle effects, Lite mode and reduced-motion preference disable the canvas effects; duration is never shortened to reduce load.
- The renderer reads board geometry once, before writes. It derives cell size from the grid, so a placement wobble cannot distort snapping or clear geometry. Newly occupied cells mask old effects; clearing them again removes the live mask without reviving the old burst.
- The single rendering loop stops after the last burst. Closing or hiding the game cancels visual work. Placement listeners clean up both completed and cancelled animations. Unchanged tray shapes retain their DOM instead of being rebuilt on server acknowledgements. Drag sparks emit less often, and the ghost uses smaller static shadows.
- Placement lasts 440 ms (wool 500 ms, jelly 560 ms). Clear effects last 1.12–1.38 s. Score labels last 2.1 s with a readable hold, independently of subsequent clears; at most three labels coexist. The score counter owns one cancellable frame sequence.
- The intentionally enlarged drag is restored: visual cells are 12% bigger, while logical dimensions determine the board target.
- The picker uses the app's neutral settings colors and blue accent. Its panel is anchored to the bottom on every screen, with an explicit offscreen initial frame, 420 ms opening, 300 ms closing, primary-pointer swipe, keyboard focus containment and restored background accessibility state.
- Intersecting lines deduplicate their shared cell. Line/all-clear bonuses settle immediately, before saving and generating the next hand. Intermediate server replies cannot replace newer optimistic points. Scoring, hand generation and server reconciliation were unchanged in this refinement.

## Validation

Run `node --test server/test/*.test.js` for scoring, deterministic hand generation, queue reconciliation, gesture cancellation, number formatting and resource-budget regression coverage.

Run `node scripts/preview-block-blast.cjs`, then open `http://127.0.0.1:4173/bb-qa`. This local harness extracts production board/drag/scoring functions and supplies isolated fixtures, with no account or network mutations. It includes single-line, crossing-line, full-board and repeated-clear scenarios. Query options: `touch=1`, `light=1`, `lang=en`, `lang=zh`, and `frame=170` to inspect a frozen animation frame.

Browser QA covered 320×568, 390×844 and 412×844 mobile layouts, desktop layout, light/dark contrast, theme persistence, enlarged dragging and placement, sheet scrolling/dismissal, and intermediate paint/jelly/wool/honey/porcelain frames. Recorded sheet travel began at the bottom and was monotonic (no reversal/jump). Stress scenes retained one canvas and respected the 360-fragment bound; after completion no bursts remained. Automated tests also exercise overlaps, newly occupied cells, slow-frame adaptation and complete renderer cleanup.

The current in-app browser throttled animation callbacks to roughly 1 Hz during the cadence benchmark, including with its panel shown. That timing result is not a useful FPS measurement and is not reported as mobile performance evidence. These checks do not replace physical iPhone/Android GPU profiling.
