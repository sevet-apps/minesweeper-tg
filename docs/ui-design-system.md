# Spark UI

The application shell and Monopoly pre-game screens share `assets/ui/tokens.css`.
Use these tokens for new navigation, selectors, forms and sheets. Keep gameplay
rendering and material effects separate from the application controls.

## Controls and colour

- Blue is the primary action and selected-control colour in both themes.
- Surfaces are neutral. Rarity, achievement, danger and tournament colours carry
  meaning in content; they do not change the colour of navigation controls.
- Segmented selectors have a pill track, 4px inset and a blue moving indicator.
  Use horizontal segments for short labels and vertical segments for longer
  choices. Both use the same selection treatment and spring curve.
- Buttons and inputs use a 16px radius, cards 20px, sheets 24px. Full-screen pages
  do not need rounded edges. Boolean switches are 46×28px with a 22px knob.
- Close controls have a 44px target and a 32px visible circle. Use the shared
  vector cross instead of a font glyph. Centre it against the heading.

## Motion and interaction

- Segments move with transform, 420ms and a slight spring; pressed buttons scale
  to 97.5%. Sheet movement uses a decelerating curve without overshoot.
- Sheet entrance is 580ms on touch and 460ms with a fine pointer; exit is 320ms.
  Reduced motion and the application's lightweight mode shorten or remove motion.
- Sheets enter from the bottom. The visible position is retained if a drag
  interrupts entrance. Cancelled gestures restore the sheet; horizontal swipes,
  controls and scrolled content must not accidentally dismiss it.
- A sticky heading can be dragged even when the body is scrolled. Escape closes
  the top sheet; keyboard focus stays inside it and returns when it closes.
- Sheets stay fully opaque. A fixed 5px blur and neutral scrim fade in on the
  layer behind the sheet; dragging down reduces that layer's opacity in step
  with the sheet. Lightweight mode uses 2px blur. Do not animate blur radius.

## Scope

`assets/ui/app.css` adapts existing app components: game mode choices, profile
and leaderboard segments, settings, referral terms, title filters and sheets,
and Block Blast mode cards. `assets/ui/sheets.js` owns shared app-sheet gestures
and keyboard behaviour.

Monopoly uses `lobby.css` and the scoped `collection-pregame.css`. The
`monopoly-pregame` body class is removed when a match starts. The board markup,
`v2.css`, original `collection.css` and Block Blast gameplay/effects are unchanged.

## Verification

Run `node --test server/test/*.test.js` (132 tests at this revision).
Ten shared-sheet tests cover touch cancellation, parallel pointer cancellation,
scrolling, horizontal gestures, header dragging, mouse taps, interrupted entrance
and duplicate binding. Existing tests cover Monopoly tabs and sheet interactions.

For account-free visual review, run `node scripts/preview-ui.cjs` and open:

- `http://127.0.0.1:4174/ui-qa` (dark), `?light=1` (light).
- `http://127.0.0.1:4174/monopoly/qa?theme=dark` or `theme=light`.

The local preview uses production markup/styles and UI handlers with fixtures.
It does not create real rooms, change inventory or exercise live multiplayer.
Its toolbar, sample identity and loading statistics are preview-only.

Reviewed in a browser at 320×568, 390×844 and 1280×900 in both themes: game
choices, settings, nested privacy, Monopoly create/join/bots/waiting room,
profile ranks/cases/companies and case preview. Verified keyboard selection,
Escape/focus restoration, drag dismissal, scrolling and equal pill widths.
Recorded opening positions showed no reversal or centre-to-bottom jump.
Monopoly profile tabs now replace one another with a short exit and rising
entrance, while the in-match collection keeps its original interaction.

Responsive browser review does not replace a real iPhone Telegram WebView check
for device-specific frame pacing, haptics and the native keyboard.
