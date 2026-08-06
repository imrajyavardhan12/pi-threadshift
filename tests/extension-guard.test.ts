import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import threadshiftExtension from "../extensions/threadshift.ts";

type EventHandler = (event: Record<string, unknown>, ctx: Record<string, unknown>) => unknown;

function loadExtension() {
	const handlers = new Map<string, EventHandler>();
	const pi = {
		on(event: string, handler: EventHandler) {
			handlers.set(event, handler);
		},
		registerCommand: vi.fn(),
	} as unknown as ExtensionAPI;

	threadshiftExtension(pi);
	return handlers;
}

function turnContext(percent: number | (() => number), hasPendingMessages = false) {
	return {
		mode: "tui",
		getContextUsage: () => {
			const currentPercent = typeof percent === "function" ? percent() : percent;
			return { percent: currentPercent, tokens: Math.round(currentPercent * 1_000), contextWindow: 100_000 };
		},
		hasPendingMessages: () => hasPendingMessages,
		abort: vi.fn(),
		ui: {
			notify: vi.fn(),
			setStatus: vi.fn(),
		},
	};
}

function turnEvent(toolResults: unknown[] = [{ role: "toolResult" }]) {
	return {
		type: "turn_end",
		turnIndex: 0,
		message: { role: "assistant", stopReason: toolResults.length > 0 ? "toolUse" : "stop" },
		toolResults,
	};
}

describe("active-run context guard", () => {
	it("re-enables protection when a consumed source session later continues", async () => {
		const handlers = loadExtension();
		const branch = [
			{
				type: "message",
				id: "context-before-consumption",
				message: { role: "user", content: [{ type: "text", text: "original work" }], timestamp: 1 },
			},
			{
				type: "custom",
				id: "consumed-state",
				customType: "pi-threadshift",
				data: {
					version: 1,
					status: "consumed",
					path: "/tmp/handoff.md",
					at: "2026-08-06T00:00:00.000Z",
				},
			},
			{
				type: "message",
				id: "context-after-consumption",
				message: { role: "user", content: [{ type: "text", text: "resumed work" }], timestamp: 2 },
			},
		];
		const ctx = {
			...turnContext(78.4),
			cwd: "/project",
			isProjectTrusted: () => false,
			sessionManager: {
				getBranch: () => branch,
				buildContextEntries: () => branch,
			},
			ui: {
				...turnContext(78.4).ui,
				setWidget: vi.fn(),
			},
		};

		await handlers.get("session_start")?.({ type: "session_start" }, ctx);
		await handlers.get("turn_end")?.(turnEvent(), ctx);

		expect(ctx.abort).toHaveBeenCalledOnce();
	});

	it("keeps a terminal lifecycle record suppressed until context advances", async () => {
		const handlers = loadExtension();
		const branch = [
			{
				type: "message",
				id: "same-context",
				message: { role: "user", content: [{ type: "text", text: "work" }], timestamp: 1 },
			},
			{
				type: "custom",
				id: "dismissed-state",
				customType: "pi-threadshift",
				data: {
					version: 1,
					status: "dismissed",
					path: "/tmp/handoff.md",
					at: "2026-08-06T00:00:00.000Z",
				},
			},
		];
		const ctx = {
			...turnContext(78.4),
			cwd: "/project",
			isProjectTrusted: () => false,
			sessionManager: {
				getBranch: () => branch,
				buildContextEntries: () => branch,
			},
			ui: {
				...turnContext(78.4).ui,
				setWidget: vi.fn(),
			},
		};

		await handlers.get("session_start")?.({ type: "session_start" }, ctx);
		await handlers.get("turn_end")?.(turnEvent(), ctx);

		expect(ctx.abort).not.toHaveBeenCalled();
	});

	it("stops a continuing run at the first completed turn above the threshold", async () => {
		const handlers = loadExtension();
		const handler = handlers.get("turn_end");
		let percent = 68;
		const ctx = turnContext(() => percent);

		expect(handler, "Threadshift must monitor completed turns").toBeDefined();
		await handler?.(turnEvent(), ctx);
		expect(ctx.abort).not.toHaveBeenCalled();

		percent = 74;
		await handler?.({ ...turnEvent(), turnIndex: 1 }, ctx);
		percent = 105;
		await handler?.({ ...turnEvent(), turnIndex: 2 }, ctx);

		expect(ctx.abort).toHaveBeenCalledOnce();
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Pausing before the next model call"), "info");
	});

	it("lets work continue while usage remains below the threshold", async () => {
		const handler = loadExtension().get("turn_end");
		const ctx = turnContext(69.9);

		await handler?.(turnEvent(), ctx);

		expect(ctx.abort).not.toHaveBeenCalled();
	});

	it("does not abort a final turn that is already ending naturally", async () => {
		const handler = loadExtension().get("turn_end");
		const ctx = turnContext(74);

		await handler?.(turnEvent([]), ctx);

		expect(ctx.abort).not.toHaveBeenCalled();
	});

	it("stops queued continuation work even when the current turn has no tools", async () => {
		const handler = loadExtension().get("turn_end");
		const ctx = turnContext(74, true);

		await handler?.(turnEvent([]), ctx);

		expect(ctx.abort).toHaveBeenCalledOnce();
	});
});
