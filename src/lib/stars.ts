/**
 * The fifty brightest stars, J2000.0.
 *
 * `ra` is right ascension in hours (0–24), `dec` declination in degrees
 * (−90 to +90), `mag` apparent visual magnitude (lower is brighter).
 *
 * These are real catalogue positions, not generated. Nothing fainter is
 * invented to fill the sky out — a sparse accurate sky is the point.
 */
export interface Star {
  name: string;
  ra: number;
  dec: number;
  mag: number;
}

export const STARS: readonly Star[] = [
  { name: 'sirius', ra: 6.7525, dec: -16.7161, mag: -1.46 },
  { name: 'canopus', ra: 6.3992, dec: -52.6957, mag: -0.74 },
  { name: 'rigil kentaurus', ra: 14.6601, dec: -60.8340, mag: -0.27 },
  { name: 'arcturus', ra: 14.2610, dec: 19.1825, mag: -0.05 },
  { name: 'vega', ra: 18.6156, dec: 38.7837, mag: 0.03 },
  { name: 'capella', ra: 5.2782, dec: 45.9980, mag: 0.08 },
  { name: 'rigel', ra: 5.2423, dec: -8.2017, mag: 0.13 },
  { name: 'procyon', ra: 7.6550, dec: 5.2250, mag: 0.34 },
  { name: 'achernar', ra: 1.6286, dec: -57.2367, mag: 0.46 },
  { name: 'betelgeuse', ra: 5.9195, dec: 7.4070, mag: 0.50 },
  { name: 'hadar', ra: 14.0637, dec: -60.3730, mag: 0.61 },
  { name: 'altair', ra: 19.8464, dec: 8.8683, mag: 0.77 },
  { name: 'acrux', ra: 12.4433, dec: -63.0991, mag: 0.77 },
  { name: 'aldebaran', ra: 4.5987, dec: 16.5093, mag: 0.85 },
  { name: 'antares', ra: 16.4901, dec: -26.4320, mag: 0.96 },
  { name: 'spica', ra: 13.4199, dec: -11.1613, mag: 0.97 },
  { name: 'pollux', ra: 7.7553, dec: 28.0262, mag: 1.14 },
  { name: 'fomalhaut', ra: 22.9608, dec: -29.6222, mag: 1.16 },
  { name: 'deneb', ra: 20.6905, dec: 45.2803, mag: 1.25 },
  { name: 'mimosa', ra: 12.7953, dec: -59.6888, mag: 1.25 },
  { name: 'regulus', ra: 10.1395, dec: 11.9672, mag: 1.35 },
  { name: 'adhara', ra: 6.9770, dec: -28.9721, mag: 1.50 },
  { name: 'castor', ra: 7.5767, dec: 31.8883, mag: 1.57 },
  { name: 'shaula', ra: 17.5601, dec: -37.1038, mag: 1.62 },
  { name: 'gacrux', ra: 12.5194, dec: -57.1133, mag: 1.63 },
  { name: 'bellatrix', ra: 5.4188, dec: 6.3497, mag: 1.64 },
  { name: 'elnath', ra: 5.4382, dec: 28.6075, mag: 1.65 },
  { name: 'miaplacidus', ra: 9.2200, dec: -69.7172, mag: 1.67 },
  { name: 'alnilam', ra: 5.6036, dec: -1.2019, mag: 1.69 },
  { name: 'alnair', ra: 22.1372, dec: -46.9610, mag: 1.74 },
  { name: 'alnitak', ra: 5.6793, dec: -1.9426, mag: 1.77 },
  { name: 'alioth', ra: 12.9005, dec: 55.9598, mag: 1.77 },
  { name: 'dubhe', ra: 11.0621, dec: 61.7511, mag: 1.79 },
  { name: 'mirfak', ra: 3.4054, dec: 49.8612, mag: 1.79 },
  { name: 'wezen', ra: 7.1399, dec: -26.3932, mag: 1.83 },
  { name: 'kaus australis', ra: 18.4029, dec: -34.3846, mag: 1.85 },
  { name: 'sargas', ra: 17.6220, dec: -42.9978, mag: 1.86 },
  { name: 'avior', ra: 8.3752, dec: -59.5095, mag: 1.86 },
  { name: 'alkaid', ra: 13.7923, dec: 49.3133, mag: 1.86 },
  { name: 'menkalinan', ra: 5.9922, dec: 44.9474, mag: 1.90 },
  { name: 'atria', ra: 16.8111, dec: -69.0277, mag: 1.91 },
  { name: 'alhena', ra: 6.6285, dec: 16.3993, mag: 1.93 },
  { name: 'peacock', ra: 20.4275, dec: -56.7351, mag: 1.94 },
  { name: 'polaris', ra: 2.5303, dec: 89.2641, mag: 1.98 },
  { name: 'mirzam', ra: 6.3783, dec: -17.9559, mag: 1.98 },
  { name: 'alphard', ra: 9.4597, dec: -8.6586, mag: 2.00 },
  { name: 'hamal', ra: 2.1195, dec: 23.4624, mag: 2.00 },
  { name: 'deneb kaitos', ra: 0.7265, dec: -17.9866, mag: 2.04 },
  { name: 'nunki', ra: 18.9211, dec: -26.2967, mag: 2.05 },
  { name: 'algieba', ra: 10.3328, dec: 19.8415, mag: 2.08 },
];
