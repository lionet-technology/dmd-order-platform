// SLA timestamps are UTC; manual calendar dates expire at end of day in Vietnam.
export const SLA_HOURS = { PURCHASE_FAILED:4, WAREHOUSE_HOLD:24, WEIGHT_ADJUSTMENT:24, CLIENT_CLAIM:48, SUPPLIER_RECOVERY:72, UNIDENTIFIED_INBOUND:24 } as const;
export function instant(value:unknown){const s=String(value);const n=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s)?s+'T23:59:59.999+07:00':/Z$|[+-]\d{2}:\d{2}$/.test(s)?s:s.replace(' ','T')+'Z');if(!Number.isFinite(n))throw Error('Deadline không hợp lệ.');return n;}
export function deadline(type:keyof typeof SLA_HOURS,created:unknown=new Date().toISOString(),manual?:unknown){if(manual)return new Date(instant(manual)).toISOString();return new Date(instant(created)+SLA_HOURS[type]*3600000).toISOString();}
export function slaState(due:unknown,closed=false,now=Date.now()){if(closed)return 'DONE';if(!due)return 'NONE';const remaining=instant(due)-now;return remaining<=0?'OVERDUE':remaining<=4*3600000?'NEAR_DUE':'ON_TIME';}
