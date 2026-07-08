import {
	connectSandbox,
	createSandbox,
	getPreviewHost,
	getSandboxInfo,
	killSandbox,
	listSandboxes,
	pauseSandbox,
} from '../client';
import { NodeOperationError } from 'n8n-workflow';

import {
	getLimit,
	getPort,
	getRequiredStringParameter,
	getSandboxCreateOptions,
	parseStringMapParameter,
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
	const getBy = executeFunctions.getNodeParameter('getBy', itemIndex, 'id') as string;

	let sandboxId: string;
	if (getBy === 'metadata') {
		const metadata = parseStringMapParameter(
			executeFunctions,
			executeFunctions.getNodeParameter('filterMetadataJson', itemIndex, ''),
			'Metadata Filter',
			itemIndex,
		);
		if (!metadata) {
			throw new NodeOperationError(
				executeFunctions.getNode(),
				'Metadata Filter must contain at least one key-value pair',
				{ itemIndex },
			);
		}
		const matches = await listSandboxes(connection, { metadata, limit: 1 });
		if (matches.length === 0) {
			throw new NodeOperationError(
				executeFunctions.getNode(),
				'No sandbox found matching the metadata filter',
				{ itemIndex },
			);
		}
		sandboxId = matches[0].sandboxId;
	} else {
		sandboxId = getRequiredStringParameter(executeFunctions, 'sandboxId', 'Sandbox ID', itemIndex);
	}

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
	const sandboxes = await listSandboxes(connection, {
		limit: getLimit(executeFunctions, itemIndex),
	});

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
