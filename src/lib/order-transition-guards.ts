type Order=Record<string,unknown>;
export type TransitionGuard={allowed:boolean;reason:string};
const result=(allowed:boolean,reason:string):TransitionGuard=>({allowed,reason:allowed?'':reason});
const known=['SALES_DRAFT','PENDING_PURCHASE','PURCHASING','PURCHASED','RECONCILED','HOLD','CANCELLED','DELIVERED','CLOSED'];
const status=(o:Order)=>String(o.workflow_status||'');
export function canReceiveInbound(o:Order){return result(['PURCHASING','PURCHASED','RECONCILED','HOLD'].includes(status(o)),'Trạng thái đơn không cho phép nhận hàng.');}
export function canMatchInbound(o:Order){const g=canReceiveInbound(o);return {...g,reason:g.allowed?'':'Trạng thái đơn không cho phép match hàng.'};}
export const canMeasure=canReceiveInbound;
/** Carrier history / Cargo policy remains in cancellationPolicy. */
export function canCancelOrder(o:Order){return result(known.includes(status(o))&&!['CANCELLED','DELIVERED','CLOSED'].includes(status(o))&&!o.fulfillment_started_at,'Đơn đã huỷ, kết thúc hoặc bắt đầu vận chuyển; không thể huỷ.');}
export function canPurchase(o:Order){return result(['SALES_DRAFT','PENDING_PURCHASE','PURCHASING'].includes(status(o))&&!o.purchase_completed_at,'Đơn đã hoàn tất, đang Hold hoặc không cho phép mua.');}
export function canWarehouseOutbound(o:Order){return result(known.includes(status(o))&&!['CANCELLED','DELIVERED','CLOSED','HOLD'].includes(status(o)),'Trạng thái đơn không cho phép xuất kho.');}
