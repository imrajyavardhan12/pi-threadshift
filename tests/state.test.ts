import { describe, expect, it } from "vitest";
import { findLatestHandoffState, isHandoffState, STATE_ENTRY_TYPE, STATE_VERSION } from "../src/state.ts";

const ready = {
	version: STATE_VERSION,
	status: "ready" as const,
	path: "/tmp/handoff.md",
	generatedAt: "2026-08-06T00:00:00.000Z",
	contextPercent: 70,
	thresholdPercent: 70,
	provider: "openai",
	model: "gpt-5",
	sourceContextEntryId: "entry-1",
};

describe("handoff state", () => {
	it("restores the latest valid lifecycle record", () => {
		const latest = findLatestHandoffState([
			{ type: "custom", customType: STATE_ENTRY_TYPE, data: ready },
			{ type: "message" },
			{
				type: "custom",
				customType: STATE_ENTRY_TYPE,
				data: { version: STATE_VERSION, status: "dismissed", path: ready.path, at: "later" },
			},
		]);

		expect(latest?.status).toBe("dismissed");
	});

	it("skips malformed records instead of trusting persisted data", () => {
		expect(isHandoffState({ ...ready, contextPercent: "70" })).toBe(false);
		expect(isHandoffState({ ...ready, contextPercent: null })).toBe(true);
		expect(findLatestHandoffState([{ type: "custom", customType: STATE_ENTRY_TYPE, data: { status: "ready" } }])).toBeUndefined();
	});
});
