import {describe,it,expect} from 'vitest';
import {createBotCopy,runWithBotContent} from '../bot/contentBindings.js';
import * as defaults from '../bot/strings.js';
import {contentItem} from '../bot/contentCatalog.js';
import {renderBotContent} from '../bot/contentRendering.js';

describe('per-update Telegram content',()=>{
  it('uses effective catalogue defaults while keeping callback identifiers unchanged',()=>{
    const copy=createBotCopy();expect(copy.MENU_HOME).toBe(contentItem('MENU_HOME').default_text);
    expect(copy.DL_CB.SS).toBe(defaults.DL_CB.SS);
    expect(copy.startWelcome('NovaNet')).toBe(renderBotContent('startWelcome',contentItem('startWelcome').default_text,{brand_name:'NovaNet'}));
  });
  it('isolates concurrent updates and nested labels/download URLs',async()=>{
    const copy=createBotCopy();
    const results=await Promise.all(['one','two'].map(name=>runWithBotContent({MENU_HOME:name,'BTN.KEY':name+' key','DL_SS_PLATFORMS.ios.apps.0.url':'https://example.com/'+name},async()=>{
      await new Promise(resolve=>setTimeout(resolve,5));
      return [copy.MENU_HOME,copy.BTN.KEY,copy.DL_SS_PLATFORMS.ios.apps[0].url];
    })));
    expect(results).toEqual([['one','one key','https://example.com/one'],['two','two key','https://example.com/two']]);
    expect(copy.MENU_HOME).toBe(contentItem('MENU_HOME').default_text);
  });
  it('escapes dynamic values, applies custom templates and ignores corrupt overrides',()=>{
    const copy=createBotCopy();
    runWithBotContent({startWelcome:'Hello <b>{brand_name}</b>',MENU_HOME:'<script>x</script>'},()=>{
      expect(copy.startWelcome('<brand>')).toBe('Hello <b>&lt;brand&gt;</b>');
      expect(copy.MENU_HOME).toBe(contentItem('MENU_HOME').default_text);
    });
  });
  it('preserves numeric balance and payment data in the effective default formats',()=>{
    const copy=createBotCopy(),args={usedGb:1,remainingGb:9,totalGb:10,isUnlimited:false,expiryDate:null,formatBurmeseDate:x=>x};
    expect(copy.balanceText(args)).toBe(renderBotContent('balanceText',contentItem('balanceText').default_text,{
      total_data:'10.00 GB',used_data:'1.00 GB',remaining_data:'9.00 GB',expiry_details:'',queued_details:'',
    }));
    const plan={name:'Plan',price_mmk:5000,data_limit_gb:50,duration_days:30};
    expect(copy.buyPaymentInstructions(plan,[])).toBe(renderBotContent('buyPaymentInstructions',contentItem('buyPaymentInstructions').default_text,{
      plan_name:'Plan',price_mmk:'5,000',data_limit_gb:50,duration_days:30,payment_accounts:contentItem('extra.noPaymentAccounts').default_text,
    }));
  });
});
