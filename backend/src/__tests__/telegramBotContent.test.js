import {describe,it,expect} from 'vitest';
import {BOT_CONTENT_ITEMS,EDITABLE_BOT_CONTENT_ITEMS,contentItem} from '../bot/contentCatalog.js';
import {validateBotContent,renderBotContent} from '../bot/contentRendering.js';
import {createTelegramBotContentService} from '../services/telegramBotContentService.js';

describe('Telegram content catalogue and rendering',()=>{
  it('has unique keys and valid defaults, with business actions excluded',()=>{
    expect(BOT_CONTENT_ITEMS.length).toBeGreaterThan(90);
    expect(new Set(BOT_CONTENT_ITEMS.map(x=>x.key)).size).toBe(BOT_CONTENT_ITEMS.length);
    for(const item of BOT_CONTENT_ITEMS)expect(()=>validateBotContent(item.key,item.default_text),item.key).not.toThrow();
    const preview=createTelegramBotContentService({client:{}}).preview;
    for(const item of EDITABLE_BOT_CONTENT_ITEMS)expect(()=>preview(item.key,item.default_text),item.key).not.toThrow();
    for(const key of ['DL_CB.SS','LEGACY_BTN.KEY','NOTIFY_CONFIRM_BTN','START_CB_GET_KEY'])expect(()=>contentItem(key)).toThrow();
  });
  it('renders Burmese and escapes dynamic content without recursive interpolation',()=>{
    expect(renderBotContent('startWelcome','မင်္ဂလာပါ <b>{brand_name}</b>',{brand_name:'A<& {plan_name}'}))
      .toBe('မင်္ဂလာပါ <b>A&lt;&amp; {plan_name}</b>');
  });
  it.each(['<script>x</script>','<b onclick="x">x</b>','<b>unclosed','<b><i>x</b></i>','<a href="javascript:alert(1)">x</a>','<a href="https://example.com/{brand_name}">x</a>','Hello {unknown}','<code><b>x</b></code>','<!DOCTYPE x>','<img src="x"/>'])('rejects unsafe message %s',value=>{
    expect(()=>validateBotContent('startWelcome',value)).toThrow();
  });
  it('rejects markup/newlines in labels and excessive text',()=>{
    expect(()=>validateBotContent('MENU_HOME','<b>Home</b>')).toThrow();
    expect(()=>validateBotContent('MENU_HOME','Home\nOther')).toThrow();
    expect(()=>validateBotContent('MENU_HOME','x'.repeat(65))).toThrow();
    expect(()=>validateBotContent('START_CTA_TEXT','x'.repeat(3001))).toThrow();
    expect(()=>validateBotContent('commands.start.description','x'.repeat(257))).toThrow();
  });
  it('keeps callback alerts plain and within their separate Telegram limit',()=>{
    for(const key of ['SERVER_ALREADY_LINKED','extra.serverUnavailable','extra.serverFull']){
      expect(()=>validateBotContent(key,'x'.repeat(201))).toThrow();
      expect(()=>validateBotContent(key,'<b>Unavailable</b>')).toThrow();
    }
  });
  it('allows empty optional guides and safe HTTPS URLs but not credentials or executable URLs',()=>{
    expect(()=>validateBotContent('guides.shadowsocks.url','')).not.toThrow();
    expect(()=>validateBotContent('guides.vless.url','https://t.me/example/123')).not.toThrow();
    for(const value of ['javascript:alert(1)','http://example.com','https://u:p@example.com','https://127.0.0.1/x','https://example.com/\nabc'])
      expect(()=>validateBotContent('guides.vless.url',value)).toThrow();
  });
  it('rejects unknown keys and non-string text',()=>{
    expect(()=>validateBotContent('not.a.key','Hi')).toThrow();
    expect(()=>validateBotContent('MENU_HOME',null)).toThrow();
  });
});
