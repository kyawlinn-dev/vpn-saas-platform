import {AsyncLocalStorage} from 'node:async_hooks';
import * as defaults from './strings.js';
import {EXTRA_DEFAULTS,contentItem} from './contentCatalog.js';
import {renderBotContent,escapeBotHtml} from './contentRendering.js';
import {formatOrderExpiry} from '../utils/businessTime.js';

const updates=new AsyncLocalStorage();
export const runWithBotContent=(snapshot,next)=>updates.run(snapshot,next);
export function currentBotText(key,values={},trusted=new Set()){
  const item=contentItem(key),custom=updates.getStore()?.[key];
  try{return renderBotContent(key,custom??item.default_text,values,trusted);}
  catch{return renderBotContent(key,item.default_text,values,trusted);}
}
const t=(key,values={},raw=[])=>currentBotText(key,values,new Set(raw));
const extra=(key,values={},raw=[])=>t(`extra.${key}`,values,raw);
const date=(p,value)=>value?p.formatBurmeseDate(value):'';
const gb=n=>n==null?extra('unavailableData'):Number(n)===0?'0 GB':Number(n)<0.01?'&lt;0.01 GB':Number(n).toFixed(2)+' GB';
const duration=days=>days?extra('duration',{duration_days:days}):'';
function queuedValues(q){return {plan_name:q.planName,data_limit:q.dataLimitGb?`${q.dataLimitGb} GB`:'Unlimited',duration:duration(q.durationDays)};}
function queueSection(q){return q?extra('queuedDetails',queuedValues(q)):'';}
function balance(p){
  if(p.businessSummary&&p.businessSummary.access_status!=='active'){
    const last=p.lastPackage?extra('lastPackage',{plan_name:p.lastPackage.planName||'Package',expiry_date:p.lastPackage.expiryDate?'\n'+date(p,p.lastPackage.expiryDate):''}):'';
    return extra('inactiveBalance',{last_package:last},['last_package']);
  }
  const expiry=p.expiryDate?extra('expiryDetails',{expiry_date:date(p,p.expiryDate),expiry_deadline:formatOrderExpiry(p.expiryDate,'my-MM')||'—'}):'';
  return t('balanceText',{total_data:p.isUnlimited?'Unlimited':gb(p.totalGb),used_data:gb(p.usedGb),
    remaining_data:p.isUnlimited?extra('unlimitedData'):p.remainingGb!=null?gb(p.remainingGb):'-',expiry_details:expiry,queued_details:queueSection(p.queuedPlan)},
    ['total_data','used_data','remaining_data','expiry_details','queued_details']);
}
const functions={
  startWelcome:brand=>t('startWelcome',{brand_name:brand}),
  keyFoundHeader:name=>t('keyFoundHeader',{customer_name:name}),
  keyServerLine:(flag,name)=>t('keyServerLine',{flag,server_name:name}),
  serverChooseText:isTrial=>t('serverChooseText',{trial_note:isTrial?extra('trialNote'):''},['trial_note']),
  serverSwitchSuccess:(flag,name)=>t('serverSwitchSuccess',{flag,server_name:name}),
  howtoQueuedNotice:protocol=>t('howtoQueuedNotice',{app_name:extra(protocol==='shadowsocks'?'outlineApp':'vlessApps')}),
  howToUseSS:(notice='')=>t('howToUseSS',{queued_notice:notice?'\n\n'+notice:''},['queued_notice']),
  howToUseVless:(notice='')=>t('howToUseVless',{queued_notice:notice?'\n\n'+notice:''},['queued_notice']),
  howToUse:()=>t('howToUse'),
  buyExtendSuccessText:(name,days,data)=>t('buyExtendSuccessText',{plan_name:name,duration_days:days,data_limit_gb:data}),
  buyPaymentInstructions:(plan,methods)=>{
    const accounts=(methods||[]).map(m=>`   • <b>${escapeBotHtml(m.method)}</b>: ${escapeBotHtml(m.account_number)}${m.account_name?` (${escapeBotHtml(m.account_name)})`:''}`).join('\n')||extra('noPaymentAccounts');
    return t('buyPaymentInstructions',{plan_name:plan.name,price_mmk:plan.price_mmk.toLocaleString(),data_limit_gb:plan.data_limit_gb,duration_days:plan.duration_days,payment_accounts:accounts},['payment_accounts']);
  },
  balanceText:balance,
  balanceQueuedOnlyText:({queuedPlan})=>t('balanceQueuedOnlyText',queuedValues(queuedPlan)),
};
function resolve(value,key){
  if(typeof value==='string'){
    try{return currentBotText(key);}catch{return value;}
  }
  if(Array.isArray(value))return value.map((child,i)=>resolve(child,`${key}.${i}`));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,child])=>[name,resolve(child,`${key}.${name}`)]));
  return value;
}
export function createBotCopy(){
  return new Proxy(defaults,{get(target,key){
    if(key==='extra')return new Proxy(EXTRA_DEFAULTS,{get:(_,name)=>{
      const item=contentItem(`extra.${name}`);return item.placeholders.length?(values)=>extra(name,values):extra(name);
    }});
    if(key==='guideUrl')return protocol=>currentBotText(`guides.${protocol}.url`);
    if(key==='guideLabel')return protocol=>currentBotText(`guides.${protocol}.label`);
    return functions[key]||resolve(target[key],String(key));
  }});
}
