"""Actual Chrome interaction on the owned synthetic Ledger UAT server only."""
import base64,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from importlib.machinery import SourceFileLoader
lib=SourceFileLoader('dmd_cdp',str(Path(__file__).with_name('uat-browser-cdp.py'))).load_module()
WEB='http://127.0.0.1:34219'
OUT=Path(__file__).resolve().parents[1]/'docs/Feature/evidence/ledger-20261020'
OUT.mkdir(parents=True,exist_ok=True)
if not os.environ.get('DMD_LEDGER_SYNTHETIC_DB','').endswith('internal-uat-test-ledger-20261020-run1.db'):raise RuntimeError('Explicit synthetic DB marker required')
checks=0
def check(c,expr,label):
 global checks
 lib.check(c,expr,label);checks+=1
def click(c,text):
 c.js('(()=>{const b=Array.from(document.querySelectorAll("button")).find(x=>(x.getAttribute("aria-label")=== '+json.dumps(text)+'||x.innerText.includes('+json.dumps(text)+')));if(!b)throw Error("Missing button");b.click()})()');time.sleep(.6)
def screenshot(c,name):
 shot=c.call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False});(OUT/name).write_bytes(base64.b64decode(shot['data']))
def wait(c,expr):
 for _ in range(50):
  if c.js(expr):return
  time.sleep(.2)
 screenshot(c,'failure.png');print('UI FAILURE',c.js('JSON.stringify({url:location.href,text:document.body.innerText.slice(0,3000),scripts:Array.from(document.scripts).map(s=>s.src)})'));raise RuntimeError('UI wait timed out '+expr)
p=None
try:
 for attempt in range(3):
  port=34321+attempt;profile=tempfile.mkdtemp(prefix='dmd-ledger-chrome-');log=open('/tmp/dmd-ledger-chrome-'+str(attempt)+'.log','w')
  p=subprocess.Popen([lib.CHROME,'--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-background-networking','--remote-allow-origins=*',f'--remote-debugging-port={port}',f'--user-data-dir={profile}','about:blank'],stdout=log,stderr=log)
  try:
   targets=json.loads(lib.ready(f'http://127.0.0.1:{port}/json/list',15));c=lib.CDP(next(x for x in targets if x['type']=='page')['webSocketDebuggerUrl']);break
  except Exception:
   p.terminate();p.wait(timeout=10)
   if attempt==2:raise
 c.call('Page.enable');c.call('Runtime.enable');c.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1050,'deviceScaleFactor':1,'mobile':False});c.call('Page.navigate',{'url':WEB});time.sleep(2)
 for role,username in [('client','epacket.client.a'),('admin','epacket.admin'),('sales','epacket.sales'),('warehouse','uat.warehouse'),('finance','uat.finance'),('bod','uat.bod')]:
  # seed names are checked, never assume a successful login.
  if role=='warehouse':username='demo.warehouse'
  result=c.js("fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:"+json.dumps(username)+",password:'Demo12345!'})}).then(async r=>({status:r.status,data:await r.json()}))")
  if result['status']!=200:raise RuntimeError('Login '+role+' '+str(result))
  c.call('Page.reload');time.sleep(1.5)
  if role in ('client','admin','sales'):
   wait(c,"Array.from(document.querySelectorAll('button')).some(b=>b.getAttribute('aria-label')==='Balance Ledger')")
   click(c,'Balance Ledger');wait(c,"!!document.querySelector('.financialWorkspace')")
   if role!='client':
    wait(c,"!!document.querySelector('select[aria-label=\"Client tài chính\"] option[value]:not([value=\"\"])')")
    c.js("(()=>{const s=document.querySelector('select[aria-label=\"Client tài chính\"]');s.value=Array.from(s.options).find(o=>o.value).value;s.dispatchEvent(new Event('change',{bubbles:true}))})()")
   wait(c,"!!document.querySelector('.ledgerSnapshot')")
   check(c,"document.querySelector('.ledgerSnapshot').textContent.includes('Balance ròng')&&document.querySelector('.ledgerSnapshot').textContent.includes('Refund Balance')",role+' six-metric snapshot')
   check(c,"Array.from(document.querySelectorAll('details')).some(d=>d.querySelector('summary')?.innerText.includes('Statement')&&!d.open)",role+' Statement collapsed below snapshot')
   check(c,"!Array.from(document.querySelectorAll('button')).some(b=>b.innerText==='Điều khiển Client')" if role=='client' else "Array.from(document.querySelectorAll('button')).some(b=>b.innerText==='Điều khiển Client')",role+' controls permission')
   c.js("(()=>{const i=Array.from(document.querySelectorAll('input')).find(i=>i.placeholder==='ID, reference, ghi chú…');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(i,'NO-MATCH-SYNTHETIC');i.dispatchEvent(new Event('input',{bubbles:true}))})()")
   time.sleep(.5)
   check(c,"document.body.innerText.includes('Không có giao dịch phù hợp')",role+' ledger search empty-state recovery')
   c.js("(()=>{const i=Array.from(document.querySelectorAll('input')).find(i=>i.placeholder==='ID, reference, ghi chú…');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}))})()")
   time.sleep(.4)
   check(c,"!document.body.innerText.includes('Không có giao dịch phù hợp')",role+' clearing search restores ledger')
   c.js("(()=>{const s=document.querySelector('.financialWorkspace .financeFilters select');s.value='PAYMENT';s.dispatchEvent(new Event('change',{bubbles:true}))})()")
   time.sleep(.4)
   check(c,"document.querySelectorAll('.financialWorkspace td[data-label=\"Giao dịch / ngày\"]').length>0&&Array.from(document.querySelectorAll('.financialWorkspace td[data-label=\"Giao dịch / ngày\"]')).every(td=>td.textContent.includes('PAYMENT'))",role+' transaction type filter')
   c.js("(()=>{const s=document.querySelector('.financialWorkspace .financeFilters select');s.value='';s.dispatchEvent(new Event('change',{bubbles:true}))})()")
   c.js("(()=>{const s=document.querySelectorAll('.financialWorkspace .financeFilters select')[1];s.value='POSTED';s.dispatchEvent(new Event('change',{bubbles:true}))})()")
   time.sleep(.3)
   check(c,"Array.from(document.querySelectorAll('.financialWorkspace td[data-label=\"Trạng thái / chi tiết\"]')).every(td=>td.textContent.includes('Đã ghi'))",role+' posted status filter')
   c.js("(()=>{const s=document.querySelectorAll('.financialWorkspace .financeFilters select')[1];s.value='';s.dispatchEvent(new Event('change',{bubbles:true}))})()")
   click(c,'Debt Account')
   check(c,"document.querySelector('.financialWorkspace').textContent.includes('Mỗi Client có một Debt Account')",role+' Debt click-through')
   click(c,'Giao dịch Balance')
   c.js("Array.from(document.querySelectorAll('.financialWorkspace summary')).find(s=>s.textContent.includes('Statement ·')).click()")
   wait(c,"document.querySelector('.financialWorkspace').textContent.includes('Statement V2')")
   check(c,"document.querySelector('.financialWorkspace').textContent.includes('không thu phí hoặc phân bổ Payment')",role+' Statement reporting purpose')
   c.js("Array.from(document.querySelectorAll('.financialWorkspace summary')).find(s=>s.textContent.includes('Statement ·')).click()")
   if role in ('admin','sales'):
    target=c.js("document.querySelector('select[aria-label=\"Client tài chính\"]').value")
    before=c.js("fetch('/api/financials?client_id='+"+json.dumps(target)+").then(r=>r.json()).then(d=>d.net_balance_cents)")
    click(c,'Điều khiển Client')
    c.js("(()=>{const f=Array.from(document.querySelectorAll('.financialWorkspace form')).find(f=>f.querySelector('input[name=action]')?.value==='additional_fee');for(const [k,v] of Object.entries({occurred_at:'2026-10-20',quantity:'1',unit_price:'1.00',note:'Synthetic Chrome Ledger fee'})){const i=f.elements.namedItem(k);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,v);i.dispatchEvent(new Event('input',{bubbles:true}))}f.querySelector('button').click()})()")
    wait(c,"!!document.querySelector('[aria-label=\"Kiểm tra giao dịch\"]')")
    check(c,"document.querySelector('[aria-label=\"Kiểm tra giao dịch\"]').textContent.includes('Synthetic Chrome Ledger fee')",role+' fee review before mutation')
    click(c,'Xác nhận ghi giao dịch')
    wait(c,"Array.from(document.querySelectorAll('.financialWorkspace [role=status]')).some(p=>p.textContent.includes('Đã ghi nhận'))")
    after=c.js("fetch('/api/financials?client_id='+"+json.dumps(target)+").then(r=>r.json()).then(d=>d.net_balance_cents)")
    check(c,str(after==before-100).lower(),role+' actual UI fee debits exactly 1 USD')
    click(c,'Giao dịch Balance')
    check(c,"document.querySelector('.financialWorkspace .financialActivity').textContent.includes('Synthetic Chrome Ledger fee')",role+' Ledger refresh shows posted UI fee')
   screenshot(c,role+'-desktop.png')
   c.call('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True});time.sleep(.5)
   check(c,"document.documentElement.scrollWidth<=document.documentElement.clientWidth+1",role+' mobile no page overflow')
   screenshot(c,role+'-mobile.png')
   c.js("document.querySelector('.financialWorkspace .financeFilters').scrollIntoView({block:'start'})");time.sleep(.3)
   check(c,"getComputedStyle(document.querySelector('.financialActivity td')).display==='grid'",role+' mobile ledger stacked labels')
   screenshot(c,role+'-ledger-mobile.png');c.js('window.scrollTo(0,0)');c.call('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1050,'deviceScaleFactor':1,'mobile':False})
   if role!='client':
    c.js("(()=>{const s=document.querySelector('select[aria-label=\"Client tài chính\"]');s.value='';s.dispatchEvent(new Event('change',{bubbles:true}))})()")
    wait(c,"!document.querySelector('.ledgerSnapshot')")
    check(c,"!document.querySelector('.financialWorkspace').innerText.includes('Đang tải tài chính')",role+' deselect clears loading and snapshot')
  else:
   wait(c,"document.body.innerText.length>100")
   check(c,"!Array.from(document.querySelectorAll('button')).some(b=>b.innerText==='Ghi giao dịch')",role+' no operational ledger write action')
   if role=='finance':
    click(c,'Payment Reconciliation');wait(c,"document.body.innerText.includes('Payment')");screenshot(c,'finance-payments.png')
   screenshot(c,role+'-desktop.png')
  c.js("fetch('/api/auth/logout',{method:'POST'})")
 print('LEDGER CHROME PASS ('+str(checks)+' assertions); real DOM clicks/search/selection; no full workflow acceptance')
finally:
 if p and p.poll() is None:p.terminate();p.wait(timeout=10)
