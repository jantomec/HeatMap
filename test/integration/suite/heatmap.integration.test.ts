import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import * as vscode from 'vscode';

import { PythonPytestBackend } from '../../../src/backends/pythonPytestBackend';
import { buildFileHeatmap } from '../../../src/ui/heatmapModel';

suite('HeatMap integration', () => {
  test('discovers pytest tests and produces heatmap decorations', async function () {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      this.skip();
      return;
    }

    if (!hasPytest()) {
      this.skip();
      return;
    }

    const backend = new PythonPytestBackend();
    const tokenSource = new vscode.CancellationTokenSource();
    const helperRootPath = path.resolve(workspaceFolder.uri.fsPath, '../../../..', 'resources/python');
    const context = {
      workspaceFolder,
      resourceUri: vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, 'tests/test_app.py')),
      helperRootPath,
      configuration: vscode.workspace.getConfiguration('heatmap', workspaceFolder.uri),
      output: { appendLine: () => undefined },
      cancellationToken: tokenSource.token
    };

    const targets = await backend.discoverTargets(context);
    assert.ok(targets.length > 0);
    const selectedTarget = targets[0];
    assert.ok(selectedTarget);
    if (!selectedTarget) {
      tokenSource.dispose();
      return;
    }

    const session = await backend.profileTarget(context, selectedTarget);
    assert.equal(session.target.id, selectedTarget.id);

    const profiledSourcePath = path.join(workspaceFolder.uri.fsPath, 'app.py');
    const sourceDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(profiledSourcePath));
    const fileProfile = session.files.find((file) => path.resolve(file.path) === path.resolve(profiledSourcePath));

    assert.ok(fileProfile);
    if (!fileProfile) {
      tokenSource.dispose();
      return;
    }

    const decorations = buildFileHeatmap(fileProfile.metrics, sourceDocument.lineCount);
    assert.ok(decorations.length > 0);

    tokenSource.dispose();
  });
});

function hasPytest(): boolean {
  try {
    execFileSync('python3', ['-c', 'import pytest'], {
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}
