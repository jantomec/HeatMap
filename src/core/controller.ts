import path from 'node:path';

import * as vscode from 'vscode';

import type { BackendRegistry } from '../backends/backendRegistry';
import type { HeatmapDecorationController } from '../ui/heatmapDecorations';
import type { StatusBarController } from '../ui/statusBarController';
import type { SessionStore } from './sessionStore';
import type { BackendContext, OutputSink, ProfileTarget } from './types';

interface HeatMapControllerDependencies {
  backendRegistry: BackendRegistry;
  helperRootPath: string;
  output: OutputSink;
  sessionStore: SessionStore;
  statusBarController: StatusBarController;
  decorationController: HeatmapDecorationController;
}

interface ProfileTargetQuickPickItem extends vscode.QuickPickItem {
  target: ProfileTarget;
}

export class HeatMapController {
  private readonly backendRegistry: BackendRegistry;
  private readonly helperRootPath: string;
  private readonly output: OutputSink;
  private readonly sessionStore: SessionStore;
  private readonly statusBarController: StatusBarController;
  private readonly decorationController: HeatmapDecorationController;

  public constructor(dependencies: HeatMapControllerDependencies) {
    this.backendRegistry = dependencies.backendRegistry;
    this.helperRootPath = dependencies.helperRootPath;
    this.output = dependencies.output;
    this.sessionStore = dependencies.sessionStore;
    this.statusBarController = dependencies.statusBarController;
    this.decorationController = dependencies.decorationController;
  }

  public async profileTest(): Promise<void> {
    const workspaceFolder = resolveWorkspaceFolder();
    if (!workspaceFolder) {
      await vscode.window.showErrorMessage('HeatMap requires an open workspace to discover pytest tests.');
      return;
    }

    try {
      const heatmapConfiguration = vscode.workspace.getConfiguration('heatmap', workspaceFolder.uri);
      const backendId = heatmapConfiguration.get<string>('backend') ?? 'python-pytest';
      const backend = await this.backendRegistry.ensureWorkspaceSupport(backendId, workspaceFolder);

      const targets = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'HeatMap: Discovering pytest tests',
          cancellable: true
        },
        async (_, token) => backend.discoverTargets(this.createBackendContext(workspaceFolder, token))
      );

      if (targets.length === 0) {
        await vscode.window.showInformationMessage('HeatMap did not find any pytest tests in the active workspace.');
        return;
      }

      const selectedTarget = await vscode.window.showQuickPick(buildQuickPickItems(targets, workspaceFolder), {
        placeHolder: 'Select a pytest target to profile',
        matchOnDescription: true,
        matchOnDetail: true
      });

      if (!selectedTarget) {
        return;
      }

      const session = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `HeatMap: Profiling ${selectedTarget.target.label}`,
          cancellable: true
        },
        async (_, token) => backend.profileTarget(this.createBackendContext(workspaceFolder, token), selectedTarget.target)
      );

      this.sessionStore.setSession(session);
      this.refresh();
    } catch (error) {
      await this.reportError(error);
    }
  }

  public async toggleResults(): Promise<void> {
    if (!this.sessionStore.hasSession()) {
      await vscode.window.showInformationMessage('HeatMap has no profiling results yet. Run "HeatMap: Profile Test" first.');
      return;
    }

    this.sessionStore.toggleVisibility();
    this.refresh();
  }

  public refresh(): void {
    this.decorationController.render(this.sessionStore.getSession(), this.sessionStore.isVisible());
    this.statusBarController.update(this.sessionStore);
  }

  private createBackendContext(
    workspaceFolder: vscode.WorkspaceFolder,
    cancellationToken: vscode.CancellationToken
  ): BackendContext {
    const activeResourceUri = vscode.window.activeTextEditor?.document.uri;

    return {
      workspaceFolder,
      ...(activeResourceUri ? { resourceUri: activeResourceUri } : {}),
      helperRootPath: this.helperRootPath,
      configuration: vscode.workspace.getConfiguration('heatmap', workspaceFolder.uri),
      output: this.output,
      cancellationToken
    };
  }

  private async reportError(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'HeatMap encountered an unknown error.';
    this.output.appendLine(message);
    await vscode.window.showErrorMessage(message);
  }
}

function resolveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const activeDocument = vscode.window.activeTextEditor?.document;
  if (activeDocument) {
    const activeWorkspaceFolder = vscode.workspace.getWorkspaceFolder(activeDocument.uri);
    if (activeWorkspaceFolder) {
      return activeWorkspaceFolder;
    }
  }

  return vscode.workspace.workspaceFolders?.[0];
}

function buildQuickPickItems(
  targets: readonly ProfileTarget[],
  workspaceFolder: vscode.WorkspaceFolder
): ProfileTargetQuickPickItem[] {
  return [...targets]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((target) => ({
      label: target.label,
      description: buildDescription(target, workspaceFolder.uri.fsPath),
      detail: target.id,
      target
    }));
}

function buildDescription(target: ProfileTarget, workspaceRoot: string): string {
  const relativePath = path.relative(workspaceRoot, target.filePath);
  return target.line ? `${relativePath}:${target.line}` : relativePath;
}
