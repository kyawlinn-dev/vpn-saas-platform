import {statusLabels} from '../lib/businessDisplay';
import type {BusinessSummary} from '../types/api';
export function BusinessStatus({summary,showApplication=false}:{summary?:BusinessSummary|null;showApplication?:boolean}) {const labels=statusLabels(summary);return <span className="inline-flex flex-wrap gap-2 text-xs"><span>{labels.access}</span><span>· {labels.review}</span>{showApplication && <span>· {labels.application}</span>}</span>;}
