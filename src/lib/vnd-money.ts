/**
 * Exact finite decimal VNĐ for the V1 cutover. Persist canonical strings, never
 * SQLite REAL or legacy USD cents. This module does not activate the cutover.
 */
export type Vnd = string & {readonly __vnd: unique symbol};
type Decimal = {coefficient:bigint;scale:number};
const MAX_DIGITS=1000; // Resource bound, not monetary rounding.
function read(value:string):Decimal {
 if(typeof value!=="string"||value.length>MAX_DIGITS||! /^-?\d+(?:\.\d+)?$/.test(value))
  throw Error("VNĐ cần chuỗi thập phân hữu hạn.");
 const negative=value.startsWith("-"),parts=(negative?value.slice(1):value).split(".");
 return {coefficient:BigInt(parts.join(""))*(negative?-1n:1n),scale:parts[1]?.length||0};
}
function write({coefficient,scale}:Decimal):Vnd {
 if(coefficient===0n)return "0" as Vnd;
 while(scale>0&&coefficient%10n===0n){coefficient/=10n;scale--;}
 const negative=coefficient<0n,text=(negative?-coefficient:coefficient).toString().padStart(scale+1,"0");
 const result=(negative?"-":"")+(scale?text.slice(0,-scale)+"."+text.slice(-scale):text);
 if(result.length>MAX_DIGITS)throw Error("VNĐ vượt giới hạn biểu diễn.");
 return result as Vnd;
}
export function vnd(value:string):Vnd {return write(read(value));}
function aligned(a:string,b:string) {
 const x=read(a),y=read(b),scale=Math.max(x.scale,y.scale);
 return {a:x.coefficient*10n**BigInt(scale-x.scale),b:y.coefficient*10n**BigInt(scale-y.scale),scale};
}
export function addVnd(a:string,b:string):Vnd {const x=aligned(a,b);return write({coefficient:x.a+x.b,scale:x.scale});}
export function subtractVnd(a:string,b:string):Vnd {const x=aligned(a,b);return write({coefficient:x.a-x.b,scale:x.scale});}
export function multiplyVnd(a:string,factor:string):Vnd {
 const x=read(a),y=read(factor);
 return write({coefficient:x.coefficient*y.coefficient,scale:x.scale+y.scale});
}
export function compareVnd(a:string,b:string):-1|0|1 {const x=aligned(a,b);return x.a<x.b?-1:x.a>x.b?1:0;}
export function sumVnd(values:Iterable<string>):Vnd {let total=vnd("0");for(const value of values)total=addVnd(total,value);return total;}
/** Cancellation policy percentage, not the independent shipping Claim workflow. */
export function cancellationRefundVnd(collected:string,previousRefunds:string,percent:string):Vnd {
 if(compareVnd(collected,"0")<0||compareVnd(previousRefunds,"0")<0||compareVnd(percent,"0")<0||compareVnd(percent,"100")>0)
  throw Error("Cơ sở hoàn VNĐ / tỷ lệ không hợp lệ.");
 const remaining=subtractVnd(collected,previousRefunds);
 const target=subtractVnd(multiplyVnd(multiplyVnd(collected,percent),"0.01"),previousRefunds);
 if(compareVnd(remaining,"0")<=0||compareVnd(target,"0")<=0)return vnd("0");
 return compareVnd(target,remaining)<0?target:remaining;
}
