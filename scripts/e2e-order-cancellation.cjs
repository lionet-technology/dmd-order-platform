const base=process.env.E2E_BASE_URL||"http://127.0.0.1:3103";
let checks=0,seq=Date.now();function check(value,label){checks++;if(!value)throw new Error(label)}
async function call(path,{method="GET",cookie,body}={}){
 const headers={};if(cookie)headers.cookie=cookie;if(body!==undefined)headers["content-type"]="application/json";
 const res=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 let data;try{data=await res.json()}catch{}return {status:res.status,data,cookie:(res.headers.get("set-cookie")||"").split(";")[0]};
}
async function main(){
 const password="TestPass123!";
 const adminLogin=await call("/api/auth/login",{method:"POST",body:{username:"e2e.admin",password}}),salesLogin=await call("/api/auth/login",{method:"POST",body:{username:"e2e.sales",password}}),clientLogin=await call("/api/auth/login",{method:"POST",body:{username:"e2e.client",password}});
 check([adminLogin,salesLogin,clientLogin].every(x=>x.status===200),"fixture logins");
 const admin=adminLogin.cookie,client=clientLogin.cookie;
 const users=await call("/api/users",{cookie:admin});const clientId=users.data.find(x=>x.username==="e2e.client").id;
 async function create(price=100){const result=await call("/api/orders",{method:"POST",cookie:admin,body:{order_id:"HTTP-CANCEL-"+(++seq),client_user_id:clientId,service:"ePacket",sub_service:"T11",item:"Fixture shirts",material:"Cotton",carton_count:1,weight:1,manual_volume:5000,sales_price:price}});check(result.status===201,"create cancel fixture");return result.data}
 async function issue(order){const result=await call("/api/orders/"+order.id+"/trackings",{method:"POST",cookie:admin,body:{complete:true,trackings:[{tracking:"HTTP-CANCEL-TRACK-"+order.id,label_url:"https://labels.test/"+order.id+".pdf"}]}});check(result.status===200,"issue tracking and label");return result.data.trackings[0]}
 for(const actor of [adminLogin,salesLogin,clientLogin])for(const issued of [false,true]){
  const order=await create();if(issued)await issue(order);
  const quote=await call("/api/orders/"+order.id,{cookie:actor.cookie});check(quote.data.cancellation.allowed&&quote.data.cancellation.refund_percent===(issued?90:100)&&quote.data.cancellation.refund_amount===(issued?90:100),"server refund quote for "+actor.data?.user?.role);
  const response=await call("/api/orders/"+order.id+"/cancel",{method:"POST",cookie:actor.cookie,body:{reason:"HTTP cancellation test",refund_percent:100,refund_amount:999999,actor_user_id:999}});
  check(response.status===200&&response.data.refund_amount===(issued?90:100),"server ignores forged refund or actor");
  const detail=await call("/api/orders/"+order.id,{cookie:client});const event=detail.data.events.find(x=>x.event_type==="REFUND");
  check(detail.data.workflow_status==="CANCELLED"&&detail.data.total_due===(issued?10:0),"client sees retained fee");
  check(event&&!detail.data.events.some(x=>x.event_type==="ORDER_CANCELLED")&&detail.data.events.every(x=>x.actor_username===undefined&&x.actor_role===undefined&&x.actor_user_id===undefined),"client receives public refund notice while cancellation audit and account remain hidden");
  check(detail.data.supplier===undefined&&detail.data.internal_note===undefined&&event.before_json===undefined,"cancelled detail keeps private fields hidden");
  if(issued)check(detail.data.trackings.length===1&&detail.data.trackings[0].status==="CANCELLED","client retains cancelled tracking history");
  const again=await call("/api/orders/"+order.id+"/cancel",{method:"POST",cookie:actor.cookie,body:{}});check(again.status===200&&again.data.already_cancelled,"API retry idempotent");
  const edit=await call("/api/orders",{method:"POST",cookie:admin,body:{id:order.id,client_user_id:clientId,weight:2}});check(edit.status===400,"API cancelled order edit blocked");
  const mutate=await call("/api/orders/"+order.id+"/trackings",{method:"POST",cookie:admin,body:{complete:false,trackings:[]}});check(mutate.status===400,"API cancelled tracking status cannot reopen order");
 }
 const received=await create(),tracking=await issue(received);
 let status=await call("/api/shipment-status",{method:"POST",cookie:admin,body:{tracking_id:tracking.id,etd_at:"02/10/2026",shipment_status:"RECEIVED"}});check(status.status===200,"receive shipment");
 const blocked=await call("/api/orders/"+received.id+"/cancel",{method:"POST",cookie:admin,body:{}});check(blocked.status===409,"received order cannot cancel even admin");
 status=await call("/api/shipment-status",{method:"POST",cookie:admin,body:{tracking_id:tracking.id,etd_at:"02/10/2026",shipment_status:"WAITING_HANDOVER"}});check(status.status===200,"status reset fixture");
 const reset=await call("/api/orders/"+received.id+"/cancel",{method:"POST",cookie:client,body:{}});check(reset.status===409,"API status reset does not bypass handover boundary");
 const raced=await create();const replies=await Promise.all(Array.from({length:5},()=>call("/api/orders/"+raced.id+"/cancel",{method:"POST",cookie:client,body:{}})));check(replies.every(x=>x.status===200)&&replies.filter(x=>!x.data.already_cancelled).length===1,"concurrent cancellation only one effective operation");
 const ledger=await call("/api/ledger?pageSize=100",{cookie:client});const refund=ledger.data.items.filter(x=>x.reference_type==="ORDER_CANCELLATION"&&x.reference_id===String(raced.id));check(refund.length===1&&refund[0].amount===100,"concurrent requests create one refund");
 const otherUser=await call("/api/users",{method:"POST",cookie:admin,body:{username:"cancel.foreign."+seq,display_name:"Foreign Client",role:"CLIENT",sales_user_id:users.data.find(x=>x.username==="e2e.sales").id,password}});check(otherUser.status===201,"foreign client created");
 const foreign=await call("/api/auth/login",{method:"POST",body:{username:otherUser.data.username,password}});
 const target=await create();const unauthorized=await call("/api/orders/"+target.id+"/cancel",{method:"POST",cookie:foreign.cookie,body:{}});check(unauthorized.status===403,"foreign client cancellation denied");
 const noSession=await call("/api/orders/"+target.id+"/cancel",{method:"POST",body:{}});check(noSession.status===401,"anonymous cancellation denied");
 const invalid=await call("/api/orders/abc/cancel",{method:"POST",cookie:client,body:{}});check(invalid.status===400,"invalid cancellation ID rejected");
 const missing=await call("/api/orders/999999999/cancel",{method:"POST",cookie:client,body:{}});check(missing.status===404,"missing order");
 const filtered=await call("/api/orders?status=CANCELLED&pageSize=100",{cookie:client});check(filtered.data.items.length>=7&&filtered.data.items.every(x=>x.workflow_status==="CANCELLED"),"cancelled orders filter");
 const queue=await call("/api/orders/tracking-queue",{cookie:admin});check(!queue.data.rows.some(x=>x.order_pk===raced.id),"cancelled order excluded from purchase queue");
 const manual=await call("/api/ledger",{method:"POST",cookie:admin,body:{client_user_id:clientId,entry_type:"REFUND",reference_type:"ORDER_CANCELLATION",reference_id:String(target.id),amount:100}});check(manual.status===400,"automatic refund reference cannot be forged through ledger API");
 console.log("E2E ORDER CANCELLATION PASS ("+checks+" assertions)");
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1});
