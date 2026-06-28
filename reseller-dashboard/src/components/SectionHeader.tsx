import type { ReactNode } from 'react';
import { Stack, Typography } from '@mui/material';

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', md: 'center' }}
      spacing={2}
      sx={{ mb: 1 }}
    >
      <Stack spacing={0.5}>
        <Typography variant="h4" fontWeight={800}>{title}</Typography>
        <Typography color="text.secondary">{description}</Typography>
      </Stack>
      {action}
    </Stack>
  );
}
