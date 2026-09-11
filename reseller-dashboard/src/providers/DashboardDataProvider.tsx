import { createContext, useContext, type ReactNode } from "react";
import {
  useDashboardData,
  type DashboardDataState,
} from "../hooks/useDashboardData";
import {
  useResellerProfile,
  type ResellerProfile,
} from "../hooks/useResellerProfile";

export interface DashboardContextValue extends DashboardDataState {
  profile: ResellerProfile | null;
  profileLoading: boolean;
  profileError: string;
}

const DashboardDataContext = createContext<DashboardContextValue | null>(null);

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const data = useDashboardData();
  const { profile, loading: profileLoading, error: profileError } = useResellerProfile();

  return (
    <DashboardDataContext.Provider
      value={{ ...data, profile, profileLoading, profileError }}
    >
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardContext() {
  const context = useContext(DashboardDataContext);
  if (!context) {
    throw new Error("useDashboardContext must be used inside DashboardDataProvider");
  }
  return context;
}
