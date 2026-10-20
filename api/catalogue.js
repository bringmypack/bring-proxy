// The installed catalogue app calls /mcp. This stateless read endpoint coexists
// with /api/mcp (publication). No process-local sessions survive between requests.
import {readCatalog, searchCatalog, isoDate} from '../lib/catalog.js';
import {dispatch as publicationDispatch,tools as publicationTools,callScript} from './mcp.js';

const annotations = {readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:true};
const date = {type:'string', pattern:'^\\d{4}-\\d{2}-\\d{2}$'};
export const tools = [
  {name:'service_status', description:'Vérifie la connexion au catalogue public de voyages BringMyPack. Les annonces ne sont pas des disponibilités vérifiées.',
    inputSchema:{type:'object', properties:{}, additionalProperties:false}, annotations},
  {name:'search_departures', description:'Recherche les annonces de voyageurs France–Sénégal, dans les deux sens, dans Google Sheets BringMyPack. Retourne des liens de posts sources et des dates estimées à confirmer, jamais une réservation.',
    inputSchema:{type:'object', properties:{origin:{type:'string', minLength:2, maxLength:100},
      destination:{type:'string', minLength:2, maxLength:100}, date_from:date,date_to:date,origin_neighborhood:{type:'string',minLength:1,maxLength:250},destination_neighborhood:{type:'string',minLength:1,maxLength:250},weight_kg:{type:'number',exclusiveMinimum:0,maximum:10000}},
      required:['origin','destination'], additionalProperties:false}, annotations},
  ...publicationTools
];
const reply = (data, isError = false) => ({content:[{type:'text', text:JSON.stringify(data)}], structuredContent:data, ...(isError ? {isError:true} : {})});

export async function dispatch(message, fetchImpl = fetch, now = new Date()) {
  const id = message.id ?? null;
  const result = value => ({jsonrpc:'2.0', id, result:value});
  const error = (code, text) => ({jsonrpc:'2.0', id, error:{code, message:text}});
  if (message.method === 'initialize') return result({protocolVersion:'2025-03-26', capabilities:{tools:{},resources:{}},
    serverInfo:{name:'bringmypack-annonces', version:'2.0.0'},
    instructions:'Search announcements and publish confirmed GP trips or sender requests directly in BringMyPack. Collect both neighbourhoods. Publication tools are available here; do not replace them with copying to Facebook. A service error is not an empty catalogue. No booking or payment.'});
  if (message.method === 'ping') return result({});
  if (message.method === 'tools/list') return result({tools});
  if(message.method.startsWith('resources/')||message.method==='tools/call'&&publicationTools.some(t=>t.name===message.params?.name))return publicationDispatch(message,payload=>callScript(payload,fetchImpl));
  if (message.method !== 'tools/call') return error(-32601, 'Method not found');
  const tool = tools.find(item => item.name === message.params?.name);
  if (!tool) return error(-32602, 'Unknown tool');
  const args = message.params.arguments ?? {};
  if (!args || typeof args !== 'object' || Array.isArray(args) ||
      Object.keys(args).some(key => !(key in tool.inputSchema.properties))) return error(-32602, 'Invalid arguments');
  if (tool.name === 'search_departures') {
    if(args.weight_kg!==undefined&&(typeof args.weight_kg!=='number'||!Number.isFinite(args.weight_kg)||args.weight_kg<=0||args.weight_kg>10000))return error(-32602,'Invalid weight');
    if(['origin_neighborhood','destination_neighborhood'].some(k=>args[k]!==undefined&&(typeof args[k]!=='string'||!args[k].trim()||args[k].length>250)))return error(-32602,'Invalid neighbourhood');
    if (['origin','destination'].some(key => typeof args[key] !== 'string' || args[key].trim().length < 2 || args[key].length > 100)) return error(-32602, 'Origin and destination are required');
    if (['date_from','date_to'].some(key => args[key] !== undefined && !isoDate(args[key])))
      return result(reply({error:'INVALID_DATE_RANGE', message:'Indiquez des dates valides au format YYYY-MM-DD.'}, true));
  }
  try {
    const rows = await readCatalog(fetchImpl);
    var publication={};if(tool.name==='service_status'){try{publication=await callScript({action:'publicationCapabilities'},fetchImpl);}catch{}}
    if (tool.name === 'service_status') return result(reply({connected:true, catalog_records:rows.length,
      checked_at:now.toISOString(), features:{search:true, booking:false, write_requests:publication.success===true&&publication.write_requests===true,write_shipments:publication.success===true&&publication.write_shipments===true,matching:publication.success===true&&publication.matching===true,payments:false},
      catalog:'BringMyPack — catalogue principal',
      notice:'Recherche et publication utilisent le même catalogue. Contacts privés exclus des résultats.'}));
    return result(reply(searchCatalog(rows, args, now)));
  } catch (e) {
    const invalidDate = e.message === 'INVALID_DATE_RANGE';
    return result(reply({...(tool.name === 'service_status' ? {connected:false} : {}),
      error:invalidDate ? 'INVALID_DATE_RANGE' : 'CATALOG_UNAVAILABLE',
      message:invalidDate ? 'Indiquez une période à partir d’aujourd’hui.' :
        'La recherche n’a pas abouti. Ne présentez pas cela comme une absence de voyageurs.'}, true));
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const origin = req.headers?.origin;
  if (origin && !['https://chatgpt.com', 'https://chat.openai.com'].includes(origin)) return res.status(403).json({error:'ORIGIN_REJECTED'});
  if (origin) {res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');}
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {res.setHeader('Allow', 'POST, OPTIONS'); return res.status(405).end();}
  let body = req.body;
  try {if (typeof body === 'string') body = JSON.parse(body);}
  catch {return res.status(400).json({jsonrpc:'2.0', id:null, error:{code:-32700, message:'Invalid JSON'}});}
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.jsonrpc !== '2.0' ||
      typeof body.method !== 'string' || JSON.stringify(body).length > 20000)
    return res.status(400).json({jsonrpc:'2.0', id:null, error:{code:-32600, message:'Invalid Request'}});
  if (!Object.prototype.hasOwnProperty.call(body, 'id')) return res.status(202).end();
  return res.status(200).json(await dispatch(body));
}
