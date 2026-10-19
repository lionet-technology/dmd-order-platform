import {withFinancialPrivacy} from "@/lib/financial-privacy";
import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {accountFinancials,assertClientAccess,financialAction} from "@/lib/credit";
import {db} from "@/lib/db";
import {recentFinancialActivity} from "@/lib/financial-activity";
function projectFinancials(f:ReturnType<typeof accountFinancials>,_role:string){// All callers of this operational endpoint receive the non-cost projection.
const transactions=(f.transactions as Record<string,unknown>[]).filter(t=>t.entry_type!=='SERVICE_COST');const safeIds=new Set(transactions.map(t=>t.id));return {...f,purchasing_balance_cents:f.net_balance_cents,transactions,items:(f.items as Record<string,unknown>[]).filter(i=>safeIds.has(i.ledger_id))};}
export const runtime="nodejs";
async function handleGET(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;try{if(req.nextUrl.searchParams.get("view")==="overview"){
 if(!["ADMIN","SALES"].includes(a.user.role))return NextResponse.json({error:"Không có quyền xem tổng quan Client."},{status:403});
 const clients=db.prepare("SELECT id,username,display_name FROM users WHERE role='CLIENT' AND (?='ADMIN' OR sales_user_id=?) ORDER BY display_name,id").all(a.user.role,a.user.id) as {id:number;username:string;display_name:string}[];
 const items=clients.map(c=>{assertClientAccess(a.user,c.id);const f=accountFinancials(c.id) as ReturnType<typeof accountFinancials>&{credit_limit_cents:number};return {...c,purchasing_balance_cents:f.net_balance_cents,credit_limit_cents:f.credit_limit_cents,receivable_cents:f.receivable_cents,reserved_cents:f.reserved_cents,available_to_buy_cents:f.available_to_buy_cents,purchase_blocked:f.purchase_blocked,reasons:f.reasons,overdue_cents:[...f.debts,...f.statements].filter(r=>r.status==="OVERDUE").reduce((n,r)=>n+Number(r.outstanding_cents),0),reconciliation_warnings:f.legacy_allocations.length};});
 return NextResponse.json({items,as_of:new Date().toISOString()});
 }const id=a.user.role==="CLIENT"?a.user.id:Number(req.nextUrl.searchParams.get("client_id"));assertClientAccess(a.user,id);return NextResponse.json({...projectFinancials(accountFinancials(id),a.user.role),activity:recentFinancialActivity(id,a.user.role!=="CLIENT")});}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}
async function handlePOST(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;try{const b=await req.json();b.request_key=b.request_key||req.headers.get("Idempotency-Key")||undefined;if(["allocate","apply_credit"].includes(String(b.action))&&!b.request_key)throw Error("Phân bổ cần request key để tránh thực thi lặp.");const response=db.transaction(()=>{assertClientAccess(a.user,Number(b.client_id));const before=accountFinancials(Number(b.client_id));const data=financialAction(a.user,Number(b.client_id),b);return {...projectFinancials(data,a.user.role),before_summary:{purchasing_balance_cents:before.purchasing_balance_cents,receivable_cents:before.receivable_cents,reserved_cents:before.reserved_cents,available_to_buy_cents:before.available_to_buy_cents},activity:recentFinancialActivity(Number(b.client_id),true)};}).immediate();return NextResponse.json(response);}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}

export const GET=withFinancialPrivacy(handleGET);
export const POST=withFinancialPrivacy(handlePOST);
