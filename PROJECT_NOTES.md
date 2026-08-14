# Homeroom — Project Notes

Running notes on the Webster Groves Chemistry classroom site, kept up to date as work happens so a fresh session (Claude or otherwise) can get oriented quickly.

## What this project is

A React + Vite single-page app (`src/WebsterGrovesChemistry.jsx`) that renders Jay's chemistry classroom as a virtual room: a unit nav bar, a "chalkboard" area showing the current lesson's Google Slides + learning goals, and an assignments/classwork section below the fold. Curriculum content (units, lessons, goals, assignments, Drive-hosted thumbnails) lives as a big JS array at the top of that file.

- Local dev: `npm run dev` (Vite, localhost:5173)
- Deployed: Vercel, auto-deploys from GitHub `main` — https://homeroom-plum.vercel.app
- Repo: https://github.com/worthamjh/Homeroom (folder is OneDrive-synced on Jay's machine)

## Known environment gotcha: OneDrive + git locks

The repo folder lives inside OneDrive sync (`C:\Users\Worth\OneDrive\Desktop\Homeroom`). OneDrive can hold file locks on `.git` internals (`index.lock`, `HEAD.lock`, temp objects) that block `git add`/`commit`/`push`, especially after an interrupted git operation. Symptoms: "Unable to create '.git/index.lock': File exists" or "unable to unlink" errors even though no git process is actually running.

Fix, in order of preference:
1. `Remove-Item .git\index.lock, .git\HEAD.lock -ErrorAction SilentlyContinue` from PowerShell in the repo folder, then retry.
2. If that fails (access denied), pause OneDrive sync briefly (tray icon → Settings → Pause syncing), then retry the delete.
3. Longer-term: consider moving the repo out of the OneDrive-synced folder to a plain local path to avoid this recurring.

Also: **always `git fetch`/check `git status` against origin before assuming local `main` is current** — it silently fell behind by 3 commits during this session (`git status` said "up to date" based on a stale remote-tracking ref).

## Recent work (as of 2026-08-14)

1. **Fixed a JSX syntax crash** in `WebsterGrovesChemistry.jsx` — a stray extra `</div>` was unbalancing the fragment structure, breaking the Vite build entirely. Removed it.
2. **Replaced the inline two-column "Slides + Learning Goals" layout** with a new component, `src/ChalkboardBoardRow.jsx` — models a real sliding multi-panel chalkboard: panels stack behind each other and a handle on a rail slides the current one away to reveal the next. `toGoalPanels(lesson)` decides whether a lesson uses the old single `goals` array or a new multi-panel `goalPanels` array; both are supported, so no other lesson data had to change.
3. **Added a "Unit 10 — Testing" unit** to the curriculum data purely to exercise the multi-panel path (`goalPanels` with 3 stacked panels). It's live on production now as a real clickable tab — harmless, but worth knowing it's test scaffolding, not real content.
4. **Fixed a z-index bug**: the unit dropdown menu in `TopBar` (z-index 100) was rendering *underneath* the new chalkboard panel's internal overlays (rail/handle/label, z-index up to 2100), because none of the intervening ancestors establish their own stacking context. Bumped the dropdown to z-index 5000.
5. **Diagnosed broken assignment thumbnails**: some `THUMB()` (Google Drive-hosted) images render as broken/alt-text. This turned out to be a pre-existing, separate issue already partly addressed upstream — commits `ad7c192` ("Replace placeholder assignment thumbnails with real Drive images") and `97451c0` ("Remove assignments with no available image") on `main` — not something introduced by the chalkboard work. `assignments-missing-images.md` (new, committed) tracks which assignments still need a real thumbnail wired up.
6. Pushed all of the above to `main` (commit `25cc731` for the chalkboard component, plus the z-index fix on top). Vercel auto-deploys from `main`.

## Session 2, same day — chalkboard refinement pass

Picked back up on `ChalkboardBoardRow.jsx` to make the sliding mechanic actually feel physical, plus scoped the whole feature down so it can't affect any real unit.

1. **Scoped the sliding component to opt-in only.** Units 1–9 and every overview screen had picked up subtle layout differences just from `ChalkboardBoardRow` being wired in unconditionally. Restored the original static grid layout as the default in `WebsterGrovesChemistry.jsx`, and now only render `ChalkboardBoardRow` when `activeLesson.goalPanels` exists — currently just Unit 10's two Testing lessons. Everything else is back to exactly what it was before this feature started.
2. **Fixed the reveal-through animation.** Panels are real DOM siblings sitting at the same spot, so sliding one away should progressively uncover the one behind it — but z-index was flipping the instant `current` changed (before the `left` transition had visually moved anything), so the next board would pop in instead of sweeping into view. Settled on one constant stacking rule (lower panel index always on top, parked or not) instead of the two-scheme approach from earlier — turned out to satisfy every requirement at once (front-most on top while waiting, first-docked stays in front once parked) with no timing hacks needed.
3. **Fan-out docking.** The first board pulled goes all the way to the SmartBoard's far edge (`left: 0`). Every board docked after that stops `DOCK_STEP_PX` (currently 30px) further right than the one before it, so each board's frame — and its handle — peeks out past the one in front of it instead of stacking exactly on top and burying each other. Verified this scales fine to at least ~10 panels before the fan would reach the SmartBoard's own right edge.
4. **Real aluminum frame.** Each movable panel now has an 11px flat metal-gray (`#9a9a9a`) frame on all sides (no separate darker inner groove — that read as a dark green border because it was a translucent black wash over the green board). The fixed back board stays flush/borderless, since it's meant to be the wall board everything else slides in front of, not another slab.
5. **Handles: two per board, chevron icons, direction-aware.** Every movable panel has a handle in both bottom corners (whichever side ends up exposed once a board is buried in the pile, there's always one reachable). Each handle shows `‹` when clicking it will pull the board away, `›` when clicking it will bring a docked board back — same button, direction reflects current state (`setCurrent(parked ? i : i + 1)`).
6. **Found and fixed a real click-through bug.** The handles would visually peek out from behind the SmartBoard but weren't clickable. Root cause: the SmartBoard's wrapper spans the full 60% column at z-index 1000, and doesn't visually fill that whole rectangle (padding + it vertically centers a shorter device mockup) — so the empty margin, while invisible, was still a real element sitting on top in stacking order, silently swallowing clicks meant for whatever's behind it. Fixed with `pointerEvents: "none"` on the wrapper and `"auto"` restored individually on `SmartBoard`'s three actually-visible pieces (frame, SMART label bar, marker tray) back in `WebsterGrovesChemistry.jsx`. This is the fix to remember if any *other* overlay ever needs to sit behind the SmartBoard.
7. **Per-board counters ("1/3", "2/3", ...).** Replaced the single global counter (which only ever reflected the current board) with one counter per panel, printed on its own frame next to its right handle. Hit the same category of bug as #6's cousin: the counter `<div>` had no `zIndex`, so the Face div (defined later in the DOM, also `position: absolute; inset: 0`) painted over it. Fixed by giving it `zIndex: 2100` to match the handles. The fixed back board gets the same counter too (just no handle, styled for the flush green board instead of the metal frame).
8. **Added "Testing 2"** — a second Unit 10 lesson with 5 total panels (4 movable + the fixed back board) to prove the fan-out approach holds up with more layers, not just 2.
9. Pushed everything (`f3725bf..36603f3`) — Vercel should have redeployed automatically.

## Open items / things to watch

- Verify the z-index fix rendered correctly on the live site (open a unit dropdown, e.g. Unit 7, and confirm it no longer bleeds through the Learning Goals panel).
- Decide whether "Unit 10 — Testing" / "Testing 2" should stay live or get removed/hidden now that the multi-panel mechanic is proven out — both are still test scaffolding, not real content.
- `DOCK_STEP_PX` (30, in `ChalkboardBoardRow.jsx`) is a fixed pixel fan-out step. Fine for the panel counts tested so far (up to 5); if a lesson ever needs many more stacked panels, revisit whether the fan should reach the SmartBoard's edge before that becomes a problem.
- The `pointerEvents: "none"`/`"auto"` split on `SmartBoard` (see #6 above) is now load-bearing for `ChalkboardBoardRow` specifically — if `SmartBoard`'s internal layout changes (new wrapper divs, restructured children), double check nothing regresses that click-through behavior.
- `assignments-missing-images.md` lists assignments still missing thumbnails — ongoing content cleanup, not a code task.
- If local git and GitHub `main` ever disagree again, `git fetch` first before touching anything — don't trust a cached "up to date" status.
- This same OneDrive-sync git-lock issue (see above) came up again mid-session on Jay's own machine, not just in the sandbox — worth actually considering the "move the repo out of OneDrive" option if it keeps recurring.
