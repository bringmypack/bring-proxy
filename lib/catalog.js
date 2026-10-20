// Recovered from the 2026-10-19 Vercel deployment. Keep the public catalogue
// source separate from the pilot publication workbook and private contacts.
const SHEET = '1Op5k1Leaxjwi0Oa3Ic2t572zaNzdXEyRzFaV3lRmIis';
const QUERY = "select A,C,E,H,K,M,N,P,U,X,Y where A starts with 'FB_' limit 1000";
export const sourceUrl = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq?gid=212458047&headers=1&tqx=out:json&tq=${encodeURIComponent(QUERY)}`;
export const normalize = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function isoDate(value) {
  const m = String(value ?? '').match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})(?:,.*)?\)$/);
  const date = m ? `${m[1]}-${String(Number(m[2]) + 1).padStart(2, '0')}-${m[3].padStart(2, '0')}` : String(value ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date ? date : null;
}

export function decode(text) {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw Error('CATALOG_UNAVAILABLE');
  const data = JSON.parse(text.slice(start, end + 1));
  if (data.status !== 'ok' || !Array.isArray(data.table?.rows)) throw Error('CATALOG_UNAVAILABLE');
  return data.table.rows.map(row => {
    const c = row.c.map(cell => cell?.v ?? null);
    return {id:c[0], operator:c[1], origin:c[2], destination:c[3],
      departure_date_estimated:isoDate(c[4]),
      price_per_kg:typeof c[5] === 'number' && Number.isFinite(c[5]) ? c[5] : null,
      status:c[6], source_url:c[7], date_as_posted:c[9], currency:c[10],
      availability_confirmed:false, capacity_kg:null};
  }).filter(row => String(row.id).startsWith('FB_') &&
    /^https:\/\/www\.facebook\.com\/groups\/[^/]+\/(?:permalink|posts)\/\d+\/$/.test(row.source_url ?? '') &&
    ['A_VERIFIER', 'ACTIF'].includes(row.status));
}

export async function readCatalog(fetchImpl = fetch) {
  const response = await fetchImpl(sourceUrl, {signal:AbortSignal.timeout(12000), headers:{Accept:'application/json'}});
  if (!response.ok) throw Error('CATALOG_UNAVAILABLE');
  const text = await response.text();
  if (text.length > 2_000_000) throw Error('CATALOG_TOO_LARGE');
  return decode(text);
}

function cityMatch(stored, input) {
  const s = normalize(stored), i = normalize(input);
  if (!s || !i) return false;
  if ((i.includes('ile de france') || i === 'france' || i.includes('paris')) && s.includes('paris')) return true;
  if ((i === 'senegal' || i.includes('dakar')) && s.includes('dakar')) return true;
  return s.includes(i) || i.includes(s);
}

export function searchCatalog(rows, args, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'}).format(now);
  const start = args.date_from ?? today, end = args.date_to ?? '9999-12-31';
  if (!isoDate(start) || !isoDate(end) || start < today || end < start) throw Error('INVALID_DATE_RANGE');
  const matches = rows.filter(row => row.departure_date_estimated && row.departure_date_estimated >= start &&
    row.departure_date_estimated <= end && cityMatch(row.origin, args.origin) && cityMatch(row.destination, args.destination));
  return {checked_at:now.toISOString(), source:'Google Sheets — annonces Facebook importées',
    results:matches.sort((a,b) => a.departure_date_estimated.localeCompare(b.departure_date_estimated)).slice(0,10),
    total:matches.length,
    notice:'Annonces publiques, disponibilités non confirmées. Date, année, place disponible, prix et conditions à reconfirmer auprès du voyageur via le post source. Aucun contact privé ni réservation automatique.'};
}
