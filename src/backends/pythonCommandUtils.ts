import path from 'node:path';

export type PythonEnvironmentPath =
  | string
  | {
      path: string;
    };

export interface PythonResolvedEnvironment {
  path?: string;
  executable?: {
    uri?: {
      fsPath: string;
    };
    filename?: string;
  };
}

export interface PythonInvocation {
  command: string;
  args: string[];
}

export function expandInterpreterSetting(rawValue: string, workspaceRoot: string): string {
  const trimmedValue = rawValue.trim();
  const replacedValue = trimmedValue
    .replaceAll('${workspaceFolder}', workspaceRoot)
    .replaceAll('${workspaceFolderBasename}', path.basename(workspaceRoot));

  const looksLikePath =
    replacedValue.startsWith('.') ||
    replacedValue.includes(path.sep) ||
    replacedValue.includes('/') ||
    replacedValue.includes('\\');

  if (looksLikePath && !path.isAbsolute(replacedValue)) {
    return path.resolve(workspaceRoot, replacedValue);
  }

  return replacedValue;
}

export function normalizePythonEnvironmentPath(environmentPath: PythonEnvironmentPath | undefined): string | undefined {
  if (!environmentPath) {
    return undefined;
  }

  return typeof environmentPath === 'string' ? environmentPath : environmentPath.path;
}

export function extractPythonCommandFromResolvedEnvironment(
  environment: PythonResolvedEnvironment | undefined
): string | undefined {
  if (!environment) {
    return undefined;
  }

  return environment.executable?.uri?.fsPath ?? environment.executable?.filename ?? environment.path;
}

export function normalizePythonExecCommand(execCommand: string[] | undefined): PythonInvocation | undefined {
  if (!execCommand) {
    return undefined;
  }

  const normalizedParts = execCommand.map((part) => part.trim()).filter((part) => part.length > 0);
  const [command, ...args] = normalizedParts;
  if (!command) {
    return undefined;
  }

  return {
    command,
    args
  };
}

export function derivePythonInvocationsFromEnvironmentPath(environmentPath: string): PythonInvocation[] {
  const candidates: PythonInvocation[] = [];
  const normalizedPath = path.normalize(environmentPath);
  const pathLooksLikeExecutable =
    path.basename(normalizedPath).toLowerCase().startsWith('python') || normalizedPath.endsWith('.exe');

  if (pathLooksLikeExecutable || !path.isAbsolute(normalizedPath)) {
    candidates.push({
      command: environmentPath,
      args: []
    });
  }

  if (!pathLooksLikeExecutable) {
    const derivedPaths =
      process.platform === 'win32'
        ? [path.join(normalizedPath, 'python.exe'), path.join(normalizedPath, 'Scripts', 'python.exe')]
        : [path.join(normalizedPath, 'bin', 'python'), path.join(normalizedPath, 'python')];

    for (const derivedPath of derivedPaths) {
      candidates.push({
        command: derivedPath,
        args: []
      });
    }
  }

  return deduplicatePythonInvocations(candidates);
}

export function deduplicatePythonInvocations(invocations: readonly PythonInvocation[]): PythonInvocation[] {
  const seen = new Set<string>();
  const uniqueInvocations: PythonInvocation[] = [];

  for (const invocation of invocations) {
    const key = [invocation.command, ...invocation.args].join('\u0000');
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueInvocations.push({
      command: invocation.command,
      args: [...invocation.args]
    });
  }

  return uniqueInvocations;
}
