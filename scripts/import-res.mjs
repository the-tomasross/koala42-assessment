import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

// State survives chunk boundaries, including escaped quotes and embedded newlines.
export async function* parseCsv(chunks) {
  let row = [], field = '', state = 'plain', cr = false;
  for await (const chunk of chunks) {
    for (const char of chunk) {
      if (cr) { cr = false; if (char === '\n') continue; }
      if (state === 'quoted') {
        if (char === '"') state = 'closed';
        else field += char;
        continue;
      }
      if (state === 'closed' && char === '"') { field += '"'; state = 'quoted'; continue; }
      if (char === ',' || char === '\n' || char === '\r') {
        row.push(field); field = ''; state = 'plain';
        if (char !== ',') { yield row; row = []; cr = char === '\r'; }
      } else if (char === '"' && state === 'plain' && field === '') state = 'quoted';
      else {
        if (state === 'closed' || char === '"') throw new Error('Invalid CSV quoting');
        field += char;
      }
    }
  }
  if (state === 'quoted') throw new Error('Unclosed CSV quote');
  if (field || row.length || state === 'closed') { row.push(field); yield row; }
}

export function companyAddress(r) {
  if (r.TEXTADR) return r.TEXTADR;
  const house = r.CDOM ? `${r.TYPCDOM === '2' ? 'č. ev. ' : ''}${r.CDOM}${r.COR ? '/' + r.COR : ''}` : '';
  const postal = (r.PSC || '').replace(/^(\d{3})(\d{2})$/, '$1 $2');
  return [[r.ULICE_TEXT, house].filter(Boolean).join(' '),
    r.COBCE_TEXT !== r.OBEC_TEXT ? r.COBCE_TEXT : '',
    [postal, r.OBEC_TEXT].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

// Ordering key: leading quotes and symbols are dropped, so `"CEDR", spol. s r.o.`
// sorts under C. Names starting with a digit go after all letters (prefix 1).
// Diacritics are folded so Č sorts with C.
export function sortKey(name) {
  const folded = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '');
  return (/^\p{L}/u.test(folded) ? '0' : '1') + folded;
}

export async function importRes(csv, out = 'data/companies.db') {
  const started = Date.now(), tmp = `${out}.tmp`;
  await mkdir(dirname(out), { recursive: true });
  await rm(tmp, { force: true });
  let db, read = 0, kept = 0, active = 0, sourceDate = '';
  try {
    db = new Database(tmp);
    db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
      CREATE TABLE company(ico TEXT PRIMARY KEY, name TEXT, form TEXT, size TEXT, nace TEXT,
        district TEXT, region TEXT, municipality TEXT, address TEXT, founded TEXT, dissolved TEXT,
        sort_key TEXT, size_rank INTEGER);
      CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
      BEGIN;`);
    const insert = db.prepare('INSERT INTO company VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    let headers;
    for await (const values of parseCsv(createReadStream(csv, { encoding: 'utf8' }))) {
      if (!headers) {
        headers = values.map(v => v.replace(/^\uFEFF/, ''));
        for (const key of ['ICO', 'FIRMA', 'FORMA', 'DATPLAT', 'OKRESLAU']) {
          if (!headers.includes(key)) throw new Error(`Missing column ${key}`);
        }
        continue;
      }
      if (values.length === 1 && values[0] === '') continue;
      if (values.length !== headers.length) throw new Error(`Invalid column count at row ${read + 2}`);
      read++;
      const r = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
      if (r.DATPLAT > sourceDate) sourceDate = r.DATPLAT;
      if (!['111', '112', '113', '121', '205'].includes(r.FORMA)) continue;
      insert.run(r.ICO, r.FIRMA, r.FORMA, r.KATPO || '000', r.NACE || '', r.OKRESLAU,
        r.OKRESLAU.slice(0, 5), r.OBEC_TEXT || '', companyAddress(r), r.DDATVZN || '', r.DDATZAN || null,
        sortKey(r.FIRMA), r.KATPO && r.KATPO !== '000' ? Number(r.KATPO) : -1);
      kept++; if (!r.DDATZAN) active++;
    }
    if (!headers) throw new Error('Empty CSV');
    const meta = db.prepare('INSERT INTO meta VALUES (?, ?)');
    for (const [key, value] of Object.entries({ source_date: sourceDate, imported_at: new Date().toISOString(), row_count: String(kept) })) meta.run(key, value);
    db.exec(`COMMIT;
      CREATE INDEX company_region_size ON company(dissolved, region, size);
      CREATE INDEX company_district_size ON company(dissolved, district, size);
      CREATE INDEX company_size ON company(dissolved, size);
      CREATE INDEX company_sort ON company(sort_key, ico);
      CREATE INDEX company_default_sort ON company(dissolved, size_rank DESC, sort_key, ico);
      CREATE INDEX company_founded_sort ON company(dissolved, founded DESC, ico);
      CREATE VIRTUAL TABLE company_fts USING fts5(name, content='company', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
      INSERT INTO company_fts(company_fts) VALUES ('rebuild');
      ANALYZE; VACUUM;`);
    db.close(); db = null;
    await rename(tmp, out);
    console.log(`Rows read: ${read}; companies kept: ${kept}; active: ${active}; elapsed: ${((Date.now() - started) / 1000).toFixed(2)} s; file size: ${(await stat(out)).size} bytes`);
  } catch (error) {
    if (db) db.close();
    await rm(tmp, { force: true });
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) { console.error('Usage: node scripts/import-res.mjs <csv> [out]'); process.exitCode = 1; }
  else await importRes(process.argv[2], process.argv[3]);
}
