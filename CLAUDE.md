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

## Multiple sessions on this folder

More than one Claude session (this one, a Cowork session, a terminal
session) sometimes works on this same local folder at once. Before
editing a file, assume another session may have changed it since you
last read it -- re-read a file immediately before editing it rather than
trusting an earlier read from this conversation. If you hit a git lock
file (`.git/index.lock`, `.git/HEAD.lock`) left over from another
session, another process may be mid-commit -- wait and retry rather than
deleting it out from under it.
