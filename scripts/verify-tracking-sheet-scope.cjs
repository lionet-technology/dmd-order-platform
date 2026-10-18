const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path');
const filename=path.resolve(__dirname,'../src/lib/tracking-sheet-scope.ts'),m=new Module(filename);
m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,filename);
const {trackingSheetScope}=m.exports;
const rows=[{order_pk:1,tracking:''},{order_pk:2,tracking:'TRACK-2'},{order_pk:2,tracking:''},{order_pk:3,tracking:'  '}];
assert.deepEqual(trackingSheetScope(rows),[rows[1],rows[2]]); // unrelated locked client excluded; both cartons retained
assert.deepEqual(trackingSheetScope(rows,[1]),[rows[0]]); // export can persist selected route before labels
assert.deepEqual(trackingSheetScope(rows,[]),[]);
assert.deepEqual(trackingSheetScope([]),[]);
assert.equal(rows.length,4);
console.log('TRACKING SHEET SCOPE PASS (5 assertions)');
