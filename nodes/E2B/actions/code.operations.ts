import type { IDataObject } from 'n8n-workflow';
import { ensureError, NodeApiError, NodeOperationError } from 'n8n-workflow';

import { connectSandbox, createSandbox, killSandbox, runSandboxCommand } from '../client';
import {
	asNonEmptyString,
	getErrorMessage,
	getRequiredStringParameter,
	getSandboxCreateOptions,
	parseStringMapParameter,
	toCommandResultData,
} from '../helpers';
import type { E2BOperationContext } from '../types';

export async function runCommand(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, timeoutMs } = context;
	const connection = { executeFunctions, credentials, timeoutMs };
	const sandboxId = asNonEmptyString(executeFunctions.getNodeParameter('sandboxId', itemIndex, ''));
	const command = getRequiredStringParameter(executeFunctions, 'command', 'Command', itemIndex);
	const cwd = asNonEmptyString(executeFunctions.getNodeParameter('cwd', itemIndex, ''));
	const killAfterRun =
		executeFunctions.getNodeParameter('killAfterRun', itemIndex, false) === true;
	const envs = parseStringMapParameter(
		executeFunctions,
		executeFunctions.getNodeParameter('envJson', itemIndex, ''),
		'Environment Variables',
		itemIndex,
	);
	const createdSandbox = !sandboxId;
	const sandbox = sandboxId
		? await connectSandbox(connection, sandboxId)
		: await createSandbox(connection, getSandboxCreateOptions(executeFunctions, itemIndex));

	let resultData: IDataObject | undefined;
	let executionError: unknown;
	let cleanupError: unknown;
	let commandFailed = false;
	let cleanupFailed = false;
	try {
		const startedAt = Date.now();
		const result = await runSandboxCommand(connection, sandbox, command, {
			...(cwd ? { cwd } : {}),
			...(envs ? { envs } : {}),
		});

		resultData = toCommandResultData(result, sandbox, command, startedAt, createdSandbox, false);
	} catch (error) {
		commandFailed = true;
		executionError = error;
	} finally {
		if (killAfterRun) {
			try {
				await killSandbox(connection, sandbox.sandboxId);
				if (resultData) resultData.killedAfterRun = true;
			} catch (error) {
				cleanupFailed = true;
				cleanupError = error;
				if (resultData) resultData.cleanupError = getErrorMessage(error);
			}
		}
	}

	if (commandFailed) {
		const normalizedExecutionError = ensureError(executionError);
		if (cleanupFailed) {
			if (normalizedExecutionError instanceof NodeApiError) {
				normalizedExecutionError.context.cleanupError = getErrorMessage(cleanupError);
				throw normalizedExecutionError;
			}
			throw new NodeOperationError(
				executeFunctions.getNode(),
				`E2B command failed and the sandbox could not be killed: ${getErrorMessage(normalizedExecutionError)}; cleanup error: ${getErrorMessage(cleanupError)}`,
				{ itemIndex },
			);
		}
		throw normalizedExecutionError;
	}

	if (cleanupFailed) {
		throw new NodeOperationError(
			executeFunctions.getNode(),
			`E2B command succeeded but the sandbox could not be killed: ${getErrorMessage(cleanupError)}`,
			{ itemIndex },
		);
	}

	return resultData
		? [
				{
					json: resultData,
					pairedItem: { item: itemIndex },
				},
			]
		: [];
}
