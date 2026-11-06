import {NextRequest,NextResponse} from "next/server";
import {requireAnyRole} from "@/lib/auth";
import {db} from "@/lib/db";
import {workbookRows} from "@/lib/importers";
import {pageParams,paged} from "@/lib/pagination";
import {resolveSupplierAdjustment,submitSupplierAdjustments} from "@/lib/supplier-cost-review";

export const runtime="nodejs";

export async function GET(req:NextRequest){
  const auth=requireAnyRole(req,["ADMIN","FINANCE"]);if(auth.error)return auth.error;
  const {page,pageSize,offset}=pageParams(req);
  const history=req.nextUrl.searchParams.get("history")==="1";
  const source=history
    ? `SELECT id,tracking_id,delta_cents amount_cents,reason,actor_id created_by_user_id,created_at,
        NULL duplicate_of,NULL resolved_by_user_id,NULL resolved_at,'RECORDED' status
        FROM lot_cost_adjustments WHERE tracking_id IS NOT NULL
        UNION ALL SELECT id,tracking_id,amount_cents,reason,created_by_user_id,created_at,duplicate_of,
        resolved_by_user_id,resolved_at,CASE WHEN recorded_adjustment_id IS NULL THEN 'SKIPPED' ELSE 'CONFIRMED' END
        FROM supplier_cost_adjustment_pending WHERE resolved_at IS NOT NULL`
    : `SELECT *, 'PENDING' status FROM supplier_cost_adjustment_pending WHERE resolved_at IS NULL`;
  const total=(db.prepare("SELECT COUNT(*) n FROM ("+source+")").get() as {n:number}).n;
  const rows=db.prepare(`SELECT a.*,t.tracking,creator.display_name created_by,resolver.display_name resolved_by
    FROM (${source}) a JOIN order_trackings t ON t.id=a.tracking_id
    LEFT JOIN users creator ON creator.id=a.created_by_user_id
    LEFT JOIN users resolver ON resolver.id=a.resolved_by_user_id
    ORDER BY a.created_at DESC,a.id DESC,a.status LIMIT ? OFFSET ?`).all(pageSize,offset);
  return NextResponse.json(paged(rows,total,page,pageSize),{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(req:NextRequest){
  const auth=requireAnyRole(req,["ADMIN","FINANCE"]);if(auth.error)return auth.error;
  try{
    let items:unknown,key:unknown;
    if(req.headers.get("content-type")?.includes("multipart/form-data")){
      const form=await req.formData(),file=form.get("file");
      if(!(file instanceof File)||file.size>10*1024*1024)throw Error("Cần file Excel tối đa 10 MB.");
      const [header,...rows]=await workbookRows(Buffer.from(await file.arrayBuffer()));
      if(!header||header.map(cell=>String(cell??"").trim()).join("|")!=="Tracking|Cost bổ sung|Lý do"){
        throw Error("Header phải là Tracking | Cost bổ sung | Lý do.");
      }
      items=rows.filter(row=>row.some(cell=>cell!==null&&String(cell).trim()!==""))
        .map(([tracking,amount,reason])=>({tracking,amount,reason}));
      key=form.get("request_key");
    }else{
      const body=await req.json();
      items=body.items;
      key=body.request_key;
    }
    return NextResponse.json(submitSupplierAdjustments(auth.user,req.headers.get("Idempotency-Key")||key,items),{status:201});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể nhập phụ phí."},{status:400});
  }
}

export async function PATCH(req:NextRequest){
  const auth=requireAnyRole(req,["ADMIN","FINANCE"]);if(auth.error)return auth.error;
  try{
    return NextResponse.json(resolveSupplierAdjustment(auth.user,await req.json()));
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể xử lý phụ phí."},{status:400});
  }
}
