import {
	buildConnectOpts,
	getRequiredStringParameter,
	toFileInfoData,
} from '../helpers';
import type { E2BOperationContext } from '../types';

async function getConnectedSandbox(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
	const sandboxId = getRequiredStringParameter(
		executeFunctions,
		'sandboxId',
		'Sandbox ID',
		itemIndex,
	);
	const sandbox = await sdk.Sandbox.connect(sandboxId, buildConnectOpts(credentials, timeoutMs));

	return { sandbox, sandboxId };
}

export async function createFolder(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, timeoutMs } = context;
	const { sandbox, sandboxId } = await getConnectedSandbox(context);
	const path = getRequiredStringParameter(executeFunctions, 'path', 'Path', itemIndex);
	const created = await sandbox.files.makeDir(path, { requestTimeoutMs: timeoutMs });

	return [
		{
			json: {
				sandboxId,
				path,
				created,
			},
			pairedItem: { item: itemIndex },
		},
	];
}

export async function deleteFile(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, timeoutMs } = context;
	const { sandbox, sandboxId } = await getConnectedSandbox(context);
	const path = getRequiredStringParameter(executeFunctions, 'path', 'Path', itemIndex);
	await sandbox.files.remove(path, { requestTimeoutMs: timeoutMs });

	return [
		{
			json: {
				sandboxId,
				path,
				deleted: true,
			},
			pairedItem: { item: itemIndex },
		},
	];
}

export async function download(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, timeoutMs } = context;
	const { sandbox, sandboxId } = await getConnectedSandbox(context);
	const remotePath = getRequiredStringParameter(
		executeFunctions,
		'remotePath',
		'Remote Path',
		itemIndex,
	);
	const binaryPropertyName = getRequiredStringParameter(
		executeFunctions,
		'binaryPropertyName',
		'Binary Field',
		itemIndex,
	);
	const content = await sandbox.files.read(remotePath, {
		format: 'bytes',
		requestTimeoutMs: timeoutMs,
	});
	const filename = remotePath.split('/').pop()?.trim() || 'download';
	const binaryData = await executeFunctions.helpers.prepareBinaryData(
		Buffer.from(content),
		filename,
		'application/octet-stream',
	);

	return [
		{
			json: {
				sandboxId,
				remotePath,
				fileName: filename,
				sizeBytes: content.byteLength,
			},
			binary: {
				[binaryPropertyName]: binaryData,
			},
			pairedItem: { item: itemIndex },
		},
	];
}

export async function info(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, timeoutMs } = context;
	const { sandbox, sandboxId } = await getConnectedSandbox(context);
	const path = getRequiredStringParameter(executeFunctions, 'path', 'Path', itemIndex);
	const fileInfo = await sandbox.files.getInfo(path, { requestTimeoutMs: timeoutMs });

	return [
		{
			json: {
				sandboxId,
				...toFileInfoData(fileInfo),
			},
			pairedItem: { item: itemIndex },
		},
	];
}

export async function list(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, timeoutMs } = context;
	const { sandbox, sandboxId } = await getConnectedSandbox(context);
	const path = getRequiredStringParameter(executeFunctions, 'path', 'Path', itemIndex);
	const depth = Number(executeFunctions.getNodeParameter('depth', itemIndex, 1));
	const entries = await sandbox.files.list(path, {
		depth: Number.isInteger(depth) && depth > 0 ? depth : 1,
		requestTimeoutMs: timeoutMs,
	});

	return [
		{
			json: {
				sandboxId,
				path,
				count: entries.length,
				files: entries.map(toFileInfoData),
			},
			pairedItem: { item: itemIndex },
		},
	];
}

export async function move(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, timeoutMs } = context;
	const { sandbox, sandboxId } = await getConnectedSandbox(context);
	const source = getRequiredStringParameter(executeFunctions, 'source', 'Source', itemIndex);
	const destination = getRequiredStringParameter(
		executeFunctions,
		'destination',
		'Destination',
		itemIndex,
	);
	const fileInfo = await sandbox.files.rename(source, destination, {
		requestTimeoutMs: timeoutMs,
	});

	return [
		{
			json: {
				sandboxId,
				source,
				destination,
				...toFileInfoData(fileInfo),
			},
			pairedItem: { item: itemIndex },
		},
	];
}

export async function read(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, timeoutMs } = context;
	const { sandbox, sandboxId } = await getConnectedSandbox(context);
	const path = getRequiredStringParameter(executeFunctions, 'path', 'Path', itemIndex);
	const content = await sandbox.files.read(path, {
		format: 'text',
		requestTimeoutMs: timeoutMs,
	});

	return [
		{
			json: {
				sandboxId,
				path,
				content,
			},
			pairedItem: { item: itemIndex },
		},
	];
}

export async function upload(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, timeoutMs } = context;
	const { sandbox, sandboxId } = await getConnectedSandbox(context);
	const remotePath = getRequiredStringParameter(
		executeFunctions,
		'remotePath',
		'Remote Path',
		itemIndex,
	);
	const binaryPropertyName = getRequiredStringParameter(
		executeFunctions,
		'binaryPropertyName',
		'Binary Field',
		itemIndex,
	);
	const binaryMeta = executeFunctions.helpers.assertBinaryData(itemIndex, binaryPropertyName);
	const buffer = await executeFunctions.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const content = new Uint8Array(buffer).buffer;
	const fileInfo = await sandbox.files.write(remotePath, content, {
		requestTimeoutMs: timeoutMs,
	});

	return [
		{
			json: {
				sandboxId,
				remotePath,
				fileName: binaryMeta.fileName,
				mimeType: binaryMeta.mimeType,
				sizeBytes: buffer.length,
				...toFileInfoData(fileInfo),
			},
			pairedItem: { item: itemIndex },
		},
	];
}

export async function write(context: E2BOperationContext) {
	const { executeFunctions, itemIndex, timeoutMs } = context;
	const { sandbox, sandboxId } = await getConnectedSandbox(context);
	const path = getRequiredStringParameter(executeFunctions, 'path', 'Path', itemIndex);
	const content = executeFunctions.getNodeParameter('content', itemIndex, '');
	const fileInfo = await sandbox.files.write(path, String(content), {
		requestTimeoutMs: timeoutMs,
	});

	return [
		{
			json: {
				sandboxId,
				contentLength: String(content).length,
				...toFileInfoData(fileInfo),
			},
			pairedItem: { item: itemIndex },
		},
	];
}
