import type { CommandResult as E2BCommandResult } from 'e2b';
import type { IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	asNonEmptyString,
	buildApiOpts,
	buildConnectOpts,
	getCreateOpts,
	getErrorMessage,
	getRequiredStringParameter,
	parseStringMapParameter,
	toCommandResultData,
} from '../helpers';
import type { E2BOperationContext } from '../types';

export async function runCommand(context: E2BOperationContext) {
	const { executeFunctions, credentials, itemIndex, sdk, timeoutMs } = context;
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
		? await sdk.Sandbox.connect(sandboxId, buildConnectOpts(credentials, timeoutMs))
		: await sdk.Sandbox.create(getCreateOpts(executeFunctions, credentials, itemIndex));

	let resultData: IDataObject | undefined;
	let executionError: unknown;
	let cleanupError: unknown;
	try {
		const startedAt = Date.now();
		let result: E2BCommandResult;
		try {
			result = await sandbox.commands.run(command, {
				...(cwd ? { cwd } : {}),
				...(envs ? { envs } : {}),
				timeoutMs,
				requestTimeoutMs: timeoutMs,
			});
		} catch (error) {
			if (error instanceof sdk.CommandExitError) {
				result = error;
			} else {
				throw new NodeOperationError(executeFunctions.getNode(), getErrorMessage(error), {
					itemIndex,
				});
			}
		}

		resultData = toCommandResultData(result, sandbox, command, startedAt, createdSandbox, false);
	} catch (error) {
		executionError = error;
	} finally {
		if (killAfterRun) {
			try {
				await sandbox.kill(buildApiOpts(credentials, timeoutMs));
				if (resultData) resultData.killedAfterRun = true;
			} catch (error) {
				cleanupError = error;
				if (resultData) resultData.cleanupError = getErrorMessage(error);
			}
		}
	}

	if (executionError) {
		if (cleanupError) {
			throw new NodeOperationError(
				executeFunctions.getNode(),
				`E2B command failed and the sandbox could not be killed: ${getErrorMessage(executionError)}; cleanup error: ${getErrorMessage(cleanupError)}`,
				{ itemIndex },
			);
		}
		throw new NodeOperationError(executeFunctions.getNode(), getErrorMessage(executionError), {
			itemIndex,
		});
	}

	if (cleanupError) {
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
