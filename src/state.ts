export const STATE_ENTRY_TYPE = "pi-threadshift";
export const STATE_VERSION = 1;

export interface ReadyHandoffState {
	version: typeof STATE_VERSION;
	status: "ready";
	path: string;
	generatedAt: string;
	contextPercent: number | null;
	thresholdPercent: number;
	provider: string;
	model: string;
	sourceContextEntryId: string | null;
}

export interface TerminalHandoffState {
	version: typeof STATE_VERSION;
	status: "consumed" | "dismissed" | "failed";
	path?: string;
	at: string;
	reason?: string;
}

export type HandoffState = ReadyHandoffState | TerminalHandoffState;

interface EntryLike {
	type: string;
	customType?: string;
	data?: unknown;
}

export function isHandoffState(value: unknown): value is HandoffState {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const candidate = value as Record<string, unknown>;
	if (candidate.version !== STATE_VERSION || typeof candidate.status !== "string") return false;

	if (candidate.status === "ready") {
		return (
			typeof candidate.path === "string" &&
			typeof candidate.generatedAt === "string" &&
			(candidate.contextPercent === null || typeof candidate.contextPercent === "number") &&
			typeof candidate.thresholdPercent === "number" &&
			typeof candidate.provider === "string" &&
			typeof candidate.model === "string" &&
			(candidate.sourceContextEntryId === null || typeof candidate.sourceContextEntryId === "string")
		);
	}

	return (
		(candidate.status === "consumed" || candidate.status === "dismissed" || candidate.status === "failed") &&
		typeof candidate.at === "string" &&
		(candidate.path === undefined || typeof candidate.path === "string") &&
		(candidate.reason === undefined || typeof candidate.reason === "string")
	);
}

export function findLatestHandoffState(entries: readonly EntryLike[]): HandoffState | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry?.type !== "custom" || entry.customType !== STATE_ENTRY_TYPE) continue;
		if (isHandoffState(entry.data)) return entry.data;
	}
	return undefined;
}
