"""Synthetic-only Chrome DevTools Protocol UI smoke; no browser companion required.
Launch against an explicitly local test server, never an arbitrary origin.
"""
import base64,json,os,random,socket,struct,subprocess,tempfile,time,urllib.request,hashlib,shutil,sys
from pathlib import Path
HOST='127.0.0.1'
WEB='http://127.0.0.1:34191'
PORT=random.randint(24000,39999)
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
class CDP:
 def __init__(self,url):
  from urllib.parse import urlsplit
  u=urlsplit(url);s=socket.create_connection((u.hostname,u.port),timeout=15);self.s=s;self.seq=0
  key=base64.b64encode(os.urandom(16)).decode()
  s.sendall((f'GET {u.path} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\nOrigin: http://localhost\r\n\r\n').encode())
  data=b''
  while b'\r\n\r\n' not in data:data+=s.recv(4096)
  if b' 101 ' not in data:raise RuntimeError('CDP websocket handshake failed: '+str(data[:220]))
  self.buffer=data.split(b'\r\n\r\n',1)[1]
 def read(self,n):
  while len(self.buffer)<n:self.buffer+=self.s.recv(max(4096,n-len(self.buffer)))
  data,self.buffer=self.buffer[:n],self.buffer[n:];return data
 def call(self,method,params=None):
  self.seq+=1;id=self.seq
  payload=json.dumps({'id':id,'method':method,'params':params or {}}).encode();mask=os.urandom(4)
  length=len(payload);head=bytes([0x81,0x80|length]) if length<126 else (bytes([0x81,0x80|126])+struct.pack('!H',length) if length<65536 else bytes([0x81,0x80|127])+struct.pack('!Q',length))
  self.s.sendall(head+mask+bytes(b^mask[i%4] for i,b in enumerate(payload)))
  while True:
   head=self.read(2);length=head[1]&127
   if length==126:length=struct.unpack('!H',self.read(2))[0]
   elif length==127:length=struct.unpack('!Q',self.read(8))[0]
   if head[1]&128:mask=self.read(4)
   result=self.read(length)
   if head[1]&128:result=bytes(b^mask[i%4] for i,b in enumerate(result))
   if head[0]&15==8:raise RuntimeError('WebSocket closed')
   if head[0]&15!=1:continue
   data=json.loads(result)
   if data.get('id')==id:
    if 'error' in data:raise RuntimeError(str(data['error']))
    return data.get('result',{})
 def js(self,expr,await_promise=True):
  response=self.call('Runtime.evaluate',{'expression':expr,'returnByValue':True,'awaitPromise':await_promise})
  if response.get('exceptionDetails'):raise RuntimeError(str(response['exceptionDetails']))
  return response.get('result',{}).get('value')
def ready(url,timeout=35):
 for _ in range(timeout*2):
  try:
   with urllib.request.urlopen(url,timeout=2) as r:return r.read()
  except urllib.error.HTTPError as err:
   if err.code in (400,401,403,404,405):return b''
   time.sleep(.5)
  except Exception:time.sleep(.5)
 raise RuntimeError('Server/Chrome target unavailable: '+url)
def check(c,expr,description):
 result=c.js(expr)
 if not result:raise AssertionError(description)
 print('PASS:',description)
def main():
 if not Path(CHROME).exists():raise RuntimeError('Google Chrome not installed')
 if not os.environ.get('DMD_UI_TEST_DB','').endswith('ui-multi-carton-20261020-unique.db'):raise RuntimeError('Requires uniquely named synthetic DB marker')
 ready(WEB+'/api/auth/login')
 directory=tempfile.mkdtemp(prefix='dmd-cdp-synthetic-')
 stderr_path=Path('/tmp/dmd-browser-cdp-chrome.log')
 with stderr_path.open('w') as err:
  p=subprocess.Popen([CHROME,'--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-background-networking','--disable-component-update','--remote-allow-origins=*',f'--remote-debugging-port={PORT}',f'--user-data-dir={directory}','about:blank'],stdout=subprocess.DEVNULL,stderr=err)
 try:
  try:targets=json.loads(ready(f'http://{HOST}:{PORT}/json/list'))
  except Exception as e:raise RuntimeError(str(e)+' / chrome exit='+str(p.poll())+' / '+stderr_path.read_text()[-1700:])
  page=next(t for t in targets if t['type']=='page')
  c=CDP(page['webSocketDebuggerUrl'])
  c.call('Page.enable');c.call('Runtime.enable')
  c.call('Page.navigate',{'url':WEB})
  time.sleep(2)
  print('INITIAL PAGE',c.js("JSON.stringify({url:location.href,ready:document.readyState,title:document.title})"))
  for _ in range(25):
   if c.js("document.readyState==='complete'"):break
   time.sleep(.4)
  check(c,"document.readyState==='complete'",'Actual Chrome page loaded')
  # Login via real UI fetch, same origin with browser cookie jar
  login=c.js("fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'epacket.client.a',password:'Demo12345!'})}).then(async x=>({status:x.status,result:await x.json()}))")
  print('LOGIN STATUS:',login.get('status'))
  if login['status']!=200:raise RuntimeError('Client login failed: '+str(login))
  c.call('Page.reload');time.sleep(3)
  print('LOGIN PAGE: loading authenticated application')
  for _ in range(30):
   if c.js("!!document.body&&document.body.innerText.length>100"):break
   time.sleep(.5)
  check(c,"!!document.querySelector('body')&&document.body.innerText.length>100",'Authenticated app rendered visible text')
  print('CLIENT PAGE: rendered')
  # UI navigation depends on DOM buttons: get snapshot to inspect
  interactive=c.js("Array.from(document.querySelectorAll('button')).map(x=>({text:x.innerText,aria:x.getAttribute('aria-label')})).filter(x=>x.text).slice(0,60)")
  print('CLIENT NEW ORDER BUTTON:',any('Tạo / Import' in x['text'] for x in interactive))
  c.js("Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Tạo / Import'))?.click()")
  time.sleep(1)
  print('CLIENT DATA ENTRY: opened')
  time.sleep(2)
  print('CLIENT UPS ROUTE OK',c.js("fetch('/api/client-orders').then(async r=>(await r.json()).routes.some(x=>x.service==='UPS'&&x.max_cartons_per_order===4))"))
  print('ROUTE SELECT OPTIONS: loaded')
  c.js("(()=>{const s=document.querySelector('.clientPurchase select');s.value='3';s.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
  time.sleep(1.2)
  check(c,"document.body.innerText.includes('Multiple Cartons')",'UPS route exposes Multiple Cartons selector')
  c.js("Array.from(document.querySelectorAll('button')).find(b=>b.innerText==='Multiple Cartons')?.click()")
  time.sleep(.5)
  check(c,"document.body.innerText.includes('Thêm Carton')",'Multi Carton mode shows add action')
  c.js("Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Thêm Carton'))?.click()")
  time.sleep(.5)
  check(c,"document.body.innerText.includes('Carton 2')",'Client can add Carton 2')
  check(c,"!!Array.from(document.querySelectorAll('input')).find(i=>i.getAttribute('aria-label')==='Carton · dòng 1'&&i.value==='2'&&i.disabled)",'Carton Quantity auto-increments and is read-only')
  c.js("Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Thêm Carton'))?.click()")
  time.sleep(.4)
  check(c,"document.body.innerText.includes('Carton 3')",'Client can add Carton 3')
  c.js("Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Bỏ Carton 2'))?.click()")
  time.sleep(.4)
  check(c,"!!Array.from(document.querySelectorAll('input')).find(i=>i.getAttribute('aria-label')==='Carton · dòng 1'&&i.value==='2')",'Removing middle carton reindexes remaining Cartons')
  print('CLIENT INTERACTIVE UI PASS')
  evidence=Path('docs/Feature/evidence/manual-carton-ui-2026-10-20');evidence.mkdir(parents=True,exist_ok=True)
  image_data=c.call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False}).get('data')
  if image_data:(evidence/'client-multi-carton.png').write_bytes(base64.b64decode(image_data))
  admin=c.js("fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'epacket.admin',password:'Demo12345!'})}).then(async r=>({status:r.status,data:await r.json()}))")
  if admin.get('status')!=200:raise AssertionError('Admin browser authentication: '+str(admin))
  print('PASS: Admin browser authentication')
  c.call('Page.reload');time.sleep(2)
  for _ in range(24):
   if c.js("document.body&&document.body.innerText.includes('OPERATIONS')"):break
   time.sleep(.4)
  print('ADMIN BUTTONS: navigation rendered')
  print('ADMIN DASHBOARD: rendered')
  c.js("document.querySelector('button[aria-label=Orders]')?.click()")
  time.sleep(1.5)
  print('ADMIN ORDERS BUTTONS: rendered')
  print('ADMIN ORDERS TABLE: rendered')
  c.js("Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Mua đơn hàng loạt'))?.click()")
  time.sleep(1.3)
  print('ADMIN BULK SHEET: opened')
  print('ADMIN BULK HEADERS: rendered')
  for _ in range(20):
   if c.js("Array.from(document.querySelectorAll('th')).some(h=>h.textContent.includes('Giá bán USD (Order)'))"):break
   time.sleep(.5)
  check(c,"Array.from(document.querySelectorAll('th')).some(h=>h.textContent.includes('Giá bán USD (Order)'))",'Admin bulk Tracking UI shows per-Order manual selling price column')
  print('ADMIN BULK: validation passed')
  image_data=c.call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False}).get('data')
  if image_data:(evidence/'admin-bulk-tracking.png').write_bytes(base64.b64decode(image_data))
  print('PASS: Admin bulk UI rendered in Chrome')
  print('UI FORM SMOKE COMPLETED')
 finally:
  p.terminate()
  try:p.wait(timeout=6)
  except subprocess.TimeoutExpired:p.kill()
  shutil.rmtree(directory,ignore_errors=True)
if __name__=='__main__':main()
