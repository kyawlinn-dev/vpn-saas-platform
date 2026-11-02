import * as defaults from './strings.js';
import {TELEGRAM_CONTENT_DEFAULTS} from './contentDefaults.js';

export const COMMAND_DEFAULTS = [
  ['start','🏠 ပင်မစာမျက်နှာ ဖွင့်ရန်'],['app','📱 Mini App ဖွင့်ရန်'],
  ['key','🔑 VPN Key ကြည့်ရန်'],['balance','📊 ဒေတာနှင့် သက်တမ်း စစ်ရန်'],
  ['buy','🛒 ပက်ကေ့ဂျ် ဝယ်ယူရန်'],['help','💬 အကူအညီ ရယူရန်'],['trial','🎁 အခမဲ့ စမ်းသုံးရန်'],
];
const entries=[];
export function botContentError(message='Invalid bot content',code='BOT_CONTENT_INVALID') {
  return Object.assign(new Error(message),{code});
}
const humanize=value=>value.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').replaceAll('.',' / ').toLowerCase();
const groupFor=key=>/^(DL_|DOWNLOAD)/.test(key)?'Downloads':/^(HOWTO|how[Tt]o)/.test(key)?'Guides':
  /^(BUY|buy|BTN_BUY)/.test(key)?'Purchase & Payment':/^(TRIAL|BTN_TRIAL)/.test(key)?'Trial':
  /^(KEY|key|BALANCE|balance|BTN\.)/.test(key)?'My Account':/^SERVER|^server/.test(key)?'Server Switching':'Welcome & Navigation';
function add(key,text,kind='message',options={}){
  entries.push(Object.freeze({key,label:humanize(key),group:groupFor(key),kind,default_text:TELEGRAM_CONTENT_DEFAULTS[key]??text,
    placeholders:[...new Set([...text.matchAll(/\{([a-z_]+)\}/g)].map(m=>m[1]))],
    max_length:kind==='button'?64:kind==='command'?256:kind==='url'?2048:3000,...options}));
}
const labels=new Set(['BTN','BTN_TRIAL','BTN_BUY','MENU_MY_VPN','MENU_HELP','MENU_BACK','MENU_HOME',
  'START_BTN_ADMIN','START_BTN_TRIAL_KEY','START_BTN_BUY_PACKAGE','APP_BTN_OPEN',
  'KEY_BTN_DOWNLOAD','BALANCE_BTN_OPEN','DL_PROTO_BTNS','DL_OS_BTNS','BUY_PROTO_SS_BTN','BUY_PROTO_VLESS_BTN','HOWTO_BTN_SS','HOWTO_BTN_VLESS']);
const excluded=/^(LEGACY_BTN|START_CB_|DL_CB|HOWTO_CB|NOTIFY_|CUSTOMER_PAYMENT_)/;
function collect(value,key,root){
  if(typeof value==='string'){
    const kind=key.endsWith('.url')?'url':labels.has(root)||key.endsWith('.label')?'button':'message';
    add(key,value,kind,key==='KEY_COPY_INSTRUCTIONS'||key==='KEY_COPY_INSTRUCTIONS_SS'?{max_length:600}:
      key==='SERVER_ALREADY_LINKED'?{max_length:200,plain_text:true}:{});
  }else if(value && typeof value==='object'){
    for(const [name,child] of Object.entries(value))collect(child,`${key}.${name}`,root);
  }
}
for(const [key,value] of Object.entries(defaults))if(!excluded.test(key)&&typeof value!=='function')collect(value,key,key);

const dynamic={
  startWelcome:defaults.startWelcome('{brand_name}'),
  keyFoundHeader:defaults.keyFoundHeader('{customer_name}'),
  keyServerLine:defaults.keyServerLine('{flag}','{server_name}'),
  serverChooseText:defaults.serverChooseText(false)+'{trial_note}',
  serverSwitchSuccess:defaults.serverSwitchSuccess('{flag}','{server_name}'),
  howtoQueuedNotice:'<b>နောက်အသုံးပြုမည့် package</b>\nလက်ရှိ package ကုန်သွားလျှင် <b>{app_name}</b> နဲ့ သုံးပါ။',
  howToUseSS:defaults.howToUseSS()+'{queued_notice}',
  howToUseVless:defaults.howToUseVless()+'{queued_notice}',
  howToUse:defaults.howToUse(),
  buyExtendSuccessText:defaults.buyExtendSuccessText('{plan_name}','{duration_days}','{data_limit_gb}'),
  buyPaymentInstructions:'📦 <b>{plan_name}</b>\n💰 ကျသင့်ငွေ: <b>{price_mmk} MMK</b>\n📊 ဒေတာ: <b>{data_limit_gb} GB</b>  |  ⏰ သက်တမ်း: <b>{duration_days} ရက်</b>\n\n💳 <b>ငွေပေးချေရမည့် အကောင့်များ</b>\n{payment_accounts}\n\n📸 ငွေလွှဲပြီးပါက <b>ငွေလွှဲပြေစာ (Screenshot)</b> ကို ဤ chat တွင် ပေးပို့ပါ 👇\n\n⏱ <i>ဤဝယ်ယူမှုအဆင့်သည် ၁၀ မိနစ်သာ အကျုံးဝင်ပါသည်။ ထိုအချိန်အတွင်း ပြေစာ ပေးပို့ပါ။</i>',
  balanceText:'📊 <b>သင်၏ VPN ဒေတာနှင့် သက်တမ်း အခြေအနေ:</b>\n\n📦 စုစုပေါင်း ဒေတာ: <b>{total_data}</b>\n📈 အသုံးပြုထားသော ဒေတာ: <b>{used_data}</b>\n📉 ကျန်ရှိသော ဒေတာ: <b>{remaining_data}</b>{expiry_details}{queued_details}\n\nအသေးစိတ်အချက်အလက်များကို Mini App တွင်လည်း ကြည့်ရှုနိုင်ပါသည် 👇',
  balanceQueuedOnlyText:'📊 <b>သင်၏ VPN အကောင့် အခြေအနေ:</b>\n\nℹ️ လက်ရှိ အသုံးပြုနိုင်သော ပက်ကေ့ဂျ် မရှိပါ။\n\n⏳ <b>ကြိုတင်ဝယ်ယူထားသော နောက်ပက်ကေ့ဂျ်:</b>\n📦 <b>{plan_name}</b>\n📊 ဒေတာ: <b>{data_limit}</b>  |  ⏰ သက်တမ်း: <b>{duration}</b>\n\nအသေးစိတ်အချက်အလက်များကို Mini App တွင် ကြည့်ရှုနိုင်ပါသည်။',
};
for(const [key,text] of Object.entries(dynamic))add(key,text,'message',key==='keyFoundHeader'?{max_length:160}:key==='keyServerLine'?{max_length:240}:{});
export const EXTRA_DEFAULTS={
  commandError:'⚠️ ယခု ဆောင်ရွက်၍ မရသေးပါ။ ခဏအကြာတွင် ထပ်မံကြိုးစားပါ။',
  queuedButton:'📦 စောင့်ဆိုင်းနေသော ပက်ကေ့ဂျ်',appPrompt:'Mini App ကို အောက်ပါခလုတ်မှ ဖွင့်ပါ။',
  serverUnavailable:'Server မရရှိနိုင်ပါ',serverFull:'Server ၏ ပြည့်သွားပြီ',
  trialConfirmation:'🎁 <b>{app_name}</b> ဖြင့် အခမဲ့ စမ်းသုံးရန် သေချာပါသလား?\n\nအစမ်းသုံးခွင့်ကို တစ်ကြိမ်သာ ရယူနိုင်ပါသည်။',
  trialConfirmButton:'✅ အခမဲ့ စမ်းသုံးမည်',cancelButton:'မဝယ်တော့ပါ',
  planButton:'💰 {price_mmk} MMK  |  📊 {data_limit_gb} GB  |  ⏰ {duration_days} ရက်',
  outlineApp:'Outline',vlessApps:'Hiddify / Happ / V2Box',
  trialNote:'\n\n🔒 Premium ဆာဗာများ အသုံးပြုရန် ဝယ်ယူထားသော ပက်ကေ့ဂျ် လိုအပ်ပါသည်။',
  unavailableData:'မရနိုင်သေးပါ',unlimitedData:'🔓 အကန့်အသတ်မရှိ (Unlimited)',
  duration:'{duration_days} ရက်',
  expiryDetails:'\n📅 သက်တမ်းကုန်ဆုံးမည့်ရက်: {expiry_date}\nသုံးစွဲခွင့်ကုန်ဆုံးချိန်: {expiry_deadline}',
  queuedDetails:'\n\n⏳ <b>ကြိုတင်ဝယ်ယူထားသော နောက်ပက်ကေ့ဂျ်:</b>\n📦 <b>{plan_name}</b>\n📊 ဒေတာ: <b>{data_limit}</b>  |  ⏰ သက်တမ်း: <b>{duration}</b>\nℹ️ <i>လက်ရှိပက်ကေ့ဂျ် ကုန်ဆုံးပြီးမှ အလိုအလျောက် စတင်ပါမည်။</i>',
  inactiveBalance:'📊 VPN ဒေတာအခြေအနေ\n\nအသုံးပြုနေသော ပက်ကေ့ချ်မရှိပါ။{last_package}',
  lastPackage:'\n\nနောက်ဆုံးအသုံးပြုခဲ့သော ပက်ကေ့ချ်: <b>{plan_name}</b>{expiry_date}',
  noPaymentAccounts:'   ➡️ Admin ကို တိုက်ရိုက် ဆက်သွယ်ပါ',
};
for(const [key,text] of Object.entries(EXTRA_DEFAULTS)){
  const button=/Button$|Apps$|App$/.test(key),alert=/^server(Unavailable|Full)$/.test(key);
  const group=/^trial/.test(key)?'Trial':/^server/.test(key)?'Server Switching':
    ['planButton','cancelButton','noPaymentAccounts'].includes(key)?'Purchase & Payment':
    ['outlineApp','vlessApps'].includes(key)?'Apps':/Balance|Data|Details|Package|duration/.test(key)?'My Account':'Welcome & Navigation';
  add(`extra.${key}`,text,button?'button':'message',{group,
    ...(key==='planButton'?{max_length:256}:{}),
    ...(alert?{max_length:200,plain_text:true}:{}),...(['trialNote','expiryDetails','queuedDetails','lastPackage'].includes(key)?{max_length:1000}:{}),
  });
}
for(const protocol of ['shadowsocks','vless']){
  add(`guides.${protocol}.url`,'','url',{group:'Guides',label:`${protocol==='shadowsocks'?'Outline':'Happ / Hiddify / V2Box'} guide link`,optional:true});
  add(`guides.${protocol}.label`,protocol==='shadowsocks'?defaults.HOWTO_BTN_SS:defaults.HOWTO_BTN_VLESS,'button',{group:'Guides'});
}
for(const [command,description] of COMMAND_DEFAULTS)add(`commands.${command}.description`,description,'command',{group:'Commands',label:`/${command} description`});

export const BOT_CONTENT_ITEMS=Object.freeze(entries);
const byKey=new Map(entries.map(item=>[item.key,item]));
export function contentItem(key){const item=byKey.get(key);if(!item)throw botContentError('Unknown content key','BOT_CONTENT_UNKNOWN_KEY');return item;}
// Wording is code-owned; only channel-post links can be edited by resellers.
const linkKeys=new Set(['guides.shadowsocks.url','guides.vless.url']);
export const EDITABLE_BOT_CONTENT_ITEMS=Object.freeze(entries.filter(item=>linkKeys.has(item.key)));
export function editableContentItem(key){
  const item=contentItem(key);
  if(!linkKeys.has(key))throw botContentError('Only guide links are editable','BOT_CONTENT_UNKNOWN_KEY');
  return item;
}
