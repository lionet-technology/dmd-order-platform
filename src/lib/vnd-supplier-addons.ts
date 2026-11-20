import {db} from './db';
import type {AuthUser} from './auth';
import {validVndDay,vndDay} from './vnd-debt';
import {compareVnd,subtractVnd,sumVnd,vnd} from './vnd-money';
import {postSupplierAddonClientCharge} from './vnd-operational';

type Row=Record<string,unknown>;
type Addon={id:number;supplier:string;supplier_key:string;direction:'BUY'|'SELL';name:string;amount:string;client_id:number|null;reference:string;created_at:string};
type Settlement={id:number;addon_id:number;amount:string;executed_day:string;reference:string};

function access(actor:AuthUser){
 const user=db.prepare('SELECT role,active FROM users WHERE id=?').get(actor.id) as Row|undefined;
 if(!user?.active||user.role!==actor.role||!['ADMIN','FINANCE','BOD'].includes(actor.role))throw Error('Không có quyền Supplier Add-on.');
}
function text(value:unknown,max:number){
 const normalized=typeof value==='string'?value.trim():'';
 if(!normalized||normalized.length>max)throw Error('Thiếu nội dung hoặc nội dung quá dài.');
 return normalized;
}
function positive(value:unknown){
 if(typeof value!=='string')throw Error('Cần số tiền VNĐ dạng thập phân.');
 const amount=vnd(value);
 if(compareVnd(amount,'0')<=0)throw Error('Số tiền phải lớn hơn 0.');
 return amount;
}

export function readSupplierAddons(actor:AuthUser,month=vndDay().slice(0,7)){
 return db.transaction(()=>{
  access(actor);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Tháng cần định dạng YYYY-MM.');
  const addons=db.prepare('SELECT * FROM vnd_supplier_addons ORDER BY id DESC').all() as Addon[];
  const settlements=db.prepare('SELECT * FROM vnd_supplier_addon_settlements ORDER BY executed_day,id').all() as Settlement[];
  const groups=new Map<number,Settlement[]>();
  for(const entry of settlements){
   const group=groups.get(entry.addon_id)??[];
   group.push(entry);
   groups.set(entry.addon_id,group);
  }
  const cash=new Map<string,{supplier:string;paid:string[];received:string[]}>();
  const entries=addons.map(addon=>{
   const history=groups.get(addon.id)??[];
   const monthAmounts=history.filter(entry=>entry.executed_day.startsWith(month+'-')).map(entry=>entry.amount);
   if(monthAmounts.length){
    const totals=cash.get(addon.supplier_key)??{supplier:addon.supplier,paid:[],received:[]};
    totals[addon.direction==='BUY'?'paid':'received'].push(...monthAmounts);
    cash.set(addon.supplier_key,totals);
   }
   const {id,supplier,direction,name,amount,client_id,reference,created_at}=addon;
   const settled=sumVnd(history.map(entry=>entry.amount));
   return {id,supplier,direction,name,amount,client_id,reference,created_at,settled,outstanding:client_id===null?subtractVnd(amount,settled):null,settlements:history};
  });
  const by_supplier=Array.from(cash.values(),row=>({supplier:row.supplier,paid:sumVnd(row.paid),received:sumVnd(row.received)}));
  const paid=sumVnd(by_supplier.map(row=>row.paid)),received=sumVnd(by_supplier.map(row=>row.received));
  return {month,entries,by_supplier,paid,received,net:subtractVnd(received,paid)};
 }).deferred();
}

export function applySupplierAddon(actor:AuthUser,input:Row){
 return db.transaction(()=>{
  access(actor);
  const requestKey=text(input.request_key,160),key='supplier-addon:'+requestKey;
  const payload=JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b))));
  const receipt=db.prepare('SELECT actor_id,payload,result_json FROM vnd_commands WHERE request_key=?').get(key) as Row|undefined;
  if(receipt){
   if(receipt.actor_id!==actor.id||receipt.payload!==payload)throw Error('request_key đã dùng với dữ liệu khác.');
   return JSON.parse(String(receipt.result_json)) as {id:number};
  }
  const amount=positive(input.amount),reference=text(input.reference,200),reason=text(input.reason,2000);
  let id:number;
  if(input.action==='create'){
   const supplier=text(input.supplier,500),name=text(input.name,200);
   const direction=input.direction;
   if(direction!=='BUY'&&direction!=='SELL')throw Error('Chọn BUY hoặc SELL.');
   const clientId=input.client_id==null?null:Number(input.client_id);
   if(clientId!==null&&(direction!=='SELL'||!Number.isSafeInteger(clientId)||clientId<1||
       !db.prepare('SELECT client_id FROM vnd_accounts WHERE client_id=?').get(clientId)))
    throw Error('Client hợp lệ cần tài khoản VNĐ và hướng SELL.');
   const supplierKey=supplier.normalize('NFC').toLowerCase(),referenceKey=reference.normalize('NFC').toLowerCase();
   if(db.prepare('SELECT id FROM vnd_supplier_addons WHERE supplier_key=? AND direction=? AND reference_key=?').get(supplierKey,direction,referenceKey))
    throw Error('Trùng tham chiếu Add-on Supplier.');
   id=Number(db.prepare(`INSERT INTO vnd_supplier_addons(supplier,supplier_key,direction,name,amount,client_id,reference,reference_key,reason,actor_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(supplier,supplierKey,direction,name,amount,clientId,reference,referenceKey,reason,actor.id).lastInsertRowid);
   if(clientId!==null)postSupplierAddonClientCharge(actor,clientId,id,amount);
  }else if(input.action==='settle'){
   const addon=db.prepare('SELECT * FROM vnd_supplier_addons WHERE id=?').get(Number(input.addon_id)) as Addon|undefined;
   if(!addon)throw Error('Không tìm thấy Add-on.');
   if(addon.client_id!==null)throw Error('Khoản Client trả sau đi qua luồng nạp tiền.');
   const day=validVndDay(input.executed_day);
   if(day>vndDay())throw Error('Chỉ ghi khoản đã thực trả hoặc thực nhận.');
   const referenceKey=JSON.stringify([addon.supplier_key,reference.normalize('NFC').toLowerCase()]);
   if(db.prepare('SELECT id FROM vnd_supplier_addon_settlements WHERE reference_key=?').get(referenceKey))
    throw Error('Trùng tham chiếu thanh toán Add-on.');
   const history=db.prepare('SELECT amount FROM vnd_supplier_addon_settlements WHERE addon_id=?').all(addon.id) as Settlement[];
   if(compareVnd(amount,subtractVnd(addon.amount,sumVnd(history.map(entry=>entry.amount))))>0)
    throw Error('Số tiền vượt phần còn phải trả hoặc phải thu.');
   id=Number(db.prepare(`INSERT INTO vnd_supplier_addon_settlements(addon_id,amount,executed_day,reference,reference_key,reason,actor_id)
    VALUES (?,?,?,?,?,?,?)`).run(addon.id,amount,day,reference,referenceKey,reason,actor.id).lastInsertRowid);
  }else throw Error('Thao tác Supplier Add-on không hợp lệ.');
  const result={id};
  db.prepare('INSERT INTO vnd_commands(request_key,actor_id,payload,result_json) VALUES (?,?,?,?)').run(key,actor.id,payload,JSON.stringify(result));
  return result;
 }).immediate();
}
