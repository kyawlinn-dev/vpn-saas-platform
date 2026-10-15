import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
const read = () => JSON.parse(fs.readFileSync(new URL('../../../tests/fixtures/business-displays.json', import.meta.url)));
describe('business display release scenarios', () => {
 it('switched fixture preserves full package allowance', () => {
 const quota = read().switched.quota;
 expect(quota.limit_bytes).toBe(107374182400);
 expect(quota.used_bytes).toBe(78739049472);
 expect(quota.remaining_bytes).toBe(28635132928);
 expect(quota.used_bytes + quota.remaining_bytes).toBe(quota.limit_bytes);
 });
 it('covers payment, package and accounting boundaries', () => {
 for(const key of ['pending_active','queue_confirmed','rejected_queue','legacy','mixed_money','no_current','trial','unlimited','unknown','month_boundary','missing_metric']) expect(read()[key]).toBeDefined();
 });
});
