# Context

This file is the working context for AI coding agents on this project
(`CLAUDE.md` and `AGENTS.md` are symlinks to it). It is kept in the repo on
purpose: the assessment asks for it, and it shows what the agents were told.

## Task

Koala42 "Vibe Coder" technical assessment. User stories:

1. List all companies from the Czech Republic.
2. Filter them by turnover and location.
3. Show company details, including owners and management with their phone
   numbers and email addresses.

Constraints: public data and APIs only, Git, deploy to a free tier (GCP
preferred), `README.md` with known issues, what I would do differently and
time spent. Koala42 asks for as few hours as possible. Budget: 5 hours.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Company list | Bulk import of ČSÚ RES open data (`res_data.csv`), business corporations only: legal forms 111, 112, 113, 121, 205 | Full coverage, free, no API limits. ARES search caps results, so it cannot list "all" |
| Dissolved companies | Imported, hidden by default, filter "include dissolved" | The register keeps them; users sometimes need them |
| Location | Region (kraj) and district (okres) from `OKRESLAU` (CZ-NUTS LAU1, code list 109). Region = first 5 characters of the district code | Already in RES, no geocoding |
| Turnover | **No free source has turnover for all companies.** Filter by employee size category `KATPO` (code list 579) as a labelled proxy, never called "turnover" in the UI | Turnover exists only in PDF financial statements in Sbírka listin; small and micro entities may omit the income statement |
| `KATPO` unknown | Shown as "Not reported" (code `000`), a filter option of its own, never treated as zero | About 58 % of active companies have `000` |
| Real turnover | Not implemented. Detail page shows a disabled "Extract turnover from financial statements (AI)" button with the proposed pipeline, plus a link to the register | Cost and time outside the scope; the approach is described in README |
| Owners and management | Fetched live from ARES `ekonomicke-subjekty-vr/{ico}` on the detail page, cached in memory | Database stays small, data stays current |
| Personal data | Server keeps only name, role, start date and share. Birth date and home address are dropped before rendering and never stored | Data minimisation (GDPR), even though the register is public |
| Phone and email of people | Not shown. Explained on the detail page and in README | Not published in any public register; scraping personal contacts has no legal basis |
| Indexing | `noindex` meta, `X-Robots-Tag`, `robots.txt` disallow all | Pages carry names of real people; a demo has no reason to be in search engines |
| Stack | Astro 7 SSR, `@astrojs/node` standalone, `better-sqlite3` with FTS5, Tailwind 4. Started from the in-house web starter | One service, server-rendered, almost no client JS |
| Database | Read-only SQLite file built by `npm run import`, baked into the container image | Cloud SQL has no free tier |
| Hosting | Google Cloud Run, `us-central1`, min instances 0 | Free tier; Cloud Storage free tier exists only in US regions |
| UI language | English, company data stays Czech | Assessment is in English |

## Data sources

| Source | Use | Licence / terms |
|---|---|---|
| ČSÚ RES open data, <https://csu.gov.cz/registr-ekonomickych-subjektu-otevrena-data-dokumentace> | company list, address, district, size, NACE | CC BY 4.0, snapshot twice a month |
| ČSÚ code lists 109, 56, 579, 80004 in `data/codelists/` | labels | CC BY 4.0 |
| ARES REST, `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-vr/{ico}` | statutory bodies, shareholders | public; MF may block above 500 requests per minute |
| Register link `https://or.justice.cz/ias/ui/rejstrik-$firma?ico={ico}` | link to the official record and Sbírka listin | the `$` is literal |

## Layout

```
scripts/import-res.mjs   RES CSV + code lists -> data/companies.db
src/lib/db.ts            read-only queries (list, count, detail)
src/lib/ares.ts          ARES fetch, sanitising, in-memory cache
src/lib/codelists.ts     labels for regions, districts, sizes, forms
src/pages/index.astro    list with filters and pagination
src/pages/company/[ico].astro  detail
src/pages/about.astro    data sources and limitations
data/codelists/          ČSÚ code lists (in git)
data/sample/             1 600 company rows for tests and local dev (in git)
data/raw/                full download (not in git)
test/fixtures/           ARES responses with fictional people
test/acceptance/         user stories over HTTP against the built server
```

## Conventions

- TypeScript strict. Code, comments, docs in English.
- No em-dash anywhere.
- Every filter state lives in the URL query, pages work without JavaScript.
- Accessibility: labelled form fields, visible focus, tables with `<th scope>`,
  disabled AI button stays focusable (`aria-disabled`) so its explanation is reachable.
- Never log or store personal data from ARES.
- Tests: `node --test`, against the sample CSV and the fixtures, no network.
  Acceptance tests in `test/acceptance/` run the built server with `DB_PATH`
  and `ARES_URL` pointing at a temporary database and a local fake ARES.

## Commands

```
npm run import -- data/raw/res_data.csv   # full build, about 625k active companies
npm run import -- data/sample/res_sample.csv   # quick build for dev
npm run dev
npm test
npm run test:acceptance   # builds, then tests the running server
```
