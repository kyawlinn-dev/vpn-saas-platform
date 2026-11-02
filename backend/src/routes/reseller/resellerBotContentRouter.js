import express from 'express';
import {contentItem,editableContentItem,botContentError} from '../../bot/contentCatalog.js';
import {getTelegramBotContentService} from '../../services/telegramBotContentService.js';

export function createResellerBotContentRouter({getService=getTelegramBotContentService,syncCommands=async resellerId=>{
  const manager=await import('../../bot/manager.js');return manager.syncBotContentCommands(resellerId);
}}={}){
  const router=express.Router();
  router.use((req,res,next)=>req.reseller?.id?next():res.status(401).json({error:'Reseller context required'}));
  const handle=action=>async(req,res)=>{
    try{await action(req,res);}catch(error){
      if(error.code==='BOT_CONTENT_INVALID'||error.code==='BOT_CONTENT_UNKNOWN_KEY')return res.status(400).json({error:error.message,code:error.code});
      return res.status(503).json({error:'Bot content is unavailable. Check the required migration.',code:'BOT_CONTENT_STORAGE_UNAVAILABLE'});
    }
  };
  const bodyText=req=>{
    if(!req.body||Array.isArray(req.body)||Object.keys(req.body).length!==1||typeof req.body.text!=='string')throw botContentError('Only a text field is accepted');
    return req.body.text;
  };
  async function commandSync(resellerId,key){
    if(contentItem(key).kind!=='command')return {status:'not_applicable'};
    try{return await syncCommands(resellerId);}catch{return {status:'pending'};}
  }
  router.get('/',handle(async(req,res)=>res.json({items:await (await getService()).list(req.reseller.id)})));
  router.patch('/:key',handle(async(req,res)=>{
    editableContentItem(req.params.key);
    const text=bodyText(req),service=await getService();
    const item=await service.save(req.reseller.id,req.params.key,text);
    res.json({item,command_sync:await commandSync(req.reseller.id,req.params.key)});
  }));
  router.delete('/:key',handle(async(req,res)=>{
    editableContentItem(req.params.key);
    const item=await (await getService()).reset(req.reseller.id,req.params.key);
    res.json({item,command_sync:await commandSync(req.reseller.id,req.params.key)});
  }));
  router.post('/:key/preview',handle(async(req,res)=>{
    editableContentItem(req.params.key);
    res.json((await getService()).preview(req.params.key,bodyText(req)));
  }));
  return router;
}
export default createResellerBotContentRouter();
