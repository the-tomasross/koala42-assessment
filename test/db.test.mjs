import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';

test('queries validate filters, match names and IČO, and clamp pagination', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'query-test-'));
  try {
    process.env.DB_PATH = join(dir, 'companies.db');
    execFileSync(process.execPath, ['scripts/import-res.mjs', 'data/sample/res_sample.csv', process.env.DB_PATH]);
    const { searchCompanies, getCompany, getMeta } = await import('../src/lib/db.ts');
    const { sizeBands } = await import('../src/lib/codelists.ts');
    assert.equal(searchCompanies().total, 1500);
    assert.equal(searchCompanies({ includeDissolved: true }).total, 1600);
    assert.equal(searchCompanies({ region: '__proto__', district: 'bad', size: 'constructor', page: NaN }).page, 1);
    assert.equal(searchCompanies({ page: 999999 }).page, 60);
    const row = searchCompanies().rows[0];
    assert.equal(getCompany(row.ico).ico, row.ico);
    assert.equal(getCompany("' OR 1=1"), null);
    assert.equal(searchCompanies({ q: row.ico }).total, 1);
    assert.equal(searchCompanies({ q: '" OR * ()' }).total, searchCompanies({ q: 'OR' }).total);
    assert.equal(searchCompanies({ q: '"*()' }).total, 0);
    assert.equal(searchCompanies({ district: row.district, region: row.region === 'CZ010' ? 'CZ020' : 'CZ010' }).total, searchCompanies({ region: row.region === 'CZ010' ? 'CZ020' : 'CZ010' }).total);
    assert.ok(searchCompanies({ size: 'micro' }).rows.every(c => sizeBands.micro.codes.includes(c.size)));
    assert.ok(searchCompanies({ size: 'unknown' }).rows.every(c => c.size === '000'));
    assert.equal(getMeta().row_count, '1600');
    const raw = new Database(process.env.DB_PATH);
    try {
      const all = raw.prepare('SELECT * FROM company WHERE dissolved IS NULL').all();
      const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
      const tie = (a, b) => compareText(a.sort_key, b.sort_key) || compareText(a.ico, b.ico);
      const comparators = {
        name: tie,
        size: (a, b) => b.size_rank - a.size_rank || tie(a, b),
        founded: (a, b) => compareText(b.founded, a.founded) || compareText(a.ico, b.ico),
      };
      for (const [sort, compare] of Object.entries(comparators)) {
        const expected = [...all].sort(compare).map(c => c.ico);
        assert.deepEqual(searchCompanies({ sort, perPage: 100 }).rows.map(c => c.ico), expected.slice(0, 100));
        assert.deepEqual(searchCompanies({ sort, page: 2, perPage: 100 }).rows.map(c => c.ico), expected.slice(100, 200));
      }
      assert.ok(all.every(c => c.size_rank === (c.size === '000' ? -1 : Number(c.size))));
      assert.ok(searchCompanies({ page: 15, perPage: 100 }).rows.every(c => c.size === '000'));
      assert.deepEqual(searchCompanies({ sort: 'bad' }).rows, searchCompanies().rows);
      assert.ok(searchCompanies().rows.every(c => ['active', 'liquidation', 'dissolved'].includes(c.status)));
      assert.equal(getCompany(row.ico).status, row.status);
      for (const [index, order] of [
        ['company_default_sort', 'size_rank DESC, sort_key, ico'],
        ['company_founded_sort', 'founded DESC, ico'],
      ]) {
        const plan = raw.prepare(`EXPLAIN QUERY PLAN SELECT * FROM company WHERE dissolved IS NULL ORDER BY ${order} LIMIT 25 OFFSET 0`).all().map(r => r.detail).join('\n');
        assert.ok(plan.includes(index), plan);
        assert.ok(!plan.includes('TEMP B-TREE'), plan);
      }
    } finally { raw.close(); }
  } finally { delete process.env.DB_PATH; await rm(dir, { recursive: true, force: true }); }
});
