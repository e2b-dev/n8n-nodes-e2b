import {
	connectSandbox,
	createSandboxFolder,
	deleteSandboxFile,
	getSandboxFileInfo,
	listSandboxFiles,
	moveSandboxFile,
	readSandboxFile,
	writeSandboxFile,
} from '../client';
import { getRequiredStringParameter, toFileInfoData } from '../helpers';
import type { E2BOperationContext } from '../types';

async function getConnectedSandbox(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const sandboxId = getRequiredStringParameter(
		executeFunctions,
		'sandboxId',
		'Sandbox ID',
		itemIndex,
	);
	const sandbox = await connectSandbox(connection, sandboxId);

	return { connection, sandbox, sandboxId };
}

export async function createFolder(context: E2BOperationContext) {
	const { executeFunctions, itemIndex } = context;
	const { connection, sandbox, sandboxId } = await getConnectedSandbox(context);
	const path = getRequiredStringParameter(executeFunctions, 'path', 'Path', itemIndex);
	const created = await createSandboxFolder(connection, sandbox, path);

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
	const { executeFunctions, itemIndex } = context;
	const { connection, sandbox, sandboxId } = await getConnectedSandbox(context);
	const path = getRequiredStringParameter(executeFunctions, 'path', 'Path', itemIndex);
	await deleteSandboxFile(connection, sandbox, path);

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
	const { executeFunctions, itemIndex } = context;
	const { connection, sandbox, sandboxId } = await getConnectedSandbox(context);
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
	const content = await readSandboxFile(connection, sandbox, remotePath, 'bytes');
	const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
	const filename = remotePath.split('/').pop()?.trim() || 'download';
	const binaryData = await executeFunctions.helpers.prepareBinaryData(
		buffer,
		filename,
		'application/octet-stream',
	);

	return [
		{
			json: {
				sandboxId,
				remotePath,
				fileName: filename,
				sizeBytes: buffer.byteLength,
			},
			binary: {
				[binaryPropertyName]: binaryData,
			},
			pairedItem: { item: itemIndex },
		},
	];
}

export async function info(context: E2BOperationContext) {
	const { executeFunctions, itemIndex } = context;
	const { connection, sandbox, sandboxId } = await getConnectedSandbox(context);
	const path = getRequiredStringParameter(executeFunctions, 'path', 'Path', itemIndex);
	const fileInfo = await getSandboxFileInfo(connection, sandbox, path);

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
	const { executeFunctions, itemIndex } = context;
	const { connection, sandbox, sandboxId } = await getConnectedSandbox(context);
	const path = getRequiredStringParameter(executeFunctions, 'path', 'Path', itemIndex);
	const depth = Number(executeFunctions.getNodeParameter('depth', itemIndex, 1));
	const entries = await listSandboxFiles(
		connection,
		sandbox,
		path,
		Number.isInteger(depth) && depth > 0 ? depth : 1,
	);

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
	const { executeFunctions, itemIndex } = context;
	const { connection, sandbox, sandboxId } = await getConnectedSandbox(context);
	const source = getRequiredStringParameter(executeFunctions, 'source', 'Source', itemIndex);
	const destination = getRequiredStringParameter(
		executeFunctions,
		'destination',
		'Destination',
		itemIndex,
	);
	const fileInfo = await moveSandboxFile(connection, sandbox, source, destination);

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
	const { executeFunctions, itemIndex } = context;
	const { connection, sandbox, sandboxId } = await getConnectedSandbox(context);
	const path = getRequiredStringParameter(executeFunctions, 'path', 'Path', itemIndex);
	const content = await readSandboxFile(connection, sandbox, path, 'text');

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
	const { executeFunctions, itemIndex } = context;
	const { connection, sandbox, sandboxId } = await getConnectedSandbox(context);
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
	const fileInfo = await writeSandboxFile(connection, sandbox, remotePath, buffer);

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
	const { executeFunctions, itemIndex } = context;
	const { connection, sandbox, sandboxId } = await getConnectedSandbox(context);
	const path = getRequiredStringParameter(executeFunctions, 'path', 'Path', itemIndex);
	const content = executeFunctions.getNodeParameter('content', itemIndex, '');
	const fileInfo = await writeSandboxFile(connection, sandbox, path, String(content));

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
