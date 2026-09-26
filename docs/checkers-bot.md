# Offline checkers bot

The three local difficulties share the same legal moves as the on-device game.
`assets/checkers/ai-worker.js` runs the search off the UI thread. Easy uses a
shallow varied choice; medium searches up to five plies; hard searches up to
eleven plies with alpha-beta pruning, capture extension and a bounded
transposition table. Each difficulty has a time and node limit so older phones
can still respond. These are strength settings, not claims of perfect play.

Winning against the bot awards 1, 2 or 3 `checkers_points` for easy, medium or
hard. Existing bot wins remain a separate counter. The server accepts points
only against a signed game session, after a minimum duration and three reported
player moves; it caches a completed token response to avoid duplicate awards.

Apply `supabase/migrations/202609260001_add_checkers_points.sql` before
deploying the new server. Until the column exists, the points leaderboard and
point saving cannot work. The offline game itself remains playable.
