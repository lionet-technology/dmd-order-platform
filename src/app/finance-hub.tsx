"use client";
import {useState} from 'react';
import {FinancialWorkspace} from './financial-workspace';
import {PaymentReconciliationWorkspace} from './payment-reconciliation-workspace';
import {RefundWorkspace} from './refund-workspace';
import {StatementsV2Workspace} from './statements-v2-workspace';
export function FinanceHub({role,clients,initialTab='transactions',initialClientId}:{role:string;clients:Record<string,unknown>[];initialTab?:string;initialClientId?:number|null}){
 const [tab,setTab]=useState(initialTab),[client,setClient]=useState(initialClientId?String(initialClientId):'');
 const detail=role==='CLIENT'||Boolean(client);
 const tabs=[['transactions','Balance / Ledger'],['debts','Debt'],['payments','Payment Reconciliation'],['refunds','Refund'],['statements','Statement']];
 return <div className="financeHub">
 {detail&&<><button className="secondaryBtn" hidden={role==='CLIENT'} onClick={()=>{setClient('');setTab('transactions')}}>← Tổng quan Client</button><h2>{role==='CLIENT'?'Tài khoản của bạn':String(clients.find(c=>String(c.id)===client)?.display_name||'Client #'+client)}</h2><nav className="opsTabs financeTopTabs" aria-label="Chi tiết Client">{tabs.map(([key,label])=><button key={key} aria-pressed={tab===key} className={tab===key?'primaryBtn':'secondaryBtn'} onClick={()=>setTab(key)}>{label}</button>)}</nav></>}
 {(!detail||['transactions','debts'].includes(tab))&&<FinancialWorkspace key={detail?'detail:'+tab+client:'overview'} role={role} clients={clients} view={detail?tab:'transactions'} initialClientId={Number(client)||undefined} onClientChange={setClient}/>}
 {detail&&tab==='payments'&&<PaymentReconciliationWorkspace key={client} role={role} clientId={client}/>}
 {detail&&tab==='refunds'&&<RefundWorkspace key={client} role={role} clientId={client}/>}
 {detail&&tab==='statements'&&<StatementsV2Workspace key={client} role={role} clientId={client||undefined}/>}
 </div>;
}
