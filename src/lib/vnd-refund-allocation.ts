import {addVnd, compareVnd, multiplyVnd, subtractVnd, sumVnd, vnd} from './vnd-money';

export type RefundOrderBasis = {
 order_id: number;
 selling_vnd: string;
 surcharge_vnd: string;
 tax_vnd: string;
 declared_goods: {unit_manufacturing_value: number | null; currency: string; quantity: number}[];
};

const positive = (value: string) => compareVnd(value, '0') > 0 ? value : '0';

function split(value: string, weights: string[], preserveCapacity = false) {
 const decimals = (n: string) => n.split('.')[1]?.length ?? 0;
 const units = (n: string, scale: number) => BigInt(n.replace('.', '')) * 10n ** BigInt(scale - decimals(n));
 const weightScale = Math.max(...weights.map(decimals));
 const scale = Math.max(decimals(value), preserveCapacity ? weightScale : 0);
 const total = units(value, scale);
 const normalized = weights.map(weight => units(weight, weightScale));
 const denominator = normalized.reduce((sum, weight) => sum + weight, 0n);
 if (denominator === 0n) return weights.map(() => '0');
 const shares = normalized.map((weight, index) => ({
  index, units: total * weight / denominator, remainder: total * weight % denominator,
 }));
 let remaining = total - shares.reduce((sum, share) => sum + share.units, 0n);
 const ranked = [...shares].sort((a, b) => a.remainder === b.remainder
  ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
 for (const share of ranked) {
  if (remaining === 0n) break;
  share.units++;
  remaining--;
 }
 return shares.map(share => {
  const digits = share.units.toString().padStart(scale + 1, '0');
  return vnd(scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits);
 });
}

export function allocateVndRefund(approved: string, basis: RefundOrderBasis[]) {
 const orders = [...basis].sort((a, b) => a.order_id - b.order_id);
 const revenue = orders.map(order => sumVnd([order.selling_vnd, order.surcharge_vnd, order.tax_vnd].map(positive)));
 const total = sumVnd(revenue);
 const withinRevenue = compareVnd(approved, total) < 0 ? approved : total;
 const covered = split(withinRevenue, revenue, true);
 const excess = subtractVnd(approved, withinRevenue);
 let compensation = orders.map(() => '0');
 if (compareVnd(excess, '0') > 0) {
  const currencies = new Set<string>();
  const declared = orders.map(order => sumVnd(order.declared_goods
   .filter(item => (item.unit_manufacturing_value ?? 0) > 0 && item.quantity > 0)
   .map(item => {
    currencies.add(item.currency);
    return multiplyVnd(String(item.unit_manufacturing_value), String(item.quantity));
   })));
  if (orders.length > 1 && currencies.size > 1) {
   throw Error('Cần quy đổi giá trị sản xuất về cùng tiền tệ để phân bổ phần bồi thường vượt doanh thu.');
  }
  compensation = split(excess, sumVnd(declared) === '0' ? orders.map(() => '1') : declared);
 }
 return orders.map((order, index) => {
  const allocateComponent = (remaining: string, amount: string) =>
   compareVnd(remaining, positive(amount)) <= 0 ? remaining : positive(amount);
  const selling = allocateComponent(covered[index], order.selling_vnd);
  const afterSelling = subtractVnd(covered[index], selling);
  const surcharge = allocateComponent(afterSelling, order.surcharge_vnd);
  return {
   order_id: order.order_id,
   selling_vnd: selling,
   surcharge_vnd: surcharge,
   tax_vnd: subtractVnd(afterSelling, surcharge),
   compensation_vnd: compensation[index],
   total_vnd: addVnd(covered[index], compensation[index]),
  };
 });
}
