import { Box, Container } from "@mui/material";

export default function PageContainer({ children }) {
  return (
    <Container
      maxWidth="sm"
      sx={{
        px: 2,
        pb: 1.6,
      }}
    >
      <Box display="grid" gap={2}>
        {children}
      </Box>
    </Container>
  );
}
