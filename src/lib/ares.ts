export interface Person {
  name: string; kind: 'person' | 'company'; role: string; since: string | null; ico?: string; share?: string;
}
export interface People { status: 'ok' | 'not_found' | 'error'; management: Person[]; owners: Person[] }
type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {};
const list = (value: unknown): Obj[] => Array.isArray(value) ? value.map(obj) : [];
const str = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const current = (entry: Obj) => !entry.datumVymazu;
function person(entry: Obj, group: Obj, owner?: Obj): Person | null {
  const membership = obj(entry.clenstvi), role = obj(membership.funkce);
  if (![entry, membership, role, ...(owner ? [owner] : [])].every(current)) return null;
  const natural = obj(entry.fyzickaOsoba), legal = obj(entry.pravnickaOsoba);
  if (!current(natural) || !current(legal)) return null;
  // The register often sends names in capitals ("JAN", "NOVÁK").
  const titleCase = (s: string) => s === s.toLocaleUpperCase('cs')
    ? s.toLocaleLowerCase('cs').replace(/\p{L}+/gu, w => w[0].toLocaleUpperCase('cs') + w.slice(1))
    : s;
  const name = legal.obchodniJmeno
    ? str(legal.obchodniJmeno)
    : [str(natural.titulPredJmenem), titleCase(str(natural.jmeno)), titleCase(str(natural.prijmeni)), str(natural.titulZaJmenem)]
        .filter(Boolean).join(' ');
  if (!name) return null;
  const result: Person = {
    name, kind: legal.obchodniJmeno ? 'company' : 'person',
    role: str(role.nazev) || str(entry.nazevAngazma) || str(group.nazevOrganu),
    since: str(role.vznikFunkce) || str(entry.datumZapisu) || str(owner?.datumZapisu) || null,
  };
  if (result.kind === 'company' && /^\d{8}$/.test(str(legal.ico))) result.ico = str(legal.ico);
  const share = list((owner || entry).podil).find(current);
  const amount = obj(share?.velikostPodilu);
  if (current(amount) && str(amount.hodnota)) result.share = str(amount.hodnota) + (amount.typObnos === 'PROCENTA' ? ' %' : '');
  return result;
}
export function parsePeople(input: unknown): People {
  const records = list(obj(input).zaznamy);
  const record = records.find(r => r.primarniZaznam === true) || records[0];
  if (!record) return { status: 'not_found', management: [], owners: [] };
  const management: Person[] = [], owners: Person[] = [];
  for (const group of list(record.statutarniOrgany).filter(current)) {
    for (const entry of list(group.clenoveOrganu)) { const p = person(entry, group); if (p) management.push(p); }
  }
  for (const group of list(record.spolecnici).filter(current)) {
    for (const entry of list(group.spolecnik)) { const p = person(obj(entry.osoba), group, entry); if (p) owners.push(p); }
  }
  for (const group of list(record.akcionari).filter(current)) {
    for (const entry of list(group.clenoveOrganu)) { const p = person(entry, group); if (p) owners.push(p); }
  }
  return { status: 'ok', management, owners };
}
// Protects ARES from us: one request per company at a time, a cap on parallel
// upstream calls, and a short memory of failures so an outage is not retried
// on every page view. MF blocks clients above 500 requests per minute.
const OK_TTL = 3_600_000;
const ERROR_TTL = 30_000;
const MAX_INFLIGHT = 8;
const cache = new Map<string, { expires: number; result: People; fetcher: typeof fetch }>();
const inflight = new Map<string, Promise<People>>();
const empty = (status: People['status']): People => ({ status, management: [], owners: [] });

function remember(ico: string, result: People, fetcher: typeof fetch) {
  cache.delete(ico);
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  const ttl = result.status === 'error' ? ERROR_TTL : OK_TTL;
  cache.set(ico, { expires: Date.now() + ttl, result: structuredClone(result), fetcher });
}

async function fetchPeople(ico: string, fetcher: typeof fetch): Promise<People> {
  try {
    const response = await fetcher(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-vr/${ico}`, {
      signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' },
    });
    return response.status === 404 ? empty('not_found') : response.ok ? parsePeople(await response.json()) : empty('error');
  } catch { return empty('error'); }
}

export async function getPeople(ico: string, fetcher: typeof fetch = fetch): Promise<People> {
  if (!/^\d{8}$/.test(ico)) return empty('not_found');
  const cached = cache.get(ico);
  if (cached && cached.fetcher === fetcher && cached.expires > Date.now()) return structuredClone(cached.result);
  const pending = inflight.get(ico);
  if (pending) return structuredClone(await pending);
  // Over the cap the page says ARES did not respond; better than queueing behind it.
  if (inflight.size >= MAX_INFLIGHT) return empty('error');
  const request = fetchPeople(ico, fetcher).then((result) => { remember(ico, result, fetcher); return result; })
    .finally(() => inflight.delete(ico));
  inflight.set(ico, request);
  return structuredClone(await request);
}
