import SentimentDissatisfiedRoundedIcon from "@mui/icons-material/SentimentDissatisfiedRounded";
import { Card, CardContent, Stack, Typography } from "@mui/material";

export default function EmptyState({ title, description, action, icon }) {
  return (
    <Card>
      <CardContent sx={{ p: 2.4 }}>
        <Stack spacing={1.55} alignItems="flex-start">
          <Stack
            alignItems="center"
            justifyContent="center"
            sx={{
              width: 42,
              height: 42,
              borderRadius: 3,
              color: "#bfdbfe",
              background:
                "linear-gradient(135deg, rgba(37,99,235,0.18), rgba(124,58,237,0.14))",
              border: "1px solid rgba(147,197,253,0.16)",
            }}
          >
            {icon || <SentimentDissatisfiedRoundedIcon />}
          </Stack>

          <Stack spacing={1}>
            <Typography variant="h5" fontWeight={900} sx={{ letterSpacing: "-0.03em" }}>
              {title}
            </Typography>

            {description ? (
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55, fontSize: 13.5 }}>
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
