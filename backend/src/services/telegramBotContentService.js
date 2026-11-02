import {EDITABLE_BOT_CONTENT_ITEMS,editableContentItem,contentItem,botContentError} from '../bot/contentCatalog.js';
import {validateBotContent,renderBotContent} from '../bot/contentRendering.js';

const requireTenant=id=>{if(typeof id!=='string'||!id.trim())throw botContentError('Reseller context required','BOT_CONTENT_TENANT_REQUIRED');};
const databaseError=()=>botContentError('Bot content storage is unavailable. Check the required migration.','BOT_CONTENT_STORAGE_UNAVAILABLE');
const dto=(item,row)=>({...item,text:row?.custom_text??item.default_text,is_custom:Boolean(row),updated_at:row?.updated_at??null});

export function createTelegramBotContentService({client}){
  async function rows(resellerId){
    requireTenant(resellerId);
    const {data,error}=await client.from('reseller_bot_content').select('content_key,custom_text,updated_at').eq('reseller_id',resellerId);
    if(error||!Array.isArray(data))throw databaseError();
    return data.filter(row=>{try{editableContentItem(row.content_key);validateBotContent(row.content_key,row.custom_text);return true;}catch{return false;}});
  }
  function preview(key,text){const item=editableContentItem(key);validateBotContent(key,text);return {text:renderBotContent(key,text),kind:item.kind};}
  return {
    preview,
    async list(resellerId){const found=new Map((await rows(resellerId)).map(row=>[row.content_key,row]));return EDITABLE_BOT_CONTENT_ITEMS.map(item=>dto(item,found.get(item.key)));},
    async snapshot(resellerId){return Object.freeze(Object.fromEntries((await rows(resellerId)).map(row=>[row.content_key,row.custom_text])));},
    async save(resellerId,key,text){
      requireTenant(resellerId);preview(key,text);
      const row={reseller_id:resellerId,content_key:key,custom_text:text,updated_at:new Date().toISOString()};
      const {error}=await client.from('reseller_bot_content').upsert(row,{onConflict:'reseller_id,content_key'});
      if(error)throw databaseError();return dto(contentItem(key),row);
    },
    async reset(resellerId,key){
      requireTenant(resellerId);const item=editableContentItem(key);
      const {error}=await client.from('reseller_bot_content').delete().eq('reseller_id',resellerId).eq('content_key',key);
      if(error)throw databaseError();return dto(item);
    },
  };
}
let service;
export async function getTelegramBotContentService(){
  if(!service){const {supabase}=await import('../lib/supabase.js');service=createTelegramBotContentService({client:supabase});}
  return service;
}
export async function loadTelegramBotContent(resellerId){
  try{return await (await getTelegramBotContentService()).snapshot(resellerId);}
  catch{console.warn('[bot-content] Custom content unavailable; using defaults');return Object.freeze({});}
}
