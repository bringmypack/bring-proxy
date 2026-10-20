// Pure preparation only. No external reads/writes. A source must be opened and verified.
export function planFacebookImport(records, existingIds, headers, sources, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw Error('INVALID_TODAY');
  const required=['gp_id','role','nom','ville_depart','ville_arrivee','date_depart','statut','source','date_source'];
  if(required.some(k=>!headers.includes(k)) || new Set(headers).size!==headers.length) throw Error('INVALID_HEADERS');
  const priority=new Map(sources.filter(s=>s.enabled&&s.visibility!=='private'&&s.public_import!==false).map(s=>[s.id,s.priority]));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const trip=r=>[norm(r.operator).replace(/^annonce de\s+/,''),r.origin,r.destination,r.departure_date,r.departure_time||''].map(norm).join('|');
  const postTrip=r=>[r.origin,r.destination,r.departure_date,r.departure_time||''].map(norm).join('|');
  const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(16).padStart(8,'0');};
  const seen=new Set(), seenPostIds=new Set(), seenPostTrips=new Set(), seenTrips=new Set(), rows=[], review=[], duplicates=[];
  existingIds.forEach(r=>{
    if(typeof r==='string') {seen.add(r);const m=r.match(/^FB_[^_]+_(\d+)$/);if(m)seenPostIds.add(m[1]);}
    else {seen.add(r.id);seenTrips.add(trip(r));const m=String(r.source_url||'').match(/\/(?:posts|permalink)\/(\d+)\/$/);if(m)seenPostTrips.add(m[1]+'|'+postTrip(r));}
  });
  for(const r of [...records].sort((a,b)=>(priority.get(a.group_id)??999)-(priority.get(b.group_id)??999))) {
    const m=String(r.source_url||'').match(/^https:\/\/www\.facebook\.com\/groups\/([^/]+)\/(?:posts|permalink)\/(\d+)\/$/);
    const date=String(r.departure_date||'');
    const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date;
    let reason=null;
    if(!m||!priority.has(m[1])||m[1]!==r.group_id||m[2]!==r.post_id) reason='SOURCE_NOT_ALLOWED';
    else if(r.source_verified!==true) reason='SOURCE_REQUIRED';
    else if(!validDate||r.year_verified!==true||r.date_conflict===true) reason='DATE_REQUIRED';
    else if(date<today) reason='EXPIRED';
    else if(![r.operator,r.origin,r.destination].every(v=>typeof v==='string'&&v.trim())||r.kind!=='traveller_offer') reason='OFFER_REQUIRED';
    else if(![['FR','SN'],['SN','FR']].some(pair=>pair[0]===r.origin_country&&pair[1]===r.destination_country)) reason='ROUTE_OUTSIDE_SCOPE';
    if(reason){review.push({...r,reason});continue;}
    const key=trip(r), id='FB_'+r.group_id+'_'+r.post_id+'_'+date.replace(/-/g,'')+'_'+hash(key);
    if(seen.has(id)||seenPostIds.has(r.post_id)||seenPostTrips.has(r.post_id+'|'+postTrip(r))){duplicates.push({id,reason:'EXISTING_POST'});continue;}
    if(seenTrips.has(key)){duplicates.push({id,reason:'POSSIBLE_CROSS_POST_REVIEW'});continue;}
    seen.add(id);seenPostTrips.add(r.post_id+'|'+postTrip(r));seenTrips.add(key);
    const record={gp_id:id,role:'GP',nom:r.operator,ville_depart:r.origin,ville_arrivee:r.destination,
      date_depart:date,date_expiration:date+'T23:59:59Z',statut:'A_VERIFIER',source:r.source_url,
      date_source:typeof r.date_as_posted==='string'?r.date_as_posted:date,
      prix_kg:typeof r.price_per_kg==='number'&&Number.isFinite(r.price_per_kg)&&r.price_per_kg>=0?r.price_per_kg:'',
      devise:/^[A-Z]{3}$/.test(r.currency||'')?r.currency:'',
      capacite_kg:typeof r.capacity_kg==='number'&&Number.isFinite(r.capacity_kg)&&r.capacity_kg>0?r.capacity_kg:'',
      objets_acceptes:typeof r.accepted_items==='string'?r.accepted_items:'',tarif_texte:typeof r.price_terms==='string'?r.price_terms:''};
    if(record.prix_kg!==''&&!record.devise) {record.prix_kg='';}
    for(const [side,suffix] of [['origin','depart'],['destination','arrivee']]) {
      const place=r[side+'_place'];
      if(!place||place.source_verified!==true) continue;
      record['quartier_'+suffix]=place.neighborhood||'';
      record['lieu_'+suffix+'_texte']=place.text||'';
      const geo=place.geocode;
      const valid=geo?.verified===true&&typeof geo.lat==='number'&&typeof geo.lng==='number'&&Number.isFinite(geo.lat)&&Number.isFinite(geo.lng)&&Math.abs(geo.lat)<=90&&Math.abs(geo.lng)<=180&&geo.country===r[side+'_country']&&['ville_approx','commune_approx','quartier_approx','adresse'].includes(geo.precision);
      record['precision_gps_'+suffix]=valid?geo.precision:'A_VERIFIER';
      if(valid){record['lat_'+suffix]=geo.lat;record['lng_'+suffix]=geo.lng;record['geocodage_'+suffix]=geo.formatted_address||place.text;}
    }
    rows.push(headers.map(k=>{const v=record[k]??'';return typeof v==='string'&&/^[=+\-@\t\r]/.test(v)?"'"+v:v;}));
  }
  return {rows,review,duplicates};
}
