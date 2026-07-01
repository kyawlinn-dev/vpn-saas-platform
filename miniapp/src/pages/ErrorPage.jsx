import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { Stack } from "@mui/material";
import EmptyState from "../components/common/EmptyState";
import PrimaryButton from "../components/common/PrimaryButton";
import PageContainer from "../components/layout/PageContainer";
import SecondaryButton from "../components/common/SecondaryButton";
import { openTelegramNativeLink } from "../lib/telegram";

export default function ErrorPage({ error, supportUsername }) {
  const message =
    error?.message || "Something went wrong while loading the Mini App.";

  return (
    <PageContainer>
      <EmptyState
        icon={<ErrorOutlineRoundedIcon />}
        title="Unable to load Mini App"
        description={message}
        action={
          <Stack spacing={1.25} width="100%">
            <PrimaryButton
              startIcon={<RefreshRoundedIcon />}
              onClick={() => window.location.reload()}
            >
              Try Again
            </PrimaryButton>

            {supportUsername && (
              <SecondaryButton
                onClick={() => openTelegramNativeLink(`https://t.me/${supportUsername}`)}
              >
                Contact Support
              </SecondaryButton>
            )}
          </Stack>
        }
      />
    </PageContainer>
  );
}