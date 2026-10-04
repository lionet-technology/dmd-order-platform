import { readSheet } from "read-excel-file/node";
export const CLIENT_FIELDS=["order_id","weight","length","width","height","manual_volume","carton_count","recipient_name","address1","address2","city","state","zip","country","phone","recipient_email","item","material","declared_value"] as const;
const aliases:Record<string,string>={"client order id":"order_id","order id":"order_id","khối lượng":"weight","tổng khối lượng (kg)":"weight","dài":"length","rộng":"width","cao":"height","số carton":"carton_count","người nhận":"recipient_name","địa chỉ 1":"address1","địa chỉ 2":"address2","thành phố":"city","bang":"state","zip code":"zip","nước":"country","điện thoại":"phone","mặt hàng":"item","chất liệu":"material"};
function csv(source:string){
 const rows:string[][]=[];let row:string[]=[],field="",quoted=false;
 for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){field+='"';i++}else quoted=!quoted}
 else if(c===","&&!quoted){row.push(field);field=""}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&source[i+1]==="\n")i++;row.push(field);rows.push(row);row=[];field=""}else field+=c}
 if(quoted)throw Error("CSV có dấu ngoặc kép chưa đóng.");
 if(field||row.length){row.push(field);rows.push(row)}return rows;
}
export async function parseClientFile(buffer:Buffer,name:string){
 const rows:unknown[][]=name.toLowerCase().endsWith(".csv")?csv(buffer.toString("utf8").replace(/^\uFEFF/,"")):await readSheet(buffer,1) as unknown[][];
 if(rows.length>1001)throw Error("Tối đa 1000 Order mỗi lần.");
 if(!rows.length)throw Error("File trống.");
 const headers=rows[0].map(v=>{const k=String(v||"").trim().toLowerCase();return aliases[k]||k});
 if(!headers.includes("order_id"))throw Error("Thiếu cột order_id / Client Order ID.");
 return rows.slice(1).filter(r=>r.some(v=>String(v??"").trim())).map((r,index)=>({row_number:index+2,...Object.fromEntries(headers.map((k,i)=>[k,r[i]??""]).filter(([k])=>(CLIENT_FIELDS as readonly string[]).includes(String(k))))}));
}
