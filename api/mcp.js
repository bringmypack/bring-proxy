// Additional MCP endpoint. The existing catalogue and /api/proxy are unchanged.
import { randomUUID } from 'node:crypto';
import { CARD_URI, widgetHtml } from '../lib/travel-card.js';
export const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby-j5tKAEK5gBW9-64-lfvNDXdyIBu6davlmz3LAcDPp9JS8LqiFBstMPu6cJSEDfOS/exec';
export const SPREADSHEET_ID = '1KJL7mAtWvrndgrHX_5NjfUciqVX0uMxL63T6XJnRFmE';
const origins = new Set(['https://chatgpt.com', 'https://chat.openai.com']);
const fields = {
  request_id: {type:'string',pattern:'^[a-zA-Z0-9_-]{16,100}$',description:'Generate a UUID for this publication. Reuse it unchanged after any timeout or retry.'},
  nom: {type:'string',minLength:1,maxLength:100,description:'Name the traveller chooses for the announcement.'},
  telephone: {type:'string',pattern:'^\\+?[1-9][0-9]{7,14}$',description:'Traveller WhatsApp/contact number, with country code and no spaces. Ask if missing; never invent.'},
  ville_depart: {type:'string',minLength:1,maxLength:250,description:'Departure city; include a supplied neighbourhood without changing the route.'},
  ville_arrivee: {type:'string',minLength:1,maxLength:250,description:'Arrival city; include a supplied neighbourhood without changing the route.'},
  date_depart: {type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$',description:'Confirmed departure date, YYYY-MM-DD.'},
  capacite_kg: {type:'number',exclusiveMinimum:0,maximum:10000},
  objets_acceptes: {type:'string',minLength:1,maxLength:1000},
  tarif_texte: {type:'string',minLength:1,maxLength:200,description:'Exact offered terms, including À convenir when the price is not set.'},
  prix_kg: {type:'number',minimum:0,description:'Only include a numeric price per kg explicitly supplied by the traveller.'},
  devise: {type:'string',pattern:'^[A-Z]{3}$',description:'Required with prix_kg; confirm currency with the traveller.'},
  dry_run: {type:'boolean',description:'Validate without writing. A dry run is never a saved announcement.'}
};
export const tools = [
  {name:'prepare_departure',title:'Préparer mon voyage',
    description:'Show an editable travel card with real Publish and Modify controls in chat. Pass the traveller details already provided; omit unknown values. This tool does not save or publish anything. Name and WhatsApp can be completed on the card. Use this for a requested preview or preparation, before publication is authorized.',
    inputSchema:{type:'object',properties:fields,required:[],additionalProperties:false},
    _meta:{ui:{resourceUri:CARD_URI,visibility:['model']},'openai/outputTemplate':CARD_URI},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
  {name:'publish_departure',title:'Publier mon voyage',
    description:'Save a traveller announcement to BringMyPack Google Sheets after the traveller explicitly requests publication of the reviewed data and contact number. No booking, payment or Facebook post. Call only for real publication requests. Reuse request_id after any error; use publication_status to resolve an uncertain outcome. dry_run validates without saving.',
    inputSchema:{type:'object',properties:fields,
      required:['request_id','nom','telephone','ville_depart','ville_arrivee','date_depart','capacite_kg','objets_acceptes','tarif_texte'],additionalProperties:false},
    _meta:{ui:{visibility:['model','app']}},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
  {name:'publication_status',title:'Vérifier mon enregistrement',
    description:'Check whether a publication request was saved after a timeout. Returns a receipt only; no private directory or contact details.',
    inputSchema:{type:'object',properties:{request_id:fields.request_id},required:['request_id'],additionalProperties:false},
    _meta:{ui:{visibility:['model','app']}},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}}
];

export async function callScript(payload, fetcher = fetch) {
  const response = await fetcher(SCRIPT_URL, {method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
    redirect:'follow',signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error('SERVICE_UNAVAILABLE');
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('SERVICE_INVALID_RESPONSE'); }
  // Never log or return raw upstream responses, which can contain private data.
  return data;
}

function validateArguments(tool, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const schema = tool.inputSchema;
  if (Object.keys(value).some(k => !schema.properties[k])) return false;
  for (const key of schema.required) if (!(key in value)) return false;
  for (const [key, v] of Object.entries(value)) {
    const rule = schema.properties[key];
    if (typeof v !== rule.type) return false;
    if (rule.type === 'string' && ((rule.minLength && v.trim().length < rule.minLength) ||
        (rule.maxLength && v.length > rule.maxLength) || (rule.pattern && !new RegExp(rule.pattern).test(v)))) return false;
    if (rule.type === 'number' && (!Number.isFinite(v) ||
        (rule.exclusiveMinimum !== undefined && v <= rule.exclusiveMinimum) ||
        (rule.minimum !== undefined && v < rule.minimum) ||
        (rule.maximum !== undefined && v > rule.maximum))) return false;
  }
  return value.prix_kg === undefined || /^[A-Z]{3}$/.test(value.devise || '');
}

function toolResult(data, error = false) {
  return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,...(error ? {isError:true} : {})};
}

export async function dispatch(message, upstream = callScript) {
  const id = message.id ?? null;
  const result = value => ({jsonrpc:'2.0',id,result:value});
  const error = (code, text) => ({jsonrpc:'2.0',id,error:{code,message:text}});
  if (message.method === 'initialize') return result({protocolVersion:'2025-03-26',
    capabilities:{tools:{},resources:{}},serverInfo:{name:'bringmypack-publication',version:'1.1.0'},
    instructions:'This endpoint publishes GP traveller announcements only. Keep the existing BringMyPack catalogue tools for searches. Voice input uses the host microphone when available. Payments are not active.'});
  if (message.method === 'ping') return result({});
  if (message.method === 'tools/list') return result({tools});
  if (message.method === 'resources/list') return result({resources:[{uri:CARD_URI,name:'Votre voyage BringMyPack',mimeType:'text/html;profile=mcp-app'}]});
  if (message.method === 'resources/read') {
    if(message.params?.uri!==CARD_URI)return error(-32602,'Unknown resource');
    return result({contents:[{uri:CARD_URI,mimeType:'text/html;profile=mcp-app',text:widgetHtml,
      _meta:{ui:{prefersBorder:false,csp:{connectDomains:[],resourceDomains:[]}}}}]});
  }
  if (message.method !== 'tools/call') return error(-32601,'Method not found');
  const tool = tools.find(t => t.name === message.params?.name);
  if (!tool) return error(-32602,'Unknown tool');
  const args = message.params?.arguments;
  if (!validateArguments(tool,args)) return result(toolResult({saved:false,error:'INVALID_ARGUMENTS'},true));
  if(tool.name==='prepare_departure'){
    let ready=false;try{const c=await upstream({action:'publicationCapabilities'});ready=c.success===true&&c.write_requests===true&&c.spreadsheet_id===SPREADSHEET_ID;}catch{}
    const preview={...args};delete preview.dry_run;delete preview.request_id;
    return result(toolResult({saved:false,ready,preview,request_id:args.request_id||randomUUID(),payments:false}));
  }
  try {
    // Check the exact configured destination before a write. Old deployments
    // return "Action inconnue", so publishing stays disabled until deployed.
    const capabilities = await upstream({action:'publicationCapabilities'});
    if (capabilities.success !== true || capabilities.write_requests !== true ||
        capabilities.spreadsheet_id !== SPREADSHEET_ID)
      return result(toolResult({saved:false,error:'PUBLICATION_NOT_READY',payments:false},true));
    const data = await upstream({...args,action:tool.name === 'publish_departure' ? 'publishGP' : 'getPublicationStatus'});
    if (data.success !== true) return result(toolResult({saved:false,
      error:typeof data.error === 'string' ? data.error : 'SAVE_UNCONFIRMED',
      request_id:args.request_id},true));
    if (data.dry_run === true) return result(toolResult({saved:false,valid:true,
      dry_run:true,request_id:args.request_id,payments:false}));
    if (data.found === false) return result(toolResult({saved:false,found:false,request_id:args.request_id}));
    if (data.spreadsheet_id !== SPREADSHEET_ID || data.sheet !== 'GP_TRANSPORTEURS' ||
        !data.id || data.request_id !== args.request_id || !Number.isInteger(data.row) || data.row < 2)
      return result(toolResult({saved:false,error:'SAVE_UNCONFIRMED',request_id:args.request_id},true));
    return result(toolResult({saved:true,status:'Voyage enregistré',id:data.id,
      request_id:args.request_id,duplicate:data.duplicate === true,payments:false}));
  } catch {
    // A timeout may occur after a successful write. Do not report failure or
    // create a new request ID; the caller can reconcile using publication_status.
    return result(toolResult({saved:false,outcome:'unknown',request_id:args.request_id,
      error:'CHECK_STATUS_BEFORE_RETRY',payments:false},true));
  }
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  const origin = req.headers?.origin;
  if (origin && !origins.has(origin)) return res.status(403).json({error:'Origin not allowed'});
  if (origin) { res.setHeader('Access-Control-Allow-Origin',origin); res.setHeader('Vary','Origin'); }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept, MCP-Protocol-Version');
    return res.status(204).end();
  }
  if (req.method !== 'POST') { res.setHeader('Allow','POST, OPTIONS'); return res.status(405).end(); }
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); }
  catch { return res.status(400).json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}}); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.jsonrpc !== '2.0' ||
      typeof body.method !== 'string' || JSON.stringify(body).length > 20000)
    return res.status(400).json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid Request'}});
  if (!Object.prototype.hasOwnProperty.call(body,'id')) return res.status(202).end();
  return res.status(200).json(await dispatch(body));
}
