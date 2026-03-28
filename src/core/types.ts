import type * as vscode from 'vscode';

export type ProfilingGranularity = 'function-projected' | 'line';

export interface ProfileTarget {
  id: string;
  label: string;
  filePath: string;
  line?: number;
}

export interface LineMetric {
  line: number;
  callCount: number;
  totalTimeMs: number;
  cumulativeTimeMs: number;
  functionName: string;
  granularity: ProfilingGranularity;
}

export interface FileProfile {
  path: string;
  metrics: LineMetric[];
}

export interface ProfileSession {
  backendId: string;
  target: ProfileTarget;
  files: FileProfile[];
  createdAt: string;
}

export interface OutputSink {
  appendLine(message: string): void;
}

export interface BackendContext {
  workspaceFolder: vscode.WorkspaceFolder;
  resourceUri?: vscode.Uri;
  helperRootPath: string;
  configuration: vscode.WorkspaceConfiguration;
  output: OutputSink;
  cancellationToken: vscode.CancellationToken;
}

export interface ProfilingBackend {
  readonly id: string;
  canHandleWorkspace(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean>;
  discoverTargets(context: BackendContext): Promise<ProfileTarget[]>;
  profileTarget(context: BackendContext, target: ProfileTarget): Promise<ProfileSession>;
}
