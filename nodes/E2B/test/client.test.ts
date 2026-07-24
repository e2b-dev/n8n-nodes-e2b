import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import * as packageJson from '../../../package.json';
import { deleteSnapshot, readSandboxFile } from '../client';

const INTEGRATION_USER_AGENT = `n8n-nodes-e2b/${packageJson.version}`;

function setupConnection() {
	const executeFunctions = {
		getNode: vi.fn().mockReturnValue({
			id: 'e2b-node',
			name: 'E2B',
			type: '@e2b/n8n-nodes-e2b.e2b',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		}),
		helpers: {
			httpRequest: vi.fn(),
			httpRequestWithAuthentication: vi.fn(),
		},
	} as unknown as IExecuteFunctions;

	return {
		executeFunctions,
		connection: {
			executeFunctions,
			credentials: { apiKey: 'api-key' },
			timeoutMs: 120_000,
		},
	};
}

describe('E2B client', () => {
	it('attributes API requests to the versioned n8n integration', async () => {
		const { connection, executeFunctions } = setupConnection();
		executeFunctions.helpers.httpRequestWithAuthentication.mockResolvedValue({ statusCode: 204 });

		await deleteSnapshot(connection, 'snap-node:default');

		expect(executeFunctions.helpers.httpRequestWithAuthentication).toHaveBeenCalledWith(
			'e2bApi',
			expect.objectContaining({
				headers: {
					'User-Agent': INTEGRATION_USER_AGENT,
				},
			}),
		);
	});

	it('attributes sandbox requests to the versioned n8n integration', async () => {
		const { connection, executeFunctions } = setupConnection();
		executeFunctions.helpers.httpRequest.mockResolvedValue({
			statusCode: 200,
			body: 'hello',
		});

		await readSandboxFile(
			connection,
			{
				sandboxId: 'sb-test',
				envdVersion: '0.4.0',
			},
			'/tmp/hello.txt',
			'text',
		);

		expect(executeFunctions.helpers.httpRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				headers: expect.objectContaining({
					'User-Agent': INTEGRATION_USER_AGENT,
				}),
			}),
		);
	});

	it('preserves HTTP status and response body for full-response API errors', async () => {
		const { connection, executeFunctions } = setupConnection();
		const responseBody = {
			message: 'Sandbox quota exceeded',
			code: 'quota_exceeded',
			limit: 20,
		};
		executeFunctions.helpers.httpRequestWithAuthentication.mockResolvedValue({
			statusCode: 429,
			headers: { 'retry-after': '60' },
			body: responseBody,
		});

		let error: unknown;
		try {
			await deleteSnapshot(connection, 'snap-node:default');
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(NodeApiError);
		expect(error).toMatchObject({
			httpCode: '429',
			description: 'Sandbox quota exceeded',
			errorResponse: expect.objectContaining({
				statusCode: 429,
				body: responseBody,
			}),
			context: {
				data: responseBody,
			},
		});
	});
});
