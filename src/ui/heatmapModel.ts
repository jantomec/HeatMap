import type { LineMetric } from '../core/types';

export interface HeatLineDecorationData {
  line: number;
  intensity: number;
  bucket: number;
  hudText: string;
  hoverMarkdown: string;
}

export function buildFileHeatmap(
  metrics: readonly LineMetric[],
  lineCount: number,
  bucketCount = 8
): HeatLineDecorationData[] {
  const validMetrics = metrics
    .filter((metric) => metric.line >= 1 && metric.line <= lineCount)
    .filter((metric) => metric.callCount > 0 || metric.totalTimeMs > 0 || metric.cumulativeTimeMs > 0)
    .sort((left, right) => left.line - right.line);

  if (validMetrics.length === 0) {
    return [];
  }

  const maxTotalTimeMs = Math.max(...validMetrics.map((metric) => metric.totalTimeMs));
  return validMetrics.map((metric) => {
    const intensity = calculateHeatIntensity(metric.totalTimeMs, maxTotalTimeMs);
    return {
      line: metric.line,
      intensity,
      bucket: toHeatBucket(intensity, bucketCount),
      hudText: formatHud(metric),
      hoverMarkdown: buildHoverMarkdown(metric)
    };
  });
}

export function calculateHeatIntensity(value: number, maxValue: number): number {
  if (value <= 0 || maxValue <= 0) {
    return 0;
  }

  return Math.log1p(value) / Math.log1p(maxValue);
}

export function toHeatBucket(intensity: number, bucketCount: number): number {
  if (bucketCount <= 1) {
    return 0;
  }

  const clampedIntensity = Math.min(Math.max(intensity, 0), 1);
  return Math.min(bucketCount - 1, Math.floor(clampedIntensity * bucketCount));
}

export function formatHud(metric: LineMetric): string {
  const parts = [`total ${formatDuration(metric.totalTimeMs)}`];
  if (Math.abs(metric.cumulativeTimeMs - metric.totalTimeMs) >= 0.001) {
    parts.push(`cum ${formatDuration(metric.cumulativeTimeMs)}`);
  }

  parts.push(`${metric.granularity === 'line' ? 'hits' : 'calls'} ${formatCallCount(metric.callCount)}`);
  return parts.join(' | ');
}

export function formatDuration(durationMs: number): string {
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(2)} s`;
  }

  if (durationMs >= 100) {
    return `${durationMs.toFixed(0)} ms`;
  }

  if (durationMs >= 1) {
    return `${durationMs.toFixed(2)} ms`;
  }

  return `${durationMs.toFixed(3)} ms`;
}

export function formatCallCount(callCount: number): string {
  if (callCount >= 1000) {
    return `${(callCount / 1000).toFixed(1)}k`;
  }

  return `${callCount}`;
}

function buildHoverMarkdown(metric: LineMetric): string {
  const countLabel = metric.granularity === 'line' ? 'Hits' : 'Calls';
  const lines = [`**${metric.functionName}**`, '', `- Total time: ${formatDuration(metric.totalTimeMs)}`];
  if (Math.abs(metric.cumulativeTimeMs - metric.totalTimeMs) >= 0.001) {
    lines.push(`- Cumulative time: ${formatDuration(metric.cumulativeTimeMs)}`);
  }

  return [
    ...lines,
    `- ${countLabel}: ${formatCallCount(metric.callCount)}`,
    `- Granularity: ${metric.granularity}`
  ].join('\n');
}
