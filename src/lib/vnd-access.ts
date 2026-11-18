import {db} from './db';
import type {AuthUser} from './auth';
type Row=Record<string,unknown>;
function user(id:number){return db.prepare('SELECT * FROM users WHERE id=?').get(id) as Row|undefined;}
export function vndAccess(actor:Pick<AuthUser,'id'|'role'>,clientId:number){
 const actual=user(actor.id),client=user(clientId);
 if(!actual?.active||actual.role!==actor.role||client?.role!=='CLIENT'||!(['ADMIN','BOD','FINANCE'].includes(actor.role)||actor.role==='CLIENT'&&actor.id===clientId||actor.role==='SALES'&&client.sales_user_id===actor.id))throw Error('Không có quyền với tài khoản VNĐ.');
}
