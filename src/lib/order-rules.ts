export const TRACKING_REPLACEMENT_REASONS = [
  "Điều chỉnh tuyến vận chuyển",
  "Cập nhật từ đơn vị vận chuyển",
  "Thay thế label lỗi",
  "Điều chỉnh thông tin vận đơn",
] as const;

export function trackingReplacementReason(value: unknown) {
  const reason = String(value ?? "").trim();
  if (!reason) return "";
  if (!(TRACKING_REPLACEMENT_REASONS as readonly string[]).includes(reason)) {
    throw new Error("Lý do đổi Tracking/Label không hợp lệ.");
  }
  return reason;
}
