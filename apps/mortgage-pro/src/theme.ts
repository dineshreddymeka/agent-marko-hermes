import { alpha, createTheme, type Theme } from "@mui/material/styles";

/** Harbor Ledger — forest ink, brass accent, sea-glass secondary. Light-first. */
const ink = "#132821";
const inkSoft = "#2a4038";
const brass = "#b8893a";
const brassDeep = "#8f6a28";
const sea = "#2f6b5c";
const seaSoft = "#4a8f7c";
const fog = "#f3f7f4";
const paper = "#fbfcfb";
const mist = "#e7efe9";

const inkDark = "#e8f0eb";
const paperDark = "#15201c";
const surfaceDark = "#1c2a25";

export const appTheme = createTheme({
  spacing: 8,
  cssVariables: {
    colorSchemeSelector: "class",
  },
  colorSchemes: {
    light: {
      palette: {
        mode: "light",
        primary: {
          main: ink,
          light: inkSoft,
          dark: "#0b1612",
          contrastText: "#f7faf8",
        },
        secondary: {
          main: brass,
          light: "#d4a95c",
          dark: brassDeep,
          contrastText: "#1a1408",
        },
        success: {
          main: sea,
          light: seaSoft,
          dark: "#214c41",
          contrastText: "#f4faf7",
        },
        info: {
          main: "#3d6e7a",
          contrastText: "#f4fafb",
        },
        warning: {
          main: "#c47a2a",
          contrastText: "#1a1206",
        },
        error: {
          main: "#b54040",
          contrastText: "#fff8f8",
        },
        text: {
          primary: alpha(ink, 0.94),
          secondary: alpha(inkSoft, 0.72),
          disabled: alpha(inkSoft, 0.4),
        },
        background: {
          default: fog,
          paper: paper,
        },
        divider: alpha(ink, 0.12),
        action: {
          active: alpha(ink, 0.55),
          hover: alpha(sea, 0.08),
          selected: alpha(brass, 0.14),
          disabled: alpha(inkSoft, 0.28),
          disabledBackground: alpha(ink, 0.06),
        },
      },
    },
    dark: {
      palette: {
        mode: "dark",
        primary: {
          main: "#c9d9d1",
          light: "#e8f0eb",
          dark: "#9bb0a5",
          contrastText: "#0f1814",
        },
        secondary: {
          main: "#d4a95c",
          light: "#e6c27a",
          dark: brass,
          contrastText: "#1a1408",
        },
        success: {
          main: seaSoft,
          light: "#6aada0",
          dark: sea,
          contrastText: "#0f1814",
        },
        info: {
          main: "#7eb0bc",
          contrastText: "#0f1814",
        },
        warning: {
          main: "#e0a35a",
          contrastText: "#1a1206",
        },
        error: {
          main: "#e07a7a",
          contrastText: "#1a0a0a",
        },
        text: {
          primary: alpha(inkDark, 0.95),
          secondary: alpha(inkDark, 0.7),
          disabled: alpha(inkDark, 0.4),
        },
        background: {
          default: "#0f1613",
          paper: paperDark,
        },
        divider: alpha("#c9d9d1", 0.14),
        action: {
          active: alpha("#fff", 0.65),
          hover: alpha("#c9d9d1", 0.08),
          selected: alpha("#d4a95c", 0.16),
          disabled: alpha("#c9d9d1", 0.3),
          disabledBackground: alpha("#fff", 0.06),
        },
      },
    },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: '"Source Sans 3", "Segoe UI", sans-serif',
    fontWeightLight: 400,
    fontWeightRegular: 400,
    fontWeightMedium: 600,
    fontWeightBold: 700,
    h1: {
      fontFamily: '"Bricolage Grotesque", Georgia, serif',
      fontWeight: 800,
      letterSpacing: "-0.04em",
      lineHeight: 1.05,
    },
    h2: {
      fontFamily: '"Bricolage Grotesque", Georgia, serif',
      fontWeight: 800,
      letterSpacing: "-0.035em",
      lineHeight: 1.1,
    },
    h3: {
      fontFamily: '"Bricolage Grotesque", Georgia, serif',
      fontWeight: 700,
      fontSize: "1.75rem",
      letterSpacing: "-0.03em",
      lineHeight: 1.15,
    },
    h4: {
      fontFamily: '"Bricolage Grotesque", Georgia, serif',
      fontWeight: 700,
      letterSpacing: "-0.03em",
    },
    h5: {
      fontFamily: '"Bricolage Grotesque", Georgia, serif',
      fontWeight: 700,
      letterSpacing: "-0.025em",
    },
    h6: {
      fontFamily: '"Bricolage Grotesque", Georgia, serif',
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    subtitle1: { fontWeight: 600, letterSpacing: "-0.01em" },
    subtitle2: { fontWeight: 600, letterSpacing: "-0.01em" },
    body1: { letterSpacing: "-0.005em", lineHeight: 1.5 },
    body2: { letterSpacing: "-0.005em", lineHeight: 1.45 },
    caption: { letterSpacing: "0", lineHeight: 1.4 },
    overline: {
      fontFamily: '"Source Sans 3", "Segoe UI", sans-serif',
      letterSpacing: "0.14em",
      fontWeight: 700,
      fontSize: "0.68rem",
    },
    button: {
      textTransform: "none",
      fontWeight: 700,
      letterSpacing: "-0.01em",
      fontFamily: '"Source Sans 3", "Segoe UI", sans-serif',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: ({ theme }: { theme: Theme }) =>
          theme.palette.mode === "dark"
            ? {
                backgroundColor: "#0f1613",
                backgroundImage: `
                  radial-gradient(ellipse 80% 50% at 10% -5%, ${alpha("#d4a95c", 0.12)}, transparent 50%),
                  radial-gradient(ellipse 60% 40% at 90% 0%, ${alpha(seaSoft, 0.1)}, transparent 45%),
                  linear-gradient(180deg, #121a16 0%, #0f1613 50%, #0c1210 100%)
                `,
                backgroundAttachment: "fixed",
              }
            : {
                /* Atmosphere lives in index.css for light mode */
              },
      },
    },
    MuiButton: {
      defaultProps: {
        variant: "contained",
        disableElevation: true,
        size: "small",
      },
      styleOverrides: {
        root: {
          borderRadius: 4,
          paddingInline: 18,
          minHeight: 40,
          transition: "transform 0.15s var(--pp-ease, ease), background 0.2s ease, border-color 0.2s ease",
          "&:active": {
            transform: "translateY(1px)",
          },
        },
        contained: ({ theme }) => ({
          boxShadow: "none",
          backgroundColor: theme.palette.mode === "light" ? ink : inkDark,
          color: theme.palette.mode === "light" ? paper : ink,
          "&:hover": {
            boxShadow: "none",
            backgroundColor: theme.palette.mode === "light" ? inkSoft : "#dce8e1",
          },
        }),
        containedSecondary: ({ theme }) => ({
          backgroundColor: theme.palette.secondary.main,
          color: theme.palette.secondary.contrastText,
          "&:hover": {
            backgroundColor: theme.palette.secondary.dark,
          },
        }),
        outlined: ({ theme }) => ({
          borderWidth: 1.5,
          borderColor: alpha(theme.palette.text.primary, 0.28),
          color: theme.palette.text.primary,
          backgroundColor: "transparent",
          "&:hover": {
            borderWidth: 1.5,
            borderColor: theme.palette.secondary.main,
            backgroundColor: alpha(theme.palette.secondary.main, 0.08),
          },
        }),
        text: ({ theme }) => ({
          color: theme.palette.text.secondary,
          "&:hover": {
            backgroundColor: alpha(theme.palette.secondary.main, 0.1),
            color: theme.palette.text.primary,
          },
        }),
      },
    },
    MuiIconButton: {
      defaultProps: { size: "small" },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 4,
          border: `1px solid ${alpha(theme.palette.text.primary, 0.12)}`,
          padding: 8,
          transition: "border-color 0.2s ease, background 0.2s ease",
          "&:hover": {
            backgroundColor: alpha(theme.palette.secondary.main, 0.12),
            borderColor: alpha(theme.palette.secondary.main, 0.45),
            color: theme.palette.secondary.dark,
          },
        }),
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({
          border: `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === "light" ? 0.1 : 0.14)}`,
          borderRadius: 6,
          backgroundImage: "none",
          backgroundColor:
            theme.palette.mode === "light" ? alpha(paper, 0.88) : alpha(surfaceDark, 0.92),
          boxShadow: "none",
        }),
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
        outlined: ({ theme }) => ({
          borderColor: alpha(theme.palette.text.primary, theme.palette.mode === "light" ? 0.1 : 0.14),
          backgroundColor:
            theme.palette.mode === "light" ? alpha(paper, 0.9) : alpha(surfaceDark, 0.9),
        }),
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
        size: "small",
        margin: "dense",
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          marginTop: 3,
          lineHeight: 1.25,
          fontSize: "0.72rem",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: "0.85rem",
          fontWeight: 500,
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: 18,
          "&:last-child": { paddingBottom: 18 },
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: "6px !important",
          border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
          backgroundColor:
            theme.palette.mode === "light" ? alpha(paper, 0.85) : alpha(surfaceDark, 0.88),
          boxShadow: "none",
          "&:before": { display: "none" },
          "&.Mui-expanded": {
            margin: 0,
          },
        }),
      },
    },
    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          minHeight: 52,
          paddingLeft: 16,
          paddingRight: 16,
        },
        content: { marginTop: 10, marginBottom: 10 },
      },
    },
    MuiAccordionDetails: {
      styleOverrides: {
        root: { padding: 16, paddingTop: 0 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 4,
          backgroundColor:
            theme.palette.mode === "light" ? alpha(mist, 0.65) : alpha("#fff", 0.04),
          "& fieldset": {
            borderColor: alpha(theme.palette.text.primary, theme.palette.mode === "light" ? 0.14 : 0.2),
          },
          "&:hover fieldset": {
            borderColor: alpha(theme.palette.secondary.main, 0.55),
          },
          "&.Mui-focused fieldset": {
            borderWidth: 1.5,
            borderColor: theme.palette.secondary.main,
          },
          "& .MuiInputBase-input.MuiInputBase-inputSizeSmall": {
            paddingTop: 10,
            paddingBottom: 10,
            paddingLeft: 12,
            paddingRight: 12,
            fontSize: "0.92rem",
            fontVariantNumeric: "tabular-nums",
          },
        }),
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 12,
          paddingRight: 12,
          fontVariantNumeric: "tabular-nums",
        },
        head: ({ theme }) => ({
          fontWeight: 700,
          fontSize: "0.72rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: theme.palette.text.secondary,
          paddingTop: 10,
          paddingBottom: 10,
          backgroundColor:
            theme.palette.mode === "light" ? alpha(mist, 0.9) : alpha("#fff", 0.04),
          borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
        }),
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
        outlinedInfo: ({ theme }) => ({
          borderColor: alpha(theme.palette.info.main, 0.35),
          backgroundColor: alpha(theme.palette.info.main, 0.06),
        }),
      },
    },
    MuiSnackbar: {
      defaultProps: {
        anchorOrigin: { vertical: "bottom", horizontal: "center" },
      },
    },
    MuiTablePagination: {
      defaultProps: { size: "small" },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: 56,
          "@media (min-width: 600px)": { minHeight: 56 },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          fontWeight: 600,
        },
        colorPrimary: ({ theme }) => ({
          backgroundColor: alpha(theme.palette.secondary.main, 0.16),
          border: `1px solid ${alpha(theme.palette.secondary.main, 0.35)}`,
          color: theme.palette.mode === "light" ? brassDeep : theme.palette.secondary.light,
        }),
      },
    },
  },
});
