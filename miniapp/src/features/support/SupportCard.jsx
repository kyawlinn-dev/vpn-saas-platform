import HeadsetMicRoundedIcon from "@mui/icons-material/HeadsetMicRounded";
import TelegramIcon from "@mui/icons-material/Telegram";
import { CardContent, Stack, Typography } from "@mui/material";
import { GhostButton, GlassCard } from "../../components/ui/vpnPrimitives";

export default function SupportCard({ supportUsername, onContact }) {
  return (
    <GlassCard>
      <CardContent sx={{ p: 1.75 }}>
        <Stack direction="row" spacing={1.2} alignItems="center">
          <Stack
            alignItems="center"
            justifyContent="center"
            sx={{
              width: 40,
              height: 40,
              borderRadius: 3,
              color: "#a5f3fc",
              bgcolor: "rgba(6,182,212,0.12)",
              border: "1px solid rgba(6,182,212,0.18)",
            }}
          >
            <HeadsetMicRoundedIcon fontSize="small" />
          </Stack>

          <Stack spacing={0.25} minWidth={0} flex={1}>
            <Typography fontWeight={950} sx={{ fontSize: 15.5 }}>
              Need help?
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: 12.5 }} noWrap>
              {supportUsername ? `Chat with ${supportUsername}` : "Contact support for manual help"}
            </Typography>
          </Stack>

          {onContact && (
            <GhostButton
              startIcon={<TelegramIcon />}
              onClick={onContact}
              sx={{ width: "auto", height: 38, minHeight: 38, px: 1.35 }}
            >
              Chat
            </GhostButton>
          )}
        </Stack>
      </CardContent>
    </GlassCard>
  );
}
