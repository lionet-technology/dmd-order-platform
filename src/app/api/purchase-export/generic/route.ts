import { NextRequest,NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";
import { genericPurchaseRows } from "@/lib/purchase-templates";

export const runtime="nodejs";

const columns=[
  ["dmd_id","DMD ID"],["client_order_id","Client Order ID"],["client","Client"],["recipient_name","Recipient Name"],
  ["address_1","Address 1"],["address_2","Address 2"],["city","City"],["state","State"],["postal_code","ZIP / Postal Code"],
  ["country","Country"],["phone","Phone"],["recipient_email","Recipient Email"],["lot_number","Lot"],["carton_count","Carton Count"],["carton_slot","Carton Slot"],
  ["sku","SKU"],["item","Item"],["quantity","Quantity"],["material","Material"],
  ["unit_manufacturing_value","Unit Manufacturing Value"],["line_manufacturing_value","Line Manufacturing Value"],
  ["order_total_manufacturing_value","Order Total Manufacturing Value"],["lot_total_manufacturing_value","Lot Total Manufacturing Value"],
  ["weight","Weight"],["length","Length"],["width","Width"],["height","Height"],["volume","Volume"],["chargeable_weight","Chargeable Weight"],
  ["service","Service"],["sub_service","Sub-Service"],["supplier","Supplier"],["expected_lot_count","Expected Lot Count"],
  ["tracking","Tracking"],["label_url","URL Label"],
] as const;

export async function POST(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  try{
    const body=await req.json();
    const orderIds=(Array.isArray(body.order_ids)?body.order_ids:[]).map(Number).filter(Boolean);
    if(!orderIds.length)throw new Error("Chọn ít nhất một Order.");
    const rows=genericPurchaseRows(orderIds);
    const workbook=new ExcelJS.Workbook();
    const sheet=workbook.addWorksheet("Generic Purchase");
    sheet.columns=columns.map(([key,header])=>({key,header,width:Math.max(12,header.length+3)}));
    sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
    sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF3155D9"}};
    for(const row of rows)sheet.addRow(row);
    sheet.views=[{state:"frozen",ySplit:1}];
    sheet.autoFilter={from:"A1",to:sheet.getRow(1).getCell(columns.length).address};
    const buffer=await workbook.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer),{headers:{
      "content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition":'attachment; filename="DMD_Generic_Purchase_'+new Date().toISOString().slice(0,10)+'.xlsx"',
    }});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể xuất Generic."},{status:400});
  }
}
