/**
 * File conversion, entirely in the browser.
 *
 * The site is static, so there is no server to hand a file to — which is the
 * constraint and also the point: nothing here uploads anywhere. That rules some
 * conversions out honestly rather than half-supporting them:
 *
 *   - images go through the canvas, so anything the browser decodes comes in
 *     and PNG, JPEG, WebP and ICO go out. No browser encodes AVIF, so it is a
 *     read-only format here;
 *   - structured text converts by parsing to one intermediate value and
 *     re-emitting, so every pair of formats works without a rule for each pair;
 *   - audio and video would need ffmpeg compiled to wasm, some 32 MB, which is
 *     not worth it on a page this size. They are out, not hidden.
 *
 * Nothing at module scope touches the DOM — the format tables are read at build
 * time to render the page.
 */

/* ------------------------------------------------------------------ types -- */

export interface Target {
  id: string;
  name: string;
  ext: string;
  mime: string;
  /** Quality applies, so the interface offers the slider. */
  lossy?: boolean;
}

export type Kind = 'image' | 'data' | 'text' | 'other';

/* ----------------------------------------------------------------- images -- */

/** Decoded by the browser. AVIF and SVG depend on the browser but usually work. */
export const IMAGE_IN = ['png', 'jpeg', 'jpg', 'webp', 'gif', 'bmp', 'avif', 'svg', 'ico'];

export const IMAGE_OUT: Target[] = [
  { id: 'png', name: 'PNG', ext: 'png', mime: 'image/png' },
  { id: 'jpeg', name: 'JPEG', ext: 'jpg', mime: 'image/jpeg', lossy: true },
  { id: 'webp', name: 'WebP', ext: 'webp', mime: 'image/webp', lossy: true },
  { id: 'ico', name: 'ICO', ext: 'ico', mime: 'image/x-icon' },
];

export interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * SVG has no intrinsic pixel size to speak of, so a vector source is rasterised
 * at this width unless the file states its own.
 */
const SVG_WIDTH = 1024;

/** createImageBitmap covers the raster formats; SVG needs the img element. */
export async function decodeImage(file: File | Blob): Promise<Decoded> {
  const isSvg = file.type === 'image/svg+xml';

  if (!isSvg && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to the element path rather than failing outright.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error('the browser could not decode this image'));
      node.src = url;
    });
    const width = image.naturalWidth || SVG_WIDTH;
    const height = image.naturalHeight || Math.round(SVG_WIDTH * 0.75);
    return { source: image, width, height, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export interface ImageOptions {
  /** 0 to 1. Ignored by formats that are not lossy. */
  quality?: number;
  /** Longest edge, in pixels. Never enlarges. */
  fit?: number;
}

function draw(decoded: Decoded, width: number, height: number, opaque: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('this browser gave no 2d context');

  // JPEG and ICO have nowhere to put transparency; without this it comes out
  // black rather than blank.
  if (opaque) {
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, width, height);
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(decoded.source, 0, 0, width, height);
  return canvas;
}

const blobOf = (canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`this browser cannot write ${mime}`))),
      mime,
      quality,
    );
  });

/** ICO is a 22-byte header wrapped around a PNG. Capped at 256, its ceiling. */
async function icoOf(canvas: HTMLCanvasElement): Promise<Blob> {
  const png = new Uint8Array(await (await blobOf(canvas, 'image/png', 1)).arrayBuffer());
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  header[6] = canvas.width >= 256 ? 0 : canvas.width;
  header[7] = canvas.height >= 256 ? 0 : canvas.height;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.length, true);
  view.setUint32(18, header.length, true);
  return new Blob([header, png], { type: 'image/x-icon' });
}

export async function convertImage(
  file: File,
  target: Target,
  options: ImageOptions = {},
): Promise<Blob> {
  const decoded = await decodeImage(file);
  try {
    const ceiling = target.id === 'ico' ? Math.min(options.fit ?? 256, 256) : options.fit;
    const longest = Math.max(decoded.width, decoded.height);
    const scale = ceiling && longest > ceiling ? ceiling / longest : 1;
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = draw(decoded, width, height, target.id === 'jpeg' || target.id === 'ico');
    if (target.id === 'ico') return await icoOf(canvas);

    const blob = await blobOf(canvas, target.mime, options.quality ?? 0.9);
    // Chrome silently returns a PNG when asked for a format it cannot write.
    if (blob.type !== target.mime) throw new Error(`this browser cannot write ${target.name}`);
    return blob;
  } finally {
    decoded.release();
  }
}

/* -------------------------------------------------------------- data: read -- */

export interface DataFormat extends Target {
  read: boolean;
  write: boolean;
  /** Needs a list of flat records; a tree has to be flattened first. */
  tabular: boolean;
}

export const DATA_FORMATS: DataFormat[] = [
  { id: 'json', name: 'JSON', ext: 'json', mime: 'application/json', read: true, write: true, tabular: false },
  { id: 'ndjson', name: 'NDJSON', ext: 'ndjson', mime: 'application/x-ndjson', read: true, write: true, tabular: false },
  { id: 'csv', name: 'CSV', ext: 'csv', mime: 'text/csv', read: true, write: true, tabular: true },
  { id: 'tsv', name: 'TSV', ext: 'tsv', mime: 'text/tab-separated-values', read: true, write: true, tabular: true },
  { id: 'yaml', name: 'YAML', ext: 'yaml', mime: 'application/yaml', read: true, write: true, tabular: false },
  { id: 'xml', name: 'XML', ext: 'xml', mime: 'application/xml', read: true, write: true, tabular: false },
  { id: 'markdown', name: 'Markdown table', ext: 'md', mime: 'text/markdown', read: true, write: true, tabular: true },
  { id: 'html', name: 'HTML table', ext: 'html', mime: 'text/html', read: true, write: true, tabular: true },
  { id: 'sql', name: 'SQL insert', ext: 'sql', mime: 'application/sql', read: false, write: true, tabular: true },
];

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Row = Record<string, Json>;

/** Numbers only where the text round-trips, so 01234 stays a string. */
function scalar(text: string): Json {
  const t = text.trim();
  if (t === '') return '';
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === '~') return null;
  const n = Number(t);
  if (!Number.isNaN(n) && String(n) === t) return n;
  return text;
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch !== '"') { field += ch; continue; }
      if (text[i + 1] === '"') { field += '"'; i += 1; continue; }
      quoted = false;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function rowsFromGrid(grid: string[][]): Row[] {
  const [head, ...body] = grid;
  if (!head) return [];
  return body
    .filter((line) => line.some((cell) => cell.trim() !== ''))
    .map((line) => {
      const row: Row = {};
      head.forEach((key, i) => { row[key.trim() || `column ${i + 1}`] = scalar(line[i] ?? ''); });
      return row;
    });
}

/**
 * A deliberate YAML subset: nested mappings and sequences, quoted and bare
 * scalars, comments. Anchors, tags, multi-document streams and block scalars
 * are not read — a converter that silently mangles those would be worse than
 * one that says it cannot.
 */
function parseYaml(source: string): Json {
  interface Line { indent: number; text: string }

  const lines: Line[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const indent = raw.search(/\S/);
    if (indent < 0) continue;
    const text = raw.slice(indent);
    if (text.startsWith('#')) continue;
    if (text === '---' || text === '...') continue;

    // `- key: value` becomes a bare dash plus a deeper line, so the parser
    // only ever sees one construct per line.
    const item = /^-\s+(.*)$/.exec(text);
    if (item && item[1]) {
      lines.push({ indent, text: '-' });
      lines.push({ indent: indent + 2, text: item[1] });
      continue;
    }
    lines.push({ indent, text });
  }

  let at = 0;

  // A key needs a colon followed by space or end of line. Without that last
  // part, `url: http://x` reads `http` as a key and loses the scheme.
  const KEY = /^([^:]+):(?:\s+(.*))?$/;

  const unquote = (text: string): Json => {
    const t = text.trim();
    if ((t.startsWith('"') && t.endsWith('"') && t.length > 1)
      || (t.startsWith("'") && t.endsWith("'") && t.length > 1)) {
      return t.slice(1, -1);
    }
    if (t.startsWith('[') || t.startsWith('{')) {
      try { return JSON.parse(t.replace(/'/g, '"')) as Json; } catch { return t; }
    }
    return scalar(t);
  };

  function block(indent: number): Json {
    const first = lines[at];
    if (!first || first.indent < indent) return null;

    if (first.text === '-') {
      const list: Json[] = [];
      while (at < lines.length && lines[at]!.indent === indent && lines[at]!.text === '-') {
        at += 1;
        const next = lines[at];
        list.push(next && next.indent > indent ? block(next.indent) : null);
      }
      return list;
    }

    // A line at this depth that is not `key: …` is the value itself — the
    // items of a plain list, which arrive here one level in from their dash.
    if (!KEY.test(first.text)) {
      at += 1;
      return unquote(first.text);
    }

    const map: Record<string, Json> = {};
    while (at < lines.length && lines[at]!.indent === indent) {
      const line = lines[at]!;
      const split = KEY.exec(line.text);
      if (!split) { at += 1; continue; }
      at += 1;
      const key = split[1]!.trim().replace(/^["']|["']$/g, '');
      const rest = (split[2] ?? '').trim();
      if (rest !== '') { map[key] = unquote(rest); continue; }
      const next = lines[at];
      map[key] = next && next.indent > indent ? block(next.indent) : null;
    }
    return map;
  }

  const value = block(lines[0]?.indent ?? 0);
  return value ?? null;
}

function parseXml(source: string): Json {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  const bad = doc.querySelector('parsererror');
  if (bad) throw new Error('this is not well-formed XML');

  const walk = (node: Element): Json => {
    const children = Array.from(node.children);
    const out: Record<string, Json> = {};
    for (const attribute of Array.from(node.attributes)) out[`@${attribute.name}`] = attribute.value;

    if (children.length === 0) {
      const text = scalar(node.textContent ?? '');
      if (Object.keys(out).length === 0) return text;
      out['#text'] = text;
      return out;
    }

    for (const child of children) {
      const value = walk(child);
      const existing = out[child.nodeName];
      if (existing === undefined) out[child.nodeName] = value;
      else if (Array.isArray(existing)) existing.push(value);
      else out[child.nodeName] = [existing, value];
    }
    return out;
  };

  const root = doc.documentElement;
  const value = walk(root);
  // A root wrapping one repeated child is a list, which is what it means.
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && Array.isArray(value[keys[0]!])) return value[keys[0]!]!;
  }
  return value;
}

function parseMarkdown(source: string): Row[] {
  const lines = source.split(/\r?\n/).filter((l) => l.trim().startsWith('|'));
  const cells = (line: string): string[] =>
    line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const grid = lines.map(cells).filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
  return rowsFromGrid(grid);
}

function parseHtml(source: string): Row[] {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const table = doc.querySelector('table');
  if (!table) throw new Error('no table found in this HTML');
  const grid = Array.from(table.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((cell) => cell.textContent?.trim() ?? ''));
  return rowsFromGrid(grid);
}

function read(text: string, format: string): Json {
  switch (format) {
    case 'json': return JSON.parse(text) as Json;
    case 'ndjson':
      return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l) as Json);
    case 'csv': return rowsFromGrid(parseDelimited(text, ',')) as Json;
    case 'tsv': return rowsFromGrid(parseDelimited(text, '\t')) as Json;
    case 'yaml': return parseYaml(text);
    case 'xml': return parseXml(text);
    case 'markdown': return parseMarkdown(text) as Json;
    case 'html': return parseHtml(text) as Json;
    default: throw new Error(`${format} cannot be read`);
  }
}

/* ------------------------------------------------------------- data: write -- */

/** Dotted keys, so a tree can become a table without losing where things were. */
function flatten(value: Json, prefix = '', out: Row = {}): Row {
  if (value === null || typeof value !== 'object') {
    out[prefix || 'value'] = value;
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) out[prefix || 'value'] = '';
    value.forEach((item, i) => flatten(item, prefix ? `${prefix}.${i}` : String(i), out));
    return out;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) out[prefix || 'value'] = '';
  for (const key of keys) flatten(value[key]!, prefix ? `${prefix}.${key}` : key, out);
  return out;
}

function toRows(value: Json): Row[] {
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => flatten(item));
}

const columnsOf = (rows: Row[]): string[] => {
  const seen = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) seen.add(key);
  return [...seen];
};

const cell = (value: Json): string =>
  value === null || value === undefined ? ''
    : typeof value === 'object' ? JSON.stringify(value)
      : String(value);

function writeDelimited(rows: Row[], delimiter: string): string {
  const columns = columnsOf(rows);
  const escape = (text: string): string =>
    new RegExp(`["\n\r${delimiter === '\t' ? '\\t' : delimiter}]`).test(text) || /^\s|\s$/.test(text)
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  const lines = [columns.map(escape).join(delimiter)];
  for (const row of rows) lines.push(columns.map((c) => escape(cell(row[c] ?? ''))).join(delimiter));
  return lines.join('\n');
}

function writeYaml(value: Json, indent = 0): string {
  const pad = ' '.repeat(indent);
  const quote = (text: string): string =>
    text === '' || /^[\s-]|[:#]\s|["':{}[\]]|^\d|^(true|false|null)$/.test(text)
      ? JSON.stringify(text)
      : text;

  if (value === null) return 'null';
  if (typeof value !== 'object') return typeof value === 'string' ? quote(value) : String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map((item) => {
      const body = writeYaml(item, indent + 2);
      return item !== null && typeof item === 'object'
        ? `${pad}-\n${body}`
        : `${pad}- ${body}`;
    }).join('\n');
  }

  const keys = Object.keys(value);
  if (keys.length === 0) return '{}';
  return keys.map((key) => {
    const child = value[key]!;
    const body = writeYaml(child, indent + 2);
    return child !== null && typeof child === 'object' && Object.keys(child).length > 0
      ? `${pad}${quote(key)}:\n${body}`
      : `${pad}${quote(key)}: ${body}`;
  }).join('\n');
}

const xmlEscape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Keys become tags, so anything not a valid tag name is made into one. */
const tagOf = (key: string): string => {
  const clean = key.replace(/[^\w.-]/g, '-').replace(/^[^A-Za-z_]+/, '');
  return clean || 'item';
};

function writeXml(value: Json, name: string, indent = 0): string {
  const pad = ' '.repeat(indent);
  const tag = tagOf(name);

  if (value === null) return `${pad}<${tag}/>`;
  if (typeof value !== 'object') return `${pad}<${tag}>${xmlEscape(String(value))}</${tag}>`;
  if (Array.isArray(value)) return value.map((item) => writeXml(item, name, indent)).join('\n');

  const body = Object.keys(value).map((key) => writeXml(value[key]!, key, indent + 2)).join('\n');
  return body ? `${pad}<${tag}>\n${body}\n${pad}</${tag}>` : `${pad}<${tag}/>`;
}

function writeMarkdown(rows: Row[]): string {
  const columns = columnsOf(rows);
  const escape = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const lines = [
    `| ${columns.map(escape).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
  ];
  for (const row of rows) lines.push(`| ${columns.map((c) => escape(cell(row[c] ?? ''))).join(' | ')} |`);
  return lines.join('\n');
}

function writeHtml(rows: Row[]): string {
  const columns = columnsOf(rows);
  const head = columns.map((c) => `      <th>${xmlEscape(c)}</th>`).join('\n');
  const body = rows.map((row) =>
    `    <tr>\n${columns.map((c) => `      <td>${xmlEscape(cell(row[c] ?? ''))}</td>`).join('\n')}\n    </tr>`,
  ).join('\n');
  return `<table>\n  <thead>\n    <tr>\n${head}\n    </tr>\n  </thead>\n  <tbody>\n${body}\n  </tbody>\n</table>`;
}

function writeSql(rows: Row[], table = 'data'): string {
  const columns = columnsOf(rows);
  const quote = (value: Json): string => {
    if (value === null || value === undefined || value === '') return 'NULL';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return `'${cell(value).replace(/'/g, "''")}'`;
  };
  const head = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES`;
  return rows
    .map((row) => `${head}\n  (${columns.map((c) => quote(row[c] ?? null)).join(', ')});`)
    .join('\n');
}

function write(value: Json, format: string): string {
  switch (format) {
    case 'json': return JSON.stringify(value, null, 2);
    case 'ndjson': return (Array.isArray(value) ? value : [value]).map((v) => JSON.stringify(v)).join('\n');
    case 'csv': return writeDelimited(toRows(value), ',');
    case 'tsv': return writeDelimited(toRows(value), '\t');
    case 'yaml': return writeYaml(value);
    case 'xml': return `<?xml version="1.0" encoding="UTF-8"?>\n${writeXml(value, 'root')}`;
    case 'markdown': return writeMarkdown(toRows(value));
    case 'html': return writeHtml(toRows(value));
    case 'sql': return writeSql(toRows(value));
    default: throw new Error(`${format} cannot be written`);
  }
}

export type DataResult = { ok: true; text: string } | { ok: false; reason: string };

export function convertData(text: string, from: string, to: string): DataResult {
  if (!text.trim()) return { ok: false, reason: 'nothing to convert' };
  try {
    return { ok: true, text: write(read(text, from), to) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'could not convert' };
  }
}

/** Best guess at a format from an extension, for the drop zone. */
export function dataFormatOf(filename: string): DataFormat | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const alias: Record<string, string> = { yml: 'yaml', htm: 'html', md: 'markdown', txt: 'json' };
  const id = alias[ext] ?? ext;
  return DATA_FORMATS.find((f) => f.id === id && f.read) ?? null;
}

/* --------------------------------------------------------------- encodings -- */

export const ENCODINGS: Target[] = [
  { id: 'base64', name: 'Base64', ext: 'txt', mime: 'text/plain' },
  { id: 'base64url', name: 'Base64 URL', ext: 'txt', mime: 'text/plain' },
  { id: 'hex', name: 'Hex', ext: 'txt', mime: 'text/plain' },
  { id: 'datauri', name: 'Data URI', ext: 'txt', mime: 'text/plain' },
  { id: 'url', name: 'URL', ext: 'txt', mime: 'text/plain' },
  { id: 'text', name: 'Text', ext: 'txt', mime: 'text/plain' },
];

/** btoa only takes latin-1, so bytes go over one chunk at a time. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function encodeBytes(bytes: Uint8Array, as: string, mime = 'application/octet-stream'): string {
  switch (as) {
    case 'base64': return bytesToBase64(bytes);
    case 'base64url': return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    case 'hex': return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    case 'datauri': return `data:${mime};base64,${bytesToBase64(bytes)}`;
    case 'url': return encodeURIComponent(new TextDecoder().decode(bytes));
    case 'text': return new TextDecoder().decode(bytes);
    default: throw new Error(`${as} is not an encoding I know`);
  }
}

export function decodeBytes(text: string, from: string): Uint8Array {
  const trimmed = text.trim();
  switch (from) {
    case 'base64':
    case 'base64url':
      return base64ToBytes(trimmed);
    case 'hex': {
      const clean = trimmed.replace(/[\s:,]|0x/gi, '');
      if (clean.length % 2 !== 0) throw new Error('hex needs an even number of digits');
      const out = new Uint8Array(clean.length / 2);
      for (let i = 0; i < out.length; i += 1) {
        const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
        if (Number.isNaN(byte)) throw new Error('that is not hex');
        out[i] = byte;
      }
      return out;
    }
    case 'datauri': {
      const comma = trimmed.indexOf(',');
      if (comma < 0) throw new Error('a data URI needs a comma');
      const body = trimmed.slice(comma + 1);
      return trimmed.slice(0, comma).includes(';base64')
        ? base64ToBytes(body)
        : new TextEncoder().encode(decodeURIComponent(body));
    }
    case 'url': return new TextEncoder().encode(decodeURIComponent(trimmed));
    case 'text': return new TextEncoder().encode(text);
    default: throw new Error(`${from} is not an encoding I know`);
  }
}

export function convertEncoding(text: string, from: string, to: string): DataResult {
  if (!text.trim()) return { ok: false, reason: 'nothing to convert' };
  try {
    return { ok: true, text: encodeBytes(decodeBytes(text, from), to) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'could not convert' };
  }
}

/* ------------------------------------------------------------------ files -- */

export function kindOf(file: File): Kind {
  if (file.type.startsWith('image/')) return 'image';
  if (dataFormatOf(file.name)) return 'data';
  if (file.type.startsWith('text/') || file.type === 'application/json') return 'text';
  return 'other';
}

/** Swaps the extension, so photo.heic saved as PNG is photo.png. */
export const rename = (filename: string, ext: string): string =>
  `${filename.replace(/\.[^.]+$/, '') || 'file'}.${ext}`;

export const sizeOf = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let at = 0;
  while (value >= 1024 && at < units.length - 1) { value /= 1024; at += 1; }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[at]}`;
};
