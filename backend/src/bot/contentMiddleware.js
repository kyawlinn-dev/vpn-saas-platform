import {runWithBotContent} from './contentBindings.js';
import {loadTelegramBotContent} from '../services/telegramBotContentService.js';

export function createBotContentMiddleware({resellerId,load=loadTelegramBotContent,syncCommands}){
  return async (ctx,next)=>{
    const snapshot=await load(resellerId);
    // Command-menu metadata is optional; an unavailable Telegram endpoint must
    // not delay the customer's account, purchase or key response.
    if(syncCommands){try{Promise.resolve(syncCommands(snapshot)).catch(()=>{});}catch{}}
    return runWithBotContent(snapshot,next);
  };
}
