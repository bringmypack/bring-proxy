// Pure preparation only. No external reads/writes. A source must be opened and verified.
export function planFacebookImport(records, existingIds, headers, sources, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw Error('INVALID_TODAY');
  const required=['gp_id','role','nom','ville_depart','ville_arrivee','date_depart','statut','source','date_source'];
  if(required.some(k=>!headers.includes(k)) || new Set(headers).size!==headers.length) throw Error('INVALID_HEADERS');
  const priority=new Map(sources.filter(s=>s.enabled).map(s=>[s.id,s.priority]));
  const seen=new Set(existingIds), seenPostIds=new Set(existingIds.map(id=>String(id).match(/^FB_[^_]+_(\d+)$/)?.[1]).filter(Boolean)), seenTrips=new Set(), rows=[], review=[], duplicates=[];
  for(const r of [...records].sort((a,b)=>(priority.get(a.group_id)??999)-(priority.get(b.group_id)??999))) {
    const m=String(r.source_url||'').match(/^https:\/\/www\.facebook\.com\/groups\/([^/]+)\/(?:posts|permalink)\/(\d+)\/$/);
    const date=String(r.departure_date||'');
    const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date;
    let reason=null;
    if(!m||!priority.has(m[1])||m[1]!==r.group_id||m[2]!==r.post_id) reason='SOURCE_NOT_ALLOWED';
    else if(r.source_verified!==true) reason='SOURCE_REQUIRED';
    else if(!validDate||r.year_verified!==true) reason='DATE_REQUIRED';
    else if(date<today) reason='EXPIRED';
    else if(![r.operator,r.origin,r.destination].every(v=>typeof v==='string'&&v.trim())||r.kind!=='traveller_offer') reason='OFFER_REQUIRED';
    else if(![['FR','SN'],['SN','FR']].some(pair=>pair[0]===r.origin_country&&pair[1]===r.destination_country)) reason='ROUTE_OUTSIDE_SCOPE';
    if(reason){review.push({...r,reason});continue;}
    const id='FB_'+r.group_id+'_'+r.post_id;
    const trip=[r.operator,r.origin,r.destination,date,r.departure_time||''].map(v=>v.toLowerCase().trim()).join('|');
    if(seen.has(id)||seenPostIds.has(r.post_id)){duplicates.push({id,reason:'EXISTING_POST'});continue;}
    if(seenTrips.has(trip)){duplicates.push({id,reason:'POSSIBLE_CROSS_POST_REVIEW'});continue;}
    seen.add(id);seenPostIds.add(r.post_id);seenTrips.add(trip);
    const record={gp_id:id,role:'GP',nom:r.operator,ville_depart:r.origin,ville_arrivee:r.destination,
      date_depart:date,date_expiration:date+'T23:59:59Z',statut:'A_VERIFIER',source:r.source_url,
      date_source:typeof r.date_as_posted==='string'?r.date_as_posted:date,
      prix_kg:typeof r.price_per_kg==='number'&&Number.isFinite(r.price_per_kg)&&r.price_per_kg>=0?r.price_per_kg:'',
      devise:/^[A-Z]{3}$/.test(r.currency||'')?r.currency:'',
      capacite_kg:typeof r.capacity_kg==='number'&&Number.isFinite(r.capacity_kg)&&r.capacity_kg>0?r.capacity_kg:'',
      objets_acceptes:typeof r.accepted_items==='string'?r.accepted_items:'',tarif_texte:typeof r.price_terms==='string'?r.price_terms:''};
    if(record.prix_kg!==''&&!record.devise) {record.prix_kg='';}
    rows.push(headers.map(k=>{const v=record[k]??'';return typeof v==='string'&&/^[=+\-@\t\r]/.test(v)?"'"+v:v;}));
  }
  return {rows,review,duplicates};
}
