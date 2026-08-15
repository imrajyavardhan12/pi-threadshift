import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { createDefaultConfig, loadConfig, resolveConfiguredDirectory } from "../src/config.ts";

const temporaryDirectories: string[] = [];

async function tempDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "pi-threadshift-test-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("createDefaultConfig", () => {
	it("requires human review before continuing by default", () => {
		expect(createDefaultConfig("/agent").autoContinue).toBe(false);
	});
});

describe("loadConfig", () => {
	it("uses the review-first default when configuration omits autoContinue", async () => {
		const root = await tempDirectory();
		const globalPath = join(root, "global.json");
		await writeFile(globalPath, JSON.stringify({ thresholdPercent: 75 }));

		const result = await loadConfig({
			defaults: createDefaultConfig(join(root, "agent")),
			globalPath,
			cwd: root,
		});

		expect(result.warnings).toEqual([]);
		expect(result.config.autoContinue).toBe(false);
	});

	it("preserves automatic continuation when explicitly enabled", async () => {
		const root = await tempDirectory();
		const globalPath = join(root, "global.json");
		await writeFile(globalPath, JSON.stringify({ autoContinue: true }));

		const result = await loadConfig({
			defaults: createDefaultConfig(join(root, "agent")),
			globalPath,
			cwd: root,
		});

		expect(result.warnings).toEqual([]);
		expect(result.config.autoContinue).toBe(true);
	});

	it("merges defaults, global settings, and trusted project settings in precedence order", async () => {
		const root = await tempDirectory();
		const projectDirectory = join(root, "project");
		await mkdir(projectDirectory);
		const globalPath = join(root, "global.json");
		const projectPath = join(root, "project.json");
		await writeFile(globalPath, JSON.stringify({ thresholdPercent: 75, autoContinue: false }));
		await writeFile(projectPath, JSON.stringify({ thresholdPercent: 80, handoffDirectory: ".handoffs" }));

		const result = await loadConfig({
			defaults: createDefaultConfig(join(root, "agent")),
			globalPath,
			projectPath,
			cwd: projectDirectory,
		});

		expect(result.warnings).toEqual([]);
		expect(result.config.thresholdPercent).toBe(80);
		expect(result.config.autoContinue).toBe(false);
		expect(result.config.retainHandoffFiles).toBe(false);
		expect(result.config.handoffDirectory).toBe(join(projectDirectory, ".handoffs"));
	});

	it("ignores an invalid layer atomically and reports a warning", async () => {
		const root = await tempDirectory();
		const globalPath = join(root, "global.json");
		await writeFile(globalPath, JSON.stringify({ thresholdPercent: 80, typoSetting: true }));
		const defaults = createDefaultConfig(join(root, "agent"));

		const result = await loadConfig({ defaults, globalPath, cwd: root });

		expect(result.config.thresholdPercent).toBe(defaults.thresholdPercent);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain("unknown setting");
	});

	it("rejects a non-boolean retention setting with the rest of its layer", async () => {
		const root = await tempDirectory();
		const globalPath = join(root, "global.json");
		await writeFile(globalPath, JSON.stringify({ retainHandoffFiles: "yes", thresholdPercent: 85 }));
		const defaults = createDefaultConfig(join(root, "agent"));

		const result = await loadConfig({ defaults, globalPath, cwd: root });

		expect(result.config.retainHandoffFiles).toBe(false);
		expect(result.config.thresholdPercent).toBe(defaults.thresholdPercent);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain("retainHandoffFiles must be a boolean");
	});

	it("allows users to retain handoff files as an explicit archival policy", async () => {
		const root = await tempDirectory();
		const globalPath = join(root, "global.json");
		await writeFile(globalPath, JSON.stringify({ retainHandoffFiles: true }));

		const result = await loadConfig({ defaults: createDefaultConfig(join(root, "agent")), globalPath, cwd: root });

		expect(result.warnings).toEqual([]);
		expect(result.config.retainHandoffFiles).toBe(true);
	});

	it("does not warn for missing config files", async () => {
		const root = await tempDirectory();
		const result = await loadConfig({
			defaults: createDefaultConfig(join(root, "agent")),
			globalPath: join(root, "missing.json"),
			cwd: root,
		});

		expect(result.warnings).toEqual([]);
	});
});

describe("resolveConfiguredDirectory", () => {
	it("expands home-relative and project-relative paths", () => {
		expect(resolveConfiguredDirectory("~/handoffs", "/project", "/home/dev")).toBe("/home/dev/handoffs");
		expect(resolveConfiguredDirectory(".pi/handoffs", "/project", "/home/dev")).toBe("/project/.pi/handoffs");
	});
});
