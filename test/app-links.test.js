import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLinks, createAppLinks, parseAppSession } from '../src/app-links.js';

const parent = { sessionId: 'local_pai', cliSessionId: 'cli-pai', title: 'Painel' };
const child = {
  sessionId: 'local_filha', cliSessionId: 'cli-filha', priorCliSessionIds: ['cli-filha-antiga'],
  spawnedFrom: { sessionId: 'local_pai', sideSession: true }, startChain: { firstSessionId: 'local_pai', depth: 1 },
};

test('parseAppSession: pega ids, pai e profundidade; ignora arquivo estranho', () => {
  assert.deepEqual(parseAppSession(child), {
    localId: 'local_filha', cliIds: ['cli-filha', 'cli-filha-antiga'], cliSessionId: 'cli-filha', parentLocalId: 'local_pai', depth: 1,
    scheduled: false,
  });
  assert.equal(parseAppSession(parent).parentLocalId, null);
  assert.equal(parseAppSession({ sessionId: 'x' }), null);
  assert.equal(parseAppSession({ sessionId: '../x', cliSessionId: 'y' }), null);
});

test('buildLinks: a filha aponta para o id atual do pai, por todos os ids dela', () => {
  const links = buildLinks([parseAppSession(parent), parseAppSession(child)]);
  assert.deepEqual(links.get('cli-filha'), { parentId: 'cli-pai', depth: 1 });
  assert.deepEqual(links.get('cli-filha-antiga'), { parentId: 'cli-pai', depth: 1 });
  assert.equal(links.has('cli-pai'), false);
});

test('buildLinks: pai desconhecido não cria vínculo', () => {
  assert.equal(buildLinks([parseAppSession(child)]).size, 0);
});

test('createAppLinks: lê a pasta do app, acha o pai antigo e avisa só quando muda', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'painel-app-'));
  const folder = join(dir, 'conta', 'org');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'local_pai.json'), JSON.stringify(parent));
  writeFileSync(join(folder, 'local_filha.json'), JSON.stringify(child));
  writeFileSync(join(folder, 'outro.txt'), 'x');
  const old = new Date(Date.now() - 5 * 24 * 3600_000);
  utimesSync(join(folder, 'local_pai.json'), old, old);

  let changes = 0;
  const links = createAppLinks({ dir, onChange: () => { changes += 1; } });
  await links.refresh();
  await links.refresh();
  assert.deepEqual(links.linkOf('cli-filha'), { parentId: 'cli-pai', depth: 1 });
  assert.equal(changes, 1);
});

test('createAppLinks: pasta inexistente não é erro', async () => {
  let errors = 0;
  const links = createAppLinks({ dir: join(tmpdir(), 'nao-existe-painel'), onError: () => { errors += 1; } });
  await links.refresh();
  assert.equal(links.size(), 0);
  assert.equal(errors, 0);
});

test('tarefa agendada: scheduledTaskId marca a sessão (por todos os ids dela) e só lê o campo', async () => {
  assert.equal(parseAppSession({ ...parent, scheduledTaskId: 'task_123' }).scheduled, true);
  assert.equal(parseAppSession({ ...parent, scheduledTaskId: '' }).scheduled, false);
  assert.equal(parseAppSession({ ...parent, scheduledTaskId: 42 }).scheduled, false);
  const dir = mkdtempSync(join(tmpdir(), 'painel-app-agendada-'));
  const folder = join(dir, 'conta', 'org');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'local_agendada.json'), JSON.stringify({
    sessionId: 'local_agendada', cliSessionId: 'cli-agendada', priorCliSessionIds: ['cli-agendada-antes'], scheduledTaskId: 'relatorio',
  }));
  writeFileSync(join(folder, 'local_pai.json'), JSON.stringify(parent));
  let changes = 0;
  const links = createAppLinks({ dir, onChange: () => { changes += 1; } });
  await links.refresh();
  assert.equal(links.isScheduled('cli-agendada'), true);
  assert.equal(links.isScheduled('cli-agendada-antes'), true);
  assert.equal(links.isScheduled('cli-pai'), false);
  assert.equal(changes, 1, 'agendada nova conta como mudança');
});
