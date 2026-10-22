const base=process.env.E2E_BASE_URL;
if(!base||!/^http:\/\/(127\.0\.0\.1|localhost):3158$/.test(base))throw Error('Dedicated synthetic localhost:3158 required');
let checks=0;function check(v,m){checks++;if(!v)throw Error(m)}
async function call(url,cookie,body){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
(async()=>{
 const cookies={};for(const role of ['admin','sales','client','finance','bod','warehouse']){const r=await call('/api/auth/login',null,{username:'uat.'+role,password:'UatRefund123!'});check(r.status===200,'Synthetic login '+role);cookies[role]=r.cookie;}
 const id=(await call('/api/statements-v2?clients=1',cookies.admin)).data.items.find(c=>c.display_name==='UAT client').id;
 check((await call('/api/ledger',cookies.sales,{client_user_id:id,entry_type:'PAYMENT',amount:1000,request_key:'owner-funding'})).status===201,'Synthetic funding');
 const route=(await call('/api/client-orders',cookies.client)).data.routes.find(r=>r.service==='UPS');
 check(!!route,'Synthetic UPS route');
 const stamp=Date.now(),common={weight:.1,length:20,width:15,height:10,item:'Shirt',material:'Cotton',recipient_name:'Synthetic Recipient',address1:'100 Synthetic Street',city:'New York',state:'NY',zip:'10001',country:'US',phone:'123456'};
 const rows=[2,1,1].map((n,i)=>{const order_id='OWNER-HTTP-'+stamp+'-'+i;return {...common,order_id,carton_count:n,carton_rows:Array.from({length:n},(_,j)=>({...common,order_id,carton_count:j===0?n:''}))};});
 let r=await call('/api/client-orders',cookies.client,{action:'save',route_id:route.id,rows});check(r.status===201,'Mixed single/multi Orders created '+JSON.stringify(r.data));const ids=r.data.orders.map(o=>o.id);
 r=await call('/api/client-orders',cookies.client,{action:'purchase',order_ids:ids});check(r.status===200&&r.data.succeeded===3,'Unpriced submission');
 const [multi,single,costly]=ids,payload={action:'save',supplier:'KILOSHIP',trackings:[{tracking:'SYNTHETIC-PRIMARY-'+stamp,label_url:'https://labels.test/synthetic-multipage.pdf'}]};
 const unpriced=await Promise.all(Array.from({length:8},()=>call('/api/orders/'+multi+'/trackings',cookies.admin,payload)));
 check(unpriced.every(r=>r.status===200),'Concurrent identical unpriced Tracking writes');
 r=await call('/api/orders/'+multi+'/trackings',cookies.admin);check(r.data.trackings.length===1,'Exactly one Tracking after race');
 check((await call('/api/orders/'+multi+'/trackings',cookies.admin,{...payload,complete:true})).status===400,'Partial labels INCOMPLETE without override');
 check((await call('/api/orders/'+multi+'/trackings',cookies.admin,{...payload,complete:true,partial_label_override:true,override_reason:'Synthetic primary tracking / multipage PDF verified'})).status===200,'Explicit Admin override');
 const day=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
 r=await call('/api/statements-v2',cookies.finance,{client_id:id,start:day,end:day});check(r.status===400&&/Chưa chốt giá/.test(r.data.error),'Statement rejects unpriced submitted Orders');
 const priceRace=await Promise.all(Array.from({length:8},()=>call('/api/orders/'+multi+'/trackings',cookies.admin,{...payload,complete:true,manual_total_price:25})));
 check(priceRace.every(r=>r.status===200),'Concurrent same late price + override replay');
 const singlePayload={action:'save',supplier:'KILOSHIP',complete:true,manual_total_price:10,trackings:[{tracking:'SYNTHETIC-SINGLE-'+stamp,label_url:'https://labels.test/synthetic-single.pdf'}]};
 check((await call('/api/orders/'+single+'/trackings',cookies.admin,singlePayload)).status===200,'Mixed single priced Tracking/Label');
 for(const role of ['client','sales','finance','bod','warehouse'])check((await call('/api/orders/'+costly+'/trackings',cookies[role],{...singlePayload,manual_total_price:999999})).status===403,'Manual-price write RBAC '+role);
 check((await call('/api/orders/'+costly+'/trackings',cookies.admin,{...singlePayload,manual_total_price:999999,trackings:[{tracking:'SYNTHETIC-COSTLY-'+stamp,label_url:'https://labels.test/synthetic-costly.pdf'}]})).status===200,'Current Order can exceed purchasing power');
 const f=(await call('/api/financials?client_id='+id,cookies.admin)).data;check(f.purchase_blocked,'Future buying blocked');
 for(const orderId of ids){const entries=f.transactions.filter(t=>t.entry_type==='ORDER_CHARGE'&&String(t.reference_id)===String(orderId));check(entries.length===1,'Exactly one charge per Order '+orderId);}
 const final=await call('/api/statements-v2',cookies.finance,{client_id:id,start:day,end:day});check(final.status===200,'All manual prices settled permits Statement finalize');
 check(final.data.closing.balance_cents===f.net_balance_cents,'Statement/Ledger immutable parity after mixed flows');
 check((await call('/api/orders',cookies.admin,{id:multi,client_user_id:id,weight:2})).status===400,'Sensitive edit after Tracking denied');
 const reads=await Promise.all(Array.from({length:20},()=>call('/api/financials?client_id='+id+'&ledger_page=1&type=ORDER_CHARGE',cookies.admin)));
 check(reads.every(r=>r.status===200&&r.data.transactions.length===3&&r.data.net_balance_cents===f.net_balance_cents),'Concurrent filtered GET preserves balances and exact rows');
 console.log('OWNER MANUAL HTTP PASS ('+checks+' assertions; 8 concurrent Tracking retries + 8 price retries + 20 filtered GETs)');
})().catch(e=>{console.error(e);process.exitCode=1});
