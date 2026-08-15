import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import threadshiftExtension from "../extensions/threadshift.ts";
import { CONTINUE_COMMAND, DISMISS_COMMAND } from "../src/constants.ts";
import { buildContinuationPrompt, renderHandoffDocument, writeHandoffDocument } from "../src/handoff-document.ts";
import { STATE_ENTRY_TYPE, STATE_VERSION } from "../src/state.ts";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, any>) => unknown;
type CommandHandler = (args: string, ctx: Record<string, any>) => unknown;

const temporaryDirectories: string[] = [];
const originalAgentDirectory = process.env.PI_CODING_AGENT_DIR;

async function tempDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "pi-threadshift-retention-test-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	if (originalAgentDirectory === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = originalAgentDirectory;
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function loadExtension() {
	const handlers = new Map<string, EventHandler>();
	const commands = new Map<string, CommandHandler>();
	const appendEntry = vi.fn();
	const pi = {
		on(event: string, handler: EventHandler) {
			handlers.set(event, handler);
		},
		registerCommand(name: string, options: { handler: CommandHandler }) {
			commands.set(name, options.handler);
		},
		appendEntry,
	} as unknown as ExtensionAPI;

	threadshiftExtension(pi);
	return { handlers, commands, appendEntry };
}

async function readySession(retainHandoffFiles = false, autoContinue?: boolean) {
	const root = await tempDirectory();
	const cwd = join(root, "project");
	const handoffDirectory = join(root, "handoffs");
	process.env.PI_CODING_AGENT_DIR = join(root, "agent");
	await mkdir(join(cwd, ".pi"), { recursive: true });
	await writeFile(
		join(cwd, ".pi", "threadshift.json"),
		JSON.stringify({
			handoffDirectory,
			retainHandoffFiles,
			...(autoContinue === undefined ? {} : { autoContinue }),
		}),
	);

	const generatedAt = "2026-08-06T01:02:03.456Z";
	const document = renderHandoffDocument("## Objective\nContinue safely.", {
		generatedAt,
		cwd,
		sourceSessionId: "session-123456789",
		provider: "openai",
		model: "gpt-5",
	});
	const path = await writeHandoffDocument({
		directory: handoffDirectory,
		document,
		generatedAt,
		sessionId: "session-123456789",
	});
	const branch = [
		{
			type: "message",
			id: "context-entry",
			message: { role: "user", content: [{ type: "text", text: "work" }], timestamp: 1 },
		},
		{
			type: "custom",
			id: "ready-entry",
			customType: STATE_ENTRY_TYPE,
			data: {
				version: STATE_VERSION,
				status: "ready",
				path,
				generatedAt,
				contextPercent: 75,
				thresholdPercent: 70,
				provider: "openai",
				model: "gpt-5",
				sourceContextEntryId: "context-entry",
			},
		},
	];
	const ui = {
		notify: vi.fn(),
		setStatus: vi.fn(),
		setWidget: vi.fn(),
		getEditorText: vi.fn(() => ""),
		setEditorText: vi.fn(),
	};
	const ctx = {
		mode: "tui",
		cwd,
		isProjectTrusted: () => true,
		sessionManager: {
			getBranch: () => branch,
			buildContextEntries: () => branch,
			getSessionFile: () => join(root, "source.jsonl"),
		},
		ui,
		getContextUsage: () => ({ percent: 75 }),
		hasPendingMessages: () => false,
	};

	return { ctx, document, handoffDirectory, path, ui };
}

function replacementSession(sendUserMessage = vi.fn(async (_message: string) => undefined)) {
	const ui = {
		notify: vi.fn(),
		setEditorText: vi.fn(),
	};
	return { ctx: { ui, sendUserMessage }, sendUserMessage, ui };
}

describe("handoff file retention", () => {
	it("deletes a tracked handoff after successful automatic continuation", async () => {
		const extension = loadExtension();
		const session = await readySession(false, true);
		await extension.handlers.get("session_start")?.({ type: "session_start" }, session.ctx);
		const replacement = replacementSession();
		const commandCtx = {
			...session.ctx,
			newSession: vi.fn(async (options: { withSession: (ctx: Record<string, any>) => Promise<void> }) => {
				await options.withSession(replacement.ctx);
				return { cancelled: false };
			}),
		};

		await extension.commands.get(CONTINUE_COMMAND)?.("", commandCtx);

		expect(replacement.sendUserMessage).toHaveBeenCalledOnce();
		expect(replacement.sendUserMessage).toHaveBeenCalledWith(buildContinuationPrompt(session.path, session.document));
		expect(replacement.sendUserMessage.mock.calls[0]?.[0]).toContain("not itself authorization");
		expect(replacement.sendUserMessage.mock.calls[0]?.[0]).toContain("fresh explicit user confirmation");
		await expect(access(session.path)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("retains the handoff when automatic continuation fails", async () => {
		const extension = loadExtension();
		const session = await readySession(false, true);
		await extension.handlers.get("session_start")?.({ type: "session_start" }, session.ctx);
		const replacement = replacementSession(vi.fn(async () => Promise.reject(new Error("send failed"))));
		const commandCtx = {
			...session.ctx,
			newSession: vi.fn(async (options: { withSession: (ctx: Record<string, any>) => Promise<void> }) => {
				await options.withSession(replacement.ctx);
				return { cancelled: false };
			}),
		};

		await extension.commands.get(CONTINUE_COMMAND)?.("", commandCtx);

		await expect(access(session.path)).resolves.toBeUndefined();
		expect(replacement.ui.setEditorText).toHaveBeenCalledOnce();
	});

	it("waits for reviewed submission and retains the handoff by default", async () => {
		const extension = loadExtension();
		const session = await readySession();
		await extension.handlers.get("session_start")?.({ type: "session_start" }, session.ctx);
		const replacement = replacementSession();
		const commandCtx = {
			...session.ctx,
			newSession: vi.fn(async (options: { withSession: (ctx: Record<string, any>) => Promise<void> }) => {
				await options.withSession(replacement.ctx);
				return { cancelled: false };
			}),
		};

		await extension.commands.get(CONTINUE_COMMAND)?.("", commandCtx);

		expect(replacement.sendUserMessage).not.toHaveBeenCalled();
		expect(replacement.ui.setEditorText).toHaveBeenCalledOnce();
		expect(replacement.ui.setEditorText).toHaveBeenCalledWith(buildContinuationPrompt(session.path, session.document));
		expect(replacement.ui.notify).toHaveBeenCalledWith(
			"New session ready. Review or edit the handoff prompt, then submit it when ready.",
			"info",
		);
		await expect(access(session.path)).resolves.toBeUndefined();
	});

	it("preserves an explicit review-first compatibility setting", async () => {
		const extension = loadExtension();
		const session = await readySession(false, false);
		await extension.handlers.get("session_start")?.({ type: "session_start" }, session.ctx);
		const replacement = replacementSession();
		const commandCtx = {
			...session.ctx,
			newSession: vi.fn(async (options: { withSession: (ctx: Record<string, any>) => Promise<void> }) => {
				await options.withSession(replacement.ctx);
				return { cancelled: false };
			}),
		};

		await extension.commands.get(CONTINUE_COMMAND)?.("", commandCtx);

		expect(replacement.sendUserMessage).not.toHaveBeenCalled();
		expect(replacement.ui.setEditorText).toHaveBeenCalledWith(buildContinuationPrompt(session.path, session.document));
		await expect(access(session.path)).resolves.toBeUndefined();
	});

	it("retains the handoff when session replacement is cancelled", async () => {
		const extension = loadExtension();
		const session = await readySession();
		await extension.handlers.get("session_start")?.({ type: "session_start" }, session.ctx);
		const commandCtx = {
			...session.ctx,
			newSession: vi.fn(async () => ({ cancelled: true })),
		};

		await extension.commands.get(CONTINUE_COMMAND)?.("", commandCtx);

		await expect(access(session.path)).resolves.toBeUndefined();
		expect(extension.appendEntry).toHaveBeenLastCalledWith(STATE_ENTRY_TYPE, expect.objectContaining({ status: "ready" }));
	});

	it("deletes a dismissed tracked handoff", async () => {
		const extension = loadExtension();
		const session = await readySession();
		await extension.handlers.get("session_start")?.({ type: "session_start" }, session.ctx);

		await extension.commands.get(DISMISS_COMMAND)?.("", session.ctx);

		await expect(access(session.path)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("keeps files when archival retention is enabled", async () => {
		const extension = loadExtension();
		const session = await readySession(true);
		await extension.handlers.get("session_start")?.({ type: "session_start" }, session.ctx);

		await extension.commands.get(DISMISS_COMMAND)?.("", session.ctx);

		await expect(access(session.path)).resolves.toBeUndefined();
	});

	it("never deletes a manually supplied untracked handoff", async () => {
		const extension = loadExtension();
		const session = await readySession(false, true);
		const [contextEntry] = session.ctx.sessionManager.getBranch();
		const untrackedCtx = {
			...session.ctx,
			sessionManager: {
				...session.ctx.sessionManager,
				getBranch: () => [contextEntry],
				buildContextEntries: () => [contextEntry],
			},
		};
		await extension.handlers.get("session_start")?.({ type: "session_start" }, untrackedCtx);
		const replacement = replacementSession();
		const manualCtx = {
			...untrackedCtx,
			newSession: vi.fn(async (options: { withSession: (ctx: Record<string, any>) => Promise<void> }) => {
				await options.withSession(replacement.ctx);
				return { cancelled: false };
			}),
		};

		await extension.commands.get(CONTINUE_COMMAND)?.(`"${session.path}"`, manualCtx);

		expect(replacement.sendUserMessage).toHaveBeenCalledOnce();
		await expect(access(session.path)).resolves.toBeUndefined();
	});
});
