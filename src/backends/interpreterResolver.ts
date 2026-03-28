import * as vscode from 'vscode';

import {
  deduplicatePythonInvocations,
  derivePythonInvocationsFromEnvironmentPath,
  expandInterpreterSetting,
  extractPythonCommandFromResolvedEnvironment,
  normalizePythonExecCommand,
  normalizePythonEnvironmentPath
} from './pythonCommandUtils';
import type {
  PythonInvocation,
  PythonEnvironmentPath as PythonEnvironmentPathShape,
  PythonResolvedEnvironment as PythonResolvedEnvironmentShape
} from './pythonCommandUtils';
import { ProcessExecutionError, runProcess } from '../utils/process';

export interface PythonCommandResolution {
  command: string;
  args: string[];
  source: string;
  executablePath?: string;
}

interface PythonCandidate extends PythonInvocation {
  source: string;
}

interface PythonExtensionExports {
  environments?: PythonExtensionEnvironmentsApi;
  settings?: PythonExtensionSettingsApi;
}

interface PythonEnvsExtensionExports {
  getPythonProjects(): PythonEnvsProject[];
  getEnvironment(resource?: vscode.Uri): Promise<PythonEnvsEnvironment | undefined>;
  resolveEnvironment(path: vscode.Uri): Promise<PythonEnvsEnvironment | undefined>;
}

interface PythonExtensionEnvironmentsApi {
  getActiveEnvironmentPath(resource?: vscode.Uri): PythonEnvironmentPath | undefined;
  resolveEnvironment(path: PythonEnvironmentPath): Promise<PythonResolvedEnvironment | undefined>;
}

interface PythonExtensionSettingsApi {
  getExecutionDetails(resource?: vscode.Uri): {
    execCommand?: string[];
  };
}

type PythonEnvironmentPath =
  | PythonEnvironmentPathShape;

type PythonResolvedEnvironment = PythonResolvedEnvironmentShape & {
  executable?: {
    uri?: vscode.Uri;
    filename?: string;
  };
};

interface PythonEnvsEnvironment {
  environmentPath?: vscode.Uri;
  executablePath?: string;
  displayName?: string;
}

interface PythonEnvsProject {
  uri: vscode.Uri;
}

export async function resolvePythonCommand(
  workspaceFolder: vscode.WorkspaceFolder,
  resourceUri: vscode.Uri | undefined,
  output: { appendLine(message: string): void },
  token: vscode.CancellationToken
): Promise<PythonCommandResolution> {
  const configurationTarget = resourceUri ?? workspaceFolder.uri;
  const pythonConfiguration = vscode.workspace.getConfiguration('python', configurationTarget);
  const heatmapConfiguration = vscode.workspace.getConfiguration('heatmap', configurationTarget);
  const candidateValues = await collectPythonCandidates(workspaceFolder, resourceUri, output);

  const defaultInterpreterPath = pythonConfiguration.get<string>('defaultInterpreterPath');
  if (defaultInterpreterPath?.trim()) {
    candidateValues.push(
      ...derivePythonInvocationsFromEnvironmentPath(expandInterpreterSetting(defaultInterpreterPath, workspaceFolder.uri.fsPath)).map(
        (invocation) => ({
          ...invocation,
          source: 'python.defaultInterpreterPath'
        })
      )
    );
  }

  const legacyInterpreterPath = pythonConfiguration.get<string>('pythonPath');
  if (legacyInterpreterPath?.trim()) {
    candidateValues.push(
      ...derivePythonInvocationsFromEnvironmentPath(expandInterpreterSetting(legacyInterpreterPath, workspaceFolder.uri.fsPath)).map(
        (invocation) => ({
          ...invocation,
          source: 'python.pythonPath'
        })
      )
    );
  }

  const heatmapInterpreterPath = heatmapConfiguration.get<string>('pythonPath');
  if (heatmapInterpreterPath?.trim()) {
    candidateValues.push(
      ...derivePythonInvocationsFromEnvironmentPath(expandInterpreterSetting(heatmapInterpreterPath, workspaceFolder.uri.fsPath)).map(
        (invocation) => ({
          ...invocation,
          source: 'heatmap.pythonPath'
        })
      )
    );
  }

  candidateValues.push(
    {
      command: 'python3',
      args: [],
      source: 'shell fallback'
    },
    {
      command: 'python',
      args: [],
      source: 'shell fallback'
    }
  );

  for (const candidate of deduplicatePythonInvocations(candidateValues).map((invocation) => ({
    ...invocation,
    source: candidateValues.find(
      (candidate) => candidate.command === invocation.command && candidate.args.join('\u0000') === invocation.args.join('\u0000')
    )?.source ?? 'unknown'
  }))) {
    const displayCommand = formatInvocation(candidate);

    try {
      const probeResult = await runProcess(
        candidate.command,
        [...candidate.args, '-c', 'import sys; import pytest; print(sys.executable)'],
        {
          cwd: workspaceFolder.uri.fsPath,
          token
        }
      );

      const executablePath = probeResult.stdout.trim().split(/\r?\n/).filter((line) => line.length > 0).at(-1);
      output.appendLine(
        `Resolved Python interpreter from ${candidate.source}: ${displayCommand}${executablePath ? ` -> ${executablePath}` : ''}`
      );
      return {
        command: candidate.command,
        args: candidate.args,
        source: candidate.source,
        ...(executablePath ? { executablePath } : {})
      };
    } catch (error) {
      if (error instanceof ProcessExecutionError) {
        output.appendLine(
          `Python interpreter candidate "${displayCommand}" from ${candidate.source} failed pytest probe: ${summarizeProcessError(
            error
          )}`
        );
        continue;
      }

      throw error;
    }
  }

  for (const candidate of candidateValues) {
    const displayCommand = formatInvocation(candidate);
    try {
      await runProcess(candidate.command, [...candidate.args, '--version'], {
        cwd: workspaceFolder.uri.fsPath,
        token
      });

      output.appendLine(
        `Python interpreter candidate "${displayCommand}" from ${candidate.source} can run Python but could not import pytest.`
      );
    } catch (error) {
      if (!(error instanceof ProcessExecutionError)) {
        throw error;
      }
    }
  }

  throw new Error(
    'HeatMap could not find a Python invocation with pytest available. Configure heatmap.pythonPath or select an interpreter in the Python extension that has pytest installed.'
  );
}

async function collectPythonCandidates(
  workspaceFolder: vscode.WorkspaceFolder,
  resourceUri: vscode.Uri | undefined,
  output: { appendLine(message: string): void }
): Promise<PythonCandidate[]> {
  const candidates: PythonCandidate[] = [];
  const pythonEnvsExtension = vscode.extensions.getExtension<PythonEnvsExtensionExports>('ms-python.vscode-python-envs');
  if (pythonEnvsExtension) {
    try {
      const pythonEnvsApi = pythonEnvsExtension.isActive ? pythonEnvsExtension.exports : await pythonEnvsExtension.activate();
      const selectedEnvironmentInvocations = await collectSelectedInterpreterInvocationsFromPythonEnvsExtension(
        pythonEnvsApi,
        workspaceFolder,
        resourceUri ?? workspaceFolder.uri
      );
      for (const invocation of selectedEnvironmentInvocations) {
        candidates.push({
          ...invocation,
          source: 'Python Environments selected environment'
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(`Python Environments extension API lookup failed, falling back to Python extension APIs: ${message}`);
    }
  }

  const pythonExtension = vscode.extensions.getExtension<PythonExtensionExports>('ms-python.python');
  if (!pythonExtension) {
    return candidates;
  }

  try {
    const pythonApi = pythonExtension.isActive ? pythonExtension.exports : await pythonExtension.activate();
    const selectedInterpreterInvocations = await resolveSelectedInterpreterInvocationsFromPythonExtension(
      pythonApi,
      resourceUri ?? workspaceFolder.uri,
      output
    );
    for (const invocation of selectedInterpreterInvocations) {
      candidates.push({
        ...invocation,
        source: 'Python extension selected environment'
      });
    }

    const executionDetailsInvocation = normalizePythonExecCommand(
      pythonApi.settings?.getExecutionDetails?.(resourceUri ?? workspaceFolder.uri).execCommand
    );
    if (executionDetailsInvocation) {
      candidates.push({
        ...executionDetailsInvocation,
        source: 'Python extension execution details'
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Python extension API lookup failed, falling back to settings and shell resolution: ${message}`);
  }

  return candidates;
}

async function collectSelectedInterpreterInvocationsFromPythonEnvsExtension(
  pythonEnvsApi: PythonEnvsExtensionExports,
  workspaceFolder: vscode.WorkspaceFolder,
  resource: vscode.Uri
): Promise<PythonInvocation[]> {
  const invocations: PythonInvocation[] = [];

  const resourceEnvironmentInvocations = await resolveSelectedInterpreterInvocationsFromPythonEnvsEnvironment(
    pythonEnvsApi,
    resource
  );
  invocations.push(...resourceEnvironmentInvocations);

  const pythonProjects = pythonEnvsApi
    .getPythonProjects()
    .filter((project) => {
      const relativePath = vscode.workspace.asRelativePath(project.uri, false);
      return !relativePath.startsWith('..');
    })
    .filter((project) => project.uri.fsPath.startsWith(workspaceFolder.uri.fsPath));

  for (const project of pythonProjects) {
    invocations.push(...(await resolveSelectedInterpreterInvocationsFromPythonEnvsEnvironment(pythonEnvsApi, project.uri)));
  }

  return deduplicatePythonInvocations(invocations);
}

async function resolveSelectedInterpreterInvocationsFromPythonEnvsEnvironment(
  pythonEnvsApi: PythonEnvsExtensionExports,
  resource: vscode.Uri
): Promise<PythonInvocation[]> {
  const selectedEnvironment = await pythonEnvsApi.getEnvironment(resource);
  if (!selectedEnvironment) {
    return [];
  }

  const resolvedEnvironment = selectedEnvironment.environmentPath
    ? await pythonEnvsApi.resolveEnvironment(selectedEnvironment.environmentPath).catch(() => undefined)
    : undefined;

  return deduplicatePythonInvocations(
    [
      resolvedEnvironment?.executablePath,
      selectedEnvironment.executablePath,
      resolvedEnvironment?.environmentPath?.fsPath,
      selectedEnvironment.environmentPath?.fsPath
    ]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => derivePythonInvocationsFromEnvironmentPath(value))
  );
}

async function resolveSelectedInterpreterInvocationsFromPythonExtension(
  pythonApi: PythonExtensionExports,
  resource: vscode.Uri,
  output: { appendLine(message: string): void }
): Promise<PythonInvocation[]> {
  const activeEnvironmentPath = pythonApi.environments?.getActiveEnvironmentPath(resource);
  const activeEnvironmentCommand = normalizePythonEnvironmentPath(activeEnvironmentPath);
  if (!activeEnvironmentPath) {
    return [];
  }

  try {
    const resolvedEnvironment = await pythonApi.environments?.resolveEnvironment(activeEnvironmentPath);
    const resolvedCommand = extractPythonCommandFromResolvedEnvironment(
      resolvedEnvironment as PythonResolvedEnvironmentShape | undefined
    );
    return deduplicatePythonInvocations(
      [resolvedCommand, activeEnvironmentCommand]
        .filter((value): value is string => Boolean(value))
        .flatMap((value) => derivePythonInvocationsFromEnvironmentPath(value))
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Python extension could not resolve the selected environment, using its raw path instead: ${message}`);
    return activeEnvironmentCommand ? derivePythonInvocationsFromEnvironmentPath(activeEnvironmentCommand) : [];
  }
}

function formatInvocation(invocation: PythonInvocation): string {
  return [invocation.command, ...invocation.args].join(' ');
}

function summarizeProcessError(error: ProcessExecutionError): string {
  const stderr = error.stderr.trim();
  if (stderr) {
    return stderr;
  }

  const stdout = error.stdout.trim();
  if (stdout) {
    return stdout;
  }

  return error.message;
}
