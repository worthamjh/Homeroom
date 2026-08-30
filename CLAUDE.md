# Working on Homeroom

## Git pushes go through Jay only

Never run `git push` in this repo. Commit locally, then stop and tell Jay
what's ready -- he pushes it himself, from his own terminal, when he's
ready. This applies no matter which session or tool you're running as.

This is enforced by a `pre-push` hook in this repo (`.git/hooks/pre-push`)
that blocks any push that isn't run from a real interactive terminal, so
an agent-run push fails automatically even if this file is missed. Don't
work around it with `git push --no-verify` -- if a push is genuinely
needed, ask Jay to run it.

## One worktree per agent

Jay runs more than one bot on Homeroom at a time. To keep them out of
each other's way, each agent gets its own git worktree -- a separate
checkout of this same repo, on its own branch, with its own index.

    C:/Users/Worth/OneDrive/Desktop/Homeroom  -> branch main  (Jay's)
    C:/Users/Worth/homeroom-worktrees/bot2    -> branch bot2

Rules:

- Work in the folder you were started in. Run `git worktree list` if you
  are unsure which one that is. Never `cd` into another worktree to edit
  or commit there.
- Never check out a branch that another worktree has -- git will refuse,
  and that refusal is correct. Make a new branch instead.
- `main` belongs to Jay. Agents commit to their own branch and tell Jay
  what is ready; he reviews and merges.
- Adding a worktree for a new bot:

      git worktree add C:/Users/Worth/homeroom-worktrees/<name> -b <name>

  Then copy `.env.local` into it (gitignored, so a fresh worktree has no
  env vars) and run `npm install` there -- worktrees do not share
  `node_modules`. Keep them out of the OneDrive folder so a second
  `node_modules` is not sync'd.
- Removing one once its work is merged: `git worktree remove <path>`.

Note that this file is shared by every worktree, so these rules reach
whichever agent reads it.

## Same feature, different files

Two agents editing different files can still collide: one changing a
feature's trigger while another changes its display produces no git
conflict but can still be jointly wrong. If a task touches a feature
another agent is already working on, say so and let Jay sequence it
rather than racing.

## Multiple sessions on the same folder

More than one Claude session (this one, a Cowork session, a terminal
session) sometimes works on this same local folder at once. Before
editing a file, assume another session may have changed it since you
last read it -- re-read a file immediately before editing it rather than
trusting an earlier read from this conversation. If you hit a git lock
file (`.git/index.lock`, `.git/HEAD.lock`) left over from another
session, another process may be mid-commit -- wait and retry rather than
deleting it out from under it.
