import { describe, expect, it } from "vitest";
import {
	shouldPauseActiveRun,
	shouldPrepareHandoff,
	type ActiveRunGuardInput,
	type HandoffPolicyInput,
} from "../src/policy.ts";

const base: HandoffPolicyInput = {
	enabled: true,
	percent: 70,
	thresholdPercent: 70,
	inFlight: false,
	hasPendingHandoff: false,
	suppressed: false,
	hasPendingMessages: false,
};

describe("shouldPrepareHandoff", () => {
	it("triggers at and above the configured threshold", () => {
		expect(shouldPrepareHandoff(base)).toBe(true);
		expect(shouldPrepareHandoff({ ...base, percent: 82.5 })).toBe(true);
	});

	it("does not trigger below the threshold or when usage is unknown", () => {
		expect(shouldPrepareHandoff({ ...base, percent: 69.99 })).toBe(false);
		expect(shouldPrepareHandoff({ ...base, percent: null })).toBe(false);
		expect(shouldPrepareHandoff({ ...base, percent: undefined })).toBe(false);
	});

	it.each([
		{ enabled: false },
		{ inFlight: true },
		{ hasPendingHandoff: true },
		{ suppressed: true },
		{ hasPendingMessages: true },
	])("does not trigger when guarded by %o", (override) => {
		expect(shouldPrepareHandoff({ ...base, ...override })).toBe(false);
	});
});

const activeRunBase: ActiveRunGuardInput = {
	enabled: true,
	percent: 70,
	thresholdPercent: 70,
	inFlight: false,
	hasPendingHandoff: false,
	suppressed: false,
	pauseRequested: false,
	willContinue: true,
};

describe("shouldPauseActiveRun", () => {
	it("pauses continuing work at and above the threshold", () => {
		expect(shouldPauseActiveRun(activeRunBase)).toBe(true);
		expect(shouldPauseActiveRun({ ...activeRunBase, percent: 105 })).toBe(true);
	});

	it.each([
		{ enabled: false },
		{ percent: 69.99 },
		{ percent: null },
		{ inFlight: true },
		{ hasPendingHandoff: true },
		{ suppressed: true },
		{ pauseRequested: true },
		{ willContinue: false },
	])("does not request an unsafe or redundant pause for %o", (override) => {
		expect(shouldPauseActiveRun({ ...activeRunBase, ...override })).toBe(false);
	});
});
