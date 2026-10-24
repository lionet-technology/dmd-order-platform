import {NextRequest,NextResponse} from 'next/server';
import {requireFinance} from '@/lib/auth';
import {supplierAccounts,supplierAccountAction} from '@/lib/supplier-account';
export const runtime='nodejs';
export async function GET(req:NextRequest){const a=requireFinance(req);if(a.error)return a.error;return NextResponse.json(supplierAccounts(a.user),{headers:{'Cache-Control':'private, no-store'}});}
export async function POST(req:NextRequest){const a=requireFinance(req);if(a.error)return a.error;try{return NextResponse.json(supplierAccountAction(a.user,await req.json()),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không thể ghi sổ Supplier.'},{status:400});}}
