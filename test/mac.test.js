import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_SCRIPT, HOOK_EVENTS, HOOK_SCRIPT, PERMISSION_SCRIPT, withPainelHooks, withoutPainelHooks } from '../scripts/mac.js';

const other = { hooks: [{ type: 'command', command: '/outro/hook' }] };

test('adiciona o hook em todos os eventos sem apagar os que já existem', () => {
  const before = { model: 'x', hooks: { Stop: [other] } };
  const after = withPainelHooks(before);
  assert.deepEqual(Object.keys(after.hooks).sort(), [...HOOK_EVENTS].sort());
  // Stop: o seu hook, o de evento e o do chat.
  assert.equal(after.hooks.Stop.length, 3);
  assert.equal(after.hooks.Stop[0], other);
  assert.equal(after.hooks.UserPromptSubmit.length, 1);
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

test('o hook do chat vai em SessionStart e Stop, com asyncRewake e timeout longo, e sai na desinstalação', () => {
  const after = withPainelHooks({});
  ['SessionStart', 'Stop'].forEach((event) => {
    const chat = after.hooks[event].map((g) => g.hooks[0]).find((h) => h.command === CHAT_SCRIPT);
    assert.ok(chat, `${event} tem o hook do chat`);
    assert.equal(chat.asyncRewake, true);
    assert.ok(chat.timeout >= 3600);
  });
  assert.ok(!after.hooks.PreToolUse.some((g) => g.hooks[0].command === CHAT_SCRIPT));
  assert.ok(!JSON.stringify(withoutPainelHooks(after)).includes(CHAT_SCRIPT));
});
