import {describe,it,expect,vi} from 'vitest';
import {createTelegramBotContentService} from '../services/telegramBotContentService.js';

describe('links-only bot settings',()=>{
  function fixture(){
    const rows=[{content_key:'MENU_HOME',custom_text:'Old custom home'},
      {content_key:'guides.shadowsocks.url',custom_text:'https://t.me/example/1'},
      {content_key:'downloads.ios.url',custom_text:'https://t.me/example/2'}];
    const client={from:vi.fn(()=>({select:()=>({eq:async()=>({data:rows,error:null})})}))};
    return {service:createTelegramBotContentService({client}),client};
  }
  it('lists only two separate guide URLs',async()=>{
    const {service}=fixture(),items=await service.list('tenant');
    expect(items.map(x=>x.key).sort()).toEqual(['guides.shadowsocks.url','guides.vless.url'].sort());
    expect(items.every(x=>x.kind==='url'&&x.default_text==='')).toBe(true);
  });
  it('uses code text defaults instead of historical text overrides',async()=>{
    const {service}=fixture();expect(await service.snapshot('tenant')).toEqual({
      'guides.shadowsocks.url':'https://t.me/example/1',
    });
  });
  it('blocks old text editing and preserves existing rows without writing',async()=>{
    const {service,client}=fixture();
    for(const key of ['MENU_HOME','startWelcome','commands.start.description','DL_SS_PLATFORMS.ios.apps.0.url','downloads.android.url','downloads.ios.url','downloads.macos.url','downloads.windows.url']){
      await expect(service.save('tenant',key,'Changed')).rejects.toMatchObject({code:'BOT_CONTENT_UNKNOWN_KEY'});
      await expect(service.reset('tenant',key)).rejects.toMatchObject({code:'BOT_CONTENT_UNKNOWN_KEY'});
    }
    expect(client.from).not.toHaveBeenCalled();
    expect(()=>service.preview('guides.vless.url','')).not.toThrow();
    expect(()=>service.preview('guides.vless.url','javascript:bad')).toThrow();
  });
});
