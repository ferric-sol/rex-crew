# Worker brief template

Pass a brief with `rex-crew spawn NAME --task-file brief.md`, or put it in a file and give the worker a one-line task
that points at it ("Your task brief is in /path/brief.md. Read it, then follow it."). A good brief is everything the
worker knows: it has not seen your conversation.

---

Issue #N (read it with `gh issue view N --comments`): <one sentence of what and why>. Read AGENTS.md first.

**Your part (worker NAME):** <the scope, as a list of concrete items with file paths and line hints>
- ...

**Not yours:** <files another worker owns, things out of scope (emails, deploys, public writes)>.

**Shared contract** (only when two workers split one feature): <the exact content of any file both create, so the
branches merge cleanly; tell them not to change it>.

**How to work (the advisor checkpoints are required):**
1. Read the issue and the code you will touch. Write a short plan. Call ask_advisor with the plan before your first edit.
2. Implement one item at a time. After each item, call ask_advisor with its diff.
3. Tests: <how to test; what clock or fixture to use>. Run `npm test`. Note failures that also fail on origin/main.
4. Record the decision (<D-number> in IMPLEMENTATION.md, a line in PLAN.md).
5. Commit in small commits with plain messages. Stage files by name (a symlinked node_modules is not ignored).
   Never push, merge or deploy.
6. Before report_done, call ask_advisor with the full diff against origin/main. Then report_done with what you built,
   the files, the tests and their result, and anything you left out or need decided.
