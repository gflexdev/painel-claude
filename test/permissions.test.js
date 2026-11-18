import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPermissions, hookOutput, previewInput } from '../src/permissions.js';
import { buildAnswers, questionsOf } from '../src/questions.js';

const event = { session_id: 's1', tool_name: 'Bash', tool_input: { command: 'rm -rf build', description: 'Limpa o build' } };
const askInput = {
  questions: [
    { question: 'Qual banco?', header: 'Banco', multiSelect: false, options: [{ label: 'Postgres', description: 'relacional' }, { label: 'SQLite' }] },
    { question: 'Quais testes?', header: 'Testes', multiSelect: true, options: [{ label: 'unit' }, { label: 'e2e' }, { label: 'carga' }] },
  ],
};
const askEvent = { session_id: 's2', tool_name: 'AskUserQuestion', tool_input: askInput };

test('decisão do painel resolve o pedido e avisa a mudança', async () => {
  let changes = 0;
  const perms = createPermissions({ timeoutMs: 5000, onChange: () => { changes += 1; } });
  const waiting = perms.wait(event);
  const [pending] = perms.forSession('s1');
  assert.equal(pending.preview, 'rm -rf build');
  assert.equal(pending.tool, 'Bash: Limpa o build');
  assert.equal(pending.kind, 'permission');
  assert.equal(pending.toolInput, undefined, 'tool_input original não vai para a tela');
  assert.equal(perms.decide(pending.id, 'allow'), true);
  assert.deepEqual(await waiting, { behavior: 'allow' });
  assert.equal(perms.size(), 0);
  assert.equal(changes, 2);
});

test('segunda decisão sobre o mesmo pedido não vale', async () => {
  const perms = createPermissions({ timeoutMs: 5000, onChange: () => {} });
  const waiting = perms.wait(event);
  const [{ id }] = perms.forSession('s1');
  perms.decide(id, 'deny');
  assert.equal(perms.decide(id, 'allow'), false);
  assert.deepEqual(await waiting, { behavior: 'deny' });
});

test('tempo esgotado devolve null', async () => {
  const perms = createPermissions({ timeoutMs: 20, onChange: () => {} });
  assert.equal(await perms.wait(event), null);
  assert.equal(perms.size(), 0);
});

test('respondido no Mac (hook cancelado) tira o pedido da tela', async () => {
  const perms = createPermissions({ timeoutMs: 5000, onChange: () => {} });
  const controller = new AbortController();
  const waiting = perms.wait(event, controller.signal);
  controller.abort();
  assert.equal(await waiting, null);
  assert.deepEqual(perms.forSession('s1'), []);
});

test('decisão inválida é recusada', () => {
  const perms = createPermissions({ timeoutMs: 5000, onChange: () => {} });
  assert.throws(() => perms.decide('x', 'talvez'));
});

test('pergunta respondida devolve o input original com answers', async () => {
  const perms = createPermissions({ timeoutMs: 5000, onChange: () => {} });
  const waiting = perms.wait(askEvent);
  const [pending] = perms.forSession('s2');
  assert.equal(pending.kind, 'question');
  assert.equal(pending.questions.length, 2);
  perms.decide(pending.id, 'allow', { 'Qual banco?': 'SQLite', 'Quais testes?': ['unit', 'e2e'] });
  const decision = await waiting;
  assert.equal(decision.behavior, 'allow');
  assert.deepEqual(decision.updatedInput.questions, askInput.questions);
  assert.deepEqual(decision.updatedInput.answers, { 'Qual banco?': 'SQLite', 'Quais testes?': ['unit', 'e2e'] });
});

test('pergunta com resposta inválida é recusada e continua pendente', () => {
  const perms = createPermissions({ timeoutMs: 5000, onChange: () => {} });
  perms.wait(askEvent);
  const [{ id }] = perms.forSession('s2');
  assert.throws(() => perms.decide(id, 'allow', { 'Qual banco?': 'Oracle', 'Quais testes?': ['unit'] }), /escolha inválida/);
  assert.throws(() => perms.decide(id, 'allow', { 'Qual banco?': 'SQLite' }), /Quais testes/);
  assert.equal(perms.size(), 1);
  assert.equal(perms.decide(id, 'deny'), true);
});

test('buildAnswers: escolha única não aceita duas opções; texto livre aceita string', () => {
  const qs = questionsOf({ questions: [
    { question: 'A?', options: [{ label: 'x' }, { label: 'y' }] },
    { question: 'Nome?', kind: 'text' },
  ] });
  assert.throws(() => buildAnswers(qs, { 'A?': ['x', 'y'], 'Nome?': 'z' }), /escolha uma opção/);
  assert.deepEqual(buildAnswers(qs, { 'A?': 'x', 'Nome?': '  painel  ' }), { 'A?': 'x', 'Nome?': 'painel' });
  assert.throws(() => buildAnswers(qs, { 'A?': 'x', 'Nome?': '' }), /falta responder/);
});

test('formato da saída do hook', () => {
  assert.deepEqual(hookOutput({ behavior: 'allow' }), { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
  assert.deepEqual(hookOutput({ behavior: 'allow', updatedInput: { a: 1 } }).hookSpecificOutput.decision, { behavior: 'allow', updatedInput: { a: 1 } });
  assert.equal(hookOutput({ behavior: 'deny' }).hookSpecificOutput.decision.behavior, 'deny');
  assert.ok(hookOutput({ behavior: 'deny' }).hookSpecificOutput.decision.message);
});

test('previewInput mantém as quebras de linha do comando e mostra o plano', () => {
  assert.equal(previewInput('Bash', { command: 'npm run build\nnpm run deploy' }), 'npm run build\nnpm run deploy');
  assert.equal(previewInput('ExitPlanMode', { plan: '# Plano\n1. fazer' }), '# Plano\n1. fazer');
});

test('previewInput mostra arquivo, url ou JSON', () => {
  assert.equal(previewInput('Edit', { file_path: '/a/b.js', old_string: 'x' }), '/a/b.js');
  assert.equal(previewInput('WebFetch', { url: 'https://x.dev' }), 'https://x.dev');
  assert.equal(previewInput('mcp__x__y', { a: 1 }), '{"a":1}');
});
