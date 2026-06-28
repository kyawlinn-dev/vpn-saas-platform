import { Box, Card, CardContent, Skeleton, Stack } from "@mui/material";
import PageContainer from "../components/layout/PageContainer";

function ServerHeroSkeleton() {
  return (
    <Card>
      <CardContent sx={{ p: 2.25 }}>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Stack spacing={1}>
              <Skeleton variant="text" width={90} height={18} />
              <Skeleton variant="text" width={180} height={34} />
              <Skeleton variant="text" width={120} height={22} />
            </Stack>

            <Skeleton variant="rounded" width={84} height={32} sx={{ borderRadius: 999 }} />
          </Stack>

          <Skeleton variant="rounded" height={52} sx={{ borderRadius: 3 }} />

          <Stack direction="row" spacing={1}>
            <Skeleton variant="rounded" width={92} height={28} sx={{ borderRadius: 999 }} />
            <Skeleton variant="rounded" width={110} height={28} sx={{ borderRadius: 999 }} />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ActivePlanCardSkeleton() {
  return (
    <Card>
      <CardContent sx={{ p: 2.3 }}>
        <Stack spacing={1.8}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
            <Stack spacing={0.75}>
              <Skeleton variant="text" width={110} height={18} />
              <Skeleton variant="text" width={130} height={40} />
            </Stack>

            <Skeleton variant="rounded" width={110} height={32} sx={{ borderRadius: 999 }} />
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Skeleton variant="circular" width={18} height={18} />
            <Skeleton variant="text" width={170} height={22} />
          </Stack>

          <Stack spacing={0.7}>
            <Skeleton variant="text" width="100%" height={20} />
            <Skeleton variant="text" width="88%" height={20} />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ActionButtonsSkeleton() {
  return (
    <Stack spacing={1.25}>
      <Skeleton variant="rounded" height={48} sx={{ borderRadius: 999 }} />
      <Skeleton variant="rounded" height={48} sx={{ borderRadius: 999 }} />
    </Stack>
  );
}

export default function LoadingPage() {
  return (
    <PageContainer>
      <ServerHeroSkeleton />
      <ActivePlanCardSkeleton />
      <ActionButtonsSkeleton />

      <Box sx={{ height: 4 }} />
    </PageContainer>
  );
}