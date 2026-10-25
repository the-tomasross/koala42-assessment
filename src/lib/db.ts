import Database from 'better-sqlite3';
import { regions, districts, sizeBands } from './codelists.ts';

export interface Company {
  ico: string; name: string; form: string; size: string; nace: string; district: string;
  region: string; municipality: string; address: string; founded: string; dissolved: string | null;
}
const db = new Database(process.env.DB_PATH ?? 'data/companies.db', { readonly: true, fileMustExist: true });
interface Search { q?: string; region?: string; district?: string; size?: string; includeDissolved?: boolean; page?: number; perPage?: number }
const known = (map: object, key: string) => Object.hasOwn(map, key);
export function searchCompanies({ q = '', region = '', district = '', size = '', includeDissolved = false, page = 1, perPage = 25 }: Search = {}) {
  const where: string[] = [], params: (string | number)[] = [];
  if (!includeDissolved) where.push('dissolved IS NULL');
  if (!known(districts, district)) district = '';
  if (!known(regions, region) || (district && !district.startsWith(region))) region = '';
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
    else { where.push('rowid IN (SELECT rowid FROM company_fts WHERE company_fts MATCH ?)'); params.push(tokens.map(t => `"${t.replaceAll('"', '""')}"*`).join(' AND ')); }
  }
  const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM company' + clause).get(...params) as { total: number };
  perPage = Number.isSafeInteger(perPage) && perPage > 0 ? Math.min(perPage, 100) : 25;
  const pages = Math.max(1, Math.ceil(total / perPage));
  page = Number.isSafeInteger(page) && page > 0 ? Math.min(page, pages) : 1;
  const rows = db.prepare('SELECT * FROM company' + clause + ' ORDER BY sort_key, ico LIMIT ? OFFSET ?').all(...params, perPage, (page - 1) * perPage) as Company[];
  return { rows, total, page, pages };
}
export function getCompany(ico: string): Company | null {
  if (!/^\d{8}$/.test(ico)) return null;
  return db.prepare('SELECT * FROM company WHERE ico = ?').get(ico) as Company | undefined ?? null;
}
export function getMeta(): Record<string, string> {
  return Object.fromEntries((db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map(r => [r.key, r.value]));
}
