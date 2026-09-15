/**
 * Wiring for the converter.
 *
 * The input field is the single source of truth: pinning a unit or picking a
 * measure rewrites the text and everything repaints from that one read. There
 * is no second copy of the state to fall out of step.
 *
 * One departure from the colour tool, which never builds structure: the units
 * table has to, because which rows exist depends on the dimension. Astro still
 * renders a complete table at build time, so the page works without this.
 */
import * as U from './units';
import * as F from './files';

type El = HTMLElement;

let root: El | null = null;
let file: File | null = null;
let fileKind: F.Kind = 'other';
let targetId = '';
let objectUrl: string | null = null;

/**
 * Bumped by anything that starts work on a file. Decoding and encoding both
 * await, so without this a conversion that began before a second file was
 * chosen would finish afterwards and hand its blob over under the new file's
 * name — a PNG offered as people.yaml.
 */
let generation = 0;

const q = <T extends Element = El>(sel: string, scope: ParentNode = document): T | null =>
  scope.querySelector<T>(sel);
const all = <T extends Element = El>(sel: string, scope: ParentNode = document): T[] =>
  Array.from(scope.querySelectorAll<T>(sel));

const ENCODING_IDS = new Set(F.ENCODINGS.map((e) => e.id));

/* ------------------------------------------------------------- clipboard -- */

/** Pre-async-clipboard fallback; also covers permission-denied contexts. */
function legacyCopy(text: string): boolean {
  const box = document.createElement('textarea');
  box.value = text;
  box.setAttribute('readonly', '');
  box.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(box);
  box.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  box.remove();
  return ok;
}

async function copy(text: string, button?: El): Promise<void> {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    ok = legacyCopy(text);
  }
  if (!button) return;
  const was = button.textContent;
  // Report the failure rather than showing a success that did not happen.
  button.textContent = ok ? 'copied' : 'blocked';
  window.setTimeout(() => { button.textContent = was; }, 900);
}

/* ------------------------------------------------------------------ units -- */

const show = (node: El | null, on: boolean): void => {
  if (node) node.hidden = !on;
};

function say(node: El | null, message: string): void {
  if (!node) return;
  node.textContent = message;
  node.hidden = message === '';
}

/** Rebuilds the unit column for a dimension. */
function renderUnits(body: El, units: U.Unit[], value: number, source: U.Measure): void {
  body.replaceChildren(...units.map((unit) => {
    const converted = U.convert(value, source, unit);
    const out = converted ? U.format(converted.value) : '';

    const row = document.createElement('tr');
    row.dataset.unit = unit.id;
    row.dataset.symbol = unit.symbol;

    const symbol = document.createElement('th');
    symbol.className = 'units__sym';
    symbol.textContent = unit.symbol;

    const name = document.createElement('td');
    name.className = 'units__name';
    name.textContent = unit.name;
    if (unit.group) {
      const tag = document.createElement('span');
      tag.className = 'units__group label';
      tag.textContent = unit.group;
      name.append(tag);
    }

    const cell = document.createElement('td');
    cell.className = 'units__out';
    cell.dataset.out = '';
    cell.textContent = out;

    const acts = document.createElement('td');
    acts.className = 'units__act';
    for (const [kind, text] of [['pin', 'pin'], ['copy', 'copy']] as const) {
      const button = document.createElement('button');
      button.className = 'act';
      button.type = 'button';
      button.textContent = text;
      if (kind === 'pin') button.dataset.pin = unit.id;
      else button.dataset.copy = out;
      acts.append(button);
    }

    row.append(symbol, name, cell, acts);
    return row;
  }));
}

/** Reads the field and repaints everything that follows from it. */
function paint(): void {
  if (!root) return;
  const input = q<HTMLInputElement>('[data-input]', root);
  if (!input) return;

  const seed = U.resolve(input.value);
  const error = q('[data-error]', root);
  const value = q('[data-value]', root);
  const unitName = q('[data-target-name]', root);
  const formats = q('[data-formats]', root);

  if (!seed.source) {
    say(error, seed.error ?? '');
    return;
  }
  say(error, seed.error ?? '');

  const dim = seed.source.dim;
  const quantity = U.quantityName(dim);
  const units = U.unitsFor(dim, seed.sourceUnit ?? seed.source);

  // The hero shows the pinned target when there is one, and the source
  // measured in its own terms when there is not.
  const result = seed.result;
  if (value) value.textContent = result ? U.format(result.value) : U.format(seed.value);
  if (unitName) unitName.textContent = result ? (seed.targetUnit?.name ?? seed.targetLabel ?? '') : (seed.sourceUnit?.name ?? seed.sourceLabel);

  if (formats) {
    const exactness = result ? (result.exact ? 'exact' : 'approximate') : '';
    const bridge = result?.bridged ? ' · one revolution taken as one cycle' : '';
    formats.textContent = [
      `${U.format(seed.value)} ${seed.sourceLabel}`,
      quantity,
      exactness,
    ].filter(Boolean).join(' · ') + bridge;
  }

  for (const chip of all<HTMLButtonElement>('[data-quantity]', root)) {
    chip.setAttribute('aria-pressed', String(chip.dataset.quantity === quantity));
  }

  const body = q('[data-units]', root);
  if (body) {
    renderUnits(body, units, seed.value, seed.source);
    const pinned = seed.targetUnit?.id;
    for (const row of all('tr[data-unit]', body)) {
      if (row.dataset.unit === pinned) row.dataset.pinned = 'yes';
      else delete row.dataset.pinned;
    }
  }
}

/** Pinning rewrites the field, so the field stays the only state. */
function pin(unitId: string): void {
  const input = q<HTMLInputElement>('[data-input]', root ?? document);
  if (!input) return;
  const unit = U.UNITS.find((u) => u.id === unitId);
  const seed = U.resolve(input.value);
  if (!unit || !seed.source) return;
  input.value = `${U.format(seed.value)} ${seed.sourceLabel} to ${unit.symbol}`;
  paint();
}

function pickQuantity(name: string): void {
  const input = q<HTMLInputElement>('[data-input]', root ?? document);
  const quantity = U.QUANTITIES.find((item) => item.name === name);
  if (!input || !quantity) return;
  const units = U.unitsFor(quantity.dim);
  const from = units[0];
  const to = units[1] ?? units[0];
  if (!from || !to) return;
  input.value = `1 ${from.symbol} to ${to.symbol}`;
  paint();
}

/* ------------------------------------------------------------------ files -- */

function releaseUrl(): void {
  if (!objectUrl) return;
  URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

function offer(blob: Blob, name: string): void {
  const link = q<HTMLAnchorElement>('[data-download]', root ?? document);
  if (!link) return;
  releaseUrl();
  objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = name;
  link.textContent = `download ${name} · ${F.sizeOf(blob.size)}`;
  link.hidden = false;
}

async function runFile(): Promise<void> {
  const error = q('[data-file-error]', root ?? document);
  const link = q<HTMLAnchorElement>('[data-download]', root ?? document);
  if (link) link.hidden = true;

  // Everything this run depends on is read once, up front. Anything read after
  // an await would be whatever the page had moved on to.
  const mine = ++generation;
  const source = file;
  const kind = fileKind;
  const wanted = targetId;
  const stale = (): boolean => mine !== generation;
  if (!source || !wanted) return;

  try {
    if (kind === 'image') {
      const target = F.IMAGE_OUT.find((t) => t.id === wanted);
      if (!target) return;
      const quality = Number(q<HTMLInputElement>('[data-quality]', root!)?.value ?? 90) / 100;
      const fitInput = q<HTMLInputElement>('[data-fit]', root!);
      const fit = fitInput && Number(fitInput.value) < Number(fitInput.max)
        ? Number(fitInput.value)
        : undefined;
      const blob = await F.convertImage(source, target, { quality, fit });
      if (stale()) return;
      offer(blob, F.rename(source.name, target.ext));
      say(error, '');
      return;
    }

    const format = F.dataFormatOf(source.name);
    const target = F.DATA_FORMATS.find((t) => t.id === wanted);
    if (!format || !target) return;
    const text = await source.text();
    if (stale()) return;
    const out = F.convertData(text, format.id, target.id);
    if (!out.ok) { say(error, out.reason); return; }
    offer(new Blob([out.text], { type: target.mime }), F.rename(source.name, target.ext));
    say(error, '');
  } catch (problem) {
    if (stale()) return;
    say(error, problem instanceof Error ? problem.message : 'that file could not be converted');
  }
}

async function accept(next: File): Promise<void> {
  // Claims the generation too, so a conversion still running for the previous
  // file cannot deliver its result against this one.
  const mine = ++generation;
  file = next;
  fileKind = F.kindOf(next);
  targetId = '';

  const name = q('[data-file-name]', root!);
  const meta = q('[data-file-meta]', root!);
  const targets = q('[data-targets]', root!);
  const imageSet = q('[data-image-targets]', root!);
  const dataSet = q('[data-data-targets]', root!);
  const qualityWrap = q('[data-quality-wrap]', root!);
  const fitWrap = q('[data-fit-wrap]', root!);
  const error = q('[data-file-error]', root!);
  const link = q<HTMLAnchorElement>('[data-download]', root!);

  if (name) name.textContent = next.name;
  if (link) link.hidden = true;
  say(error, '');
  for (const button of all('[data-target]', root!)) button.setAttribute('aria-pressed', 'false');

  if (fileKind === 'image') {
    let detail = F.sizeOf(next.size);
    try {
      const decoded = await F.decodeImage(next);
      if (mine !== generation) { decoded.release(); return; }
      const longest = Math.max(decoded.width, decoded.height);
      detail = `${decoded.width} × ${decoded.height} · ${detail}`;
      const fit = q<HTMLInputElement>('[data-fit]', root!);
      if (fit) {
        // The slider tops out at the image's own size, so it only ever
        // shrinks and the readout is always a real pixel count.
        fit.max = String(longest);
        fit.value = String(longest);
        const out = q('[data-fit-out]', root!);
        if (out) out.textContent = String(longest);
      }
      decoded.release();
    } catch {
      say(error, 'the browser could not decode this image');
    }
    if (meta) meta.textContent = detail;
    show(targets, true);
    show(imageSet, true);
    show(dataSet, false);
    show(fitWrap, true);
    show(qualityWrap, false);
    return;
  }

  const format = F.dataFormatOf(next.name);
  if (meta) meta.textContent = `${format ? format.name : (next.type || 'unknown')} · ${F.sizeOf(next.size)}`;

  if (!format) {
    show(targets, false);
    say(error, `${next.name.split('.').pop() ?? 'this'} files are not converted here`);
    return;
  }

  show(targets, true);
  show(imageSet, false);
  show(dataSet, true);
  show(qualityWrap, false);
  show(fitWrap, false);
}

/* ------------------------------------------------------------------- text -- */

function runText(): void {
  const from = q<HTMLSelectElement>('[data-from]', root!);
  const to = q<HTMLSelectElement>('[data-to]', root!);
  const input = q<HTMLTextAreaElement>('[data-text-in]', root!);
  const output = q<HTMLTextAreaElement>('[data-text-out]', root!);
  const error = q('[data-text-error]', root!);
  const link = q<HTMLAnchorElement>('[data-text-download]', root!);
  if (!from || !to || !input || !output) return;

  if (!input.value.trim()) {
    output.value = '';
    say(error, '');
    if (link) link.hidden = true;
    return;
  }

  const fromEncoding = ENCODING_IDS.has(from.value);
  const toEncoding = ENCODING_IDS.has(to.value);

  // Chaining the two pipelines would need a guess at how to parse the decoded
  // bytes, so the mismatch is named instead of guessed at.
  const result = fromEncoding !== toEncoding
    ? { ok: false as const, reason: 'pick two data formats, or two encodings' }
    : fromEncoding
      ? F.convertEncoding(input.value, from.value, to.value)
      : F.convertData(input.value, from.value, to.value);

  if (!result.ok) {
    output.value = '';
    say(error, result.reason);
    if (link) link.hidden = true;
    return;
  }

  output.value = result.text;
  say(error, '');

  if (link) {
    const target = [...F.DATA_FORMATS, ...F.ENCODINGS].find((t) => t.id === to.value);
    if (target) {
      link.href = URL.createObjectURL(new Blob([result.text], { type: target.mime }));
      link.download = `converted.${target.ext}`;
      link.hidden = false;
    }
  }
}

/* ------------------------------------------------------------------- init -- */

export function init(): void {
  root = q('[data-convert-tool]');
  if (!root) return;
  if (root.dataset.wired === 'yes') return;
  root.dataset.wired = 'yes';

  const input = q<HTMLInputElement>('[data-input]', root);
  input?.addEventListener('input', paint);

  root.addEventListener('click', (event) => {
    const hit = (event.target as Element | null)?.closest<HTMLElement>('[data-pin], [data-copy], [data-quantity], [data-target], [data-swap], [data-text-copy]');
    if (!hit) return;

    if (hit.dataset.pin !== undefined) { pin(hit.dataset.pin); return; }
    if (hit.dataset.copy !== undefined) { void copy(hit.dataset.copy, hit); return; }
    if (hit.dataset.quantity !== undefined) { pickQuantity(hit.dataset.quantity); return; }

    if (hit.dataset.target !== undefined) {
      targetId = hit.dataset.target;
      for (const button of all('[data-target]', root!)) {
        button.setAttribute('aria-pressed', String(button === hit));
      }
      show(q('[data-quality-wrap]', root!), fileKind === 'image' && hit.dataset.lossy === 'yes');
      void runFile();
      return;
    }

    if (hit.dataset.swap !== undefined) {
      const from = q<HTMLSelectElement>('[data-from]', root!);
      const to = q<HTMLSelectElement>('[data-to]', root!);
      const textIn = q<HTMLTextAreaElement>('[data-text-in]', root!);
      const textOut = q<HTMLTextAreaElement>('[data-text-out]', root!);
      if (!from || !to || !textIn || !textOut) return;
      const wasFrom = from.value;
      // A write-only format cannot become the source, so the swap is refused
      // rather than half-applied.
      const target = F.DATA_FORMATS.find((f) => f.id === to.value);
      if (target && !target.read) { say(q('[data-text-error]', root!), `${target.name} cannot be read`); return; }
      from.value = to.value;
      to.value = wasFrom;
      if (textOut.value) textIn.value = textOut.value;
      runText();
      return;
    }

    if (hit.dataset.textCopy !== undefined) {
      void copy(q<HTMLTextAreaElement>('[data-text-out]', root!)?.value ?? '', hit);
    }
  });

  // files
  const drop = q('[data-drop]', root);
  const picker = q<HTMLInputElement>('[data-file]', root);

  drop?.addEventListener('click', () => picker?.click());
  drop?.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    if (key !== 'Enter' && key !== ' ') return;
    event.preventDefault();
    picker?.click();
  });

  picker?.addEventListener('change', () => {
    const chosen = picker.files?.[0];
    if (chosen) void accept(chosen);
  });

  for (const type of ['dragenter', 'dragover'] as const) {
    drop?.addEventListener(type, (event) => {
      event.preventDefault();
      drop.dataset.over = 'yes';
    });
  }
  for (const type of ['dragleave', 'drop'] as const) {
    drop?.addEventListener(type, () => { delete drop.dataset.over; });
  }
  drop?.addEventListener('drop', (event) => {
    event.preventDefault();
    const dropped = (event as DragEvent).dataTransfer?.files?.[0];
    if (dropped) void accept(dropped);
  });

  const quality = q<HTMLInputElement>('[data-quality]', root);
  quality?.addEventListener('input', () => {
    const out = q('[data-quality-out]', root!);
    if (out) out.textContent = quality.value;
  });
  quality?.addEventListener('change', () => void runFile());

  const fit = q<HTMLInputElement>('[data-fit]', root);
  fit?.addEventListener('input', () => {
    const out = q('[data-fit-out]', root!);
    if (out) out.textContent = fit.value;
  });
  fit?.addEventListener('change', () => void runFile());

  // text
  q('[data-text-in]', root)?.addEventListener('input', runText);
  q('[data-from]', root)?.addEventListener('change', runText);
  q('[data-to]', root)?.addEventListener('change', runText);

  window.addEventListener('beforeunload', releaseUrl);
  paint();
}
