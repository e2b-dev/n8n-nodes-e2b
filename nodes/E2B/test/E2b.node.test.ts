import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { E2b } from '../E2b.node';

interface MockCommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	error?: string;
}

interface MockSandbox {
	sandboxId: string;
	sandboxDomain: string;
	envdVersion: string;
}

interface MockSandboxInfo {
	sandboxId: string;
	templateId: string;
	name?: string;
	state: 'running' | 'paused';
	metadata: Record<string, string>;
	startedAt: string;
	endAt: string;
	cpuCount: number;
	memoryMB: number;
	envdVersion: string;
}

interface MockSnapshotInfo {
	snapshotId: string;
	names: string[];
}

interface MockFileInfo {
	name: string;
	type: 'file' | 'dir';
	path: string;
	size?: number;
	mode?: number;
	permissions?: string;
	owner?: string;
	group?: string;
	modifiedTime?: string;
}

const e2bClient = vi.hoisted(() => {
	function makeSandbox(sandboxId = 'sb-node'): MockSandbox {
		return {
			sandboxId,
			sandboxDomain: 'e2b.app',
			envdVersion: '0.4.0',
		};
	}

	function makeSandboxInfo(sandboxId = 'sb-node'): MockSandboxInfo {
		return {
			sandboxId,
			templateId: 'base',
			name: 'base',
			state: 'running',
			metadata: {},
			startedAt: '2026-01-01T00:00:00.000Z',
			endAt: '2026-01-01T00:05:00.000Z',
			cpuCount: 2,
			memoryMB: 1024,
			envdVersion: '0.4.0',
		};
	}

	function makeFileInfo(path: string, type: 'file' | 'dir' = 'file'): MockFileInfo {
		return {
			name: path.split('/').pop() || path,
			type,
			path,
			size: type === 'file' ? 12 : 0,
			mode: 0o644,
			permissions: 'rw-r--r--',
			owner: 'user',
			group: 'user',
			modifiedTime: '2026-01-01T00:00:00.000Z',
		};
	}

	const mocks = {
		connectSandbox: vi.fn(),
		createSandbox: vi.fn(),
		createSandboxFolder: vi.fn(),
		createSnapshot: vi.fn(),
		createVolume: vi.fn(),
		deleteSandboxFile: vi.fn(),
		deleteSnapshot: vi.fn(),
		deleteVolume: vi.fn(),
		getPreviewHost: vi.fn(),
		getSandboxFileInfo: vi.fn(),
		getSandboxInfo: vi.fn(),
		getVolume: vi.fn(),
		killSandbox: vi.fn(),
		listSandboxFiles: vi.fn(),
		listSandboxes: vi.fn(),
		listSnapshots: vi.fn(),
		listVolumes: vi.fn(),
		moveSandboxFile: vi.fn(),
		pauseSandbox: vi.fn(),
		readSandboxFile: vi.fn(),
		runSandboxCommand: vi.fn(),
		writeSandboxFile: vi.fn(),
		makeSandbox,
		makeSandboxInfo,
		makeFileInfo,
	};

	function reset(): void {
		for (const value of Object.values(mocks)) {
			if (typeof value === 'function' && 'mockReset' in value) value.mockReset();
		}

		mocks.connectSandbox.mockResolvedValue(makeSandbox());
		mocks.createSandbox.mockResolvedValue(makeSandbox());
		mocks.createSandboxFolder.mockResolvedValue(true);
		mocks.createSnapshot.mockResolvedValue({
			snapshotId: 'snap-node:default',
			names: ['team/snap-node:default'],
		} satisfies MockSnapshotInfo);
		mocks.createVolume.mockResolvedValue({ volumeId: 'vol-node', name: 'my-volume', token: 'token' });
		mocks.deleteSnapshot.mockResolvedValue(true);
		mocks.deleteVolume.mockResolvedValue(true);
		mocks.getPreviewHost.mockReturnValue('3000-sb-preview.e2b.app');
		mocks.getSandboxFileInfo.mockResolvedValue(makeFileInfo('/tmp/app.py'));
		mocks.getSandboxInfo.mockResolvedValue(makeSandboxInfo());
		mocks.getVolume.mockResolvedValue({ volumeId: 'vol-node', name: 'my-volume', token: 'token' });
		mocks.killSandbox.mockResolvedValue(true);
		mocks.listSandboxFiles.mockResolvedValue([makeFileInfo('/tmp/index.ts')]);
		mocks.listSandboxes.mockResolvedValue([]);
		mocks.listSnapshots.mockResolvedValue([]);
		mocks.listVolumes.mockResolvedValue([{ volumeId: 'vol-node', name: 'my-volume' }]);
		mocks.moveSandboxFile.mockResolvedValue(makeFileInfo('/tmp/new-name.txt'));
		mocks.pauseSandbox.mockResolvedValue(true);
		mocks.readSandboxFile.mockResolvedValue('file content');
		mocks.runSandboxCommand.mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' } satisfies MockCommandResult);
		mocks.writeSandboxFile.mockResolvedValue(makeFileInfo('/tmp/app.py'));
	}

	reset();

	return { ...mocks, reset };
});

vi.mock('../client', () => ({
	connectSandbox: e2bClient.connectSandbox,
	createSandbox: e2bClient.createSandbox,
	createSandboxFolder: e2bClient.createSandboxFolder,
	createSnapshot: e2bClient.createSnapshot,
	createVolume: e2bClient.createVolume,
	deleteSandboxFile: e2bClient.deleteSandboxFile,
	deleteSnapshot: e2bClient.deleteSnapshot,
	deleteVolume: e2bClient.deleteVolume,
	getPreviewHost: e2bClient.getPreviewHost,
	getSandboxFileInfo: e2bClient.getSandboxFileInfo,
	getSandboxInfo: e2bClient.getSandboxInfo,
	getVolume: e2bClient.getVolume,
	killSandbox: e2bClient.killSandbox,
	listSandboxFiles: e2bClient.listSandboxFiles,
	listSandboxes: e2bClient.listSandboxes,
	listSnapshots: e2bClient.listSnapshots,
	listVolumes: e2bClient.listVolumes,
	moveSandboxFile: e2bClient.moveSandboxFile,
	pauseSandbox: e2bClient.pauseSandbox,
	readSandboxFile: e2bClient.readSandboxFile,
	runSandboxCommand: e2bClient.runSandboxCommand,
	writeSandboxFile: e2bClient.writeSandboxFile,
}));

function setupExecuteFunctions(params: Record<string, unknown>) {
	const executeFunctions = {
		getInputData: vi.fn(),
		getCredentials: vi.fn(),
		getNode: vi.fn(),
		getNodeParameter: vi.fn(),
		continueOnFail: vi.fn(),
		helpers: {
			assertBinaryData: vi.fn(),
			getBinaryDataBuffer: vi.fn(),
			httpRequest: vi.fn(),
			httpRequestWithAuthentication: vi.fn(),
			prepareBinaryData: vi.fn(),
		},
	} as unknown as IExecuteFunctions;

	executeFunctions.getInputData.mockReturnValue([{ json: {} }]);
	executeFunctions.getCredentials.mockResolvedValue({ apiKey: 'api-key' });
	executeFunctions.getNode.mockReturnValue({
		id: 'e2b-node',
		name: 'E2B',
		type: '@e2b/n8n-nodes-e2b.e2b',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	});
	executeFunctions.getNodeParameter.mockImplementation(
		(name: string, _itemIndex?: number, fallback?: unknown) =>
			(params[name] ?? fallback) as never,
	);
	executeFunctions.continueOnFail.mockReturnValue(false);
	return executeFunctions;
}

function defaultRunCommandParams(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		resource: 'code',
		operation: 'runCommand',
		sandboxId: '',
		command: 'echo ok',
		cwd: '',
		template: '',
		metadataJson: '{}',
		envJson: '{}',
		allowInternetAccess: true,
		killAfterRun: true,
		timeoutSeconds: 120,
		...overrides,
	};
}

beforeEach(() => {
	e2bClient.reset();
});

describe('E2B node', () => {
	it('kills a created sandbox when command execution fails unexpectedly', async () => {
		const sandbox = e2bClient.makeSandbox('sb-cleanup');
		e2bClient.createSandbox.mockResolvedValue(sandbox);
		e2bClient.runSandboxCommand.mockRejectedValue(new Error('network reset'));
		const executeFunctions = setupExecuteFunctions(defaultRunCommandParams());

		await expect(new E2b().execute.call(executeFunctions)).rejects.toThrow(/network reset/i);

		expect(e2bClient.killSandbox).toHaveBeenCalledWith(expect.any(Object), 'sb-cleanup');
	});

	it('kills a created sandbox after a handled command exit', async () => {
		const sandbox = e2bClient.makeSandbox('sb-command-exit');
		e2bClient.createSandbox.mockResolvedValue(sandbox);
		e2bClient.runSandboxCommand.mockResolvedValue({
			exitCode: 2,
			stdout: '',
			stderr: 'command failed',
		} satisfies MockCommandResult);
		const executeFunctions = setupExecuteFunctions(defaultRunCommandParams());

		const result = await new E2b().execute.call(executeFunctions);

		expect(result[0]?.[0]?.json).toEqual(
			expect.objectContaining({
				sandboxId: 'sb-command-exit',
				success: false,
				exitCode: 2,
				stderr: 'command failed',
				killedAfterRun: true,
			}),
		);
		expect(e2bClient.killSandbox).toHaveBeenCalledWith(expect.any(Object), 'sb-command-exit');
	});

	it('fails visibly when killAfterRun cleanup fails after a successful command', async () => {
		e2bClient.createSandbox.mockResolvedValue(e2bClient.makeSandbox('sb-cleanup-fail'));
		e2bClient.killSandbox.mockRejectedValue(new Error('cleanup failed'));
		const executeFunctions = setupExecuteFunctions(defaultRunCommandParams());

		let error: unknown;
		try {
			await new E2b().execute.call(executeFunctions);
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(NodeOperationError);
		expect(error).toBeInstanceOf(Error);
		if (error instanceof Error) {
			expect(error.message).toMatch(/cleanup failed/i);
		}
	});

	it('creates a snapshot from a sandbox', async () => {
		const executeFunctions = setupExecuteFunctions({
			resource: 'snapshot',
			operation: 'create',
			sandboxId: 'sb-source',
			snapshotName: 'checkpoint',
			timeoutSeconds: 120,
		});

		const result = await new E2b().execute.call(executeFunctions);

		expect(e2bClient.createSnapshot).toHaveBeenCalledWith(
			expect.any(Object),
			'sb-source',
			'checkpoint',
		);
		expect(result[0]?.[0]?.json).toEqual({
			snapshotId: 'snap-node:default',
			names: ['team/snap-node:default'],
		});
	});

	it('lists snapshots with an optional source sandbox filter', async () => {
		e2bClient.listSnapshots.mockResolvedValue([
			{
				snapshotId: 'snap-one:default',
				names: ['team/snap-one:default'],
			},
		]);
		const executeFunctions = setupExecuteFunctions({
			resource: 'snapshot',
			operation: 'getMany',
			sandboxId: 'sb-source',
			limit: 10,
			timeoutSeconds: 120,
		});

		const result = await new E2b().execute.call(executeFunctions);

		expect(e2bClient.listSnapshots).toHaveBeenCalledWith(expect.any(Object), 10, 'sb-source');
		expect(result[0]?.[0]?.json).toEqual({
			snapshotId: 'snap-one:default',
			names: ['team/snap-one:default'],
		});
	});

	it('deletes a snapshot', async () => {
		const executeFunctions = setupExecuteFunctions({
			resource: 'snapshot',
			operation: 'delete',
			snapshotId: 'snap-node:default',
			timeoutSeconds: 120,
		});

		const result = await new E2b().execute.call(executeFunctions);

		expect(e2bClient.deleteSnapshot).toHaveBeenCalledWith(expect.any(Object), 'snap-node:default');
		expect(result[0]?.[0]?.json).toEqual({
			snapshotId: 'snap-node:default',
			deleted: true,
		});
	});

	it('passes volume mounts when creating a sandbox', async () => {
		e2bClient.createSandbox.mockResolvedValue(e2bClient.makeSandbox('sb-volume'));
		e2bClient.getSandboxInfo.mockResolvedValue(e2bClient.makeSandboxInfo('sb-volume'));
		const executeFunctions = setupExecuteFunctions({
			resource: 'sandbox',
			operation: 'create',
			template: '',
			metadataJson: '{}',
			envJson: '{}',
			volumeMountsJson: '{"\\/data":"my-volume"}',
			allowInternetAccess: true,
			timeoutSeconds: 120,
		});

		await new E2b().execute.call(executeFunctions);

		expect(e2bClient.createSandbox).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({
				volumeMounts: {
					'/data': 'my-volume',
				},
				timeoutMs: 120_000,
			}),
		);
	});

	it('gets a preview URL for a sandbox port', async () => {
		const sandbox = e2bClient.makeSandbox('sb-preview');
		e2bClient.connectSandbox.mockResolvedValue(sandbox);
		const executeFunctions = setupExecuteFunctions({
			resource: 'sandbox',
			operation: 'getPreviewUrl',
			sandboxId: 'sb-preview',
			port: 3000,
			timeoutSeconds: 120,
		});

		const result = await new E2b().execute.call(executeFunctions);

		expect(e2bClient.getPreviewHost).toHaveBeenCalledWith(expect.any(Object), sandbox, 3000);
		expect(result[0]?.[0]?.json).toEqual({
			sandboxId: 'sb-preview',
			port: 3000,
			host: '3000-sb-preview.e2b.app',
			url: 'https://3000-sb-preview.e2b.app',
		});
	});

	it('gets a sandbox by ID', async () => {
		e2bClient.getSandboxInfo.mockResolvedValue(e2bClient.makeSandboxInfo('sb-by-id'));
		const executeFunctions = setupExecuteFunctions({
			resource: 'sandbox',
			operation: 'get',
			getBy: 'id',
			sandboxId: 'sb-by-id',
			timeoutSeconds: 120,
		});

		const result = await new E2b().execute.call(executeFunctions);

		expect(e2bClient.listSandboxes).not.toHaveBeenCalled();
		expect(e2bClient.getSandboxInfo).toHaveBeenCalledWith(expect.any(Object), 'sb-by-id');
		expect(result[0]?.[0]?.json).toMatchObject({ sandboxId: 'sb-by-id' });
	});

	it('gets a sandbox by metadata filter', async () => {
		e2bClient.listSandboxes.mockResolvedValue([e2bClient.makeSandboxInfo('sb-by-metadata')]);
		e2bClient.getSandboxInfo.mockResolvedValue(e2bClient.makeSandboxInfo('sb-by-metadata'));
		const executeFunctions = setupExecuteFunctions({
			resource: 'sandbox',
			operation: 'get',
			getBy: 'metadata',
			filterMetadataJson: '{"purpose":"n8n-agent-persist"}',
			timeoutSeconds: 120,
		});

		const result = await new E2b().execute.call(executeFunctions);

		expect(e2bClient.listSandboxes).toHaveBeenCalledWith(expect.any(Object), {
			metadata: { purpose: 'n8n-agent-persist' },
			limit: 1,
		});
		expect(e2bClient.getSandboxInfo).toHaveBeenCalledWith(expect.any(Object), 'sb-by-metadata');
		expect(result[0]?.[0]?.json).toMatchObject({ sandboxId: 'sb-by-metadata' });
	});

	it('throws when no sandbox matches the metadata filter', async () => {
		e2bClient.listSandboxes.mockResolvedValue([]);
		const executeFunctions = setupExecuteFunctions({
			resource: 'sandbox',
			operation: 'get',
			getBy: 'metadata',
			filterMetadataJson: '{"purpose":"missing"}',
			timeoutSeconds: 120,
		});

		await expect(new E2b().execute.call(executeFunctions)).rejects.toThrow(
			/no sandbox found matching/i,
		);
	});

	it('throws when the metadata filter is empty', async () => {
		const executeFunctions = setupExecuteFunctions({
			resource: 'sandbox',
			operation: 'get',
			getBy: 'metadata',
			filterMetadataJson: '{}',
			timeoutSeconds: 120,
		});

		await expect(new E2b().execute.call(executeFunctions)).rejects.toThrow(
			/at least one key-value pair/i,
		);
		expect(e2bClient.listSandboxes).not.toHaveBeenCalled();
	});

	it('lists sandboxes with a limit', async () => {
		e2bClient.listSandboxes.mockResolvedValue([e2bClient.makeSandboxInfo('sb-listed')]);
		const executeFunctions = setupExecuteFunctions({
			resource: 'sandbox',
			operation: 'getMany',
			limit: 25,
			timeoutSeconds: 120,
		});

		const result = await new E2b().execute.call(executeFunctions);

		expect(e2bClient.listSandboxes).toHaveBeenCalledWith(expect.any(Object), { limit: 25 });
		expect(result[0]?.[0]?.json).toMatchObject({ sandboxId: 'sb-listed' });
	});

	it('writes text content to a sandbox file', async () => {
		const sandbox = e2bClient.makeSandbox('sb-files');
		e2bClient.connectSandbox.mockResolvedValue(sandbox);
		e2bClient.writeSandboxFile.mockResolvedValue(e2bClient.makeFileInfo('/tmp/app.py'));
		const executeFunctions = setupExecuteFunctions({
			resource: 'file',
			operation: 'write',
			sandboxId: 'sb-files',
			path: '/tmp/app.py',
			content: 'print(42)',
			timeoutSeconds: 120,
		});

		const result = await new E2b().execute.call(executeFunctions);

		expect(e2bClient.writeSandboxFile).toHaveBeenCalledWith(
			expect.any(Object),
			sandbox,
			'/tmp/app.py',
			'print(42)',
		);
		expect(result[0]?.[0]?.json).toEqual(
			expect.objectContaining({
				sandboxId: 'sb-files',
				path: '/tmp/app.py',
				contentLength: 9,
			}),
		);
	});

	it('clones a repository and checks out a commit when requested', async () => {
		const sandbox = e2bClient.makeSandbox('sb-git');
		e2bClient.connectSandbox.mockResolvedValue(sandbox);
		const executeFunctions = setupExecuteFunctions({
			resource: 'git',
			operation: 'clone',
			sandboxId: 'sb-git',
			repositoryUrl: 'https://github.com/e2b-dev/e2b.git',
			repositoryPath: '/tmp/repo',
			cloneOptions: {
				branch: 'main',
				commitId: 'abc123',
				depth: 2,
			},
			timeoutSeconds: 120,
		});

		const result = await new E2b().execute.call(executeFunctions);

		expect(e2bClient.runSandboxCommand).toHaveBeenCalledWith(
			expect.any(Object),
			sandbox,
			"'git' 'clone' 'https://github.com/e2b-dev/e2b.git' '--branch' 'main' '--single-branch' '--depth' '2' '/tmp/repo'",
			expect.objectContaining({
				envs: { GIT_TERMINAL_PROMPT: '0' },
			}),
		);
		expect(e2bClient.runSandboxCommand).toHaveBeenCalledWith(
			expect.any(Object),
			sandbox,
			"'git' '-C' '/tmp/repo' 'checkout' 'abc123'",
			expect.objectContaining({
				envs: { GIT_TERMINAL_PROMPT: '0' },
			}),
		);
		expect(result[0]?.[0]?.json).toEqual(
			expect.objectContaining({
				sandboxId: 'sb-git',
				operation: 'git.clone',
				repositoryPath: '/tmp/repo',
				repositoryUrl: 'https://github.com/e2b-dev/e2b.git',
				success: true,
			}),
		);
	});

	it('lists E2B volumes with the requested limit', async () => {
		e2bClient.listVolumes.mockResolvedValue([
			{ volumeId: 'vol-one', name: 'one' },
			{ volumeId: 'vol-two', name: 'two' },
		]);
		const executeFunctions = setupExecuteFunctions({
			resource: 'volume',
			operation: 'getMany',
			limit: 1,
			timeoutSeconds: 120,
		});

		const result = await new E2b().execute.call(executeFunctions);

		expect(e2bClient.listVolumes).toHaveBeenCalledWith(expect.any(Object));
		expect(result[0]).toHaveLength(1);
		expect(result[0]?.[0]?.json).toEqual({
			volumeId: 'vol-one',
			name: 'one',
		});
	});
});
