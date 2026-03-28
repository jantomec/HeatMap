import { spawn } from 'node:child_process';

import type * as vscode from 'vscode';

export class ProcessExecutionError extends Error {
  public constructor(
    message: string,
    public readonly command: string,
    public readonly args: readonly string[],
    public readonly exitCode: number | null,
    public readonly stdout: string,
    public readonly stderr: string
  ) {
    super(message);
    this.name = 'ProcessExecutionError';
  }
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface RunProcessOptions {
  cwd: string;
  token: vscode.CancellationToken;
  env?: NodeJS.ProcessEnv;
  acceptedExitCodes?: readonly number[];
}

export async function runProcess(
  command: string,
  args: readonly string[],
  options: RunProcessOptions
): Promise<ProcessResult> {
  return await new Promise<ProcessResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const acceptedCodes = new Set(options.acceptedExitCodes ?? [0]);

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env
    });

    const cancellationSubscription = options.token.onCancellationRequested(() => {
      child.kill();
    });

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      cancellationSubscription.dispose();
      reject(
        new ProcessExecutionError(
          `Failed to start "${command}": ${error.message}`,
          command,
          args,
          null,
          stdout,
          stderr
        )
      );
    });

    child.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
      cancellationSubscription.dispose();

      if (signal) {
        reject(
          new ProcessExecutionError(
            `Process "${command}" was terminated by signal ${signal}.`,
            command,
            args,
            exitCode,
            stdout,
            stderr
          )
        );
        return;
      }

      if (exitCode === null || !acceptedCodes.has(exitCode)) {
        reject(
          new ProcessExecutionError(
            `Process "${command}" exited with code ${exitCode ?? 'unknown'}.`,
            command,
            args,
            exitCode,
            stdout,
            stderr
          )
        );
        return;
      }

      resolve({
        stdout,
        stderr,
        exitCode
      });
    });
  });
}
