import assert from 'node:assert/strict';
import test from 'node:test';

import type { LineMetric } from '../../src/core/types';
import { buildFileHeatmap, calculateHeatIntensity, formatDuration, toHeatBucket } from '../../src/ui/heatmapModel';

test('calculateHeatIntensity uses log normalization', () => {
  const low = calculateHeatIntensity(10, 1000);
  const high = calculateHeatIntensity(1000, 1000);

  assert.equal(high, 1);
  assert.ok(low > 0);
  assert.ok(low < 1);
});

test('toHeatBucket clamps values into the configured range', () => {
  assert.equal(toHeatBucket(-1, 8), 0);
  assert.equal(toHeatBucket(0.5, 8), 4);
  assert.equal(toHeatBucket(1, 8), 7);
});

test('buildFileHeatmap sorts metrics and formats HUD details', () => {
  const metrics: LineMetric[] = [
    {
      line: 5,
      callCount: 3,
      totalTimeMs: 2.5,
      cumulativeTimeMs: 2.5,
      functionName: 'slow_path',
      granularity: 'line'
    },
    {
      line: 2,
      callCount: 1,
      totalTimeMs: 0.5,
      cumulativeTimeMs: 0.5,
      functionName: 'fast_path',
      granularity: 'line'
    }
  ];

  const decorations = buildFileHeatmap(metrics, 10);

  assert.equal(decorations.length, 2);
  assert.equal(decorations[0]?.line, 2);
  assert.equal(decorations[1]?.line, 5);
  assert.match(decorations[1]?.hudText ?? '', /total 2\.50 ms \| hits 3/);
  assert.match(decorations[1]?.hoverMarkdown ?? '', /\*\*slow_path\*\*/);
});

test('formatDuration keeps small values readable', () => {
  assert.equal(formatDuration(0.125), '0.125 ms');
  assert.equal(formatDuration(12.3456), '12.35 ms');
  assert.equal(formatDuration(250), '250 ms');
  assert.equal(formatDuration(1500), '1.50 s');
});
