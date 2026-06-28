import { createTheme } from "@mui/material/styles";
import palette from "./palette";
import components from "./components";

const theme = createTheme({
  palette,
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: "Inter, system-ui, sans-serif",
  },
  components,
});

export default theme;