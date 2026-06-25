import type { IExecuteFunctions } from 'n8n-workflow';
import type { Mock } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';
import { mockDeep } from 'vitest-mock-extended';

import { E2b } from '../E2b.node';

interface MockCommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

interface MockFileInfo {
	name: string;
	type: 'file' | 'dir';
	path: string;
	size: number;
	mode: number;
	permissions: string;
	owner: string;
	group: string;
	modifiedTime: Date;
}

interface MockSandboxInfo {
	sandboxId: string;
	templateId: string;
	name?: string;
	state: 'running' | 'paused';
	metadata: Record<string, string>;
	startedAt: Date;
	endAt: Date;
	cpuCount: number;
	memoryMB: number;
	envdVersion: string;
}

interface MockSnapshotInfo {
	snapshotId: string;
	names: string[];
}

interface MockSandbox {
	sandboxId: string;
	sandboxDomain: string;
	commands: {
		run: Mock<(command: string, options?: unknown) => Promise<MockCommandResult>>;
	};
	files: {
		read: Mock<(path: string, options?: unknown) => Promise<string | Uint8Array>>;
		write: Mock<(path: string, data: string | ArrayBuffer, options?: unknown) => Promise<MockFileInfo>>;
		list: Mock<(path: string, options?: unknown) => Promise<MockFileInfo[]>>;
		makeDir: Mock<(path: string, options?: unknown) => Promise<boolean>>;
		rename: Mock<(source: string, destination: string, options?: unknown) => Promise<MockFileInfo>>;
		remove: Mock<(path: string, options?: unknown) => Promise<void>>;
		getInfo: Mock<(path: string, options?: unknown) => Promise<MockFileInfo>>;
	};
	git: {
		clone: Mock<(url: string, options?: unknown) => Promise<MockCommandResult>>;
		status: Mock<(path: string, options?: unknown) => Promise<Record<string, unknown>>>;
		add: Mock<(path: string, options?: unknown) => Promise<MockCommandResult>>;
		commit: Mock<(path: string, message: string, options?: unknown) => Promise<MockCommandResult>>;
		pull: Mock<(path: string, options?: unknown) => Promise<MockCommandResult>>;
		push: Mock<(path: string, options?: unknown) => Promise<MockCommandResult>>;
	};
	getHost: Mock<(port: number) => string>;
	getInfo: Mock<() => Promise<MockSandboxInfo>>;
	kill: Mock<() => Promise<boolean>>;
}

const { Sandbox, CommandExitError, Volume, makeMockSandbox, resetE2BNodeMockState } = vi.hoisted(() => {
	class CommandExitError extends Error implements MockCommandResult {
		readonly exitCode: number;
		readonly stdout: string;
		readonly stderr: string;

		constructor(result: MockCommandResult) {
			super(result.stderr || result.stdout || `Command exited with ${result.exitCode}`);
			this.exitCode = result.exitCode;
			this.stdout = result.stdout;
			this.stderr = result.stderr;
		}
	}

	function makeSandboxInfo(sandboxId: string): MockSandboxInfo {
		return {
			sandboxId,
			templateId: 'base',
			name: 'base',
			state: 'running',
			metadata: {},
			startedAt: new Date('2026-01-01T00:00:00.000Z'),
			endAt: new Date('2026-01-01T00:05:00.000Z'),
			cpuCount: 2,
			memoryMB: 1024,
			envdVersion: '0.1.0',
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
			modifiedTime: new Date('2026-01-01T00:00:00.000Z'),
		};
	}

	function makeMockSandbox(sandboxId = 'sb-node'): MockSandbox {
		return {
			sandboxId,
			sandboxDomain: `${sandboxId}.e2b.dev`,
			commands: {
				run: vi.fn(async () => ({ exitCode: 0, stdout: 'ok', stderr: '' })),
			},
			files: {
				read: vi.fn(async () => 'file content'),
				write: vi.fn(async (path: string) => makeFileInfo(path)),
				list: vi.fn(async (path: string) => [makeFileInfo(`${path}/index.ts`)]),
				makeDir: vi.fn(async () => true),
				rename: vi.fn(async (_source: string, destination: string) => makeFileInfo(destination)),
				remove: vi.fn(async () => {}),
				getInfo: vi.fn(async (path: string) => makeFileInfo(path)),
			},
			git: {
				clone: vi.fn(async () => ({ exitCode: 0, stdout: 'cloned', stderr: '' })),
				status: vi.fn(async () => ({ isClean: true, fileStatus: [] })),
				add: vi.fn(async () => ({ exitCode: 0, stdout: 'added', stderr: '' })),
				commit: vi.fn(async () => ({ exitCode: 0, stdout: 'committed', stderr: '' })),
				pull: vi.fn(async () => ({ exitCode: 0, stdout: 'pulled', stderr: '' })),
				push: vi.fn(async () => ({ exitCode: 0, stdout: 'pushed', stderr: '' })),
			},
			getHost: vi.fn((port: number) => `${port}-${sandboxId}.e2b.dev`),
			getInfo: vi.fn(async () => makeSandboxInfo(sandboxId)),
			kill: vi.fn(async () => true),
		};
	}

	const Sandbox = {
		create: vi.fn(),
		connect: vi.fn(),
		list: vi.fn(),
		listSnapshots: vi.fn(),
		getInfo: vi.fn(),
		createSnapshot: vi.fn(),
		deleteSnapshot: vi.fn(),
		pause: vi.fn(),
		kill: vi.fn(),
	};

	const Volume = {
		create: vi.fn(),
		getInfo: vi.fn(),
		list: vi.fn(),
		destroy: vi.fn(),
	};

	function resetE2BNodeMockState(): void {
		Sandbox.create.mockReset();
		Sandbox.connect.mockReset();
		Sandbox.list.mockReset();
		Sandbox.listSnapshots.mockReset();
		Sandbox.getInfo.mockReset();
		Sandbox.createSnapshot.mockReset();
		Sandbox.deleteSnapshot.mockReset();
		Sandbox.pause.mockReset();
		Sandbox.kill.mockReset();
		Volume.create.mockReset();
		Volume.getInfo.mockReset();
		Volume.list.mockReset();
		Volume.destroy.mockReset();
		Sandbox.create.mockResolvedValue(makeMockSandbox());
		Sandbox.connect.mockResolvedValue(makeMockSandbox());
		Sandbox.list.mockReturnValue({ nextItems: vi.fn(async () => []) });
		Sandbox.listSnapshots.mockReturnValue({ nextItems: vi.fn(async () => []) });
		Sandbox.getInfo.mockResolvedValue(makeSandboxInfo('sb-node'));
		Sandbox.createSnapshot.mockResolvedValue({
			snapshotId: 'snap-node:default',
			names: ['team/snap-node:default'],
		} satisfies MockSnapshotInfo);
		Sandbox.deleteSnapshot.mockResolvedValue(true);
		Sandbox.pause.mockResolvedValue(true);
		Sandbox.kill.mockResolvedValue(true);
		Volume.create.mockResolvedValue({ volumeId: 'vol-node', name: 'my-volume', token: 'token' });
		Volume.getInfo.mockResolvedValue({ volumeId: 'vol-node', name: 'my-volume', token: 'token' });
		Volume.list.mockResolvedValue([{ volumeId: 'vol-node', name: 'my-volume' }]);
		Volume.destroy.mockResolvedValue(true);
	}

	resetE2BNodeMockState();

	return {
		Sandbox,
		CommandExitError,
		Volume,
		makeMockSandbox,
		resetE2BNodeMockState,
	};
});

vi.mock('e2b', () => ({
	Sandbox,
	CommandExitError,
	Volume,
}));

function setupExecuteFunctions(params: Record<string, unknown>) {
	const executeFunctions = mockDeep<IExecuteFunctions>();
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
	resetE2BNodeMockState();
});

describe('E2B node', () => {
	it('kills a created sandbox when command execution fails unexpectedly', async () => {
		const sandbox = makeMockSandbox('sb-cleanup');
		sandbox.commands.run.mockRejectedValue(new Error('network reset'));
		Sandbox.create.mockResolvedValue(sandbox);
		const executeFunctions = setupExecuteFunctions(defaultRunCommandParams());

		await expect(new E2b().execute.call(executeFunctions)).rejects.toThrow(/network reset/i);

		expect(sandbox.kill).toHaveBeenCalledWith(
			expect.objectContaining({
				apiKey: 'api-key',
				requestTimeoutMs: 120_000,
			}),
		);
	});

	it('kills a created sandbox after a handled command exit', async () => {
		const sandbox = makeMockSandbox('sb-command-exit');
		sandbox.commands.run.mockRejectedValue(
			new CommandExitError({ exitCode: 2, stdout: '', stderr: 'command failed' }),
		);
		Sandbox.create.mockResolvedValue(sandbox);
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
		expect(sandbox.kill).toHaveBeenCalledWith(
			expect.objectContaining({
				apiKey: 'api-key',
				requestTimeoutMs: 120_000,
			}),
		);
	});

	it('fails visibly when killAfterRun cleanup fails after a successful command', async () => {
		const sandbox = makeMockSandbox('sb-cleanup-fail');
		sandbox.kill.mockRejectedValue(new Error('cleanup failed'));
		Sandbox.create.mockResolvedValue(sandbox);
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

		expect(Sandbox.createSnapshot).toHaveBeenCalledWith(
			'sb-source',
			expect.objectContaining({
				apiKey: 'api-key',
				name: 'checkpoint',
				requestTimeoutMs: 120_000,
			}),
		);
		expect(result[0]?.[0]?.json).toEqual({
			snapshotId: 'snap-node:default',
			names: ['team/snap-node:default'],
		});
	});

	it('lists snapshots with an optional source sandbox filter', async () => {
		Sandbox.listSnapshots.mockReturnValue({
			nextItems: vi.fn(async () => [
				{
					snapshotId: 'snap-one:default',
					names: ['team/snap-one:default'],
				},
			]),
		});
		const executeFunctions = setupExecuteFunctions({
			resource: 'snapshot',
			operation: 'getMany',
			sandboxId: 'sb-source',
			limit: 10,
			timeoutSeconds: 120,
		});

		const result = await new E2b().execute.call(executeFunctions);

		expect(Sandbox.listSnapshots).toHaveBeenCalledWith(
			expect.objectContaining({
				apiKey: 'api-key',
				sandboxId: 'sb-source',
				limit: 10,
				requestTimeoutMs: 120_000,
			}),
		);
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

		expect(Sandbox.deleteSnapshot).toHaveBeenCalledWith(
			'snap-node:default',
			expect.objectContaining({
				apiKey: 'api-key',
				requestTimeoutMs: 120_000,
			}),
		);
		expect(result[0]?.[0]?.json).toEqual({
			snapshotId: 'snap-node:default',
			deleted: true,
		});
	});

	it('passes volume mounts when creating a sandbox', async () => {
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

		expect(Sandbox.create).toHaveBeenCalledWith(
			expect.objectContaining({
				apiKey: 'api-key',
				volumeMounts: {
					'/data': 'my-volume',
				},
				requestTimeoutMs: 120_000,
			}),
		);
	});

	it('gets a preview URL for a sandbox port', async () => {
		const sandbox = makeMockSandbox('sb-preview');
		Sandbox.connect.mockResolvedValue(sandbox);
		const executeFunctions = setupExecuteFunctions({
			resource: 'sandbox',
			operation: 'getPreviewUrl',
			sandboxId: 'sb-preview',
			port: 3000,
			timeoutSeconds: 120,
		});

		const result = await new E2b().execute.call(executeFunctions);

		expect(sandbox.getHost).toHaveBeenCalledWith(3000);
		expect(result[0]?.[0]?.json).toEqual({
			sandboxId: 'sb-preview',
			port: 3000,
			host: '3000-sb-preview.e2b.dev',
			url: 'https://3000-sb-preview.e2b.dev',
		});
	});

	it('writes text content to a sandbox file', async () => {
		const sandbox = makeMockSandbox('sb-files');
		Sandbox.connect.mockResolvedValue(sandbox);
		const executeFunctions = setupExecuteFunctions({
			resource: 'file',
			operation: 'write',
			sandboxId: 'sb-files',
			path: '/tmp/app.py',
			content: 'print(42)',
			timeoutSeconds: 120,
		});

		const result = await new E2b().execute.call(executeFunctions);

		expect(sandbox.files.write).toHaveBeenCalledWith(
			'/tmp/app.py',
			'print(42)',
			expect.objectContaining({
				requestTimeoutMs: 120_000,
			}),
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
		const sandbox = makeMockSandbox('sb-git');
		Sandbox.connect.mockResolvedValue(sandbox);
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

		expect(sandbox.git.clone).toHaveBeenCalledWith(
			'https://github.com/e2b-dev/e2b.git',
			expect.objectContaining({
				path: '/tmp/repo',
				branch: 'main',
				depth: 2,
				requestTimeoutMs: 120_000,
			}),
		);
		expect(sandbox.commands.run).toHaveBeenCalledWith(
			"git -C '/tmp/repo' checkout 'abc123'",
			expect.objectContaining({
				requestTimeoutMs: 120_000,
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
		Volume.list.mockResolvedValue([
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

		expect(Volume.list).toHaveBeenCalledWith(
			expect.objectContaining({
				apiKey: 'api-key',
				requestTimeoutMs: 120_000,
			}),
		);
		expect(result[0]).toHaveLength(1);
		expect(result[0]?.[0]?.json).toEqual({
			volumeId: 'vol-one',
			name: 'one',
		});
	});
});
