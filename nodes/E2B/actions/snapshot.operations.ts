import {
	asNonEmptyString,
	buildApiOpts,
	getLimit,
	getRequiredStringParameter,
	toSnapshotInfoData,
} from '../helpers';
import type { E2BOperationContext } from '../types';

export async function create(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
	const sandboxId = getRequiredStringParameter(
		executeFunctions,
		'sandboxId',
		'Sandbox ID',
		itemIndex,
	);
	const snapshotName = asNonEmptyString(
		executeFunctions.getNodeParameter('snapshotName', itemIndex, ''),
	);
	const snapshot = await sdk.Sandbox.createSnapshot(sandboxId, {
		...buildApiOpts(credentials, timeoutMs),
		...(snapshotName ? { name: snapshotName } : {}),
	});

	return [
		{
			json: toSnapshotInfoData(snapshot),
			pairedItem: { item: itemIndex },
		},
	];
}

export async function getMany(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
	const sandboxId = asNonEmptyString(executeFunctions.getNodeParameter('sandboxId', itemIndex, ''));
	const paginator = sdk.Sandbox.listSnapshots({
		...buildApiOpts(credentials, timeoutMs),
		...(sandboxId ? { sandboxId } : {}),
		limit: getLimit(executeFunctions, itemIndex),
	});
	const snapshots = await paginator.nextItems();

	return snapshots.map((snapshot) => ({
		json: toSnapshotInfoData(snapshot),
		pairedItem: { item: itemIndex },
	}));
}

export async function deleteSnapshot(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
	const snapshotId = getRequiredStringParameter(
		executeFunctions,
		'snapshotId',
		'Snapshot ID',
		itemIndex,
	);
	const deleted = await sdk.Sandbox.deleteSnapshot(
		snapshotId,
		buildApiOpts(credentials, timeoutMs),
	);

	return [
		{
			json: {
				snapshotId,
				deleted,
			},
			pairedItem: { item: itemIndex },
		},
	];
}
