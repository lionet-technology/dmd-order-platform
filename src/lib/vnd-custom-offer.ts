import {db} from './db';
import {sumVnd} from './vnd-money';

const fields=['selling_vnd','net_vnd','base_vnd'] as const;
type Field=(typeof fields)[number];
type Row=Record<string,unknown>;
type LotPrice={lot_id:number;lot_number:number}&Partial<Record<Field,string>>;

export function customVndOffer(orderId:number,input:Row,currentOffer:unknown,nonnegative:(value:unknown)=>string){
 const previous=db.prepare('SELECT snapshot_json FROM vnd_auto_quotes WHERE order_id=?').get(orderId) as {snapshot_json:string}|undefined;
 const prior=JSON.parse(previous?.snapshot_json??'{}');
 const snapshot:Row=prior.source==='MANUAL_CUSTOM'?{...prior}:{source:'MANUAL_CUSTOM'};
 if(snapshot.selling_vnd===undefined&&typeof currentOffer==='string')snapshot.selling_vnd=currentOffer;
 const oldLots=(snapshot.lots as LotPrice[]|undefined)??[];
 const lots=db.prepare('SELECT DISTINCT l.id AS lot_id,l.lot_number FROM order_lots l JOIN order_cartons c ON c.order_lot_id=l.id WHERE l.order_id=? ORDER BY l.lot_number').all(orderId) as LotPrice[];
 const lotNumbers=new Set(lots.map(lot=>lot.lot_number));
 const submitted=new Map<number,Row>();
 if(input.lot_prices!==undefined){
  if(!Array.isArray(input.lot_prices)||!input.lot_prices.length)throw Error('Cần nhập giá cho các Lot.');
  for(const row of input.lot_prices){
   if(!row||typeof row!=='object'||Array.isArray(row)||!lotNumbers.has(row.lot_number)||submitted.has(row.lot_number)||
      Object.keys(row).some(key=>key!=='lot_number'&&!fields.includes(key as Field))||!fields.some(field=>row[field]!==undefined))
    throw Error('Lot hoặc trường giá không hợp lệ.');
   submitted.set(row.lot_number,row);
  }
 }
 for(const field of fields){
  const orderValue=input[field==='selling_vnd'?'amount':field];
  const hasLotValue=[...submitted.values()].some(row=>row[field]!==undefined);
  if(orderValue!==undefined&&hasLotValue)throw Error('Mỗi trường giá chỉ được nhập ở cấp Order hoặc Lot.');
  if(hasLotValue){
   for(const lot of lots){
    const value=submitted.get(lot.lot_number)?.[field];
    if(value===undefined)throw Error('Cần nhập trường giá cho tất cả Lot.');
    lot[field]=nonnegative(value);
   }
   snapshot[field]=sumVnd(lots.map(lot=>lot[field]!));
  }else if(orderValue!==undefined){
   snapshot[field]=nonnegative(orderValue);
  }else{
   for(const lot of lots){
    const value=oldLots.find(row=>row.lot_id===lot.lot_id)?.[field];
    if(value!==undefined)lot[field]=value;
   }
  }
 }
 snapshot.lots=lots.filter(lot=>fields.some(field=>lot[field]!==undefined));
 if(typeof snapshot.selling_vnd!=='string')throw Error('Cần nhập Selling Price ở cấp Order hoặc Lot.');
 const serialized=JSON.stringify(snapshot);
 if(previous?.snapshot_json!==serialized){
  db.prepare('INSERT INTO vnd_auto_quote_history(order_id,snapshot_json) VALUES (?,?)').run(orderId,serialized);
  db.prepare('INSERT INTO vnd_auto_quotes(order_id,snapshot_json,manual_offer) VALUES (?,?,1) ON CONFLICT(order_id) DO UPDATE SET snapshot_json=excluded.snapshot_json,manual_offer=1,pricing_error=NULL').run(orderId,serialized);
 }
 return snapshot.selling_vnd;
}
