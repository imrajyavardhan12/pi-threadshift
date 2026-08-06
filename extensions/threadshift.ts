import { existsSync } from "node:fs";
import { join } from "node:path";
import { uuidv7 } from "@earendil-works/pi-ai";
import { complete, type Message } from "@earendil-works/pi-ai/compat";
import {
	CONFIG_DIR_NAME,
	convertToLlm,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	getAgentDir,
	serializeConversation,
	sessionEntryToContextMessages,
} from "@earendil-works/pi-coding-agent";
import { decodePathArgument, encodePathArgument } from "../src/command-argument.ts";
import { CONFIG_FILE_NAME, createDefaultConfig, loadConfig } from "../src/config.ts";
import {
	CONTINUE_COMMAND,
	DISMISS_COMMAND,
	PRIMARY_COMMAND,
	STATUS_COMMAND,
	STATUS_ID,
	WIDGET_ID,
} from "../src/constants.ts";
import {
	buildContinuationPrompt,
	buildHandoffPrompt,
	extractResponseText,
	HANDOFF_SYSTEM_PROMPT,
	readHandoffDocument,
	renderHandoffDocument,
	writeHandoffDocument,
} from "../src/handoff-document.ts";
import { shouldPauseActiveRun, shouldPrepareHandoff } from "../src/policy.ts";
import {
	findLatestHandoffState,
	type HandoffState,
	type ReadyHandoffState,
	STATE_ENTRY_TYPE,
	STATE_VERSION,
} from "../src/state.ts";

const REPOSITORY_SNAPSHOT_LIMIT = 30_000;

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function truncate(text: string, limit: number): string {
	if (text.length <= limit) return text;
	return `${text.slice(0, limit)}\n[truncated ${text.length - limit} characters]`;
}

async function collectRepositorySnapshot(pi: ExtensionAPI, cwd: string): Promise<string | undefined> {
	const status = await pi.exec("git", ["status", "--short", "--branch", "--untracked-files=normal"], {
		cwd,
		timeout: 10_000,
	});
	if (status.code !== 0) return undefined;

	const [unstaged, staged] = await Promise.all([
		pi.exec("git", ["diff", "--stat"], { cwd, timeout: 10_000 }),
		pi.exec("git", ["diff", "--cached", "--stat"], { cwd, timeout: 10_000 }),
	]);

	const sections = [
		`Git status:\n${status.stdout.trim() || "Clean working tree."}`,
		unstaged.code === 0 && unstaged.stdout.trim() ? `Unstaged diff stat:\n${unstaged.stdout.trim()}` : undefined,
		staged.code === 0 && staged.stdout.trim() ? `Staged diff stat:\n${staged.stdout.trim()}` : undefined,
	].filter((section): section is string => section !== undefined);

	return truncate(sections.join("\n\n"), REPOSITORY_SNAPSHOT_LIMIT);
}

function continuationCommand(path: string): string {
	return `/${CONTINUE_COMMAND} ${encodePathArgument(path)}`;
}

function latestContextEntryId(ctx: ExtensionContext): string | null {
	const entries = ctx.sessionManager.buildContextEntries();
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry && sessionEntryToContextMessages(entry).length > 0) return entry.id;
	}
	return null;
}

function isPendingHandoffStale(ctx: ExtensionContext, state: ReadyHandoffState): boolean {
	return latestContextEntryId(ctx) !== state.sourceContextEntryId;
}

function displayReadyHandoff(ctx: ExtensionContext, state: ReadyHandoffState, stale = false): boolean {
	const command = stale ? `/${PRIMARY_COMMAND}` : continuationCommand(state.path);
	const canPrefill = ctx.mode === "tui" && ctx.ui.getEditorText().trim().length === 0;
	const instruction = canPrefill
		? stale
			? `Press Enter to regenerate it before starting a new session, or run /${DISMISS_COMMAND}.`
			: `Press Enter to continue in a new session, or run /${DISMISS_COMMAND}.`
		: `Editor draft preserved. Run ${command} when ready, or run /${DISMISS_COMMAND}.`;
	ctx.ui.setWidget(
		WIDGET_ID,
		stale
			? [
					"The prepared Threadshift handoff is stale because the session continued.",
					instruction,
					`Previous file: ${state.path}`,
				]
			: [
					`Threadshift handoff ready (${state.contextPercent?.toFixed(1) ?? "manual"}%).`,
					instruction,
					`File: ${state.path}`,
				],
	);
	if (canPrefill) ctx.ui.setEditorText(command);
	return canPrefill;
}

function clearReadyHandoffUi(ctx: ExtensionContext, state?: ReadyHandoffState): void {
	ctx.ui.setWidget(WIDGET_ID, undefined);
	if (state && ctx.ui.getEditorText() === continuationCommand(state.path)) {
		ctx.ui.setEditorText("");
	}
}

export default function threadshiftExtension(pi: ExtensionAPI) {
	let config = createDefaultConfig(getAgentDir());
	let pending: ReadyHandoffState | undefined;
	let inFlight = false;
	let suppressed = false;
	let pauseRequested = false;

	const appendState = (state: HandoffState): void => {
		pi.appendEntry(STATE_ENTRY_TYPE, state);
	};

	const recordFailure = (path: string | undefined, reason: string): void => {
		appendState({
			version: STATE_VERSION,
			status: "failed",
			...(path ? { path } : {}),
			at: new Date().toISOString(),
			reason,
		});
	};

	async function generateHandoff(
		ctx: ExtensionContext,
		options: { goal?: string; contextPercent: number | null; signal?: AbortSignal },
	): Promise<ReadyHandoffState> {
		if (inFlight) throw new Error("A Threadshift handoff is already being generated");
		if (!ctx.model) throw new Error("No model is selected");

		inFlight = true;
		ctx.ui.setStatus(STATUS_ID, "preparing Threadshift handoff…");

		try {
			const contextEntries = ctx.sessionManager.buildContextEntries();
			const contextMessages = contextEntries.flatMap((entry) => sessionEntryToContextMessages(entry));
			if (contextMessages.length === 0) throw new Error("The current session has no context to hand off");
			const sourceContextEntryId = latestContextEntryId(ctx);

			const conversation = serializeConversation(convertToLlm(contextMessages));
			const repositorySnapshot = await collectRepositorySnapshot(pi, ctx.cwd).catch(() => undefined);
			const sourceSessionFile = ctx.sessionManager.getSessionFile();
			const sessionName = ctx.sessionManager.getSessionName();
			const generatedAt = new Date().toISOString();
			const model = ctx.model;
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (!auth.ok) throw new Error(`Could not resolve model authentication: ${auth.error}`);
			if (!auth.apiKey) throw new Error(`No API key is available for ${model.provider}/${model.id}`);

			const prompt = buildHandoffPrompt({
				conversation,
				cwd: ctx.cwd,
				...(sessionName ? { sessionName } : {}),
				...(sourceSessionFile ? { sourceSessionFile } : {}),
				...(options.goal?.trim() ? { goal: options.goal.trim() } : {}),
				...(repositorySnapshot ? { repositorySnapshot } : {}),
			});
			const message: Message = {
				role: "user",
				content: [{ type: "text", text: prompt }],
				timestamp: Date.now(),
			};

			const timeoutSignal = AbortSignal.timeout(config.generationTimeoutMs);
			const generationSignal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
			const response = await complete(
				model,
				{ systemPrompt: HANDOFF_SYSTEM_PROMPT, messages: [message] },
				{
					apiKey: auth.apiKey,
					...(auth.headers ? { headers: auth.headers } : {}),
					...(auth.env ? { env: auth.env } : {}),
					maxTokens: Math.min(config.maxOutputTokens, model.maxTokens),
					signal: generationSignal,
					cacheRetention: "none",
					sessionId: uuidv7(),
				},
			);

			if (response.stopReason === "aborted" || response.stopReason === "error") {
				throw new Error(response.errorMessage || `Handoff generation stopped: ${response.stopReason}`);
			}
			if (response.stopReason === "length") {
				throw new Error(`Handoff generation exceeded the ${Math.min(config.maxOutputTokens, model.maxTokens)}-token output limit`);
			}
			const body = extractResponseText(response.content);
			if (!body) throw new Error("The handoff model returned an empty document");

			const document = renderHandoffDocument(body, {
				generatedAt,
				cwd: ctx.cwd,
				sourceSessionId: ctx.sessionManager.getSessionId(),
				...(sourceSessionFile ? { sourceSessionFile } : {}),
				provider: model.provider,
				model: model.id,
				...(options.contextPercent === null ? {} : { contextPercent: options.contextPercent }),
			});
			const path = await writeHandoffDocument({
				directory: config.handoffDirectory,
				document,
				generatedAt,
				sessionId: ctx.sessionManager.getSessionId(),
			});
			const state: ReadyHandoffState = {
				version: STATE_VERSION,
				status: "ready",
				path,
				generatedAt,
				contextPercent: options.contextPercent,
				thresholdPercent: config.thresholdPercent,
				provider: model.provider,
				model: model.id,
				sourceContextEntryId,
			};
			appendState(state);
			pending = state;
			return state;
		} finally {
			inFlight = false;
			ctx.ui.setStatus(STATUS_ID, undefined);
		}
	}

	async function continueInNewSession(path: string, ctx: ExtensionCommandContext): Promise<boolean> {
		if (pending?.path === path && isPendingHandoffStale(ctx, pending)) {
			throw new Error(`The prepared handoff is stale because the session continued; run /${PRIMARY_COMMAND} to regenerate it`);
		}
		const document = await readHandoffDocument(path);
		const kickoff = buildContinuationPrompt(path, document);
		const parentSession = ctx.sessionManager.getSessionFile();
		const autoContinue = config.autoContinue;
		const previousPending = pending;

		appendState({
			version: STATE_VERSION,
			status: "consumed",
			path,
			at: new Date().toISOString(),
		});
		clearReadyHandoffUi(ctx, previousPending);

		const result = await ctx.newSession({
			...(parentSession ? { parentSession } : {}),
			withSession: async (replacementCtx) => {
				if (!autoContinue) {
					replacementCtx.ui.setEditorText(kickoff);
					replacementCtx.ui.notify("New session ready. Submit the handoff prompt when ready.", "info");
					return;
				}

				try {
					await replacementCtx.sendUserMessage(kickoff);
				} catch (error) {
					replacementCtx.ui.setEditorText(kickoff);
					replacementCtx.ui.notify(`Could not auto-continue: ${errorMessage(error)}`, "error");
				}
			},
		});

		if (result.cancelled) {
			if (previousPending) {
				appendState(previousPending);
				pending = previousPending;
				displayReadyHandoff(ctx, previousPending);
			}
			ctx.ui.notify("New session creation was cancelled", "info");
			return false;
		}

		return true;
	}

	pi.on("session_start", async (_event, ctx) => {
		pending = undefined;
		inFlight = false;
		suppressed = false;
		pauseRequested = false;
		ctx.ui.setWidget(WIDGET_ID, undefined);
		ctx.ui.setStatus(STATUS_ID, undefined);

		const globalPath = join(getAgentDir(), CONFIG_FILE_NAME);
		const projectPath = ctx.isProjectTrusted() ? join(ctx.cwd, CONFIG_DIR_NAME, CONFIG_FILE_NAME) : undefined;
		const loaded = await loadConfig({
			defaults: createDefaultConfig(getAgentDir()),
			globalPath,
			...(projectPath ? { projectPath } : {}),
			cwd: ctx.cwd,
		});
		config = loaded.config;
		for (const warning of loaded.warnings) ctx.ui.notify(warning, "warning");

		const latest = findLatestHandoffState(ctx.sessionManager.getBranch());
		if (latest?.status === "ready") {
			if (existsSync(latest.path)) {
				pending = latest;
				if (ctx.mode === "tui") displayReadyHandoff(ctx, latest, isPendingHandoffStale(ctx, latest));
			} else {
				suppressed = true;
				ctx.ui.notify(`Saved handoff no longer exists: ${latest.path}`, "warning");
			}
		} else if (latest) {
			suppressed = true;
		}
	});

	pi.on("agent_start", () => {
		pauseRequested = false;
	});

	pi.on("turn_end", (event, ctx) => {
		if (ctx.mode !== "tui") return;

		const usage = ctx.getContextUsage();
		const willContinue = event.toolResults.length > 0 || ctx.hasPendingMessages();
		if (
			!shouldPauseActiveRun({
				enabled: config.enabled,
				percent: usage?.percent,
				thresholdPercent: config.thresholdPercent,
				inFlight,
				hasPendingHandoff: pending !== undefined,
				suppressed,
				pauseRequested,
				willContinue,
			})
		) {
			return;
		}

		pauseRequested = true;
		const percent = usage?.percent?.toFixed(1) ?? "unknown";
		ctx.ui.setStatus(STATUS_ID, `pausing Threadshift at ${percent}%…`);
		ctx.ui.notify(
			`Threadshift reached its context threshold after turn ${event.turnIndex + 1}. Pausing before the next model call.`,
			"info",
		);
		ctx.abort();
	});

	pi.on("session_before_compact", async (event, ctx) => {
		if (
			ctx.mode !== "tui" ||
			event.reason !== "threshold" ||
			!config.enabled ||
			inFlight ||
			pending !== undefined ||
			suppressed ||
			ctx.hasPendingMessages()
		) {
			return;
		}

		const contextWindow = ctx.model?.contextWindow;
		const contextPercent =
			contextWindow && contextWindow > 0 ? (event.preparation.tokensBefore / contextWindow) * 100 : null;
		try {
			const state = await generateHandoff(ctx, { contextPercent, signal: event.signal });
			const prefilled = displayReadyHandoff(ctx, state);
			ctx.ui.notify(
				prefilled
					? "Threadshift prepared a handoff before Pi's automatic compaction. Press Enter to start the replacement session."
					: `Threadshift prepared a handoff before Pi's automatic compaction. Your editor draft was preserved; run ${continuationCommand(state.path)} when ready.`,
				"info",
			);
			return { cancel: true };
		} catch (error) {
			const message = errorMessage(error);
			suppressed = true;
			recordFailure(undefined, message);
			ctx.ui.notify(`Early Threadshift handoff failed: ${message}. Pi will use normal compaction.`, "warning");
			return;
		}
	});

	pi.on("agent_settled", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		pauseRequested = false;
		ctx.ui.setStatus(STATUS_ID, undefined);
		const usage = ctx.getContextUsage();
		if (usage?.percent !== null && usage?.percent !== undefined && usage.percent < config.thresholdPercent) {
			suppressed = false;
		}
		if (pending) {
			displayReadyHandoff(ctx, pending, isPendingHandoffStale(ctx, pending));
			return;
		}
		if (
			!shouldPrepareHandoff({
				enabled: config.enabled,
				percent: usage?.percent,
				thresholdPercent: config.thresholdPercent,
				inFlight,
				hasPendingHandoff: pending !== undefined,
				suppressed,
				hasPendingMessages: ctx.hasPendingMessages(),
			})
		) {
			return;
		}

		try {
			const state = await generateHandoff(ctx, { contextPercent: usage?.percent ?? null });
			const prefilled = displayReadyHandoff(ctx, state);
			ctx.ui.notify(
				prefilled
					? "Threadshift handoff ready. Press Enter to start the replacement session."
					: `Threadshift handoff ready. Your editor draft was preserved; run ${continuationCommand(state.path)} when ready.`,
				"info",
			);
		} catch (error) {
			const message = errorMessage(error);
			suppressed = true;
			recordFailure(undefined, message);
			ctx.ui.notify(`Threadshift failed: ${message}. Use /${PRIMARY_COMMAND} to retry.`, "error");
		}
	});

	pi.registerCommand(PRIMARY_COMMAND, {
		description: "Generate a Threadshift handoff and immediately continue in a new session",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify(`${PRIMARY_COMMAND} requires interactive mode`, "error");
				return;
			}
			await ctx.waitForIdle();
			try {
				const state = await generateHandoff(ctx, {
					...(args.trim() ? { goal: args.trim() } : {}),
					contextPercent: ctx.getContextUsage()?.percent ?? null,
				});
				await continueInNewSession(state.path, ctx);
			} catch (error) {
				const message = errorMessage(error);
				if (!pending) {
					suppressed = true;
					recordFailure(undefined, message);
				}
				ctx.ui.notify(`Threadshift failed: ${message}`, "error");
			}
		},
	});

	pi.registerCommand(CONTINUE_COMMAND, {
		description: "Continue in a new session from a generated handoff",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify(`${CONTINUE_COMMAND} requires interactive mode`, "error");
				return;
			}
			try {
				const path = args.trim() ? decodePathArgument(args) : pending?.path;
				if (!path) throw new Error(`No handoff is ready; run /${PRIMARY_COMMAND} first`);
				await continueInNewSession(path, ctx);
			} catch (error) {
				ctx.ui.notify(`Could not continue from handoff: ${errorMessage(error)}`, "error");
			}
		},
	});

	pi.registerCommand(DISMISS_COMMAND, {
		description: "Dismiss the pending automatic handoff for this context cycle",
		handler: async (_args, ctx) => {
			if (!pending) {
				ctx.ui.notify("No Threadshift handoff is pending", "info");
				return;
			}
			const dismissed = pending;
			appendState({
				version: STATE_VERSION,
				status: "dismissed",
				path: dismissed.path,
				at: new Date().toISOString(),
			});
			pending = undefined;
			suppressed = true;
			clearReadyHandoffUi(ctx, dismissed);
			ctx.ui.notify("Threadshift handoff dismissed; the document was kept on disk", "info");
		},
	});

	pi.registerCommand(STATUS_COMMAND, {
		description: "Show Threadshift configuration and state",
		handler: async (_args, ctx) => {
			const usage = ctx.getContextUsage();
			const percent = usage?.percent === null || usage?.percent === undefined ? "unknown" : `${usage.percent.toFixed(1)}%`;
			ctx.ui.notify(
				[
					`Threadshift: ${config.enabled ? "enabled" : "disabled"}`,
					`Usage: ${percent}; threshold: ${config.thresholdPercent}%`,
					`Auto-continue: ${config.autoContinue ? "yes" : "no"}`,
					`Directory: ${config.handoffDirectory}`,
					`Pending: ${pending?.path ?? "none"}`,
				].join("\n"),
				"info",
			);
		},
	});
}
