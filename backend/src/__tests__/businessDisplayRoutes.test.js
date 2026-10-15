import {it,expect,vi} from 'vitest';
import {enrichCustomer,enrichOrderAccess} from '../services/customerOrderEnrichmentService.js';
import {toPublicBusinessSummary, toPublicPurchaseReceipt} from '../services/businessDisplayService.js';
const order={id:'o',reseller_id:'r',customer_id:'c',status:'stopped',start_date:'2026-09-01',expiry_date:'2026-09-30',quota_limit_bytes:107374182400,keys:[{id:'k',status:'deleted',used_bytes:78739049472}],payments:[]};
it('list and customer detail share full quota and explicit historical selection',()=>{const detail=enrichOrderAccess(order);const customer=enrichCustomer({id:'c',reseller_id:'r'},{orders:[order]});expect(customer.current_order).toBeNull();expect(customer.last_order.business_summary).toEqual(detail.business_summary);expect(detail.business_summary.quota.limit_bytes).toBe(107374182400);expect(customer.last_order.money_summary.basis).toBe('ledger');});
it('customer enrichment never includes another tenant records even for reused customer id',()=>{expect(enrichCustomer({id:'c',reseller_id:'r'},{orders:[{...order,reseller_id:'other'}]}).orders).toEqual([]);});
it('public business projection excludes staff finance',()=>{const publicOrder=toPublicBusinessSummary(enrichOrderAccess({...order,commission_mmk:1000}).business_summary);expect(publicOrder).not.toHaveProperty('money_summary');expect(JSON.stringify(publicOrder)).not.toContain('commission_mmk');expect(JSON.stringify(publicOrder)).not.toContain('platform_due_mmk');});

it('rejected unstarted purchase is available as a public receipt without becoming last package or exposing staff data', () => {
 const rejected={...order,start_date:null,status:'stopped',review_status:'rejected',payments:[{review_status:'rejected',apply_status:'reversed'}],keys:[{access_url:'secret'}],commission_amount_mmk:1000};
 expect(enrichCustomer({id:'c',reseller_id:'r'},{orders:[rejected]}).last_order).toBeNull();
 const receipt=toPublicPurchaseReceipt(rejected);
 expect(receipt).toMatchObject({order_id:'o',status:'stopped',review_status:'rejected',business_summary:{payment_review_status:'rejected'}});
 expect(Object.keys(receipt).sort()).toEqual(['business_summary','order_id','review_status','status']);
 expect(JSON.stringify(receipt)).not.toMatch(/commission|secret|reseller_id/);
});

it('uses the oldest successful sync and leaves missing evidence unknown',async()=>{const {summarizeUsageFreshness}=await import('../services/usageFreshnessService.js');const now=new Date('2026-10-15T12:00:00Z');expect(summarizeUsageFreshness([{last_usage_sync_at:'2026-10-15T11:00:00Z'},{last_usage_sync_at:'2026-10-15T08:00:00Z'}],{now}).state).toBe('stale');expect(summarizeUsageFreshness([{last_usage_sync_at:'2026-10-15T11:00:00Z'},{}],{now}).state).toBe('unknown');});

it('customer current protocol follows the live key rather than next-provision preference',()=>{const customer=enrichCustomer({id:'c',reseller_id:'r',protocol_preference:'shadowsocks'},{orders:[{...order,status:'active',expiry_date:'2099-01-01',keys:[{status:'active',protocol:'vless',access_url:'https://fixture.invalid/sub'}]}]});expect(customer.protocol).toBe('vless');});
