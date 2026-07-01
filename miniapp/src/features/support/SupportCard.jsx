import HeadsetMicRoundedIcon from "@mui/icons-material/HeadsetMicRounded";
import TelegramIcon from "@mui/icons-material/Telegram";
import { Card, CardContent, Stack, Typography } from "@mui/material";
import PrimaryButton from "../../components/common/PrimaryButton";

export default function SupportCard({ supportUsername, onContact }) {
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
            {supportUsername
              ? `Want to buy plan or need support? Chat with ${supportUsername} on Telegram.`
              : "Want to buy a plan or need help? Contact our support team."}
          </Typography>

          {onContact && (
            <PrimaryButton startIcon={<TelegramIcon />} onClick={onContact}>
              Contact Us
            </PrimaryButton>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
