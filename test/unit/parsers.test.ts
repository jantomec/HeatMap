import assert from 'node:assert/strict';
import test from 'node:test';

import { parseDiscoveryResponse, parseProfileResponse } from '../../src/backends/parsers';

const workspaceRoot = '/tmp/heatmap-workspace';

test('parseDiscoveryResponse resolves relative file paths', () => {
  const payload = JSON.stringify({
    targets: [
      {
        id: 'tests/test_app.py::test_example',
        label: 'test_example',
        filePath: 'tests/test_app.py',
        line: 4
      }
    ]
  });

  const targets = parseDiscoveryResponse(payload, workspaceRoot);

  assert.equal(targets.length, 1);
  assert.equal(targets[0]?.filePath, '/tmp/heatmap-workspace/tests/test_app.py');
});

test('parseProfileResponse merges duplicate lines from helper payloads', () => {
  const payload = JSON.stringify({
    target: {
      id: 'tests/test_app.py::test_example',
      label: 'test_example',
      filePath: 'tests/test_app.py',
      line: 4
    },
    files: [
      {
        path: 'app.py',
        metrics: [
          {
            line: 2,
            callCount: 2,
            totalTimeMs: 4,
            cumulativeTimeMs: 8,
            functionName: 'outer',
            granularity: 'function-projected'
          },
          {
            line: 2,
            callCount: 1,
            totalTimeMs: 1,
            cumulativeTimeMs: 3,
            functionName: 'inner',
            granularity: 'function-projected'
          }
        ]
      }
    ]
  });

  const session = parseProfileResponse(
    payload,
    'python-pytest',
    {
      id: 'fallback',
      label: 'fallback',
      filePath: '/tmp/heatmap-workspace/tests/test_app.py'
    },
    workspaceRoot
  );

  assert.equal(session.files.length, 1);
  assert.equal(session.files[0]?.path, '/tmp/heatmap-workspace/app.py');
  assert.deepEqual(session.files[0]?.metrics[0], {
    line: 2,
    callCount: 3,
    totalTimeMs: 5,
    cumulativeTimeMs: 11,
    functionName: 'outer, inner',
    granularity: 'function-projected'
  });
});

test('parseProfileResponse rejects malformed JSON', () => {
  assert.throws(
    () =>
      parseProfileResponse(
        '{"files": [',
        'python-pytest',
        {
          id: 'fallback',
          label: 'fallback',
          filePath: '/tmp/heatmap-workspace/tests/test_app.py'
        },
        workspaceRoot
      ),
    /invalid JSON/i
  );
});
