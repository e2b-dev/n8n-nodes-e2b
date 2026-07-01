import {
	buildBaseConnectionOpts,
	getLimit,
	getRequiredStringParameter,
	toVolumeInfoData,
} from '../helpers';
import type { E2BOperationContext } from '../types';

export async function create(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
	const name = getRequiredStringParameter(
		executeFunctions,
		'volumeName',
		'Volume Name',
		itemIndex,
	);
	const volume = await sdk.Volume.create(name, buildBaseConnectionOpts(credentials, timeoutMs));

	return [
		{
			json: toVolumeInfoData(volume),
			pairedItem: { item: itemIndex },
		},
	];
}

export async function get(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
	const volumeId = getRequiredStringParameter(executeFunctions, 'volumeId', 'Volume ID', itemIndex);
	const volume = await sdk.Volume.getInfo(volumeId, buildBaseConnectionOpts(credentials, timeoutMs));

	return [
		{
			json: toVolumeInfoData(volume),
			pairedItem: { item: itemIndex },
		},
	];
}

export async function getMany(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
	const volumes = await sdk.Volume.list(buildBaseConnectionOpts(credentials, timeoutMs));

	return volumes.slice(0, getLimit(executeFunctions, itemIndex)).map((volume) => ({
		json: toVolumeInfoData(volume),
		pairedItem: { item: itemIndex },
	}));
}

export async function deleteVolume(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
	const volumeId = getRequiredStringParameter(executeFunctions, 'volumeId', 'Volume ID', itemIndex);
	const deleted = await sdk.Volume.destroy(volumeId, buildBaseConnectionOpts(credentials, timeoutMs));

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
