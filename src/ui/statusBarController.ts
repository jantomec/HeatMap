import * as vscode from 'vscode';

import type { SessionStore } from '../core/sessionStore';

export class StatusBarController implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  public constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.name = 'HeatMap Toggle';
    this.item.command = 'heatmap.toggleResults';
    this.item.hide();
  }

  public update(store: SessionStore): void {
    const session = store.getSession();
    if (!session) {
      this.item.hide();
      return;
    }

    this.item.text = store.isVisible() ? '$(eye) HeatMap On' : '$(eye-closed) HeatMap Off';
    this.item.tooltip = `Toggle profiling results for ${session.target.label}`;
    this.item.show();
  }

  public dispose(): void {
    this.item.dispose();
  }
}
