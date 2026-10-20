/** Client file normalization: consecutive ID rows are one Order, each row one Carton. */
export type ClientCartonRow=Record<string,unknown>;
export type ClientCartonGroup=ClientCartonRow&{carton_rows:ClientCartonRow[];row_number:number;group_errors:string[]};
const value=(v:unknown)=>String(v??'').trim();
const orderFields=['recipient_name','address1','address2','city','state','zip','country','phone','recipient_email'] as const;
export function groupClientCartonRows(rows:ClientCartonRow[]):ClientCartonGroup[]{
 const groups:ClientCartonGroup[]=[];const closed=new Set<string>();
 for(let i=0;i<rows.length;i++){
  const row=rows[i],id=value(row.order_id),number=Number(row.row_number||i+1);
  const current=groups.at(-1);
  if(current&&id&&id===value(current.order_id)){
   const lineErrors:string[]=[];
   if(value(row.carton_count))lineErrors.push('Dòng '+number+': Carton Quantity chỉ nhập ở dòng đầu tiên của Order.');
   for(const field of orderFields)if(value(row[field])&&value(current[field])&&value(row[field])!==value(current[field]))
    lineErrors.push('Dòng '+number+': '+field+' mâu thuẫn với dòng đầu của Order.');
   current.group_errors.push(...lineErrors);current.carton_rows.push(row);continue;
  }
  if(current&&value(current.order_id))closed.add(value(current.order_id));
  const errors:string[]=[];
  if(!id)errors.push('Dòng '+number+': thiếu Client Order ID.');
  if(id&&closed.has(id))errors.push('Dòng '+number+': Client Order ID đã xuất hiện ở nhóm trước, không được gộp cách quãng.');
  const qty=value(row.carton_count);
  if(!qty||!Number.isSafeInteger(Number(qty))||Number(qty)<1)errors.push('Dòng '+number+': Carton Quantity bắt buộc là số nguyên dương ở dòng đầu.');
  groups.push({...row,row_number:number,carton_rows:[row],group_errors:errors});
 }
 for(const group of groups){
  if(Number(group.carton_count)!==group.carton_rows.length)group.group_errors.push('Order '+value(group.order_id)+': khai '+value(group.carton_count)+' Carton nhưng có '+group.carton_rows.length+' dòng.');
  group.carton_rows.forEach((r,index)=>{
   const number=Number(r.row_number||group.row_number+index);
   for(const field of ['weight','item','material'])if(!value(r[field]))group.group_errors.push('Dòng '+number+': thiếu '+field+'.');
   if(!(Number(r.weight)>0))group.group_errors.push('Dòng '+number+': cân nặng phải lớn hơn 0.');
   if(!((Number(r.length)>0&&Number(r.width)>0&&Number(r.height)>0)||Number(r.manual_volume)>0))group.group_errors.push('Dòng '+number+': thiếu kích thước hoặc thể tích.');
  });
 }
 return groups;
}
