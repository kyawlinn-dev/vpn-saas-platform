import {it,expect} from 'vitest';
import {readAllRows} from '../utils/readAllRows.js';
it('reads past one response page and never returns partial data after error',async()=>{const rows=Array.from({length:1200},(_,id)=>({id}));const query=()=>({range:async(a,b)=>({data:rows.slice(a,b+1),error:null})});expect((await readAllRows(query)).data).toHaveLength(1200);const failed=await readAllRows(()=>({range:async(a)=>a?{error:{message:'offline'}}:{data:rows.slice(0,1000)}}));expect(failed.error.message).toBe('offline');expect(failed.data).toBeNull();});
