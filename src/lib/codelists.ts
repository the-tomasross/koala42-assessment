import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function load(file: string): Record<string, string>[] {
  const input = readFileSync(resolve(process.cwd(), 'data/codelists', file), 'utf8');
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\r' || c === '\n')) {
      row.push(field); field = '';
      if (c !== ',') { rows.push(row); row = []; if (c === '\r' && input[i + 1] === '\n') i++; }
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift()!;
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i] || ''])));
}
export const regions: Record<string, string> = {
  CZ010: 'Hlavní město Praha', CZ020: 'Středočeský kraj', CZ031: 'Jihočeský kraj', CZ032: 'Plzeňský kraj',
  CZ041: 'Karlovarský kraj', CZ042: 'Ústecký kraj', CZ051: 'Liberecký kraj', CZ052: 'Královéhradecký kraj',
  CZ053: 'Pardubický kraj', CZ063: 'Kraj Vysočina', CZ064: 'Jihomoravský kraj', CZ071: 'Olomoucký kraj',
  CZ072: 'Zlínský kraj', CZ080: 'Moravskoslezský kraj',
};
export const districts = Object.fromEntries(load('okres-lau-109.csv').filter(r => r.admnepo === '9999-09-09').map(r => [r.chodnota, r.text]));
export const districtsByRegion = Object.fromEntries(Object.keys(regions).map(code => [code,
  Object.entries(districts).filter(([district]) => district.startsWith(code))]));
const sizeLabels: Record<string, string> = {
  '000': 'Not reported', '110': 'No employees', '120': '1 to 5 employees', '130': '6 to 9 employees',
  '210': '10 to 19 employees', '220': '20 to 24 employees', '230': '25 to 49 employees', '240': '50 to 99 employees',
  '310': '100 to 199 employees', '320': '200 to 249 employees', '330': '250 to 499 employees', '340': '500 to 999 employees',
  '410': '1,000 to 1,499 employees', '420': '1,500 to 1,999 employees', '430': '2,000 to 2,499 employees',
  '440': '2,500 to 2,999 employees', '450': '3,000 to 3,999 employees', '460': '4,000 to 4,999 employees',
  '470': '5,000 to 9,999 employees', '510': '10,000 or more',
};
export const sizes = Object.fromEntries(load('katpo-579.csv').map(r => [r.chodnota, sizeLabels[r.chodnota] || 'Not reported']));
export const sizeBands: Record<string, { label: string; codes: string[] }> = {
  micro: { label: '0 to 9 employees', codes: ['110', '120', '130'] },
  small: { label: '10 to 49 employees', codes: ['210', '220', '230'] },
  medium: { label: '50 to 249 employees', codes: ['240', '310', '320'] },
  large: { label: '250 or more employees', codes: Object.keys(sizes).filter(c => Number(c) >= 330) },
  unknown: { label: 'Not reported', codes: ['000'] },
};
const shortForms: Record<string, string> = { '111': 'v.o.s.', '112': 's.r.o.', '113': 'k.s.', '121': 'a.s.', '205': 'družstvo' };
export const forms = Object.fromEntries(load('forma-56.csv').filter(r => Object.hasOwn(shortForms, r.chodnota)).map(r => [r.chodnota, { short: shortForms[r.chodnota], full: r.text }]));
// RES carries NACE at different depths ("62010", but also "620"), so all levels are kept.
export const nace = Object.fromEntries(load('cz-nace-80004.csv').map(r => [r.chodnota, r.text]));
