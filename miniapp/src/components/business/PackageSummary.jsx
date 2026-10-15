import {getPackagePaymentLabel} from '../../lib/paymentStatus';
import {useLanguage} from '../../i18n/language';
import {quotaDisplay,formatBusinessDate} from '../../lib/businessDisplay';
export function PackageSummary({subscription,mode='current'}) {
 const {t}=useLanguage();const summary=subscription?.business_summary;
 const q=quotaDisplay(summary?.quota ?? subscription?.quota);const fresh=summary?.usage_freshness;
 const review=summary?.payment_review_status ?? ({pending_review:'awaiting_review',confirmed:'confirmed',rejected:'rejected'}[subscription?.review_status]);
 const payment=getPackagePaymentLabel(subscription,t);
 if(!subscription)return <p className="text-sm text-muted-foreground">{t('access.noActivePackage')}</p>;
 return <section className="space-y-2" aria-label={mode==='last'?'Last package':mode==='queued'?'Queued package':'Current package'}>
 <div className="flex flex-wrap justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><span>{mode==='last'?t('business.lastPackage'):mode==='queued'?t('business.queued'):t('common.active')}</span>{payment&&<span>{payment}</span>}</div>
 <p className="text-[15px] font-semibold">{subscription.plan_name || t('common.premiumPlan')}</p>
 {mode!=='queued'&&<><p className="text-xs">{q.kind==='unknown'?t('business.unavailable'):q.used+' / '+(q.kind==='unlimited'?t('business.unlimited'):q.total)}</p>
 {q.percent!=null&&<p className="text-xs">{Math.round(q.percent)}% · {t('business.remaining')}: {q.remaining}</p>}
 {subscription.expiry_date&&<p className="text-xs text-muted-foreground">{t('access.validUntil',{date:formatBusinessDate(subscription.expiry_date,{dateOnly:true})})}</p>}
 {mode==='current'&&<p className="text-[10px] text-muted-foreground">{fresh?.last_synced_at?t('business.synced')+': '+formatBusinessDate(fresh.last_synced_at)+(fresh.state==='stale'?' · '+t('business.stale'):''):t('business.syncUnknown')}</p>}</>}
 {mode==='queued'&&review==='confirmed'&&<p className="text-xs text-muted-foreground">{t('business.confirmedQueue')}</p>}
 </section>;
}
