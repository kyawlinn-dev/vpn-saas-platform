import {describe,it,expect,vi} from 'vitest';
import {createTelegramBotContentService} from '../services/telegramBotContentService.js';

function fixture(){
  const rows=[],calls=[];
  const client={from:table=>{
    const filters={};let action='select',value;
    const q={select:()=>q,eq:(key,v)=>{filters[key]=v;return q;},upsert:(v)=>{action='upsert';value=v;return q;},delete:()=>{action='delete';return q;},
      then:resolve=>{
        calls.push({table,action,filters:{...filters},value});
        if(action==='upsert'){const old=rows.find(x=>x.reseller_id===value.reseller_id&&x.content_key===value.content_key);if(old)Object.assign(old,value);else rows.push({...value});}
        if(action==='delete')for(let i=rows.length-1;i>=0;i--)if(Object.entries(filters).every(([k,v])=>rows[i][k]===v))rows.splice(i,1);
        return Promise.resolve(resolve({data:rows.filter(row=>Object.entries(filters).every(([k,v])=>row[k]===v)),error:null}));
      }};return q;
  }};
  return {service:createTelegramBotContentService({client}),rows,calls};
}
describe('reseller-scoped bot content persistence',()=>{
  it('saves only recognized content and isolates reads/reset by reseller',async()=>{
    const f=fixture(),key='guides.shadowsocks.url';await f.service.save('one',key,'https://t.me/one/1');await f.service.save('two',key,'https://t.me/two/1');
    expect((await f.service.list('one')).find(x=>x.key===key).text).toBe('https://t.me/one/1');
    await f.service.reset('one',key);
    expect((await f.service.list('one')).find(x=>x.key===key).is_custom).toBe(false);
    expect((await f.service.list('two')).find(x=>x.key===key).text).toBe('https://t.me/two/1');
    for(const call of f.calls)expect(call.value?.reseller_id||call.filters.reseller_id).toBeTruthy();
  });
  it('rejects invalid values before any write and previews without persistence or real customers',async()=>{
    const f=fixture();await expect(f.service.save('one','MENU_HOME','<script>x</script>')).rejects.toThrow();
    await expect(f.service.save('one','missing','x')).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
    expect(f.service.preview('guides.vless.url','https://t.me/example/5').text).toBe('https://t.me/example/5');
    expect(f.calls).toHaveLength(0);
  });
  it('reloads snapshots after edits and ignores malformed stored overrides',async()=>{
    const f=fixture(),key='guides.vless.url';await f.service.save('one',key,'https://t.me/example/1');expect((await f.service.snapshot('one'))[key]).toBe('https://t.me/example/1');
    await f.service.save('one',key,'https://t.me/example/2');expect((await f.service.snapshot('one'))[key]).toBe('https://t.me/example/2');
    f.rows.push({reseller_id:'one',content_key:'START_CTA_TEXT',custom_text:'<broken>'});
    expect((await f.service.snapshot('one')).START_CTA_TEXT).toBeUndefined();
  });
  it('rejects absent tenant context',async()=>{
    const f=fixture();await expect(f.service.list(null)).rejects.toThrow();expect(f.calls).toHaveLength(0);
  });
  it('clearing a guide link restores the empty built-in fallback',async()=>{
    const f=fixture(),key='guides.vless.url';await f.service.save('one',key,'https://t.me/example/1');
    const reset=await f.service.reset('one',key);expect(reset.text).toBe('');expect(reset.is_custom).toBe(false);
    const another=(await f.service.list('two')).find(x=>x.key===key);expect(another.text).toBe('');expect(another.is_custom).toBe(false);
  });
  it('rejects templates whose formatting would break internally rendered payment blocks',()=>{
    const f=fixture();
    expect(()=>f.service.preview('buyPaymentInstructions','<code>{payment_accounts}</code>')).toThrow();
  });
});
