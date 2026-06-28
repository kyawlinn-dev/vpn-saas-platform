import { Stack } from '@mui/material';
import { SectionHeader } from '../components/SectionHeader';
import { SimpleTableCard } from '../components/SimpleTableCard';
import { useScopedDashboard } from '../hooks/useScopedDashboard';
import { formatMMK } from '../lib/format';
import type { Plan } from '../types/api';

export function PlansPage() {
  const { plans } = useScopedDashboard();

  return (
    <Stack spacing={3}>
      <SectionHeader title="Plans" description="Reference page for plans that resellers can use when creating or renewing orders." />
      <SimpleTableCard<Plan>
        title="Available Plans"
        rows={plans}
        columns={[
          { key: 'name', header: 'Name', render: (row) => row.name },
          { key: 'price', header: 'Price', render: (row) => formatMMK(row.price_mmk) },
          { key: 'duration', header: 'Duration', render: (row) => `${row.duration_days} days` },
          { key: 'data', header: 'Data Limit', render: (row) => row.data_limit_gb ? `${row.data_limit_gb} GB` : 'Unlimited' },
        ]}
      />
    </Stack>
  );
}
