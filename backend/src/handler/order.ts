const MIN_ORDER_GAP = 1e-6;

export function shouldNormalizeOrder(
  order: number,
  neighbor?: { order: number },
) {
  if (!Number.isFinite(order)) {
    return true;
  }

  if (!neighbor) {
    return false;
  }

  if (!Number.isFinite(neighbor.order)) {
    return true;
  }

  return Math.abs(order - neighbor.order) < MIN_ORDER_GAP;
}
