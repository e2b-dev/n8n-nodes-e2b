import type { GitCloneOpts, GitCommitOpts, GitPullOpts, GitPushOpts, GitRequestOpts } from 'e2b';

import {
	asNonEmptyString,
	buildConnectOpts,
	getCollectionParameter,
	getRecordBoolean,
	getRecordNumber,
	getRecordString,
	getRequiredStringParameter,
	quoteShellArg,
	resolveCommandResult,
	splitCommaSeparated,
	toOperationCommandResultData,
} from '../helpers';
import type { E2BOperationContext } from '../types';

async function getGitContext(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
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
	const sandbox = await sdk.Sandbox.connect(sandboxId, buildConnectOpts(credentials, timeoutMs));
	const gitRequestOpts: GitRequestOpts = {
		timeoutMs,
		requestTimeoutMs: timeoutMs,
	};
	const startedAt = Date.now();

	return { sandbox, sandboxId, repositoryPath, gitRequestOpts, startedAt };
}

export async function status(context: E2BOperationContext) {
	const { itemIndex } = context;
	const { sandbox, sandboxId, repositoryPath, gitRequestOpts } = await getGitContext(context);
	const status = await sandbox.git.status(repositoryPath, gitRequestOpts);

	return [
		{
			json: {
				sandboxId,
				repositoryPath,
				status,
			},
			pairedItem: { item: itemIndex },
		},
	];
}

export async function add(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, sdk } = context;
	const { sandbox, sandboxId, repositoryPath, gitRequestOpts, startedAt } =
		await getGitContext(context);
	const filesRaw = asNonEmptyString(executeFunctions.getNodeParameter('files', itemIndex, '.'));
	const files = splitCommaSeparated(filesRaw);
	const addAll = !files || (files.length === 1 && files[0] === '.');
	const result = await resolveCommandResult(
		executeFunctions,
		itemIndex,
		sdk.CommandExitError,
		async () =>
			await sandbox.git.add(repositoryPath, {
				...gitRequestOpts,
				...(addAll ? { all: true } : { files }),
			}),
	);

	return [
		{
			json: toOperationCommandResultData(result, sandboxId, 'git.add', startedAt, {
				repositoryPath,
				files: addAll ? ['.'] : files,
			}),
			pairedItem: { item: itemIndex },
		},
	];
}

export async function checkout(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, sdk } = context;
	const { sandbox, sandboxId, repositoryPath, gitRequestOpts, startedAt } =
		await getGitContext(context);
	const gitRef = getRequiredStringParameter(executeFunctions, 'gitRef', 'Git Ref', itemIndex);
	const result = await resolveCommandResult(
		executeFunctions,
		itemIndex,
		sdk.CommandExitError,
		async () =>
			await sandbox.commands.run(
				`git -C ${quoteShellArg(repositoryPath)} checkout ${quoteShellArg(gitRef)}`,
				gitRequestOpts,
			),
	);

	return [
		{
			json: toOperationCommandResultData(result, sandboxId, 'git.checkout', startedAt, {
				repositoryPath,
				gitRef,
			}),
			pairedItem: { item: itemIndex },
		},
	];
}

export async function clone(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, sdk } = context;
	const { sandbox, sandboxId, repositoryPath, gitRequestOpts, startedAt } =
		await getGitContext(context);
	const repositoryUrl = getRequiredStringParameter(
		executeFunctions,
		'repositoryUrl',
		'Repository URL',
		itemIndex,
	);
	const cloneOptions = getCollectionParameter(executeFunctions, 'cloneOptions', itemIndex);
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
		executeFunctions,
		itemIndex,
		sdk.CommandExitError,
		async () => await sandbox.git.clone(repositoryUrl, cloneOpts),
	);
	const resultData = toOperationCommandResultData(result, sandboxId, 'git.clone', startedAt, {
		repositoryPath,
		repositoryUrl,
		branch: cloneOpts.branch,
		depth: cloneOpts.depth,
	});

	if (commitId) {
		const checkoutResult = await resolveCommandResult(
			executeFunctions,
			itemIndex,
			sdk.CommandExitError,
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
		resultData.success = result.exitCode === 0 && checkoutResult.exitCode === 0;
	}

	return [
		{
			json: resultData,
			pairedItem: { item: itemIndex },
		},
	];
}

export async function commit(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, sdk } = context;
	const { sandbox, sandboxId, repositoryPath, gitRequestOpts, startedAt } =
		await getGitContext(context);
	const message = getRequiredStringParameter(executeFunctions, 'message', 'Message', itemIndex);
	const commitOptions = getCollectionParameter(executeFunctions, 'commitOptions', itemIndex);
	const authorName = asNonEmptyString(executeFunctions.getNodeParameter('authorName', itemIndex, ''));
	const authorEmail = asNonEmptyString(
		executeFunctions.getNodeParameter('authorEmail', itemIndex, ''),
	);
	const commitOpts: GitCommitOpts = {
		...gitRequestOpts,
		...(authorName ? { authorName } : {}),
		...(authorEmail ? { authorEmail } : {}),
		...(getRecordBoolean(commitOptions, 'allowEmpty') === true ? { allowEmpty: true } : {}),
	};
	const result = await resolveCommandResult(
		executeFunctions,
		itemIndex,
		sdk.CommandExitError,
		async () => await sandbox.git.commit(repositoryPath, message, commitOpts),
	);

	return [
		{
			json: toOperationCommandResultData(result, sandboxId, 'git.commit', startedAt, {
				repositoryPath,
				message,
				authorName: commitOpts.authorName,
				authorEmail: commitOpts.authorEmail,
				allowEmpty: commitOpts.allowEmpty,
			}),
			pairedItem: { item: itemIndex },
		},
	];
}

export async function pull(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, sdk } = context;
	const { sandbox, sandboxId, repositoryPath, gitRequestOpts, startedAt } =
		await getGitContext(context);
	const remoteOptions = getCollectionParameter(executeFunctions, 'remoteOptions', itemIndex);
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
		executeFunctions,
		itemIndex,
		sdk.CommandExitError,
		async () => await sandbox.git.pull(repositoryPath, pullOpts),
	);

	return [
		{
			json: toOperationCommandResultData(result, sandboxId, 'git.pull', startedAt, {
				repositoryPath,
				remote: pullOpts.remote,
				branch: pullOpts.branch,
			}),
			pairedItem: { item: itemIndex },
		},
	];
}

export async function push(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, sdk } = context;
	const { sandbox, sandboxId, repositoryPath, gitRequestOpts, startedAt } =
		await getGitContext(context);
	const remoteOptions = getCollectionParameter(executeFunctions, 'remoteOptions', itemIndex);
	const pushOpts: GitPushOpts = {
		...gitRequestOpts,
		...(getRecordString(remoteOptions, 'remote')
			? { remote: getRecordString(remoteOptions, 'remote') }
			: {}),
		...(getRecordString(remoteOptions, 'branch')
			? { branch: getRecordString(remoteOptions, 'branch') }
			: {}),
		...(getRecordBoolean(remoteOptions, 'setUpstream') === true ? { setUpstream: true } : {}),
		...(getRecordString(remoteOptions, 'username')
			? { username: getRecordString(remoteOptions, 'username') }
			: {}),
		...(getRecordString(remoteOptions, 'password')
			? { password: getRecordString(remoteOptions, 'password') }
			: {}),
	};
	const result = await resolveCommandResult(
		executeFunctions,
		itemIndex,
		sdk.CommandExitError,
		async () => await sandbox.git.push(repositoryPath, pushOpts),
	);

	return [
		{
			json: toOperationCommandResultData(result, sandboxId, 'git.push', startedAt, {
				repositoryPath,
				remote: pushOpts.remote,
				branch: pushOpts.branch,
				setUpstream: pushOpts.setUpstream,
			}),
			pairedItem: { item: itemIndex },
		},
	];
}
