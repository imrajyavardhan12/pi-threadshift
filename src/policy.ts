export interface HandoffPolicyInput {
	enabled: boolean;
	percent: number | null | undefined;
	thresholdPercent: number;
	inFlight: boolean;
	hasPendingHandoff: boolean;
	suppressed: boolean;
	hasPendingMessages: boolean;
}

function isThresholdReached(percent: number | null | undefined, thresholdPercent: number): boolean {
	return percent !== null && percent !== undefined && percent >= thresholdPercent;
}

export function shouldPrepareHandoff(input: HandoffPolicyInput): boolean {
	return (
		input.enabled &&
		isThresholdReached(input.percent, input.thresholdPercent) &&
		!input.inFlight &&
		!input.hasPendingHandoff &&
		!input.suppressed &&
		!input.hasPendingMessages
	);
}

export interface ActiveRunGuardInput {
	enabled: boolean;
	percent: number | null | undefined;
	thresholdPercent: number;
	inFlight: boolean;
	hasPendingHandoff: boolean;
	suppressed: boolean;
	pauseRequested: boolean;
	willContinue: boolean;
}

export function shouldPauseActiveRun(input: ActiveRunGuardInput): boolean {
	return (
		input.enabled &&
		isThresholdReached(input.percent, input.thresholdPercent) &&
		!input.inFlight &&
		!input.hasPendingHandoff &&
		!input.suppressed &&
		!input.pauseRequested &&
		input.willContinue
	);
}
