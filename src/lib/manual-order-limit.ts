// Shared by Order entry UIs and their manual batch endpoints only.
export const MANUAL_ORDER_LIMIT = 20;
export const MANUAL_ORDER_LIMIT_MESSAGE = 'Nhập tay tối đa 20 dòng mỗi lượt. Với nhiều đơn hơn, tải mẫu CSV/Excel và upload file.';
export function guardManualOrderRows(rows: readonly unknown[]) {
 if (rows.length > MANUAL_ORDER_LIMIT) throw Error(MANUAL_ORDER_LIMIT_MESSAGE);
}
