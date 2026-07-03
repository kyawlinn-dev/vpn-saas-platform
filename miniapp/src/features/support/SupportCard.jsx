import { Headphones } from "lucide-react";
import { GlassCard, SecondaryButton } from "../../components/ui/primitives";

export default function SupportCard({ supportUsername, onContact }) {
  return (
    <GlassCard className="flex items-center gap-3 p-3.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-cyan/20 bg-cyan/12 text-cyan">
        <Headphones size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-foreground">Need help?</p>
        <p className="truncate text-[12px] text-muted-foreground">
          {supportUsername ? `Chat with ${supportUsername}` : "Contact support for manual help"}
        </p>
      </div>

      {onContact && (
        <SecondaryButton
          fullWidth={false}
          onClick={onContact}
          className="h-9 shrink-0 rounded-xl px-3.5 text-[13px]"
        >
          Chat
        </SecondaryButton>
      )}
    </GlassCard>
  );
}
