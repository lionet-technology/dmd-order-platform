const fs=require('node:fs');const ExcelJS=require('exceljs');
const base=process.env.E2E_BASE_URL||'http://localhost:3107';let checks=0;
function check(ok,msg){checks++;if(!ok)throw Error(msg)}
async function call(path,body,cookie){const headers={};if(cookie)headers.cookie=cookie;if(body&&!(body instanceof FormData))headers['content-type']='application/json';const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});return {r,data:await r.clone().json().catch(()=>null),cookie:(r.headers.get('set-cookie')||'').split(';')[0]}}
(async()=>{
 const admin=(await call('/api/auth/login',{username:'e2e.admin',password:'TestPass123!'})).cookie;
 const sales=(await call('/api/auth/login',{username:'e2e.sales',password:'TestPass123!'})).cookie;
 const client=(await call('/api/auth/login',{username:'e2e.client',password:'TestPass123!'})).cookie;
 for(const cookie of [undefined,sales,client]){check((await call('/api/manifest-scan',{tracking:'E2E-A2'},cookie)).r.status>=400,'scan RBAC');check((await call('/api/manifest-export',{trackings:['E2E-A2']},cookie)).r.status>=400,'export RBAC')}
 const item=await call('/api/manifest-scan',{tracking:'e2e a2'},admin);check(item.r.status===200&&item.data.item.carton_id,'exact carton lookup');
 for(const tracking of ['missing','E2E-A1'])check((await call('/api/manifest-scan',{tracking},admin)).r.status===400,'unknown/replaced');
 check((await call('/api/manifest-export',{order_ids:[item.data.item.order_pk]},admin)).r.status===400,'reject legacy order selection');
 check((await call('/api/manifest-export',{trackings:['E2E-A2','e2e a2']},admin)).r.status===400,'reject duplicates');
 const config=JSON.parse(fs.readFileSync('config/templates/epacket-standard-dmd/route.json'));const route=await call('/api/service-routes',{...config,sub_service:'T11',supplier:'KILOSHIP'},admin);check(route.r.ok,'test route');
 const form=new FormData();for(const [k,v] of Object.entries({route_config_id:route.data.id,template_kind:'MANIFEST',name:'Scan QA',output_mode:'MULTI_ORDER',repeat_sections:JSON.stringify(config.repeat_sections)}))form.set(k,String(v));form.set('file',new Blob([fs.readFileSync('config/templates/epacket-standard-dmd/manifest.xlsx')]),'manifest.xlsx');
 const upload=await call('/api/purchase-templates',form,admin);check(upload.r.ok&&!upload.data.errors.length,'template validation');
 const activate=await call('/api/purchase-templates/'+upload.data.version.template_id+'/activate',{version_id:upload.data.version.id},admin);check(activate.r.ok,'template activation');
 const exported=await call('/api/manifest-export',{trackings:['E2E-A2']},admin);check(exported.r.ok,'scan export');const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await exported.r.arrayBuffer()));const sheet=book.getWorksheet('Sheet1');check(sheet.getCell('F2').value==='E2E-A2'&&sheet.getColumn(6).values.filter(v=>String(v).startsWith('E2E-')).length===1,'one selected carton only');
 console.log('MANIFEST SCAN API PASS ('+checks+' assertions)');
})().catch(e=>{console.error(e);process.exitCode=1});
