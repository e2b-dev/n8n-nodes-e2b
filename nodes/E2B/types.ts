import type {
	ICredentialDataDecryptedObject,
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';

export const RESOURCE_OPERATIONS = {
	code: ['runCommand'],
	file: ['createFolder', 'delete', 'download', 'info', 'list', 'move', 'read', 'upload', 'write'],
	git: ['add', 'checkout', 'clone', 'commit', 'pull', 'push', 'status'],
	sandbox: ['create', 'get', 'getMany', 'getPreviewUrl', 'kill', 'pause'],
	snapshot: ['create', 'delete', 'getMany'],
	volume: ['create', 'delete', 'get', 'getMany'],
} as const;

export type Resource = keyof typeof RESOURCE_OPERATIONS;

export type OperationForResource<R extends Resource> = (typeof RESOURCE_OPERATIONS)[R][number];

export type Operation = OperationForResource<Resource>;

export interface E2BOperationContext {
	executeFunctions: IExecuteFunctions;
	credentials: ICredentialDataDecryptedObject;
	itemIndex: number;
	timeoutMs: number;
}

export type E2BOperationHandler = (
	context: E2BOperationContext,
) => Promise<INodeExecutionData[]>;

export function isResource(value: unknown): value is Resource {
	return typeof value === 'string' && value in RESOURCE_OPERATIONS;
}

export function isOperationForResource<R extends Resource>(
	resource: R,
	value: unknown,
): value is OperationForResource<R> {
	return (
		typeof value === 'string' &&
		RESOURCE_OPERATIONS[resource].some((operation) => operation === value)
	);
}
