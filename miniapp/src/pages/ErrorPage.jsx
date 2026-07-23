import { AlertCircle, MessageCircle, RefreshCcw } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "../components/ui/primitives";
import { openTelegramNativeLink } from "../lib/telegram";
import { useLanguage } from "../i18n/language";

export default function ErrorPage({ error, supportUsername }) {
  const { t } = useLanguage();
  const message =
    error?.message || t("error.message");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-red-400">
        <AlertCircle size={30} strokeWidth={1.8} />
      </div>

      <div className="text-center">
        <h1 className="text-[20px] font-bold text-foreground">{t("error.title")}</h1>
        <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
          {message}
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <PrimaryButton onClick={() => window.location.reload()}>
          <RefreshCcw size={17} />
          {t("error.retry")}
        </PrimaryButton>

        {supportUsername && (
          <SecondaryButton
            onClick={() =>
              openTelegramNativeLink(`https://t.me/${supportUsername}`)
            }
          >
            <MessageCircle size={17} />
            {t("error.contactSupport")}
          </SecondaryButton>
        )}
      </div>
    </div>
  );
}
