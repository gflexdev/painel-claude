import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countHumanTurns, extractMeta, extractSummary, isAllowedTranscript, modelLabel, parseLines,
} from '../src/transcript.js';
import { describeTool } from '../src/tools.js';

const lines = [
  '{"type":"custom-title","customTitle":"Título antigo"}',
  '{"type":"user","entrypoint":"claude-desktop","message":{"role":"user","content":"arruma o deploy"}}',
  '{"type":"assistant","message":{"id":"m1","content":[{"type":"text","text":"Vou olhar o log."}]}}',
  '{"type":"assistant","message":{"id":"m1","content":[{"type":"tool_use","name":"Bash","input":{"description":"Lê o log"}}]}}',
  '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"ok"}]}}',
  '{"type":"assistant","message":{"id":"m2","content":[{"type":"text","text":"Pronto, o deploy subiu."}]}}',
  '{"type":"custom-title","customTitle":"Deploy do site"}',
  '{"type":"last-prompt","lastPrompt":"arruma o deploy"}',
  '{"type":"assistant","isSidechain":true,"message":{"id":"m3","content":[{"type":"text","text":"texto de subagente"}]}}',
  '{"type":"assistant", cortada',
].join('\n');

test('parseLines ignora linha cortada', () => {
  assert.equal(parseLines(lines).length, 9);
});

test('extractMeta pega o título mais recente e a origem', () => {
  const meta = extractMeta(parseLines(lines));
  assert.equal(meta.title, 'Deploy do site');
  assert.equal(meta.entrypoint, 'app');
});

test('extractMeta lê modelo e contexto da última resposta principal', () => {
  const withUsage = [
    '{"type":"assistant","message":{"id":"a","model":"claude-opus-5-5","usage":{"input_tokens":2,"cache_read_input_tokens":80000,"cache_creation_input_tokens":3000,"output_tokens":998}}}',
    '{"type":"assistant","isSidechain":true,"message":{"id":"b","model":"claude-haiku-4-5","usage":{"input_tokens":5}}}',
  ].join('\n');
  const meta = extractMeta(parseLines(withUsage));
  assert.equal(meta.model, 'opus 5.5');
  assert.equal(meta.contextTokens, 84000);
});

test('modelLabel encurta ids de modelo', () => {
  assert.equal(modelLabel('claude-opus-5-5'), 'opus 5.5');
  assert.equal(modelLabel('claude-haiku-4-5-20251001'), 'haiku 4.5');
  assert.equal(modelLabel('claude-sonnet-5-5[1m]'), 'sonnet 5.5');
  assert.equal(modelLabel(undefined), null);
});

test('countHumanTurns conta só os pedidos humanos', () => {
  const buf = Buffer.from('{"turnOrigin":"human"}\n{"turnOrigin":"tool"}\n{"type":"user","turnOrigin":"human"}\n');
  assert.equal(countHumanTurns(buf), 2);
});

test('extractSummary traz último pedido, última resposta e ferramentas', () => {
  const s = extractSummary(parseLines(lines));
  assert.equal(s.lastPrompt, 'arruma o deploy');
  assert.equal(s.answer, 'Pronto, o deploy subiu.');
  assert.deepEqual(s.recentTools, ['Bash: Lê o log']);
});

test('extractSummary sem last-prompt usa a última mensagem humana', () => {
  const s = extractSummary(parseLines(lines.split('\n').filter((l) => !l.includes('last-prompt')).join('\n')));
  assert.equal(s.lastPrompt, 'arruma o deploy');
});

test('isAllowedTranscript só aceita jsonl dentro da pasta de projetos', () => {
  assert.equal(isAllowedTranscript('/root/p/a.jsonl', '/root'), true);
  assert.equal(isAllowedTranscript('/root/../etc/passwd.jsonl', '/root'), false);
  assert.equal(isAllowedTranscript('/root/p/a.txt', '/root'), false);
  assert.equal(isAllowedTranscript(undefined, '/root'), false);
});

test('describeTool encurta MCP, arquivos e web', () => {
  assert.equal(describeTool('mcp__abc__listar_tarefas', {}), 'listar_tarefas (MCP)');
  assert.equal(describeTool('Write', { file_path: '/a/b/c.js' }), 'Write c.js');
  assert.equal(describeTool('WebFetch', { url: 'https://exemplo.com/x' }), 'WebFetch exemplo.com');
  assert.equal(describeTool('Bash', { command: 'x'.repeat(200) }).length, 70);
});
