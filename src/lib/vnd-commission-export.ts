import ExcelJS from 'exceljs';
import {db} from './db';
import {vndBusinessReport} from './vnd-reporting';
import {subtractVnd} from './vnd-money';

type DecisionContext = {
 allocation_version?: number;
 allocation?: {order_id: number; total_vnd: string}[];
 orders?: {order_id: number; sales_user_id: number | null}[];
};

function readExport(month: string) {
 const report = vndBusinessReport(month);
 const decisions = db.prepare(`
  SELECT e.id, e.claim_id, e.revision, e.category, e.delta, e.context_json,
   previous.id previous_id, previous.approved previous_approved, previous.context_json previous_context
  FROM vnd_refund_events e
  LEFT JOIN vnd_refund_events previous ON previous.id = (
   SELECT p.id FROM vnd_refund_events p
   WHERE p.claim_id=e.claim_id AND p.kind='DECISION' AND p.id<e.id ORDER BY p.id DESC LIMIT 1
  )
  WHERE e.kind='DECISION' AND substr(datetime(e.created_at,'+7 hours'),1,7)=?
  ORDER BY e.id
 `).all(month) as {
  id:number;claim_id:number;revision:number;category:string;delta:string;context_json:string|null;
  previous_id:number|null;previous_approved:string|null;previous_context:string|null;
 }[];
 const orderMonth = db.prepare("SELECT substr(datetime(service_purchased_at,'+7 hours'),1,7) month FROM orders WHERE id=?");
 const adjustments: (string | number | null)[][] = [];
 const reconciliation: (string | number | null)[][] = [];

 for (const decision of decisions) {
  const current = JSON.parse(decision.context_json ?? '{}') as DecisionContext;
  const previous = JSON.parse(decision.previous_context ?? '{}') as DecisionContext;
  const allocated = current.allocation_version === 1 && current.allocation;
  const priorAllocation = previous.allocation_version === 1 && previous.allocation;
  reconciliation.push([decision.id,decision.claim_id,decision.revision,decision.category,decision.delta,
   !allocated?'LEGACY_UNALLOCATED':decision.previous_id&&!priorAllocation?'OPENING_ALLOCATION':'ALLOCATED_DELTA',
   decision.previous_id&&!priorAllocation?decision.previous_approved:null]);
  if (!allocated) continue;
  for (const allocation of allocated) {
   const purchase = (orderMonth.get(allocation.order_id) as {month:string|null}|undefined)?.month ?? null;
   const sales = current.orders?.find(order => order.order_id === allocation.order_id)?.sales_user_id ?? null;
   const prior = priorAllocation ? priorAllocation.find(row => row.order_id === allocation.order_id)?.total_vnd ?? '0' : '0';
   adjustments.push([
    month,purchase,purchase===null?'UNKNOWN':purchase===month?'CURRENT':'PRIOR',
    sales,allocation.order_id,decision.claim_id,decision.id,decision.category,
    allocation.total_vnd,decision.previous_id&&!priorAllocation?null:subtractVnd(allocation.total_vnd,prior),
   ]);
  }
 }
 return {report,adjustments,reconciliation};
}

export async function vndCommissionExcel(month: string) {
 const {report,adjustments,reconciliation} = db.transaction(() => readExport(month)).deferred();
 const workbook = new ExcelJS.Workbook();
 const live = workbook.addWorksheet('Live theo kỳ mua');
 live.addRow(['Kỳ mua','Sales ID','Order ID','Nhóm','Cước gốc','Base','Refund huỷ','Refund Claim đã phân bổ','Doanh thu ròng live','GP-Base live','Hoa hồng live']);
 for (const order of report.commission.orders) {
  const value = order.live_after_refund;
  live.addRow([month,order.sales_user_id,order.order_id,order.group,order.revenue,order.base_vnd,
   order.cancellation_refund,value.allocated_refund_vnd,value.net_revenue_vnd,value.gp_base_vnd,value.commission_vnd]);
 }
 const posting = workbook.addWorksheet('Refund theo kỳ duyệt');
 posting.addRow(['Kỳ duyệt','Kỳ mua','Phạm vi','Sales ID','Order ID','Claim ID','Decision ID','Loại Claim','Phân bổ sau duyệt','Delta phân bổ']);
 posting.addRows(adjustments);
 const approvals = workbook.addWorksheet('Đối chiếu quyết định');
 approvals.addRow(['Decision ID','Claim ID','Revision','Loại Claim','Delta nghĩa vụ','Trạng thái phân bổ','Duyệt cũ chưa phân bổ']);
 approvals.addRows(reconciliation);
 for (const sheet of workbook.worksheets) {
  sheet.views = [{state:'frozen',ySplit:1}];
  sheet.getRow(1).font = {bold:true};
  for (const column of sheet.columns) column.width = 24;
 }
 return new Uint8Array(await workbook.xlsx.writeBuffer() as ArrayBuffer);
}
