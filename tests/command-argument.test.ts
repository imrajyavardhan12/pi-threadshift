import { describe, expect, it } from "vitest";
import { decodePathArgument, encodePathArgument } from "../src/command-argument.ts";

describe("handoff command path arguments", () => {
	it("round-trips paths containing spaces and quotes", () => {
		const path = '/tmp/a handoff with "quotes".md';
		expect(decodePathArgument(encodePathArgument(path))).toBe(path);
	});

	it("accepts an unquoted path for manual use", () => {
		expect(decodePathArgument("  /tmp/handoff.md  ")).toBe("/tmp/handoff.md");
	});

	it("rejects missing and malformed quoted paths", () => {
		expect(() => decodePathArgument(" ")).toThrow("Missing handoff path");
		expect(() => decodePathArgument('"unterminated')).toThrow("Invalid quoted handoff path");
	});
});
