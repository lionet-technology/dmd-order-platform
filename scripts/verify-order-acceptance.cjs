const fs = require("node:fs");
const path = require("node:path");
const base = process.env.E2E_BASE_URL || "http://localhost:3103";
const stamp = Date.now().toString(36);
const prefix = "qa." + stamp;
const results = [];
function check(name, condition, detail) { results.push({name, passed:Boolean(condition), ...(condition ? {} : {detail})}); }
async function call(endpoint, body, cookie, method) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {headers["content-type"]="application/json"; payload=JSON.stringify(body);}
  const response = await fetch(base+endpoint,{method:method || (body===undefined?"GET":"POST"),headers,body:payload});
  const data = await response.json().catch(()=>null);
  return {status:response.status,data,cookie:(response.headers.get("set-cookie")||"").split(";")[0]};
}
async function main() {
  const login=await call("/api/auth/login",{username:"e2e.admin",password:"TestPass123!"});
  if(login.status!==200)throw new Error("Run e2e-order-api first against an isolated test DB.");
  const admin=login.cookie;
  const createUser=async(role,suffix,salesId)=>{
    const r=await call("/api/users",{username:prefix+"."+suffix,display_name:prefix+" "+suffix,role,password:"TestPass123!",sales_user_id:salesId},admin);
    if(r.status!==201)throw new Error("Fixture account failed "+JSON.stringify(r.data));
    return r.data;
  };
  const sa=await createUser("SALES","salesa"), sb=await createUser("SALES","salesb");
  const ca=await createUser("CLIENT","clienta",sa.id), cb=await createUser("CLIENT","clientb",sb.id);
  await call("/api/client-services",{client_user_id:ca.id,service:"ePacket",sub_service:"",is_enabled:true,discount_percent:0},admin);
  await call("/api/client-services",{client_user_id:cb.id,service:"ePacket",sub_service:"",is_enabled:true,discount_percent:0},admin);
  const sc=(await call("/api/auth/login",{username:sa.username,password:"TestPass123!"})).cookie;
  const cc=(await call("/api/auth/login",{username:ca.username,password:"TestPass123!"})).cookie;
  const bc=(await call("/api/auth/login",{username:cb.username,password:"TestPass123!"})).cookie;
  const createOrder=async(client,suffix,cartons=1)=>{
    const r=await call("/api/orders",{client_user_id:client.id,order_id:prefix+"-"+suffix,service:"ePacket",item:"Test shirt",material:"Cotton",carton_count:cartons,weight:2,manual_volume:10000,sales_price:50},admin);
    if(r.status!==201)throw new Error("Fixture order failed "+JSON.stringify(r.data));
    return r.data;
  };
  const a=await createOrder(ca,"A",3), b=await createOrder(cb,"B"), c=await createOrder(ca,"C",3);
  for(const endpoint of ["/api/orders","/api/ledger","/api/users","/api/orders/tracking-queue","/api/shipment-status"]){
    check("unauthenticated "+endpoint+" denied",(await call(endpoint)).status===401);
  }
  check("Client cannot create order",(await call("/api/orders",{client_user_id:ca.id},cc)).status===403);
  check("Client cannot write balance",(await call("/api/ledger",{amount:1,entry_type:"PAYMENT"},cc)).status===403);
  check("Sales cannot read another client's order",(await call("/api/orders/"+b.id,undefined,sc)).status===403);
  check("Client cannot read another client's order",(await call("/api/orders/"+b.id,undefined,cc)).status===403);
  check("Other Client cannot read first client's order",(await call("/api/orders/"+a.id,undefined,bc)).status===403);
  check("Sales cannot assign order to another client",(await call("/api/orders",{client_user_id:cb.id},sc)).status===403);
  check("Sales cannot write admin tracking",(await call("/api/orders/"+a.id+"/trackings",{trackings:[]},sc)).status===403);
  check("Client cannot write shipment status",(await call("/api/shipment-status",{tracking:"none"},cc)).status===403);
  const detail=async(id,cookie=admin)=>(await call("/api/orders/"+id,undefined,cookie)).data;
  const save=async(id,body)=>call("/api/orders/"+id+"/trackings",body,admin);
  let r=await save(a.id,{supplier:"KILOSHIP",internal_note:"ADMIN-ONLY",trackings:[{tracking:prefix+"-A1",label_url:"https://labels.test/a.pdf",lot_number:1}],complete:false});
  const a1=r.data.trackings.find(x=>x.tracking===prefix+"-A1");
  await save(b.id,{supplier:"KILOSHIP",trackings:[{tracking:prefix+"-B1",label_url:"https://labels.test/b.pdf"}],complete:true});
  r=await save(c.id,{supplier:"KILOSHIP",trackings:[{tracking:prefix+"-C1",label_url:"https://labels.test/c1.pdf"},{tracking:prefix+"-C2"},{tracking:prefix+"-C3",label_url:"https://labels.test/c3.pdf"}],complete:true});
  check("Incomplete labels cannot complete a 3-carton purchase",r.status!==200||r.data.order.workflow_status!=="PURCHASED",r.data?.order?.workflow_status);
  r=await save(a.id,{supplier:"KILOSHIP",trackings:[],complete:true,internal_note:"ADMIN-ONLY"});
  check("One tracking cannot complete a 3-carton purchase",r.status!==200||r.data.order.workflow_status!=="PURCHASED",r.data?.order?.workflow_status);
  const before=await detail(a.id);
  r=await save(a.id,{supplier:"BELL",internal_note:"SHOULD-ROLLBACK",trackings:[{id:a1.id,tracking:a1.tracking,label_url:"https://labels.test/changed.pdf"},{tracking:prefix+"-B1"}],complete:true});
  const after=await detail(a.id);
  check("Conflicting tracking save rejects request",r.status===400,r);
  check("Failed tracking save preserves supplier",after.supplier===before.supplier,{before:before.supplier,after:after.supplier});
  check("Failed tracking save preserves internal note",after.internal_note===before.internal_note);
  check("Failed tracking save preserves first label",after.trackings.find(x=>x.id===a1.id).label_url===before.trackings.find(x=>x.id===a1.id).label_url);
  const oldBulk=await detail(b.id);
  r=await call("/api/orders/tracking-replacements",{rows:[
    {old_tracking:prefix+"-B1",new_tracking:prefix+"-B2",new_label_url:"https://labels.test/b2.pdf",reason:"Điều chỉnh tuyến vận chuyển"},
    {old_tracking:prefix+"-A1",new_tracking:prefix+"-A1",new_label_url:"https://labels.test/x.pdf",reason:"Điều chỉnh tuyến vận chuyển"}
  ]},admin);
  const newBulk=await detail(b.id);
  check("Conflicting bulk replacement rejects request",r.status===400,r);
  check("Failed bulk replacement leaves first tracking active",newBulk.trackings.some(x=>x.tracking===prefix+"-B1"&&x.status==="ACTIVE"));
  check("Failed bulk replacement does not create replacement",!newBulk.trackings.some(x=>x.tracking===prefix+"-B2"));
  check("Failed bulk replacement does not append public note",newBulk.public_note===oldBulk.public_note);
  check("Failed bulk replacement does not write audit event",newBulk.events.length===oldBulk.events.length);
  await call("/api/orders",{id:a.id,client_user_id:ca.id,internal_note:"SALES-INJECTION"},sc);
  check("Sales can maintain Private Note",(await detail(a.id)).internal_note==="SALES-INJECTION");
  check("Client cannot receive Private Note",(await detail(a.id,cc)).internal_note===undefined);
  const nested=(await detail(a.id,cc)).trackings;
  check("Client tracking payload excludes cost allocation internals",nested.every(x=>x.cost_match_type===undefined&&x.cost_parent_tracking_id===undefined));
  const latestA=await detail(a.id);
  const activeA=latestA.trackings.find(x=>x.status==="ACTIVE");
  await call("/api/shipment-status",{tracking_id:activeA.id,etd_at:"29/09/2026",shipment_status:"IN_TRANSIT"},admin);
  const statusBefore=await detail(a.id);
  r=await call("/api/shipment-status",{updates:[
    {tracking_id:activeA.id,shipment_status:"ALERT"},
    {tracking:"DOES-NOT-EXIST",etd_at:"29/09/2026",shipment_status:"IN_TRANSIT"}
  ]},admin);
  check("Invalid bulk status is atomic",r.status===400&&(await detail(a.id)).trackings.find(x=>x.id===activeA.id).shipment_status===statusBefore.trackings.find(x=>x.id===activeA.id).shipment_status);
  r=await call("/api/shipment-status",{tracking_id:activeA.id,etd_at:"31/02/2026",shipment_status:"IN_TRANSIT"},admin);
  check("Invalid calendar date rejected",r.status===400);
  r=await call("/api/shipment-status",{tracking_id:activeA.id,etd_at:"29/09/2026",delivered_at:"28/09/2026",shipment_status:"DELIVERED"},admin);
  check("Delivered date before ETD rejected",r.status===400);
  await call("/api/shipment-status",{tracking_id:activeA.id,etd_at:"29/09/2026",delivered_at:"01/10/2026",shipment_status:"DELIVERED"},admin);
  const delivered=(await call("/api/shipment-status?view=delivered",undefined,admin)).data.items;
  check("Delivered view contains delivered tracking",delivered.some(x=>x.tracking_id===activeA.id));
  const active=(await call("/api/shipment-status?view=active",undefined,admin)).data.items;
  check("Delivered and exception tracks excluded from active view",active.every(x=>x.etd_at&&!["DELIVERED","ALERT","EXCEPTION"].includes(x.shipment_status)));
  check("Active view sorted by ETD",active.every((x,i)=>!i||active[i-1].etd_at<=x.etd_at));
  const queueResponse=await fetch(base+"/api/orders/tracking-queue?format=xlsx",{headers:{cookie:admin}});
  check("Bulk queue Excel download works",queueResponse.ok&&queueResponse.headers.get("content-type").includes("spreadsheet"));
  const bytes=await queueResponse.arrayBuffer();
  const fd=new FormData();fd.set("file",new Blob([bytes]),"queue.xlsx");
  r=await call("/api/orders/tracking-queue",fd,admin,"PUT");
  check("Bulk queue exported Excel can be uploaded",r.status===200&&Array.isArray(r.data.rows)&&r.data.rows.some(x=>x.order_pk===a.id));
  const q=(await call("/api/orders/tracking-queue",undefined,admin)).data.rows;
  check("Queue keeps rows for incomplete carton coverage",q.filter(x=>x.order_pk===a.id).length===3);
  const d=await createOrder(ca,"D",2);
  const rows=[1,2].map(n=>({order_pk:d.id,carton_slot:n,tracking:prefix+"-D"+n,label_url:"https://labels.test/d"+n+".pdf",supplier:"KILOSHIP",expected_lot_count:1}));
  r=await call("/api/orders/tracking-queue",{rows},admin);
  check("Bulk assigns two carton tracking/labels",r.status===200&&(await detail(d.id)).workflow_status==="PURCHASED");
  check("Completed orders are removed from Tracking/Label queue",!(await call("/api/orders/tracking-queue",undefined,admin)).data.rows.some(x=>x.order_pk===d.id));
  const count=(await detail(d.id)).trackings.length;
  await call("/api/orders/tracking-queue",{rows},admin);
  check("Bulk replay does not duplicate tracking records",(await detail(d.id)).trackings.length===count);
  const updated=await detail(d.id);
  check("Bulk audit records actor and operation",updated.events.some(e=>e.source==="BULK"&&e.event_type==="TRACKINGS_UPDATED"&&e.actor_username==="e2e.admin"));
  const btrack=(await detail(b.id)).trackings.find(x=>x.status==="ACTIVE");
  const beforeReason=(await detail(b.id)).events.length;
  r=await call("/api/orders/tracking-replacements",{rows:[{old_tracking:btrack.tracking,new_tracking:prefix+"-BFINAL",reason:"",new_label_url:"https://labels.test/f.pdf"}]},admin);
  check("Replacement reason is optional",r.status===200&&(await detail(b.id)).events.length>beforeReason);
  const privateDetail=await detail(a.id,cc);
  check("Client history never exposes before/after snapshots",privateDetail.events.every(e=>e.before_json===undefined&&e.after_json===undefined));
  const report={base,created_at:new Date().toISOString(),passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results};
  const dir=path.resolve(".smoke/verification-20261001-2301");fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,"acceptance-"+stamp+".json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,failures:results.filter(r=>!r.passed)},null,2));
  if(report.failed)process.exitCode=1;
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
