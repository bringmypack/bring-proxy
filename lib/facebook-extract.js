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
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const raw=[post.text,post.ocr_text,...imageTexts].filter(Boolean).join('\n').slice(0,60000);
  const text=norm(raw).replace(/[^\x20-\x7E\n€→]/g,' ');
  const fail=reason=>({records:[],review:{source_url:post.source_url,post_id:post.post_id,operator:post.author,reason,
    evidence:redactFacebookContacts(raw).slice(0,14000)}});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today))throw Error('INVALID_TODAY');
  if(!raw.trim())return fail('IMAGE_TEXT_REQUIRED');
  if(/(?:je\s+(?:cherche|recherche)|cherche\s+(?:un|une)\s+(?:gp|voyageur)|besoin\s+d[' ]un\s+gp)/.test(text))return fail('SENDER_REQUEST');
  const cities=[
    ['saint louis','Saint-Louis','SN'],['dakar','Dakar','SN'],['thies','Thiès','SN'],['mbour','Mbour','SN'],['touba','Touba','SN'],['ziguinchor','Ziguinchor','SN'],['kolda','Kolda','SN'],
    ['paris','Paris','FR'],['lyon','Lyon','FR'],['marseille','Marseille','FR'],['toulouse','Toulouse','FR'],['lille','Lille','FR'],['nice','Nice','FR'],['bordeaux','Bordeaux','FR'],['nantes','Nantes','FR'],['montpellier','Montpellier','FR']
  ];
  const byName=new Map(cities.map(c=>[c[0],c]));
  const cityPattern=cities.map(c=>c[0].replace(/ /g,'[- ]')).join('|');
  const routes=[...text.matchAll(new RegExp('\\b('+cityPattern+')\\s*(?:[-/>→]+|vers|pour)\\s*('+cityPattern+')\\b','g'))]
    .map(m=>({start:m.index,end:m.index+m[0].length,origin:byName.get(m[1].replace(/-/g,' ')),destination:byName.get(m[2].replace(/-/g,' '))}))
    .filter(r=>r.origin[2]!==r.destination[2]);
  if(!routes.length)return fail('ROUTE_REQUIRED');
  if(!post.author||post.author.trim().length<2)return fail('AUTHOR_REQUIRED');
  const monthNames=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
  const dateRegex=new RegExp('\\b(\\d{1,2})\\s+('+monthNames.join('|')+')\\s+(20\\d{2})\\b|\\b(20\\d{2})-(\\d{2})-(\\d{2})\\b|\\b(\\d{1,2})[/.](\\d{1,2})[/.](20\\d{2})\\b','g');
  const valid=d=>!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  const dates=s=>[...s.matchAll(dateRegex)].map(m=>m[1]?[m[3],monthNames.indexOf(m[2])+1,m[1]]:m[4]?[m[4],m[5],m[6]]:[m[9],m[8],m[7]])
    .map(a=>a.map((v,i)=>i?String(v).padStart(2,'0'):String(v)).join('-')).filter(valid);
  const allDates=[...new Set(dates(text))];
  // Relative expressions must agree with explicit image dates. No implicit year.
  const relative=/\bapres[- ]demain\b/.test(text)?2:/\bdemain\b/.test(text)?1:/\baujourd hui\b/.test(text)?0:null;
  if(relative!==null&&post.posted_at&&allDates.length===1){
    const d=new Date(post.posted_at);if(!isNaN(d)){
      const local=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
      const expected=new Date(local+'T12:00:00Z');expected.setUTCDate(expected.getUTCDate()+relative);
      if(allDates[0]!==expected.toISOString().slice(0,10))return fail('DATE_CONFLICT');
    }
  }
  const priceMatches=[...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(€|eur|fcfa|f\s*cfa|cfa|xof)\s*(?:\/|par|le)?\s*(?:kg|kilo)/g)];
  const prices=[...new Set(priceMatches.map(m=>Number(m[1].replace(',','.'))+'|'+(/eur|€/.test(m[2])?'EUR':'XOF')))];
  const locations=[
    {re:/parcelles\s+assainies(?:\s*(?:unite|u)\s*[- ]?\s*(\d{1,2}))?/g,country:'SN',city:'Dakar',label:m=>'Parcelles Assainies'+(m[1]?' unité '+m[1]:''),precision:'quartier_approx'},
    {re:/\bouakam\b/g,country:'SN',city:'Dakar',label:()=> 'Ouakam',precision:'quartier_approx'},
    {re:/\bscat[- ]?urbam\b/g,country:'SN',city:'Dakar',label:()=> 'Scat Urbam',precision:'quartier_approx'},
    {re:/\bsoprim\b/g,country:'SN',city:'Dakar',label:()=> 'Soprim',precision:'quartier_approx'},
    {re:/\b(?:yoff|medina|mermoz|sacre[- ]coeur|hlm(?:\s+\d+)?)\b/g,country:'SN',city:'Dakar',label:m=>m[0],precision:'quartier_approx'},
    {re:/\bngor(?:\s+almadies)?\b/g,country:'SN',city:'Dakar',label:m=>m[0],precision:'quartier_approx'},
    {re:/\bvitry[- ]sur[- ]seine\b/g,country:'FR',city:'Paris',label:()=> 'Vitry-sur-Seine',precision:'commune_approx'},
    {re:/\bcergy\b/g,country:'FR',city:'Paris',label:()=> 'Cergy',precision:'commune_approx'},
    {re:/\bparis\s+(1[0-9]|20|[1-9])(?:eme|ieme|e)\b/g,country:'FR',city:'Paris',label:m=>'Paris '+m[1]+'e',precision:'quartier_approx'}
  ];
  const foundPlaces=[];
  locations.forEach(rule=>{for(const m of text.matchAll(rule.re))foundPlaces.push({...rule,name:rule.label(m)});});
  if(/\b(?:rue|avenue|boulevard|impasse)\b/.test(text))return fail('ADDRESS_REVIEW_REQUIRED');
  if(/\b(?:quartier|adresse|depot|retrait)\b/.test(text)&&!foundPlaces.length)return fail('LOCATION_REVIEW_REQUIRED');
  const out=[];
  for(let i=0;i<routes.length;i++){
    const route=routes[i],next=routes[i+1]?.start??text.length;
    let ownDates=[...new Set(dates(text.slice(route.end,next)))];
    if(!ownDates.length&&routes.length===1)ownDates=allDates;
    if(ownDates.length!==1)return fail('DATE_ROUTE_AMBIGUOUS');
    const date=ownDates[0];if(date<today)continue;
    const ahead=(new Date(date+'T12:00:00Z')-new Date(today+'T12:00:00Z'))/86400000;
    if(ahead>366)return fail('DATE_TOO_FAR');
    const weekday=text.slice(route.end,next).match(/\b(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)\s*(?=\d)/);
    if(weekday&&['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'].indexOf(weekday[1])!==new Date(date+'T12:00:00Z').getUTCDay())return fail('WEEKDAY_CONFLICT');
    const r={group_id:post.group_id,post_id:post.post_id,source_url:post.source_url,source_verified:true,year_verified:true,
      kind:'traveller_offer',operator:'Annonce de '+post.author.trim(),origin:route.origin[1],destination:route.destination[1],
      origin_country:route.origin[2],destination_country:route.destination[2],departure_date:date,
      date_as_posted:'Date explicite '+date+'; texte original/OCR. Disponibilité à confirmer.'};
    if(prices.length===1){const [p,c]=prices[0].split('|');r.price_per_kg=Number(p);r.currency=c;}
    for(const side of ['origin','destination']){
      const matches=foundPlaces.filter(p=>p.country===r[side+'_country']&&p.city===r[side]);
      const unique=[...new Map(matches.map(p=>[p.name,p])).values()];
      if(unique.length){
        const names=unique.map(p=>p.name),country=r[side+'_country'];
        r[side+'_place']={source_verified:true,text:names.join('; ')+', '+r[side]+', '+(country==='FR'?'France':'Sénégal'),
          neighborhood:names.join('; '),query:unique.length===1?names[0]+', '+r[side]+', '+(country==='FR'?'France':'Sénégal'):'',
          match_tokens:unique.length===1?norm(names[0]).split(/[- ]+/).filter(v=>!['sur','seine','unite','e'].includes(v)).slice(0,4):[],
          precision:unique.length===1?unique[0].precision:'A_VERIFIER'};
      } else r[side+'_place']={source_verified:true,text:r[side]+', '+(r[side+'_country']==='FR'?'France':'Sénégal'),neighborhood:'',
        query:r[side]+', '+(r[side+'_country']==='FR'?'France':'Sénégal'),match_tokens:[norm(r[side])],precision:'ville_approx'};
    }
    out.push(r);
  }
  if(!out.length)return fail('EXPIRED');
  if(post.images?.length&&!imageTexts.length&&!post.ocr_text)return fail('IMAGE_TEXT_REQUIRED');
  return {records:out,review:null};
}
