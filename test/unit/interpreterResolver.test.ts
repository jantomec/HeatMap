import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deduplicatePythonInvocations,
  derivePythonInvocationsFromEnvironmentPath,
  expandInterpreterSetting,
  extractPythonCommandFromResolvedEnvironment,
  normalizePythonExecCommand,
  normalizePythonEnvironmentPath
} from '../../src/backends/pythonCommandUtils';

test('expandInterpreterSetting resolves workspace variables', () => {
  const workspaceRoot = '/tmp/heatmap-workspace';

  assert.equal(
    expandInterpreterSetting('${workspaceFolder}/.venv/bin/python', workspaceRoot),
    '/tmp/heatmap-workspace/.venv/bin/python'
  );
  assert.equal(expandInterpreterSetting('python3', workspaceRoot), 'python3');
});

test('normalizePythonEnvironmentPath handles both path shapes', () => {
  assert.equal(normalizePythonEnvironmentPath('/usr/bin/python3'), '/usr/bin/python3');
  assert.equal(normalizePythonEnvironmentPath({ path: '/tmp/.venv/bin/python' }), '/tmp/.venv/bin/python');
  assert.equal(normalizePythonEnvironmentPath(undefined), undefined);
});

test('extractPythonCommandFromResolvedEnvironment prefers executable path details', () => {
  assert.equal(
    extractPythonCommandFromResolvedEnvironment({
      executable: {
        filename: '/tmp/.venv/bin/python'
      },
      path: '/tmp/.venv'
    }),
    '/tmp/.venv/bin/python'
  );

  assert.equal(
    extractPythonCommandFromResolvedEnvironment({
      path: '/tmp/.venv/bin/python'
    }),
    '/tmp/.venv/bin/python'
  );

  assert.equal(extractPythonCommandFromResolvedEnvironment(undefined), undefined);
});

test('normalizePythonExecCommand keeps wrapper arguments intact', () => {
  assert.deepEqual(normalizePythonExecCommand(['conda', 'run', '-n', 'demo', 'python']), {
    command: 'conda',
    args: ['run', '-n', 'demo', 'python']
  });
  assert.equal(normalizePythonExecCommand(undefined), undefined);
});

test('derivePythonInvocationsFromEnvironmentPath expands environment folder candidates', () => {
  const invocations = derivePythonInvocationsFromEnvironmentPath('/tmp/demo-env');

  assert.deepEqual(invocations, [
    { command: '/tmp/demo-env/bin/python', args: [] },
    { command: '/tmp/demo-env/python', args: [] }
  ]);
});

test('deduplicatePythonInvocations removes duplicate command lines', () => {
  assert.deepEqual(
    deduplicatePythonInvocations([
      { command: 'python3', args: [] },
      { command: 'python3', args: [] },
      { command: 'conda', args: ['run', '-n', 'demo', 'python'] }
    ]),
    [
      { command: 'python3', args: [] },
      { command: 'conda', args: ['run', '-n', 'demo', 'python'] }
    ]
  );
});
