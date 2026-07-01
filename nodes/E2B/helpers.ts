import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type {
	CommandResult,
	ConnectedSandbox,
	FileInfo,
	SandboxCreateOptions,
	SandboxInfo,
	SnapshotInfo,
	VolumeInfo,
	WriteInfo,
} from './client';

export function asNonEmptyString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getCollectionParameter(
	executeFunctions: IExecuteFunctions,
	name: string,
	itemIndex: number,
): Record<string, unknown> {
	const value = executeFunctions.getNodeParameter(name, itemIndex, {});
	return isRecord(value) ? value : {};
}

export function getRecordString(record: Record<string, unknown>, key: string): string | undefined {
	return asNonEmptyString(record[key]);
}

export function getRecordBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
	return typeof record[key] === 'boolean' ? record[key] : undefined;
}

export function getRecordNumber(record: Record<string, unknown>, key: string): number | undefined {
	const value = record[key];
	const numberValue = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(numberValue) ? numberValue : undefined;
}

export function splitCommaSeparated(value: string | undefined): string[] | undefined {
	if (!value) return undefined;
	const entries = value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	return entries.length > 0 ? entries : undefined;
}

export function quoteShellArg(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

export function parseStringMapParameter(
	executeFunctions: IExecuteFunctions,
	value: unknown,
	displayName: string,
	itemIndex: number,
): Record<string, string> | undefined {
	if (value === undefined || value === null || value === '') return undefined;

	let parsed = value;
	if (typeof value === 'string') {
		try {
			parsed = JSON.parse(value);
		} catch (error) {
			throw new NodeOperationError(
				executeFunctions.getNode(),
				`${displayName} must be valid JSON: ${getErrorMessage(error)}`,
				{ itemIndex },
			);
		}
	}

	if (!isRecord(parsed)) {
		throw new NodeOperationError(executeFunctions.getNode(), `${displayName} must be a JSON object`, {
			itemIndex,
		});
	}

	const output: Record<string, string> = {};
	for (const [key, entryValue] of Object.entries(parsed)) {
		if (entryValue === undefined || entryValue === null) continue;
		if (typeof entryValue === 'object') {
			throw new NodeOperationError(
				executeFunctions.getNode(),
				`${displayName} values must be strings, numbers, or booleans`,
				{ itemIndex },
			);
		}
		output[key] = String(entryValue);
	}

	return Object.keys(output).length > 0 ? output : undefined;
}

export function getTimeoutMs(executeFunctions: IExecuteFunctions, itemIndex: number): number {
	const timeoutSeconds = Number(
		executeFunctions.getNodeParameter('timeoutSeconds', itemIndex, 300),
	);

	if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
		throw new NodeOperationError(executeFunctions.getNode(), 'Timeout must be greater than 0', {
			itemIndex,
		});
	}

	return Math.round(timeoutSeconds * 1000);
}

export function getLimit(executeFunctions: IExecuteFunctions, itemIndex: number): number {
	const limit = Number(executeFunctions.getNodeParameter('limit', itemIndex, 50));

	if (!Number.isInteger(limit) || limit <= 0) {
		throw new NodeOperationError(executeFunctions.getNode(), 'Limit must be a positive integer', {
			itemIndex,
		});
	}

	return limit;
}

export function getPort(executeFunctions: IExecuteFunctions, itemIndex: number): number {
	const port = Number(executeFunctions.getNodeParameter('port', itemIndex, 3000));

	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			'Port must be an integer between 1 and 65535',
			{ itemIndex },
		);
	}

	return port;
}

export function getRequiredStringParameter(
	executeFunctions: IExecuteFunctions,
	name: string,
	displayName: string,
	itemIndex: number,
): string {
	const value = asNonEmptyString(executeFunctions.getNodeParameter(name, itemIndex));
	if (!value) {
		throw new NodeOperationError(executeFunctions.getNode(), `${displayName} is required`, {
			itemIndex,
		});
	}
	return value;
}

export function getSandboxCreateOptions(
	executeFunctions: IExecuteFunctions,
	itemIndex: number,
): SandboxCreateOptions {
	const timeoutMs = getTimeoutMs(executeFunctions, itemIndex);
	const template = asNonEmptyString(executeFunctions.getNodeParameter('template', itemIndex, ''));
	const metadata = parseStringMapParameter(
		executeFunctions,
		executeFunctions.getNodeParameter('metadataJson', itemIndex, ''),
		'Metadata',
		itemIndex,
	);
	const envs = parseStringMapParameter(
		executeFunctions,
		executeFunctions.getNodeParameter('envJson', itemIndex, ''),
		'Environment Variables',
		itemIndex,
	);
	const volumeMounts = parseStringMapParameter(
		executeFunctions,
		executeFunctions.getNodeParameter('volumeMountsJson', itemIndex, ''),
		'Volume Mounts',
		itemIndex,
	);
	const allowInternetAccess =
		executeFunctions.getNodeParameter('allowInternetAccess', itemIndex, true) === true;

	return {
		...(template ? { template } : {}),
		...(metadata ? { metadata } : {}),
		...(envs ? { envs } : {}),
		...(volumeMounts ? { volumeMounts } : {}),
		allowInternetAccess,
		timeoutMs,
	};
}

function toIsoString(value: Date | string | undefined): string | undefined {
	if (value instanceof Date) return value.toISOString();
	return value;
}

export function toSandboxInfoData(info: SandboxInfo, sandboxDomain?: string): IDataObject {
	return {
		sandboxId: info.sandboxId,
		templateId: info.templateId,
		name: info.name,
		state: info.state,
		metadata: info.metadata ?? {},
		startedAt: toIsoString(info.startedAt),
		endAt: toIsoString(info.endAt),
		cpuCount: info.cpuCount,
		memoryMB: info.memoryMB,
		envdVersion: info.envdVersion,
		allowInternetAccess: info.allowInternetAccess,
		network: info.network,
		lifecycle: info.lifecycle,
		volumeMounts: info.volumeMounts ?? [],
		sandboxDomain: sandboxDomain ?? info.sandboxDomain,
	};
}

export function toSnapshotInfoData(info: SnapshotInfo): IDataObject {
	return {
		snapshotId: info.snapshotId,
		names: info.names,
	};
}

export function toFileInfoData(info: FileInfo | WriteInfo): IDataObject {
	return {
		name: info.name,
		type: info.type,
		path: info.path,
		metadata: info.metadata ?? {},
		...('size' in info
			? {
					size: info.size,
					mode: info.mode,
					permissions: info.permissions,
					owner: info.owner,
					group: info.group,
					modifiedTime: toIsoString(info.modifiedTime),
					symlinkTarget: info.symlinkTarget,
				}
			: {}),
	};
}

export function toVolumeInfoData(info: VolumeInfo): IDataObject {
	return {
		volumeId: info.volumeId,
		name: info.name,
		...(info.token ? { token: info.token } : {}),
	};
}

export function toCommandResultData(
	result: CommandResult,
	sandbox: ConnectedSandbox,
	command: string,
	startedAt: number,
	createdSandbox: boolean,
	killedAfterRun: boolean,
): IDataObject {
	return {
		sandboxId: sandbox.sandboxId,
		sandboxDomain: sandbox.sandboxDomain,
		createdSandbox,
		killedAfterRun,
		command,
		success: result.exitCode === 0,
		exitCode: result.exitCode,
		stdout: result.stdout,
		stderr: result.stderr,
		error: result.error,
		executionTimeMs: Date.now() - startedAt,
	};
}

export function toOperationCommandResultData(
	result: CommandResult,
	sandboxId: string,
	operation: string,
	startedAt: number,
	extra: IDataObject = {},
): IDataObject {
	return {
		sandboxId,
		operation,
		success: result.exitCode === 0,
		exitCode: result.exitCode,
		stdout: result.stdout,
		stderr: result.stderr,
		error: result.error,
		executionTimeMs: Date.now() - startedAt,
		...extra,
	};
}
