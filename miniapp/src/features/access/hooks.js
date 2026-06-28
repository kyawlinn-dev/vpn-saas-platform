import { useMutation } from "@tanstack/react-query";
import { linkMiniAppServer, submitMiniAppPurchase } from "./api";

export function useLinkServer({ onSuccess, onError } = {}) {
  return useMutation({
    mutationFn: ({ server_id, telegram_user_id }) =>
      linkMiniAppServer({ server_id, telegram_user_id }),
    onSuccess,
    onError,
  });
}

export function useSubmitPurchase({ onSuccess, onError } = {}) {
  return useMutation({
    mutationFn: (args) => submitMiniAppPurchase(args),
    onSuccess,
    onError,
  });
}
