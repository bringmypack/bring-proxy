// Deterministic extraction; no language-model calls. Ambiguity goes to review.
export function normalizeFacebookPost(item, sources) {
  const u=String(item?.url||'').split(/[?#]/)[0].replace(/\/?$/,'/');
  const m=u.match(/^https:\/\/www\.facebook\.com\/groups\/([^/]+)\/(?:posts|permalink)\/(\d+)\/$/);
  if(!m) throw Error('INVALID_SOURCE');
  const group=m[1]==='1393509021402141'?'gpfrancesenegal':m[1];
  if(!sources.some(s=>s.id===group && s.enabled && s.visibility==='public' && s.public_import!==false))throw Error('SOURCE_NOT_PUBLIC');
  const parts=[], images=new Map(), ocr=[];
  const push=(v)=>{if(typeof v==='string'&&v.trim()&&!parts.includes(v.trim()))parts.push(v.trim());};
  push(item.text);push(item.sharedPost?.text);
  const walk=(v,depth=0)=>{
    if(!v||typeof v!=='object'||depth>9)return;
    if(typeof v.ocrText==='string'&&!/^(?:May be|Peut être|No text)/i.test(v.ocrText))ocr.push(v.ocrText);
    const image=v.photo_image||v.image||v.thumbnail;
    const url=image?.uri||image?.url||(typeof v.uri==='string'?v.uri:null);
    if(url&&isFacebookImageUrl(url))images.set(String(v.id||url.split('?')[0]),{id:String(v.id||url.split('?')[0]),url});
    for(const key of ['attachments','media','sharedPost']) {
      const a=v[key];if(Array.isArray(a))a.forEach(x=>walk(x,depth+1));else walk(a,depth+1);
    }
  };walk(item);
  return {group_id:group,post_id:m[2],source_url:'https://www.facebook.com/groups/'+group+'/permalink/'+m[2]+'/',
    posted_at:item.sharedPost?.time||item.time,author:item.sharedPost?.user?.name||item.sharedPost?.pageName||item.user?.name||'',
    text:parts.join('\n').slice(0,30000),ocr_text:ocr.join('\n').slice(0,30000),images:[...images.values()].slice(0,6)};
}

export function isFacebookImageUrl(url) {
  return typeof url==='string'&&/^https:\/\/scontent[-.][a-z0-9.-]+\.fbcdn\.net(?::443)?\/[^\s]*$/i.test(url);
}

export function redactFacebookContacts(text) {
  return String(text||'').replace(/(?:\+|00)(?:33|221)(?:[ .-]*\d){8,10}/g,'[CONTACT]')
    .replace(/\b(?:0[1-9]|7[05678])(?:[ .-]*\d){7,8}\b/g,'[CONTACT]');
}

export function extractFacebookOffers(post, imageTexts, today) {
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,' ');
  const raw=[post.text,post.ocr_text,...imageTexts].filter(Boolean).join('\n\n').slice(0,60000);
  const text=norm(raw).replace(/[^\x20-\x7E\n€→]/g,' ');
  const fail=reason=>({records:[],review:{source_url:post.source_url,post_id:post.post_id,operator:post.author,reason,evidence:redactFacebookContacts(raw).slice(0,14000)}});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today))throw Error('INVALID_TODAY');
  if(!raw.trim())return fail('IMAGE_TEXT_REQUIRED');
  if(/(?:je\s+(?:cherche|recherche)|cherche\s+(?:un|une)\s+(?:gp|voyageur)|besoin\s+d[ ]un\s+gp)/.test(text))return fail('SENDER_REQUEST');
  const cities=[['saint louis','Saint-Louis','SN'],['dakar','Dakar','SN'],['thies','Thiès','SN'],['mbour','Mbour','SN'],['touba','Touba','SN'],['ziguinchor','Ziguinchor','SN'],['kolda','Kolda','SN'],['paris','Paris','FR'],['lyon','Lyon','FR'],['marseille','Marseille','FR'],['toulouse','Toulouse','FR'],['lille','Lille','FR'],['nice','Nice','FR'],['bordeaux','Bordeaux','FR'],['nantes','Nantes','FR'],['montpellier','Montpellier','FR']];
  const byName=new Map(cities.map(c=>[c[0],c])),cityPattern=cities.map(c=>c[0].replace(/ /g,'[- ]')).join('|');
  const routeMatches=separator=>[...text.matchAll(new RegExp('\\b('+cityPattern+')'+separator+'('+cityPattern+')\\b','g'))].map(m=>({start:m.index,end:m.index+m[0].length,origin:byName.get(m[1].replace(/-/g,' ')),destination:byName.get(m[2].replace(/-/g,' '))})).filter(r=>r.origin[2]!==r.destination[2]);
  // A separator is optional on common poster headers: PARIS DAKAR.
  const explicitRoutes=routeMatches('\\s*(?:[-/>→]+|vers|pour|a)\\s*');
  const plainRoutes=routeMatches('[ \\t]+').filter(p=>!explicitRoutes.some(e=>p.start<e.end&&p.end>e.start));
  const routes=[...explicitRoutes,...plainRoutes].sort((a,b)=>a.start-b.start);
  if(!routes.length)return fail('ROUTE_REQUIRED');
  if(!post.author||post.author.trim().length<2)return fail('AUTHOR_REQUIRED');
  const routeKeys=new Set(routes.map(r=>r.origin[1]+'|'+r.destination[1]));
  const monthNames=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
  const dateRegex=new RegExp('\\b(\\d{1,2})\\s+('+monthNames.join('|')+')\\s+(20\\d{2})\\b|\\b(20\\d{2})-(\\d{2})-(\\d{2})\\b|\\b(\\d{1,2})[/.\\-](\\d{1,2})[/.\\-](20\\d{2})\\b','g');
  const valid=d=>!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  const dateEntries=s=>[...s.matchAll(dateRegex)].map(m=>({index:m.index,date:(m[1]?[m[3],monthNames.indexOf(m[2])+1,m[1]]:m[4]?[m[4],m[5],m[6]]:[m[9],m[8],m[7]]).map((v,i)=>i?String(v).padStart(2,'0'):String(v)).join('-')})).filter(e=>valid(e.date));
  const dates=s=>dateEntries(s).map(e=>e.date),allDates=[...new Set(dates(text))];
  if(!allDates.length)return fail(/\btou[st]\s+les\s+jours\b/.test(text)?'RECURRING_SCHEDULE_REQUIRED':'DATE_YEAR_REQUIRED');
  const relative=/\bapres[- ]demain\b/.test(text)?2:/\bdemain\b/.test(text)?1:/\baujourd hui\b/.test(text)?0:null;
  if(relative!==null&&post.posted_at&&allDates.length===1){
    const d=new Date(post.posted_at);if(!isNaN(d)){
      const local=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
      const expected=new Date(local+'T12:00:00Z');expected.setUTCDate(expected.getUTCDate()+relative);
      if(allDates[0]!==expected.toISOString().slice(0,10))return fail('DATE_CONFLICT');
    }
  }
  const prices=[...new Set([...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(€|eur|fcfa|f\s*cfa|cfa|xof)\s*(?:\/|par|le)?\s*(?:kg|kilo)/g)].map(m=>Number(m[1].replace(',','.'))+'|'+(/eur|€/.test(m[2])?'EUR':'XOF')))];
  const locations=[
    {re:/\bparcelles(?:\s+assainies?)?(?:\s*(?:unite|u)\s*[- ]?\s*(\d{1,2}))?/g,country:'SN',city:'Dakar',label:m=>'Parcelles Assainies'+(m[1]?' unité '+m[1]:''),precision:'quartier_approx'},
    {re:/\bouakam\b/g,country:'SN',city:'Dakar',label:()=> 'Ouakam',precision:'quartier_approx'},
    {re:/\bscat[- ]?urbam\b/g,country:'SN',city:'Dakar',label:()=> 'Scat Urbam',precision:'quartier_approx'},
    {re:/\bsoprim\b/g,country:'SN',city:'Dakar',label:()=> 'Soprim',precision:'quartier_approx'},
    {re:/\b(?:yoff|medina|mermoz|sacre[- ]coeur|hlm(?:\s+\d+)?|yeumbeul|ponty|sandaga|maristes?|liberte\s+[1-6](?:\s+extension)?)\b/g,country:'SN',city:'Dakar',label:m=>m[0],precision:'quartier_approx'},
    {re:/\bguediawaye\b/g,country:'SN',city:'Dakar',label:m=>m[0],precision:'commune_approx'},
    {re:/\bouest[- ]foire\b/g,country:'SN',city:'Dakar',label:()=> 'Ouest-Foire',precision:'quartier_approx'},
    {re:/\bngor(?:\s+almadies)?\b/g,country:'SN',city:'Dakar',label:m=>m[0],precision:'quartier_approx'},
    {re:/\bvitry[- ]sur[- ]seine\b/g,country:'FR',city:'Paris',label:()=> 'Vitry-sur-Seine',precision:'commune_approx'},
    {re:/\bcergy\b/g,country:'FR',city:'Paris',label:()=> 'Cergy',precision:'commune_approx'},
    {re:/\blimeil[- ]brevannes\b/g,country:'FR',city:'Paris',label:()=> 'Limeil-Brévannes',precision:'commune_approx'},
    {re:/\bfresnes\b/g,country:'FR',city:'Paris',label:()=> 'Fresnes',precision:'commune_approx'},
    {re:/\bparis\s+(1[0-9]|20|[1-9])(?:eme|ieme|e)\b/g,country:'FR',city:'Paris',label:m=>'Paris '+m[1]+'e',precision:'quartier_approx'}
  ];
  const lines=raw.replace(/\r/g,'').split('\n').map(s=>({raw:s.trim(),text:norm(s)})),foundPlaces=[],addresses=[],locationNotes=[];
  let countryContext='',unknownAddress=false;
  const streetRe=/(?:\b\d{1,4}(?:\s*(?:bis|ter))?\s*|\b)(?:rue|allee|avenue|boulevard|impasse)\b/g;
  for(let n=0;n<lines.length;n++){
    const line=lines[n];
    if(!line.text.trim())countryContext='';
    if(/adresses?\s+(?:au|en)\s+senegal|^\s*(?:senegal|dakar)\s*:/.test(line.text))countryContext='SN';
    if(/(?:retrait|adresses?|reception).*\b(?:paris|france)\b|^\s*france\s*:/.test(line.text))countryContext='FR';
    if(countryContext&&/\b(?:arret|terminus|brt|rond[- ]point|cote|gare|extension|case|gued)/.test(line.text))locationNotes.push({country:countryContext,city:countryContext==='SN'?'Dakar':'Paris',text:line.raw});
    for(const rule of locations)for(const m of line.text.matchAll(rule.re))foundPlaces.push({...rule,name:rule.label(m),line:line.raw});
    const matches=[...line.text.matchAll(streetRe)];
    for(let k=0;k<matches.length;k++){
      const m=matches[k],end=matches[k+1]?.index??line.text.length;
      let fragment=line.raw.slice(m.index,end).trim(),f=norm(fragment);
      const next=lines[n+1];
      if(!/\b(?:75|77|78|91|92|93|94|95)\d{3}\b|\b(?:paris|lyon|marseille|dakar)\b/.test(f)&&next&&next.raw.length<100&&/\b(?:75|77|78|91|92|93|94|95)\d{3}\b|^\s*(?:paris|lyon|marseille|dakar)\b/.test(next.text)&&!new RegExp('(?:'+cityPattern+')\\s*[-/>→]\\s*(?:'+cityPattern+')').test(next.text)){
        fragment+=' '+next.raw;f=norm(fragment);
      }
      const fr=cities.filter(c=>c[2]==='FR'&&new RegExp('\\b'+c[0]+'\\b').test(f));
      const sn=cities.filter(c=>c[2]==='SN'&&new RegExp('\\b'+c[0]+'\\b').test(f));
      const postal=(f.match(/\b((?:75|77|78|91|92|93|94|95)\d{3})\b/)||[])[1];
      const nearby=[...new Set(foundPlaces.filter(p=>p.line===line.raw).map(p=>p.country))];
      let country=postal||fr.length&&!sn.length?'FR':sn.length&&!fr.length?'SN':nearby.length===1?nearby[0]:countryContext;
      if(fr.length&&sn.length)country='';
      const city=country==='FR'?(fr.length===1?fr[0][1]:postal?'Paris':''):country==='SN'?(sn.length===1?sn[0][1]:'Dakar'):'';
      if(!country||!city){unknownAddress=true;continue;}
      const number=(f.match(/^(\d{1,4}(?:\s*(?:bis|ter))?)/)||[])[1];
      addresses.push({text:fragment,country,city,number,postal,precision:number?'adresse':'quartier_approx'});
    }
  }
  if(unknownAddress)return fail('ADDRESS_REVIEW_REQUIRED');
  if(/\b(?:quartier|adresse|depot|retrait)\b/.test(text)&&!foundPlaces.length&&!addresses.length)return fail('LOCATION_REVIEW_REQUIRED');
  const makePlace=(city,country)=>{
    const countryName=country==='FR'?'France':'Sénégal';
    const areas=[...new Map(foundPlaces.filter(p=>p.country===country&&p.city===city).map(p=>[norm(p.name),p])).values()];
    const points=[...new Map(addresses.filter(a=>a.country===country&&a.city===city).map(a=>[norm(a.text),a])).values()];
    const independent=areas.filter(p=>!points.some(a=>norm(a.text).includes(norm(p.name))||p.name.match(/^Paris (\d+)e$/)&&a.postal==='750'+p.name.match(/^Paris (\d+)e$/)[1].padStart(2,'0')));
    const notes=locationNotes.filter(p=>p.country===country&&p.city===city);
    const details=[...new Set([...notes.map(p=>p.text),...points.map(a=>a.text),...areas.map(p=>foundPlaces.some(q=>q.line===p.line&&q.country!==country)||cities.some(c=>c[2]!==country&&new RegExp('\\b'+c[0]+'\\b').test(norm(p.line)))?p.name:p.line).filter(s=>s.length<1000)])];
    const base={source_verified:true,text:details.length?details.join('; ')+', '+city+', '+countryName:city+', '+countryName,neighborhood:areas.map(p=>p.name).join('; ')};
    if(points.length===1&&!independent.length&&!notes.length){
      const a=points[0];return {...base,query:a.text+', '+countryName,match_tokens:norm(a.text).match(/[a-z]+|\d+/g).filter(t=>t.length>2||/^\d+$/.test(t)).slice(0,8),precision:a.precision,street_number:a.number||'',postal_code:a.postal||''};
    }
    if(points.length||areas.length>1||notes.length)return {...base,query:'',match_tokens:[],precision:'A_VERIFIER'};
    if(areas.length===1){const p=areas[0];return {...base,query:p.name+', '+city+', '+countryName,match_tokens:norm(p.name).split(/[- ]+/).filter(v=>!['sur','seine','unite','e'].includes(v)).slice(0,4),precision:p.precision};}
    return {...base,query:city+', '+countryName,match_tokens:[norm(city)],precision:'ville_approx'};
  };
  const out=[],seen=new Set();
  for(let i=0;i<routes.length;i++){
    const route=routes[i],next=routes[i+1]?.start??text.length;
    let ownDates=[...new Set(dates(text.slice(route.end,next)))];
    if(routeKeys.size===1&&allDates.length===1)ownDates=allDates;
    if(ownDates.length!==1)return fail('DATE_ROUTE_AMBIGUOUS');
    const date=ownDates[0];if(date<today)continue;
    if((new Date(date+'T12:00:00Z')-new Date(today+'T12:00:00Z'))/86400000>366)return fail('DATE_TOO_FAR');
    for(const entry of dateEntries(text).filter(e=>e.date===date)){
      const weekday=text.slice(Math.max(0,entry.index-15),entry.index).match(/(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)\s*$/);
      if(weekday&&['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'].indexOf(weekday[1])!==new Date(date+'T12:00:00Z').getUTCDay())return fail('WEEKDAY_CONFLICT');
    }
    const key=route.origin[1]+'|'+route.destination[1]+'|'+date;if(seen.has(key))continue;seen.add(key);
    const r={group_id:post.group_id,post_id:post.post_id,source_url:post.source_url,source_verified:true,year_verified:true,kind:'traveller_offer',operator:'Annonce de '+post.author.trim(),origin:route.origin[1],destination:route.destination[1],origin_country:route.origin[2],destination_country:route.destination[2],departure_date:date,date_as_posted:'Date explicite '+date+'; texte original/OCR. Disponibilité à confirmer.'};
    if(prices.length===1){const [p,c]=prices[0].split('|');r.price_per_kg=Number(p);r.currency=c;}
    r.origin_place=makePlace(r.origin,r.origin_country);r.destination_place=makePlace(r.destination,r.destination_country);out.push(r);
  }
  if(!out.length)return fail('EXPIRED');
  if(post.images?.length&&!imageTexts.length&&!post.ocr_text)return fail('IMAGE_TEXT_REQUIRED');
  return {records:out,review:null};
}
