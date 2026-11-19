import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adoptSessions, createDiscovery, parseAgents, projectDirOf, transcriptOf } from '../src/discover.js';
import { applyEvent, toView } from '../src/state.js';

const AGENTS = JSON.stringify([
  { pid: 101, cwd: '/Users/x/dev/site', kind: 'interactive', startedAt: 1000, sessionId: 'sessao-app', name: 'site', status: 'idle' },
  { pid: 202, cwd: '/Users/x/dev/api', kind: 'background', id: '7c5dcf5d', sessionId: 'sessao-bg', name: 'testes  da   api', status: 'busy' },
  { pid: 303, cwd: '/Users/x/.config/painel-claude/sonda-uso', kind: 'interactive', sessionId: 'sonda', status: 'busy' },
  { cwd: '/x', kind: 'interactive' },
  { cwd: 'relativo', kind: 'interactive', sessionId: 'rel' },
  { cwd: '/x', sessionId: '../fora' },
]);

test('parseAgents: lê os campos documentados e ignora o que não é sessão', () => {
  assert.deepEqual(parseAgents(AGENTS, { ignoreCwd: '/Users/x/.config/painel-claude/sonda-uso' }), [
    { sessionId: 'sessao-app', cwd: '/Users/x/dev/site', kind: 'interactive', jobId: null, name: 'site', busy: false, startedAt: 1000 },
    { sessionId: 'sessao-bg', cwd: '/Users/x/dev/api', kind: 'background', jobId: '7c5dcf5d', name: 'testes da api', busy: true, startedAt: null },
  ]);
  assert.deepEqual(parseAgents('não é json'), []);
  assert.deepEqual(parseAgents('{"a":1}'), []);
  // Id curto só vale para sessão de segundo plano e com formato seguro.
  assert.equal(parseAgents(JSON.stringify([{ cwd: '/a', sessionId: 's', kind: 'interactive', id: 'abcd1234' }]))[0].jobId, null);
  assert.equal(parseAgents(JSON.stringify([{ cwd: '/a', sessionId: 's', kind: 'background', id: '--rm' }]))[0].jobId, null);
});

test('transcriptOf: caminho do transcript em ~/.claude/projects, só se existir', () => {
  assert.equal(projectDirOf('/Users/x/dev/my.app'), '-Users-x-dev-my-app');
  const seen = [];
  const path = transcriptOf('/Users/x/dev/app', 's1', { claudeDir: '/h/.claude', exists: (p) => { seen.push(p); return true; } });
  assert.equal(path, '/h/.claude/projects/-Users-x-dev-app/s1.jsonl');
  assert.equal(transcriptOf('/a', 's1', { exists: () => false }), null);
});

test('adoptSessions: sessão desconhecida entra com nome e pasta; busy = rodando', () => {
  const found = parseAgents(AGENTS);
  const sessions = adoptSessions({}, found, 5000);
  assert.equal(sessions['sessao-app'].status, 'idle');
  assert.equal(sessions['sessao-app'].adopted, true);
  assert.equal(sessions['sessao-bg'].status, 'working');
  const view = toView(sessions, 5000 + 60 * 60_000);
  const bg = view.find((s) => s.id === 'sessao-bg');
  assert.equal(bg.name, 'testes da api');
  assert.equal(bg.project, 'api');
  assert.equal(bg.stale, false, 'sessão adotada não fica "sem sinal"');
});

test('adoptSessions: segue o status da lista e encerra a adotada que sumiu; sessão com hook não é tocada', () => {
  const found = parseAgents(AGENTS);
  let sessions = adoptSessions({}, found, 5000);
  sessions = applyEvent(sessions, { session_id: 'sessao-app', cwd: '/Users/x/dev/site', hook_event_name: 'UserPromptSubmit', prompt: 'oi' }, 6000);
  assert.equal(sessions['sessao-app'].adopted, false);
  const before = sessions;
  // A de segundo plano ficou ociosa; a do app sumiu da lista mas fala por hook.
  sessions = adoptSessions(sessions, [{ ...found[1], busy: false }], 7000);
  assert.equal(sessions['sessao-bg'].status, 'idle');
  assert.equal(sessions['sessao-bg'].unseen, true);
  assert.equal(sessions['sessao-app'], before['sessao-app']);
  sessions = adoptSessions(sessions, [], 8000);
  assert.equal(sessions['sessao-bg'].status, 'ended');
  assert.equal(sessions['sessao-app'].status, 'working');
});

test('adoptSessions não muda nada quando a lista é a mesma (mesmo objeto)', () => {
  const found = parseAgents(AGENTS);
  const sessions = adoptSessions({}, found, 5000);
  assert.equal(adoptSessions(sessions, found, 6000), sessions);
});

test('createDiscovery: roda o comando, entrega a lista e guarda a última; sem claude, não faz nada', async () => {
  const got = [];
  const discovery = createDiscovery({ bin: '/bin/claude', run: async () => AGENTS, onList: (list) => got.push(list) });
  const list = await discovery.refresh();
  assert.equal(list.length, 3);
  assert.equal(got.length, 1);
  assert.equal(discovery.latest()[1].jobId, '7c5dcf5d');
  const errors = [];
  const failing = createDiscovery({ bin: '/bin/claude', run: async () => { throw new Error('x'); }, onList: () => {}, onError: (c) => errors.push(c) });
  assert.equal(await failing.refresh(), null);
  assert.equal(errors.length, 1);
  const none = createDiscovery({ bin: null, onList: () => { throw new Error('não devia'); } });
  assert.equal(none.available, false);
  assert.equal(await none.refresh(), null);
});
