import {withFinancialPrivacy} from "@/lib/financial-privacy";
import {NextRequest,NextResponse} from 'next/server';
import {requireFinance} from '@/lib/auth';
import {supplierPayables,supplierPayableAction} from '@/lib/supplier-payables';
export const runtime='nodejs';
async function handleGET(req:NextRequest){const auth=requireFinance(req);if(auth.error)return auth.error;return NextResponse.json(supplierPayables(auth.user));}
async function handlePOST(req:NextRequest){const auth=requireFinance(req);if(auth.error)return auth.error;try{return NextResponse.json(supplierPayableAction(auth.user,await req.json()));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không thể ghi sổ phải trả.'},{status:400});}}

export const GET=withFinancialPrivacy(handleGET);
export const POST=withFinancialPrivacy(handlePOST);
