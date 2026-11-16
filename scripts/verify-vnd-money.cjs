require("./service-v1-test-env.cjs");
const assert=require("node:assert/strict");
const m=require("../src/lib/vnd-money.ts");
assert.equal(m.vnd("-000.000"),"0");
assert.equal(m.vnd("00123.45000"),"123.45");
assert.equal(m.addVnd("0.1","0.2"),"0.3");
assert.equal(m.addVnd("9007199254740993","0.000000000000000001"),"9007199254740993.000000000000000001");
assert.equal(m.subtractVnd("0.01","100000.001"),"-99999.991");
assert.equal(m.multiplyVnd(m.multiplyVnd("100000","1.06"),"1.16"),"122960");
assert.equal(m.multiplyVnd("0.125","1.254"),"0.15675");
assert.equal(m.sumVnd(Array(10000).fill("0.00001")),"0.1");
assert.equal(m.cancellationRefundVnd("230000","0","90"),"207000");
assert.equal(m.cancellationRefundVnd("230000","7000","90"),"200000");
assert.equal(m.cancellationRefundVnd("0.15675","0","90"),"0.141075");
assert.equal(m.cancellationRefundVnd("100","100","90"),"0");
assert.equal(m.cancellationRefundVnd("100","110","100"),"0");
assert.equal(m.cancellationRefundVnd("100","25","100"),"75");
for(const invalid of [""," 1","1 ","1e3","NaN","Infinity",".5","1.","+1","0x10","1,000",null,1])assert.throws(()=>m.vnd(invalid));
for(const args of [["-1","0","90"],["1","-1","90"],["1","0","100.1"],["1","0","-1"]])assert.throws(()=>m.cancellationRefundVnd(...args));
for(let i=-100;i<=100;i++){
 const a=m.multiplyVnd(String(i),"0.001");
 assert.equal(m.subtractVnd(m.addVnd(a,"12.3456789"),"12.3456789"),a);
 assert.equal(m.compareVnd(a,a),0);
 assert.equal(m.compareVnd(a,m.addVnd(a,"0.00000001")),-1);
}
assert.throws(()=>m.vnd("1".repeat(1001)));
console.log("VND MONEY PASS (exact fractions, signed deltas, large values, refund cap; no currency cutover)");
