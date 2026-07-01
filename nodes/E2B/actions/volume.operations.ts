import { createVolume, deleteVolume as deleteVolumeById, getVolume, listVolumes } from '../client';
import { getLimit, getRequiredStringParameter, toVolumeInfoData } from '../helpers';
import type { E2BOperationContext } from '../types';

export async function create(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const name = getRequiredStringParameter(
		executeFunctions,
		'volumeName',
		'Volume Name',
		itemIndex,
	);
	const volume = await createVolume(connection, name);

	return [
		{
			json: toVolumeInfoData(volume),
			pairedItem: { item: itemIndex },
		},
	];
}

export async function get(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const volumeId = getRequiredStringParameter(executeFunctions, 'volumeId', 'Volume ID', itemIndex);
	const volume = await getVolume(connection, volumeId);

	return [
		{
			json: toVolumeInfoData(volume),
			pairedItem: { item: itemIndex },
		},
	];
}

export async function getMany(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const volumes = await listVolumes(connection);

	return volumes.slice(0, getLimit(executeFunctions, itemIndex)).map((volume) => ({
		json: toVolumeInfoData(volume),
		pairedItem: { item: itemIndex },
	}));
}

export async function deleteVolume(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const volumeId = getRequiredStringParameter(executeFunctions, 'volumeId', 'Volume ID', itemIndex);
	const deleted = await deleteVolumeById(connection, volumeId);

	return [
		{
			json: {
				volumeId,
				deleted,
			},
			pairedItem: { item: itemIndex },
		},
	];
}
