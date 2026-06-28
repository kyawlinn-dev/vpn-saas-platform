import SentimentDissatisfiedRoundedIcon from "@mui/icons-material/SentimentDissatisfiedRounded";
import { Card, CardContent, Stack, Typography } from "@mui/material";

export default function EmptyState({ title, description, action, icon }) {
  return (
    <Card>
      <CardContent sx={{ p: 2.4 }}>
        <Stack spacing={2} alignItems="flex-start">
          <Stack
            alignItems="center"
            justifyContent="center"
            sx={{
              width: 46,
              height: 46,
              borderRadius: 999,
              background: "rgba(124,58,237,0.12)",
              border: "1px solid rgba(124,58,237,0.18)",
            }}
          >
            {icon || <SentimentDissatisfiedRoundedIcon />}
          </Stack>

          <Stack spacing={1}>
            <Typography variant="h5" fontWeight={900} sx={{ letterSpacing: "-0.03em" }}>
              {title}
            </Typography>

            {description ? (
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                {description}
              </Typography>
            ) : null}
          </Stack>

          {action || null}
        </Stack>
      </CardContent>
    </Card>
  );
}