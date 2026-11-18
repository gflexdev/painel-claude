import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUsage, parseRateLimits } from '../src/usage.js';
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
