import { NextRequest,NextResponse } from "next/server";
import JSZip from "jszip";
import { requireUser } from "@/lib/auth";
import { generateScannedManifestFiles } from "@/lib/purchase-templates";

export const runtime="nodejs";

export async function POST(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  try{
    const body=await req.json();
    const trackings=(Array.isArray(body.trackings)?body.trackings:[]).map(String);
    const result=await generateScannedManifestFiles(trackings);
    if(!result.files.length)return NextResponse.json({error:"Không có Order đủ điều kiện để xuất Manifest.",...result},{status:422});
    const skipped=Buffer.from(JSON.stringify(result.missing),"utf8").toString("base64");
    if(result.files.length===1){
      const file=result.files[0];
      return new NextResponse(new Uint8Array(file.buffer),{headers:{
        "content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition":'attachment; filename="'+file.name+'"',
        "x-dmd-valid-orders":String(result.valid_order_count),
        "x-dmd-skipped-orders":String(result.missing.length),
        "x-dmd-skipped-detail":skipped,
      }});
    }
    const zip=new JSZip();
    const used=new Set<string>();
    for(const file of result.files){
      let name=file.service+"/"+file.name;let suffix=2;
      while(used.has(name)){name=file.service+"/"+file.name.replace(/\.xlsx$/i,"-"+suffix+".xlsx");suffix++}
      used.add(name);zip.file(name,file.buffer);
    }
    const buffer=await zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"});
    return new NextResponse(new Uint8Array(buffer),{headers:{
      "content-type":"application/zip",
      "content-disposition":'attachment; filename="Manifest_'+new Date().toISOString().slice(0,10)+'.zip"',
      "x-dmd-valid-orders":String(result.valid_order_count),
      "x-dmd-skipped-orders":String(result.missing.length),
      "x-dmd-skipped-detail":skipped,
    }});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể xuất Manifest."},{status:400});
  }
}
