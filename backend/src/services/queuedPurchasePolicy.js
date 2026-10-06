const INDEX_NAME = "idx_vpn_orders_one_scheduled_purchase";

export function isQueuedPurchaseConflict(error) {
  return error?.code === "23505" &&
    [error.message, error.details, error.hint].some((value) =>
      String(value || "").includes(INDEX_NAME)
    );
}
