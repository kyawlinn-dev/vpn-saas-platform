import express from 'express';
import router from '../routes/reseller/resellerOrdersRouter.js';
import {it,expect,vi,beforeEach} from 'vitest';
const {rpc,from}=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));vi.mock('../lib/supabase.js',()=>({supabase:{rpc,from}}));
import {runDashboardPurchaseSetup} from '../services/dashboardPurchaseService.js';
import {prepareDashboardPurchase} from '../services/dashboardPurchaseService.js';
beforeEach(()=>rpc.mockReset());const order={id:'o',reseller_id:'r',customer_id:'c',status:'pending',source:'dashboard',order_type:'purchase',payment_status:'paid',review_status:'confirmed'};
it('paid setup retry keeps one sale',async()=>{let attempts=0;const payment={amount_mmk:5000,review_status:'confirmed',apply_status:'applied'};const payments=[payment];rpc.mockImplementation(async(name)=>name==='claim_dashboard_purchase_setup'?{data:{claimed:true,plan_snapshot:{duration_days:30}},error:null}:{error:null});const activate=async()=>{if(++attempts===1)throw new Error('provider offline');return {success:true,expiry_date:'2026-11-15'};};expect(await runDashboardPurchaseSetup({order,resellerId:'r',activate})).toMatchObject({purchase_outcome:'setup_failed',payment_status:'paid',order_id:'o'});expect(await runDashboardPurchaseSetup({order,resellerId:'r',activate})).toMatchObject({purchase_outcome:'active',order_id:'o'});expect(payments).toEqual([{amount_mmk:5000,review_status:'confirmed',apply_status:'applied'}]);});
it('queued and unpaid purchases do not provision and running setup cannot be stolen',async()=>{for(const state of ['queued','awaiting_payment','running']){rpc.mockResolvedValue({data:{claimed:false,state},error:null});const result=await runDashboardPurchaseSetup({order,resellerId:'r',activate:()=>{throw new Error('must not provision');}});expect(result.purchase_outcome).toBe(state==='running'?'setup_in_progress':state);}});
it('rejects another tenant before setup',async()=>{await expect(runDashboardPurchaseSetup({order,resellerId:'other',activate:()=>{}})).rejects.toMatchObject({code:'ORDER_NOT_FOUND'});});
it('a missing setup migration fails closed instead of using unsafe activation',async()=>{rpc.mockResolvedValue({error:{code:'PGRST202',message:'missing RPC'}});await expect(runDashboardPurchaseSetup({order,resellerId:'r',activate:()=>{throw new Error('unsafe');}})).rejects.toMatchObject({code:'SETUP_UNAVAILABLE'});});

it('logs the failed database operation without purchase payload or database detail',async()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try {
  rpc.mockResolvedValue({error:{code:'23502',message:'null value violates not-null constraint',details:'private submitted row'}});
  await expect(prepareDashboardPurchase({resellerId:'r',requestKey:'44444444-4444-4444-8444-444444444444',payload:{full_name:'Private customer',payment_note:'Private receipt'}})).rejects.toMatchObject({code:'SETUP_UNAVAILABLE'});
  expect(log).toHaveBeenCalledWith('Dashboard purchase database error:',{operation:'prepare_dashboard_purchase',code:'23502',message:'null value violates not-null constraint'});
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/Private|private submitted row/);
 } finally {log.mockRestore();}
});

it('manual purchase route returns a paid queued order and supports stable request replay',async()=>{const row={...order,status:'scheduled',total_paid_mmk:5000,plan_id:'p',plan:{id:'p',is_trial:false}};from.mockImplementation(()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:row,error:null})};return q;});rpc.mockImplementation(async(name)=>({data:name==='claim_dashboard_purchase_setup'?{claimed:false,state:'queued'}:{order_id:'o',customer_id:'c'},error:null}));const app=express();app.use(express.json());app.use((req,res,next)=>{req.reseller={id:'r'};next();});app.use('/orders',router);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));try{for(let i=0;i<2;i++){const response=await fetch('http://127.0.0.1:'+server.address().port+'/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({full_name:'Fixture',plan_id:'p',payment_status:'paid',idempotency_key:'44444444-4444-4444-8444-444444444444'})});expect(response.status).toBe(201);expect(await response.json()).toMatchObject({order_id:'o',purchase_outcome:'queued',total_paid_mmk:5000});}}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}});
