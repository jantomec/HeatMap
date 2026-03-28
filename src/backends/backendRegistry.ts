import type * as vscode from 'vscode';

import type { ProfilingBackend } from '../core/types';

export class BackendRegistry {
  private readonly backends = new Map<string, ProfilingBackend>();

  public constructor(backends: readonly ProfilingBackend[]) {
    for (const backend of backends) {
      this.backends.set(backend.id, backend);
    }
  }

  public getById(id: string): ProfilingBackend {
    const backend = this.backends.get(id);
    if (!backend) {
      throw new Error(`Unknown HeatMap backend "${id}".`);
    }

    return backend;
  }

  public async ensureWorkspaceSupport(id: string, workspaceFolder: vscode.WorkspaceFolder): Promise<ProfilingBackend> {
    const backend = this.getById(id);
    const canHandleWorkspace = await backend.canHandleWorkspace(workspaceFolder);

    if (!canHandleWorkspace) {
      throw new Error(`HeatMap backend "${id}" could not find a supported workspace in ${workspaceFolder.name}.`);
    }

    return backend;
  }
}
