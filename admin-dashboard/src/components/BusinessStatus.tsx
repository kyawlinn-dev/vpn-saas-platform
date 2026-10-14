import {statusLabels} from '../lib/businessDisplay';
import type {BusinessSummary} from '../types/api';
export function BusinessStatus({summary,showApplication=false}:{summary?:BusinessSummary|null;showApplication?:boolean}) {const labels=statusLabels(summary);return <span className="inline-flex flex-wrap gap-2 text-xs"><span>{labels.access}</span><span>· {labels.review}</span>{summary?.setup_status === "failed" && <span>· Setup failed</span>}{summary?.setup_in_progress && <span>· Setup in progress</span>}{showApplication && <span>· {labels.application}</span>}</span>;}

export function PaymentReviewStatus({summary}:{summary?:Partial<BusinessSummary>|null}) {return <span className="text-xs">{statusLabels(summary).review}</span>;}
