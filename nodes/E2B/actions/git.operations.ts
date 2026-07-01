import type { IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { connectSandbox, runSandboxCommand, type CommandResult } from '../client';
import {
	asNonEmptyString,
	getCollectionParameter,
	getRecordBoolean,
	getRecordNumber,
	getRecordString,
	getRequiredStringParameter,
	quoteShellArg,
	splitCommaSeparated,
	toOperationCommandResultData,
} from '../helpers';
import type { E2BOperationContext } from '../types';

const DEFAULT_GIT_ENV: Record<string, string> = {
	GIT_TERMINAL_PROMPT: '0',
};

type GitStatusLabel =
	| 'conflict'
	| 'renamed'
	| 'copied'
	| 'deleted'
	| 'added'
	| 'modified'
	| 'typechange'
	| 'untracked'
	| 'unknown';

interface GitFileStatus {
	name: string;
	status: GitStatusLabel;
	indexStatus: string;
	workingTreeStatus: string;
	staged: boolean;
	renamedFrom?: string;
}

interface GitStatus {
	currentBranch?: string;
	upstream?: string;
	ahead: number;
	behind: number;
	detached: boolean;
	fileStatus: GitFileStatus[];
	isClean: boolean;
	hasChanges: boolean;
	hasStaged: boolean;
	hasUntracked: boolean;
	hasConflicts: boolean;
	totalCount: number;
	stagedCount: number;
	unstagedCount: number;
	untrackedCount: number;
	conflictCount: number;
}

interface GitContext extends E2BOperationContext {
	connection: {
		executeFunctions: E2BOperationContext['executeFunctions'];
		credentials: E2BOperationContext['credentials'];
		timeoutMs: number;
	};
	sandbox: Awaited<ReturnType<typeof connectSandbox>>;
	sandboxId: string;
	repositoryPath: string;
	startedAt: number;
}

function parseAheadBehind(segment?: string): { ahead: number; behind: number } {
	if (!segment) return { ahead: 0, behind: 0 };

	let ahead = 0;
	let behind = 0;

	if (segment.includes('ahead')) {
		const value = Number.parseInt(segment.split('ahead')[1].split(',')[0].trim(), 10);
		ahead = Number.isFinite(value) ? value : 0;
	}

	if (segment.includes('behind')) {
		const value = Number.parseInt(segment.split('behind')[1].split(',')[0].trim(), 10);
		behind = Number.isFinite(value) ? value : 0;
	}

	return { ahead, behind };
}

function normalizeBranchName(name: string): string {
	if (name.startsWith('HEAD (detached at ')) {
		return name.replace('HEAD (detached at ', '').replace(/\)$/, '');
	}

	return name
		.replace('HEAD (no branch)', 'HEAD')
		.replace('No commits yet on ', '')
		.replace('Initial commit on ', '');
}

function deriveStatus(indexStatus: string, workingStatus: string): GitStatusLabel {
	const statuses = new Set([indexStatus, workingStatus]);

	if (statuses.has('U')) return 'conflict';
	if (statuses.has('R')) return 'renamed';
	if (statuses.has('C')) return 'copied';
	if (statuses.has('D')) return 'deleted';
	if (statuses.has('A')) return 'added';
	if (statuses.has('M')) return 'modified';
	if (statuses.has('T')) return 'typechange';
	if (statuses.has('?')) return 'untracked';

	return 'unknown';
}

function parseGitStatus(output: string): GitStatus {
	const lines = output
		.split('\n')
		.map((line) => line.replace(/\r$/, ''))
		.filter((line) => line.trim().length > 0);

	let currentBranch: string | undefined;
	let upstream: string | undefined;
	let ahead = 0;
	let behind = 0;
	let detached = false;
	const fileStatus: GitFileStatus[] = [];

	if (lines.length === 0) {
		return {
			currentBranch,
			upstream,
			ahead,
			behind,
			detached,
			fileStatus,
			isClean: true,
			hasChanges: false,
			hasStaged: false,
			hasUntracked: false,
			hasConflicts: false,
			totalCount: 0,
			stagedCount: 0,
			unstagedCount: 0,
			untrackedCount: 0,
			conflictCount: 0,
		};
	}

	const branchLine = lines[0];
	if (branchLine.startsWith('## ')) {
		const branchInfo = branchLine.slice(3);
		const aheadStart = branchInfo.indexOf(' [');
		const branchPart = aheadStart === -1 ? branchInfo : branchInfo.slice(0, aheadStart);
		const aheadPart = aheadStart === -1 ? undefined : branchInfo.slice(aheadStart + 2, -1);
		const normalizedBranch = normalizeBranchName(branchPart);
		const isDetached = branchPart.startsWith('HEAD (detached at ') || branchPart.includes('detached');

		if (isDetached || normalizedBranch.startsWith('HEAD')) {
			detached = true;
		} else if (normalizedBranch.includes('...')) {
			const [branch, upstreamBranch] = normalizedBranch.split('...');
			currentBranch = branch || undefined;
			upstream = upstreamBranch || undefined;
		} else {
			currentBranch = normalizedBranch || undefined;
		}

		const aheadBehind = parseAheadBehind(aheadPart);
		ahead = aheadBehind.ahead;
		behind = aheadBehind.behind;
	}

	for (const line of lines.slice(1)) {
		if (line.startsWith('?? ')) {
			const name = line.slice(3);
			fileStatus.push({
				name,
				status: 'untracked',
				indexStatus: '?',
				workingTreeStatus: '?',
				staged: false,
			});
			continue;
		}

		if (line.length < 3) continue;

		const indexStatus = line[0];
		const workingTreeStatus = line[1];
		const path = line.slice(3);
		let renamedFrom: string | undefined;
		let name = path;

		if (path.includes(' -> ')) {
			const parts = path.split(' -> ');
			renamedFrom = parts[0];
			name = parts.slice(1).join(' -> ');
		}

		fileStatus.push({
			name,
			status: deriveStatus(indexStatus, workingTreeStatus),
			indexStatus,
			workingTreeStatus,
			staged: indexStatus !== ' ' && indexStatus !== '?',
			...(renamedFrom ? { renamedFrom } : {}),
		});
	}

	const totalCount = fileStatus.length;
	const stagedCount = fileStatus.filter((item) => item.staged).length;
	const untrackedCount = fileStatus.filter((item) => item.status === 'untracked').length;
	const conflictCount = fileStatus.filter((item) => item.status === 'conflict').length;
	const unstagedCount = totalCount - stagedCount;

	return {
		currentBranch,
		upstream,
		ahead,
		behind,
		detached,
		fileStatus,
		isClean: totalCount === 0,
		hasChanges: totalCount > 0,
		hasStaged: stagedCount > 0,
		hasUntracked: untrackedCount > 0,
		hasConflicts: conflictCount > 0,
		totalCount,
		stagedCount,
		unstagedCount,
		untrackedCount,
		conflictCount,
	};
}

function buildGitCommand(args: string[], repoPath?: string): string {
	const parts = ['git'];
	if (repoPath) parts.push('-C', repoPath);
	parts.push(...args);
	return parts.map(quoteShellArg).join(' ');
}

function resultMessage(result: CommandResult): string {
	const details = [result.error, result.stderr.trim(), result.stdout.trim()]
		.filter((entry) => entry && entry.length > 0)
		.join('; ');
	return details || `Git command exited with code ${result.exitCode}`;
}

function commandText(result: CommandResult): string {
	return `${result.stderr}\n${result.stdout}`.toLowerCase();
}

function isAuthFailure(result: CommandResult): boolean {
	if (result.exitCode === 0) return false;
	const message = commandText(result);
	const authSnippets = [
		'authentication failed',
		'terminal prompts disabled',
		'could not read username',
		'invalid username or password',
		'access denied',
		'permission denied',
		'not authorized',
	];

	return authSnippets.some((snippet) => message.includes(snippet));
}

function isMissingUpstream(result: CommandResult): boolean {
	if (result.exitCode === 0) return false;
	const message = commandText(result);
	const upstreamSnippets = [
		'has no upstream branch',
		'no upstream branch',
		'no upstream configured',
		'no tracking information for the current branch',
		'no tracking information',
		'set the remote as upstream',
		'set the upstream branch',
		'please specify which branch you want to merge with',
	];

	return upstreamSnippets.some((snippet) => message.includes(snippet));
}

function buildAuthErrorMessage(action: 'clone' | 'push' | 'pull', missingPassword: boolean): string {
	if (missingPassword) {
		return `Git ${action} requires a password/token for private repositories.`;
	}
	return `Git ${action} requires credentials for private repositories.`;
}

function buildUpstreamErrorMessage(action: 'push' | 'pull'): string {
	if (action === 'push') {
		return (
			'Git push failed because no upstream branch is configured. ' +
			'Set upstream once with the Set Upstream option, or pass remote and branch explicitly.'
		);
	}

	return (
		'Git pull failed because no upstream branch is configured. ' +
		'Pass remote and branch explicitly, or set upstream once before pulling.'
	);
}

function throwGitError(context: E2BOperationContext, message: string): never {
	throw new NodeOperationError(context.executeFunctions.getNode(), message, {
		itemIndex: context.itemIndex,
	});
}

function addCredentialsToUrl(
	context: E2BOperationContext,
	url: string,
	username: string,
	password: string,
): string {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throwGitError(context, `Invalid Git URL: ${url}`);
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throwGitError(context, 'Only http(s) Git URLs support username/password credentials.');
	}

	parsed.username = username;
	parsed.password = password;
	return parsed.toString();
}

function stripCredentials(url: string): string {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return url;
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;
	if (!parsed.username && !parsed.password) return url;

	parsed.username = '';
	parsed.password = '';
	return parsed.toString();
}

function buildPushArgs(remote: string | undefined, branch: string | undefined, setUpstream: boolean): string[] {
	const args = ['push'];
	if (setUpstream && remote) args.push('--set-upstream');
	if (remote) args.push(remote);
	if (branch) args.push(branch);
	return args;
}

async function getGitContext(context: E2BOperationContext): Promise<GitContext> {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const sandboxId = getRequiredStringParameter(
		executeFunctions,
		'sandboxId',
		'Sandbox ID',
		itemIndex,
	);
	const repositoryPath = getRequiredStringParameter(
		executeFunctions,
		'repositoryPath',
		'Repository Path',
		itemIndex,
	);
	const sandbox = await connectSandbox(connection, sandboxId);
	const startedAt = Date.now();

	return { ...context, connection, sandbox, sandboxId, repositoryPath, startedAt };
}

async function runGit(
	context: GitContext,
	args: string[],
	repoPath: string | null = context.repositoryPath,
	envs?: Record<string, string>,
): Promise<CommandResult> {
	const targetRepoPath = repoPath === null ? undefined : repoPath;
	return await runSandboxCommand(
		context.connection,
		context.sandbox,
		buildGitCommand(args, targetRepoPath),
		{
			envs: { ...DEFAULT_GIT_ENV, ...(envs ?? {}) },
		},
	);
}

function assertSuccessfulGitResult(context: GitContext, result: CommandResult): void {
	if (result.exitCode === 0) return;
	throwGitError(context, resultMessage(result));
}

async function getRemoteUrl(context: GitContext, remote: string): Promise<string> {
	const result = await runGit(context, ['remote', 'get-url', remote]);
	assertSuccessfulGitResult(context, result);
	const url = result.stdout.trim();
	if (!url) throwGitError(context, `Remote "${remote}" URL not found in repository.`);
	return url;
}

async function resolveRemoteName(context: GitContext, remote: string | undefined): Promise<string> {
	if (remote) return remote;

	const result = await runGit(context, ['remote']);
	assertSuccessfulGitResult(context, result);
	const remotes = result.stdout
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

	if (remotes.length === 1) return remotes[0];

	throwGitError(
		context,
		'Remote is required when using username/password and the repository has multiple remotes.',
	);
}

async function withRemoteCredentials(
	context: GitContext,
	remote: string,
	username: string,
	password: string,
	operation: () => Promise<CommandResult>,
): Promise<CommandResult> {
	const originalUrl = await getRemoteUrl(context, remote);
	const credentialUrl = addCredentialsToUrl(context, originalUrl, username, password);

	assertSuccessfulGitResult(context, await runGit(context, ['remote', 'set-url', remote, credentialUrl]));

	let operationResult: CommandResult | undefined;
	let operationError: unknown;
	try {
		operationResult = await operation();
	} catch (error) {
		operationError = error;
	}

	let restoreError: unknown;
	try {
		assertSuccessfulGitResult(context, await runGit(context, ['remote', 'set-url', remote, originalUrl]));
	} catch (error) {
		restoreError = error;
	}

	if (operationError) throw operationError;
	if (restoreError) throw restoreError;

	if (!operationResult) throwGitError(context, 'Git operation did not return a result.');
	return operationResult;
}

function handleAuthOrUpstreamError(
	context: GitContext,
	result: CommandResult,
	action: 'clone' | 'push' | 'pull',
	missingPassword: boolean,
): void {
	if (isAuthFailure(result)) throwGitError(context, buildAuthErrorMessage(action, missingPassword));
	if ((action === 'push' || action === 'pull') && isMissingUpstream(result)) {
		throwGitError(context, buildUpstreamErrorMessage(action));
	}
}

export async function status(context: E2BOperationContext) {
	const gitContext = await getGitContext(context);
	const result = await runGit(gitContext, ['status', '--porcelain=1', '-b']);
	assertSuccessfulGitResult(gitContext, result);
	const statusData = parseGitStatus(result.stdout);

	return [
		{
			json: {
				sandboxId: gitContext.sandboxId,
				repositoryPath: gitContext.repositoryPath,
				status: statusData as unknown as IDataObject,
			},
			pairedItem: { item: context.itemIndex },
		},
	];
}

export async function add(context: E2BOperationContext) {
	const gitContext = await getGitContext(context);
	const filesRaw = asNonEmptyString(
		context.executeFunctions.getNodeParameter('files', context.itemIndex, '.'),
	);
	const files = splitCommaSeparated(filesRaw);
	const addAll = !files || (files.length === 1 && files[0] === '.');
	const result = await runGit(
		gitContext,
		addAll ? ['add', '-A'] : ['add', '--', ...(files ?? [])],
	);

	return [
		{
			json: toOperationCommandResultData(result, gitContext.sandboxId, 'git.add', gitContext.startedAt, {
				repositoryPath: gitContext.repositoryPath,
				files: addAll ? ['.'] : files,
			}),
			pairedItem: { item: context.itemIndex },
		},
	];
}

export async function checkout(context: E2BOperationContext) {
	const gitContext = await getGitContext(context);
	const gitRef = getRequiredStringParameter(
		context.executeFunctions,
		'gitRef',
		'Git Ref',
		context.itemIndex,
	);
	const result = await runGit(gitContext, ['checkout', gitRef]);

	return [
		{
			json: toOperationCommandResultData(
				result,
				gitContext.sandboxId,
				'git.checkout',
				gitContext.startedAt,
				{
					repositoryPath: gitContext.repositoryPath,
					gitRef,
				},
			),
			pairedItem: { item: context.itemIndex },
		},
	];
}

export async function clone(context: E2BOperationContext) {
	const gitContext = await getGitContext(context);
	const repositoryUrl = getRequiredStringParameter(
		context.executeFunctions,
		'repositoryUrl',
		'Repository URL',
		context.itemIndex,
	);
	const cloneOptions = getCollectionParameter(
		context.executeFunctions,
		'cloneOptions',
		context.itemIndex,
	);
	const branch = getRecordString(cloneOptions, 'branch');
	const commitId = getRecordString(cloneOptions, 'commitId');
	const depth = getRecordNumber(cloneOptions, 'depth');
	const username = getRecordString(cloneOptions, 'username');
	const password = getRecordString(cloneOptions, 'password');
	const dangerouslyStoreCredentials =
		getRecordBoolean(cloneOptions, 'dangerouslyStoreCredentials') === true;

	if (password && !username) {
		throwGitError(context, 'Username is required when using a password or token for git clone.');
	}

	const urlWithCreds =
		username && password ? addCredentialsToUrl(context, repositoryUrl, username, password) : repositoryUrl;
	const sanitizedUrl = stripCredentials(urlWithCreds);
	const shouldStripInlineCreds = !dangerouslyStoreCredentials && sanitizedUrl !== urlWithCreds;
	const args = ['clone', urlWithCreds];
	if (branch) args.push('--branch', branch, '--single-branch');
	if (depth) args.push('--depth', depth.toString());
	args.push(gitContext.repositoryPath);

	const result = await runGit(gitContext, args, null);
	handleAuthOrUpstreamError(gitContext, result, 'clone', Boolean(username) && !password);

	if (shouldStripInlineCreds && result.exitCode === 0) {
		assertSuccessfulGitResult(
			gitContext,
			await runGit(gitContext, ['remote', 'set-url', 'origin', sanitizedUrl]),
		);
	}

	const resultData = toOperationCommandResultData(
		result,
		gitContext.sandboxId,
		'git.clone',
		gitContext.startedAt,
		{
			repositoryPath: gitContext.repositoryPath,
			repositoryUrl,
			branch,
			depth,
		},
	);

	if (commitId) {
		const checkoutResult = await runGit(gitContext, ['checkout', commitId]);
		resultData.checkout = {
			success: checkoutResult.exitCode === 0,
			exitCode: checkoutResult.exitCode,
			stdout: checkoutResult.stdout,
			stderr: checkoutResult.stderr,
			error: checkoutResult.error,
			commitId,
		};
		resultData.success = result.exitCode === 0 && checkoutResult.exitCode === 0;
	}

	return [
		{
			json: resultData,
			pairedItem: { item: context.itemIndex },
		},
	];
}

export async function commit(context: E2BOperationContext) {
	const gitContext = await getGitContext(context);
	const message = getRequiredStringParameter(
		context.executeFunctions,
		'message',
		'Message',
		context.itemIndex,
	);
	const commitOptions = getCollectionParameter(
		context.executeFunctions,
		'commitOptions',
		context.itemIndex,
	);
	const authorName = asNonEmptyString(
		context.executeFunctions.getNodeParameter('authorName', context.itemIndex, ''),
	);
	const authorEmail = asNonEmptyString(
		context.executeFunctions.getNodeParameter('authorEmail', context.itemIndex, ''),
	);
	const allowEmpty = getRecordBoolean(commitOptions, 'allowEmpty') === true;
	const args = ['commit', '-m', message];
	if (allowEmpty) args.push('--allow-empty');

	const authorArgs: string[] = [];
	if (authorName) authorArgs.push('-c', `user.name=${authorName}`);
	if (authorEmail) authorArgs.push('-c', `user.email=${authorEmail}`);

	const result = await runGit(gitContext, [...authorArgs, ...args]);

	return [
		{
			json: toOperationCommandResultData(
				result,
				gitContext.sandboxId,
				'git.commit',
				gitContext.startedAt,
				{
					repositoryPath: gitContext.repositoryPath,
					message,
					authorName,
					authorEmail,
					allowEmpty,
				},
			),
			pairedItem: { item: context.itemIndex },
		},
	];
}

export async function pull(context: E2BOperationContext) {
	const gitContext = await getGitContext(context);
	const remoteOptions = getCollectionParameter(
		context.executeFunctions,
		'remoteOptions',
		context.itemIndex,
	);
	const remote = getRecordString(remoteOptions, 'remote');
	const branch = getRecordString(remoteOptions, 'branch');
	const username = getRecordString(remoteOptions, 'username');
	const password = getRecordString(remoteOptions, 'password');

	if (password && !username) {
		throwGitError(context, 'Username is required when using a password or token for git pull.');
	}

	if (!remote && !branch) {
		const hasUpstream = await runGit(gitContext, [
			'rev-parse',
			'--abbrev-ref',
			'--symbolic-full-name',
			'@{u}',
		]);
		if (hasUpstream.exitCode !== 0 || hasUpstream.stdout.trim().length === 0) {
			throwGitError(gitContext, buildUpstreamErrorMessage('pull'));
		}
	}

	const args = ['pull'];
	if (remote) args.push(remote);
	if (branch) args.push(branch);

	const result =
		username && password
			? await withRemoteCredentials(
					gitContext,
					await resolveRemoteName(gitContext, remote),
					username,
					password,
					async () => await runGit(gitContext, args),
				)
			: await runGit(gitContext, args);
	handleAuthOrUpstreamError(gitContext, result, 'pull', Boolean(username) && !password);

	return [
		{
			json: toOperationCommandResultData(
				result,
				gitContext.sandboxId,
				'git.pull',
				gitContext.startedAt,
				{
					repositoryPath: gitContext.repositoryPath,
					remote,
					branch,
				},
			),
			pairedItem: { item: context.itemIndex },
		},
	];
}

export async function push(context: E2BOperationContext) {
	const gitContext = await getGitContext(context);
	const remoteOptions = getCollectionParameter(
		context.executeFunctions,
		'remoteOptions',
		context.itemIndex,
	);
	const remote = getRecordString(remoteOptions, 'remote');
	const branch = getRecordString(remoteOptions, 'branch');
	const setUpstream = getRecordBoolean(remoteOptions, 'setUpstream') === true;
	const username = getRecordString(remoteOptions, 'username');
	const password = getRecordString(remoteOptions, 'password');

	if (password && !username) {
		throwGitError(context, 'Username is required when using a password or token for git push.');
	}

	const args = buildPushArgs(remote, branch, setUpstream);
	let result: CommandResult;
	if (username && password) {
		const remoteName = await resolveRemoteName(gitContext, remote);
		result = await withRemoteCredentials(
			gitContext,
			remoteName,
			username,
			password,
			async () => await runGit(gitContext, buildPushArgs(remoteName, branch, setUpstream)),
		);
	} else {
		result = await runGit(gitContext, args);
	}
	handleAuthOrUpstreamError(gitContext, result, 'push', Boolean(username) && !password);

	return [
		{
			json: toOperationCommandResultData(
				result,
				gitContext.sandboxId,
				'git.push',
				gitContext.startedAt,
				{
					repositoryPath: gitContext.repositoryPath,
					remote,
					branch,
					setUpstream,
				},
			),
			pairedItem: { item: context.itemIndex },
		},
	];
}
