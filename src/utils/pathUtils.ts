import path from 'node:path';

export function normalizeFsPath(fsPath: string): string {
  const normalized = path.normalize(fsPath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function resolveWorkspacePath(workspaceRoot: string, candidatePath: string): string {
  if (path.isAbsolute(candidatePath)) {
    return normalizeFsPath(candidatePath);
  }

  return normalizeFsPath(path.resolve(workspaceRoot, candidatePath));
}

export function isPathInsideWorkspace(workspaceRoot: string, filePath: string): boolean {
  const relativePath = path.relative(normalizeFsPath(workspaceRoot), normalizeFsPath(filePath));
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}
