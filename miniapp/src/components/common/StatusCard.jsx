import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Card, CardContent, Stack, Typography } from "@mui/material";

export default function StatusCard({ label, title, description, children, icon }) {
  return (
    <Card>
      <CardContent sx={{ p: 2.3 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            {icon || <InfoOutlinedIcon sx={{ fontSize: 18, color: "rgba(238,242,255,0.72)" }} />}

            {label ? (
              <Typography
                variant="caption"
                sx={{
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "rgba(238,242,255,0.62)",
                  fontWeight: 700,
                }}
              >
                {label}
              </Typography>
            ) : null}
          </Stack>

          {title ? (
            <Typography
              variant="h4"
              fontWeight={900}
              sx={{ letterSpacing: "-0.04em", lineHeight: 1.02 }}
            >
              {title}
            </Typography>
          ) : null}

          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
              {description}
            </Typography>
          ) : null}

          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}