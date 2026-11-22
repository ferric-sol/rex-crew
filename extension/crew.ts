/**
 * rex-crew worker extension.
 *
 * Loaded only by workers that `rex-crew spawn` starts (it does nothing without
 * REX_CREW_DIR). It records the worker's state for the orchestrator, shows that
 * state in the Rex window label, gives the model a `report_done` tool, and
 * delivers messages the orchestrator drops in the inbox folder.
 *
 * States: working, waiting (stopped without reporting: it needs the user),
 * done (stopped after report_done). The launcher writes "exited".
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const GLYPH: Record<string, string> = { working: "…", waiting: "?", done: "✓" };

export default function (pi: ExtensionAPI) {
	const dir = process.env.REX_CREW_DIR;
	if (!dir) return;
	const name = process.env.REX_CREW_NAME ?? "worker";
	const windowId = process.env.REX_CREW_WINDOW;
	const inbox = path.join(dir, "inbox");

	let busy = false;
	let reported = false;
	let timer: ReturnType<typeof setInterval> | undefined;

	function setState(state: string, note = ""): void {
		const line = `${new Date().toISOString()}\t${state}\t${note.replace(/\s+/g, " ").slice(0, 300)}\n`;
		try {
			fs.appendFileSync(path.join(dir!, "events.log"), line);
			fs.writeFileSync(path.join(dir!, "state"), `${state}\n`);
		} catch {
			// The orchestrator removed the folder; nothing to record.
		}
		const label = `${GLYPH[state] ?? state} ${name}`;
		if (process.env.REX_CREW_LAYOUT === "split" && process.env.REX_BLOCK) {
			execFile("rex", ["block", "rename", process.env.REX_BLOCK, label], () => {});
		} else if (windowId) {
			execFile("rex", ["window", "rename", windowId, label], () => {});
		}
	}

	function deliverInbox(): void {
		let files: string[];
		try {
			files = fs.readdirSync(inbox).filter((f) => f.endsWith(".md")).sort();
		} catch {
			return;
		}
		for (const f of files) {
			const p = path.join(inbox, f);
			let text = "";
			try {
				text = fs.readFileSync(p, "utf8").trim();
				fs.unlinkSync(p);
			} catch {
				continue;
			}
			if (!text) continue;
			const message = `[orchestrator] ${text}`;
			if (busy) pi.sendUserMessage(message, { deliverAs: "steer" });
			else pi.sendUserMessage(message);
		}
	}

	pi.on("session_start", async () => {
		fs.mkdirSync(inbox, { recursive: true });
		if (!timer) {
			timer = setInterval(deliverInbox, 1500);
			timer.unref?.();
		}
	});

	// Advisor gate (Nov 21 2026: workers edited without ever calling ask_advisor, though the rule was in their prompt).
	// When pi-advisor-flow's ask_advisor tool is present: no edit/write until the worker has asked the advisor once
	// (the plan review), and no `git commit` or report_done while edits since the last advice are unreviewed. An
	// advisor call that errors still counts (it was asked), so a dead or exhausted advisor never wedges a worker.
	let advised = false;
	let unreviewedEdits = false;
	const hasAdvisor = () => {
		try {
			return pi.getAllTools().some((t) => t.name === "ask_advisor");
		} catch {
			return false;
		}
	};

	pi.on("tool_execution_end", async (event) => {
		if (event.toolName === "ask_advisor") {
			advised = true;
			unreviewedEdits = false;
			setState("working", event.isError ? "ask_advisor failed (gate passed anyway)" : "asked advisor");
		} else if ((event.toolName === "edit" || event.toolName === "write") && !event.isError) {
			unreviewedEdits = true;
		}
	});

	pi.on("tool_call", async (event) => {
		if (!hasAdvisor()) return;
		const name = event.toolName;
		if ((name === "edit" || name === "write") && !advised) {
			return {
				block: true,
				reason:
					"rex-crew advisor gate: call ask_advisor before your first edit, with a short plan as the draft (files, approach, assumptions not yet checked). Then retry this edit.",
			};
		}
		const cmd = name === "bash" ? String((event.input as { command?: unknown })?.command ?? "") : "";
		const committing = /\bgit\b[^\n;&|]*\bcommit\b/.test(cmd);
		if ((committing || name === "report_done") && (!advised || unreviewedEdits)) {
			return {
				block: true,
				reason: `rex-crew advisor gate: call ask_advisor on the whole diff (\`git diff\`) before ${committing ? "committing" : "reporting done"}, act on its advice, then retry.`,
			};
		}
	});

	pi.on("session_shutdown", async () => {
		if (timer) clearInterval(timer);
		timer = undefined;
	});

	pi.on("agent_start", async () => {
		busy = true;
		reported = false;
		setState("working");
	});

	pi.on("agent_settled", async () => {
		busy = false;
		if (reported) setState("done", "see report.md");
		else setState("waiting", "stopped without report_done: needs the user");
	});

	pi.registerTool({
		name: "report_done",
		label: "Report Done",
		description:
			"Tell the orchestrator this task is finished and ready for review. Call it once, as your last action, after your work is committed.",
		promptSnippet: "Report the finished, committed task to the orchestrator",
		promptGuidelines: [
			"Call report_done as your final action when the task is complete and committed. Do not call it to ask a question: ask in plain text and stop, and the user will answer in this session.",
			"After report_done, do not write another response in the same turn.",
		],
		parameters: Type.Object({
			summary: Type.String({ description: "What you changed and why, in a few sentences" }),
			verification: Type.String({
				description: "The checks you ran and their results, or what you could not check",
			}),
			open_questions: Type.Optional(
				Type.String({ description: "Anything the reviewer should decide or look at closely" }),
			),
		}),
		async execute(_toolCallId, params) {
			const report = [
				`# ${name}`,
				"",
				"## Summary",
				params.summary,
				"",
				"## Verification",
				params.verification,
				...(params.open_questions ? ["", "## Open questions", params.open_questions] : []),
				"",
			].join("\n");
			fs.writeFileSync(path.join(dir, "report.md"), report);
			reported = true;
			return {
				content: [{ type: "text", text: "Reported to the orchestrator. Stop here." }],
				details: {},
				terminate: true,
			};
		},
	});
}
