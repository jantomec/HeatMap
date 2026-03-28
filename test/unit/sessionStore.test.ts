import assert from 'node:assert/strict';
import test from 'node:test';

import { SessionStore } from '../../src/core/sessionStore';
import type { ProfileSession } from '../../src/core/types';

function createSession(): ProfileSession {
  return {
    backendId: 'python-pytest',
    createdAt: new Date().toISOString(),
    target: {
      id: 'tests/test_app.py::test_example',
      label: 'test_example',
      filePath: '/workspace/tests/test_app.py',
      line: 4
    },
    files: [
      {
        path: '/workspace/app.py',
        metrics: []
      }
    ]
  };
}

test('SessionStore starts empty and hidden', () => {
  const store = new SessionStore();

  assert.equal(store.hasSession(), false);
  assert.equal(store.isVisible(), false);
  assert.equal(store.toggleVisibility(), undefined);
});

test('SessionStore stores a session and toggles visibility', () => {
  const store = new SessionStore();
  store.setSession(createSession());

  assert.equal(store.hasSession(), true);
  assert.equal(store.isVisible(), true);
  assert.equal(store.toggleVisibility(), false);
  assert.equal(store.isVisible(), false);
  assert.equal(store.toggleVisibility(), true);
});
