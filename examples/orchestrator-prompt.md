# Sample orchestrator prompt

The README's "For the orchestrating agent" section is the full version. This is the same thing in one paragraph, to
paste to your agent yourself, or to keep in a project's AGENTS.md or CLAUDE.md, when you want to spell it out rather
than rely on the agent reading the README. Replace the task.

---

Use rex-crew to split up this task across workers: **<your task, or the issue URL>**. For each worker, write a brief
from `examples/brief-template.md` with the scope, the files it owns, what it must not touch, and the numbered advisor
checkpoints. Spawn each worker with `rex-crew spawn NAME --base origin/main --task-file BRIEF`, and run
`rex-crew wait --idle` in the background. When one reports, review its diff the way you would a pull request and send
fixes back with `rex-crew send`. When the branches are good, combine them on one branch, run the tests and open a pull
request. Don't merge, deploy or push anywhere public without asking me.
