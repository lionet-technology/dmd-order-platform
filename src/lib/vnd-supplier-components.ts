import {subtractVnd, sumVnd} from './vnd-money';

export const componentGroups = ['Cost', 'Surcharge', 'Tax'] as const;
export type ComponentGroup = typeof componentGroups[number];
export type ComponentMapping = {column: string; id: string; group: ComponentGroup};
export type QuotedComponent = ComponentMapping & {amount: string | null};
export type FinalComponent = Omit<QuotedComponent, 'amount'> & {amount: string};

export const supplierExceptionTags = [
  'Order Not Found', 'Cost > Estimated Net', 'Billable Weight > Measured Weight',
  'Cancel Fee > Policy', 'Mapping/ Data Error', 'Duplicated - Processed Order',
  'Duplicated - Within Quotation File', 'Additional Fee Found', 'Fee Adjustment Found',
] as const;

export function supplierTags(errors: string[]) {
  const byError: Record<string, typeof supplierExceptionTags[number]> = {
    ORDER_NOT_MATCHED: 'Order Not Found',
    NET_ABOVE_ESTIMATE: 'Cost > Estimated Net',
    WEIGHT_ABOVE_DMD: 'Billable Weight > Measured Weight',
    CANCEL_FEE_ABOVE_POLICY: 'Cancel Fee > Policy',
    DUPLICATE_HISTORY: 'Duplicated - Processed Order',
    DUPLICATE_IN_FILE: 'Duplicated - Within Quotation File',
    ADDITIONAL_FEE: 'Additional Fee Found',
    FEE_ADJUSTMENT: 'Fee Adjustment Found',
  };
  const tags = new Set(errors.map(error => byError[error] ?? 'Mapping/ Data Error'));
  return supplierExceptionTags.filter(tag => tags.has(tag));
}

export function compareSupplierComponents(previous: FinalComponent[], incoming: QuotedComponent[]) {
  const final = new Map(previous.map(component => [component.id, component]));
  for (const component of incoming) {
    if (component.amount !== null) final.set(component.id, {...component, amount: component.amount});
  }
  const current = [...final.values()];
  const lines = current.map(component => {
    const old = previous.find(candidate => candidate.id === component.id);
    const quoted = incoming.find(candidate => candidate.id === component.id);
    return {...component, quoted: quoted?.amount ?? null, old: old?.amount ?? null, delta: subtractVnd(component.amount, old?.amount ?? '0')};
  });
  const groups = componentGroups.map(group => {
    const old = sumVnd(previous.filter(component => component.group === group).map(component => component.amount));
    const currentTotal = sumVnd(current.filter(component => component.group === group).map(component => component.amount));
    return {group, old, current: currentTotal, delta: subtractVnd(currentTotal, old)};
  });
  return {current, lines, groups, total: sumVnd(groups.map(group => group.current))};
}
