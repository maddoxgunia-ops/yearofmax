/**
 * Reference test for the file engine.
 *
 *   node scripts/files-test.ts   (or: npm run test:files)
 *
 * Covers everything that does not need a browser. Image conversion goes through
 * the canvas and XML and HTML go through DOMParser, so those four paths are
 * exercised on the page rather than here — which is stated plainly at the end
 * rather than left as a silent gap in the count.
 */
import {
  convertData, convertEncoding, encodeBytes, decodeBytes,
  DATA_FORMATS, rename, sizeOf,
} from '../src/scripts/tools/files.ts';

let failed = 0;

const expect = (label: string, got: string, want: string): void => {
  const ok = got === want;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(28)} ${ok ? '' : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
};

const data = (text: string, from: string, to: string): string => {
  const r = convertData(text, from, to);
  return r.ok ? r.text : `error: ${r.reason}`;
};

console.log('--- tabular ---');
const people = '[{"name":"Ada","born":1815},{"name":"Grace","born":1906}]';

expect('json to csv', data(people, 'json', 'csv'),
  'name,born\nAda,1815\nGrace,1906');

expect('json to tsv', data(people, 'json', 'tsv'),
  'name\tborn\nAda\t1815\nGrace\t1906');

expect('json to markdown', data(people, 'json', 'markdown'),
  '| name | born |\n| --- | --- |\n| Ada | 1815 |\n| Grace | 1906 |');

expect('json to sql', data(people, 'json', 'sql'),
  'INSERT INTO "data" ("name", "born") VALUES\n  (\'Ada\', 1815);\n'
  + 'INSERT INTO "data" ("name", "born") VALUES\n  (\'Grace\', 1906);');

expect('csv back to json', data('name,born\nAda,1815', 'csv', 'json'),
  '[\n  {\n    "name": "Ada",\n    "born": 1815\n  }\n]');

console.log('\n--- the awkward parts of CSV ---');
expect('comma inside a field', data('[{"a":"x, y"}]', 'json', 'csv'), 'a\n"x, y"');
expect('quote inside a field', data('[{"a":"say \\"hi\\""}]', 'json', 'csv'), 'a\n"say ""hi"""');
expect('newline inside a field', data('a\n"one\ntwo"', 'csv', 'json'),
  '[\n  {\n    "a": "one\\ntwo"\n  }\n]');
expect('leading zeros survive', data('code\n01234', 'csv', 'json'),
  '[\n  {\n    "code": "01234"\n  }\n]');
expect('blank trailing line ignored', data('a,b\n1,2\n', 'csv', 'tsv'), 'a\tb\n1\t2');

console.log('\n--- trees ---');
const nested = '{"user":{"name":"Ada","tags":["maths","engine"]}}';

expect('json to yaml', data(nested, 'json', 'yaml'),
  'user:\n  name: Ada\n  tags:\n    - maths\n    - engine');

expect('yaml round trip', data(data(nested, 'json', 'yaml'), 'yaml', 'json'),
  JSON.stringify(JSON.parse(nested), null, 2));

expect('yaml list of maps',
  data('- name: Ada\n  born: 1815\n- name: Grace\n  born: 1906', 'yaml', 'csv'),
  'name,born\nAda,1815\nGrace,1906');

expect('yaml comments and quotes',
  data('# who\nname: "Ada, Countess"\nborn: 1815', 'yaml', 'json'),
  '[\n  {\n    "name": "Ada, Countess"\n  }\n]'.replace(/[\s\S]*/, () =>
    JSON.stringify({ name: 'Ada, Countess', born: 1815 }, null, 2)));

expect('yaml keeps a url intact',
  data('site: https://yearofmax.co.uk/tools/', 'yaml', 'json'),
  JSON.stringify({ site: 'https://yearofmax.co.uk/tools/' }, null, 2));

expect('yaml scalar list', data('tags:\n  - a\n  - b', 'yaml', 'json'),
  JSON.stringify({ tags: ['a', 'b'] }, null, 2));

expect('tree flattens to a table', data(nested, 'json', 'csv'),
  'user.name,user.tags.0,user.tags.1\nAda,maths,engine');

expect('ndjson out', data(people, 'json', 'ndjson'),
  '{"name":"Ada","born":1815}\n{"name":"Grace","born":1906}');

expect('ndjson in', data('{"a":1}\n{"a":2}', 'ndjson', 'csv'), 'a\n1\n2');

console.log('\n--- refusals ---');
expect('bad json says so', data('{oops', 'json', 'csv').slice(0, 6), 'error:');
expect('empty input', data('   ', 'json', 'csv'), 'error: nothing to convert');
expect('sql is write only', data('x', 'sql', 'json'), 'error: sql cannot be read');

console.log('\n--- encodings ---');
const bytes = new TextEncoder().encode('max');
expect('base64', encodeBytes(bytes, 'base64'), 'bWF4');
expect('hex', encodeBytes(bytes, 'hex'), '6d6178');
expect('data uri', encodeBytes(bytes, 'datauri', 'text/plain'), 'data:text/plain;base64,bWF4');
expect('base64url has no padding', encodeBytes(new TextEncoder().encode('max?'), 'base64url'), 'bWF4Pw');
expect('base64 round trip', new TextDecoder().decode(decodeBytes('bWF4', 'base64')), 'max');
expect('hex with separators', new TextDecoder().decode(decodeBytes('6d:61:78', 'hex')), 'max');
expect('hex rejects odd length', (() => {
  try { decodeBytes('6d6', 'hex'); return 'no error'; } catch (e) { return (e as Error).message; }
})(), 'hex needs an even number of digits');

const enc = convertEncoding('6d6178', 'hex', 'base64');
expect('hex to base64', enc.ok ? enc.text : enc.reason, 'bWF4');

const utf8 = convertEncoding('Ada Å', 'text', 'base64');
expect('utf-8 beyond latin-1', utf8.ok ? utf8.text : utf8.reason, 'QWRhIMOF');

console.log('\n--- naming ---');
expect('extension swap', rename('photo.heic', 'png'), 'photo.png');
expect('no extension', rename('photo', 'png'), 'photo.png');
expect('dotted name', rename('my.photo.v2.jpeg', 'webp'), 'my.photo.v2.webp');
expect('size bytes', sizeOf(512), '512 B');
expect('size kb', sizeOf(2048), '2.0 KB');
expect('size mb', sizeOf(1_500_000), '1.4 MB');

console.log('\n--- pairs ---');
const readable = DATA_FORMATS.filter((f) => f.read);
const writable = DATA_FORMATS.filter((f) => f.write);
let pairs = 0;
let broken: string[] = [];
for (const from of readable) {
  for (const to of writable) {
    if (from.id === to.id) continue;
    // XML and HTML need DOMParser, which node does not have.
    if (from.id === 'xml' || from.id === 'html') continue;
    const sample = from.tabular ? 'name,born\nAda,1815' : people;
    const source = from.id === 'csv' ? sample
      : from.id === 'tsv' ? sample.replace(/,/g, '\t')
        : from.id === 'markdown' ? '| name | born |\n| --- | --- |\n| Ada | 1815 |'
          : from.id === 'yaml' ? 'name: Ada\nborn: 1815'
            : from.id === 'ndjson' ? '{"name":"Ada","born":1815}'
              : people;
    const out = convertData(source, from.id, to.id);
    pairs += 1;
    if (!out.ok || !out.text.trim()) broken.push(`${from.id}>${to.id}`);
  }
}
expect(`${pairs} format pairs`, broken.join(',') || 'none', 'none');

console.log('\n--- not covered here ---');
console.log('  images (canvas), XML and HTML (DOMParser) are browser-only');

console.log(failed === 0 ? '\nall passed' : `\n${failed} failed`);
if (failed > 0) process.exitCode = 1;
