/** Single source of truth for physical Carton limit per shipping service. */
export function maxCartonsForService(service:unknown,configured:unknown):number{
 if(/epacket|yun/i.test(String(service??'')))return 1;
 const max=Number(configured);
 return Number.isSafeInteger(max)&&max>0?max:1;
}
export function assertRouteCartons(service:unknown,configured:unknown,quantity:unknown){
 const count=Number(quantity),max=maxCartonsForService(service,configured);
 if(!Number.isSafeInteger(count)||count<1||count>max)throw Error('Route chỉ cho phép từ 1 đến '+max+' Carton/Order.');
 return count;
}
