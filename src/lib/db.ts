import Database from 'better-sqlite3';
import { companyStatus, type CompanyStatus } from './status.ts';
import { regions, districts, sizeBands } from './codelists.ts';

export interface Company {
  status: CompanyStatus; size_rank: number; sort_key: string;
  ico: string; name: string; form: string; size: string; nace: string; district: string;
  region: string; municipality: string; address: string; founded: string; dissolved: string | null;
}
const db = new Database(process.env.DB_PATH ?? 'data/companies.db', { readonly: true, fileMustExist: true });
export const sorts = { name: 'Name (A to Z)', size: 'Employees (largest first)', founded: 'Founded (newest first)' } as const;
export type Sort = keyof typeof sorts;
export function normalizeSort(value: string): Sort { return Object.hasOwn(sorts, value) ? value as Sort : 'size'; }
interface Search { sort?: string; q?: string; region?: string; district?: string; size?: string; includeDissolved?: boolean; page?: number; perPage?: number }
const known = (map: object, key: string) => Object.hasOwn(map, key);
export const MAX_PAGES = 200;
export function searchCompanies({ q = '', region = '', district = '', size = '', includeDissolved = false, sort = 'size', page = 1, perPage = 25 }: Search = {}) {
  const where: string[] = [], params: (string | number)[] = [];
  if (!includeDissolved) where.push('dissolved IS NULL');
  if (!known(districts, district)) district = '';
  if (!known(regions, region)) region = '';
  if (region && district && !district.startsWith(region)) district = '';
  for (const [column, value] of [['region', region], ['district', district]]) {
    if (value) { where.push(`${column} = ?`); params.push(value); }
  }
  if (known(sizeBands, size)) {
    const codes = sizeBands[size].codes;
    where.push(`size IN (${codes.map(() => '?').join(',')})`); params.push(...codes);
  }
  q = q.trim().slice(0, 500);
  if (/^\d{8}$/.test(q)) { where.push('ico = ?'); params.push(q); }
  else if (q) {
    const tokens = q.match(/[\p{L}\p{N}\p{M}]+/gu) || [];
    if (!tokens.length) where.push('0');
    // Prefix matching only from two characters: `s*` expands to most of the index.
    else { where.push('rowid IN (SELECT rowid FROM company_fts WHERE company_fts MATCH ?)'); params.push(tokens.map(t => `"${t.replaceAll('"', '""')}"${t.length > 1 ? '*' : ''}`).join(' AND ')); }
  }
  const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM company' + clause).get(...params) as { total: number };
  perPage = Number.isSafeInteger(perPage) && perPage > 0 ? Math.min(perPage, 100) : 25;
  // Deep OFFSET scans grow with the page number; nobody pages past 200 by hand.
  const pages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(total / perPage)));
  page = Number.isSafeInteger(page) && page > 0 ? Math.min(page, pages) : 1;
  const order = { name: 'sort_key, ico', size: 'size_rank DESC, sort_key, ico', founded: 'founded DESC, ico' }[normalizeSort(sort)];
  const rows = (db.prepare('SELECT * FROM company' + clause + ' ORDER BY ' + order + ' LIMIT ? OFFSET ?').all(...params, perPage, (page - 1) * perPage) as Company[]).map(c => ({ ...c, status: companyStatus(c) }));
  return { rows, total, page, pages, capped: total > pages * perPage };
}
export function getCompany(ico: string): Company | null {
  if (!/^\d{8}$/.test(ico)) return null;
  const company = db.prepare('SELECT * FROM company WHERE ico = ?').get(ico) as Company | undefined;
  return company ? { ...company, status: companyStatus(company) } : null;
}
export function getMeta(): Record<string, string> {
  return Object.fromEntries((db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map(r => [r.key, r.value]));
}

export function countActiveCompanies(): number {
  return (db.prepare('SELECT COUNT(*) AS total FROM company WHERE dissolved IS NULL').get() as { total: number }).total;
}
