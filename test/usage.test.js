import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCOPED_FRESH_MS, createUsage, parseRateLimits } from '../src/usage.js';
import { WINDOWS, paceOf } from '../public/pace.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test('parseRateLimits: pega 5 h e 7 dias, resets_at em segundos vira ms', () => {
  const parsed = parseRateLimits({
    cwd: '/x',
    rate_limits: {
      five_hour: { used_percentage: 23.5, resets_at: 1_738_425_600 },
      seven_day: { used_percentage: 41.2, resets_at: 1_738_857_600 },
      spend_limit: { used_percentage: 10, resets_at: 1_740_787_200 },
    },
  });
  assert.deepEqual(parsed, {
    fiveHour: { usedPercentage: 23.5, resetsAt: 1_738_425_600_000 },
    sevenDay: { usedPercentage: 41.2, resetsAt: 1_738_857_600_000 },
  });
});

test('parseRateLimits: sem rate_limits ou com valores ruins devolve null / ignora a janela', () => {
  assert.equal(parseRateLimits({ model: {} }), null);
  assert.equal(parseRateLimits(null), null);
  assert.deepEqual(parseRateLimits({ rate_limits: {
    five_hour: { used_percentage: 'x', resets_at: 1_738_425_600 },
    seven_day: { used_percentage: 140, resets_at: 1_738_857_600 },
  } }), { sevenDay: { usedPercentage: 100, resetsAt: 1_738_857_600_000 } });
});

test('createUsage: guarda no arquivo, avisa só quando muda e mantém a janela que não veio', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'painel-uso-')), 'uso.json');
  let changes = 0;
  let clock = 1_000;
  const usage = createUsage({ file, onChange: () => { changes += 1; }, now: () => clock });
  const payload = { rate_limits: {
    five_hour: { used_percentage: 10, resets_at: 2_000_000_000 },
    seven_day: { used_percentage: 30, resets_at: 2_000_500_000 },
  } };
  assert.equal(usage.update(payload), true);
  clock = 2_000;
  assert.equal(usage.update(payload), false);
  assert.equal(usage.update({ rate_limits: { five_hour: { used_percentage: 11, resets_at: 2_000_000_000 } } }), true);
  assert.equal(changes, 2);
  const view = usage.view();
  assert.equal(view.fiveHour.usedPercentage, 11);
  assert.equal(view.sevenDay.usedPercentage, 30);
  assert.equal(view.updatedAt, 2_000);
  const reloaded = createUsage({ file, onChange: () => {}, now: () => clock });
  assert.deepEqual(reloaded.view(), view);
  assert.ok(JSON.parse(readFileSync(file, 'utf8')).fiveHour);
});

test('paceOf: abaixo do ritmo projeta quanto sobra e quanto dá para usar por dia', () => {
  const now = 10 * DAY;
  // metade da semana passou, 20% usado → no ritmo atual fecha em 40%
  const pace = paceOf({ usedPercentage: 20, resetsAt: now + 3.5 * DAY }, WINDOWS.sevenDay, now);
  assert.equal(pace.state, 'under');
  assert.equal(Math.round(pace.ideal), 50);
  assert.equal(Math.round(pace.projected), 40);
  assert.equal(pace.exhaustsAt, null);
  assert.equal(Math.round(pace.neededPerUnit), 23); // (100-20)/3,5 dias
  assert.equal(Math.round(pace.currentPerUnit), 6); // 20/3,5 dias
});

test('paceOf: acima do ritmo diz quando o limite acaba', () => {
  const now = 100 * HOUR;
  // 1 h de 5 passou e já usou 40% → acaba em mais 1,5 h
  const pace = paceOf({ usedPercentage: 40, resetsAt: now + 4 * HOUR }, WINDOWS.fiveHour, now);
  assert.equal(pace.state, 'over');
  assert.equal(pace.exhaustsAt, now + 1.5 * HOUR);
});

test('paceOf: perto do ideal é "no ritmo"; começo da janela é "early"; passou do reset é "reset"', () => {
  const now = 50 * DAY;
  assert.equal(paceOf({ usedPercentage: 48, resetsAt: now + 3.5 * DAY }, WINDOWS.sevenDay, now).state, 'on');
  assert.equal(paceOf({ usedPercentage: 3, resetsAt: now + 4.9 * HOUR }, WINDOWS.fiveHour, now).state, 'early');
  assert.equal(paceOf({ usedPercentage: 90, resetsAt: now - 1 }, WINDOWS.fiveHour, now).state, 'reset');
  assert.equal(paceOf({ usedPercentage: 100, resetsAt: now + HOUR }, WINDOWS.fiveHour, now).state, 'limit');
});

test('nextReset: empurra o reset conhecido de semana em semana até o futuro', async () => {
  const { nextReset } = await import('../src/usage.js');
  const WEEK = 7 * 86_400_000;
  assert.equal(nextReset(5_000, WEEK, 1_000), 5_000);
  assert.equal(nextReset(1_000, WEEK, 1_000 + WEEK + 10), 1_000 + 2 * WEEK);
  assert.equal(nextReset(undefined, WEEK, 1), null);
});

test('updateFromApp: usa a amostra mais nova, com o reset empurrado; ignora amostra velha', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'painel-uso-')), 'uso.json');
  const WEEK = 7 * DAY;
  const base = 1_795_000_000_000;
  let clock = base;
  const usage = createUsage({ file, onChange: () => {}, now: () => clock });
  // A status line contou um reset que já passou (há 1 dia).
  assert.equal(usage.update({ rate_limits: { seven_day: { used_percentage: 40, resets_at: (base - DAY) / 1000 } } }), true);
  assert.equal(usage.updateFromApp({ t: base - 1, sd: 50 }), false, 'mais velha que a status line');
  clock = base + 1000;
  assert.equal(usage.updateFromApp({ t: clock, sd: 81, fh: 30 }), true);
  const view = usage.view();
  assert.equal(view.sevenDay.usedPercentage, 81);
  assert.equal(view.sevenDay.resetsAt, base - DAY + WEEK);
  assert.equal(view.fiveHour, undefined, 'sem reset conhecido das 5 h, não inventa');
  assert.equal(view.source, 'app');
});

test('latestSample: pega a amostra mais nova válida', async () => {
  const { latestSample } = await import('../src/app-usage.js');
  assert.deepEqual(latestSample({ samples: [{ t: 1, u: { sd: 10 } }, { t: 3, u: { sd: 30, fh: 5 } }, { t: 2, u: {} }] }), { t: 3, sd: 30, fh: 5 });
  assert.equal(latestSample({}), null);
});

test('paceOf: sem reset conhecido fica "unknown" e não inventa ritmo', () => {
  const pace = paceOf({ usedPercentage: 81, resetsAt: null }, WINDOWS.sevenDay, 1_000);
  assert.equal(pace.state, 'unknown');
  assert.equal(pace.ideal, null);
});

test('updateFromProbe: vira a fonte, guarda os limites por modelo e não deixa janela de 5 h vencida', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'painel-uso-')), 'uso.json');
  const clock = 1_795_000_000_000;
  const usage = createUsage({ file, onChange: () => {}, now: () => clock });
  usage.update({ rate_limits: { five_hour: { used_percentage: 20, resets_at: (clock - HOUR) / 1000 } } });
  assert.equal(usage.updateFromProbe({ sevenDay: { usedPercentage: 86, resetsAt: clock + DAY }, scoped: [{ label: 'Fable', usedPercentage: 75, resetsAt: clock + DAY }] }), true);
  const view = usage.view();
  assert.equal(view.source, 'cli');
  assert.equal(view.sevenDay.usedPercentage, 86);
  assert.equal(view.fiveHour, undefined, 'a de 5 h da status line já tinha zerado');
  assert.equal(view.scoped[0].label, 'Fable');
  assert.equal(usage.updateFromProbe(null), false);
});

test('adviceOf: com menos de um dia para zerar fala o que sobra, não uma taxa por dia', async () => {
  const { adviceOf } = await import('../public/usage-bar.js');
  const now = 70 * DAY;
  // 30 min para zerar, 85% usado: "~717%/dia" não diz nada; o que importa é que sobram 15%.
  const pace = paceOf({ usedPercentage: 85, resetsAt: now + 30 * 60_000 }, WINDOWS.sevenDay, now);
  const advice = adviceOf(pace, WINDOWS.sevenDay, now);
  assert.doesNotMatch(advice, /%\/dia/);
  assert.match(advice, /sobram 15% até zerar/);
  // Com dias pela frente continua a taxa por dia.
  const far = paceOf({ usedPercentage: 20, resetsAt: now + 3.5 * DAY }, WINDOWS.sevenDay, now);
  assert.match(adviceOf(far, WINDOWS.sevenDay, now), /~23%\/dia/);
});

test('updateFromProbe guarda quando veio o limite por modelo; a amostra do app não o renova', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'painel-uso-')), 'uso.json');
  let clock = 1_795_000_000_000;
  const usage = createUsage({ file, onChange: () => {}, now: () => clock });
  usage.updateFromProbe({ sevenDay: { usedPercentage: 80, resetsAt: clock + DAY }, scoped: [{ label: 'Fable', usedPercentage: 30, resetsAt: clock + DAY }] });
  const probedAt = clock;
  assert.equal(usage.view().scopedAt, probedAt);
  clock += 2 * HOUR;
  usage.updateFromApp({ t: clock, sd: 85 });
  assert.equal(usage.view().sevenDay.usedPercentage, 85);
  assert.equal(usage.view().scopedAt, probedAt, 'o Fable continua com a hora da consulta');
});

test('view: limite por modelo velho não vai para as telas; fica desde quando e o motivo da falha', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'painel-uso-')), 'uso.json');
  let clock = 1_795_000_000_000;
  let changes = 0;
  const usage = createUsage({ file, onChange: () => { changes += 1; }, now: () => clock });
  usage.updateFromProbe({ sevenDay: { usedPercentage: 60, resetsAt: clock + 3 * DAY }, scoped: [{ label: 'Fable', usedPercentage: 12, resetsAt: clock + 3 * DAY }] });
  const probedAt = clock;
  clock += SCOPED_FRESH_MS;
  assert.equal(usage.view().scoped[0].usedPercentage, 12, 'no limite ainda vale');
  clock += 1;
  usage.updateFromApp({ t: clock, sd: 78 });
  const view = usage.view();
  assert.deepEqual(view.scoped, [], 'o 12% de horas atrás não aparece como se fosse de agora');
  assert.equal(view.scopedStale, true);
  assert.equal(view.scopedAt, probedAt);
  assert.equal(view.sevenDay.usedPercentage, 78, 'a semana do app continua');

  const before = changes;
  usage.setIssue('o claude do terminal está deslogado');
  usage.setIssue('o claude do terminal está deslogado');
  assert.equal(changes, before + 1, 'o mesmo motivo não redesenha de novo');
  assert.equal(usage.view().probeIssue, 'o claude do terminal está deslogado');

  usage.setIssue(null);
  usage.updateFromProbe({ sevenDay: { usedPercentage: 80, resetsAt: clock + 3 * DAY }, scoped: [{ label: 'Fable', usedPercentage: 67, resetsAt: clock + 3 * DAY }] });
  assert.equal(usage.view().probeIssue, undefined);
  assert.equal(usage.view().scopedStale, undefined);
  assert.equal(usage.view().scoped[0].usedPercentage, 67);
});
