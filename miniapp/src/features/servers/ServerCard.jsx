import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import PublicRoundedIcon from "@mui/icons-material/PublicRounded";
import RocketLaunchRoundedIcon from "@mui/icons-material/RocketLaunchRounded";
import { Card, CardContent, Chip, Divider, Stack, Typography } from "@mui/material";
import AddKeyButton from "./AddKeyButton";
import SecondaryButton from "../../components/common/SecondaryButton";

export default function ServerCard({ server, onAddKeyError, onCopy }) {
  return (
    <Card
      sx={{
        overflow: "hidden",
        background:
          "radial-gradient(circle at top right, rgba(124,58,237,0.16), transparent 28%), linear-gradient(180deg, rgba(18,20,36,0.98) 0%, rgba(12,14,28,0.98) 100%)",
      }}
    >
      <CardContent sx={{ p: 2.2 }}>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
            <Stack spacing={0.75}>
              <Typography variant="h5" fontWeight={900} sx={{ letterSpacing: "-0.03em" }}>
                {server?.tag || "-"}
              </Typography>

              <Stack direction="row" spacing={1} alignItems="center">
                <PublicRoundedIcon sx={{ fontSize: 18, color: "rgba(238,242,255,0.68)" }} />
                <Typography variant="body2" color="text.secondary">
                  {server?.region || "-"}
                </Typography>
              </Stack>
            </Stack>

            <Chip
              icon={<RocketLaunchRoundedIcon sx={{ color: "inherit !important" }} />}
              label="Ready"
              sx={{
                background: "rgba(6,182,212,0.12)",
                border: "1px solid rgba(6,182,212,0.2)",
                color: "#8be4f3",
              }}
            />
          </Stack>

          <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />

          <Stack spacing={1.25}>
            <AddKeyButton server={server} onError={onAddKeyError} />
            <SecondaryButton
              startIcon={<ContentCopyRoundedIcon />}
              onClick={() => onCopy?.(server)}
            >
              Copy Key
            </SecondaryButton>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}