import { createContext, useContext, type ReactNode } from "react";
import {
  useDashboardData,
  type DashboardDataState,
} from "../hooks/useDashboardData";

const DashboardDataContext = createContext<DashboardDataState | null>(null);

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const value = useDashboardData();
  return (
    <DashboardDataContext.Provider value={value}>
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