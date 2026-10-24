const {workerData}=require('node:worker_threads');
const signal=new Int32Array(workerData.signal);
process.env.DMD_DB_PATH=workerData.file;process.env.NODE_ENV='test';
try{
 require('./seed-epacket.cjs');
 const {emergencySwitchOrder}=require('../src/lib/emergency-switch.ts');
 if(workerData.action==='undo')require('../src/lib/emergency-hold.ts').undoEmergencyHold(workerData.actor,...workerData.args);
 else emergencySwitchOrder(workerData.actor,...workerData.args);
 require('../src/lib/db.ts').db.close();
 Atomics.store(signal,0,1);
}catch(e){if(workerData.allowClosed&&String(e.message).includes('đã đóng'))Atomics.store(signal,0,2);else{require('node:fs').writeSync(2,String(e.stack)+'\n');Atomics.store(signal,0,-1)}}
finally{Atomics.notify(signal,0)}
