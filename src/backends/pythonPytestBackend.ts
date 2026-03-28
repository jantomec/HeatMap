import path from 'node:path';

import * as vscode from 'vscode';

import type { BackendContext, ProfileSession, ProfileTarget, ProfilingBackend } from '../core/types';
import { parseDiscoveryResponse, parseProfileResponse } from './parsers';
import { resolvePythonCommand } from './interpreterResolver';
import { ProcessExecutionError, runProcess } from '../utils/process';

export class PythonPytestBackend implements ProfilingBackend {
  public readonly id = 'python-pytest';

  public async canHandleWorkspace(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
    const pythonFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, '**/*.py'),
      new vscode.RelativePattern(workspaceFolder, '**/{node_modules,dist,.git,.venv,__pycache__}/**'),
      1
    );

    return pythonFiles.length > 0;
  }

  public async discoverTargets(context: BackendContext): Promise<ProfileTarget[]> {
    const pythonCommand = await resolvePythonCommand(
      context.workspaceFolder,
      context.resourceUri,
      context.output,
      context.cancellationToken
    );
    const scriptPath = path.join(context.helperRootPath, 'discover_pytest.py');
    const args = [
      ...pythonCommand.args,
      scriptPath,
      '--workspace',
      context.workspaceFolder.uri.fsPath,
      ...buildPytestArgs(context.configuration)
    ];

    context.output.appendLine(`Discovering pytest targets with ${pythonCommand.command} ${args.join(' ')}`);

    try {
      const result = await runProcess(pythonCommand.command, args, {
        cwd: context.workspaceFolder.uri.fsPath,
        token: context.cancellationToken
      });

      return parseDiscoveryResponse(result.stdout, context.workspaceFolder.uri.fsPath);
    } catch (error) {
      throw buildBackendError('discovery', error);
    }
  }

  public async profileTarget(context: BackendContext, target: ProfileTarget): Promise<ProfileSession> {
    const pythonCommand = await resolvePythonCommand(
      context.workspaceFolder,
      context.resourceUri,
      context.output,
      context.cancellationToken
    );
    const scriptPath = path.join(context.helperRootPath, 'profile_pytest.py');
    const args = [
      ...pythonCommand.args,
      scriptPath,
      '--workspace',
      context.workspaceFolder.uri.fsPath,
      '--target',
      target.id,
      ...buildPytestArgs(context.configuration)
    ];

    context.output.appendLine(`Profiling pytest target ${target.id} with ${pythonCommand.command} ${args.join(' ')}`);

    try {
      const result = await runProcess(pythonCommand.command, args, {
        cwd: context.workspaceFolder.uri.fsPath,
        token: context.cancellationToken
      });

      return parseProfileResponse(result.stdout, this.id, target, context.workspaceFolder.uri.fsPath);
    } catch (error) {
      throw buildBackendError(`profiling target ${target.id}`, error);
    }
  }
}

function buildPytestArgs(configuration: vscode.WorkspaceConfiguration): string[] {
  const pytestArgs = configuration.get<string[]>('pytestArgs');
  if (!pytestArgs) {
    return [];
  }

  return pytestArgs.filter((value) => value.trim().length > 0);
}

function buildBackendError(operation: string, error: unknown): Error {
  if (error instanceof ProcessExecutionError) {
    const stderr = error.stderr.trim();
    const stdout = error.stdout.trim();
    const details = stderr || stdout || error.message;
    return new Error(`HeatMap ${operation} failed: ${details}`);
  }

  return error instanceof Error ? error : new Error(`HeatMap ${operation} failed.`);
}
