/**
 * Units and measures. Pure functions, no dependencies, no DOM.
 *
 * unitconverters.net splits this work across 89 category pages, each with two
 * dropdowns; to use it you have to already know which page your unit lives on.
 * This models the problem one level down instead. Every unit carries a vector
 * of dimension exponents, so:
 *
 *   - categories are derived rather than maintained — two units convert if and
 *     only if their vectors match, and "heat flux density" is not a page, it is
 *     [0, 1, -3, 0, 0, 0, 0, 0, 0];
 *   - compound units compose: kg*m/s^2, W/(m*K), lb/ft^3 — combinations that
 *     are not on any of those 89 pages;
 *   - a conversion across dimensions is refused with a reason rather than
 *     quietly answered.
 *
 * Two deliberate departures from strict SI. Angle and data get their own slots
 * even though radians and bytes are formally dimensionless — without that,
 * degrees would convert to bytes. And rotation rates cross the angle slot by
 * the cycle bridge in `convert`, because rpm to Hz is a conversion people
 * actually want and the radian's dimensionlessness is a known SI wart.
 */

/* ------------------------------------------------------------ dimensions -- */

/**
 * Exponents of, in order:
 * length, mass, time, current, temperature, amount, luminous, angle, data.
 */
export type Dim = readonly number[];

const BASE_SYMBOL = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd', 'rad', 'bit'];

const D = (
  L = 0, M = 0, T = 0, I = 0, K = 0, N = 0, J = 0, A = 0, B = 0,
): Dim => [L, M, T, I, K, N, J, A, B];

export const sameDim = (a: Dim, b: Dim): boolean =>
  a.length === b.length && a.every((n, i) => n === b[i]);

const combine = (a: Dim, b: Dim, sign: number): Dim => a.map((n, i) => n + sign * b[i]!);
const scaleDim = (a: Dim, n: number): Dim => a.map((v) => v * n);

/** Index of the angle slot, used by the cycle bridge. */
const ANGLE_SLOT = 7;

/* ------------------------------------------------------------- quantities -- */

export interface Quantity {
  name: string;
  dim: Dim;
}

/**
 * Named dimensions, for labelling and for the picker. Nothing here gates a
 * conversion, so a compound this list does not name still converts against
 * anything sharing its vector.
 *
 * Some names cover two textbook quantities because they are genuinely the same
 * dimension: energy and torque are both L²MT⁻², frequency and radioactivity
 * are both T⁻¹. Splitting them would be a fiction, so the unit list groups
 * them instead.
 */
export const QUANTITIES: Quantity[] = [
  { name: 'length', dim: D(1) },
  { name: 'mass', dim: D(0, 1) },
  { name: 'time', dim: D(0, 0, 1) },
  { name: 'temperature', dim: D(0, 0, 0, 0, 1) },
  { name: 'area', dim: D(2) },
  { name: 'volume', dim: D(3) },
  { name: 'angle', dim: D(0, 0, 0, 0, 0, 0, 0, 1) },
  { name: 'solid angle', dim: D(0, 0, 0, 0, 0, 0, 0, 2) },
  { name: 'data', dim: D(0, 0, 0, 0, 0, 0, 0, 0, 1) },
  { name: 'speed', dim: D(1, 0, -1) },
  { name: 'acceleration', dim: D(1, 0, -2) },
  { name: 'frequency', dim: D(0, 0, -1) },
  { name: 'angular velocity', dim: D(0, 0, -1, 0, 0, 0, 0, 1) },
  { name: 'force', dim: D(1, 1, -2) },
  { name: 'pressure', dim: D(-1, 1, -2) },
  { name: 'energy', dim: D(2, 1, -2) },
  { name: 'power', dim: D(2, 1, -3) },
  { name: 'density', dim: D(-3, 1) },
  { name: 'flow', dim: D(3, 0, -1) },
  { name: 'mass flow', dim: D(0, 1, -1) },
  { name: 'data rate', dim: D(0, 0, -1, 0, 0, 0, 0, 0, 1) },
  { name: 'fuel economy', dim: D(-2) },
  { name: 'amount', dim: D(0, 0, 0, 0, 0, 1) },
  { name: 'charge', dim: D(0, 0, 1, 1) },
  { name: 'current', dim: D(0, 0, 0, 1) },
  { name: 'voltage', dim: D(2, 1, -3, -1) },
  { name: 'resistance', dim: D(2, 1, -3, -2) },
  { name: 'conductance', dim: D(-2, -1, 3, 2) },
  { name: 'capacitance', dim: D(-2, -1, 4, 2) },
  { name: 'inductance', dim: D(2, 1, -2, -2) },
  { name: 'magnetic flux', dim: D(2, 1, -2, -1) },
  { name: 'flux density', dim: D(0, 1, -2, -1) },
  { name: 'field strength', dim: D(-1, 0, 0, 1) },
  { name: 'luminous intensity', dim: D(0, 0, 0, 0, 0, 0, 1) },
  { name: 'luminous flux', dim: D(0, 0, 0, 0, 0, 0, 1, 2) },
  { name: 'illuminance', dim: D(-2, 0, 0, 0, 0, 0, 1, 2) },
  { name: 'luminance', dim: D(-2, 0, 0, 0, 0, 0, 1) },
  { name: 'dose', dim: D(2, 0, -2) },
  { name: 'dynamic viscosity', dim: D(-1, 1, -1) },
  { name: 'kinematic viscosity', dim: D(2, 0, -1) },
  { name: 'thermal conductivity', dim: D(1, 1, -3, 0, -1) },
  { name: 'specific heat', dim: D(2, 0, -2, 0, -1) },
];

/** Base-unit formula for a dimension nothing has named: m·kg/s². */
function formula(dim: Dim): string {
  const top: string[] = [];
  const bottom: string[] = [];
  dim.forEach((n, i) => {
    if (n === 0) return;
    const sym = BASE_SYMBOL[i]!;
    const mag = Math.abs(n);
    (n > 0 ? top : bottom).push(mag === 1 ? sym : sym + superscript(mag));
  });
  if (!top.length && !bottom.length) return 'number';
  const num = top.join('·') || '1';
  return bottom.length ? `${num}/${bottom.join('·')}` : num;
}

export function quantityName(dim: Dim): string {
  return QUANTITIES.find((q) => sameDim(q.dim, dim))?.name ?? formula(dim);
}

/* ------------------------------------------------------------------ types -- */

export interface Measure {
  dim: Dim;
  /** Multiply by this to reach the base value (numerator when reciprocal). */
  factor: number;
  /** Affine term: base = value * factor + offset. Only temperature uses it. */
  offset: number;
  /** base = factor / value. Only fuel consumption needs it. */
  reciprocal: boolean;
  /** The factor is exact by definition rather than a measured approximation. */
  exact: boolean;
}

export interface Unit extends Measure {
  /** Stable key, safe in an attribute. */
  id: string;
  name: string;
  symbol: string;
  aliases: string[];
  /** Display grouping only — conversion reads the vector, never this. */
  group?: string;
  /** Appears in the unit list. Generated prefixes outside `show` parse but hide. */
  listed: boolean;
}

/* ----------------------------------------------------------------- table -- */

interface Def {
  name: string;
  symbol: string;
  dim: Dim;
  factor: number;
  offset?: number;
  reciprocal?: boolean;
  exact?: boolean;
  aliases?: string[];
  /** Alternate spelling; prefixed forms are generated for it too. */
  alt?: string;
  prefix?: 'si' | 'binary' | 'both';
  /** Prefixes whose generated units appear in the list. */
  show?: string[];
  /** Restrict SI generation. A millibyte helps nobody and would shadow dB. */
  only?: string[];
  group?: string;
}

const LENGTH = D(1);
const MASS = D(0, 1);
const TIME = D(0, 0, 1);
const TEMP = D(0, 0, 0, 0, 1);

/** Imperial has been defined off these exact values since 1959. */
const FT = 0.3048;
const IN = 0.0254;
const LB = 0.45359237;
const GAL_US = 0.003785411784;
const GAL_IMP = 0.00454609;
const DRY_GAL = 4.40488377086e-3;
const TAU = 2 * Math.PI;

const DEFS: Def[] = [
  /* length ------------------------------------------------------------- */
  { name: 'metre', symbol: 'm', alt: 'meter', dim: LENGTH, factor: 1, exact: true,
    prefix: 'si', show: ['k', 'c', 'm', 'µ', 'n'] },
  { name: 'inch', symbol: 'in', dim: LENGTH, factor: IN, exact: true, aliases: ['inches', '"'] },
  { name: 'foot', symbol: 'ft', dim: LENGTH, factor: FT, exact: true, aliases: ['feet', "'"] },
  { name: 'yard', symbol: 'yd', dim: LENGTH, factor: 3 * FT, exact: true },
  { name: 'mile', symbol: 'mi', dim: LENGTH, factor: 5280 * FT, exact: true },
  { name: 'nautical mile', symbol: 'nmi', dim: LENGTH, factor: 1852, exact: true },
  { name: 'thou', symbol: 'thou', dim: LENGTH, factor: IN / 1000, exact: true, aliases: ['mil'] },
  { name: 'fathom', symbol: 'ftm', dim: LENGTH, factor: 6 * FT, exact: true },
  { name: 'rod', symbol: 'rod', dim: LENGTH, factor: 16.5 * FT, exact: true, aliases: ['pole', 'perch'] },
  { name: 'chain', symbol: 'ch', dim: LENGTH, factor: 66 * FT, exact: true },
  { name: 'furlong', symbol: 'fur', dim: LENGTH, factor: 660 * FT, exact: true },
  { name: 'league', symbol: 'lea', dim: LENGTH, factor: 15840 * FT, exact: true },
  { name: 'US survey foot', symbol: 'ftUS', dim: LENGTH, factor: 1200 / 3937, exact: true, group: 'survey' },
  { name: 'point', symbol: 'pt', dim: LENGTH, factor: IN / 72, exact: true, group: 'typography' },
  { name: 'pica', symbol: 'pica', dim: LENGTH, factor: IN / 6, exact: true, group: 'typography' },
  { name: 'angstrom', symbol: 'Å', dim: LENGTH, factor: 1e-10, exact: true },
  { name: 'astronomical unit', symbol: 'au', dim: LENGTH, factor: 1.495978707e11, exact: true, group: 'astronomy' },
  { name: 'light-year', symbol: 'ly', dim: LENGTH, factor: 9.4607304725808e15, exact: true, group: 'astronomy', aliases: ['light year', 'lightyear'] },
  { name: 'parsec', symbol: 'pc', dim: LENGTH, factor: 3.0856775814913673e16, exact: true, group: 'astronomy' },

  /* area ---------------------------------------------------------------- */
  { name: 'square metre', symbol: 'm²', alt: 'square meter', dim: D(2), factor: 1, exact: true, aliases: ['m2', 'sqm'] },
  { name: 'square kilometre', symbol: 'km²', alt: 'square kilometer', dim: D(2), factor: 1e6, exact: true, aliases: ['km2'] },
  { name: 'square centimetre', symbol: 'cm²', alt: 'square centimeter', dim: D(2), factor: 1e-4, exact: true, aliases: ['cm2'] },
  { name: 'square millimetre', symbol: 'mm²', alt: 'square millimeter', dim: D(2), factor: 1e-6, exact: true, aliases: ['mm2'] },
  { name: 'square inch', symbol: 'in²', dim: D(2), factor: IN ** 2, exact: true, aliases: ['in2', 'sqin'] },
  { name: 'square foot', symbol: 'ft²', dim: D(2), factor: FT ** 2, exact: true, aliases: ['ft2', 'sqft', 'square feet'] },
  { name: 'square yard', symbol: 'yd²', dim: D(2), factor: (3 * FT) ** 2, exact: true, aliases: ['yd2'] },
  { name: 'square mile', symbol: 'mi²', dim: D(2), factor: (5280 * FT) ** 2, exact: true, aliases: ['mi2'] },
  { name: 'acre', symbol: 'ac', dim: D(2), factor: 4840 * (3 * FT) ** 2, exact: true },
  { name: 'hectare', symbol: 'ha', dim: D(2), factor: 1e4, exact: true },
  { name: 'are', symbol: 'are', dim: D(2), factor: 100, exact: true },
  { name: 'barn', symbol: 'barn', dim: D(2), factor: 1e-28, exact: true, group: 'physics' },

  /* volume -------------------------------------------------------------- */
  { name: 'cubic metre', symbol: 'm³', alt: 'cubic meter', dim: D(3), factor: 1, exact: true, aliases: ['m3'] },
  { name: 'litre', symbol: 'L', alt: 'liter', dim: D(3), factor: 1e-3, exact: true,
    prefix: 'si', show: ['m', 'c', 'd', 'h'], only: ['m', 'c', 'd', 'h', 'k', 'µ'] },
  { name: 'cubic centimetre', symbol: 'cm³', alt: 'cubic centimeter', dim: D(3), factor: 1e-6, exact: true, aliases: ['cc', 'cm3'] },
  { name: 'cubic inch', symbol: 'in³', dim: D(3), factor: IN ** 3, exact: true, aliases: ['in3'] },
  { name: 'cubic foot', symbol: 'ft³', dim: D(3), factor: FT ** 3, exact: true, aliases: ['ft3', 'cubic feet'] },
  { name: 'cubic yard', symbol: 'yd³', dim: D(3), factor: (3 * FT) ** 3, exact: true, aliases: ['yd3'] },
  { name: 'US gallon', symbol: 'gal', dim: D(3), factor: GAL_US, exact: true, group: 'US liquid', aliases: ['gallon', 'us gal'] },
  { name: 'US quart', symbol: 'qt', dim: D(3), factor: GAL_US / 4, exact: true, group: 'US liquid', aliases: ['quart'] },
  { name: 'US pint', symbol: 'pt US', dim: D(3), factor: GAL_US / 8, exact: true, group: 'US liquid', aliases: ['pint', 'us pint'] },
  { name: 'US cup', symbol: 'cup', dim: D(3), factor: GAL_US / 16, exact: true, group: 'US liquid' },
  { name: 'US fluid ounce', symbol: 'fl oz', dim: D(3), factor: GAL_US / 128, exact: true, group: 'US liquid', aliases: ['floz', 'fluid ounce'] },
  { name: 'US tablespoon', symbol: 'tbsp', dim: D(3), factor: GAL_US / 256, exact: true, group: 'US liquid', aliases: ['tablespoon'] },
  { name: 'US teaspoon', symbol: 'tsp', dim: D(3), factor: GAL_US / 768, exact: true, group: 'US liquid', aliases: ['teaspoon'] },
  { name: 'imperial gallon', symbol: 'gal imp', dim: D(3), factor: GAL_IMP, exact: true, group: 'imperial', aliases: ['imp gal'] },
  { name: 'imperial quart', symbol: 'qt imp', dim: D(3), factor: GAL_IMP / 4, exact: true, group: 'imperial' },
  { name: 'imperial pint', symbol: 'pt imp', dim: D(3), factor: GAL_IMP / 8, exact: true, group: 'imperial' },
  { name: 'imperial fluid ounce', symbol: 'fl oz imp', dim: D(3), factor: GAL_IMP / 160, exact: true, group: 'imperial' },
  { name: 'US dry gallon', symbol: 'dry gal', dim: D(3), factor: DRY_GAL, exact: true, group: 'US dry' },
  { name: 'bushel', symbol: 'bu', dim: D(3), factor: 8 * DRY_GAL, exact: true, group: 'US dry' },
  { name: 'peck', symbol: 'pk', dim: D(3), factor: 2 * DRY_GAL, exact: true, group: 'US dry' },
  { name: 'oil barrel', symbol: 'bbl', dim: D(3), factor: 42 * GAL_US, exact: true },
  { name: 'board foot', symbol: 'fbm', dim: D(3), factor: FT * FT * IN, exact: true, group: 'lumber' },
  { name: 'cord', symbol: 'cord', dim: D(3), factor: 128 * FT ** 3, exact: true, group: 'lumber' },

  /* mass ---------------------------------------------------------------- */
  { name: 'gram', symbol: 'g', alt: 'gramme', dim: MASS, factor: 1e-3, exact: true,
    prefix: 'si', show: ['k', 'm', 'µ'] },
  { name: 'tonne', symbol: 't', dim: MASS, factor: 1e3, exact: true, aliases: ['metric ton'] },
  { name: 'pound', symbol: 'lb', dim: MASS, factor: LB, exact: true, aliases: ['lbs'] },
  { name: 'ounce', symbol: 'oz', dim: MASS, factor: LB / 16, exact: true },
  { name: 'stone', symbol: 'st', dim: MASS, factor: 14 * LB, exact: true },
  { name: 'short ton', symbol: 'ton', dim: MASS, factor: 2000 * LB, exact: true, group: 'US', aliases: ['us ton'] },
  { name: 'long ton', symbol: 'long ton', dim: MASS, factor: 2240 * LB, exact: true, group: 'imperial' },
  { name: 'grain', symbol: 'gr', dim: MASS, factor: LB / 7000, exact: true },
  { name: 'troy ounce', symbol: 'ozt', dim: MASS, factor: 0.0311034768, exact: true, group: 'troy' },
  { name: 'troy pound', symbol: 'lbt', dim: MASS, factor: 0.3732417216, exact: true, group: 'troy' },
  { name: 'carat', symbol: 'ct', dim: MASS, factor: 2e-4, exact: true },
  { name: 'slug', symbol: 'slug', dim: MASS, factor: 14.593902937206364 },
  { name: 'dalton', symbol: 'Da', dim: MASS, factor: 1.66053906892e-27, aliases: ['amu'], group: 'physics' },

  /* time ---------------------------------------------------------------- */
  { name: 'second', symbol: 's', dim: TIME, factor: 1, exact: true, aliases: ['sec'],
    prefix: 'si', show: ['m', 'µ', 'n'], only: ['m', 'µ', 'n', 'p', 'f', 'k'] },
  { name: 'minute', symbol: 'min', dim: TIME, factor: 60, exact: true },
  { name: 'hour', symbol: 'h', dim: TIME, factor: 3600, exact: true, aliases: ['hr', 'hrs'] },
  { name: 'day', symbol: 'd', dim: TIME, factor: 86400, exact: true },
  { name: 'week', symbol: 'wk', dim: TIME, factor: 604800, exact: true },
  { name: 'fortnight', symbol: 'fortnight', dim: TIME, factor: 1209600, exact: true },
  { name: 'month', symbol: 'mo', dim: TIME, factor: 2629746, group: 'mean Gregorian' },
  { name: 'year', symbol: 'yr', dim: TIME, factor: 31556952, group: 'mean Gregorian', aliases: ['annum'] },
  { name: 'Julian year', symbol: 'Julian yr', dim: TIME, factor: 31557600, exact: true, group: 'astronomy' },
  { name: 'decade', symbol: 'decade', dim: TIME, factor: 315569520 },
  { name: 'century', symbol: 'century', dim: TIME, factor: 3155695200 },

  /* temperature ---------------------------------------------------------- */
  { name: 'kelvin', symbol: 'K', dim: TEMP, factor: 1, offset: 0, exact: true },
  { name: 'celsius', symbol: '°C', dim: TEMP, factor: 1, offset: 273.15, exact: true, aliases: ['c', 'centigrade', 'degc'] },
  { name: 'fahrenheit', symbol: '°F', dim: TEMP, factor: 5 / 9, offset: 273.15 - 32 * 5 / 9, exact: true, aliases: ['f', 'degf'] },
  { name: 'rankine', symbol: '°R', dim: TEMP, factor: 5 / 9, offset: 0, exact: true },
  { name: 'reaumur', symbol: '°Re', dim: TEMP, factor: 1.25, offset: 273.15, exact: true },
  { name: 'delisle', symbol: '°De', dim: TEMP, factor: -2 / 3, offset: 373.15, exact: true, group: 'historical' },
  { name: 'romer', symbol: '°Ro', dim: TEMP, factor: 40 / 21, offset: 273.15 - 7.5 * 40 / 21, exact: true, group: 'historical' },
  { name: 'celsius degree', symbol: 'Δ°C', dim: TEMP, factor: 1, offset: 0, exact: true, group: 'interval', aliases: ['deltac'] },
  { name: 'fahrenheit degree', symbol: 'Δ°F', dim: TEMP, factor: 5 / 9, offset: 0, exact: true, group: 'interval', aliases: ['deltaf'] },

  /* speed ---------------------------------------------------------------- */
  { name: 'metre per second', symbol: 'm/s', alt: 'meter per second', dim: D(1, 0, -1), factor: 1, exact: true, aliases: ['mps'] },
  { name: 'kilometre per hour', symbol: 'km/h', alt: 'kilometer per hour', dim: D(1, 0, -1), factor: 1 / 3.6, exact: true, aliases: ['kph', 'kmh'] },
  { name: 'mile per hour', symbol: 'mph', dim: D(1, 0, -1), factor: 5280 * FT / 3600, exact: true, aliases: ['mi/h'] },
  { name: 'knot', symbol: 'kn', dim: D(1, 0, -1), factor: 1852 / 3600, exact: true, aliases: ['knots', 'kt'] },
  { name: 'foot per second', symbol: 'ft/s', dim: D(1, 0, -1), factor: FT, exact: true, aliases: ['fps'] },
  { name: 'mach', symbol: 'Ma', dim: D(1, 0, -1), factor: 340.29, group: 'sea level' },
  // c0, not c: a bare c is worth more to celsius, which people type constantly.
  { name: 'speed of light', symbol: 'c₀', dim: D(1, 0, -1), factor: 299792458, exact: true, group: 'physics' },

  /* acceleration ---------------------------------------------------------- */
  { name: 'metre per second squared', symbol: 'm/s²', alt: 'meter per second squared', dim: D(1, 0, -2), factor: 1, exact: true, aliases: ['m/s2'] },
  { name: 'standard gravity', symbol: 'g0', dim: D(1, 0, -2), factor: 9.80665, exact: true, aliases: ['gee', 'g-force'] },
  { name: 'foot per second squared', symbol: 'ft/s²', dim: D(1, 0, -2), factor: FT, exact: true, aliases: ['ft/s2'] },
  // Named in full: "gal" as a name would take the key that US gallon needs.
  { name: 'galileo', symbol: 'Gal', dim: D(1, 0, -2), factor: 0.01, exact: true, group: 'geodesy' },

  /* angle ------------------------------------------------------------------ */
  { name: 'radian', symbol: 'rad', dim: D(0, 0, 0, 0, 0, 0, 0, 1), factor: 1, exact: true,
    prefix: 'si', show: ['m'], only: ['m', 'µ'] },
  { name: 'degree', symbol: '°', dim: D(0, 0, 0, 0, 0, 0, 0, 1), factor: Math.PI / 180, exact: true, aliases: ['deg', 'degree'] },
  { name: 'gradian', symbol: 'grad', dim: D(0, 0, 0, 0, 0, 0, 0, 1), factor: Math.PI / 200, exact: true, aliases: ['gon'] },
  { name: 'turn', symbol: 'turn', dim: D(0, 0, 0, 0, 0, 0, 0, 1), factor: TAU, exact: true, aliases: ['rev', 'revolution', 'cycle'] },
  { name: 'arcminute', symbol: 'arcmin', dim: D(0, 0, 0, 0, 0, 0, 0, 1), factor: Math.PI / 10800, exact: true, aliases: ['moa', '′'] },
  { name: 'arcsecond', symbol: 'arcsec', dim: D(0, 0, 0, 0, 0, 0, 0, 1), factor: Math.PI / 648000, exact: true, aliases: ['″'] },
  { name: 'steradian', symbol: 'sr', dim: D(0, 0, 0, 0, 0, 0, 0, 2), factor: 1, exact: true },
  { name: 'square degree', symbol: 'deg²', dim: D(0, 0, 0, 0, 0, 0, 0, 2), factor: (Math.PI / 180) ** 2, exact: true },

  /* frequency --------------------------------------------------------------- */
  { name: 'hertz', symbol: 'Hz', dim: D(0, 0, -1), factor: 1, exact: true,
    prefix: 'si', show: ['k', 'M', 'G'], only: ['k', 'M', 'G', 'T', 'm'] },
  { name: 'becquerel', symbol: 'Bq', dim: D(0, 0, -1), factor: 1, exact: true, group: 'radioactivity',
    prefix: 'si', show: [], only: ['k', 'M', 'G'] },
  { name: 'curie', symbol: 'Ci', dim: D(0, 0, -1), factor: 3.7e10, exact: true, group: 'radioactivity' },
  { name: 'rutherford', symbol: 'Rd', dim: D(0, 0, -1), factor: 1e6, exact: true, group: 'radioactivity' },

  /* angular velocity -------------------------------------------------------- */
  { name: 'radian per second', symbol: 'rad/s', dim: D(0, 0, -1, 0, 0, 0, 0, 1), factor: 1, exact: true },
  { name: 'degree per second', symbol: '°/s', dim: D(0, 0, -1, 0, 0, 0, 0, 1), factor: Math.PI / 180, exact: true, aliases: ['deg/s'] },
  { name: 'revolution per minute', symbol: 'rpm', dim: D(0, 0, -1, 0, 0, 0, 0, 1), factor: TAU / 60, exact: true, aliases: ['r/min'] },
  { name: 'revolution per second', symbol: 'rps', dim: D(0, 0, -1, 0, 0, 0, 0, 1), factor: TAU, exact: true },

  /* force -------------------------------------------------------------------- */
  { name: 'newton', symbol: 'N', dim: D(1, 1, -2), factor: 1, exact: true,
    prefix: 'si', show: ['k', 'm'], only: ['k', 'M', 'm', 'µ', 'd'] },
  { name: 'kilogram-force', symbol: 'kgf', dim: D(1, 1, -2), factor: 9.80665, exact: true, aliases: ['kp'] },
  { name: 'pound-force', symbol: 'lbf', dim: D(1, 1, -2), factor: 4.4482216152605, exact: true },
  { name: 'dyne', symbol: 'dyn', dim: D(1, 1, -2), factor: 1e-5, exact: true },
  { name: 'poundal', symbol: 'pdl', dim: D(1, 1, -2), factor: 0.138254954376, exact: true },
  { name: 'ton-force', symbol: 'tonf', dim: D(1, 1, -2), factor: 2000 * 4.4482216152605, exact: true, group: 'US' },

  /* pressure ----------------------------------------------------------------- */
  { name: 'pascal', symbol: 'Pa', dim: D(-1, 1, -2), factor: 1, exact: true,
    prefix: 'si', show: ['k', 'h', 'M'], only: ['k', 'h', 'M', 'G', 'm'] },
  { name: 'bar', symbol: 'bar', dim: D(-1, 1, -2), factor: 1e5, exact: true,
    prefix: 'si', show: ['m'], only: ['m', 'k', 'µ'] },
  { name: 'atmosphere', symbol: 'atm', dim: D(-1, 1, -2), factor: 101325, exact: true },
  { name: 'torr', symbol: 'Torr', dim: D(-1, 1, -2), factor: 101325 / 760, exact: true },
  { name: 'millimetre of mercury', symbol: 'mmHg', dim: D(-1, 1, -2), factor: 133.322387415, exact: true },
  { name: 'inch of mercury', symbol: 'inHg', dim: D(-1, 1, -2), factor: 3386.388640341 },
  { name: 'pound per square inch', symbol: 'psi', dim: D(-1, 1, -2), factor: 4.4482216152605 / IN ** 2, exact: true },
  { name: 'kilogram-force per square centimetre', symbol: 'kgf/cm²', dim: D(-1, 1, -2), factor: 98066.5, exact: true },
  { name: 'metre of water', symbol: 'mH2O', dim: D(-1, 1, -2), factor: 9806.65, exact: true },

  /* energy -------------------------------------------------------------------- */
  { name: 'joule', symbol: 'J', dim: D(2, 1, -2), factor: 1, exact: true,
    prefix: 'si', show: ['k', 'M', 'G'], only: ['k', 'M', 'G', 'T', 'm'] },
  { name: 'calorie', symbol: 'cal', dim: D(2, 1, -2), factor: 4.184, exact: true,
    prefix: 'si', show: ['k'], only: ['k', 'm'] },
  { name: 'watt-hour', symbol: 'Wh', dim: D(2, 1, -2), factor: 3600, exact: true,
    prefix: 'si', show: ['k', 'M', 'G'], only: ['k', 'M', 'G', 'T', 'm'] },
  { name: 'electronvolt', symbol: 'eV', dim: D(2, 1, -2), factor: 1.602176634e-19, exact: true,
    prefix: 'si', show: ['k', 'M', 'G'], only: ['k', 'M', 'G', 'T', 'P'] },
  { name: 'British thermal unit', symbol: 'BTU', dim: D(2, 1, -2), factor: 1055.05585262, exact: true },
  { name: 'therm', symbol: 'thm', dim: D(2, 1, -2), factor: 105505585.262, exact: true },
  { name: 'foot-pound', symbol: 'ft·lb', dim: D(2, 1, -2), factor: 4.4482216152605 * FT, exact: true, aliases: ['ftlb', 'ft lb'] },
  { name: 'erg', symbol: 'erg', dim: D(2, 1, -2), factor: 1e-7, exact: true },
  { name: 'ton of TNT', symbol: 'tTNT', dim: D(2, 1, -2), factor: 4.184e9, exact: true },
  { name: 'newton-metre', symbol: 'N·m', dim: D(2, 1, -2), factor: 1, exact: true, group: 'torque', aliases: ['newton metre'] },
  { name: 'inch-pound', symbol: 'in·lb', dim: D(2, 1, -2), factor: 4.4482216152605 * IN, exact: true, group: 'torque' },
  { name: 'kilogram-force metre', symbol: 'kgf·m', dim: D(2, 1, -2), factor: 9.80665, exact: true, group: 'torque' },

  /* power ---------------------------------------------------------------------- */
  { name: 'watt', symbol: 'W', dim: D(2, 1, -3), factor: 1, exact: true,
    prefix: 'si', show: ['k', 'M', 'G', 'm'], only: ['k', 'M', 'G', 'T', 'm', 'µ'] },
  { name: 'horsepower', symbol: 'hp', dim: D(2, 1, -3), factor: 550 * 4.4482216152605 * FT, exact: true },
  { name: 'metric horsepower', symbol: 'PS', dim: D(2, 1, -3), factor: 735.49875, exact: true, aliases: ['cv'] },
  { name: 'BTU per hour', symbol: 'BTU/h', dim: D(2, 1, -3), factor: 1055.05585262 / 3600, exact: true },
  { name: 'ton of refrigeration', symbol: 'RT', dim: D(2, 1, -3), factor: 3516.8528420667 },
  { name: 'volt-ampere', symbol: 'VA', dim: D(2, 1, -3), factor: 1, exact: true, group: 'electrical' },

  /* density ---------------------------------------------------------------------- */
  { name: 'kilogram per cubic metre', symbol: 'kg/m³', dim: D(-3, 1), factor: 1, exact: true },
  { name: 'gram per cubic centimetre', symbol: 'g/cm³', dim: D(-3, 1), factor: 1000, exact: true },
  { name: 'pound per cubic foot', symbol: 'lb/ft³', dim: D(-3, 1), factor: LB / FT ** 3, exact: true },
  { name: 'pound per cubic inch', symbol: 'lb/in³', dim: D(-3, 1), factor: LB / IN ** 3, exact: true },
  { name: 'pound per US gallon', symbol: 'lb/gal', dim: D(-3, 1), factor: LB / GAL_US, exact: true },

  /* flow ------------------------------------------------------------------------- */
  { name: 'cubic metre per second', symbol: 'm³/s', dim: D(3, 0, -1), factor: 1, exact: true },
  { name: 'litre per second', symbol: 'L/s', dim: D(3, 0, -1), factor: 1e-3, exact: true },
  { name: 'litre per minute', symbol: 'L/min', dim: D(3, 0, -1), factor: 1e-3 / 60, exact: true },
  { name: 'cubic metre per hour', symbol: 'm³/h', dim: D(3, 0, -1), factor: 1 / 3600, exact: true },
  { name: 'cubic foot per minute', symbol: 'cfm', dim: D(3, 0, -1), factor: FT ** 3 / 60, exact: true },
  { name: 'US gallon per minute', symbol: 'gpm', dim: D(3, 0, -1), factor: GAL_US / 60, exact: true },

  /* mass flow --------------------------------------------------------------------- */
  { name: 'kilogram per second', symbol: 'kg/s', dim: D(0, 1, -1), factor: 1, exact: true },
  { name: 'kilogram per hour', symbol: 'kg/h', dim: D(0, 1, -1), factor: 1 / 3600, exact: true },
  { name: 'tonne per hour', symbol: 't/h', dim: D(0, 1, -1), factor: 1000 / 3600, exact: true },
  { name: 'pound per hour', symbol: 'lb/h', dim: D(0, 1, -1), factor: LB / 3600, exact: true },

  /* data ------------------------------------------------------------------------ */
  { name: 'bit', symbol: 'bit', dim: D(0, 0, 0, 0, 0, 0, 0, 0, 1), factor: 1, exact: true, aliases: ['b'],
    prefix: 'both', show: ['k', 'M', 'G', 'T'], only: ['k', 'M', 'G', 'T', 'P', 'E'] },
  { name: 'byte', symbol: 'B', dim: D(0, 0, 0, 0, 0, 0, 0, 0, 1), factor: 8, exact: true, aliases: ['byte'],
    prefix: 'both', show: ['k', 'M', 'G', 'T', 'Ki', 'Mi', 'Gi', 'Ti'], only: ['k', 'M', 'G', 'T', 'P', 'E'] },

  /* data rate -------------------------------------------------------------------- */
  { name: 'bit per second', symbol: 'bit/s', dim: D(0, 0, -1, 0, 0, 0, 0, 0, 1), factor: 1, exact: true, aliases: ['bps'],
    prefix: 'si', show: ['k', 'M', 'G'], only: ['k', 'M', 'G', 'T'] },
  { name: 'byte per second', symbol: 'B/s', dim: D(0, 0, -1, 0, 0, 0, 0, 0, 1), factor: 8, exact: true,
    prefix: 'si', show: ['k', 'M', 'G'], only: ['k', 'M', 'G', 'T'] },

  /* fuel economy ------------------------------------------------------------------ */
  { name: 'mile per US gallon', symbol: 'mpg', dim: D(-2), factor: 5280 * FT / GAL_US, exact: true, group: 'US' },
  { name: 'mile per imperial gallon', symbol: 'mpg imp', dim: D(-2), factor: 5280 * FT / GAL_IMP, exact: true, group: 'imperial' },
  { name: 'kilometre per litre', symbol: 'km/L', dim: D(-2), factor: 1e6, exact: true },
  { name: 'litre per 100 km', symbol: 'L/100km', dim: D(-2), factor: 1e8, reciprocal: true, exact: true },

  /* amount, electricity, magnetism -------------------------------------------------- */
  { name: 'mole', symbol: 'mol', dim: D(0, 0, 0, 0, 0, 1), factor: 1, exact: true,
    prefix: 'si', show: ['m', 'µ'], only: ['k', 'm', 'µ', 'n', 'p'] },
  { name: 'coulomb', symbol: 'C', dim: D(0, 0, 1, 1), factor: 1, exact: true,
    prefix: 'si', show: ['m', 'µ'], only: ['k', 'm', 'µ', 'n', 'p'] },
  { name: 'ampere-hour', symbol: 'Ah', dim: D(0, 0, 1, 1), factor: 3600, exact: true,
    prefix: 'si', show: ['m'], only: ['m', 'k'] },
  { name: 'elementary charge', symbol: 'e', dim: D(0, 0, 1, 1), factor: 1.602176634e-19, exact: true, group: 'physics' },
  { name: 'ampere', symbol: 'A', dim: D(0, 0, 0, 1), factor: 1, exact: true, aliases: ['amp'],
    prefix: 'si', show: ['k', 'm', 'µ'], only: ['k', 'M', 'm', 'µ', 'n'] },
  { name: 'volt', symbol: 'V', dim: D(2, 1, -3, -1), factor: 1, exact: true,
    prefix: 'si', show: ['k', 'm', 'M', 'µ'], only: ['k', 'M', 'm', 'µ', 'n'] },
  { name: 'ohm', symbol: 'Ω', dim: D(2, 1, -3, -2), factor: 1, exact: true, aliases: ['ohm'],
    prefix: 'si', show: ['k', 'M', 'm'], only: ['k', 'M', 'G', 'm', 'µ'] },
  { name: 'siemens', symbol: 'S', dim: D(-2, -1, 3, 2), factor: 1, exact: true, aliases: ['mho'],
    prefix: 'si', show: ['m', 'µ'], only: ['k', 'm', 'µ', 'n'] },
  { name: 'farad', symbol: 'F', dim: D(-2, -1, 4, 2), factor: 1, exact: true,
    prefix: 'si', show: ['m', 'µ', 'n', 'p'], only: ['m', 'µ', 'n', 'p', 'f'] },
  { name: 'henry', symbol: 'H', dim: D(2, 1, -2, -2), factor: 1, exact: true,
    prefix: 'si', show: ['m', 'µ', 'n'], only: ['m', 'µ', 'n', 'p'] },
  { name: 'weber', symbol: 'Wb', dim: D(2, 1, -2, -1), factor: 1, exact: true,
    prefix: 'si', show: ['m'], only: ['m', 'µ'] },
  { name: 'maxwell', symbol: 'Mx', dim: D(2, 1, -2, -1), factor: 1e-8, exact: true },
  { name: 'tesla', symbol: 'T', dim: D(0, 1, -2, -1), factor: 1, exact: true,
    prefix: 'si', show: ['m', 'µ', 'n'], only: ['m', 'µ', 'n'] },
  { name: 'gauss', symbol: 'G', dim: D(0, 1, -2, -1), factor: 1e-4, exact: true },
  { name: 'ampere per metre', symbol: 'A/m', dim: D(-1, 0, 0, 1), factor: 1, exact: true },
  { name: 'oersted', symbol: 'Oe', dim: D(-1, 0, 0, 1), factor: 1000 / (4 * Math.PI), exact: true },

  /* light -------------------------------------------------------------------------- */
  { name: 'candela', symbol: 'cd', dim: D(0, 0, 0, 0, 0, 0, 1), factor: 1, exact: true },
  { name: 'candlepower', symbol: 'cp', dim: D(0, 0, 0, 0, 0, 0, 1), factor: 0.981, group: 'historical' },
  { name: 'lumen', symbol: 'lm', dim: D(0, 0, 0, 0, 0, 0, 1, 2), factor: 1, exact: true },
  { name: 'lux', symbol: 'lx', dim: D(-2, 0, 0, 0, 0, 0, 1, 2), factor: 1, exact: true,
    prefix: 'si', show: ['k'], only: ['k', 'm'] },
  { name: 'foot-candle', symbol: 'fc', dim: D(-2, 0, 0, 0, 0, 0, 1, 2), factor: 1 / FT ** 2, exact: true },
  { name: 'candela per square metre', symbol: 'cd/m²', dim: D(-2, 0, 0, 0, 0, 0, 1), factor: 1, exact: true, aliases: ['nit'] },
  { name: 'foot-lambert', symbol: 'fL', dim: D(-2, 0, 0, 0, 0, 0, 1), factor: 1 / (Math.PI * FT ** 2), exact: true },
  { name: 'stilb', symbol: 'sb', dim: D(-2, 0, 0, 0, 0, 0, 1), factor: 1e4, exact: true },

  /* dose ---------------------------------------------------------------------------- */
  { name: 'gray', symbol: 'Gy', dim: D(2, 0, -2), factor: 1, exact: true,
    prefix: 'si', show: ['m'], only: ['m', 'µ', 'k'] },
    // Spelled out: a bare rad belongs to the radian, which is asked for far more.
  { name: 'radiation absorbed dose', symbol: 'rd', dim: D(2, 0, -2), factor: 0.01, exact: true, group: 'absorbed' },
  { name: 'sievert', symbol: 'Sv', dim: D(2, 0, -2), factor: 1, exact: true, group: 'equivalent',
    prefix: 'si', show: ['m', 'µ'], only: ['m', 'µ'] },
  { name: 'rem', symbol: 'rem', dim: D(2, 0, -2), factor: 0.01, exact: true, group: 'equivalent' },

  /* viscosity and heat ---------------------------------------------------------------- */
  { name: 'pascal second', symbol: 'Pa·s', dim: D(-1, 1, -1), factor: 1, exact: true },
  { name: 'poise', symbol: 'P', dim: D(-1, 1, -1), factor: 0.1, exact: true,
    prefix: 'si', show: ['c'], only: ['c', 'm'] },
  { name: 'square metre per second', symbol: 'm²/s', dim: D(2, 0, -1), factor: 1, exact: true },
  { name: 'stokes', symbol: 'St', dim: D(2, 0, -1), factor: 1e-4, exact: true,
    prefix: 'si', show: ['c'], only: ['c', 'm'] },
  { name: 'watt per metre kelvin', symbol: 'W/(m·K)', dim: D(1, 1, -3, 0, -1), factor: 1, exact: true },
  { name: 'BTU per hour foot fahrenheit', symbol: 'BTU/(h·ft·°F)', dim: D(1, 1, -3, 0, -1), factor: 1055.05585262 / (3600 * FT * (5 / 9)) },
  { name: 'joule per kilogram kelvin', symbol: 'J/(kg·K)', dim: D(2, 0, -2, 0, -1), factor: 1, exact: true },
  { name: 'BTU per pound fahrenheit', symbol: 'BTU/(lb·°F)', dim: D(2, 0, -2, 0, -1), factor: 4186.8, exact: true },
  { name: 'calorie per gram celsius', symbol: 'cal/(g·°C)', dim: D(2, 0, -2, 0, -1), factor: 4184, exact: true },
];

/* -------------------------------------------------------------- prefixes -- */

type Prefix = readonly [symbol: string, name: string, factor: number];

const SI: Prefix[] = [
  ['Q', 'quetta', 1e30], ['R', 'ronna', 1e27], ['Y', 'yotta', 1e24], ['Z', 'zetta', 1e21],
  ['E', 'exa', 1e18], ['P', 'peta', 1e15], ['T', 'tera', 1e12], ['G', 'giga', 1e9],
  ['M', 'mega', 1e6], ['k', 'kilo', 1e3], ['h', 'hecto', 1e2], ['da', 'deca', 1e1],
  ['d', 'deci', 1e-1], ['c', 'centi', 1e-2], ['m', 'milli', 1e-3], ['µ', 'micro', 1e-6],
  ['n', 'nano', 1e-9], ['p', 'pico', 1e-12], ['f', 'femto', 1e-15], ['a', 'atto', 1e-18],
  ['z', 'zepto', 1e-21], ['y', 'yocto', 1e-24], ['r', 'ronto', 1e-27], ['q', 'quecto', 1e-30],
];

const BINARY: Prefix[] = [
  ['Ki', 'kibi', 1024], ['Mi', 'mebi', 1024 ** 2], ['Gi', 'gibi', 1024 ** 3],
  ['Ti', 'tebi', 1024 ** 4], ['Pi', 'pebi', 1024 ** 5], ['Ei', 'exbi', 1024 ** 6],
];

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function build(def: Def, symbol: string, name: string, mult: number, listed: boolean, extra: string[]): Unit {
  return {
    id: slug(name),
    name,
    symbol,
    dim: def.dim,
    factor: def.factor * mult,
    offset: def.offset ?? 0,
    reciprocal: def.reciprocal ?? false,
    exact: def.exact ?? false,
    aliases: extra,
    group: def.group,
    listed,
  };
}

/** The unprefixed unit, then every prefixed form. Only the first is explicit. */
function expand(def: Def): Unit[] {
  const own = [...(def.aliases ?? []), ...(def.alt ? [def.alt] : [])];
  const out: Unit[] = [build(def, def.symbol, def.name, 1, true, own)];

  if (!def.prefix) return out;
  const tables: Prefix[] = [];
  if (def.prefix === 'si' || def.prefix === 'both') tables.push(...SI);
  if (def.prefix === 'binary' || def.prefix === 'both') tables.push(...BINARY);

  for (const [sym, pre, mult] of tables) {
    const binary = BINARY.some((p) => p[0] === sym);
    if (!binary && def.only && !def.only.includes(sym)) continue;

    const extra: string[] = [];
    if (def.alt) extra.push(pre + def.alt);
    // Micro is typed as u far more often than as the Greek letter.
    if (sym === 'µ') extra.push('u' + def.symbol, 'micro' + def.name);
    out.push(build(def, sym + def.symbol, pre + def.name, mult, (def.show ?? []).includes(sym), extra));
  }
  return out;
}

const primary: Unit[] = [];
const derived: Unit[] = [];
for (const def of DEFS) {
  const [first, ...rest] = expand(def);
  primary.push(first!);
  derived.push(...rest);
}

/** Every unit, explicit ones first. */
export const UNITS: Unit[] = [...primary, ...derived];

/* ---------------------------------------------------------------- lookup -- */

const EXACT = new Map<string, Unit[]>();
const LOOSE = new Map<string, Unit[]>();

const push = (map: Map<string, Unit[]>, key: string, unit: Unit): void => {
  const list = map.get(key);
  if (list) list.push(unit);
  else map.set(key, [unit]);
};

/**
 * Generated units yield to explicit ones. Without that, `dB` would resolve to
 * a decibyte and `Pa` could be shadowed by a prefixed are.
 */
function index(unit: Unit, yielding: boolean): void {
  // Deduplicated: plenty of units are their own symbol — slug, erg, rod — and
  // indexing those twice made them look ambiguous to themselves.
  for (const key of new Set([unit.symbol, unit.name, ...unit.aliases])) {
    if (!key) continue;
    const low = key.toLowerCase();
    if (yielding && (EXACT.has(key) || LOOSE.has(low))) continue;
    push(EXACT, key, unit);
    push(LOOSE, low, unit);
  }
}

for (const unit of primary) index(unit, false);
for (const unit of derived) index(unit, true);

/** Every unit matching a token. More than one means the token is ambiguous. */
export function findUnit(token: string): Unit[] {
  const text = token.trim();
  if (!text) return [];

  const hit = EXACT.get(text) ?? LOOSE.get(text.toLowerCase());
  if (hit) return hit;

  // Plurals, but only where the singular exists — otherwise gauss loses its s.
  const low = text.toLowerCase();
  for (const cut of [1, 2]) {
    const stem = low.slice(0, -cut);
    if ((cut === 1 ? low.endsWith('s') : low.endsWith('es')) && LOOSE.has(stem)) {
      return LOOSE.get(stem)!;
    }
  }
  return [];
}

/**
 * Every token that resolves to more than one unit. Genuine ambiguity is a fact
 * about units, not a defect — a ton is three different masses — so the tool
 * offers the choice rather than picking. This exists to keep that set visible
 * and deliberate instead of accidental.
 */
export function ambiguities(): Array<{ key: string; units: Unit[] }> {
  const out: Array<{ key: string; units: Unit[] }> = [];
  for (const [key, units] of EXACT) if (units.length > 1) out.push({ key, units });
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Listed units sharing a dimension.
 *
 * Table order would put every generated prefix after every explicit unit,
 * stranding kilometre below furlong, so the default is largest first. Given a
 * unit to sit near, they are ordered by how far each is from it instead —
 * asking about kilometres should not lead with parsecs.
 *
 * The ranking uses the units' own scales rather than the converted values, so
 * the column does not reshuffle while a number is being typed.
 */
export function unitsFor(dim: Dim, near?: Measure & { group?: string }): Unit[] {
  let list = UNITS.filter((u) => u.listed && sameDim(u.dim, dim));

  // An absolute temperature and a temperature interval share a dimension but
  // not a meaning: -40 °C is not 233.15 degrees of difference. Both are still
  // convertible on request; they are simply never listed side by side.
  if (near && list.some((u) => u.group === 'interval')) {
    const wanted = near.group === 'interval';
    list = list.filter((u) => (u.group === 'interval') === wanted);
  }

  if (!near) {
    return list.sort((a, b) => Number(a.reciprocal) - Number(b.reciprocal) || b.factor - a.factor);
  }

  // Delisle runs backwards and fuel consumption inverts, so distance is taken
  // on the magnitude of the factor.
  const anchor = Math.abs(near.factor) || 1;
  const distance = (u: Unit): number => Math.abs(Math.log(Math.abs(u.factor) / anchor));
  return list.sort((a, b) =>
    Number(a.reciprocal) - Number(b.reciprocal) || distance(a) - distance(b) || b.factor - a.factor);
}

/** Quantities with at least two units to convert between. */
export function pickableQuantities(): Quantity[] {
  return QUANTITIES.filter((q) => unitsFor(q.dim).length > 1);
}

/* ------------------------------------------------------ compound parsing -- */

const SUP_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

export function superscript(n: number): string {
  const body = [...Math.abs(n).toString()].map((c) => SUP_DIGITS[Number(c)] ?? c).join('');
  return (n < 0 ? '⁻' : '') + body;
}

export type Parsed =
  | { ok: true; measure: Measure; unit: Unit | null; label: string }
  | { ok: false; reason: string; options: Unit[] };

const OPERATORS = '*·⋅×/()^';

function tokenize(src: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (const ch of src) {
    if (/\s/.test(ch)) {
      if (buf) { out.push(buf); buf = ''; }
      continue;
    }
    if (OPERATORS.includes(ch)) {
      if (buf) { out.push(buf); buf = ''; }
      out.push('·⋅×'.includes(ch) ? '*' : ch);
      continue;
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

/** Splits a trailing exponent off a token: m² is m^2, s2 is s^2. */
function peel(token: string): { base: string; exp: number } {
  const sup = /^(.*?)(⁻?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/.exec(token);
  if (sup) {
    const digits = sup[2]!;
    const neg = digits.startsWith('⁻');
    const n = Number([...digits.replace('⁻', '')].map((c) => SUP_DIGITS.indexOf(c)).join(''));
    return { base: sup[1]!, exp: neg ? -n : n };
  }
  // Plain trailing digits, but only where they are not part of the unit itself.
  const plain = /^(.+?)(-?\d+)$/.exec(token);
  if (plain && findUnit(plain[1]!).length > 0) return { base: plain[1]!, exp: Number(plain[2]) };
  return { base: token, exp: 1 };
}

class Composer {
  private at = 0;
  private readonly tokens: string[];

  // Written out rather than declared as a parameter property: Node strips
  // types without transforming, so `constructor(private x)` will not run.
  constructor(tokens: string[]) {
    this.tokens = tokens;
  }

  private peek(): string | undefined { return this.tokens[this.at]; }
  private next(): string | undefined { return this.tokens[this.at++]; }
  get done(): boolean { return this.at >= this.tokens.length; }

  expr(): Measure {
    let out = this.term();
    for (;;) {
      const op = this.peek();
      if (op !== '*' && op !== '/') break;
      this.at += 1;
      const rhs = this.term();
      out = {
        dim: combine(out.dim, rhs.dim, op === '*' ? 1 : -1),
        factor: op === '*' ? out.factor * rhs.factor : out.factor / rhs.factor,
        offset: 0,
        reciprocal: false,
        exact: out.exact && rhs.exact,
      };
    }
    return out;
  }

  private term(): Measure {
    const base = this.atom();
    let exp = 1;
    if (this.peek() === '^') {
      this.at += 1;
      const n = Number(this.next());
      if (!Number.isFinite(n)) throw new Error('an exponent is missing after ^');
      exp = n;
    }
    if (exp === 1) return base;
    return {
      dim: scaleDim(base.dim, exp),
      factor: base.factor ** exp,
      offset: 0,
      reciprocal: false,
      exact: base.exact,
    };
  }

  private atom(): Measure {
    const token = this.next();
    if (token === undefined) throw new Error('the expression ends early');

    if (token === '(') {
      const inner = this.expr();
      if (this.next() !== ')') throw new Error('a bracket is unclosed');
      return inner;
    }

    // Numeric coefficients, so 1/100km and L/100km both read.
    if (/^-?\d+(\.\d+)?$/.test(token)) {
      return { dim: D(), factor: Number(token), offset: 0, reciprocal: false, exact: true };
    }

    const whole = findUnit(token);
    const hit = whole[0] ?? findUnit(peel(token).base)[0];
    if (!hit) throw new Error(`${token} is not a unit I know`);

    const exp = whole[0] ? 1 : peel(token).exp;
    if (hit.reciprocal) throw new Error(`${hit.name} cannot be part of a compound`);
    // A temperature inside a compound is an interval, so the offset is dropped:
    // °C/W is thermal resistance, not an absolute temperature per watt.
    return {
      dim: exp === 1 ? hit.dim : scaleDim(hit.dim, exp),
      factor: hit.factor ** exp,
      offset: 0,
      reciprocal: false,
      exact: hit.exact,
    };
  }
}

/** Resolves unit text: a single named unit where possible, else a compound. */
export function parseUnit(text: string): Parsed {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: 'no unit given', options: [] };

  const direct = findUnit(trimmed);
  if (direct.length === 1) {
    return { ok: true, measure: direct[0]!, unit: direct[0]!, label: direct[0]!.symbol };
  }
  if (direct.length > 1) {
    return { ok: false, reason: `${trimmed} could mean more than one unit`, options: direct };
  }

  try {
    const composer = new Composer(tokenize(trimmed));
    const measure = composer.expr();
    if (!composer.done) throw new Error('there is trailing text');
    return { ok: true, measure, unit: null, label: trimmed };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unreadable', options: [] };
  }
}

/* ------------------------------------------------------------ conversion -- */

export const toBase = (value: number, m: Measure): number =>
  m.reciprocal ? m.factor / value : value * m.factor + m.offset;

export const fromBase = (base: number, m: Measure): number =>
  m.reciprocal ? m.factor / base : (base - m.offset) / m.factor;

export interface Result {
  value: number;
  /** Both ends are defined exactly, so the answer is a definition not an estimate. */
  exact: boolean;
  /** Crossed the angle slot by treating one revolution as one cycle. */
  bridged: boolean;
}

/**
 * Converts between two measures, or returns null when their dimensions differ.
 *
 * The one crossing allowed is the angle slot: rpm is an angular velocity and Hz
 * is a frequency, and refusing to relate them would be pedantically correct and
 * useless. One revolution is taken as one cycle, and the result says so.
 */
export function convert(value: number, from: Measure, to: Measure): Result | null {
  let base = toBase(value, from);
  let bridged = false;

  if (!sameDim(from.dim, to.dim)) {
    const diff = combine(from.dim, to.dim, -1);
    const onlyAngle = diff.every((n, i) => i === ANGLE_SLOT || n === 0);
    const steps = diff[ANGLE_SLOT]!;
    if (!onlyAngle || Math.abs(steps) !== 1) return null;
    base = steps === 1 ? base / TAU : base * TAU;
    bridged = true;
  }

  return { value: fromBase(base, to), exact: from.exact && to.exact && !bridged, bridged };
}

/* ----------------------------------------------------------- input parse -- */

export interface Input {
  value: number;
  from: string;
  to: string | null;
}

/**
 * Word separators, checked last-first so `3 ft 6 in to m` cuts at `to` and not
 * at the inches. Arrow forms are rewritten to ` to ` before the scan, since
 * otherwise the `>` in `->` wins on position and leaves a dash behind.
 */
const SEPARATORS = [' to ', ' into ', ' in ', ' as ', '>'];
const ARROWS = /\s*(?:->|=>|→|⇒)\s*/g;

/**
 * Reads `12 km`, `12km`, `60 mph in m/s`, `3 ft 6 in to cm`, `-40 c to f`.
 *
 * A bare unit is taken as one of it. Commas and spaces inside a number are
 * thousands separators; a full stop is the decimal point. No attempt is made at
 * comma-decimal input — `1,5` is fifteen, and guessing would be worse.
 */
export function parseInput(text: string): Input | null {
  const src = text.trim().replace(ARROWS, ' to ');
  if (!src) return null;

  let left = src;
  let right: string | null = null;
  let cut = -1;
  let sep = '';
  for (const candidate of SEPARATORS) {
    const at = src.toLowerCase().lastIndexOf(candidate);
    if (at > 0 && at + candidate.length < src.length && at > cut) {
      cut = at;
      sep = candidate;
    }
  }
  if (cut > 0) {
    left = src.slice(0, cut).trim();
    right = src.slice(cut + sep.length).trim();
  }

  // Mixed measures, kept to the shapes that actually occur: 3 ft 6 in.
  const mixed = /^(-?[\d., ]*\d)\s*([a-zA-Z'"]+)\s+([\d., ]*\d)\s*([a-zA-Z'"]+)$/.exec(left);
  if (mixed) {
    const a = findUnit(mixed[2]!)[0];
    const b = findUnit(mixed[4]!)[0];
    if (a && b && sameDim(a.dim, b.dim) && !a.offset && !b.offset) {
      const total = toBase(number(mixed[1]!), a) + toBase(number(mixed[3]!), b);
      return { value: fromBase(total, a), from: mixed[2]!, to: right };
    }
  }

  const single = /^([-+]?[\d., ]*\d(?:[eE][-+]?\d+)?)\s*(.*)$/.exec(left);
  if (!single) return { value: 1, from: left, to: right };

  const unit = single[2]!.trim();
  return { value: number(single[1]!), from: unit || left, to: right };
}

const number = (text: string): number => Number(text.replace(/[, ]/g, ''));

/* ---------------------------------------------------------------- resolve -- */

export interface Resolved {
  value: number;
  source: Measure | null;
  sourceLabel: string;
  sourceUnit: Unit | null;
  target: Measure | null;
  targetLabel: string | null;
  targetUnit: Unit | null;
  result: Result | null;
  error: string | null;
  /** Candidates when a token is ambiguous, so the UI can offer a choice. */
  options: Unit[];
}

const EMPTY: Resolved = {
  value: 1, source: null, sourceLabel: '', sourceUnit: null,
  target: null, targetLabel: null, targetUnit: null,
  result: null, error: null, options: [],
};

/**
 * One line of text to a finished answer. The single entry point the interface
 * and the reference test both go through, so neither can drift from the other.
 */
export function resolve(text: string): Resolved {
  const input = parseInput(text);
  if (!input) return { ...EMPTY };

  const from = parseUnit(input.from);
  if (!from.ok) {
    return { ...EMPTY, value: input.value, sourceLabel: input.from, error: from.reason, options: from.options };
  }

  const out: Resolved = {
    ...EMPTY,
    value: input.value,
    source: from.measure,
    sourceLabel: from.label,
    sourceUnit: from.unit,
  };

  if (!input.to) return out;

  const to = parseUnit(input.to);
  if (!to.ok) return { ...out, targetLabel: input.to, error: to.reason, options: to.options };

  const result = convert(input.value, from.measure, to.measure);
  if (!result) {
    return {
      ...out,
      target: to.measure,
      targetLabel: to.label,
      targetUnit: to.unit,
      error: `${quantityName(from.measure.dim)} does not convert to ${quantityName(to.measure.dim)}`,
    };
  }

  return { ...out, target: to.measure, targetLabel: to.label, targetUnit: to.unit, result };
}

/* ------------------------------------------------------------- formatting -- */

const THIN = ' ';

const trimZeros = (text: string): string =>
  text.includes('.') ? text.replace(/\.?0+$/, '') : text;

/** Thin spaces every three digits, but only once the number is long enough. */
function groupDigits(text: string): string {
  const [whole = '', fraction] = text.split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = sign ? whole.slice(1) : whole;
  const grouped = digits.length > 4
    ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, THIN)
    : digits;
  return sign + grouped + (fraction ? '.' + fraction : '');
}

/**
 * A converter that answers 7.4564543068480075 has not answered. Eight
 * significant figures, trailing zeros dropped, and anything beyond the range a
 * person reads comfortably goes to a power of ten.
 */
export function format(n: number, sig = 8): string {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';

  const abs = Math.abs(n);
  if (abs >= 1e15 || abs < 1e-6) {
    const [mantissa = '', exponent = '0'] = n.toExponential(Math.min(sig, 10) - 1).split('e');
    return `${trimZeros(mantissa)}${THIN}×${THIN}10${superscript(Number(exponent))}`;
  }

  // Not toPrecision: it flips to exponential as soon as the exponent reaches
  // the precision, so 1073741824 at 9 figures came back as 1.07374182e+9.
  // Integer digits are never dropped — significance only trims the fraction.
  const whole = Math.floor(Math.log10(abs)) + 1;
  const decimals = Math.min(20, Math.max(0, sig - whole));
  return groupDigits(trimZeros(n.toFixed(decimals)));
}
