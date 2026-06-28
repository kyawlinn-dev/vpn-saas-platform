import HeadsetMicRoundedIcon from "@mui/icons-material/HeadsetMicRounded";
import TelegramIcon from "@mui/icons-material/Telegram";
import { Card, CardContent, Stack, Typography } from "@mui/material";
import PrimaryButton from "../../components/common/PrimaryButton";

function usernameFromUrl(value) {
  const raw = String(value || "").replace(/\/$/, "");
  const last = raw.split("/").pop();
  return last ? `@${last.replace(/^@/, "")}` : "@support";
}

export default function SupportCard({ supportUsername, onContact }) {
  const username = supportUsername || usernameFromUrl("https://t.me/NovaNetMMSupport");

  return (
    <Card
      sx={{
        background: "#0f172a",
      }}
    >
      <CardContent sx={{ p: 2.3 }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <HeadsetMicRoundedIcon sx={{ color: "#c4b5fd" }} />
            <Typography variant="h5" fontWeight={900} sx={{ letterSpacing: "-0.03em" }}>
              Need support?
            </Typography>
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            Want to buy plan or need support? Chat with {username} on Telegram.
          </Typography>

          <PrimaryButton startIcon={<TelegramIcon />} onClick={onContact}>
            Contact Us
          </PrimaryButton>
        </Stack>
      </CardContent>
    </Card>
  );
}
