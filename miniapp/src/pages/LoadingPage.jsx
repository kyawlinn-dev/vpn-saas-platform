import { Card, CardContent, Skeleton, Stack } from "@mui/material";
import PageContainer from "../components/layout/PageContainer";

function CompactCardSkeleton({ tall = false }) {
  return (
    <Card>
      <CardContent sx={{ p: 1.8 }}>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Skeleton variant="circular" width={46} height={46} />
            <Stack spacing={0.5} flex={1}>
              <Skeleton variant="text" width="48%" height={18} />
              <Skeleton variant="text" width="72%" height={24} />
            </Stack>
          </Stack>
          <Skeleton variant="rounded" height={tall ? 92 : 46} sx={{ borderRadius: 3 }} />
          <Skeleton variant="rounded" height={38} sx={{ borderRadius: 3 }} />
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function LoadingPage() {
  return (
    <PageContainer>
      <CompactCardSkeleton tall />
      <CompactCardSkeleton />
      <Stack direction="row" spacing={1}>
        <Skeleton variant="rounded" height={47} sx={{ borderRadius: 3, flex: 1 }} />
        <Skeleton variant="rounded" height={47} sx={{ borderRadius: 3, flex: 1 }} />
      </Stack>
    </PageContainer>
  );
}
