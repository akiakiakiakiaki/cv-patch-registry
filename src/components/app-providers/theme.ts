import { createTheme } from "@mui/material/styles";

const lightComplementaryBlue = "#245a86";
const darkOrange = "#f2a84a";
export const LIGHT_PRIMARY = { main: lightComplementaryBlue, contrastText: "#ffffff" };

export const appTheme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: {
      palette: {
        primary: LIGHT_PRIMARY,
        secondary: { main: "#526579" },
        background: { default: "#f4f3f0", paper: "#ffffff" },
      },
    },
    dark: {
      palette: {
        primary: { main: darkOrange, contrastText: "#191a1c" },
        secondary: { main: "#91a4b7" },
        background: { default: "#17191c", paper: "#202327" },
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: { textTransform: "none", fontWeight: 600 },
  },
});

export const COLOR_MODE_STORAGE_KEY = "cv-patch-registry-color-mode";
