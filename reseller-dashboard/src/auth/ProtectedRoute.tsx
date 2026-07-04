import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useResellerAuth } from "../providers/ResellerAuthProvider";

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { isAuthenticated, initializing } = useResellerAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
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
