import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.js';
import { createVigia } from '../src/vigia.js';
import { createPush, pushAviso } from '../src/push.js';
import { generateVapidKeys } from '../src/webpush.js';
import { pushDevice } from './webpush-device.js';

const ev = (name, id, extra = {}) => ({ hook_event_name: name, session_id: id, cwd: '/u/projeto-a', ...extra });
/** O envio não bloqueia a ingestão: espera a criptografia e o transporte falso terminarem. */
const settle = () => new Promise((resolve) => { setTimeout(resolve, 20); });

/**
 * O caminho inteiro do Aviso, ligado como no server.js: eventos de hook → store de verdade → Vigia → Web Push → dois
 * aparelhos inscritos. O transporte é falso e cada aparelho abre o que chegou para ele com a própria chave.
 */
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'painel-avisos-'));
  const phone = pushDevice('celular');
  const tablet = pushDevice('tablet');
  const inbox = { celular: [], tablet: [] };
  const opener = { celular: phone.open, tablet: tablet.open };
  const transport = async (endpoint, { body }) => {
    const name = endpoint.split('/').at(-1);
    inbox[name].push(opener[name](body));
    return { status: 201 };
  };
  const push = createPush({ file: join(dir, 'aparelhos.json'), vapid: generateVapidKeys(), transport });
  push.subscribe(phone.subscription);
  push.subscribe(tablet.subscription);
  const vigia = createVigia({ file: join(dir, 'vigia.json'), send: (aviso) => push.notify(pushAviso(aviso)) });
  const store = createStore({
    stateFile: join(dir, 'state.json'),
    eventsLog: join(dir, 'eventos.log'),
    debug: false,
    onError: (context, error) => { throw new Error(`${context}: ${error?.message ?? error}`); },
    onSessionChange: (before, after, event) => vigia.observe(before, after, event),
  });
  const hook = (name, id, extra = {}, options = {}) => store.ingest(ev(name, id, extra), options);
  return { vigia, store, hook, inbox };
}

test('o Aviso da Vigia chega a todos os aparelhos só com Situação, nome, projeto e id', async () => {
  const app = setup();
  app.hook('UserPromptSubmit', 's1', { prompt: 'pedido-confidencial: faz o deploy' });
  app.vigia.watch('s1');
  app.hook('PermissionRequest', 's1', { tool_name: 'Bash', tool_input: { command: 'rm -rf segredo' } });
  app.hook('PostToolUse', 's1', { tool_response: { stdout: 'saida-do-comando' } });
  app.hook('Stop', 's1', { last_assistant_message: 'trecho-da-resposta' });
  await settle();

  const expected = [
    { status: 'waiting', name: 'sessão s1', project: 'projeto-a', sessionId: 's1' },
    { status: 'done', name: 'sessão s1', project: 'projeto-a', sessionId: 's1' },
  ];
  assert.deepEqual(app.inbox.celular, expected);
  assert.deepEqual(app.inbox.tablet, expected);
  assert.doesNotMatch(JSON.stringify(app.inbox), /segredo|rm -rf|pedido-confidencial|saida-do-comando|trecho-da-resposta|Bash/);
  assert.equal(app.vigia.isWatched('s1'), false, 'terminou encerrou a vigia');
});

test('comando em segundo plano e erro também chegam, e o de máquina remota diz a máquina', async () => {
  const app = setup();
  app.hook('UserPromptSubmit', 'r1', { prompt: 'sobe o servidor' }, { machine: 'vps-dev' });
  app.store.applyTranscript('r1', 'vps-dev', { meta: { title: 'Servidor de dev' }, summary: null });
  app.vigia.watch('r1');
  app.hook('Stop', 'r1', { background_tasks: [{ type: 'shell', status: 'running', command: 'npm run servidor-secreto' }] }, { machine: 'vps-dev' });
  app.hook('UserPromptSubmit', 'r1', { prompt: 'de novo' }, { machine: 'vps-dev' });
  app.hook('StopFailure', 'r1', { error: 'rate limit com dado-privado' }, { machine: 'vps-dev' });
  await settle();

  assert.deepEqual(app.inbox.celular, [
    { status: 'background', name: 'Servidor de dev', project: 'projeto-a', machine: 'vps-dev', sessionId: 'r1' },
    { status: 'error', name: 'Servidor de dev', project: 'projeto-a', machine: 'vps-dev', sessionId: 'r1' },
  ]);
  assert.doesNotMatch(JSON.stringify(app.inbox), /servidor-secreto|npm run|dado-privado|rate limit|sobe o servidor/);
});

test('sessão que não é vigiada não manda nada aos aparelhos', async () => {
  const app = setup();
  app.hook('UserPromptSubmit', 's2', { prompt: 'oi' });
  app.hook('PermissionRequest', 's2', { tool_name: 'Bash', tool_input: { command: 'ls' } });
  app.hook('PostToolUse', 's2');
  app.hook('Stop', 's2');
  await settle();
  assert.deepEqual(app.inbox, { celular: [], tablet: [] });
});

test('pushAviso: só os campos do Aviso, montados um a um', () => {
  const aviso = { id: 'abc', situation: 'done', name: 'Nome', project: 'proj', machine: 'vps', extra: 'nunca' };
  assert.deepEqual(pushAviso(aviso), { status: 'done', name: 'Nome', project: 'proj', machine: 'vps', sessionId: 'abc' });
  assert.deepEqual(pushAviso({ id: 'abc', situation: 'waiting', name: 'Nome', project: '' }),
    { status: 'waiting', name: 'Nome', project: '', sessionId: 'abc' });
});
