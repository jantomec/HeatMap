import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const workspaceRoot = path.resolve(__dirname, '../..');
const helperRoot = path.join(workspaceRoot, 'resources/python');
const fixtureFile = path.join(workspaceRoot, 'test/fixtures/python_mapper/sample_module.py');
const lineProfilerFixtureFile = path.join(workspaceRoot, 'test/fixtures/python_mapper/line_profile_target.py');

test('python_mapping dumps function spans for plain, nested, and async functions', () => {
  const result = runPythonSnippet(`
import json
import sys
sys.path.insert(0, ${JSON.stringify(helperRoot)})
import python_mapping
print(json.dumps(python_mapping.dump_function_spans(${JSON.stringify(fixtureFile)})))
`);

  const spanNames = new Set((result as Array<{ name: string }>).map((entry) => entry.name));
  assert.deepEqual(
    spanNames,
    new Set(['plain_function', 'decorator', 'decorated_function', 'method', 'outer', 'inner', 'async_worker'])
  );

  const outerSpan = (result as Array<{ name: string; lineno: number; end_lineno: number }>).find(
    (entry) => entry.name === 'outer'
  );
  assert.deepEqual(outerSpan, {
    name: 'outer',
    lineno: 20,
    end_lineno: 24,
    filename: fixtureFile
  });
});

test('python_mapping aggregates line stats onto physical lines', () => {
  const result = runPythonSnippet(`
import json
import sys
sys.path.insert(0, ${JSON.stringify(helperRoot)})
import python_mapping
rows = [
    {
        "filename": ${JSON.stringify(fixtureFile)},
        "lineno": 1,
        "functionName": "plain_function",
        "callCount": 2,
        "totalTimeMs": 5.0,
        "cumulativeTimeMs": 5.0,
    },
    {
        "filename": ${JSON.stringify(fixtureFile)},
        "lineno": 1,
        "functionName": "<listcomp>",
        "callCount": 3,
        "totalTimeMs": 3.0,
        "cumulativeTimeMs": 3.0,
    },
]
print(json.dumps(python_mapping.project_line_stats(rows, workspace_root=${JSON.stringify(workspaceRoot)})))
`);

  const files = result as Array<{
    path: string;
    metrics: Array<{
      line: number;
      callCount: number;
      totalTimeMs: number;
      functionName: string;
      granularity: string;
    }>;
  }>;
  assert.equal(files.length, 1);
  assert.equal(files[0]?.path, fixtureFile);

  assert.deepEqual(files[0]?.metrics, [
    {
      line: 1,
      callCount: 5,
      totalTimeMs: 8,
      cumulativeTimeMs: 8,
      functionName: '<listcomp>, plain_function',
      granularity: 'line'
    }
  ]);
});

test('python_line_profiler records hit counts per executed line', () => {
  const result = runPythonSnippet(`
import json
import sys
sys.path.insert(0, ${JSON.stringify(helperRoot)})
from python_line_profiler import LineProfiler
sys.path.insert(0, ${JSON.stringify(path.dirname(lineProfilerFixtureFile))})
import line_profile_target

profiler = LineProfiler(${JSON.stringify(workspaceRoot)})
profiler.start()
line_profile_target.tracked_work()
profiler.stop()

rows = [row for row in profiler.snapshot() if row["filename"] == ${JSON.stringify(lineProfilerFixtureFile)}]
print(json.dumps(rows))
`);

  const rows = result as Array<{ lineno: number; callCount: number; totalTimeMs: number; functionName: string }>;
  const metricsByLine = new Map(rows.map((row) => [row.lineno, row]));

  assert.equal(metricsByLine.get(2)?.callCount, 1);
  assert.equal(metricsByLine.get(3)?.callCount, 4);
  assert.equal(metricsByLine.get(4)?.callCount, 3);
  assert.equal(metricsByLine.get(5)?.callCount, 1);
  assert.equal(metricsByLine.get(4)?.functionName, 'tracked_work');
  assert.ok((metricsByLine.get(4)?.totalTimeMs ?? 0) >= 0);
});

function runPythonSnippet(script: string): unknown {
  const result = spawnSync('python3', ['-c', script], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
