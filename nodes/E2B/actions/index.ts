import * as code from './code.operations';
import * as file from './file.operations';
import * as git from './git.operations';
import * as sandbox from './sandbox.operations';
import * as snapshot from './snapshot.operations';
import * as volume from './volume.operations';
import type { E2BOperationHandler, Operation, OperationForResource, Resource } from '../types';

const operationHandlers = {
	code: {
		runCommand: code.runCommand,
	},
	file: {
		createFolder: file.createFolder,
		delete: file.deleteFile,
		download: file.download,
		info: file.info,
		list: file.list,
		move: file.move,
		read: file.read,
		upload: file.upload,
		write: file.write,
	},
	git: {
		add: git.add,
		checkout: git.checkout,
		clone: git.clone,
		commit: git.commit,
		pull: git.pull,
		push: git.push,
		status: git.status,
	},
	sandbox: {
		create: sandbox.create,
		get: sandbox.get,
		getMany: sandbox.getMany,
		getPreviewUrl: sandbox.getPreviewUrl,
		kill: sandbox.kill,
		pause: sandbox.pause,
	},
	snapshot: {
		create: snapshot.create,
		delete: snapshot.deleteSnapshot,
		getMany: snapshot.getMany,
	},
	volume: {
		create: volume.create,
		delete: volume.deleteVolume,
		get: volume.get,
		getMany: volume.getMany,
	},
} satisfies {
	[R in Resource]: Record<OperationForResource<R>, E2BOperationHandler>;
};

export function getOperationHandler(
	resource: Resource,
	operation: Operation,
): E2BOperationHandler {
	const resourceHandlers: Partial<Record<Operation, E2BOperationHandler>> =
		operationHandlers[resource];
	const handler = resourceHandlers[operation];

	if (!handler) {
		throw new Error(`Operation "${operation}" is not implemented for resource "${resource}"`);
	}

	return handler;
}
