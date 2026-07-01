import {
	connectSandbox,
	createSandbox,
	getPreviewHost,
	getSandboxInfo,
	killSandbox,
	listSandboxes,
	pauseSandbox,
} from '../client';
import {
	getLimit,
	getPort,
	getRequiredStringParameter,
	getSandboxCreateOptions,
	toSandboxInfoData,
} from '../helpers';
import type { E2BOperationContext } from '../types';

export async function create(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const sandbox = await createSandbox(
		connection,
		getSandboxCreateOptions(executeFunctions, itemIndex),
	);
	const info = await getSandboxInfo(connection, sandbox.sandboxId);

	return [
		{
			json: toSandboxInfoData(info, sandbox.sandboxDomain),
			pairedItem: { item: itemIndex },
		},
	];
}

export async function get(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const sandboxId = getRequiredStringParameter(
		executeFunctions,
		'sandboxId',
		'Sandbox ID',
		itemIndex,
	);
	const info = await getSandboxInfo(connection, sandboxId);

	return [
		{
			json: toSandboxInfoData(info),
			pairedItem: { item: itemIndex },
		},
	];
}

export async function getMany(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const sandboxes = await listSandboxes(connection, getLimit(executeFunctions, itemIndex));

	return sandboxes.map((sandbox) => ({
		json: toSandboxInfoData(sandbox),
		pairedItem: { item: itemIndex },
	}));
}

export async function getPreviewUrl(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const sandboxId = getRequiredStringParameter(
		executeFunctions,
		'sandboxId',
		'Sandbox ID',
		itemIndex,
	);
	const port = getPort(executeFunctions, itemIndex);
	const sandbox = await connectSandbox(connection, sandboxId);
	const host = getPreviewHost(connection, sandbox, port);

	return [
		{
			json: {
				sandboxId,
				port,
				host,
				url: `https://${host}`,
			},
			pairedItem: { item: itemIndex },
		},
	];
}

export async function kill(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const sandboxId = getRequiredStringParameter(
		executeFunctions,
		'sandboxId',
		'Sandbox ID',
		itemIndex,
	);
	const killed = await killSandbox(connection, sandboxId);

	return [
		{
			json: {
				sandboxId,
				killed,
			},
			pairedItem: { item: itemIndex },
		},
	];
}

export async function pause(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const sandboxId = getRequiredStringParameter(
		executeFunctions,
		'sandboxId',
		'Sandbox ID',
		itemIndex,
	);
	const paused = await pauseSandbox(connection, sandboxId);

	return [
		{
			json: {
				sandboxId,
				paused,
			},
			pairedItem: { item: itemIndex },
		},
	];
}
