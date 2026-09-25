# Block Blast: materials and motion

The palette button beside the best score opens eleven choices: the original style and ten new materials. Material, gentle effects and board-shake preferences are saved on this device. The board, tray and dragged piece share the material. Material choice never affects the board, score, offered shapes or server checkpoint.

| Material | Clear motion |
| --- | --- |
| Jelly | Immediate soft gel fragments with elastic motion (1.015 s) |
| Wool | Immediate unravelling into many drifting threads (1.15 s) |
| Crystal | Twelve unequal faceted fracture pieces per cell, sharp kick and gravity (0.82 s) |
| Paint | Cover the cubes right-to-left (350 ms), hold 34 ms, lift the tail right-to-left (376 ms) |
| Cheese | Many uneven torn chunks with scalloped edges and visible pores (0.82 s) |
| Honey | Saturated comb chambers peel away, pull short sticky bridges and snap free (0.76 s) |
| Porcelain | Unequal angular pieces retaining the ceramic pattern (0.88 s) |
| Wood | Unequal splits along the grain, jagged edges and weighted fall (0.84 s) |
| Candy | Existing striped fragments with a quick kick and stronger gravity (0.72 s) |
| Ice | Repainted beveled ice; independent pre-clear tremble and irregular fracture (0.80 s) |
| Classic | Restored shrinking block cores and compact ballistic square shards (0.65 s) |

Ten separate texture tasks produced original SVG overlays. All ten textures together remain under 40 KB before compression; none contains raster data, scripts, filters or external resources. Only the selected texture is needed during play. The catalog loads the other previews when opened.

## Research and design decisions

- [Hungry Studio's Chinese Google Play listing](https://play.google.com/store/apps/details?hl=zh-CN&id=com.block.juggle) emphasizes readable 8×8 placement, combos, audiovisual clearing and lightweight play. Those are the interaction priorities here.
- [Jelly Block Blast's developer listing](https://play.google.com/store/apps/details?hl=zh_TW&id=com.dopaminefactory.jellyblockblast) describes soft visuals and elastic animation. It is a separate game, used as a material reference.
- [The Chinese TapTap listing for 俄罗斯方块拼图](https://www.taptap.cn/app/764432) and its screenshots supplied additional palette/material references, including porcelain. This is also a separate product, not Hungry Studio's original.
- Player discussions about [jelly textures](https://www.reddit.com/r/blockblast/comments/1vjbyfh/specific_texture/) and [fabric/cheese-like blocks](https://www.reddit.com/r/blockblast/comments/1shfxox/block_type_different/) informed the range. These are anecdotal observations, not a verified complete catalog of the original app.

The motion recipes are our own interpretation of each material, not a frame-for-frame reconstruction of proprietary animations. No third-party artwork was copied. The theme stays fixed until the player changes it, keeping the board predictable. Combo feedback combines a compact label with warm score glow and a restrained pulse; points use an ivory fill and a dark outline rather than rainbow text. Scores and leaderboard values use narrow non-breaking spaces, for example `1 248 000`.

## Performance and state integrity

- The cleared row/column uses the triggering piece colour throughout. Monochrome materials retain the visible material palette of that piece. Fracture fragments are drawn synchronously on release, without particle delays or an initial fade-in. Paint deliberately retains canvas copies beneath the advancing brush; classic shrinks its canvas cores from the first frame. Neither keeps uncleared cells in the game state.
- One canvas draws pre-baked texture/fragment atlases. There are no cloned board cells and no per-fragment DOM nodes. Two cached atlases bound texture memory. Unequal fracture polygons and their source texture crops are calculated only when preparing a material; the frame loop only transforms cached sprites. Canvas resolution is capped at 1.75×, or 1.25× on constrained devices.
- Up to three bursts may overlap. All bursts together are limited to 360 fragments, or 192 on constrained devices. New clears reserve a share of that budget by thinning older bursts, so an exhausted pool cannot suppress the immediate response. Repeated slow frames also reduce the budget. Gentle effects, Lite mode and reduced-motion preference disable the canvas effects; duration is never shortened to reduce load.
- The renderer reads board geometry once, before writes. It derives cell size from the grid, so a placement wobble cannot distort snapping or clear geometry. Newly occupied cells mask old effects; clearing them again removes the live mask without reviving the old burst.
- The single rendering loop stops after the last burst. Closing or hiding the game cancels visual work. Placement listeners clean up both completed and cancelled animations. Unchanged tray shapes retain their DOM instead of being rebuilt on server acknowledgements. Held previews use visibility rather than opacity, which prevents the entrance animation from revealing them; cancelling returns the piece without changing layout. Drag sparks emit less often, and the ghost uses smaller static shadows.
- Placement lasts 370 ms (wool 420 ms, jelly 470 ms). Material durations range from 650 to 1150 ms; hard materials have a brisk impulse and gravity, while jelly and wool retain their softer motion. Score labels last 2.1 s with a readable hold, independently of subsequent clears; at most three labels coexist. The score counter owns one cancellable frame sequence.
- The intentionally enlarged drag is restored: visual cells are 12% bigger, while logical dimensions determine the board target.
- The picker uses the app's neutral settings colors and blue accent. Its panel is anchored to the bottom on every screen, with an explicit offscreen initial frame, 580 ms touch opening (420 ms desktop), a 32 ms compositing lead-in, 300 ms closing, primary-pointer swipe, keyboard focus containment and restored background accessibility state.
- Line clears pulse a single opacity-animated rim in the visible piece colour, including monochrome materials. Optional 260 ms board shake is bounded to 1.4–2.5 px. Gentle effects/Lite/reduced-motion suppress it. Ice preview uses independent phase, period and direction per cell; only candidate cells animate, using transforms.
- Intersecting lines deduplicate their shared cell. Line/all-clear bonuses settle immediately, before saving and generating the next hand. Intermediate server replies cannot replace newer optimistic points. Scoring, hand generation and server reconciliation were unchanged in this refinement.

## Validation

Run `node --test server/test/*.test.js` for scoring, deterministic hand generation, queue reconciliation, gesture cancellation, number formatting and resource-budget regression coverage.

Run `node scripts/preview-block-blast.cjs`, then open `http://127.0.0.1:4173/bb-qa`. This local harness extracts production board/drag/scoring functions and supplies isolated fixtures, with no account or network mutations. It includes single-line, crossing-line, full-board and repeated-clear scenarios. Query options: `touch=1`, `light=1`, `lang=en`, `lang=zh`, and `frame=170` to inspect a frozen animation frame.

Browser QA covered 320×568, 390×844 and 412×844 mobile layouts, desktop layout, light/dark contrast, theme persistence, enlarged dragging and placement, sheet scrolling/dismissal, and intermediate paint/jelly/wool/honey/porcelain frames. Recorded sheet travel began at the bottom and was monotonic (no reversal/jump). Stress scenes retained one canvas and respected the 360-fragment bound; after completion no bursts remained. Automated tests also exercise overlaps, newly occupied cells, slow-frame adaptation and complete renderer cleanup.

## Video reference and this refinement

The supplied 2.77-second screen recording was inspected locally with an overview and 17 closer frames around 1.09–1.89 s. Its approximate sequence: candidate-line outline at 1.09 s, placement/line response around 1.16–1.24 s, widening coloured line around 1.29–1.44 s, rim glow and stronger combo emphasis around 1.49–1.79 s. The short field displacement and coloured rim informed our feedback. We kept our compact score display and immediate material fracture instead of adding a large combo banner over the next move.

This pass checked each changed material at 180 ms and paint at both 180 and 500 ms, plus actual drag/cancel, independent ice-cell transforms, reduced motion, both switches and persistence, light/dark sheets at 320×568 and 390×844, sheet scrolling and downward dismissal. An opening trace with more than 100 samples moved monotonically from the viewport bottom to its final position. The in-app browser's 20-clear stress run peaked at 360 fragments, then left zero bursts, rims or score labels, with no console errors. Its observed p95 callback interval was 7 ms on this desktop host; that is not an iPhone or Android performance measurement. Physical-device GPU profiling remains outside these checks.

Tests cover unequal fracture coverage and source bounds, the two paint passes, synchronous fracture release, overlap/occlusion/resource limits, mobile/desktop sheet timing and gesture cleanup, held-piece cancellation, independent ice phases, rim colour and the saved shake preference. Score and server-hand semantics remain unchanged.
