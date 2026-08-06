import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildContinuationPrompt,
	buildHandoffPrompt,
	extractResponseText,
	readHandoffDocument,
	renderHandoffDocument,
	writeHandoffDocument,
} from "../src/handoff-document.ts";

const temporaryDirectories: string[] = [];

async function tempDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "pi-threadshift-document-test-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("handoff prompt", () => {
	it("keeps the next-session goal and source material in explicit boundaries", () => {
		const prompt = buildHandoffPrompt({
			conversation: "User requested feature X.",
			cwd: "/repo",
			goal: "Finish tests",
			repositorySnapshot: "## main\n M src/a.ts",
		});

		expect(prompt).toContain("<next-session-goal>\nFinish tests\n</next-session-goal>");
		expect(prompt).toContain("<conversation>\nUser requested feature X.\n</conversation>");
		expect(prompt).toContain("<repository-snapshot>");
	});

	it("extracts only non-empty text response blocks", () => {
		expect(
			extractResponseText([
				{ type: "thinking", text: "private" },
				{ type: "text", text: " first " },
				{ type: "text", text: "" },
				{ type: "text", text: "second" },
			]),
		).toBe("first\n\nsecond");
	});
});

describe("handoff document persistence", () => {
	it("writes a unique, private, complete Markdown document atomically", async () => {
		const directory = join(await tempDirectory(), "nested", "handoffs");
		const generatedAt = "2026-08-06T01:02:03.456Z";
		const document = renderHandoffDocument("## Objective\nShip it.", {
			generatedAt,
			cwd: "/repo",
			sourceSessionId: "session-123456789",
			provider: "openai",
			model: "gpt-5",
			contextPercent: 70,
		});

		const firstPath = await writeHandoffDocument({ directory, document, generatedAt, sessionId: "session-123456789" });
		const secondPath = await writeHandoffDocument({ directory, document, generatedAt, sessionId: "session-123456789" });

		expect(firstPath).not.toBe(secondPath);
		expect(await readFile(firstPath, "utf8")).toBe(document);
		if (process.platform !== "win32") {
			expect((await stat(firstPath)).mode & 0o777).toBe(0o600);
		}
		await access(firstPath, constants.R_OK);
	});

	it("rejects oversized handoff files before loading them into a new context", async () => {
		const directory = await tempDirectory();
		const path = join(directory, "oversized.md");
		await writeFile(path, Buffer.alloc(1_048_577));

		await expect(readHandoffDocument(path)).rejects.toThrow("exceeds");
	});
});

describe("continuation prompt", () => {
	it("requires repository verification and action rather than another summary", () => {
		const prompt = buildContinuationPrompt("/tmp/handoff.md", "## Next steps\n1. Add tests.");
		expect(prompt).toContain("verify its important claims");
		expect(prompt).toContain("Do not merely summarize");
		expect(prompt).toContain("## Next steps");
	});
});
