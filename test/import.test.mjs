import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { parseCsv, companyAddress, sortKey } from '../scripts/import-res.mjs';

test('sample import has complete coverage, dates, metadata and accent insensitive FTS', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'res-test-'));
  const out = join(dir, 'companies.db');
  let db;
  try {
    execFileSync(process.execPath, ['scripts/import-res.mjs', 'data/sample/res_sample.csv', out]);
    db = new Database(out, { readonly: true });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM company').get().n, 1600);
    assert.deepEqual(db.prepare('SELECT DISTINCT form FROM company ORDER BY form').all().map(r => r.form), ['111', '112', '113', '121', '205']);
    const dissolved = db.prepare('SELECT dissolved FROM company WHERE dissolved IS NOT NULL').all();
    assert.equal(dissolved.length, 100);
    assert.ok(dissolved.every(r => /^\d{4}-?\d{2}-?\d{2}$/.test(r.dissolved)));
    assert.equal(db.prepare("SELECT value FROM meta WHERE key='row_count'").get().value, '1600');
    const accented = db.prepare('SELECT name FROM company').all().find(r => /[áčďéěíňóřšťúůýž]/i.test(r.name));
    assert.ok(accented);
    const query = accented.name.normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu).map(t => `"${t}"`).join(' AND ');
    assert.ok(db.prepare('SELECT rowid FROM company_fts WHERE company_fts MATCH ?').all(query).length);
    db.close(); db = null;
    const before = await readFile(out);
    await writeFile(join(dir, 'bad.csv'), 'ICO,FIRMA,FORMA,DATPLAT,OKRESLAU\n"unclosed');
    assert.throws(() => execFileSync(process.execPath, ['scripts/import-res.mjs', join(dir, 'bad.csv'), out], { stdio: 'pipe' }));
    assert.deepEqual(await readFile(out), before);
  } finally { db?.close(); await rm(dir, { recursive: true, force: true }); }
});
test('CSV handles chunk boundaries, escaped quotes, embedded newlines and CRLF', async () => {
  const input = 'a,b\r\n"x,""y""\nz",é\r\n';
  const rows = []; for await (const row of parseCsv([...input])) rows.push(row);
  assert.deepEqual(rows, [['a', 'b'], ['x,"y"\nz', 'é']]);
});
test('fallback addresses preserve street, house type, district and postal formatting', () => {
  assert.equal(companyAddress({ ULICE_TEXT: 'Masarykovo náměstí', CDOM: '1484', COBCE_TEXT: 'Zelené Předměstí (Pardubice I)', OBEC_TEXT: 'Pardubice', PSC: '53002' }), 'Masarykovo náměstí 1484, Zelené Předměstí (Pardubice I), 530 02 Pardubice');
  assert.equal(companyAddress({ TYPCDOM: '2', CDOM: '5', COR: '7', OBEC_TEXT: 'Test', COBCE_TEXT: 'Test', PSC: '12345' }), 'č. ev. 5/7, 123 45 Test');
});

test('name sort ignores leading symbols and puts digit-led names after letters', () => {
  assert.equal(sortKey('Čáp s.r.o.'), '0cap s.r.o.');
  assert.equal(sortKey('  Žito'), '0zito');
  assert.equal(sortKey('123 Test'), '1123 test');
  assert.equal(sortKey('"CEDR"'), '0cedr"');
  assert.equal(sortKey('&rewa'), '0rewa');
  assert.equal(sortKey('!!!'), '1');
  assert.deepEqual(['123 Test', '&rewa', 'Čáp', 'Adam'].sort((a, b) => sortKey(a).localeCompare(sortKey(b))), ['Adam', 'Čáp', '&rewa', '123 Test']);
});
