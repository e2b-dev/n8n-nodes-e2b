import type { E2BOperationContext } from '../types';
import {
	buildApiOpts,
	buildConnectOpts,
	getCreateOpts,
	getLimit,
	getPort,
	getRequiredStringParameter,
	toSandboxInfoData,
} from '../helpers';

export async function create(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
	const sandbox = await sdk.Sandbox.create(getCreateOpts(executeFunctions, credentials, itemIndex));
	const info = await sandbox.getInfo(buildApiOpts(credentials, timeoutMs));

	return [
		{
			json: toSandboxInfoData(info, sandbox.sandboxDomain),
			pairedItem: { item: itemIndex },
		},
	];
}

export async function get(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
	const sandboxId = getRequiredStringParameter(
		executeFunctions,
		'sandboxId',
		'Sandbox ID',
		itemIndex,
	);
	const info = await sdk.Sandbox.getInfo(sandboxId, buildApiOpts(credentials, timeoutMs));

	return [
		{
			json: toSandboxInfoData(info),
			pairedItem: { item: itemIndex },
		},
	];
}

export async function getMany(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
	const paginator = sdk.Sandbox.list({
		...buildApiOpts(credentials, timeoutMs),
		limit: getLimit(executeFunctions, itemIndex),
	});
	const sandboxes = await paginator.nextItems();

	return sandboxes.map((sandbox) => ({
		json: toSandboxInfoData(sandbox),
		pairedItem: { item: itemIndex },
	}));
}

export async function getPreviewUrl(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
	const sandboxId = getRequiredStringParameter(
		executeFunctions,
		'sandboxId',
		'Sandbox ID',
		itemIndex,
	);
	const port = getPort(executeFunctions, itemIndex);
	const sandbox = await sdk.Sandbox.connect(sandboxId, buildConnectOpts(credentials, timeoutMs));
	const host = sandbox.getHost(port);

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
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
	const sandboxId = getRequiredStringParameter(
		executeFunctions,
		'sandboxId',
		'Sandbox ID',
		itemIndex,
	);
	await sdk.Sandbox.kill(sandboxId, buildApiOpts(credentials, timeoutMs));

	return [
		{
			json: {
				sandboxId,
				killed: true,
			},
			pairedItem: { item: itemIndex },
		},
	];
}

export async function pause(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
	const sandboxId = getRequiredStringParameter(
		executeFunctions,
		'sandboxId',
		'Sandbox ID',
		itemIndex,
	);
	await sdk.Sandbox.pause(sandboxId, buildApiOpts(credentials, timeoutMs));

	return [
		{
			json: {
				sandboxId,
				paused: true,
			},
			pairedItem: { item: itemIndex },
		},
	];
}
