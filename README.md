# CZ Company Explorer

A server-rendered explorer of Czech business corporations using public RES and ARES data, built for the Koala42 technical assessment.

[Live demo](https://koala42-assessment-1027702019609.us-central1.run.app) | [Repository](https://github.com/the-tomasross/koala42-assessment)

## What works

| Story | Status | How |
|---|---|---|
| List all Czech companies | Done within scope | Bulk RES import of s.r.o., a.s., v.o.s., k.s. and cooperatives, with search and pagination. Other entity types are excluded; dissolved companies are optional. |
| Filter by turnover and location | Partly | Region and district filters work; labelled employee size replaces unavailable turnover. |
| Show details, owners, management and their contacts | Partly; contacts: Not done, on purpose | Company facts plus current owners and management from ARES. Personal phone numbers and emails are omitted. |

## Approach and trade-offs

- **Coverage:** bulk RES import instead of ARES search, whose capped results cannot list “all”. Legal forms are limited to `111`, `112`, `113`, `121`, `205`.
- **Turnover:** no comprehensive free dataset. Public turnover is in PDF financial statements in Sbírka listin, often scans; small and micro entities may omit the income statement. Paid providers (Merk, FinStat, CRIBIS) sell digitised statements, but showing their data in a public demo would need a licence that allows it, and free tiers are trials or a few hundred calls a month.
- **Proxy:** employee size (`KATPO`) is explicitly labelled, never presented as turnover. `000` means “Not reported”, not zero employees.
- **People:** fetched live from ARES and reduced to name, role, start date and share. Birth dates and home addresses are discarded; corporate owners also retain IČO for linking.
- **Contacts:** people's phone numbers and emails are not in any public Czech register. Collecting them elsewhere needs a GDPR legal basis, so they are not shown.
- **Stack:** Astro SSR, Tailwind and read-only SQLite with FTS5 keep one service and filters in URL parameters, usable without JavaScript.
- **Hosting:** SQLite is baked into the image on Cloud Run, scaling to zero. Cloud SQL has no free tier; a static snapshot avoids a separate database service.
- **Privacy:** `noindex` metadata, `X-Robots-Tag` and `robots.txt` block indexing throughout because pages show names of real people.

## Known issues

- About 58 % of active companies have `KATPO` `000`; size bands only narrow the 42 % reporting a category. Unknown size has its own filter.
- ČSÚ refreshes RES twice a month; updating requires importing the snapshot and rebuilding the image.
- ARES can be slow or rate limited; MF blocks above 500 requests per minute. Requests are deduplicated per company, capped at 8 in parallel and failures are remembered for 30 s, but the cache is per instance and in memory and there is no per-client rate limit.
- First request after idle: about 1 to 2 s, then 0.25 to 0.45 s.
- Lists stop at 200 pages (5,000 rows) to bound query time; narrower filters reach the rest. One-letter search terms match whole words only, so `s` finds every `s.r.o.`.
- NACE labels use the 2008 classification; RES also carries NACE 2025 from 2026, which is unused.
- Sorting folds diacritics, so Č sorts with C.
- Search engine indexing is blocked on purpose.

## What I would do differently

- With a budget, use a licensed financial data API (FinStat, Merk or similar) with a contract allowing display, instead of extraction.
- Implement the detail page's AI pipeline as an offline batch: queue, cached PDFs, text or vision extraction, validation and an eval set of hand-checked statements. Store turnover with year, unit, source and method; missing statements remain unknown.
- Schedule RES imports and image rebuilds with Cloud Scheduler and Cloud Build.
- Use a real search engine or Postgres if writes or many concurrent users were needed.
- Add company contacts, such as website and data box ID, from sources permitting reuse; still no personal contacts.

## Run locally

Requires Node 22.23.4 or newer (`package.json`); `.nvmrc` selects Node 22.

```sh
nvm use
npm ci
npm run import -- data/sample/res_sample.csv
npm run dev
npm test
```

For full coverage, download [res_data.csv](https://opendata.csu.gov.cz/soubory/od/od_org03/res_data.csv) (544 MB) into `data/raw/`, then run:

```sh
npm run import -- data/raw/res_data.csv
```

Tests use the sample CSV and fictional ARES fixture, without network calls.

## Deploy

Build `data/companies.db` first using the full import; `.gcloudignore` allows its upload, but it is not committed.

```sh
gcloud run deploy koala42-assessment --source . --region us-central1 --allow-unauthenticated --min-instances 0 --max-instances 2 --memory 512Mi --cpu 1
```

## How it was built

Started from my in-house Astro starter, built with AI coding agents steered by `context.md`:

| Who | What |
|---|---|
| Me | Scope and the key calls: size proxy instead of turnover, no live LLM extraction, no personal contacts, GCP setup |
| Claude Code (lead agent) | Data source checks, architecture, `context.md`, review of all Codex output, fixes, browser checks at desktop and 375 px, deploy |
| OpenAI Codex | Web research on turnover sources, import script, pages and tests from a written spec, security review, README draft |

The security review found two availability issues (ARES request flooding, unbounded deep pagination); both are fixed and tested.

## Time spent

About 2 hours, including the research into turnover data sources.

## Data and licences

| Source | Attribution and use |
|---|---|
| [ČSÚ RES and code lists](https://csu.gov.cz/registr-ekonomickych-subjektu-otevrena-data-dokumentace) | CC BY 4.0; company data and labels, filtered and transformed for this demo. |
| [ARES](https://ares.gov.cz/) | Ministry of Finance; public register data for management and owners. |
