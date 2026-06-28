import type { PropsWithChildren } from "react";
import { Box, CircularProgress } from "@mui/material";
import { Navigate, useLocation } from "react-router-dom";
import { useResellerAuth } from "../providers/ResellerAuthProvider";

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { isAuthenticated, initializing } = useResellerAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <Box
        minHeight="100vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    const existingState = location.state as
      | { from?: string; loggedOut?: boolean }
      | null;

    return (
      <Navigate
        to="/login"
        replace
        state={
          existingState?.loggedOut
            ? existingState
            : { from: location.pathname }
        }
      />
    );
  }

  return <>{children}</>;
}