import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export const CONFIG_FILE_NAME = "threadshift.json";

export interface HandoffConfig {
	enabled: boolean;
	thresholdPercent: number;
	autoContinue: boolean;
	retainHandoffFiles: boolean;
	handoffDirectory: string;
	maxOutputTokens: number;
	generationTimeoutMs: number;
}

export interface ConfigLoadResult {
	config: HandoffConfig;
	warnings: string[];
}

export function createDefaultConfig(agentDir: string): HandoffConfig {
	return {
		enabled: true,
		thresholdPercent: 70,
		autoContinue: false,
		retainHandoffFiles: false,
		handoffDirectory: join(agentDir, "threadshift", "handoffs"),
		maxOutputTokens: 8_192,
		generationTimeoutMs: 120_000,
	};
}

const CONFIG_KEYS = new Set<keyof HandoffConfig>([
	"enabled",
	"thresholdPercent",
	"autoContinue",
	"retainHandoffFiles",
	"handoffDirectory",
	"maxOutputTokens",
	"generationTimeoutMs",
]);

function assertObject(value: unknown, configPath: string): asserts value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${configPath} must contain a JSON object`);
	}
}

function validateLayer(value: unknown, configPath: string): Partial<HandoffConfig> {
	assertObject(value, configPath);

	for (const key of Object.keys(value)) {
		if (!CONFIG_KEYS.has(key as keyof HandoffConfig)) {
			throw new Error(`${configPath} contains unknown setting "${key}"`);
		}
	}

	const layer: Partial<HandoffConfig> = {};

	if (value.enabled !== undefined) {
		if (typeof value.enabled !== "boolean") throw new Error(`${configPath}: enabled must be a boolean`);
		layer.enabled = value.enabled;
	}
	if (value.thresholdPercent !== undefined) {
		if (
			typeof value.thresholdPercent !== "number" ||
			!Number.isFinite(value.thresholdPercent) ||
			value.thresholdPercent < 10 ||
			value.thresholdPercent > 95
		) {
			throw new Error(`${configPath}: thresholdPercent must be between 10 and 95`);
		}
		layer.thresholdPercent = value.thresholdPercent;
	}
	if (value.autoContinue !== undefined) {
		if (typeof value.autoContinue !== "boolean") {
			throw new Error(`${configPath}: autoContinue must be a boolean`);
		}
		layer.autoContinue = value.autoContinue;
	}
	if (value.retainHandoffFiles !== undefined) {
		if (typeof value.retainHandoffFiles !== "boolean") {
			throw new Error(`${configPath}: retainHandoffFiles must be a boolean`);
		}
		layer.retainHandoffFiles = value.retainHandoffFiles;
	}
	if (value.handoffDirectory !== undefined) {
		if (typeof value.handoffDirectory !== "string" || value.handoffDirectory.trim().length === 0) {
			throw new Error(`${configPath}: handoffDirectory must be a non-empty string`);
		}
		layer.handoffDirectory = value.handoffDirectory;
	}
	if (value.maxOutputTokens !== undefined) {
		if (
			typeof value.maxOutputTokens !== "number" ||
			!Number.isInteger(value.maxOutputTokens) ||
			value.maxOutputTokens < 1_024 ||
			value.maxOutputTokens > 32_768
		) {
			throw new Error(`${configPath}: maxOutputTokens must be an integer between 1024 and 32768`);
		}
		layer.maxOutputTokens = value.maxOutputTokens;
	}
	if (value.generationTimeoutMs !== undefined) {
		if (
			typeof value.generationTimeoutMs !== "number" ||
			!Number.isInteger(value.generationTimeoutMs) ||
			value.generationTimeoutMs < 10_000 ||
			value.generationTimeoutMs > 600_000
		) {
			throw new Error(`${configPath}: generationTimeoutMs must be an integer between 10000 and 600000`);
		}
		layer.generationTimeoutMs = value.generationTimeoutMs;
	}

	return layer;
}

async function readLayer(configPath: string): Promise<{ layer?: Partial<HandoffConfig>; warning?: string }> {
	try {
		const raw = await readFile(configPath, "utf8");
		return { layer: validateLayer(JSON.parse(raw), configPath) };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		const message = error instanceof Error ? error.message : String(error);
		return { warning: `Ignoring invalid handoff configuration: ${message}` };
	}
}

export async function loadConfig(options: {
	defaults: HandoffConfig;
	globalPath: string;
	projectPath?: string;
	cwd: string;
}): Promise<ConfigLoadResult> {
	const warnings: string[] = [];
	const globalResult = await readLayer(options.globalPath);
	if (globalResult.warning) warnings.push(globalResult.warning);

	const projectResult = options.projectPath ? await readLayer(options.projectPath) : {};
	if (projectResult.warning) warnings.push(projectResult.warning);

	const merged: HandoffConfig = {
		...options.defaults,
		...globalResult.layer,
		...projectResult.layer,
	};

	return {
		config: {
			...merged,
			handoffDirectory: resolveConfiguredDirectory(merged.handoffDirectory, options.cwd),
		},
		warnings,
	};
}

export function resolveConfiguredDirectory(directory: string, cwd: string, home = homedir()): string {
	if (directory === "~") return home;
	if (directory.startsWith("~/")) return join(home, directory.slice(2));
	if (isAbsolute(directory)) return directory;
	return resolve(cwd, directory);
}
