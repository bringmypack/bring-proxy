// Pure matching. Coordinates, contacts and historical rows are not public outputs.
export function matchPublications(own,candidates,today){
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const quarter=v=>{const s=norm(v).replace(/\b(?:quartier|arrondissement)\b/g,'').trim();return /^(?:non precise|ville uniquement|inconnu|je ne sais pas)$/.test(s)?'':s;};
 const sameQuarter=(a,b)=>{a=quarter(a);if(!a||!quarter(b))return null;return String(b).split(/[;|]/).some(v=>quarter(v)===a);};
 const out=[];
 for(const target of candidates){
  if(target.id===own.id||target.status!=='ACTIF'||target.date_from<today&&target.date_to<today)continue;
  if(norm(own.origin)!==norm(target.origin)||norm(own.destination)!==norm(target.destination))continue;
  const gp=own.role==='GP'?own:target,colis=own.role==='GP'?target:own;
  if(gp.role!=='GP'||colis.role!=='EXPEDITEUR'||gp.date_from<colis.date_from||gp.date_from>colis.date_to||gp.date_from<today)continue;
  if(typeof gp.capacity_kg==='number'&&typeof colis.weight_kg==='number'&&gp.capacity_kg<colis.weight_kg)continue;
  const dep=sameQuarter(own.origin_neighborhood,target.origin_neighborhood),arr=sameQuarter(own.destination_neighborhood,target.destination_neighborhood);
  const score=(dep===true?4:dep===null?1:0)+(arr===true?4:arr===null?1:0)+(typeof gp.capacity_kg==='number'?1:0);
  out.push({id:target.id,role:target.role,name:target.name,origin:target.origin,destination:target.destination,date_from:target.date_from,date_to:target.date_to,
   origin_neighborhood:target.origin_neighborhood||null,destination_neighborhood:target.destination_neighborhood||null,capacity_kg:target.capacity_kg??null,weight_kg:target.weight_kg??null,
   contents:target.contents||null,price_terms:target.price_terms||null,source_url:target.source_url||null,
   origin_neighborhood_match:dep,destination_neighborhood_match:arr,
   match_quality:dep===true&&arr===true?'quartiers_identiques':'meme_trajet_quartiers_a_confirmer',availability_confirmed:false,contents_to_confirm:true,_score:score});
 }
 return out.sort((a,b)=>b._score-a._score||a.date_from.localeCompare(b.date_from)).slice(0,10).map(r=>{delete r._score;return r;});
}
