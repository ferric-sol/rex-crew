# rex-crew

An orchestrator agent (Claude Code, running in [Rex](https://www.superlogical.com/rex/docs/)) starts [pi](https://pi.dev) worker agents. Each worker gets its own
git worktree, its own branch and its own Rex pane, and the orchestrator hears when it finishes. You can watch every
worker and answer it in its pane. The orchestrator reviews, sends feedback and merges. Workers never push, merge or
deploy.

```
┌──────────────────────────┬────────────────────────┐
│ orchestrator (Claude)    │ … feat-login  (pi)     │
│ rex-crew spawn / wait /  ├────────────────────────┤
│ show / send / rm         │ ✓ feat-api    (pi)     │
└──────────────────────────┴────────────────────────┘
```

## Quickstart

Say this to Claude Code running in a Rex pane, inside your project's repository:

```text
Set up rex-crew (https://github.com/ferric-sol/rex-crew), then spin up a crew to work on the feature described in this issue: <issue url>
```

The agent follows the next section. To spell the steps out in the prompt instead, paste the one-paragraph version in
`examples/orchestrator-prompt.md`.

## For the orchestrating agent

You were asked to set up rex-crew and run a crew on a task. Do this:

1. **Set up.** Clone https://github.com/ferric-sol/rex-crew to `~/code/rex-crew` (or `git pull` if it is there), read
   this README, and run `./install.sh`. If it reports anything missing (rex, pi, jq, git, the advisor config), tell
   the user and stop until it is fixed. You must be running inside Rex (`REX_SESSION` set) and inside the project's
   repository.
2. **Read the task.** Read the issue with its comments (`gh issue view <url> --comments`) and the code it touches.
   Settle what is decided and what is still open. Ask the user about anything open before spawning.
3. **Split it.** Use one worker per part that owns its own files; one worker is fine for a small task. Split by file
   ownership, so no two workers edit the same file. If two parts must share a new file, write its exact content into
   both briefs and tell both workers to create it word for word, so the branches merge cleanly.
4. **Brief each worker** from `examples/brief-template.md`. The worker knows only the brief, so include:
   - the scope, as concrete items with file paths;
   - what it must not touch, and which worker owns that;
   - how to test;
   - the numbered advisor checkpoints: plan, then each item, then the full diff.
   Write the brief to a file.
5. **Spawn and wait.**
   - Start each worker with `rex-crew spawn NAME --base origin/main --task-file BRIEF`. Add `--setup` when the
     worktree needs dependencies.
   - Run `rex-crew wait --idle` in the background, and run it again each time it returns.
   - Early on, check the worker's pi session log (`~/.pi/agent/sessions/--<worktree path>--/*.jsonl`) for
     `ask_advisor` calls.
6. **Review each report** like a pull request: `rex-crew show NAME`, then `git diff origin/main...NAME`. Send real bugs
   back with `rex-crew send NAME "..."`, including ones the worker only documented. Then wait again.
7. **Combine.** When every branch is good, merge them onto one branch off `origin/main`, resolve conflicts, run the
   full test suite, and open one pull request that says what was built, what is known to be limited, and how to
   deploy. Then `rex-crew rm NAME` each worker (`--force` if only untracked files are left).
8. **Ask before** merging the pull request, deploying, or pushing anything public. Report to the user what the crew
   built, the pull request link, and anything left for them to decide.

## Install

```bash
cd ~/code/rex-crew
./install.sh --check   # what differs from the installed copy
./install.sh           # copies to ~/.config/rex/crew, links ~/.local/bin/rex-crew
```

Needs `rex` ([Rex docs](https://www.superlogical.com/rex/docs/)), `pi`, `jq` and `git` on PATH. For the advisor gate, pi needs the pi-advisor-flow extension and
`~/.pi/agent/advisor.json` (example in `examples/advisor.json`).

**Editing:** edit here, then run `./install.sh`. A changed file is backed up beside the installed one before it is
replaced.

| Here | Installed at | What |
|---|---|---|
| `bin/rex-crew` | `~/.config/rex/crew/rex-crew` (linked from `~/.local/bin`) | the orchestrator's command |
| `extension/crew.ts` | `~/.config/rex/crew/crew.ts` | the pi extension every worker loads |
| `examples/advisor.json` | `~/.pi/agent/advisor.json` | pi-advisor-flow settings (copy by hand) |

## Spinning up a crew

Run everything from inside the project's repository (the main checkout or any worktree), in a Rex pane.

```bash
# 1. Start a worker. Its branch is NAME, its worktree ~/.rex/worktrees/<project>/NAME.
rex-crew spawn feat-login --base origin/main \
  --setup "ln -s $HOME/code/myapp/node_modules node_modules" \
  --task-file /path/brief-login.md

# 2. Wait (the orchestrator runs this in the background). It wakes on report_done or a pi exit;
#    with --idle, also when a worker stops to ask you something.
rex-crew wait --idle

# 3. Review.
rex-crew status                 # one line per worker: state, commits ahead, dirty
rex-crew show feat-login        # its report, commits and diffstat
git diff origin/main...feat-login

# 4. Feedback goes to the worker's inbox and arrives as an "[orchestrator] ..." message. Then wait again.
rex-crew send feat-login "Review: one change, then report again. ..."

# 5. Merge with git in the main checkout, then clean up.
rex-crew rm feat-login          # --force when only untracked files (e.g. the node_modules link) are left
```

### Commands

| Command | |
|---|---|
| `spawn NAME [options] -- TASK...` | start a worker. Options: `--base REF` (default HEAD), `--branch B` (default NAME; an existing branch is checked out), `--model M`, `--thinking LEVEL`, `--setup CMD` (runs in the worktree before pi), `--task-file F` (or the task after `--`, or on stdin), `--focus`, `--window` (a tab instead of a split; `REX_CREW_LAYOUT=window` makes it the default) |
| `wait [--idle] [--for SECONDS]` | block until a worker reports (exit 0), or `--for` runs out (exit 2). Takes no worker name |
| `status` (`ls`) | one line per worker |
| `show NAME` | report, commits, diffstat, uncommitted files |
| `send NAME MESSAGE...` | queue review feedback for the worker |
| `peek NAME [LINES]` | the tail of the worker's screen |
| `focus NAME` | switch to the worker's pane or window |
| `path NAME` | print its worktree path |
| `rm NAME [--force]` | remove the worktree and branch, close the pane; its state folder goes to the Trash |

### Layout

The first worker opens as a split to the right of the orchestrator. Later ones stack below the newest worker that still
has a pane. Labels show the state:

| Label | State |
|---|---|
| `… name` | working |
| `? name` | waiting on you (stopped without `report_done`) |
| `✓ name` | reported |
| `× name` | pi exited |

## How it works

`spawn` does four things:
- creates the worktree and branch;
- writes the worker's state folder, `~/.rex/crew/<project>/NAME/`, which holds `task.md`, `prompt.md`, `meta.json`, `events.log`, `state` and `inbox/`;
- writes `launch.sh`;
- runs it in a new Rex pane.

`launch.sh` starts pi with `extension/crew.ts` and an appended system prompt (`prompt.md`). The prompt tells the worker
it works only in its worktree, commits as it goes, never pushes, merges or deploys, asks in plain text when blocked,
and calls `report_done` last.

The extension (`crew.ts`):
- records the state (`events.log`, `state`) and sets the pane label;
- delivers `inbox/*.md` files as `[orchestrator]` messages every 1.5 s, steering if the worker is busy;
- adds the `report_done` tool, which writes `report.md` (summary, verification, open questions) and ends the turn;
- runs the **advisor gate** (when pi-advisor-flow's `ask_advisor` tool is loaded):
  - no `edit` or `write` until the worker has asked the advisor once;
  - no `git commit` or `report_done` while edits since the last advice are unreviewed;
  - an advisor call that errors still counts, so a dead or exhausted advisor never wedges a worker;
  - file edits made through bash (sed, heredocs) get around the gate.

`wait` reads each worker's `events.log` past its `acked` line count. It prints the new `done`/`exited` events (plus
`waiting` with `--idle`) with the worker's summary, then exits.

Workers run with `GIT_EDITOR=true` (and the sequence, merge and prompt equivalents), so a `git commit --amend` never
opens vi in a pane the agent can't drive.

## Environment

| Variable | Default | |
|---|---|---|
| `REX_CREW_EXT` | `~/.config/rex/crew/crew.ts` | the worker extension |
| `REX_CREW_STATE` | `~/.rex/crew` | state folders |
| `REX_WORKTREES` | `~/.rex/worktrees` | worktrees |
| `REX_CREW_LAYOUT` | `split` | `split` or `window` |
| `REX_SESSION`, `REX_BLOCK` | set by Rex | where the panes open |

## Lessons (Nov 2026)

- **Write the brief for someone with no context.** Give file paths, line hints, what is out of scope, and what another worker owns. `examples/brief-template.md` is the shape that worked.
- **Two workers on one feature:** give them a shared contract file, word for word, so both branches create it identically and merge cleanly. Split by file ownership. Expect conflicts only at the tails of decision logs.
- **Spell out the advisor checkpoints as numbered steps:** plan, then each item, then the full diff. Before the gate existed, workers skipped them. Check early in the worker's pi session log (`~/.pi/agent/sessions/--<worktree path>--/*.jsonl`) that `ask_advisor` calls appear.
- **Watch the advisor budget.** `advisorMaxCallsPerSession` is 14. A long review loop can exhaust it, and the worker's last round then goes unreviewed.
- **A symlinked `node_modules` is not matched by `.gitignore`'s `node_modules/`.** Tell workers to stage files by name. `rm` needs `--force` for it.
- **A worker stuck in `working`** whose session log hasn't moved is usually blocked in a subprocess. Find it with `ps -axo pid,ppid,etime,command | grep <worktree>` and kill the child. Queued `send` messages arrive only after the tool call returns.
- **Review like any PR,** and push back on "documented, not fixed" for real bugs. Workers accept residual risk too readily.
- **The orchestrator merges, after the user says so.** Workers can't push.
