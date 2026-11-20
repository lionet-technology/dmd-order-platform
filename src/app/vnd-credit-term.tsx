'use client';

import Link from 'next/link';
import {useEffect,useState} from 'react';

export type CreditTerm={term_weeks:number;consecutive_weeks:number;overdue:boolean;overdue_weeks:number};

export function CreditTermAlert({term,dashboard=false}:{term:CreditTerm;dashboard?:boolean}){
 if(!term.overdue)return null;
 return <p role="alert">Balance VNĐ quá hạn Credit Term · {term.overdue_weeks} tuần quá hạn.
  {dashboard&&<> <Link href="/vnd">Xem tài khoản VNĐ</Link></>}
 </p>;
}

export function ClientCreditTermAlert({clientId}:{clientId:number}){
 const [term,setTerm]=useState<CreditTerm|null>(null);
 useEffect(()=>{
  const controller=new AbortController();
  const refresh=()=>{
   void fetch('/api/service-v1/statements?credit_status=1&client_id='+clientId,{signal:controller.signal})
    .then(response=>response.ok?response.json():null)
    .then(data=>{if(data)setTerm(data.credit_term);})
    .catch(()=>{});
  };
  refresh();
  const timer=setInterval(refresh,60_000);
  window.addEventListener('focus',refresh);
  return ()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[clientId]);
 return term&&<CreditTermAlert term={term} dashboard/>;
}
