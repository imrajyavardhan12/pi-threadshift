export function encodePathArgument(path: string): string {
	return JSON.stringify(path);
}

export function decodePathArgument(argument: string): string {
	const trimmed = argument.trim();
	if (trimmed.length === 0) throw new Error("Missing handoff path");

	if (trimmed.startsWith('"')) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			throw new Error("Invalid quoted handoff path");
		}
		if (typeof parsed !== "string" || parsed.length === 0) {
			throw new Error("Invalid handoff path");
		}
		return parsed;
	}

	return trimmed;
}
