/** Owner 14/11. Classification only: no invented surcharge, FX or supplier coverage. */
export const EPACKET_V1_NON_CONT = Object.freeze(["AK","HI","PR","GU","VI","AS","MP","AA","AE","AP"]);
export function classifyEPacketV1(input:{country:string;state:string;length_cm:number;width_cm:number;height_cm:number}) {
 for(const value of [input.length_cm,input.width_cm,input.height_cm])
  if(typeof value!=="number"||!Number.isFinite(value)||value<=0)throw Error("Kích thước ePacket phải lớn hơn 0.");
 const longest_side_cm=Math.max(input.length_cm,input.width_cm,input.height_cm);
 return {longest_side_cm,oversize_tier:longest_side_cm>75?"OVER75":longest_side_cm>55?"OVER55":"STANDARD",
  non_cont:input.country.trim().toUpperCase()==="US"&&EPACKET_V1_NON_CONT.includes(input.state.trim().toUpperCase()),
  surcharge_vnd:null,price_ready:false as const};
}
