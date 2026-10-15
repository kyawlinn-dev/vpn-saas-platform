import {it,expect} from 'vitest';import {balanceText} from '../bot/strings.js';import {formatBurmeseDate,renderNotification} from '../bot/notificationTemplates.js';import {yangonDate} from '../services/notificationService.js';import {businessDateOnly} from '../utils/businessTime.js';
it('confirmed queued receipt describes received money and future start without a fabricated expiry',()=>{
  const text=renderNotification('payment_confirmed',{access_status:'queued',plan_name:'Next Plan',amount_mmk:5000,expiry_date:''});
  expect(text).toContain('5000');
  expect(text).toContain('အလိုအလျောက် စတင်ပါမည်');
  expect(text).not.toContain('သက်တမ်း:');
});
it('balance preserves switched package total',()=>{const text=balanceText({totalGb:100,usedGb:73.33,remainingGb:26.67,isUnlimited:false,expiryDate:'2026-10-20',formatBurmeseDate});expect(text).toContain('100.00 GB');expect(text).toContain('73.33 GB');expect(text).toContain('26.67 GB');});
it('balance distinguishes no current and last package from unlimited and unknown',()=>{expect(balanceText({businessSummary:{access_status:'unknown'},lastPackage:{planName:'Last plan',expiryDate:'2026-09-01'},formatBurmeseDate})).toContain('Last plan');expect(balanceText({usedGb:0,isUnlimited:true,formatBurmeseDate})).toContain('Unlimited');expect(balanceText({usedGb:0,isUnlimited:false,formatBurmeseDate})).not.toContain('Unlimited');});
it('Bangkok display boundaries do not change Yangon scheduling day',()=>{const now=new Date('2026-10-15T17:15:00Z');expect(businessDateOnly(now)).toBe('2026-10-16');expect(yangonDate(now)).toBe('2026-10-15');});
it('existing custom warning placeholders still render canonical quota numbers without sends',()=>{expect(renderNotification('data_limit_warning',{percent_used:73,remaining_gb:'26.67'},'{percent_used}% / {remaining_gb} GB')).toBe('73% / 26.67 GB');});
