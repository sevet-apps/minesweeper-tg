# Spark Monopoly

Part of Spark Games (sparkapp). Separate page at `/monopoly/` on
`sevet-apps.github.io`.

## Phase 1 — 3D dice (current)

Working:
- Three.js scene with glass-style arena plate, blue rim light, soft shadows
- Cannon-es physics (two dice, floor + invisible walls)
- Procedural dot textures (1–6 pips, proper face mapping)
- **Headless retry** rolling: physics simulation determines outcome
  via **independent per-die search** — each die's seed is searched
  alone (~1/6 hit rate per attempt) then the pair is verified together.
  Dice start far apart (±2.2) with outward-biased velocity so inter-dice
  collisions are rare.
  **Measured: avg 11 retries, p99=26, 0% fallback over 200 trials.**
  Per-retry cost ≈ 2ms in Node (Cannon-es is fast enough that even on a
  phone the full search budget is a few tens of ms).
- Roll via button OR upward swipe (swipe direction/speed shape the throw)
- Debug overlay (FPS, last result, retry count)

## How to test

Since this is a plain static site, serve the `/monopoly/` directory with
any local HTTP server:

```
# from project root
npx serve .
# then open http://localhost:3000/monopoly/
```

Or via Python:

```
python3 -m http.server 8000
# open http://localhost:8000/monopoly/
```

Test checklist for Phase 1:
- [ ] Dice fall and settle on the plate within ~2 seconds
- [ ] Tap "Бросить кубики" — dice throw, face values appear in top readout
- [ ] Swipe up on the scene — same thing, direction affects arc
- [ ] Matching dice (doubles) — sum appears gold, success haptic
- [ ] Debug panel shows FPS ≥ 30 on mobile, retries usually ≤ 20
- [ ] No dice ever end up on an edge (tilted)

## File structure

```
monopoly/
├── index.html                 # entry page
├── css/
│   ├── tokens.css             # mirrors main app :root vars
│   └── monopoly.css           # layout + glass UI
├── js/
│   ├── main.js                # bootstrap, UI wiring, swipe
│   ├── engine/                # (Phase 3+) game logic, pure JS
│   ├── scene/
│   │   ├── SceneManager.js    # Three.js scene + Cannon-es world
│   │   ├── Dice.js            # 3D dice + headless retry rolling
│   │   ├── Board3D.js         # (Phase 2) 40-tile board
│   │   ├── Tokens.js          # (Phase 2) player pieces
│   │   └── CameraRig.js       # (Phase 2) camera modes
│   ├── ui/                    # (Phase 3+) panels, modals
│   ├── net/                   # (Phase 5) socket transport
│   └── lib/                   # optional vendored fallbacks
```

## Deploy to sevet-apps.github.io

1. Copy the entire `monopoly/` folder to repo root
2. Commit + push
3. Add Telegram bot menu entry pointing to
   `https://sevet-apps.github.io/monopoly/` (optional — can also be
   linked from main app)

## Next: Phase 2

- 3D board (40 tiles) with glassmorphism
- Player tokens
- Camera rig with OVERVIEW / FOLLOW_PLAYER / ZOOM_PROPERTY modes
