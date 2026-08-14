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

## Open items / things to watch

- Verify the z-index fix rendered correctly on the live site (open a unit dropdown, e.g. Unit 7, and confirm it no longer bleeds through the Learning Goals panel).
- Decide whether "Unit 10 — Testing" should stay live or get removed/hidden now that the multi-panel mechanic is proven out.
- `assignments-missing-images.md` lists assignments still missing thumbnails — ongoing content cleanup, not a code task.
- If local git and GitHub `main` ever disagree again, `git fetch` first before touching anything — don't trust a cached "up to date" status.
