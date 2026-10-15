import { it, expect, vi } from 'vitest';
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../lib/supabase.js', () => ({ supabase: { from } }));
import { getBestActiveOrder, getFullActiveOrder, getLastCustomerPackage } from '../bot/botCustomerService.js';

it('Bangkok midnight moves an expired-by-date active row from current to last before lifecycle cleanup', async () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T17:05:00Z'));
 const row={id:'old',status:'active',order_type:'purchase',review_status:'confirmed',start_date:'2026-09-20',expiry_date:'2026-10-20',plan:{name:'Last plan'}};
 from.mockImplementation(()=>{
  let rows=[row];
  const q={select:()=>q,eq:()=>q,in:(_key,values)=>{rows=rows.filter(r=>values.includes(r.status));return q;},not:()=>q,order:()=>q,limit:()=>q,
   gte:(_key,value)=>{rows=rows.filter(r=>r.expiry_date>=value);return q;},
   range:async()=>({data:rows,error:null}),maybeSingle:async()=>({data:rows[0]||null,error:null}),then:resolve=>resolve({data:rows,error:null})};return q;
 });
 try {expect(await getBestActiveOrder('c','r')).toBeNull();expect(await getFullActiveOrder('c','r')).toBeNull();expect(await getLastCustomerPackage('c','r')).toEqual({planName:'Last plan',expiryDate:'2026-10-20'});} finally {vi.useRealTimers();}
});
