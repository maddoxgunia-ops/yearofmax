/**
 * Reference test for the unit engine.
 *
 *   node scripts/units-test.ts   (or: npm run test:units)
 *
 * Expected values are from NIST SP 811 appendix B where the conversion is
 * defined exactly, and from unitconverters.net where it is not. Everything
 * goes through `resolve`, the same entry point the interface uses, so a pass
 * here is a pass for the tool rather than for a parallel implementation.
 */
import {
  resolve, format, findUnit, parseUnit, ambiguities, UNITS, QUANTITIES,
  unitsFor, pickableQuantities, quantityName,
} from '../src/scripts/tools/units.ts';

let failed = 0;

const expect = (label: string, got: string, want: string): void => {
  const ok = got === want;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(30)} got ${got.padEnd(22)} want ${want}`);
};

/**
 * Runs a line the way the page will and returns the formatted answer. Thin
 * spaces are flattened so these cases read as values; grouping has its own
 * checks further down.
 */
function answer(line: string, sig = 9): string {
  const r = resolve(line);
  if (r.error) return `error: ${r.error}`;
  if (!r.result) return 'no target';
  return format(r.result.value, sig).replace(/ /g, ' ');
}

const check = (line: string, want: string, sig = 9): void => expect(line, answer(line, sig), want);

console.log('--- exact by definition (NIST SP 811) ---');
check('1 in to cm', '2.54');
check('1 mi to km', '1.609344');
check('1 lb to kg', '0.45359237');
check('1 gal to L', '3.785411784', 12);
check('1 acre to m2', '4046.8564224', 12);
check('1 ft2 to m2', '0.09290304');
check('1 oz to g', '28.349523125', 12);
check('1 stone to kg', '6.35029318');
check('1 nmi to km', '1.852');
check('60 mph to m/s', '26.8224');
check('1 m/s to km/h', '3.6');
check('1 BTU to J', '1055.05585262', 12);
check('1 cal to J', '4.184');
check('1 atm to Pa', '101 325');
check('1 psi to Pa', '6894.75729');
check('1 hp to W', '745.699872');
check('1 kn to km/h', '1.852');
check('1 fl oz to mL', '29.5735296');
check('1 imperial pint to mL', '568.26125');
check('1 GiB to B', '1 073 741 824');
check('1 GB to B', '1 000 000 000');
check('1 GiB to MB', '1073.74182');

console.log('\n--- affine: temperature ---');
check('100 c to f', '212');
check('-40 c to f', '-40');
check('0 c to K', '273.15');
check('98.6 f to c', '37');
check('0 K to f', '-459.67');
check('300 K to °R', '540');
check('20 c to reaumur', '16');
check('5 deltac to deltaf', '9');

console.log('\n--- reciprocal: fuel economy ---');
check('30 mpg to L/100km', '7.84048611');
check('8 L/100km to mpg', '29.4018229');
check('1 km/L to L/100km', '100');
check('40 mpg to mpg imp', '48.037997');

console.log('\n--- the cycle bridge (rev taken as cycle) ---');
check('3000 rpm to Hz', '50');
check('3000 rpm to rad/s', '314.159265');
check('50 Hz to rpm', '3000');
expect('bridge is flagged', String(resolve('3000 rpm to Hz').result?.bridged), 'true');
expect('plain is not flagged', String(resolve('1 km to mi').result?.bridged), 'false');

console.log('\n--- compound units, which no category page holds ---');
check('1 kg*m/s^2 to N', '1');
check('1 lb/ft^3 to kg/m3', '16.0184634');
check('1 N*m to J', '1');
check('1 W/(m*K) to W/(m*K)', '1');
check('100 kg*m^2/s^3 to W', '100');
check('1 J/(kg*K) to J/(kg*K)', '1');
check('9.80665 m/s2 to g0', '1');

console.log('\n--- mixed input and separators ---');
check('3 ft 6 in to cm', '106.68');
check('5 lb 4 oz to kg', '2.38135994');
check('1 h 30 min to min', '90');
check('12 km -> mi', '7.45645431');
check('12 km > mi', '7.45645431');
check('12 km in mi', '7.45645431');
check('12km to mi', '7.45645431');
check('1,500 m to km', '1.5');
check('1.5e3 m to km', '1.5');

console.log('\n--- refusals, with a reason ---');
expect('kg to m', answer('1 kg to m'), 'error: mass does not convert to length');
expect('L to s', answer('1 L to s'), 'error: volume does not convert to time');
expect('unknown unit', answer('1 flurb to m'), 'error: flurb is not a unit I know');
expect('temp in compound', answer('1 °C/W to K/W'), '1');

console.log('\n--- exactness is tracked, not assumed ---');
expect('in to cm exact', String(resolve('1 in to cm').result?.exact), 'true');
expect('mach not exact', String(resolve('1 Ma to m/s').result?.exact), 'false');
expect('slug not exact', String(resolve('1 slug to kg').result?.exact), 'false');

console.log('\n--- lookup: case, plurals, ambiguity ---');
expect('t is tonne', findUnit('t')[0]?.name ?? '-', 'tonne');
expect('T is tesla', findUnit('T')[0]?.name ?? '-', 'tesla');
expect('m is metre', findUnit('m')[0]?.name ?? '-', 'metre');
expect('case falls back', findUnit('KM')[0]?.name ?? '-', 'kilometre');
expect('metres plural', findUnit('metres')[0]?.name ?? '-', 'metre');
expect('inches plural', findUnit('inches')[0]?.name ?? '-', 'inch');
expect('gauss keeps its s', findUnit('gauss')[0]?.name ?? '-', 'gauss');
expect('meter spelling', findUnit('meter')[0]?.name ?? '-', 'metre');
expect('kilometer spelling', findUnit('kilometer')[0]?.name ?? '-', 'kilometre');
expect('um is micrometre', findUnit('um')[0]?.name ?? '-', 'micrometre');
expect('dB is not a byte', String(findUnit('dB').length), '0');
expect('rad is the angle', findUnit('rad')[0]?.name ?? '-', 'radian');
expect('generated yields', findUnit('Pa')[0]?.name ?? '-', 'pascal');

console.log('\n--- formatting ---');
expect('long decimal', format(7.456454306848008), '7.4564543');
expect('grouped', format(1234567.891), '1 234 567.9');
expect('four digits ungrouped', format(1234), '1234');
expect('tiny goes to powers', format(1.602176634e-19, 7), '1.602177 × 10⁻¹⁹');
expect('zero', format(0), '0');
expect('one micro stays plain', format(0.000001), '0.000001');

console.log('\n--- table shape ---');
const dupes = new Map<string, number>();
for (const u of UNITS) dupes.set(u.id, (dupes.get(u.id) ?? 0) + 1);
const collisions = [...dupes].filter(([, n]) => n > 1).map(([id]) => id);
expect('no duplicate ids', collisions.join(',') || 'none', 'none');

// A unit with no sibling is not a fault — lumen has no rival, and it still
// earns its place inside compounds like lm/W. It is simply not pickable.
const lone = UNITS.filter((u) => u.listed && unitsFor(u.dim).length < 2).map((u) => u.name);
console.log(`INFO  lone units                ${lone.join(', ') || 'none'}`);

console.log('\n--- ambiguity, deliberate ---');
for (const a of ambiguities()) {
  console.log(`  ${a.key.padEnd(12)} ${a.units.map((u) => u.name).join(' / ')}`);
}

const unnamed = [...new Set(UNITS.filter((u) => u.listed).map((u) => quantityName(u.dim)))]
  .filter((n) => !QUANTITIES.some((q) => q.name === n));
expect('every listed dim named', unnamed.join(',') || 'none', 'none');

console.log('\n--- coverage ---');
console.log(`  units           ${UNITS.length} (${UNITS.filter((u) => u.listed).length} listed)`);
console.log(`  named dimensions ${QUANTITIES.length}, pickable ${pickableQuantities().length}`);
for (const q of pickableQuantities()) {
  console.log(`  ${q.name.padEnd(22)} ${String(unitsFor(q.dim).length).padStart(3)}`);
}

const named = parseUnit('W/(m*K)');
expect('compound finds a name', named.ok ? quantityName(named.measure.dim) : '-', 'thermal conductivity');

const loose = parseUnit('kg/s^3');
expect('unnamed compound falls back', loose.ok ? quantityName(loose.measure.dim) : '-', 'kg/s³');

console.log(failed === 0 ? '\nall passed' : `\n${failed} failed`);
if (failed > 0) process.exitCode = 1;
