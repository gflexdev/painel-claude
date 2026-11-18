import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOOK_EVENTS, HOOK_SCRIPT, PERMISSION_SCRIPT, withPainelHooks, withoutPainelHooks } from '../scripts/mac.js';

const other = { hooks: [{ type: 'command', command: '/outro/hook' }] };

test('adiciona o hook em todos os eventos sem apagar os que já existem', () => {
  const before = { model: 'x', hooks: { Stop: [other] } };
  const after = withPainelHooks(before);
  assert.deepEqual(Object.keys(after.hooks).sort(), [...HOOK_EVENTS].sort());
  assert.equal(after.hooks.Stop.length, 2);
  assert.equal(after.hooks.Stop[0], other);
  assert.equal(after.model, 'x');
  assert.equal(before.hooks.Stop.length, 1, 'não altera o objeto original');
});

test('é idempotente', () => {
  const once = withPainelHooks({});
  assert.deepEqual(withPainelHooks(once), once);
});

test('PermissionRequest usa o hook de permissão com timeout longo e troca a versão antiga', () => {
  const old = { hooks: { PermissionRequest: [other, { hooks: [{ type: 'command', command: HOOK_SCRIPT, timeout: 3 }] }] } };
  const after = withPainelHooks(old);
  assert.equal(after.hooks.PermissionRequest.length, 2);
  assert.equal(after.hooks.PermissionRequest[1].hooks[0].command, PERMISSION_SCRIPT);
  assert.equal(after.hooks.PermissionRequest[1].hooks[0].timeout, 600);
});

test('remove só o hook do painel', () => {
  const installed = withPainelHooks({ hooks: { Stop: [other] } });
  const removed = withoutPainelHooks(installed);
  assert.deepEqual(removed.hooks, { Stop: [other] });
  assert.ok(!JSON.stringify(removed).includes(HOOK_SCRIPT));
});
