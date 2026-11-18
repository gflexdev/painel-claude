import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACTIVE_EVERY_MS, IDLE_EVERY_MS, PROBE_ARGS, createUsageProbe, findClaude, parseUsageReport } from '../src/usage-probe.js';

const stream = (limits) => [
  JSON.stringify({ type: 'system', subtype: 'init' }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '...' }] }, usage_report: { rate_limits: { limits } } }),
  JSON.stringify({ type: 'result', total_cost_usd: 0 }),
].join('\n');

const WEEKLY = { kind: 'weekly_all', group: 'weekly', percent: 86, resets_at: '2026-11-20T11:59:59.544998+00:00', scope: null };
const FABLE = { kind: 'weekly_scoped', group: 'weekly', percent: 75, resets_at: '2026-11-20T11:59:59Z', scope: { model: { display_name: 'Fable' } } };

test('parseUsageReport: semana, limite por modelo e reset em ms', () => {
  const report = parseUsageReport(stream([WEEKLY, FABLE]));
  assert.deepEqual(report.sevenDay, { usedPercentage: 86, resetsAt: Date.parse('2026-11-20T11:59:59.544998Z') });
  assert.equal(report.fiveHour, undefined);
  assert.deepEqual(report.scoped, [{ label: 'Fable', usedPercentage: 75, resetsAt: Date.parse('2026-11-20T11:59:59Z') }]);
});

test('parseUsageReport: janela de sessão (5 h) quando o plano tem', () => {
  const report = parseUsageReport(stream([{ kind: 'session', group: 'session', percent: 12.5, resets_at: '2026-11-18T18:00:00Z' }, WEEKLY]));
  assert.equal(report.fiveHour.usedPercentage, 12.5);
});

test('parseUsageReport: sem usage_report, lixo ou sem limites devolve null', () => {
  assert.equal(parseUsageReport('{"type":"result"}'), null);
  assert.equal(parseUsageReport('nada aqui usage_report {'), null);
  assert.equal(parseUsageReport(stream([])), null);
  assert.equal(parseUsageReport(undefined), null);
});

test('a consulta desliga os hooks e não salva sessão', () => {
  assert.ok(PROBE_ARGS.includes('--no-session-persistence'));
  assert.ok(PROBE_ARGS.includes('{"disableAllHooks":true}'));
  assert.deepEqual(PROBE_ARGS.slice(0, 2), ['-p', '/usage']);
});

test('findClaude: usa o configurado se existir; senão procura nos lugares de sempre; senão null', () => {
  assert.equal(findClaude('/x/claude', (p) => p === '/x/claude'), '/x/claude');
  assert.match(findClaude('/nao/existe', (p) => p.endsWith('/.local/bin/claude')), /\.local\/bin\/claude$/);
  assert.equal(findClaude(null, () => false), null);
});

test('createUsageProbe: entrega o relatório e espera mais quando falha', async () => {
  const workDir = join(mkdtempSync(join(tmpdir(), 'painel-sonda-')), 'sonda');
  const reports = [];
  let fail = false;
  const probe = createUsageProbe({
    claudeBin: process.execPath, workDir,
    run: async () => (fail ? Promise.reject(new Error('caiu')) : stream([WEEKLY])),
    onReport: (r) => reports.push(r),
  });
  assert.equal(await probe.probe(), true);
  assert.equal(reports[0].sevenDay.usedPercentage, 86);
  assert.equal(probe.nextDelay(), IDLE_EVERY_MS);
  fail = true;
  assert.equal(await probe.probe(), false);
  assert.equal(probe.nextDelay(), IDLE_EVERY_MS * 2);
});

test('createUsageProbe: com sessão rodando consulta mais vezes; sem claude não faz nada', async () => {
  const workDir = join(mkdtempSync(join(tmpdir(), 'painel-sonda-')), 'sonda');
  const active = createUsageProbe({ claudeBin: process.execPath, workDir, isActive: () => true, run: async () => stream([WEEKLY]), onReport: () => {} });
  assert.equal(active.nextDelay(), ACTIVE_EVERY_MS);
  const missing = createUsageProbe({ claudeBin: '/nao/existe', workDir, run: async () => { throw new Error('não devia rodar'); }, onReport: () => {} });
  if (!missing.available) assert.equal(await missing.probe(), false);
});
