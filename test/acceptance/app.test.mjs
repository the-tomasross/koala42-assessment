// Acceptance tests: the built server (`npm run build`) on the sample database,
// with a local fake ARES, checked through HTTP the way a user's browser sees it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { regions, districtsByRegion } from '../../src/lib/codelists.ts';

const fixture = await readFile(new URL('../fixtures/ares-vr-formats.json', import.meta.url), 'utf8');
let dir, db, app, ares, base, big, down, missing;
const aresCalls = [];

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => entities[e]);
const text = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const section = (html, id) => html.split(`aria-labelledby="${id}"`)[1]?.split('</section>')[0] ?? '';
const rows = (html) => [...(html.split('<tbody')[1]?.split('</tbody>')[0] ?? '').matchAll(/href="\/company\/(\d{8})"/g)].map(m => m[1]);
const count = (html) => text(/class="results-count"[\s\S]*?<\/p>/.exec(html)?.[0] ?? '').replace(/^.*?>\s*/, '').trim();
const companies = (n) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'company' : 'companies'}`;
async function get(path) {
  const response = await fetch(base + path, { redirect: 'manual' });
  return { status: response.status, headers: response.headers, html: await response.text() };
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'acceptance-'));
  const dbPath = join(dir, 'companies.db');
  execFileSync(process.execPath, ['scripts/import-res.mjs', 'data/sample/res_sample.csv', dbPath]);
  db = new Database(dbPath, { readonly: true });
  [big, down, missing] = db.prepare('SELECT * FROM company WHERE dissolved IS NULL ORDER BY size_rank DESC, sort_key, ico LIMIT 3').all();

  ares = createServer((req, res) => {
    const ico = req.url.split('/').pop();
    aresCalls.push({ ico, accept: req.headers.accept });
    if (ico === down.ico) { res.writeHead(500).end(); return; }
    if (ico !== big.ico) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(fixture);
  });
  const aresPort = await listen(ares);
  const probe = createServer();
  const port = await listen(probe);
  await new Promise((r) => probe.close(r));
  base = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ['dist/server/entry.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DB_PATH: dbPath, ARES_URL: `http://127.0.0.1:${aresPort}` },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/about')).ok) return; } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start; run `npm run build` first');
});

after(async () => {
  app?.kill();
  ares?.close();
  db?.close();
  await rm(dir, { recursive: true, force: true });
});

test('story 1: the list shows every active company, largest first, page by page', async () => {
  const active = db.prepare('SELECT count(*) n FROM company WHERE dissolved IS NULL').get().n;
  const first = await get('/');
  assert.equal(first.status, 200);
  assert.equal(count(first.html), companies(active));
  assert.match(text(first.html), new RegExp(`${active.toLocaleString('en-GB')} active business corporations`));
  const page1 = rows(first.html);
  assert.equal(page1.length, 25);
  assert.equal(page1[0], big.ico);
  assert.match(first.html, /aria-sort="descending"/);

  const next = /rel="next" href="([^"]+)"/.exec(first.html)[1];
  const page2 = rows((await get(decode(next))).html);
  assert.equal(page2.length, 25);
  assert.ok(page2.every((ico) => !page1.includes(ico)), 'page 2 continues page 1');

  const all = db.prepare('SELECT count(*) n FROM company').get().n;
  assert.equal(count((await get('/?includeDissolved=1')).html), companies(all));
});

test('story 1: search finds a company by IČO and by name', async () => {
  const byIco = await get(`/?q=${big.ico}`);
  assert.deepEqual(rows(byIco.html), [big.ico]);
  assert.equal(count(byIco.html), '1 company');
  assert.ok(rows((await get(`/?q=${encodeURIComponent(big.name)}`)).html).includes(big.ico));
  assert.equal(count((await get('/?q=zzzqqqxxx')).html), '0 companies');
});

test('story 2: location and size filters narrow the list, work without JavaScript and can be removed', async () => {
  const { region } = db.prepare('SELECT region, count(*) n FROM company WHERE dissolved IS NULL GROUP BY region ORDER BY n DESC').get();
  const inRegion = db.prepare('SELECT ico FROM company WHERE dissolved IS NULL AND region = ?').all(region).map((r) => r.ico);
  const page = await get(`/?region=${region}`);
  assert.equal(count(page.html), companies(inRegion.length));
  assert.ok(rows(page.html).every((ico) => inRegion.includes(ico)));
  assert.match(page.html, /<form id="company-filters" method="get" action="\/"/);
  assert.match(page.html, /type="submit">Filter</);
  assert.ok(page.html.includes(`aria-label="Remove filter: ${regions[region]}"`));

  const select = page.html.split('id="district"')[1].split('</select>')[0];
  const offered = [...select.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(offered, districtsByRegion[region].map(([code]) => code), 'only districts of the region');

  const { district } = db.prepare('SELECT district FROM company WHERE dissolved IS NULL AND region = ? LIMIT 1').get(region);
  const inDistrict = db.prepare('SELECT count(*) n FROM company WHERE dissolved IS NULL AND district = ?').get(district).n;
  const both = await get(`/?region=${region}&district=${district}`);
  assert.equal(count(both.html), companies(inDistrict));
  assert.match(both.html, /class="clear-filters" href="\/"/);
  const other = Object.keys(regions).find((r) => r !== region);
  assert.equal(count((await get(`/?region=${other}&district=${district}`)).html),
    count((await get(`/?region=${other}`)).html), 'a district outside the region is ignored');

  const unknown = db.prepare("SELECT ico FROM company WHERE dissolved IS NULL AND size = '000'").all().map((r) => r.ico);
  const sized = await get('/?size=unknown');
  assert.equal(count(sized.html), companies(unknown.length));
  assert.ok(rows(sized.html).every((ico) => unknown.includes(ico)));
  assert.match(sized.html, /<label for="size">Company size \(employees\)<\/label>/, 'the proxy is labelled as size');
  assert.match(text(sized.html), /Turnover is not published as open data\. Size is a proxy/);
});

test('story 2: sorting by name puts letters first and keeps the sort while paging', async () => {
  const expected = db.prepare('SELECT ico FROM company WHERE dissolved IS NULL ORDER BY sort_key, ico LIMIT 50').all().map((r) => r.ico);
  const page = await get('/?sort=name');
  assert.deepEqual(rows(page.html), expected.slice(0, 25));
  assert.match(page.html, /aria-sort="ascending"/);
  const next = decode(/rel="next" href="([^"]+)"/.exec(page.html)[1]);
  assert.match(next, /sort=name/);
  assert.deepEqual(rows((await get(next)).html), expected.slice(25, 50));
});

test('story 3: the detail shows facts, translated roles and shares as percentages, without personal details', async () => {
  const page = await get(`/company/${big.ico}`);
  assert.equal(page.status, 200);
  const all = text(page.html);
  assert.ok(all.includes(big.name) && all.includes(big.ico));
  assert.match(page.html, /href="https:\/\/or\.justice\.cz\/ias\/ui\/rejstrik-\$firma\?ico=\d{8}"/);

  const management = text(section(page.html, 'management'));
  for (const expected of ['Alena Vzorová', 'Chair of the board of managing directors', 'Předseda rady jednatelů',
    'Eva Příkladová', 'Managing director', 'jednatelka', 'Karel Ukázka', 'Authorised signatory (prokura)', '1 Mar 2024']) {
    assert.ok(management.includes(expected), `management shows ${expected}`);
  }
  assert.ok(!management.includes('Odvolaný'), 'removed bodies are not shown');

  const owners = text(section(page.html, 'owners'));
  for (const expected of ['Vzorová holding a.s.', '66.67 %', 'Petr Smyšlený', '33.33 %']) assert.ok(owners.includes(expected), `owners show ${expected}`);
  assert.doesNotMatch(owners, /\d;\d|50 %/, 'no raw ARES numbers and no removed shares');

  for (const forbidden of ['1975', 'Vymyšlená', '60200', '200000', 'mailto:', 'tel:']) assert.ok(!page.html.includes(forbidden), forbidden);
  assert.match(page.html, /aria-disabled="true"/);
  assert.ok(aresCalls.some((c) => c.ico === big.ico && c.accept === 'application/json'));
});

test('story 3: company facts stay available when ARES fails or has no record', async () => {
  const failing = await get(`/company/${down.ico}`);
  assert.equal(failing.status, 200);
  assert.ok(text(failing.html).includes(down.name));
  assert.equal(text(failing.html).match(/ARES\) did not respond/g)?.length, 2);

  const absent = await get(`/company/${missing.ico}`);
  assert.equal(absent.status, 200);
  assert.equal(text(absent.html).match(/No current entries in the public register/g)?.length, 2);
});

test('unknown or malformed IČO gives 404', async () => {
  for (const path of ['/company/00000001', '/company/abc', '/company/1234567890']) assert.equal((await get(path)).status, 404, path);
});

test('pages are not indexed, cannot be framed and carry a script policy', async () => {
  for (const path of ['/', `/company/${big.ico}`, '/about']) {
    const { headers, html } = await get(path);
    assert.equal(headers.get('x-robots-tag'), 'noindex, nofollow', path);
    assert.equal(headers.get('x-frame-options'), 'DENY', path);
    assert.match(headers.get('content-security-policy') ?? '', /script-src[^;]*'sha256-.*frame-ancestors 'none'/, path);
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/, path);
  }
  assert.match((await get('/robots.txt')).html, /Disallow: \//);
});
