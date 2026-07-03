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
          "radial-gradient(circle at top right, rgba(34,211,238,0.16), transparent 30%), linear-gradient(180deg, rgba(15,23,42,0.86), rgba(8,13,28,0.92))",
      }}
    >
      <CardContent sx={{ p: 1.8 }}>
        <Stack spacing={1.35}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1.5}>
            <Stack spacing={0.65} minWidth={0}>
              <Typography fontWeight={950} noWrap sx={{ fontSize: 17 }}>
                {server?.tag || server?.name || "Server"}
              </Typography>

              <Stack direction="row" spacing={0.7} alignItems="center">
                <PublicRoundedIcon sx={{ fontSize: 17, color: "rgba(238,242,255,0.68)" }} />
                <Typography color="text.secondary" noWrap sx={{ fontSize: 12.5 }}>
                  {server?.region || "-"}
                </Typography>
              </Stack>
            </Stack>

            <Chip
              icon={<RocketLaunchRoundedIcon sx={{ color: "inherit !important" }} />}
              label="Ready"
              size="small"
              sx={{
                height: 25,
                background: "rgba(6,182,212,0.12)",
                border: "1px solid rgba(6,182,212,0.2)",
                color: "#8be4f3",
                "& .MuiChip-label": { fontSize: 11, fontWeight: 900 },
              }}
            />
          </Stack>

          <Divider />

          <Stack spacing={1}>
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
