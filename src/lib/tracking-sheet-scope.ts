// Preserve all cartons of a touched order without purchasing unrelated queue rows.
export function trackingSheetScope<T extends {order_pk:number;tracking:string}>(rows:T[],orderIds?:number[]):T[]{
  const touched=new Set(orderIds??rows.filter(row=>row.tracking.trim()).map(row=>row.order_pk));
  return rows.filter(row=>touched.has(row.order_pk));
}
