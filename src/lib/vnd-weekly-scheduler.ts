import {db} from './db';
import {vndDay} from './vnd-debt';
import {closeVndWeeklyStatements} from './vnd-statements';

export function runVndWeeklyClose(now=new Date()){
 const accounts=db.prepare(`
  WITH boundary AS (SELECT date(?,'weekday 0','-7 days') last_sunday)
  SELECT a.client_id FROM vnd_accounts a CROSS JOIN boundary b
  WHERE date(a.created_at,'+7 hours')<=b.last_sunday AND COALESCE(
   (SELECT MAX(s.period_end) FROM vnd_statements s WHERE s.client_id=a.client_id), ''
  )<b.last_sunday ORDER BY a.client_id
 `).all(vndDay(now)) as {client_id:number}[];
 for(const {client_id} of accounts){
  try{
   closeVndWeeklyStatements(client_id,undefined,now);
  }catch(error){
   console.error('Weekly VNĐ Statement close failed for Client',client_id,error);
  }
 }
}

let timer:NodeJS.Timeout|undefined;
export function startVndWeeklyClose(){
 if(timer)return;
 const tick=()=>{
  try{runVndWeeklyClose();}
  catch(error){console.error('Weekly VNĐ Statement scheduler failed',error);}
 };
 tick();
 timer=setInterval(tick,60_000);
 timer.unref();
}
