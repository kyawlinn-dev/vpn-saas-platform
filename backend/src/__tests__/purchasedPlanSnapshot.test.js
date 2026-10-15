import { it, expect } from 'vitest';
import { resolvePurchasedPlanSnapshot } from '../services/orderLifecycleService.js';
it('queued activation preserves purchased duration and quota after catalogue edits',()=>{
 const order={plan_id:'p',price_mmk:5000}; const catalogue={id:'p',duration_days:90,data_limit_gb:300,price_mmk:9000};
 const receipt={plan_id:'p',review_status:'confirmed',apply_status:'applied',package_duration_days:30,package_data_limit_gb:100};
 expect(resolvePurchasedPlanSnapshot(order,catalogue,[receipt])).toMatchObject({duration_days:30,data_limit_gb:100,price_mmk:5000});
 expect(resolvePurchasedPlanSnapshot(order,catalogue,[{...receipt,package_data_limit_gb:null}]).data_limit_gb).toBeNull();
 expect(resolvePurchasedPlanSnapshot(order,catalogue,[])).toEqual(catalogue);
});
