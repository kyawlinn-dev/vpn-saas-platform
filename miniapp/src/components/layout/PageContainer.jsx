import { Box, Container } from "@mui/material";

export default function PageContainer({ children }) {
  return (
    <Container
      maxWidth="sm"
      sx={{
        px: { xs: 2, sm: 2 },
        pb: 2,
      }}
    >
      <Box display="grid" gap={1.6}>
        {children}
      </Box>
    </Container>
  );
}
