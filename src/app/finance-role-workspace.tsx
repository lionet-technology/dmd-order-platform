"use client";
import {useState} from "react";
import {SupplierCostWorkspace} from "./supplier-cost-workspace";
import {SupplierCostAdjustmentWorkspace} from "./supplier-cost-adjustment-workspace";
import {ReconciliationWorkspace} from "./reconciliation-workspace";
import {RefundWorkspace} from "./refund-workspace";
import {PaymentReconciliationWorkspace} from "./payment-reconciliation-workspace";
import {SupplierAccountWorkspace} from "./supplier-account-workspace";
import {BodFinanceWorkspace} from './bod-finance-workspace';
import {StatementsV2Workspace} from './statements-v2-workspace';
import {InternalExpensesWorkspace} from "./internal-expenses-workspace";
import {SupplierRecoveryWorkspace} from "./supplier-recovery-workspace";
export function FinanceWorkspace({user,onLogout}:{user:{display_name:string;role:string};onLogout:()=>void}){
 const [tab,setTab]=useState("suppliers"),[supplier,setSupplier]=useState("");
 return <main className="financeRoleWorkspace"><header className="pageHeader"><div><span className="eyebrow">{user.role}</span><h1>Tài chính</h1><p>{user.display_name}</p></div><button className="secondaryBtn" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});onLogout()}}>Đăng xuất</button></header>
 <nav className="settingsActions" aria-label="Tài chính">{[["expenses","Chi tiêu nội bộ"],["suppliers","Supplier"],["costs","Supplier Costs"],["refunds","Refund Management"],["payments","Payment Reconciliation"],["bod","BOD Finance"],["statements","Statement"],...(user.role==="FINANCE"?[["supplier-adjustments","Supplier Cost Adjustment"]]:[])].map(([id,label])=><button className={tab===id?"primaryBtn":"secondaryBtn"} key={id} onClick={()=>{if(id==="costs")setSupplier("");setTab(id)}}>{label}</button>)}</nav>
 {tab==="costs"&&<><button className="secondaryBtn" onClick={()=>setTab("suppliers")}>← Tổng quan Supplier</button><SupplierCostWorkspace key={supplier} role={user.role} initialSupplier={supplier}/></>}
 {tab==="supplier-adjustments"&&user.role==="FINANCE"&&<SupplierCostAdjustmentWorkspace/>}
 {tab==="expenses"&&<InternalExpensesWorkspace/>}
 {tab==="reconciliation"&&<ReconciliationWorkspace/>}
 {tab==="statements"&&<StatementsV2Workspace role={user.role}/>}
 {tab==="refunds"&&<RefundWorkspace role={user.role}/>}
 {tab==="payments"&&<PaymentReconciliationWorkspace role={user.role}/>}
 {tab==="suppliers"&&<><SupplierRecoveryWorkspace/><SupplierAccountWorkspace onCostTools={supplier=>{setSupplier(supplier);setTab("costs")}}/></>}{tab==="bod"&&<BodFinanceWorkspace/>}
 </main>;
}
