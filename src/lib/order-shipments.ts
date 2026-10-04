import { orderQuote,clientDraftAwaitingPurchase } from "./route-pricing";
import { db } from "./db";

const text=(value:unknown)=>String(value??"").trim();
const positive=(value:unknown)=>Number(value||0)>0;

export type ShipmentItemInput={
  id?:number;
  sku?:string;
  description:string;
  material?:string;
  quantity:number;
  unit_manufacturing_value?:number|null;
  currency?:string;
};

export type ShipmentCartonInput={
  id?:number;
  carton_number:number;
  lot_number:number;
  weight?:number|null;
  length?:number|null;
  width?:number|null;
  height?:number|null;
  volume?:number|null;
  chargeable_weight?:number|null;
  items:ShipmentItemInput[];
};

export type OrderShipmentStructure={
  lots:Array<Record<string,unknown>>;
  cartons:Array<Record<string,unknown>>;
  items:Array<Record<string,unknown>>;
  allocations:Array<Record<string,unknown>>;
  trackings:Array<Record<string,unknown>>;
};

export function ensureOrderShipmentStructure(orderId:number):OrderShipmentStructure{
  const order=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId) as Record<string,unknown>|undefined;
  if(!order)throw new Error("Order không tồn tại.");
  const lotCount=Math.max(1,Math.trunc(Number(order.expected_lot_count||1)));
  const cartonCount=Math.max(1,Math.trunc(Number(order.carton_count||1)));
  const insertLot=db.prepare("INSERT OR IGNORE INTO order_lots(order_id,lot_number) VALUES (?,?)");
  for(let number=1;number<=lotCount;number++)insertLot.run(orderId,number);
  const lot1=db.prepare("SELECT id FROM order_lots WHERE order_id=? AND lot_number=1").get(orderId) as {id:number};
  const insertCarton=db.prepare("INSERT OR IGNORE INTO order_cartons(order_id,order_lot_id,carton_number) VALUES (?,?,?)");
  for(let number=1;number<=cartonCount;number++)insertCarton.run(orderId,lotCount===1?lot1.id:null,number);

  if(cartonCount===1){
    const complete=positive(order.weight)
      && (positive(order.volume)||(positive(order.length)&&positive(order.width)&&positive(order.height)))
      && Boolean(text(order.item));
    db.prepare("UPDATE order_cartons SET order_lot_id=?,weight=COALESCE(weight,?),length=COALESCE(length,?),width=COALESCE(width,?),height=COALESCE(height,?),volume=COALESCE(volume,?),chargeable_weight=COALESCE(chargeable_weight,?),details_complete=MAX(details_complete,?),updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND carton_number=1")
      .run(lot1.id,order.weight??null,order.length??null,order.width??null,order.height??null,order.volume??null,order.chargeable_weight??null,complete?1:0,orderId);
    if(text(order.item)){
      db.prepare("INSERT OR IGNORE INTO order_items(order_id,sku,description,material,unit_manufacturing_value,currency) VALUES (?,'',?,?,?,'USD')")
        .run(orderId,text(order.item),text(order.material)||null,order.declared_value??null);
      const carton=db.prepare("SELECT id FROM order_cartons WHERE order_id=? AND carton_number=1").get(orderId) as {id:number};
      const item=db.prepare("SELECT id FROM order_items WHERE order_id=? AND sku=''").get(orderId) as {id:number};
      db.prepare("INSERT OR IGNORE INTO carton_items(carton_id,order_item_id,quantity) VALUES (?,?,1)").run(carton.id,item.id);
    }
  }
  return getOrderShipmentStructure(orderId,false);
}

export function getOrderShipmentStructure(orderId:number,ensure=true):OrderShipmentStructure{
  if(ensure)ensureOrderShipmentStructure(orderId);
  const lots=db.prepare("SELECT * FROM order_lots WHERE order_id=? ORDER BY lot_number").all(orderId) as Array<Record<string,unknown>>;
  const cartons=db.prepare("SELECT c.*,l.lot_number FROM order_cartons c LEFT JOIN order_lots l ON l.id=c.order_lot_id WHERE c.order_id=? ORDER BY c.carton_number").all(orderId) as Array<Record<string,unknown>>;
  const items=db.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY id").all(orderId) as Array<Record<string,unknown>>;
  const allocations=db.prepare("SELECT ci.*,oi.sku,oi.description,oi.material,oi.unit_manufacturing_value,oi.currency FROM carton_items ci JOIN order_cartons c ON c.id=ci.carton_id JOIN order_items oi ON oi.id=ci.order_item_id WHERE c.order_id=? ORDER BY c.carton_number,ci.id").all(orderId) as Array<Record<string,unknown>>;
  const trackings=db.prepare("SELECT * FROM order_trackings WHERE order_id=? ORDER BY carton_id,lot_number,id").all(orderId) as Array<Record<string,unknown>>;
  return {lots,cartons,items,allocations,trackings};
}

function cartonComplete(carton:ShipmentCartonInput){
  const hasDimensions=positive(carton.volume)||(positive(carton.length)&&positive(carton.width)&&positive(carton.height));
  const validItems=carton.items.length>0&&carton.items.every(item=>text(item.description)&&Number(item.quantity)>0&&Number(item.unit_manufacturing_value??0)>=0);
  return positive(carton.weight)&&hasDimensions&&validItems;
}

export function saveOrderShipmentStructure(orderId:number,input:{lot_count?:number;cartons:ShipmentCartonInput[]}){
  const order=db.prepare("SELECT id,workflow_status,pricing_snapshot_json FROM orders WHERE id=?").get(orderId) as {id:number;workflow_status:string;pricing_snapshot_json?:string}|undefined;
  if(!order)throw new Error("Order không tồn tại.");
  if(order.pricing_snapshot_json)throw new Error("Dữ liệu kiện đã khóa khi đặt mua dịch vụ.");
  if(order.workflow_status==="CANCELLED")throw new Error("Đơn đã huỷ; không thể sửa khai báo kiện hàng.");
  const cartons=Array.isArray(input.cartons)?input.cartons:[];
  if(!cartons.length)throw new Error("Order phải có ít nhất một carton.");
  const lotCount=Math.max(1,Math.trunc(Number(input.lot_count||Math.max(...cartons.map(row=>Number(row.lot_number||1))))));
  const numbers=new Set<number>();
  for(const carton of cartons){
    const number=Math.trunc(Number(carton.carton_number));
    if(number<1||numbers.has(number))throw new Error("Số carton phải là số nguyên dương và không trùng.");
    numbers.add(number);
    if(Math.trunc(Number(carton.lot_number))<1||Number(carton.lot_number)>lotCount)throw new Error("Carton "+number+" chưa được gán vào lô hợp lệ.");
  }
  return db.transaction(()=>{
    for(let number=1;number<=lotCount;number++)db.prepare("INSERT OR IGNORE INTO order_lots(order_id,lot_number) VALUES (?,?)").run(orderId,number);
    const keepCartonIds:number[]=[];
    for(const carton of cartons){
      const lot=db.prepare("SELECT id FROM order_lots WHERE order_id=? AND lot_number=?").get(orderId,Math.trunc(Number(carton.lot_number))) as {id:number};
      const existing=db.prepare("SELECT id FROM order_cartons WHERE order_id=? AND carton_number=?").get(orderId,Math.trunc(Number(carton.carton_number))) as {id:number}|undefined;
      let cartonId:number;
      if(existing){
        cartonId=existing.id;
        db.prepare("UPDATE order_cartons SET order_lot_id=?,weight=?,length=?,width=?,height=?,volume=?,chargeable_weight=?,details_complete=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(lot.id,carton.weight??null,carton.length??null,carton.width??null,carton.height??null,carton.volume??null,carton.chargeable_weight??null,cartonComplete(carton)?1:0,cartonId);
      }else{
        const result=db.prepare("INSERT INTO order_cartons(order_id,order_lot_id,carton_number,weight,length,width,height,volume,chargeable_weight,details_complete) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .run(orderId,lot.id,Math.trunc(Number(carton.carton_number)),carton.weight??null,carton.length??null,carton.width??null,carton.height??null,carton.volume??null,carton.chargeable_weight??null,cartonComplete(carton)?1:0);
        cartonId=Number(result.lastInsertRowid);
      }
      keepCartonIds.push(cartonId);
      db.prepare("DELETE FROM carton_items WHERE carton_id=?").run(cartonId);
      for(let index=0;index<carton.items.length;index++){
        const item=carton.items[index];
        const sku=text(item.sku)||(cartons.length===1&&carton.items.length===1?"":"ITEM-"+String(index+1));
        if(!text(item.description))throw new Error("Carton "+carton.carton_number+" có sản phẩm thiếu tên.");
        let itemRow=db.prepare("SELECT id FROM order_items WHERE order_id=? AND sku=?").get(orderId,sku) as {id:number}|undefined;
        if(itemRow){
          db.prepare("UPDATE order_items SET description=?,material=?,unit_manufacturing_value=?,currency=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .run(text(item.description),text(item.material)||null,item.unit_manufacturing_value??null,text(item.currency)||"USD",itemRow.id);
        }else{
          const result=db.prepare("INSERT INTO order_items(order_id,sku,description,material,unit_manufacturing_value,currency) VALUES (?,?,?,?,?,?)")
            .run(orderId,sku,text(item.description),text(item.material)||null,item.unit_manufacturing_value??null,text(item.currency)||"USD");
          itemRow={id:Number(result.lastInsertRowid)};
        }
        db.prepare("INSERT INTO carton_items(carton_id,order_item_id,quantity) VALUES (?,?,?)").run(cartonId,itemRow.id,Number(item.quantity)||1);
      }
    }
    const existingCartons=db.prepare("SELECT id FROM order_cartons WHERE order_id=?").all(orderId) as Array<{id:number}>;
    for(const existing of existingCartons){
      if(keepCartonIds.includes(existing.id))continue;
      const hasTracking=db.prepare("SELECT 1 FROM order_trackings WHERE carton_id=? LIMIT 1").get(existing.id);
      if(hasTracking)throw new Error("Không thể xoá carton đã có Tracking/Label.");
      db.prepare("DELETE FROM order_cartons WHERE id=?").run(existing.id);
    }
    db.prepare("DELETE FROM order_lots WHERE order_id=? AND lot_number>? AND id NOT IN (SELECT order_lot_id FROM order_cartons WHERE order_id=? AND order_lot_id IS NOT NULL)").run(orderId,lotCount,orderId);
    db.prepare("DELETE FROM order_items WHERE order_id=? AND id NOT IN (SELECT ci.order_item_id FROM carton_items ci JOIN order_cartons c ON c.id=ci.carton_id WHERE c.order_id=?)").run(orderId,orderId);
    db.prepare("UPDATE orders SET carton_count=?,expected_lot_count=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(cartons.length,lotCount,orderId);
    return getOrderShipmentStructure(orderId,false);
  }).immediate();
}

export function validatePurchaseReadiness(orderId:number){
  const structure=getOrderShipmentStructure(orderId);
  const issues:Array<{code:string;carton_number?:number;message:string}>=[];
  const pricedOrder=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId) as Record<string,unknown>;
  const q=orderQuote(pricedOrder);
  if(q&&!q.eligible)issues.push(...q.reasons.map(message=>({code:"INELIGIBLE_SERVICE",message})));
  if(clientDraftAwaitingPurchase(pricedOrder))issues.push({code:"UNPURCHASED_CLIENT_DRAFT",message:"Client chưa đặt mua dịch vụ."});
  const cartons=structure.cartons;
  for(const carton of cartons){
    const number=Number(carton.carton_number);
    if(!carton.order_lot_id)issues.push({code:"MISSING_LOT",carton_number:number,message:"Carton "+number+" chưa được gán lô."});
    if(!positive(carton.weight))issues.push({code:"MISSING_WEIGHT",carton_number:number,message:"Carton "+number+" thiếu cân nặng."});
    if(!(positive(carton.volume)||(positive(carton.length)&&positive(carton.width)&&positive(carton.height))))issues.push({code:"MISSING_DIMENSIONS",carton_number:number,message:"Carton "+number+" thiếu kích thước/thể tích."});
    const count=structure.allocations.filter(row=>Number(row.carton_id)===Number(carton.id)).length;
    if(!count)issues.push({code:"MISSING_ITEMS",carton_number:number,message:"Carton "+number+" chưa khai báo sản phẩm."});
  }
  return {ready:issues.length===0,issues,structure};
}

export function syncLotCostsForOrder(orderId:number){
  ensureOrderShipmentStructure(orderId);
  db.prepare("UPDATE supplier_costs SET order_lot_id=(SELECT c.order_lot_id FROM order_trackings ot JOIN order_cartons c ON c.id=ot.carton_id WHERE ot.id=supplier_costs.matched_order_tracking_id AND ot.order_id=? LIMIT 1) WHERE matched_order_id=?").run(orderId,orderId);
  const lots=db.prepare("SELECT id FROM order_lots WHERE order_id=?").all(orderId) as Array<{id:number}>;
  for(const lot of lots){
    const total=db.prepare("SELECT COUNT(*) count,COALESCE(SUM(total_net_cost),0) net_cost FROM supplier_costs WHERE order_lot_id=?").get(lot.id) as {count:number;net_cost:number};
    const status=total.count===0?"PENDING":total.count===1?"MATCHED":"REVIEW";
    db.prepare("UPDATE order_lots SET net_cost=?,cost_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(total.count?total.net_cost:null,status,lot.id);
  }
  return db.prepare("SELECT * FROM order_lots WHERE order_id=? ORDER BY lot_number").all(orderId);
}
