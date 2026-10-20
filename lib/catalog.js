import { SCRIPT_URL, SPREADSHEET_ID, CATALOG_SHEET, CATALOG_NAME } from './config.js';
export const sourceUrl = SCRIPT_URL;
export const normalize = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export function isoDate(value) {
  const m = String(value ?? '').match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})(?:,.*)?\)$/);
  const date = m ? `${m[1]}-${String(Number(m[2]) + 1).padStart(2, '0')}-${m[3].padStart(2, '0')}` : String(value ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date ? date : null;
}

export function decode(text) {
  const data = JSON.parse(text);
  if (data.success !== true || data.spreadsheet_id !== SPREADSHEET_ID || data.sheet !== CATALOG_SHEET || !Array.isArray(data.records)) throw Error('CATALOG_UNAVAILABLE');
  return data.records.map(row => ({
    id:row.id, operator:row.operator, origin:row.origin, destination:row.destination,
    departure_date_estimated:isoDate(row.departure_date_estimated),
    price_per_kg:typeof row.price_per_kg === 'number' && Number.isFinite(row.price_per_kg) ? row.price_per_kg : null,
    status:row.status, source_url:row.source_url, source_type:row.source_type, date_as_posted:row.date_as_posted,
    currency:/^[A-Z]{3}$/.test(row.currency || '') ? row.currency : null,
    capacity_kg:typeof row.capacity_kg === 'number' && row.capacity_kg > 0 ? row.capacity_kg : null,
    origin_place:row.origin_place || null, destination_place:row.destination_place || null,
    origin_neighborhood:row.origin_neighborhood || null, destination_neighborhood:row.destination_neighborhood || null,
    origin_gps_precision:row.origin_gps_precision || null, destination_gps_precision:row.destination_gps_precision || null,
    origin_geocode:row.origin_geocode || null, destination_geocode:row.destination_geocode || null,
    accepted_items:row.accepted_items || null, price_terms:row.price_terms || null, availability_confirmed:false
  })).filter(row => row.departure_date_estimated && ['ACTIF','A_VERIFIER'].includes(row.status) &&
    ((row.source_type === 'facebook' && String(row.id).startsWith('FB_') && /^https:\/\/www\.facebook\.com\/groups\/[^/]+\/(?:permalink|posts)\/\d+\/$/.test(row.source_url || '')) ||
     (row.source_type === 'bringmypack' && String(row.id).startsWith('GP_') && row.source_url === null)));
}

export async function readCatalog(fetchImpl = fetch) {
  const response = await fetchImpl(SCRIPT_URL, {method:'POST', signal:AbortSignal.timeout(20000),
    headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'readPublicCatalog'}), redirect:'follow'});
  if (!response.ok) throw Error('CATALOG_UNAVAILABLE');
  const text = await response.text();
  if (text.length > 2_000_000) throw Error('CATALOG_TOO_LARGE');
  return decode(text);
}

function cityMatch(stored, input) {
  const s = normalize(stored), i = normalize(input);
  if (!s || !i) return false;
  if ((i === 'ile de france' || i === 'france') && s.includes('paris')) return true;
  if (i === 'senegal' && s.includes('dakar')) return true;
  return s.includes(i) || i.includes(s);
}

export function searchCatalog(rows, args, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit'}).format(now);
  const start = args.date_from ?? today, end = args.date_to ?? '9999-12-31';
  if (!isoDate(start) || !isoDate(end) || start < today || end < start) throw Error('INVALID_DATE_RANGE');
  const matches = rows.filter(row => row.departure_date_estimated && row.departure_date_estimated >= start &&
    row.departure_date_estimated <= end && (args.weight_kg===undefined||row.capacity_kg===null||row.capacity_kg===undefined||row.capacity_kg>=args.weight_kg) && cityMatch([row.origin,row.origin_place,row.origin_neighborhood].filter(Boolean).join(' / '), args.origin) && cityMatch([row.destination,row.destination_place,row.destination_neighborhood].filter(Boolean).join(' / '), args.destination));
  const same=(value,wanted)=>!wanted?null:!value?null:String(value).split(/[;|]/).some(v=>normalize(v)===normalize(wanted));
  const score=row=>(same(row.origin_neighborhood,args.origin_neighborhood)===true?2:0)+(same(row.destination_neighborhood,args.destination_neighborhood)===true?2:0);
  return {checked_at:now.toISOString(), source:CATALOG_NAME,
    results:matches.sort((a,b) => score(b)-score(a)||a.departure_date_estimated.localeCompare(b.departure_date_estimated)).slice(0,10).map(row=>({...row,origin_neighborhood_match:same(row.origin_neighborhood,args.origin_neighborhood),destination_neighborhood_match:same(row.destination_neighborhood,args.destination_neighborhood)})),
    total:matches.length,
    notice:'Annonces publiques, disponibilités non confirmées. Date, année, place disponible, prix et conditions à reconfirmer auprès du voyageur via le post source. Aucun contact privé ni réservation automatique.'};
}
