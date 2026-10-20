import {randomUUID} from 'node:crypto';
import {CARD_URI,widgetHtml,SHIPMENT_CARD_URI,shipmentWidgetHtml} from '../lib/travel-card.js';
import {SCRIPT_URL,SPREADSHEET_ID} from '../lib/config.js';
export {SCRIPT_URL,SPREADSHEET_ID};
const origins=new Set(['https://chatgpt.com','https://chat.openai.com']);
const common={
 request_id:{type:'string',pattern:'^[a-zA-Z0-9_-]{16,100}$',description:'Use the preparation UUID and reuse it unchanged after timeout/retry.'},
 nom:{type:'string',minLength:1,maxLength:100,description:'Name chosen by this publisher; ask if missing.'},
 telephone:{type:'string',pattern:'^\\+?[1-9][0-9]{7,14}$',description:'Publisher contact with country code. Ask; never reuse another person’s number.'},
 ville_depart:{type:'string',minLength:1,maxLength:250},ville_arrivee:{type:'string',minLength:1,maxLength:250},
 quartier_depart:{type:'string',minLength:1,maxLength:250,description:'Ask for the departure neighbourhood/commune. If explicitly unknown, use Ville uniquement; never invent.'},
 quartier_arrivee:{type:'string',minLength:1,maxLength:250,description:'Ask for the arrival neighbourhood/commune. If explicitly unknown, use Ville uniquement; never invent.'},
 contact_match_consent:{type:'boolean',description:'True only after explicit consent to share this contact with users who request it for a matching published announcement; false keeps it private.'},
 confirmed:{type:'boolean',const:true,description:'True only after this publisher confirms the reviewed announcement and contact data.'},
 dry_run:{type:'boolean',description:'Validate only; never announce a dry run as saved.'}
};
const day={type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'};
const gp={...common,date_depart:day,capacite_kg:{type:'number',exclusiveMinimum:0,maximum:10000},objets_acceptes:{type:'string',minLength:1,maxLength:1000},tarif_texte:{type:'string',minLength:1,maxLength:200},prix_kg:{type:'number',minimum:0},devise:{type:'string',pattern:'^[A-Z]{3}$'}};
const sender={...common,date_souhaitee:day,date_fin_souhaitee:{...day,description:'Optional last accepted date; omit for a fixed date. Never broaden dates without consent.'},poids:{type:'number',exclusiveMinimum:0,maximum:10000},contenu:{type:'string',minLength:1,maxLength:1000}};
const identity=['request_id','nom','telephone','ville_depart','ville_arrivee','quartier_depart','quartier_arrivee','confirmed'];
const annotations=read=>({readOnlyHint:read,destructiveHint:false,idempotentHint:true,openWorldHint:true});
const schema=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
export const tools=[
 {name:'prepare_departure',title:'Préparer mon voyage',description:'Show the editable GP card. Fill only known information, including both neighbourhoods. No save. Never redirect the publisher to copy an ad to Facebook.',inputSchema:schema(gp),_meta:{ui:{resourceUri:CARD_URI,visibility:['model']},'openai/outputTemplate':CARD_URI},annotations:annotations(true)},
 {name:'publish_departure',title:'Publier mon voyage',description:'After confirmation, save the GP trip in the BringMyPack catalogue (ACTIF, source Chat-GP), then search matching published sender requests. Missing fields must be requested, not replaced by a Facebook-copy workflow. No payment or automatic message.',inputSchema:schema(gp,[...identity,'date_depart','capacite_kg','objets_acceptes','tarif_texte']),_meta:{ui:{visibility:['model','app']}},annotations:annotations(false)},
 {name:'publication_status',title:'Vérifier mon voyage',description:'Resolve an uncertain GP publication using the same request UUID. Returns the receipt and matching result, never a private contact directory.',inputSchema:schema({request_id:common.request_id},['request_id']),_meta:{ui:{visibility:['model','app']}},annotations:annotations(true)},
 {name:'prepare_shipment',title:'Préparer ma demande de transport',description:'Show the editable sender request card, including both neighbourhoods, weight, contents and confirmed date range. No save. Offer after no suitable GP was found, or on an explicit publication request.',inputSchema:schema(sender),_meta:{ui:{resourceUri:SHIPMENT_CARD_URI,visibility:['model']},'openai/outputTemplate':SHIPMENT_CARD_URI},annotations:annotations(true)},
 {name:'publish_shipment',title:'Publier ma demande de transport',description:'After sender confirmation, save the parcel request in EXPEDITEURS_COLIS (ACTIF, source Chat-GP), then search compatible GP trips by direction, dates, weight and neighbourhoods. No booking, payment or automatic message.',inputSchema:schema(sender,[...identity,'date_souhaitee','poids','contenu']),_meta:{ui:{visibility:['model','app']}},annotations:annotations(false)},
 {name:'shipment_publication_status',title:'Vérifier ma demande',description:'Resolve an uncertain sender publication using its unchanged UUID.',inputSchema:schema({request_id:common.request_id},['request_id']),_meta:{ui:{visibility:['model','app']}},annotations:annotations(true)},
 {name:'publication_matches',title:'Rechercher mes correspondances',description:'Recheck matches for a saved publication. Pass its private request UUID and kind. Returns only published announcements; never historical private rows or contact numbers.',inputSchema:schema({request_id:common.request_id,kind:{type:'string',enum:['GP','EXPEDITEUR']}},['request_id','kind']),_meta:{ui:{visibility:['model','app']}},annotations:annotations(true)},
 {name:'get_match_contact',title:'Contacter cette correspondance',description:'Only after the user explicitly asks to contact a match. Requires their own saved publication UUID and a returned match id. Shares contact details only when the matched publisher opted in; Facebook matches return their public source link. No message is sent.',inputSchema:schema({request_id:common.request_id,kind:{type:'string',enum:['GP','EXPEDITEUR']},match_id:{type:'string',minLength:3,maxLength:150},confirmed:{type:'boolean',const:true}},['request_id','kind','match_id','confirmed']),_meta:{ui:{visibility:['model','app']}},annotations:annotations(true)}
];
export async function callScript(payload,fetcher=fetch){
 const response=await fetcher(SCRIPT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'follow',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('SERVICE_UNAVAILABLE');let data;try{data=JSON.parse(await response.text());}catch{throw Error('SERVICE_INVALID_RESPONSE');}return data;
}
function validateArguments(tool,value){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const s=tool.inputSchema;
 if(Object.keys(value).some(k=>!s.properties[k])||s.required.some(k=>!(k in value)))return false;
 for(const[k,v]of Object.entries(value)){const r=s.properties[k];if(typeof v!==r.type||r.const!==undefined&&v!==r.const||r.enum&&!r.enum.includes(v))return false;
 if(r.type==='string'&&(r.minLength&&v.trim().length<r.minLength||r.maxLength&&v.length>r.maxLength||r.pattern&&!new RegExp(r.pattern).test(v)))return false;
 if(r.type==='number'&&(!Number.isFinite(v)||r.exclusiveMinimum!==undefined&&v<=r.exclusiveMinimum||r.minimum!==undefined&&v<r.minimum||r.maximum!==undefined&&v>r.maximum))return false;}
 return value.prix_kg===undefined||/^[A-Z]{3}$/.test(value.devise||'');
}
const toolResult=(data,error=false)=>({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,...(error?{isError:true}:{})});
async function matching(upstream,args,kind){
 try{const r=await upstream({action:'findMatchesForPublication',request_id:args.request_id,kind});
 if(r.success!==true||!Array.isArray(r.results))return {status:'unavailable',total:null,results:[],contact_sent:false};
 const keys=['id','role','name','origin','destination','date_from','date_to','origin_neighborhood','destination_neighborhood','capacity_kg','weight_kg','contents','price_terms','source_url','origin_neighborhood_match','destination_neighborhood_match','match_quality','availability_confirmed','contents_to_confirm'];
 return {status:'complete',total:r.results.length,results:r.results.map(row=>Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]))),contact_sent:false};
 }catch{return {status:'unavailable',total:null,results:[],contact_sent:false};}
}
export async function dispatch(message,upstream=callScript){
 const id=message.id??null,result=value=>({jsonrpc:'2.0',id,result:value}),error=(code,text)=>({jsonrpc:'2.0',id,error:{code,message:text}});
 if(message.method==='initialize')return result({protocolVersion:'2025-03-26',capabilities:{tools:{},resources:{}},serverInfo:{name:'bringmypack-publication',version:'2.0.0'},instructions:'Publish confirmed GP trips and sender requests directly in BringMyPack, then match. Ask for both neighbourhoods. Search tools remain available in the catalogue connection. Never replace publication with copying to Facebook. Payments and automatic contact notifications are inactive.'});
 if(message.method==='ping')return result({});if(message.method==='tools/list')return result({tools});
 if(message.method==='resources/list')return result({resources:[{uri:CARD_URI,name:'Votre voyage BringMyPack',mimeType:'text/html;profile=mcp-app'},{uri:SHIPMENT_CARD_URI,name:'Votre demande BringMyPack',mimeType:'text/html;profile=mcp-app'}]});
 if(message.method==='resources/read'){const uri=message.params?.uri;if(![CARD_URI,SHIPMENT_CARD_URI].includes(uri))return error(-32602,'Unknown resource');return result({contents:[{uri,mimeType:'text/html;profile=mcp-app',text:uri===CARD_URI?widgetHtml:shipmentWidgetHtml,_meta:{ui:{prefersBorder:false,csp:{connectDomains:[],resourceDomains:[]}}}}]});}
 if(message.method!=='tools/call')return error(-32601,'Method not found');const tool=tools.find(t=>t.name===message.params?.name);if(!tool)return error(-32602,'Unknown tool');const args=message.params?.arguments;
 if(!validateArguments(tool,args))return result(toolResult({saved:false,error:'INVALID_ARGUMENTS'},true));
 const isSender=/shipment/.test(tool.name),kind=isSender?'EXPEDITEUR':'GP';
 if(tool.name.startsWith('prepare_')){let ready=false;try{const c=await upstream({action:'publicationCapabilities'});ready=c.success===true&&c.spreadsheet_id===SPREADSHEET_ID&&(isSender?c.write_shipments:c.write_requests)===true;}catch{}
 const preview={...args};delete preview.dry_run;delete preview.request_id;delete preview.confirmed;return result(toolResult({saved:false,ready,kind,preview,request_id:args.request_id||randomUUID(),payments:false}));}
 if(tool.name==='get_match_contact'){try{const r=await upstream({...args,action:'getMatchContact'});if(r.success!==true)return result(toolResult({error:r.error||'CONTACT_UNAVAILABLE',contact_shared:false},true));return result(toolResult({contact_shared:r.contact_shared===true,contact:r.contact_shared===true?{nom:r.contact.nom,telephone:r.contact.telephone}:null,source_url:r.source_url||null,message_sent:false}));}catch{return result(toolResult({error:'CONTACT_UNAVAILABLE',contact_shared:false},true));}}
 if(tool.name==='publication_matches'){const m=await matching(upstream,args,args.kind);return result(toolResult({saved:false,matching:m},m.status!=='complete'));}
 try{
 const c=await upstream({action:'publicationCapabilities'});if(c.success!==true||c.spreadsheet_id!==SPREADSHEET_ID||(isSender?c.write_shipments:c.write_requests)!==true)return result(toolResult({saved:false,error:'PUBLICATION_NOT_READY',payments:false},true));
 const action=tool.name==='publish_departure'?'publishGP':tool.name==='publish_shipment'?'publishShipment':isSender?'getShipmentPublicationStatus':'getPublicationStatus';
 const data=await upstream({...args,action});
 if(data.success!==true)return result(toolResult({saved:false,error:typeof data.error==='string'?data.error:'SAVE_UNCONFIRMED',request_id:args.request_id},true));
 if(data.dry_run===true)return result(toolResult({saved:false,valid:true,dry_run:true,request_id:args.request_id,payments:false}));
 if(data.found===false)return result(toolResult({saved:false,found:false,request_id:args.request_id}));
 if(data.spreadsheet_id!==SPREADSHEET_ID||data.sheet!==(isSender?'EXPEDITEURS_COLIS':'GP_TRANSPORTEURS')||!data.id||data.request_id!==args.request_id||!Number.isInteger(data.row)||data.row<2)return result(toolResult({saved:false,error:'SAVE_UNCONFIRMED',request_id:args.request_id},true));
 const matches=await matching(upstream,args,kind);
 return result(toolResult({saved:true,status:isSender?'Demande enregistrée':'Voyage enregistré',kind,id:data.id,request_id:args.request_id,duplicate:data.duplicate===true,matching:matches,contact_enabled:data.contact_enabled===true,payments:false,contact_sent:false}));
 }catch{return result(toolResult({saved:false,outcome:'unknown',request_id:args.request_id,error:'CHECK_STATUS_BEFORE_RETRY',payments:false},true));}
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');const origin=req.headers?.origin;if(origin&&!origins.has(origin))return res.status(403).json({error:'Origin not allowed'});
 if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept, MCP-Protocol-Version');return res.status(204).end();}
 if(req.method!=='POST'){res.setHeader('Allow','POST, OPTIONS');return res.status(405).end();}let body=req.body;try{if(typeof body==='string')body=JSON.parse(body);}catch{return res.status(400).json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}});}
 if(!body||typeof body!=='object'||Array.isArray(body)||body.jsonrpc!=='2.0'||typeof body.method!=='string'||JSON.stringify(body).length>20000)return res.status(400).json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid Request'}});
 if(!Object.prototype.hasOwnProperty.call(body,'id'))return res.status(202).end();return res.status(200).json(await dispatch(body));
}
