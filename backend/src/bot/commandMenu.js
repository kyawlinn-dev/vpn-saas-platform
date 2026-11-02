import {COMMAND_DEFAULTS,contentItem} from './contentCatalog.js';
import {renderBotContent} from './contentRendering.js';

export function getBotCommands(trialEnabled,snapshot={}) {
  return COMMAND_DEFAULTS.filter(([command])=>trialEnabled||command!=='trial').map(([command,fallback])=>{
    const key=`commands.${command}.description`;
    let description=contentItem(key).default_text||fallback;
    try{description=renderBotContent(key,snapshot[key]??description);}catch{}
    return {command,description};
  });
}

export function setCommandsMenu(telegram, chatId) {
  return telegram.setChatMenuButton({
    ...(chatId != null ? { chat_id: chatId } : {}),
    menu_button: { type: "commands" },
  });
}
