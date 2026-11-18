// Cria sessões de exemplo num painel de demonstração e tira as capturas do README (docs/imagens).
// Precisa do Google Chrome e do pacote playwright-core. Rode um servidor separado, com HOME e dados falsos:
//   D=$(mktemp -d); mkdir -p $D/home $D/dados
//   HOME=$D/home PAINEL_DIR=$D/dados PAINEL_PORT=7790 node src/server.js &
//   PAINEL_DEMO=$D node scripts/capturas.mjs docs/imagens
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const DEMO = process.env.PAINEL_DEMO;
if (!DEMO) throw new Error('Defina PAINEL_DEMO com a pasta do painel de demonstração (veja o comentário no topo).');
const OUT = process.argv[2] ?? 'docs/imagens';
const BASE = 'http://127.0.0.1:7790';
const PROJECTS = join(DEMO, 'home', '.claude', 'projects', 'demo');
const TOKEN = JSON.parse(readFileSync(join(DEMO, 'dados', 'config.json'), 'utf8')).token;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(PROJECTS, { recursive: true });
mkdirSync(OUT, { recursive: true });

const SESSIONS = [
  { id: 'demo-deploy', title: 'Deploy do site', cwd: '/Users/ana/loja-web', model: 'claude-opus-5-5', ctx: 182_400, turns: 9,
    prompt: 'Publica a versão nova do site em produção',
    answer: 'Build pronto e testes passando. Vou publicar agora.' },
  { id: 'demo-checkout', title: 'Refatorar o checkout', cwd: '/Users/ana/api-pagamentos', model: 'claude-opus-5-5', ctx: 96_300, turns: 4,
    prompt: 'Refatora a validação do checkout',
    answer: 'Antes de mexer, preciso de uma decisão sua sobre a biblioteca de validação.' },
  { id: 'demo-testes', title: 'Testes do carrinho', cwd: '/Users/ana/loja-web', model: 'claude-sonnet-5-5', ctx: 54_100, turns: 3,
    prompt: 'Escreve os testes do carrinho', answer: 'Escrevendo os testes do carrinho.' },
  { id: 'demo-docs', title: 'Documentação da API', cwd: '/Users/ana/api-pagamentos', model: 'claude-sonnet-5-5', ctx: 71_800, turns: 6,
    prompt: 'Atualiza a documentação dos endpoints de pagamento',
    answer: [
      '## Documentação atualizada',
      '',
      'Revisei os **12 endpoints** de pagamento e atualizei o `openapi.yaml`.',
      '',
      '- `POST /pagamentos` ganhou o campo `parcelas`',
      '',
      'Para conferir localmente:',
      '',
      '```bash',
      'npm run docs:serve',
      '```',
    ].join('\n') },
  { id: 'demo-mobile', title: 'Tela de login do app', cwd: '/Users/ana/app-mobile', model: 'claude-opus-5-5', ctx: 128_900, turns: 12,
    prompt: 'Ajusta a tela de login', answer: 'Editando a tela de login.' },
  { id: 'demo-migracao', title: 'Migração do banco', cwd: '/Users/ana/api-pagamentos', model: 'claude-opus-5-5', ctx: 210_500, turns: 7,
    prompt: 'Planeja a migração para Postgres 17', answer: 'Lendo as notas da versão.' },
  { id: 'demo-onboarding', title: 'Onboarding de clientes', cwd: '/Users/ana/site', model: 'claude-haiku-5-5', ctx: 23_400, turns: 2,
    prompt: 'Revisa os textos do onboarding', answer: 'Textos revisados.' },
];

function writeTranscript(s) {
  const path = join(PROJECTS, `${s.id}.jsonl`);
  const lines = [
    { type: 'custom-title', customTitle: s.title, sessionId: s.id },
    ...Array.from({ length: s.turns }, (_, i) => ({ type: 'user', turnOrigin: 'human', entrypoint: 'claude-desktop',
      message: { role: 'user', content: i === s.turns - 1 ? s.prompt : `pedido ${i + 1}` } })),
    { type: 'assistant', entrypoint: 'claude-desktop', message: { id: `m-${s.id}`, role: 'assistant', model: s.model,
      usage: { input_tokens: 2_000, cache_read_input_tokens: s.ctx - 3_000, cache_creation_input_tokens: 0, output_tokens: 1_000 },
      content: [
        { type: 'tool_use', name: 'Read', input: { file_path: `${s.cwd}/README.md` } },
        { type: 'tool_use', name: 'Bash', input: { command: 'npm test', description: 'Roda os testes' } },
        { type: 'text', text: s.answer },
      ] } },
    { type: 'last-prompt', lastPrompt: s.prompt, sessionId: s.id },
  ];
  writeFileSync(path, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
  return path;
}

const post = (path, body, signal) => fetch(`${BASE}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function event(s, name, extra = {}) {
  const res = await post('/hook', { hook_event_name: name, session_id: s.id, cwd: s.cwd, transcript_path: s.path, ...extra });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
}

const byId = Object.fromEntries(SESSIONS.map((s) => [s.id, { ...s, path: writeTranscript(s) }]));
for (const s of Object.values(byId)) {
  await event(s, 'SessionStart');
  await event(s, 'UserPromptSubmit', { prompt: s.prompt });
}
await event(byId['demo-testes'], 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test -- carrinho', description: 'Roda os testes do carrinho' } });
await event(byId['demo-mobile'], 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: '/Users/ana/app-mobile/src/telas/Login.tsx' } });
await event(byId['demo-migracao'], 'PreToolUse', { tool_name: 'WebFetch', tool_input: { url: 'https://www.postgresql.org/docs/17/release-17.html' } });
await event(byId['demo-docs'], 'Stop');
await event(byId['demo-onboarding'], 'Stop');
await fetch(`${BASE}/api/sessions/demo-onboarding/seen`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } });

const now = Date.now() / 1000;
await post('/usage', { rate_limits: {
  five_hour: { used_percentage: 38, resets_at: Math.round(now + 2.2 * 3600) },
  seven_day: { used_percentage: 55, resets_at: Math.round(now + 3 * 86400) },
} });

// Pedidos pendentes: ficam segurando a conexão até o fim das capturas.
const hold = new AbortController();
const pending = [
  post('/permission', { hook_event_name: 'PermissionRequest', session_id: 'demo-deploy', cwd: byId['demo-deploy'].cwd,
    transcript_path: byId['demo-deploy'].path, tool_name: 'Bash',
    tool_input: { command: 'npm run build && npm run deploy -- --prod\n# publica em loja.exemplo.com.br', description: 'Publica o site em produção' } }, hold.signal),
  post('/permission', { hook_event_name: 'PermissionRequest', session_id: 'demo-checkout', cwd: byId['demo-checkout'].cwd,
    transcript_path: byId['demo-checkout'].path, tool_name: 'AskUserQuestion',
    tool_input: { questions: [{ header: 'Validação', question: 'Qual biblioteca de validação usar no checkout?', multiSelect: false,
      options: [
        { label: 'Zod', description: 'Mais usada, tipos do TypeScript a partir do schema' },
        { label: 'Valibot', description: 'Menor no bundle, API parecida com a do Zod' },
        { label: 'Manter a atual', description: 'Só reorganizar o código, sem trocar a biblioteca' },
      ] }] } }, hold.signal),
].map((p) => p.catch(() => {}));
await sleep(1500);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const url = (hash = '') => `${BASE}/?t=${TOKEN}${hash}`;

async function shot(name, { width, height, scale, hash = '', style = 'robo', action }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: 'dark' });
  await context.addInitScript((s) => { try { localStorage.setItem('painel-claude-agente', s); } catch {} }, style);
  const page = await context.newPage();
  await page.goto(url(hash));
  await page.waitForSelector('.tile');
  await sleep(1200);
  // Relógio fixo para as capturas não mostrarem a hora real.
  await page.evaluate(() => { const c = document.getElementById('clock'); if (c) c.textContent = '14:32'; });
  if (action) await action(page);
  await page.evaluate(() => {
    document.activeElement?.blur();
    document.getAnimations().forEach((a) => a.pause());
    const c = document.getElementById('clock'); if (c) c.textContent = '14:32';
  });
  await page.screenshot({ path: join(OUT, name) });
  await context.close();
  console.log('ok', name);
}

await shot('painel.png', { width: 1280, height: 540, scale: 1.5 });
await shot('celular-permissao.png', { width: 390, height: 844, scale: 2, hash: '#sessao=demo-deploy' });
await shot('celular-pergunta.png', { width: 390, height: 844, scale: 2, hash: '#sessao=demo-checkout', action: async (page) => {
  await page.getByText('Zod', { exact: true }).click();
  await sleep(300);
} });
await shot('estilos.png', { width: 640, height: 640, scale: 2, action: async (page) => {
  await page.click('#style-button');
  await sleep(500);
} });
await shot('celular-bichinho.png', { width: 390, height: 844, scale: 2, style: 'bicho' });
// Por último: abrir o detalhe marca a sessão como vista e mudaria as outras capturas.
await shot('celular-resposta.png', { width: 390, height: 844, scale: 2, hash: '#sessao=demo-docs' });

await browser.close();
hold.abort();
await Promise.all(pending);
