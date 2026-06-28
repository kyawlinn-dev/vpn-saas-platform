import { createContext, useContext } from "react";

export interface ColorModeContextValue {
  mode: "light" | "dark";
  toggleColorMode: () => void;
}

export const ColorModeContext = createContext<ColorModeContextValue>({
  mode: "dark",
  toggleColorMode: () => {},
});

export function useColorMode() {
  return useContext(ColorModeContext);
}