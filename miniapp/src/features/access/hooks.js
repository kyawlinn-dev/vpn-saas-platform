import { useMutation } from "@tanstack/react-query";
import { linkMiniAppServer, submitMiniAppPurchase } from "./api";

export function useLinkServer({ onSuccess, onError } = {}) {
  return useMutation({
    mutationFn: (args) => linkMiniAppServer(args),
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
