import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    assert.equal(searchCompanies({ district: row.district, region: row.region === 'CZ010' ? 'CZ020' : 'CZ010' }).total, searchCompanies({ district: row.district }).total);
    assert.ok(searchCompanies({ size: 'micro' }).rows.every(c => sizeBands.micro.codes.includes(c.size)));
    assert.ok(searchCompanies({ size: 'unknown' }).rows.every(c => c.size === '000'));
    assert.equal(getMeta().row_count, '1600');
  } finally { delete process.env.DB_PATH; await rm(dir, { recursive: true, force: true }); }
});
