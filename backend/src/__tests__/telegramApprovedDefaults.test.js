import {describe,it,expect} from 'vitest';
import {contentItem} from '../bot/contentCatalog.js';
import {createBotCopy,runWithBotContent} from '../bot/contentBindings.js';
import {getBotCommands} from '../bot/commandMenu.js';
import {TELEGRAM_CONTENT_DEFAULTS} from '../bot/contentDefaults.js';

describe('owner-approved Telegram defaults',()=>{
  it('retains all 44 reviewed defaults that still have runtime consumers',()=>{
    expect(Object.keys(TELEGRAM_CONTENT_DEFAULTS)).toHaveLength(44);
    for(const [key,text] of Object.entries(TELEGRAM_CONTENT_DEFAULTS))expect(contentItem(key).default_text,key).toBe(text);
  });
  it('uses the reviewed account/navigation labels without a reseller override',()=>{
    const copy=createBotCopy();
    expect(copy.MENU_MY_VPN).toBe('👤 My Account ');
    expect(copy.MENU_HOME).toBe('🏠 Home');
    expect(copy.MENU_BACK).toBe('⬅️ Back');
    expect(copy.BTN.KEY).toBe('🔑 VPN Key ရယူရန်');
    expect(copy.extra.planButton({data_limit_gb:50,duration_days:30,price_mmk:'5,000'})).toBe(' 📊 50 GB  |  ⏰ 30 ရက် |💰 5,000 MMK ');
  });
  it('promotes the expiry wording while retaining the original supported placeholders',()=>{
    const item=contentItem('extra.expiryDetails');
    expect(item.default_text).toBe('\n📅 သက်တမ်းကုန်ဆုံးမည့်ရက်: {expiry_date}');
    expect(item.placeholders).toContain('expiry_deadline');
  });
  it('uses approved command descriptions and preserves reseller overrides',()=>{
    expect(getBotCommands(true).find(x=>x.command==='trial').description).toBe('🎁 အခမဲ့ အစမ်းသုံးရန်');
    const copy=createBotCopy();runWithBotContent({MENU_HOME:'My custom home'},()=>expect(copy.MENU_HOME).toBe('My custom home'));
    expect(copy.MENU_HOME).toBe('🏠 Home');
  });
});
