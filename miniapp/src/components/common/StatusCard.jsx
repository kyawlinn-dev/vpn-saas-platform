import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Card, CardContent, Stack, Typography } from "@mui/material";

export default function StatusCard({ label, title, description, children, icon }) {
  return (
    <Card>
      <CardContent sx={{ p: 2 }}>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} alignItems="center">
            {icon || <InfoOutlinedIcon sx={{ fontSize: 18, color: "rgba(238,242,255,0.72)" }} />}

            {label ? (
              <Typography
                variant="caption"
                sx={{
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(238,242,255,0.62)",
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                {label}
              </Typography>
            ) : null}
          </Stack>

          {title ? (
            <Typography
              variant="h6"
              fontWeight={900}
              sx={{ letterSpacing: 0, lineHeight: 1.15, fontSize: 19 }}
            >
              {title}
            </Typography>
          ) : null}

          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55, fontSize: 13.5 }}>
              {description}
            </Typography>
          ) : null}

          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}
