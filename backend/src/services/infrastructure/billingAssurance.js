/** Preserve the provider's bounded claim, never arbitrary inventory fields. */
export function normalizeBillingAssurance(value) {
  return value?.scope==='instance-package'&&value.externalAttachmentsVerified===false
    ?{scope:'instance-package',externalAttachmentsVerified:false}:null;
}
