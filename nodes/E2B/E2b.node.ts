import type {
	CommandResult as E2BCommandResult,
	EntryInfo as E2BEntryInfo,
	GitCloneOpts,
	GitCommitOpts,
	GitPullOpts,
	GitPushOpts,
	GitRequestOpts,
	Sandbox as E2BSandboxInstance,
	SandboxApiOpts,
	SandboxConnectOpts,
	SandboxInfo as E2BSandboxInfo,
	SandboxOpts,
	SnapshotInfo as E2BSnapshotInfo,
	VolumeAndToken as E2BVolumeAndToken,
	VolumeInfo as E2BVolumeInfo,
	WriteInfo as E2BWriteInfo,
} from 'e2b';
import type * as E2BSDK from 'e2b';
import type {
	ICredentialDataDecryptedObject,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

type E2BModule = typeof E2BSDK;

type Resource = 'code' | 'file' | 'git' | 'sandbox' | 'snapshot' | 'volume';

type Operation =
	| 'add'
	| 'checkout'
	| 'clone'
	| 'commit'
	| 'createFolder'
	| 'create'
	| 'delete'
	| 'download'
	| 'get'
	| 'getMany'
	| 'getPreviewUrl'
	| 'info'
	| 'kill'
	| 'list'
	| 'move'
	| 'pause'
	| 'pull'
	| 'push'
	| 'read'
	| 'runCommand'
	| 'status'
	| 'upload'
	| 'write';

const RESOURCE_OPERATIONS: Readonly<Record<Resource, readonly Operation[]>> = {
	code: ['runCommand'],
	file: ['createFolder', 'delete', 'download', 'info', 'list', 'move', 'read', 'upload', 'write'],
	git: ['add', 'checkout', 'clone', 'commit', 'pull', 'push', 'status'],
	sandbox: ['create', 'get', 'getMany', 'getPreviewUrl', 'kill', 'pause'],
	snapshot: ['create', 'delete', 'getMany'],
	volume: ['create', 'delete', 'get', 'getMany'],
};

let e2bModule: E2BModule | undefined;

async function loadE2B(): Promise<E2BModule> {
	e2bModule ??= await import('e2b');
	return e2bModule;
}

function isResource(value: unknown): value is Resource {
	return (
		value === 'code' ||
		value === 'file' ||
		value === 'git' ||
		value === 'sandbox' ||
		value === 'snapshot' ||
		value === 'volume'
	);
}

function isOperationForResource(resource: Resource, value: unknown): value is Operation {
	return (
		typeof value === 'string' &&
		RESOURCE_OPERATIONS[resource].some((operation) => operation === value)
	);
}

function asNonEmptyString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function getCredentialString(
	credentials: ICredentialDataDecryptedObject,
	key: string,
): string | undefined {
	return asNonEmptyString(credentials[key]);
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getCollectionParameter(
	executeFunctions: IExecuteFunctions,
	name: string,
	itemIndex: number,
): Record<string, unknown> {
	const value = executeFunctions.getNodeParameter(name, itemIndex, {});
	return isRecord(value) ? value : {};
}

function getRecordString(record: Record<string, unknown>, key: string): string | undefined {
	return asNonEmptyString(record[key]);
}

function getRecordBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
	return typeof record[key] === 'boolean' ? record[key] : undefined;
}

function getRecordNumber(record: Record<string, unknown>, key: string): number | undefined {
	const value = record[key];
	const numberValue = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(numberValue) ? numberValue : undefined;
}

function splitCommaSeparated(value: string | undefined): string[] | undefined {
	if (!value) return undefined;
	const entries = value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	return entries.length > 0 ? entries : undefined;
}

function quoteShellArg(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function parseStringMapParameter(
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

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			`${displayName} must be a JSON object`,
			{
				itemIndex,
			},
		);
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

function getTimeoutMs(executeFunctions: IExecuteFunctions, itemIndex: number): number {
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

function getLimit(executeFunctions: IExecuteFunctions, itemIndex: number): number {
	const limit = Number(executeFunctions.getNodeParameter('limit', itemIndex, 50));

	if (!Number.isInteger(limit) || limit <= 0) {
		throw new NodeOperationError(executeFunctions.getNode(), 'Limit must be a positive integer', {
			itemIndex,
		});
	}

	return limit;
}

function getPort(executeFunctions: IExecuteFunctions, itemIndex: number): number {
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

function getRequiredStringParameter(
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

function buildBaseConnectionOpts(
	credentials: ICredentialDataDecryptedObject,
	timeoutMs: number,
): SandboxOpts {
	const apiKey = getCredentialString(credentials, 'apiKey');
	const apiUrl = getCredentialString(credentials, 'apiUrl');
	const domain = getCredentialString(credentials, 'domain');
	const sandboxUrl = getCredentialString(credentials, 'sandboxUrl');

	return {
		...(apiKey ? { apiKey } : {}),
		...(apiUrl ? { apiUrl } : {}),
		...(domain ? { domain } : {}),
		...(sandboxUrl ? { sandboxUrl } : {}),
		requestTimeoutMs: timeoutMs,
	};
}

function buildApiOpts(
	credentials: ICredentialDataDecryptedObject,
	timeoutMs: number,
): SandboxApiOpts {
	const apiKey = getCredentialString(credentials, 'apiKey');
	const domain = getCredentialString(credentials, 'domain');

	return {
		...(apiKey ? { apiKey } : {}),
		...(domain ? { domain } : {}),
		requestTimeoutMs: timeoutMs,
	};
}

function buildConnectOpts(
	credentials: ICredentialDataDecryptedObject,
	timeoutMs: number,
): SandboxConnectOpts {
	return {
		...buildBaseConnectionOpts(credentials, timeoutMs),
		timeoutMs,
	};
}

function getCreateOpts(
	executeFunctions: IExecuteFunctions,
	credentials: ICredentialDataDecryptedObject,
	itemIndex: number,
): SandboxOpts {
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
		...buildBaseConnectionOpts(credentials, timeoutMs),
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

function toSandboxInfoData(info: E2BSandboxInfo, sandboxDomain?: string): IDataObject {
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

function toSnapshotInfoData(info: E2BSnapshotInfo): IDataObject {
	return {
		snapshotId: info.snapshotId,
		names: info.names,
	};
}

function toFileInfoData(info: E2BEntryInfo | E2BWriteInfo): IDataObject {
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

function toVolumeInfoData(info: E2BVolumeInfo | E2BVolumeAndToken): IDataObject {
	return {
		volumeId: info.volumeId,
		name: info.name,
		...('token' in info ? { token: info.token } : {}),
	};
}

function toCommandResultData(
	result: E2BCommandResult,
	sandbox: E2BSandboxInstance,
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
		executionTimeMs: Date.now() - startedAt,
	};
}

function toOperationCommandResultData(
	result: E2BCommandResult,
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
		executionTimeMs: Date.now() - startedAt,
		...extra,
	};
}

async function resolveCommandResult(
	executeFunctions: IExecuteFunctions,
	itemIndex: number,
	commandExitErrorClass: typeof E2BSDK.CommandExitError,
	action: () => Promise<E2BCommandResult>,
): Promise<E2BCommandResult> {
	try {
		return await action();
	} catch (error) {
		if (error instanceof commandExitErrorClass) return error;
		throw new NodeOperationError(executeFunctions.getNode(), getErrorMessage(error), {
			itemIndex,
		});
	}
}

export class E2b implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'E2B',
		name: 'e2b',
		icon: {
			light: 'file:e2b.svg',
			dark: 'file:e2b.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
		description: 'Run commands and manage E2B sandboxes and snapshots',
		defaults: {
			name: 'E2B',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'e2bApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
						{
							name: 'Code',
							value: 'code',
						},
						{
							name: 'File',
							value: 'file',
						},
						{
							name: 'Git',
							value: 'git',
						},
						{
							name: 'Sandbox',
							value: 'sandbox',
						},
						{
							name: 'Snapshot',
							value: 'snapshot',
						},
						{
							name: 'Volume',
							value: 'volume',
						},
					],
					default: 'code',
				},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['code'],
					},
				},
				options: [
					{
						name: 'Run Command',
						value: 'runCommand',
						action: 'Run a command in a sandbox',
						description:
							'Run a shell command in an existing sandbox, or create a temporary sandbox for this execution',
					},
				],
				default: 'runCommand',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['file'],
					},
				},
				options: [
					{
						name: 'Create Folder',
						value: 'createFolder',
						action: 'Create a folder in a sandbox',
						description: 'Create a directory inside an E2B sandbox',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a file or folder in a sandbox',
						description: 'Delete a file or directory inside an E2B sandbox',
					},
					{
						name: 'Download',
						value: 'download',
						action: 'Download a file from a sandbox',
						description: 'Read a sandbox file and return it as binary data',
					},
					{
						name: 'Get Info',
						value: 'info',
						action: 'Get file info in a sandbox',
						description: 'Get metadata for a file or directory inside an E2B sandbox',
					},
					{
						name: 'List',
						value: 'list',
						action: 'List files in a sandbox',
						description: 'List files and directories under a sandbox path',
					},
					{
						name: 'Move',
						value: 'move',
						action: 'Move a file or folder in a sandbox',
						description: 'Move or rename a file or directory inside an E2B sandbox',
					},
					{
						name: 'Read',
						value: 'read',
						action: 'Read a text file from a sandbox',
						description: 'Read a sandbox file as text',
					},
					{
						name: 'Upload',
						value: 'upload',
						action: 'Upload a file to a sandbox',
						description: 'Write input binary data to a sandbox file',
					},
					{
						name: 'Write',
						value: 'write',
						action: 'Write text to a sandbox file',
						description: 'Write text content to a file inside an E2B sandbox',
					},
				],
				default: 'write',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['git'],
					},
				},
				options: [
					{
						name: 'Add',
						value: 'add',
						action: 'Stage files in a sandbox repository',
						description: 'Stage files for the next commit',
					},
					{
						name: 'Checkout',
						value: 'checkout',
						action: 'Check out a git ref in a sandbox',
						description: 'Check out a branch, tag, or commit in a sandbox repository',
					},
					{
						name: 'Clone',
						value: 'clone',
						action: 'Clone a repository into a sandbox',
						description: 'Clone a git repository into an E2B sandbox',
					},
					{
						name: 'Commit',
						value: 'commit',
						action: 'Commit staged files in a sandbox repository',
						description: 'Create a git commit from staged changes',
					},
					{
						name: 'Pull',
						value: 'pull',
						action: 'Pull changes in a sandbox repository',
						description: 'Pull changes from the configured remote',
					},
					{
						name: 'Push',
						value: 'push',
						action: 'Push changes from a sandbox repository',
						description: 'Push commits to the configured remote',
					},
					{
						name: 'Status',
						value: 'status',
						action: 'Get git status in a sandbox repository',
						description: 'Return parsed git status for a repository',
					},
				],
				default: 'status',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['sandbox'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						action: 'Create a sandbox',
						description: 'Create a new E2B sandbox',
					},
					{
						name: 'Get',
						value: 'get',
						action: 'Get a sandbox',
						description: 'Retrieve a sandbox by ID',
					},
					{
						name: 'Get Many',
						value: 'getMany',
						action: 'Get many sandboxes',
						description: 'List running E2B sandboxes',
					},
					{
						name: 'Get Preview URL',
						value: 'getPreviewUrl',
						action: 'Get a sandbox preview URL',
						description: 'Get an external URL for a port exposed inside a sandbox',
					},
					{
						name: 'Kill',
						value: 'kill',
						action: 'Kill a sandbox',
						description: 'Kill a sandbox by ID',
					},
					{
						name: 'Pause',
						value: 'pause',
						action: 'Pause a sandbox',
						description: 'Pause a sandbox by ID',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['snapshot'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						action: 'Create a snapshot',
						description: 'Create a snapshot from a sandbox',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a snapshot',
						description: 'Delete a snapshot by ID',
					},
					{
						name: 'Get Many',
						value: 'getMany',
						action: 'Get many snapshots',
						description: 'List E2B snapshots',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['volume'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						action: 'Create a volume',
						description: 'Create a persistent E2B volume',
					},
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a volume',
						description: 'Delete a persistent E2B volume',
					},
					{
						name: 'Get',
						value: 'get',
						action: 'Get a volume',
						description: 'Retrieve a persistent E2B volume by ID',
					},
					{
						name: 'Get Many',
						value: 'getMany',
						action: 'Get many volumes',
						description: 'List persistent E2B volumes',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Sandbox ID',
				name: 'sandboxId',
				type: 'string',
				required: true,
				default: '',
					displayOptions: {
						show: {
							resource: ['sandbox'],
							operation: ['get', 'getPreviewUrl', 'kill', 'pause'],
						},
					},
				},
			{
				displayName: 'Sandbox ID',
				name: 'sandboxId',
				type: 'string',
				required: true,
				default: '',
				description: 'Source sandbox ID to snapshot',
				displayOptions: {
					show: {
						resource: ['snapshot'],
						operation: ['create'],
					},
				},
			},
			{
				displayName: 'Snapshot ID',
				name: 'snapshotId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['snapshot'],
						operation: ['delete'],
					},
				},
			},
			{
				displayName: 'Sandbox ID',
				name: 'sandboxId',
				type: 'string',
				default: '',
				description: 'Existing sandbox ID. Leave empty to create a sandbox for this command.',
				displayOptions: {
					show: {
						resource: ['code'],
						operation: ['runCommand'],
					},
				},
			},
			{
				displayName: 'Sandbox ID',
				name: 'sandboxId',
				type: 'string',
				default: '',
				description: 'Optional source sandbox ID to filter snapshots by',
				displayOptions: {
					show: {
						resource: ['snapshot'],
						operation: ['getMany'],
						},
					},
				},
				{
					displayName: 'Sandbox ID',
					name: 'sandboxId',
					type: 'string',
					required: true,
					default: '',
					description: 'ID of the sandbox to work with',
					displayOptions: {
						show: {
							resource: ['file', 'git'],
						},
					},
				},
				{
					displayName: 'Port',
					name: 'port',
					type: 'number',
					required: true,
					default: 3000,
					typeOptions: {
						minValue: 1,
						maxValue: 65535,
					},
					description: 'Port inside the sandbox to expose',
					displayOptions: {
						show: {
							resource: ['sandbox'],
							operation: ['getPreviewUrl'],
						},
					},
				},
				{
					displayName: 'Path',
					name: 'path',
					type: 'string',
					required: true,
					default: '',
					placeholder: '/home/user/project',
					description: 'Path inside the sandbox',
					displayOptions: {
						show: {
							resource: ['file'],
							operation: ['createFolder', 'delete', 'info', 'list', 'read', 'write'],
						},
					},
				},
				{
					displayName: 'Remote Path',
					name: 'remotePath',
					type: 'string',
					required: true,
					default: '',
					placeholder: '/home/user/file.txt',
					description: 'File path inside the sandbox',
					displayOptions: {
						show: {
							resource: ['file'],
							operation: ['download', 'upload'],
						},
					},
				},
				{
					displayName: 'Content',
					name: 'content',
					type: 'string',
					required: true,
					default: '',
					typeOptions: {
						rows: 8,
					},
					description: 'Text content to write to the sandbox file',
					displayOptions: {
						show: {
							resource: ['file'],
							operation: ['write'],
						},
					},
				},
				{
					displayName: 'Source',
					name: 'source',
					type: 'string',
					required: true,
					default: '',
					placeholder: '/home/user/old-name.txt',
					description: 'Source path inside the sandbox',
					displayOptions: {
						show: {
							resource: ['file'],
							operation: ['move'],
						},
					},
				},
				{
					displayName: 'Destination',
					name: 'destination',
					type: 'string',
					required: true,
					default: '',
					placeholder: '/home/user/new-name.txt',
					description: 'Destination path inside the sandbox',
					displayOptions: {
						show: {
							resource: ['file'],
							operation: ['move'],
						},
					},
				},
							{
								displayName: 'Depth',
								name: 'depth',
								type: 'number',
					typeOptions: {
						minValue: 1,
					},
					default: 1,
					description: 'Directory depth to list',
					displayOptions: {
						show: {
							resource: ['file'],
							operation: ['list'],
						},
					},
				},
				{
					displayName: 'Binary Field',
					name: 'binaryPropertyName',
					type: 'string',
					required: true,
					default: 'data',
					description: 'Name of the binary field to read from or write to',
					displayOptions: {
						show: {
							resource: ['file'],
							operation: ['download', 'upload'],
						},
					},
				},
				{
					displayName: 'Repository URL',
					name: 'repositoryUrl',
					type: 'string',
					required: true,
					default: '',
					placeholder: 'https://github.com/owner/repo.git',
					description: 'Git repository URL to clone',
					displayOptions: {
						show: {
							resource: ['git'],
							operation: ['clone'],
						},
					},
				},
				{
					displayName: 'Repository Path',
					name: 'repositoryPath',
					type: 'string',
					required: true,
					default: '',
					placeholder: '/home/user/repo',
					description: 'Path to the git repository inside the sandbox',
					displayOptions: {
						show: {
							resource: ['git'],
						},
					},
				},
				{
					displayName: 'Files',
					name: 'files',
					type: 'string',
					default: '.',
					placeholder: '. or README.md,src/index.ts',
					description: 'Comma-separated list of files to stage. Use "." to stage all changes.',
					displayOptions: {
						show: {
							resource: ['git'],
							operation: ['add'],
						},
					},
				},
				{
					displayName: 'Git Ref',
					name: 'gitRef',
					type: 'string',
					required: true,
					default: '',
					placeholder: 'main, feature/new-thing, or a commit SHA',
					description: 'Branch, tag, or commit SHA to check out',
					displayOptions: {
						show: {
							resource: ['git'],
							operation: ['checkout'],
						},
					},
				},
				{
					displayName: 'Message',
					name: 'message',
					type: 'string',
					required: true,
					default: '',
					typeOptions: {
						rows: 3,
					},
					description: 'Commit message',
					displayOptions: {
						show: {
							resource: ['git'],
							operation: ['commit'],
						},
					},
				},
				{
					displayName: 'Author Name',
					name: 'authorName',
					type: 'string',
					default: '',
					description: 'Optional commit author name',
					displayOptions: {
						show: {
							resource: ['git'],
							operation: ['commit'],
						},
					},
				},
				{
					displayName: 'Author Email',
					name: 'authorEmail',
					type: 'string',
					default: '',
					description: 'Optional commit author email',
					displayOptions: {
						show: {
							resource: ['git'],
							operation: ['commit'],
						},
					},
				},
				{
					displayName: 'Clone Options',
					name: 'cloneOptions',
					type: 'collection',
					placeholder: 'Add Option',
					default: {},
					displayOptions: {
						show: {
							resource: ['git'],
							operation: ['clone'],
						},
					},
					options: [
						{
							displayName: 'Branch',
							name: 'branch',
							type: 'string',
							default: '',
							description: 'Branch to check out after cloning',
						},
						{
							displayName: 'Commit ID',
							name: 'commitId',
							type: 'string',
							default: '',
							description: 'Commit SHA to check out after cloning',
						},
						{
							displayName: 'Depth',
							name: 'depth',
							type: 'number',
							typeOptions: {
								minValue: 1,
							},
								default: 1,
								description: 'Shallow clone depth',
							},
							{
								displayName: 'Password or Token',
								name: 'password',
								type: 'string',
							typeOptions: {
								password: true,
							},
							default: '',
							description: 'HTTPS password or personal access token',
						},
						{
							displayName: 'Store Credentials in Repository',
							name: 'dangerouslyStoreCredentials',
							type: 'boolean',
								default: false,
								description: 'Whether to persist clone credentials in the repository config',
							},
							{
								displayName: 'Username',
								name: 'username',
								type: 'string',
								default: '',
								description: 'HTTPS username for private repositories',
							},
						],
					},
				{
					displayName: 'Remote Options',
					name: 'remoteOptions',
					type: 'collection',
					placeholder: 'Add Option',
					default: {},
					displayOptions: {
						show: {
							resource: ['git'],
							operation: ['pull', 'push'],
						},
					},
					options: [
						{
							displayName: 'Branch',
							name: 'branch',
							type: 'string',
							default: '',
							description: 'Branch name to pull or push',
						},
						{
							displayName: 'Password or Token',
							name: 'password',
							type: 'string',
							typeOptions: {
								password: true,
							},
							default: '',
							description: 'HTTPS password or personal access token for the remote',
						},
						{
							displayName: 'Remote',
							name: 'remote',
							type: 'string',
							default: '',
							description: 'Remote name, for example origin',
						},
						{
							displayName: 'Set Upstream',
							name: 'setUpstream',
							type: 'boolean',
							default: false,
							description: 'Whether to set upstream tracking when pushing',
							displayOptions: {
								show: {
									'/operation': ['push'],
								},
							},
						},
						{
							displayName: 'Username',
							name: 'username',
							type: 'string',
							default: '',
							description: 'HTTPS username for the remote',
						},
					],
				},
				{
					displayName: 'Commit Options',
					name: 'commitOptions',
					type: 'collection',
					placeholder: 'Add Option',
					default: {},
					displayOptions: {
						show: {
							resource: ['git'],
							operation: ['commit'],
						},
					},
					options: [
						{
							displayName: 'Allow Empty Commit',
							name: 'allowEmpty',
							type: 'boolean',
							default: false,
							description: 'Whether to create a commit when no files are staged',
						},
					],
				},
				{
					displayName: 'Volume Name',
					name: 'volumeName',
					type: 'string',
					required: true,
					default: '',
					description: 'Name for the new volume',
					displayOptions: {
						show: {
							resource: ['volume'],
							operation: ['create'],
						},
					},
				},
				{
					displayName: 'Volume ID',
					name: 'volumeId',
					type: 'string',
					required: true,
					default: '',
					description: 'ID of the volume',
					displayOptions: {
						show: {
							resource: ['volume'],
							operation: ['get', 'delete'],
						},
					},
				},
				{
					displayName: 'Command',
				name: 'command',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'python -c "print(1 + 1)"',
				typeOptions: {
					rows: 4,
				},
				displayOptions: {
					show: {
						resource: ['code'],
						operation: ['runCommand'],
					},
				},
			},
			{
				displayName: 'Working Directory',
				name: 'cwd',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['code'],
						operation: ['runCommand'],
					},
				},
			},
			{
				displayName: 'Template or Snapshot ID',
				name: 'template',
				type: 'string',
				default: '',
				description:
					'E2B template name/ID or snapshot ID. Leave empty to use the default E2B sandbox template.',
				displayOptions: {
					show: {
						resource: ['sandbox', 'code'],
						operation: ['create', 'runCommand'],
					},
				},
			},
			{
				displayName: 'Snapshot Name',
				name: 'snapshotName',
				type: 'string',
				default: '',
				description: 'Optional name for the snapshot template',
				displayOptions: {
					show: {
						resource: ['snapshot'],
						operation: ['create'],
					},
				},
			},
			{
				displayName: 'Metadata',
				name: 'metadataJson',
				type: 'json',
				default: '{}',
				description: 'Metadata to attach when creating a sandbox',
				displayOptions: {
					show: {
						resource: ['sandbox', 'code'],
						operation: ['create', 'runCommand'],
					},
				},
			},
			{
				displayName: 'Environment Variables',
				name: 'envJson',
				type: 'json',
				default: '{}',
				description: 'Environment variables to set for the sandbox or command',
				displayOptions: {
					show: {
						resource: ['sandbox', 'code'],
						operation: ['create', 'runCommand'],
					},
				},
			},
				{
					displayName: 'Allow Internet Access',
					name: 'allowInternetAccess',
					type: 'boolean',
					default: true,
				displayOptions: {
					show: {
						resource: ['sandbox', 'code'],
						operation: ['create', 'runCommand'],
						},
					},
				},
				{
					displayName: 'Volume Mounts',
					name: 'volumeMountsJson',
					type: 'json',
					default: '{}',
					description:
						'JSON object mapping sandbox mount paths to E2B volume names, for example {"\\/data":"my-volume"}',
					displayOptions: {
						show: {
							resource: ['sandbox', 'code'],
							operation: ['create', 'runCommand'],
						},
					},
				},
				{
					displayName: 'Kill Sandbox After Run',
					name: 'killAfterRun',
					type: 'boolean',
				default: false,
				description: 'Whether to kill the sandbox after running the command',
				displayOptions: {
					show: {
						resource: ['code'],
						operation: ['runCommand'],
					},
				},
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				description: 'Max number of results to return',
					displayOptions: {
						show: {
							resource: ['sandbox', 'snapshot', 'volume'],
							operation: ['getMany'],
						},
					},
				},
			{
				displayName: 'Timeout',
				name: 'timeoutSeconds',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 300,
				description: 'Timeout in seconds for the E2B operation',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const credentials = await this.getCredentials('e2bApi');
		const returnData: INodeExecutionData[] = [];
		const { Sandbox, CommandExitError, Volume } = await loadE2B();

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const rawResource = this.getNodeParameter('resource', itemIndex);
				if (!isResource(rawResource)) {
					throw new NodeOperationError(this.getNode(), `The resource "${rawResource}" is not known`, {
						itemIndex,
					});
				}

				const rawOperation = this.getNodeParameter('operation', itemIndex);
				if (!isOperationForResource(rawResource, rawOperation)) {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${rawOperation}" is not known for resource "${rawResource}"`,
						{
							itemIndex,
						},
					);
				}

				const operationKey = `${rawResource}.${rawOperation}`;
				const timeoutMs = getTimeoutMs(this, itemIndex);

				if (operationKey === 'sandbox.create') {
					const sandbox = await Sandbox.create(getCreateOpts(this, credentials, itemIndex));
					const info = await sandbox.getInfo(buildApiOpts(credentials, timeoutMs));
					returnData.push({
						json: toSandboxInfoData(info, sandbox.sandboxDomain),
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (operationKey === 'sandbox.getMany') {
					const paginator = Sandbox.list({
						...buildApiOpts(credentials, timeoutMs),
						limit: getLimit(this, itemIndex),
					});
					const sandboxes = await paginator.nextItems();
					for (const sandbox of sandboxes) {
						returnData.push({
							json: toSandboxInfoData(sandbox),
							pairedItem: { item: itemIndex },
						});
					}
					continue;
				}

				if (operationKey === 'sandbox.getPreviewUrl') {
					const sandboxId = getRequiredStringParameter(this, 'sandboxId', 'Sandbox ID', itemIndex);
					const port = getPort(this, itemIndex);
					const sandbox = await Sandbox.connect(sandboxId, buildConnectOpts(credentials, timeoutMs));
					const host = sandbox.getHost(port);
					returnData.push({
						json: {
							sandboxId,
							port,
							host,
							url: `https://${host}`,
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (operationKey === 'volume.create') {
					const name = getRequiredStringParameter(this, 'volumeName', 'Volume Name', itemIndex);
					const volume = await Volume.create(name, buildBaseConnectionOpts(credentials, timeoutMs));
					returnData.push({
						json: toVolumeInfoData(volume),
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (operationKey === 'volume.get') {
					const volumeId = getRequiredStringParameter(this, 'volumeId', 'Volume ID', itemIndex);
					const volume = await Volume.getInfo(volumeId, buildBaseConnectionOpts(credentials, timeoutMs));
					returnData.push({
						json: toVolumeInfoData(volume),
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (operationKey === 'volume.getMany') {
					const volumes = await Volume.list(buildBaseConnectionOpts(credentials, timeoutMs));
					for (const volume of volumes.slice(0, getLimit(this, itemIndex))) {
						returnData.push({
							json: toVolumeInfoData(volume),
							pairedItem: { item: itemIndex },
						});
					}
					continue;
				}

				if (operationKey === 'volume.delete') {
					const volumeId = getRequiredStringParameter(this, 'volumeId', 'Volume ID', itemIndex);
					const deleted = await Volume.destroy(volumeId, buildBaseConnectionOpts(credentials, timeoutMs));
					returnData.push({
						json: {
							volumeId,
							deleted,
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (operationKey === 'snapshot.create') {
					const sandboxId = getRequiredStringParameter(this, 'sandboxId', 'Sandbox ID', itemIndex);
					const snapshotName = asNonEmptyString(
						this.getNodeParameter('snapshotName', itemIndex, ''),
					);
					const snapshot = await Sandbox.createSnapshot(sandboxId, {
						...buildApiOpts(credentials, timeoutMs),
						...(snapshotName ? { name: snapshotName } : {}),
					});
					returnData.push({
						json: toSnapshotInfoData(snapshot),
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (operationKey === 'snapshot.getMany') {
					const sandboxId = asNonEmptyString(this.getNodeParameter('sandboxId', itemIndex, ''));
					const paginator = Sandbox.listSnapshots({
						...buildApiOpts(credentials, timeoutMs),
						...(sandboxId ? { sandboxId } : {}),
						limit: getLimit(this, itemIndex),
					});
					const snapshots = await paginator.nextItems();
					for (const snapshot of snapshots) {
						returnData.push({
							json: toSnapshotInfoData(snapshot),
							pairedItem: { item: itemIndex },
						});
					}
					continue;
				}

				if (operationKey === 'snapshot.delete') {
					const snapshotId = getRequiredStringParameter(
						this,
						'snapshotId',
						'Snapshot ID',
						itemIndex,
					);
					const deleted = await Sandbox.deleteSnapshot(snapshotId, buildApiOpts(credentials, timeoutMs));
					returnData.push({
						json: {
							snapshotId,
							deleted,
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (operationKey === 'sandbox.get') {
					const sandboxId = getRequiredStringParameter(this, 'sandboxId', 'Sandbox ID', itemIndex);
					const info = await Sandbox.getInfo(sandboxId, buildApiOpts(credentials, timeoutMs));
					returnData.push({
						json: toSandboxInfoData(info),
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (operationKey === 'sandbox.pause') {
					const sandboxId = getRequiredStringParameter(this, 'sandboxId', 'Sandbox ID', itemIndex);
					await Sandbox.pause(sandboxId, buildApiOpts(credentials, timeoutMs));
					returnData.push({
						json: {
							sandboxId,
							paused: true,
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (operationKey === 'sandbox.kill') {
					const sandboxId = getRequiredStringParameter(this, 'sandboxId', 'Sandbox ID', itemIndex);
					await Sandbox.kill(sandboxId, buildApiOpts(credentials, timeoutMs));
					returnData.push({
						json: {
							sandboxId,
							killed: true,
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (rawResource === 'file') {
					const sandboxId = getRequiredStringParameter(this, 'sandboxId', 'Sandbox ID', itemIndex);
					const sandbox = await Sandbox.connect(sandboxId, buildConnectOpts(credentials, timeoutMs));

					if (operationKey === 'file.createFolder') {
						const path = getRequiredStringParameter(this, 'path', 'Path', itemIndex);
						const created = await sandbox.files.makeDir(path, { requestTimeoutMs: timeoutMs });
						returnData.push({
							json: {
								sandboxId,
								path,
								created,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (operationKey === 'file.delete') {
						const path = getRequiredStringParameter(this, 'path', 'Path', itemIndex);
						await sandbox.files.remove(path, { requestTimeoutMs: timeoutMs });
						returnData.push({
							json: {
								sandboxId,
								path,
								deleted: true,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (operationKey === 'file.download') {
						const remotePath = getRequiredStringParameter(this, 'remotePath', 'Remote Path', itemIndex);
						const binaryPropertyName = getRequiredStringParameter(
							this,
							'binaryPropertyName',
							'Binary Field',
							itemIndex,
						);
						const content = await sandbox.files.read(remotePath, {
							format: 'bytes',
							requestTimeoutMs: timeoutMs,
						});
						const filename = remotePath.split('/').pop()?.trim() || 'download';
						const binaryData = await this.helpers.prepareBinaryData(
							Buffer.from(content),
							filename,
							'application/octet-stream',
						);
						returnData.push({
							json: {
								sandboxId,
								remotePath,
								fileName: filename,
								sizeBytes: content.byteLength,
							},
							binary: {
								[binaryPropertyName]: binaryData,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (operationKey === 'file.info') {
						const path = getRequiredStringParameter(this, 'path', 'Path', itemIndex);
						const info = await sandbox.files.getInfo(path, { requestTimeoutMs: timeoutMs });
						returnData.push({
							json: {
								sandboxId,
								...toFileInfoData(info),
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (operationKey === 'file.list') {
						const path = getRequiredStringParameter(this, 'path', 'Path', itemIndex);
						const depth = Number(this.getNodeParameter('depth', itemIndex, 1));
						const entries = await sandbox.files.list(path, {
							depth: Number.isInteger(depth) && depth > 0 ? depth : 1,
							requestTimeoutMs: timeoutMs,
						});
						returnData.push({
							json: {
								sandboxId,
								path,
								count: entries.length,
								files: entries.map(toFileInfoData),
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (operationKey === 'file.move') {
						const source = getRequiredStringParameter(this, 'source', 'Source', itemIndex);
						const destination = getRequiredStringParameter(
							this,
							'destination',
							'Destination',
							itemIndex,
						);
						const info = await sandbox.files.rename(source, destination, {
							requestTimeoutMs: timeoutMs,
						});
						returnData.push({
							json: {
								sandboxId,
								source,
								destination,
								...toFileInfoData(info),
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (operationKey === 'file.read') {
						const path = getRequiredStringParameter(this, 'path', 'Path', itemIndex);
						const content = await sandbox.files.read(path, {
							format: 'text',
							requestTimeoutMs: timeoutMs,
						});
						returnData.push({
							json: {
								sandboxId,
								path,
								content,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (operationKey === 'file.upload') {
						const remotePath = getRequiredStringParameter(this, 'remotePath', 'Remote Path', itemIndex);
						const binaryPropertyName = getRequiredStringParameter(
							this,
							'binaryPropertyName',
							'Binary Field',
							itemIndex,
						);
						const binaryMeta = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
						const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
						const content = new Uint8Array(buffer).buffer;
						const info = await sandbox.files.write(remotePath, content, {
							requestTimeoutMs: timeoutMs,
						});
						returnData.push({
							json: {
								sandboxId,
								remotePath,
								fileName: binaryMeta.fileName,
								mimeType: binaryMeta.mimeType,
								sizeBytes: buffer.length,
								...toFileInfoData(info),
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (operationKey === 'file.write') {
						const path = getRequiredStringParameter(this, 'path', 'Path', itemIndex);
						const content = this.getNodeParameter('content', itemIndex, '');
						const info = await sandbox.files.write(path, String(content), {
							requestTimeoutMs: timeoutMs,
						});
						returnData.push({
							json: {
								sandboxId,
								contentLength: String(content).length,
								...toFileInfoData(info),
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}
				}

				if (rawResource === 'git') {
					const sandboxId = getRequiredStringParameter(this, 'sandboxId', 'Sandbox ID', itemIndex);
					const repositoryPath = getRequiredStringParameter(
						this,
						'repositoryPath',
						'Repository Path',
						itemIndex,
					);
					const sandbox = await Sandbox.connect(sandboxId, buildConnectOpts(credentials, timeoutMs));
					const gitRequestOpts: GitRequestOpts = {
						timeoutMs,
						requestTimeoutMs: timeoutMs,
					};
					const startedAt = Date.now();

					if (operationKey === 'git.status') {
						const status = await sandbox.git.status(repositoryPath, gitRequestOpts);
						returnData.push({
							json: {
								sandboxId,
								repositoryPath,
								status,
							},
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (operationKey === 'git.add') {
						const filesRaw = asNonEmptyString(this.getNodeParameter('files', itemIndex, '.'));
						const files = splitCommaSeparated(filesRaw);
						const addAll = !files || (files.length === 1 && files[0] === '.');
						const result = await resolveCommandResult(
							this,
							itemIndex,
							CommandExitError,
							async () =>
								await sandbox.git.add(repositoryPath, {
									...gitRequestOpts,
									...(addAll ? { all: true } : { files }),
								}),
						);
						returnData.push({
							json: toOperationCommandResultData(result, sandboxId, 'git.add', startedAt, {
								repositoryPath,
								files: addAll ? ['.'] : files,
							}),
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (operationKey === 'git.checkout') {
						const gitRef = getRequiredStringParameter(this, 'gitRef', 'Git Ref', itemIndex);
						const result = await resolveCommandResult(
							this,
							itemIndex,
							CommandExitError,
							async () =>
								await sandbox.commands.run(
									`git -C ${quoteShellArg(repositoryPath)} checkout ${quoteShellArg(gitRef)}`,
									gitRequestOpts,
								),
						);
						returnData.push({
							json: toOperationCommandResultData(result, sandboxId, 'git.checkout', startedAt, {
								repositoryPath,
								gitRef,
							}),
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (operationKey === 'git.clone') {
						const repositoryUrl = getRequiredStringParameter(
							this,
							'repositoryUrl',
							'Repository URL',
							itemIndex,
						);
						const cloneOptions = getCollectionParameter(this, 'cloneOptions', itemIndex);
						const commitId = getRecordString(cloneOptions, 'commitId');
						const cloneOpts: GitCloneOpts = {
							...gitRequestOpts,
							path: repositoryPath,
							...(getRecordString(cloneOptions, 'branch')
								? { branch: getRecordString(cloneOptions, 'branch') }
								: {}),
							...(getRecordNumber(cloneOptions, 'depth')
								? { depth: getRecordNumber(cloneOptions, 'depth') }
								: {}),
							...(getRecordString(cloneOptions, 'username')
								? { username: getRecordString(cloneOptions, 'username') }
								: {}),
							...(getRecordString(cloneOptions, 'password')
								? { password: getRecordString(cloneOptions, 'password') }
								: {}),
							...(getRecordBoolean(cloneOptions, 'dangerouslyStoreCredentials') === true
								? { dangerouslyStoreCredentials: true }
								: {}),
						};
						const result = await resolveCommandResult(
							this,
							itemIndex,
							CommandExitError,
							async () => await sandbox.git.clone(repositoryUrl, cloneOpts),
						);
						const resultData = toOperationCommandResultData(
							result,
							sandboxId,
							'git.clone',
							startedAt,
							{
								repositoryPath,
								repositoryUrl,
								branch: cloneOpts.branch,
								depth: cloneOpts.depth,
							},
						);
						if (commitId) {
							const checkoutResult = await resolveCommandResult(
								this,
								itemIndex,
								CommandExitError,
								async () =>
									await sandbox.commands.run(
										`git -C ${quoteShellArg(repositoryPath)} checkout ${quoteShellArg(commitId)}`,
										gitRequestOpts,
									),
							);
							resultData.checkout = {
								success: checkoutResult.exitCode === 0,
								exitCode: checkoutResult.exitCode,
								stdout: checkoutResult.stdout,
								stderr: checkoutResult.stderr,
								commitId,
							};
							resultData.success =
								result.exitCode === 0 && checkoutResult.exitCode === 0;
						}
						returnData.push({
							json: resultData,
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (operationKey === 'git.commit') {
						const message = getRequiredStringParameter(this, 'message', 'Message', itemIndex);
						const commitOptions = getCollectionParameter(this, 'commitOptions', itemIndex);
						const commitOpts: GitCommitOpts = {
							...gitRequestOpts,
							...(asNonEmptyString(this.getNodeParameter('authorName', itemIndex, ''))
								? { authorName: asNonEmptyString(this.getNodeParameter('authorName', itemIndex, '')) }
								: {}),
							...(asNonEmptyString(this.getNodeParameter('authorEmail', itemIndex, ''))
								? {
										authorEmail: asNonEmptyString(
											this.getNodeParameter('authorEmail', itemIndex, ''),
										),
									}
								: {}),
							...(getRecordBoolean(commitOptions, 'allowEmpty') === true
								? { allowEmpty: true }
								: {}),
						};
						const result = await resolveCommandResult(
							this,
							itemIndex,
							CommandExitError,
							async () => await sandbox.git.commit(repositoryPath, message, commitOpts),
						);
						returnData.push({
							json: toOperationCommandResultData(result, sandboxId, 'git.commit', startedAt, {
								repositoryPath,
								message,
								authorName: commitOpts.authorName,
								authorEmail: commitOpts.authorEmail,
								allowEmpty: commitOpts.allowEmpty,
							}),
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (operationKey === 'git.pull') {
						const remoteOptions = getCollectionParameter(this, 'remoteOptions', itemIndex);
						const pullOpts: GitPullOpts = {
							...gitRequestOpts,
							...(getRecordString(remoteOptions, 'remote')
								? { remote: getRecordString(remoteOptions, 'remote') }
								: {}),
							...(getRecordString(remoteOptions, 'branch')
								? { branch: getRecordString(remoteOptions, 'branch') }
								: {}),
							...(getRecordString(remoteOptions, 'username')
								? { username: getRecordString(remoteOptions, 'username') }
								: {}),
							...(getRecordString(remoteOptions, 'password')
								? { password: getRecordString(remoteOptions, 'password') }
								: {}),
						};
						const result = await resolveCommandResult(
							this,
							itemIndex,
							CommandExitError,
							async () => await sandbox.git.pull(repositoryPath, pullOpts),
						);
						returnData.push({
							json: toOperationCommandResultData(result, sandboxId, 'git.pull', startedAt, {
								repositoryPath,
								remote: pullOpts.remote,
								branch: pullOpts.branch,
							}),
							pairedItem: { item: itemIndex },
						});
						continue;
					}

					if (operationKey === 'git.push') {
						const remoteOptions = getCollectionParameter(this, 'remoteOptions', itemIndex);
						const pushOpts: GitPushOpts = {
							...gitRequestOpts,
							...(getRecordString(remoteOptions, 'remote')
								? { remote: getRecordString(remoteOptions, 'remote') }
								: {}),
							...(getRecordString(remoteOptions, 'branch')
								? { branch: getRecordString(remoteOptions, 'branch') }
								: {}),
							...(getRecordBoolean(remoteOptions, 'setUpstream') === true
								? { setUpstream: true }
								: {}),
							...(getRecordString(remoteOptions, 'username')
								? { username: getRecordString(remoteOptions, 'username') }
								: {}),
							...(getRecordString(remoteOptions, 'password')
								? { password: getRecordString(remoteOptions, 'password') }
								: {}),
						};
						const result = await resolveCommandResult(
							this,
							itemIndex,
							CommandExitError,
							async () => await sandbox.git.push(repositoryPath, pushOpts),
						);
						returnData.push({
							json: toOperationCommandResultData(result, sandboxId, 'git.push', startedAt, {
								repositoryPath,
								remote: pushOpts.remote,
								branch: pushOpts.branch,
								setUpstream: pushOpts.setUpstream,
							}),
							pairedItem: { item: itemIndex },
						});
						continue;
					}
				}

				if (operationKey !== 'code.runCommand') {
					throw new NodeOperationError(this.getNode(), `Operation "${operationKey}" is not implemented`, {
						itemIndex,
					});
				}

				const sandboxId = asNonEmptyString(this.getNodeParameter('sandboxId', itemIndex, ''));
				const command = getRequiredStringParameter(this, 'command', 'Command', itemIndex);
				const cwd = asNonEmptyString(this.getNodeParameter('cwd', itemIndex, ''));
				const killAfterRun = this.getNodeParameter('killAfterRun', itemIndex, false) === true;
				const envs = parseStringMapParameter(
					this,
					this.getNodeParameter('envJson', itemIndex, ''),
					'Environment Variables',
					itemIndex,
				);
				const createdSandbox = !sandboxId;
				const sandbox = sandboxId
					? await Sandbox.connect(sandboxId, buildConnectOpts(credentials, timeoutMs))
					: await Sandbox.create(getCreateOpts(this, credentials, itemIndex));

				let resultData: IDataObject | undefined;
				let executionError: unknown;
				let cleanupError: unknown;
				try {
					const startedAt = Date.now();
					let result: E2BCommandResult;
					try {
						result = await sandbox.commands.run(command, {
							...(cwd ? { cwd } : {}),
							...(envs ? { envs } : {}),
							timeoutMs,
							requestTimeoutMs: timeoutMs,
						});
					} catch (error) {
						if (error instanceof CommandExitError) {
							result = error;
						} else {
							throw new NodeOperationError(this.getNode(), getErrorMessage(error), {
								itemIndex,
							});
						}
					}

					resultData = toCommandResultData(
						result,
						sandbox,
						command,
						startedAt,
						createdSandbox,
						false,
					);
				} catch (error) {
					executionError = error;
				} finally {
					if (killAfterRun) {
						try {
							await sandbox.kill(buildApiOpts(credentials, timeoutMs));
							if (resultData) resultData.killedAfterRun = true;
						} catch (error) {
							cleanupError = error;
							if (resultData) resultData.cleanupError = getErrorMessage(error);
						}
					}
				}

				if (executionError) {
					if (cleanupError) {
						throw new NodeOperationError(
							this.getNode(),
							`E2B command failed and the sandbox could not be killed: ${getErrorMessage(executionError)}; cleanup error: ${getErrorMessage(cleanupError)}`,
							{ itemIndex },
						);
					}
					throw new NodeOperationError(this.getNode(), getErrorMessage(executionError), {
						itemIndex,
					});
				}

				if (cleanupError) {
					throw new NodeOperationError(
						this.getNode(),
						`E2B command succeeded but the sandbox could not be killed: ${getErrorMessage(cleanupError)}`,
						{ itemIndex },
					);
				}

				if (resultData) {
					returnData.push({
						json: resultData,
						pairedItem: { item: itemIndex },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: getErrorMessage(error),
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), getErrorMessage(error), { itemIndex });
			}
		}

		return [returnData];
	}
}
