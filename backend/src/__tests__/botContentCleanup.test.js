import {describe,it,expect,vi} from 'vitest';
import * as strings from '../bot/strings.js';
import {contentItem} from '../bot/contentCatalog.js';
import {createTelegramBotContentService} from '../services/telegramBotContentService.js';

const unused=['START_BTN_GET_KEY','SERVER_BTN_OPEN','appOpenText'];
const legacy=['BTN_TRIAL','BTN_BUY','extra.trialNote','SERVER_VLESS_TRIAL','SERVER_TRIAL_LOCKED'];
function fixture(){
  const historical=[{content_key:'START_BTN_GET_KEY',custom_text:'Old unused label'},
    {content_key:'SERVER_TRIAL_LOCKED',custom_text:'Legacy restriction'},
    {content_key:'MENU_HOME',custom_text:'My home'}];
  const client={from:vi.fn(()=>({select:()=>({eq:async()=>({data:historical,error:null})})}))};
  return {service:createTelegramBotContentService({client}),client,historical};
}
describe('Telegram content cleanup',()=>{
  it('lists two guide links without unused, legacy-only or text controls',async()=>{
    const {service}=fixture();const list=await service.list('reseller');
    expect(list).toHaveLength(2);
    for(const key of [...unused,...legacy])expect(list.some(item=>item.key===key),key).toBe(false);
    for(const key of ['BALANCE_TEXT','BUY_PAYMENT_UNDER_REVIEW','TRIAL_ALREADY_USED']){expect(list.some(item=>item.key===key),key).toBe(false);expect(contentItem(key)).toBeTruthy();}
    expect(list.some(item=>item.key==='guides.shadowsocks.url')).toBe(true);
  });
  it('rejects direct save/reset/preview for retired editor controls without writing',async()=>{
    const {service,client}=fixture();
    for(const key of [...unused,...legacy]){
      await expect(service.save('reseller',key,'Edited')).rejects.toMatchObject({code:'BOT_CONTENT_UNKNOWN_KEY'});
      await expect(service.reset('reseller',key)).rejects.toMatchObject({code:'BOT_CONTENT_UNKNOWN_KEY'});
      expect(()=>service.preview(key,'Edited')).toThrow();
    }
    expect(client.from).not.toHaveBeenCalled();
  });
  it('preserves historical overrides for compatibility without deleting any stored row',async()=>{
    const {service,historical}=fixture(),before=JSON.stringify(historical);
    const snapshot=await service.snapshot('reseller');
    expect(snapshot.SERVER_TRIAL_LOCKED).toBeUndefined();
    expect(snapshot.MENU_HOME).toBeUndefined();
    expect(snapshot.START_BTN_GET_KEY).toBeUndefined();
    expect(JSON.stringify(historical)).toBe(before);
  });
  it('removes genuinely unused exports but retains shared payment review messages',()=>{
    for(const key of [...unused,'buySuccessText','CUSTOMER_PAYMENT_CONFIRMED','CUSTOMER_PAYMENT_REJECTED'])expect(strings[key],key).toBeUndefined();
    expect(typeof strings.resellerNotifyCaption).toBe('function');
    expect(strings.NOTIFY_CONFIRM_BTN).toBeTruthy();expect(strings.NOTIFY_REJECT_BTN).toBeTruthy();
  });
  it('groups controls by their actual customer flow',()=>{
    expect(contentItem('extra.trialConfirmation').group).toBe('Trial');
    expect(contentItem('extra.planButton').group).toBe('Purchase & Payment');
    expect(contentItem('extra.cancelButton').group).toBe('Purchase & Payment');
    expect(contentItem('extra.serverFull').group).toBe('Server Switching');
    expect(contentItem('BTN.KEY').group).toBe('My Account');
  });
});
