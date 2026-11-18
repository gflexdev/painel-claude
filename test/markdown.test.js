import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInline, parseMarkdown } from '../public/markdown.js';

test('inline: negrito, itálico, código e texto em volta', () => {
  assert.deepEqual(parseInline('a **b** *c* `d`'), [
    { type: 'text', text: 'a ' },
    { type: 'strong', children: [{ type: 'text', text: 'b' }] },
    { type: 'text', text: ' ' },
    { type: 'em', children: [{ type: 'text', text: 'c' }] },
    { type: 'text', text: ' ' },
    { type: 'code', text: 'd' },
  ]);
});

test('inline: código não interpreta markdown dentro', () => {
  assert.deepEqual(parseInline('`**x**`'), [{ type: 'code', text: '**x**' }]);
});

test('inline: link só vira link com http(s); o resto fica só o texto', () => {
  assert.deepEqual(parseInline('[site](https://ex.com/a)'), [
    { type: 'link', href: 'https://ex.com/a', children: [{ type: 'text', text: 'site' }] },
  ]);
  assert.deepEqual(parseInline('[x](javascript:alert(1))'), [{ type: 'text', text: 'x' }, { type: 'text', text: ')' }]);
  assert.deepEqual(parseInline('[README](firmware/README.md)'), [{ type: 'text', text: 'README' }]);
});

test('inline: quebra de linha simples vira br', () => {
  assert.deepEqual(parseInline('a\nb'), [{ type: 'text', text: 'a' }, { type: 'br' }, { type: 'text', text: 'b' }]);
});

test('inline: snake_case e asterisco solto ficam como texto', () => {
  assert.deepEqual(parseInline('PAINEL_DIR e 2 * 3'), [{ type: 'text', text: 'PAINEL_DIR e 2 * 3' }]);
});

test('blocos: título, parágrafo e linha', () => {
  const blocks = parseMarkdown('## Feito\n\nTudo certo.\n\n---');
  assert.deepEqual(blocks.map((b) => b.type), ['heading', 'paragraph', 'rule']);
  assert.equal(blocks[0].level, 2);
});

test('blocos: bloco de código mantém o conteúdo e tira o recuo da cerca', () => {
  const [code] = parseMarkdown('  ```bash\n  tailscale serve --https=443 off\n  ```');
  assert.deepEqual(code, { type: 'code', lang: 'bash', text: 'tailscale serve --https=443 off' });
});

test('blocos: cerca sem fechar (resposta cortada) vai até o fim', () => {
  const [code] = parseMarkdown('```\nlinha 1\nlinha 2');
  assert.equal(code.text, 'linha 1\nlinha 2');
});

test('listas: marcadores, numeradas e sub-itens', () => {
  const [list] = parseMarkdown('- **um**\n- dois\n  - dois.a\n- três');
  assert.equal(list.type, 'list');
  assert.equal(list.ordered, false);
  assert.equal(list.items.length, 3);
  assert.equal(list.items[1].children.items[0].inlines[0].text, 'dois.a');

  const [ordered] = parseMarkdown('3. a\n4. b');
  assert.equal(ordered.ordered, true);
  assert.equal(ordered.start, 3);
});

test('listas: linha recuada continua o item; bloco de código recuado sai da lista', () => {
  const blocks = parseMarkdown('- item\n  continua\n- outro\n  ```bash\n  ls\n  ```\n\nfim');
  assert.deepEqual(blocks.map((b) => b.type), ['list', 'code', 'paragraph']);
  assert.deepEqual(blocks[0].items[0].inlines.map((n) => n.type), ['text', 'br', 'text']);
});

test('tabela com cabeçalho e linhas', () => {
  const [table] = parseMarkdown('| Rota | O que |\n|---|---|\n| `/hook` | eventos |\n| /health | **ok** |');
  assert.equal(table.type, 'table');
  assert.equal(table.header.length, 2);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[0][0], [{ type: 'code', text: '/hook' }]);
});

test('citação', () => {
  const [quote] = parseMarkdown('> cuidado\n> com isso');
  assert.equal(quote.type, 'quote');
  assert.equal(quote.blocks[0].type, 'paragraph');
});
