"use client";
import {useState} from 'react';
import {FinancialWorkspace} from './financial-workspace';
import {PaymentReconciliationWorkspace} from './payment-reconciliation-workspace';
import {RefundWorkspace} from './refund-workspace';
import {StatementsV2Workspace} from './statements-v2-workspace';
export function FinanceHub({role,clients,initialTab='transactions',initialClientId}:{role:string;clients:Record<string,unknown>[];initialTab?:string;initialClientId?:number|null}){
 const [tab,setTab]=useState(initialTab);
 const tabs=[['transactions','Danh sách Client / Ledger'],['debts','Debt Management'],['payments','Payment Reconciliation'],['refunds','Refund Balance'],['statements','Statement']];
 return <div className="financeHub"><nav className="opsTabs financeTopTabs" aria-label="Nghiệp vụ Balance Ledger">{tabs.map(([key,label])=><button key={key} aria-pressed={tab===key} className={tab===key?'primaryBtn':'secondaryBtn'} onClick={()=>setTab(key)}>{label}</button>)}</nav>
 {['transactions','debts'].includes(tab)&&<FinancialWorkspace role={role} clients={clients} view={tab} initialClientId={initialClientId}/>}
 {tab==='payments'&&<PaymentReconciliationWorkspace role={role}/>}
 {tab==='refunds'&&<RefundWorkspace role={role}/>}
 {tab==='statements'&&<StatementsV2Workspace role={role}/>}
 </div>;
}
