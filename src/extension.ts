import * as vscode from 'vscode';

import { PythonPytestBackend } from './backends/pythonPytestBackend';
import { BackendRegistry } from './backends/backendRegistry';
import { HeatMapController } from './core/controller';
import { SessionStore } from './core/sessionStore';
import { HeatmapDecorationController } from './ui/heatmapDecorations';
import { StatusBarController } from './ui/statusBarController';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('HeatMap');
  const sessionStore = new SessionStore();
  const backendRegistry = new BackendRegistry([new PythonPytestBackend()]);
  const decorationController = new HeatmapDecorationController();
  const statusBarController = new StatusBarController();
  const controller = new HeatMapController({
    backendRegistry,
    helperRootPath: context.asAbsolutePath('resources/python'),
    output: outputChannel,
    sessionStore,
    statusBarController,
    decorationController
  });

  context.subscriptions.push(
    outputChannel,
    decorationController,
    statusBarController,
    vscode.commands.registerCommand('heatmap.profileTest', async () => {
      await controller.profileTest();
    }),
    vscode.commands.registerCommand('heatmap.toggleResults', async () => {
      await controller.toggleResults();
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => {
      controller.refresh();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      controller.refresh();
    })
  );

  controller.refresh();
}

export function deactivate(): void {}
