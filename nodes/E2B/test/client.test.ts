import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { deleteSnapshot } from '../client';

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
