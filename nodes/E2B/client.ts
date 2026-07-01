import type {
	ICredentialDataDecryptedObject,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

const CREDENTIAL_TYPE = 'e2bApi';
const DEFAULT_DOMAIN = 'e2b.app';
const DEFAULT_API_URL = `https://api.${DEFAULT_DOMAIN}`;
const DEFAULT_SANDBOX_TIMEOUT_MS = 300_000;
const ENVD_PORT = 49983;
const ENVD_DEFAULT_USER = '0.4.0';
const SUPPORTED_SANDBOX_DOMAINS = new Set(['e2b.app', 'e2b.dev', 'e2b.pro', 'e2b-staging.dev']);
const CONNECT_PROTOCOL_VERSION = '1';
const CONNECT_END_STREAM_FLAG = 0b00000010;
const CONNECT_COMPRESSED_FLAG = 0b00000001;

export interface E2BConnection {
	executeFunctions: IExecuteFunctions;
	credentials: ICredentialDataDecryptedObject;
	timeoutMs: number;
}

export interface SandboxCreateOptions {
	template?: string;
	metadata?: Record<string, string>;
	envs?: Record<string, string>;
	volumeMounts?: Record<string, string>;
	allowInternetAccess: boolean;
	timeoutMs: number;
}

export interface SandboxInfo {
	sandboxId: string;
	templateId: string;
	name?: string;
	metadata: Record<string, string>;
	startedAt?: string;
	endAt?: string;
	state?: string;
	cpuCount?: number;
	memoryMB?: number;
	envdVersion?: string;
	allowInternetAccess?: boolean;
	network?: IDataObject;
	lifecycle?: IDataObject;
	volumeMounts?: IDataObject[];
	sandboxDomain?: string;
}

export interface ConnectedSandbox {
	sandboxId: string;
	sandboxDomain?: string;
	envdVersion: string;
	envdAccessToken?: string;
	trafficAccessToken?: string;
}

export interface SnapshotInfo {
	snapshotId: string;
	names: string[];
}

export interface VolumeInfo {
	volumeId: string;
	name: string;
	token?: string;
}

export interface FileInfo {
	name: string;
	type?: 'file' | 'dir';
	path: string;
	metadata?: Record<string, string>;
	size?: number;
	mode?: number;
	permissions?: string;
	owner?: string;
	group?: string;
	modifiedTime?: string;
	symlinkTarget?: string;
}

export interface WriteInfo {
	name: string;
	type?: 'file' | 'dir';
	path: string;
	metadata?: Record<string, string>;
}

export interface CommandResult {
	exitCode: number;
	error?: string;
	stdout: string;
	stderr: string;
}

interface FullResponse {
	statusCode?: number;
	status?: number;
	headers?: IDataObject;
	body?: unknown;
}

interface ApiRequestOptions {
	body?: IDataObject | IDataObject[] | Buffer | FormData;
	qs?: IDataObject;
	headers?: IDataObject;
	encoding?: IHttpRequestOptions['encoding'];
	returnFullResponse?: boolean;
	ignoreHttpStatusErrors?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
	return Object.fromEntries(Object.entries(value));
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
	const numberValue = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(numberValue) ? numberValue : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function cleanBaseUrl(url: string): string {
	return url.replace(/\/+$/, '');
}

function getCredentialString(credentials: ICredentialDataDecryptedObject, key: string): string | undefined {
	return asString(credentials[key]);
}

function getApiBaseUrl(credentials: ICredentialDataDecryptedObject): string {
	return cleanBaseUrl(getCredentialString(credentials, 'apiUrl') ?? DEFAULT_API_URL);
}

function getDomain(credentials: ICredentialDataDecryptedObject): string {
	return getCredentialString(credentials, 'domain') ?? DEFAULT_DOMAIN;
}

function getStatusCode(response: FullResponse): number | undefined {
	return response.statusCode ?? response.status;
}

function toJsonObject(value: unknown, fallbackMessage: string): JsonObject {
	const record = asRecord(value);
	if (record) return record as JsonObject;
	return { message: fallbackMessage };
}

function getErrorMessageFromBody(body: unknown, fallback: string): string {
	const record = asRecord(body);
	const message = asString(record?.message);
	if (message) return message;
	const error = record?.error;
	if (typeof error === 'string') return error;
	const nested = asRecord(error);
	const nestedMessage = asString(nested?.message);
	return nestedMessage ?? fallback;
}

function throwApiResponseError(
	executeFunctions: IExecuteFunctions,
	response: FullResponse,
	fallbackMessage: string,
): never {
	const statusCode = getStatusCode(response);
	const message = getErrorMessageFromBody(
		response.body,
		statusCode ? `${statusCode}: ${fallbackMessage}` : fallbackMessage,
	);
	throw new NodeApiError(executeFunctions.getNode(), toJsonObject(response.body, message));
}

async function apiRequest<T>(
	connection: E2BConnection,
	method: IHttpRequestMethods,
	endpoint: string,
	options: ApiRequestOptions = {},
): Promise<T> {
	const requestOptions: IHttpRequestOptions = {
		method,
		url: `${getApiBaseUrl(connection.credentials)}${endpoint}`,
		headers: options.headers,
		qs: options.qs,
		body: options.body,
		encoding: options.encoding,
		returnFullResponse: options.returnFullResponse,
		ignoreHttpStatusErrors: options.ignoreHttpStatusErrors,
		timeout: connection.timeoutMs,
	};

	try {
		return (await connection.executeFunctions.helpers.httpRequestWithAuthentication.call(
			connection.executeFunctions,
			CREDENTIAL_TYPE,
			requestOptions,
		)) as T;
	} catch (error) {
		throw new NodeApiError(connection.executeFunctions.getNode(), toJsonObject(error, 'E2B API request failed'));
	}
}

async function apiRequestFull(
	connection: E2BConnection,
	method: IHttpRequestMethods,
	endpoint: string,
	options: ApiRequestOptions = {},
): Promise<FullResponse> {
	return await apiRequest<FullResponse>(connection, method, endpoint, {
		...options,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	});
}

function mapSandboxInfo(value: unknown): SandboxInfo {
	const record = asRecord(value) ?? {};
	return {
		sandboxId: asString(record.sandboxID) ?? asString(record.sandboxId) ?? '',
		templateId: asString(record.templateID) ?? asString(record.templateId) ?? '',
		...(asString(record.alias) ? { name: asString(record.alias) } : {}),
		metadata: (asRecord(record.metadata) as Record<string, string> | undefined) ?? {},
		startedAt: asString(record.startedAt),
		endAt: asString(record.endAt),
		state: asString(record.state),
		cpuCount: asNumber(record.cpuCount),
		memoryMB: asNumber(record.memoryMB),
		envdVersion: asString(record.envdVersion),
		allowInternetAccess: asBoolean(record.allowInternetAccess),
		network: asRecord(record.network) as IDataObject | undefined,
		lifecycle: asRecord(record.lifecycle) as IDataObject | undefined,
		volumeMounts: Array.isArray(record.volumeMounts) ? (record.volumeMounts as IDataObject[]) : [],
		sandboxDomain: asString(record.domain) ?? asString(record.sandboxDomain),
	};
}

function mapConnectedSandbox(value: unknown, sandboxId?: string): ConnectedSandbox {
	const record = asRecord(value) ?? {};
	return {
		sandboxId: asString(record.sandboxID) ?? asString(record.sandboxId) ?? sandboxId ?? '',
		sandboxDomain: asString(record.domain) ?? asString(record.sandboxDomain),
		envdVersion: asString(record.envdVersion) ?? '0.0.0',
		envdAccessToken: asString(record.envdAccessToken),
		trafficAccessToken: asString(record.trafficAccessToken),
	};
}

function mapSnapshot(value: unknown): SnapshotInfo {
	const record = asRecord(value) ?? {};
	return {
		snapshotId: asString(record.snapshotID) ?? asString(record.snapshotId) ?? '',
		names: asStringArray(record.names),
	};
}

function mapVolume(value: unknown): VolumeInfo {
	const record = asRecord(value) ?? {};
	return {
		volumeId: asString(record.volumeID) ?? asString(record.volumeId) ?? '',
		name: asString(record.name) ?? '',
		token: asString(record.token),
	};
}

function timeoutToSeconds(timeoutMs: number): number {
	return Math.round(timeoutMs / 1000);
}

export async function createSandbox(
	connection: E2BConnection,
	options: SandboxCreateOptions,
): Promise<ConnectedSandbox> {
	const body: IDataObject = {
		templateID: options.template ?? 'base',
		metadata: options.metadata,
		envVars: options.envs,
		timeout: timeoutToSeconds(options.timeoutMs),
		secure: true,
		allow_internet_access: options.allowInternetAccess,
	};

	if (options.volumeMounts) {
		body.volumeMounts = Object.entries(options.volumeMounts).map(([path, name]) => ({ name, path }));
	}

	const response = await apiRequest<unknown>(connection, 'POST', '/sandboxes', { body });
	return mapConnectedSandbox(response);
}

export async function connectSandbox(connection: E2BConnection, sandboxId: string): Promise<ConnectedSandbox> {
	const response = await apiRequest<unknown>(connection, 'POST', `/sandboxes/${encodeURIComponent(sandboxId)}/connect`, {
		body: {
			timeout: timeoutToSeconds(DEFAULT_SANDBOX_TIMEOUT_MS),
		},
	});
	return mapConnectedSandbox(response, sandboxId);
}

export async function getSandboxInfo(connection: E2BConnection, sandboxId: string): Promise<SandboxInfo> {
	const response = await apiRequest<unknown>(connection, 'GET', `/sandboxes/${encodeURIComponent(sandboxId)}`);
	return mapSandboxInfo(response);
}

export async function listSandboxes(connection: E2BConnection, limit: number): Promise<SandboxInfo[]> {
	const response = await apiRequest<unknown>(connection, 'GET', '/v2/sandboxes', { qs: { limit } });
	return Array.isArray(response) ? response.map(mapSandboxInfo) : [];
}

export async function killSandbox(connection: E2BConnection, sandboxId: string): Promise<boolean> {
	const response = await apiRequestFull(connection, 'DELETE', `/sandboxes/${encodeURIComponent(sandboxId)}`);
	const statusCode = getStatusCode(response);
	if (statusCode === 404) return false;
	if (statusCode && statusCode >= 400) throwApiResponseError(connection.executeFunctions, response, 'Failed to kill sandbox');
	return true;
}

export async function pauseSandbox(connection: E2BConnection, sandboxId: string): Promise<boolean> {
	const response = await apiRequestFull(connection, 'POST', `/sandboxes/${encodeURIComponent(sandboxId)}/pause`, {
		body: { memory: true },
	});
	const statusCode = getStatusCode(response);
	if (statusCode === 409) return false;
	if (statusCode && statusCode >= 400) throwApiResponseError(connection.executeFunctions, response, 'Failed to pause sandbox');
	return true;
}

export async function createSnapshot(
	connection: E2BConnection,
	sandboxId: string,
	name?: string,
): Promise<SnapshotInfo> {
	const response = await apiRequest<unknown>(connection, 'POST', `/sandboxes/${encodeURIComponent(sandboxId)}/snapshots`, {
		body: name ? { name } : {},
	});
	return mapSnapshot(response);
}

export async function listSnapshots(
	connection: E2BConnection,
	limit: number,
	sandboxId?: string,
): Promise<SnapshotInfo[]> {
	const response = await apiRequest<unknown>(connection, 'GET', '/snapshots', {
		qs: {
			limit,
			...(sandboxId ? { sandboxID: sandboxId } : {}),
		},
	});
	return Array.isArray(response) ? response.map(mapSnapshot) : [];
}

export async function deleteSnapshot(connection: E2BConnection, snapshotId: string): Promise<boolean> {
	const response = await apiRequestFull(connection, 'DELETE', `/templates/${encodeURIComponent(snapshotId)}`);
	const statusCode = getStatusCode(response);
	if (statusCode === 404) return false;
	if (statusCode && statusCode >= 400) throwApiResponseError(connection.executeFunctions, response, 'Failed to delete snapshot');
	return true;
}

export async function createVolume(connection: E2BConnection, name: string): Promise<VolumeInfo> {
	const response = await apiRequest<unknown>(connection, 'POST', '/volumes', { body: { name } });
	return mapVolume(response);
}

export async function getVolume(connection: E2BConnection, volumeId: string): Promise<VolumeInfo> {
	const response = await apiRequest<unknown>(connection, 'GET', `/volumes/${encodeURIComponent(volumeId)}`);
	return mapVolume(response);
}

export async function listVolumes(connection: E2BConnection): Promise<VolumeInfo[]> {
	const response = await apiRequest<unknown>(connection, 'GET', '/volumes');
	return Array.isArray(response) ? response.map(mapVolume) : [];
}

export async function deleteVolume(connection: E2BConnection, volumeId: string): Promise<boolean> {
	const response = await apiRequestFull(connection, 'DELETE', `/volumes/${encodeURIComponent(volumeId)}`);
	const statusCode = getStatusCode(response);
	if (statusCode === 404) return false;
	if (statusCode && statusCode >= 400) throwApiResponseError(connection.executeFunctions, response, 'Failed to delete volume');
	return true;
}

function getSandboxHost(connection: E2BConnection, sandboxId: string, port: number, sandboxDomain?: string): string {
	return `${port}-${sandboxId}.${sandboxDomain ?? getDomain(connection.credentials)}`;
}

export function getPreviewHost(connection: E2BConnection, sandbox: ConnectedSandbox, port: number): string {
	return getSandboxHost(connection, sandbox.sandboxId, port, sandbox.sandboxDomain);
}

function getEnvdBaseUrl(connection: E2BConnection, sandbox: ConnectedSandbox): string {
	const sandboxUrl = getCredentialString(connection.credentials, 'sandboxUrl');
	if (sandboxUrl) return cleanBaseUrl(sandboxUrl);

	const sandboxDomain = sandbox.sandboxDomain ?? getDomain(connection.credentials);
	if (SUPPORTED_SANDBOX_DOMAINS.has(sandboxDomain)) {
		return `https://sandbox.${sandboxDomain}`;
	}

	return `https://${getSandboxHost(connection, sandbox.sandboxId, ENVD_PORT, sandboxDomain)}`;
}

function compareVersion(left: string, right: string): number {
	const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
	const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
	const length = Math.max(leftParts.length, rightParts.length);
	for (let index = 0; index < length; index++) {
		const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

function sandboxHeaders(connection: E2BConnection, sandbox: ConnectedSandbox): IDataObject {
	const headers: IDataObject = {
		'E2b-Sandbox-Id': sandbox.sandboxId,
		'E2b-Sandbox-Port': ENVD_PORT.toString(),
	};

	if (sandbox.envdAccessToken) {
		headers['X-Access-Token'] = sandbox.envdAccessToken;
	}

	if (compareVersion(sandbox.envdVersion, ENVD_DEFAULT_USER) < 0) {
		headers.Authorization = `Basic ${Buffer.from('user:').toString('base64')}`;
	}

	return headers;
}

async function envdRequest<T>(
	connection: E2BConnection,
	sandbox: ConnectedSandbox,
	method: IHttpRequestMethods,
	path: string,
	options: ApiRequestOptions = {},
): Promise<T> {
	const requestOptions: IHttpRequestOptions = {
		method,
		url: `${getEnvdBaseUrl(connection, sandbox)}${path}`,
		headers: {
			...sandboxHeaders(connection, sandbox),
			...options.headers,
		},
		qs: options.qs,
		body: options.body,
		encoding: options.encoding,
		returnFullResponse: options.returnFullResponse,
		ignoreHttpStatusErrors: options.ignoreHttpStatusErrors,
		timeout: connection.timeoutMs,
	};

	try {
		return (await connection.executeFunctions.helpers.httpRequest(requestOptions)) as T;
	} catch (error) {
		throw new NodeApiError(connection.executeFunctions.getNode(), toJsonObject(error, 'E2B sandbox request failed'));
	}
}

function encodeConnectEnvelope(message: IDataObject): Buffer {
	const payload = Buffer.from(JSON.stringify(message), 'utf8');
	const envelope = Buffer.alloc(payload.length + 5);
	envelope.writeUInt8(0, 0);
	envelope.writeUInt32BE(payload.length, 1);
	payload.copy(envelope, 5);
	return envelope;
}

function parseConnectEnvelopes(body: ArrayBuffer | Buffer): IDataObject[] {
	const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
	const messages: IDataObject[] = [];
	let offset = 0;

	while (offset < buffer.length) {
		if (offset + 5 > buffer.length) {
			throw new Error('Incomplete Connect response envelope');
		}
		const flags = buffer.readUInt8(offset);
		const length = buffer.readUInt32BE(offset + 1);
		const start = offset + 5;
		const end = start + length;
		if (end > buffer.length) {
			throw new Error('Incomplete Connect response message');
		}
		if ((flags & CONNECT_COMPRESSED_FLAG) === CONNECT_COMPRESSED_FLAG) {
			throw new Error('Compressed Connect responses are not supported');
		}

		const json = JSON.parse(buffer.subarray(start, end).toString('utf8')) as unknown;
		const record = asRecord(json) ?? {};
		if ((flags & CONNECT_END_STREAM_FLAG) === CONNECT_END_STREAM_FLAG) {
			const error = asRecord(record.error);
			if (error) throw new Error(getErrorMessageFromBody(error, 'E2B Connect request failed'));
		} else {
			messages.push(record as IDataObject);
		}
		offset = end;
	}

	return messages;
}

async function connectUnary<T extends IDataObject>(
	connection: E2BConnection,
	sandbox: ConnectedSandbox,
	service: string,
	method: string,
	body: IDataObject,
): Promise<T> {
	const response = await envdRequest<FullResponse>(connection, sandbox, 'POST', `/${service}/${method}`, {
		body,
		headers: {
			'Content-Type': 'application/json',
			'Connect-Protocol-Version': CONNECT_PROTOCOL_VERSION,
			'Connect-Timeout-Ms': connection.timeoutMs.toString(),
		},
		encoding: 'json',
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	});
	const statusCode = getStatusCode(response);
	if (statusCode && statusCode >= 400) throwApiResponseError(connection.executeFunctions, response, 'E2B Connect request failed');
	return (asRecord(response.body) ?? {}) as T;
}

async function connectStream(
	connection: E2BConnection,
	sandbox: ConnectedSandbox,
	service: string,
	method: string,
	body: IDataObject,
): Promise<IDataObject[]> {
	const response = await envdRequest<FullResponse>(connection, sandbox, 'POST', `/${service}/${method}`, {
		body: encodeConnectEnvelope(body),
		headers: {
			'Content-Type': 'application/connect+json',
			'Connect-Protocol-Version': CONNECT_PROTOCOL_VERSION,
			'Connect-Timeout-Ms': connection.timeoutMs.toString(),
			'Keepalive-Ping-Interval': '50',
		},
		encoding: 'arraybuffer',
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	});
	const statusCode = getStatusCode(response);
	if (statusCode && statusCode >= 400) throwApiResponseError(connection.executeFunctions, response, 'E2B Connect stream failed');
	if (!response.body || !(response.body instanceof ArrayBuffer || Buffer.isBuffer(response.body))) {
		throw new Error('Expected E2B Connect stream response body');
	}
	return parseConnectEnvelopes(response.body);
}

function mapFileType(value: unknown): 'file' | 'dir' | undefined {
	if (value === 1 || value === 'FILE' || value === 'FILE_TYPE_FILE') return 'file';
	if (value === 2 || value === 'DIRECTORY' || value === 'FILE_TYPE_DIRECTORY') return 'dir';
	return undefined;
}

function mapFileInfo(value: unknown): FileInfo {
	const record = asRecord(value) ?? {};
	const modifiedTime = record.modifiedTime;
	return {
		name: asString(record.name) ?? '',
		type: mapFileType(record.type),
		path: asString(record.path) ?? '',
		metadata: asRecord(record.metadata) as Record<string, string> | undefined,
		size: asNumber(record.size),
		mode: asNumber(record.mode),
		permissions: asString(record.permissions),
		owner: asString(record.owner),
		group: asString(record.group),
		modifiedTime:
			typeof modifiedTime === 'string'
				? modifiedTime
				: asString(asRecord(modifiedTime)?.seconds)
					? new Date(Number(asString(asRecord(modifiedTime)?.seconds)) * 1000).toISOString()
					: undefined,
		symlinkTarget: asString(record.symlinkTarget),
	};
}

function mapWriteInfo(value: unknown): WriteInfo {
	const record = asRecord(value) ?? {};
	return {
		name: asString(record.name) ?? '',
		type: mapFileType(record.type),
		path: asString(record.path) ?? '',
		metadata: asRecord(record.metadata) as Record<string, string> | undefined,
	};
}

function parseJsonArray(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	if (typeof value !== 'string') return [];
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export async function readSandboxFile(
	connection: E2BConnection,
	sandbox: ConnectedSandbox,
	path: string,
	format: 'text' | 'bytes',
): Promise<string | Buffer> {
	const response = await envdRequest<FullResponse>(connection, sandbox, 'GET', '/files', {
		qs: { path },
		encoding: format === 'bytes' ? 'arraybuffer' : 'text',
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	});
	const statusCode = getStatusCode(response);
	if (statusCode && statusCode >= 400) throwApiResponseError(connection.executeFunctions, response, 'Failed to read sandbox file');
	if (format === 'bytes') {
		return Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body as ArrayBuffer);
	}
	return typeof response.body === 'string' ? response.body : '';
}

export async function writeSandboxFile(
	connection: E2BConnection,
	sandbox: ConnectedSandbox,
	path: string,
	content: string | Buffer,
): Promise<WriteInfo> {
	const formData = new FormData();
	const blobContent = Buffer.isBuffer(content) ? new Uint8Array(content) : content;
	formData.append('file', new Blob([blobContent]), path);

	const response = await envdRequest<unknown>(connection, sandbox, 'POST', '/files', {
		qs: { path },
		body: formData,
	});
	const files = parseJsonArray(response);
	if (files.length === 0) throw new Error('Expected to receive information about written file');
	return mapWriteInfo(files[0]);
}

export async function listSandboxFiles(
	connection: E2BConnection,
	sandbox: ConnectedSandbox,
	path: string,
	depth: number,
): Promise<FileInfo[]> {
	const response = await connectUnary<IDataObject>(connection, sandbox, 'filesystem.Filesystem', 'ListDir', { path, depth });
	const entries = Array.isArray(response.entries) ? response.entries : [];
	return entries.map(mapFileInfo).filter((entry) => entry.type !== undefined);
}

export async function createSandboxFolder(
	connection: E2BConnection,
	sandbox: ConnectedSandbox,
	path: string,
): Promise<boolean> {
	const response = await connectUnary<IDataObject>(connection, sandbox, 'filesystem.Filesystem', 'MakeDir', { path });
	return Object.keys(response).length >= 0;
}

export async function deleteSandboxFile(
	connection: E2BConnection,
	sandbox: ConnectedSandbox,
	path: string,
): Promise<void> {
	await connectUnary<IDataObject>(connection, sandbox, 'filesystem.Filesystem', 'Remove', { path });
}

export async function getSandboxFileInfo(
	connection: E2BConnection,
	sandbox: ConnectedSandbox,
	path: string,
): Promise<FileInfo> {
	const response = await connectUnary<IDataObject>(connection, sandbox, 'filesystem.Filesystem', 'Stat', { path });
	return mapFileInfo(response.entry);
}

export async function moveSandboxFile(
	connection: E2BConnection,
	sandbox: ConnectedSandbox,
	source: string,
	destination: string,
): Promise<FileInfo> {
	const response = await connectUnary<IDataObject>(connection, sandbox, 'filesystem.Filesystem', 'Move', {
		source,
		destination,
	});
	return mapFileInfo(response.entry);
}

function decodeBase64Text(value: unknown): string {
	if (typeof value !== 'string') return '';
	return Buffer.from(value, 'base64').toString('utf8');
}

function mapCommandEvent(message: IDataObject, result: CommandResult): void {
	const event = asRecord(message.event);
	if (!event) return;
	const data = asRecord(event.data);
	if (data) {
		result.stdout += decodeBase64Text(data.stdout);
		result.stderr += decodeBase64Text(data.stderr);
		return;
	}
	const end = asRecord(event.end);
	if (end) {
		result.exitCode = asNumber(end.exitCode) ?? result.exitCode;
		result.error = asString(end.error);
	}
}

export async function runSandboxCommand(
	connection: E2BConnection,
	sandbox: ConnectedSandbox,
	command: string,
	options: { cwd?: string; envs?: Record<string, string> } = {},
): Promise<CommandResult> {
	const process: IDataObject = {
		cmd: '/bin/bash',
		args: ['-l', '-c', command],
		envs: options.envs ?? {},
	};
	if (options.cwd) process.cwd = options.cwd;

	const messages = await connectStream(connection, sandbox, 'process.Process', 'Start', {
		process,
		stdin: false,
	});
	const result: CommandResult = {
		exitCode: 0,
		stdout: '',
		stderr: '',
	};
	for (const message of messages) {
		mapCommandEvent(message, result);
	}
	return result;
}
