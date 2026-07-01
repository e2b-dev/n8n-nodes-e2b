import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { getOperationHandler } from './actions';
import { getErrorMessage, getTimeoutMs } from './helpers';
import { loadE2B } from './sdk';
import { isOperationForResource, isResource } from './types';

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
		const sdk = await loadE2B();

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
						{ itemIndex },
					);
				}

				const handler = getOperationHandler(rawResource, rawOperation);
				const itemData = await handler({
					executeFunctions: this,
					credentials,
					itemIndex,
					sdk,
					timeoutMs: getTimeoutMs(this, itemIndex),
				});
				returnData.push(...itemData);
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
