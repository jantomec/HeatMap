import * as vscode from 'vscode';

import type { ProfileSession } from '../core/types';
import { normalizeFsPath } from '../utils/pathUtils';
import { buildFileHeatmap } from './heatmapModel';

const BUCKET_COUNT = 8;

export class HeatmapDecorationController implements vscode.Disposable {
  private readonly decorationTypes: vscode.TextEditorDecorationType[];

  public constructor() {
    this.decorationTypes = Array.from({ length: BUCKET_COUNT }, (_, index) =>
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: buildHeatColor(index / Math.max(BUCKET_COUNT - 1, 1))
      })
    );
  }

  public render(session: ProfileSession | undefined, visible: boolean): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.applyToEditor(editor, session, visible);
    }
  }

  public dispose(): void {
    for (const decorationType of this.decorationTypes) {
      decorationType.dispose();
    }
  }

  private applyToEditor(editor: vscode.TextEditor, session: ProfileSession | undefined, visible: boolean): void {
    const groupedDecorations = new Map<number, vscode.DecorationOptions[]>();
    for (let index = 0; index < BUCKET_COUNT; index += 1) {
      groupedDecorations.set(index, []);
    }

    if (session && visible) {
      const normalizedEditorPath = normalizeFsPath(editor.document.uri.fsPath);
      const fileProfile = session.files.find((profile) => normalizeFsPath(profile.path) === normalizedEditorPath);

      if (fileProfile) {
        const heatmapEntries = buildFileHeatmap(fileProfile.metrics, editor.document.lineCount, BUCKET_COUNT);
        for (const entry of heatmapEntries) {
          const range = new vscode.Range(entry.line - 1, 0, entry.line - 1, 0);
          const bucketDecorations = groupedDecorations.get(entry.bucket);
          bucketDecorations?.push({
            range,
            hoverMessage: new vscode.MarkdownString(entry.hoverMarkdown),
            renderOptions: {
              after: {
                contentText: ` ${entry.hudText}`,
                margin: '0 0 0 1.5rem',
                color: 'rgba(128, 128, 128, 0.92)'
              }
            }
          });
        }
      }
    }

    for (let index = 0; index < BUCKET_COUNT; index += 1) {
      const decorationType = this.decorationTypes[index];
      if (!decorationType) {
        continue;
      }

      editor.setDecorations(decorationType, groupedDecorations.get(index) ?? []);
    }
  }
}

function buildHeatColor(intensity: number): string {
  const alpha = 0.08 + intensity * 0.32;
  const hue = 48 - intensity * 40;
  const lightness = 74 - intensity * 26;
  return `hsla(${hue}, 92%, ${lightness}%, ${alpha})`;
}
