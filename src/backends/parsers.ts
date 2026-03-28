import type { FileProfile, LineMetric, ProfileSession, ProfileTarget, ProfilingGranularity } from '../core/types';
import { resolveWorkspacePath } from '../utils/pathUtils';

type JsonRecord = Record<string, unknown>;

export function parseDiscoveryResponse(stdout: string, workspaceRoot: string): ProfileTarget[] {
  const payload = parseJson(stdout);
  const targets = Array.isArray(payload) ? payload : extractArrayProperty(payload, 'targets');

  return targets.map((value) => normalizeTargetRecord(value, workspaceRoot));
}

export function parseProfileResponse(
  stdout: string,
  backendId: string,
  fallbackTarget: ProfileTarget,
  workspaceRoot: string
): ProfileSession {
  const payload = parseJson(stdout);
  const target = hasRecord(payload.target) ? normalizeTargetRecord(payload.target, workspaceRoot, fallbackTarget) : fallbackTarget;
  const files = extractArrayProperty(payload, 'files').map((value) => normalizeFileProfile(value, workspaceRoot));

  return {
    backendId,
    target,
    files,
    createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : new Date().toISOString()
  };
}

function parseJson(stdout: string): JsonRecord {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!hasRecord(parsed)) {
      throw new Error('Expected a JSON object at the root.');
    }

    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown JSON parse failure.';
    throw new Error(`HeatMap backend returned invalid JSON: ${message}`);
  }
}

function extractArrayProperty(record: JsonRecord, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`HeatMap backend response is missing an array "${key}" property.`);
  }

  return value;
}

function normalizeTargetRecord(value: unknown, workspaceRoot: string, fallback?: ProfileTarget): ProfileTarget {
  if (!hasRecord(value)) {
    throw new Error('HeatMap target payload must be an object.');
  }

  const id = readString(value, 'id') ?? fallback?.id;
  const label = readString(value, 'label') ?? fallback?.label ?? id;
  const filePathValue = readString(value, 'filePath') ?? readString(value, 'file') ?? fallback?.filePath;

  if (!id || !label || !filePathValue) {
    throw new Error('HeatMap target payload is missing required id, label, or file path fields.');
  }

  const line = readOptionalPositiveInteger(value, 'line') ?? fallback?.line;
  return {
    id,
    label,
    filePath: resolveWorkspacePath(workspaceRoot, filePathValue),
    ...(line ? { line } : {})
  };
}

function normalizeFileProfile(value: unknown, workspaceRoot: string): FileProfile {
  if (!hasRecord(value)) {
    throw new Error('HeatMap file profile payload must be an object.');
  }

  const filePathValue = readString(value, 'path') ?? readString(value, 'filePath') ?? readString(value, 'file');
  if (!filePathValue) {
    throw new Error('HeatMap file profile payload is missing a file path.');
  }

  const metricValues = extractArrayProperty(value, 'metrics');
  const metricMap = new Map<number, LineMetric>();
  for (const metricValue of metricValues) {
    const metric = normalizeLineMetric(metricValue);
    const existingMetric = metricMap.get(metric.line);
    metricMap.set(metric.line, existingMetric ? mergeLineMetrics(existingMetric, metric) : metric);
  }

  return {
    path: resolveWorkspacePath(workspaceRoot, filePathValue),
    metrics: [...metricMap.values()].sort((left, right) => left.line - right.line)
  };
}

function normalizeLineMetric(value: unknown): LineMetric {
  if (!hasRecord(value)) {
    throw new Error('HeatMap line metric payload must be an object.');
  }

  const line = readRequiredPositiveInteger(value, 'line');
  const callCount = readRequiredNumber(value, 'callCount');
  const totalTimeMs = readRequiredNumber(value, 'totalTimeMs');
  const cumulativeTimeMs = readRequiredNumber(value, 'cumulativeTimeMs');
  const functionName = readString(value, 'functionName') ?? 'unknown';
  const granularity = readGranularity(value, 'granularity');

  return {
    line,
    callCount,
    totalTimeMs,
    cumulativeTimeMs,
    functionName,
    granularity
  };
}

function mergeLineMetrics(left: LineMetric, right: LineMetric): LineMetric {
  const functionNames = new Set(
    `${left.functionName}, ${right.functionName}`
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );

  return {
    line: left.line,
    callCount: left.callCount + right.callCount,
    totalTimeMs: left.totalTimeMs + right.totalTimeMs,
    cumulativeTimeMs: left.cumulativeTimeMs + right.cumulativeTimeMs,
    functionName: [...functionNames].join(', '),
    granularity: left.granularity === right.granularity ? left.granularity : 'function-projected'
  };
}

function readRequiredNumber(record: JsonRecord, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`HeatMap payload field "${key}" must be a number.`);
  }

  return value;
}

function readRequiredPositiveInteger(record: JsonRecord, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`HeatMap payload field "${key}" must be a positive integer.`);
  }

  return value;
}

function readOptionalPositiveInteger(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`HeatMap payload field "${key}" must be a positive integer when provided.`);
  }

  return value;
}

function readString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readGranularity(record: JsonRecord, key: string): ProfilingGranularity {
  const value = record[key];
  if (value === 'function-projected' || value === 'line') {
    return value;
  }

  throw new Error(`HeatMap payload field "${key}" must be "function-projected" or "line".`);
}

function hasRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
