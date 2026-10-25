import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getPeople, parsePeople } from '../src/lib/ares.ts';
const fixture = JSON.parse(await readFile(new URL('./fixtures/ares-vr-06841945.json', import.meta.url), 'utf8'));
test('ARES exposes only current people and explicitly allowed fields', async () => {
  const result = await getPeople('06841945', async (url, options) => {
    assert.ok(url.endsWith('/06841945')); assert.equal(options.headers.Accept, 'application/json'); assert.ok(options.signal);
    return new Response(JSON.stringify(fixture));
  });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.management.map(p => p.name), ['Jan Novák', 'Tomáš Procházka']);
  assert.deepEqual(result.owners.map(p => p.name), ['Lucie Kučerová', 'Petra Svobodová']);
  assert.ok(result.owners.every(p => p.share === '50 %'));
  const serialized = JSON.stringify(result);
  for (const forbidden of ['datumNarozeni', 'adresa', 'bydliste', '1980-01-01', 'Smyšlená', '11000']) assert.ok(!serialized.includes(forbidden));
  for (const person of [...result.management, ...result.owners]) assert.ok(Object.keys(person).every(k => ['name', 'kind', 'role', 'since', 'ico', 'share'].includes(k)));
});
test('errors are cached briefly, successes and missing records for longer', async () => {
  const original = globalThis.fetch; let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; throw new Error('offline'); };
    assert.equal((await getPeople('99999999')).status, 'error');
    assert.equal((await getPeople('99999999')).status, 'error');
    assert.equal(calls, 1, 'an outage is not retried on every page view');
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify(fixture)); };
    const result = await getPeople('77777777');
    result.management.length = 0;
    assert.equal((await getPeople('77777777')).management.length, 2, 'callers get copies, not the cached object');
    assert.equal(calls, 2);
    globalThis.fetch = async () => { calls++; return new Response('', { status: 404 }); };
    assert.equal((await getPeople('88888888')).status, 'not_found');
    assert.equal((await getPeople('88888888')).status, 'not_found');
    assert.equal(calls, 3);
  } finally { globalThis.fetch = original; }
});
test('concurrent requests for one company share a single upstream call', async () => {
  let calls = 0;
  const slow = async () => { calls++; await new Promise(r => setTimeout(r, 20)); return new Response(JSON.stringify(fixture)); };
  const results = await Promise.all(Array.from({ length: 5 }, () => getPeople('66666666', slow)));
  assert.equal(calls, 1);
  assert.ok(results.every(r => r.status === 'ok' && r.management.length === 2));
});
test('primary record, corporate owners and deleted groups are handled', () => {
  const result = parsePeople({ zaznamy: [{}, { primarniZaznam: true,
    statutarniOrgany: [{ datumVymazu: '2020-01-01', clenoveOrganu: [{ fyzickaOsoba: { jmeno: 'Old' } }] }],
    akcionari: [{ clenoveOrganu: [{ pravnickaOsoba: { obchodniJmeno: 'Example Ltd', ico: '12345678' }, podil: [{ velikostPodilu: { typObnos: 'TEXT', hodnota: '1/2' } }] }] }],
  }] });
  assert.equal(result.management.length, 0);
  assert.equal(result.owners[0].kind, 'company'); assert.equal(result.owners[0].share, '1/2');
});
