import { createSnapshot, deleteSnapshot as deleteSnapshotById, listSnapshots } from '../client';
import {
	asNonEmptyString,
	getLimit,
	getRequiredStringParameter,
	toSnapshotInfoData,
} from '../helpers';
import type { E2BOperationContext } from '../types';

export async function create(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const sandboxId = getRequiredStringParameter(
		executeFunctions,
		'sandboxId',
		'Sandbox ID',
		itemIndex,
	);
	const snapshotName = asNonEmptyString(
		executeFunctions.getNodeParameter('snapshotName', itemIndex, ''),
	);
	const snapshot = await createSnapshot(connection, sandboxId, snapshotName);

	return [
		{
			json: toSnapshotInfoData(snapshot),
			pairedItem: { item: itemIndex },
		},
	];
}

export async function getMany(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const sandboxId = asNonEmptyString(executeFunctions.getNodeParameter('sandboxId', itemIndex, ''));
	const snapshots = await listSnapshots(
		connection,
		getLimit(executeFunctions, itemIndex),
		sandboxId,
	);

	return snapshots.map((snapshot) => ({
		json: toSnapshotInfoData(snapshot),
		pairedItem: { item: itemIndex },
	}));
}

export async function deleteSnapshot(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const snapshotId = getRequiredStringParameter(
		executeFunctions,
		'snapshotId',
		'Snapshot ID',
		itemIndex,
	);
	const deleted = await deleteSnapshotById(connection, snapshotId);

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
