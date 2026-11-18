// Markdown das respostas do Claude → DOM, sem innerHTML: o texto vem do transcript e nunca vira HTML.
// Cobre o que o Claude costuma escrever: títulos, parágrafos, listas (com sub-itens), código,
// tabelas, citações, linha, negrito, itálico, código inline e links http(s).

const INLINE = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*(?=\S)(.+?)\*\*|\*(?=[^\s*])([^*\n]+?)\*/g;
const SAFE_URL = /^https?:\/\//i;
const FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const INDENTED = /^\s{2,}\S/;

/** Texto de uma linha (ou várias) → nós inline. Quebra simples vira `br`. */
export function parseInline(text) {
  return text.split('\n').flatMap((line, index) => [
    ...(index > 0 ? [{ type: 'br' }] : []),
    ...parseLine(line),
  ]);
}

function parseLine(line) {
  const nodes = [];
  let last = 0;
  for (const match of line.matchAll(INLINE)) {
    if (match.index > last) nodes.push({ type: 'text', text: line.slice(last, match.index) });
    nodes.push(...inlineNode(match));
    last = match.index + match[0].length;
  }
  if (last < line.length) nodes.push({ type: 'text', text: line.slice(last) });
  return nodes;
}

function inlineNode([, code, label, href, strong, em]) {
  if (code !== undefined) return [{ type: 'code', text: code }];
  if (label !== undefined) {
    const children = parseLine(label);
    return SAFE_URL.test(href) ? [{ type: 'link', href, children }] : children;
  }
  if (strong !== undefined) return [{ type: 'strong', children: parseLine(strong) }];
  return [{ type: 'em', children: parseLine(em) }];
}

const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => parseInline(cell.trim()));
const isTableStart = (lines, i) => lines[i].includes('|') && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1]);
const startsBlock = (lines, i) => [FENCE, HEADING, RULE, LIST_ITEM, QUOTE].some((re) => re.test(lines[i])) || isTableStart(lines, i);

function readFence(lines, i) {
  const [, indent, fence, lang] = lines[i].match(FENCE);
  const body = [];
  let j = i + 1;
  while (j < lines.length && !lines[j].trim().startsWith(fence)) {
    body.push(lines[j].startsWith(indent) ? lines[j].slice(indent.length) : lines[j].trimStart());
    j += 1;
  }
  return { block: { type: 'code', lang, text: body.join('\n') }, next: j + 1 };
}

function readTable(lines, i) {
  const header = splitRow(lines[i]);
  const rows = [];
  let j = i + 2;
  while (j < lines.length && lines[j].includes('|') && lines[j].trim()) {
    rows.push(splitRow(lines[j]));
    j += 1;
  }
  return { block: { type: 'table', header, rows }, next: j };
}

function readQuote(lines, i) {
  const inner = [];
  let j = i;
  while (j < lines.length && QUOTE.test(lines[j])) {
    inner.push(lines[j].match(QUOTE)[1]);
    j += 1;
  }
  return { block: { type: 'quote', blocks: parseMarkdown(inner.join('\n')) }, next: j };
}

/** Junta os itens crus (com recuo) numa lista aninhada. */
function nestItems(raw) {
  const newList = (item) => ({ type: 'list', ordered: item.ordered, start: item.start, items: [] });
  const root = newList(raw[0]);
  const stack = [{ indent: raw[0].indent, list: root }];
  for (const item of raw) {
    while (stack.length > 1 && item.indent < stack[stack.length - 1].indent) stack.pop();
    const top = stack[stack.length - 1];
    const parent = top.list.items[top.list.items.length - 1];
    if (item.indent > top.indent && parent) {
      parent.children = parent.children ?? newList(item);
      stack.push({ indent: item.indent, list: parent.children });
    }
    stack[stack.length - 1].list.items.push({ inlines: parseInline(item.text), children: null });
  }
  return root;
}

function readList(lines, i) {
  const raw = [];
  let j = i;
  while (j < lines.length) {
    const item = lines[j].match(LIST_ITEM);
    const blankThenItem = !lines[j].trim() && j + 1 < lines.length && LIST_ITEM.test(lines[j + 1]);
    if (item) {
      const marker = item[2];
      raw.push({ indent: item[1].length, ordered: /\d/.test(marker), start: parseInt(marker, 10) || 1, text: item[3] });
    } else if (INDENTED.test(lines[j]) && !FENCE.test(lines[j]) && raw.length) {
      raw[raw.length - 1].text += `\n${lines[j].trim()}`;
    } else if (!blankThenItem) {
      break;
    }
    j += 1;
  }
  return { block: nestItems(raw), next: j };
}

function readParagraph(lines, i) {
  const text = [lines[i].trim()];
  let j = i + 1;
  while (j < lines.length && lines[j].trim() && !startsBlock(lines, j)) {
    text.push(lines[j].trim());
    j += 1;
  }
  return { block: { type: 'paragraph', inlines: parseInline(text.join('\n')) }, next: j };
}

function readBlock(lines, i) {
  const line = lines[i];
  if (FENCE.test(line)) return readFence(lines, i);
  if (isTableStart(lines, i)) return readTable(lines, i);
  const heading = line.match(HEADING);
  if (heading) return { block: { type: 'heading', level: heading[1].length, inlines: parseInline(heading[2]) }, next: i + 1 };
  if (RULE.test(line)) return { block: { type: 'rule' }, next: i + 1 };
  if (QUOTE.test(line)) return readQuote(lines, i);
  if (LIST_ITEM.test(line)) return readList(lines, i);
  return readParagraph(lines, i);
}

/** Markdown → lista de blocos (estrutura simples, testável sem DOM). */
export function parseMarkdown(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) {
      i += 1;
    } else {
      const { block, next } = readBlock(lines, i);
      blocks.push(block);
      i = next;
    }
  }
  return blocks;
}

// ---------- DOM ----------

function node(tag, children = [], className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.append(...children);
  return element;
}

function renderInline(item) {
  switch (item.type) {
    case 'text': return document.createTextNode(item.text);
    case 'br': return document.createElement('br');
    case 'code': return Object.assign(document.createElement('code'), { textContent: item.text });
    case 'strong': return node('strong', item.children.map(renderInline));
    case 'em': return node('em', item.children.map(renderInline));
    case 'link': {
      const link = node('a', item.children.map(renderInline));
      Object.assign(link, { href: item.href, target: '_blank', rel: 'noopener noreferrer' });
      return link;
    }
    default: return document.createTextNode('');
  }
}

const inlines = (list) => list.map(renderInline);
const HEADING_TAG = ['h4', 'h4', 'h5', 'h6', 'h6', 'h6'];

function renderList(list) {
  const element = node(list.ordered ? 'ol' : 'ul', list.items.map((item) => node('li', [
    ...inlines(item.inlines),
    ...(item.children ? [renderList(item.children)] : []),
  ])));
  if (list.ordered && list.start !== 1) element.start = list.start;
  return element;
}

function renderTable(table) {
  const row = (cells, tag) => node('tr', cells.map((cell) => node(tag, inlines(cell))));
  return node('div', [node('table', [
    node('thead', [row(table.header, 'th')]),
    node('tbody', table.rows.map((cells) => row(cells, 'td'))),
  ])], 'md-table');
}

function renderBlock(block) {
  switch (block.type) {
    case 'heading': return node(HEADING_TAG[block.level - 1], inlines(block.inlines));
    case 'paragraph': return node('p', inlines(block.inlines));
    case 'rule': return document.createElement('hr');
    case 'quote': return node('blockquote', block.blocks.map(renderBlock));
    case 'list': return renderList(block);
    case 'table': return renderTable(block);
    case 'code': {
      const code = Object.assign(document.createElement('code'), { textContent: block.text });
      const pre = node('pre', [code]);
      if (block.lang) pre.dataset.lang = block.lang;
      return pre;
    }
    default: return document.createTextNode('');
  }
}

/** Markdown → fragmento de DOM pronto para `replaceChildren`. */
export function renderMarkdown(markdown) {
  const fragment = document.createDocumentFragment();
  fragment.append(...parseMarkdown(markdown).map(renderBlock));
  return fragment;
}
