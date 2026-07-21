import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import Alert from "@mui/material/Alert";
import {
  Box,
  Button,
  Container,
  IconButton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useColorScheme, useTheme } from "@mui/material/styles";
import { useMemo, useState } from "react";
import { MortgageTab } from "./tabs/MortgageTab";
import { RentalTab } from "./tabs/RentalTab";
import { UpfrontCashTab } from "./tabs/UpfrontCashTab";
import { WhenToSellTab } from "./tabs/WhenToSellTab";
import { useMortgageSyncedState } from "./hooks/useMortgageSyncedState";
import { downloadScenarioExcel } from "./lib/scenarioExcelExport";
import { computeMonthlyPayment } from "./lib/mortgageMath";

const moneyDec = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const TABS = [
  { label: "Mortgage", id: "mortgage" },
  { label: "Upfront", id: "upfront" },
  { label: "Rental", id: "rental" },
  { label: "When to sell", id: "sell" },
] as const;

export default function App() {
  const { setMode } = useColorScheme();
  const theme = useTheme();
  const { state, patch, reset, saveToBrowser } = useMortgageSyncedState();
  const [tab, setTab] = useState(0);
  const [toast, setToast] = useState<{ message: string; severity: "success" | "error" } | null>(
    null
  );

  const isDark = theme.palette.mode === "dark";

  const payment = useMemo(
    () =>
      computeMonthlyPayment(
        state.homePrice,
        state.downPayment,
        state.interestRateApr,
        state.termYears,
        state.propertyTaxAnnual,
        state.insuranceAnnual,
        state.hoaMonthly,
        state.pmiMonthly
      ),
    [
      state.downPayment,
      state.homePrice,
      state.hoaMonthly,
      state.insuranceAnnual,
      state.interestRateApr,
      state.pmiMonthly,
      state.propertyTaxAnnual,
      state.termYears,
    ]
  );

  function exportExcel() {
    downloadScenarioExcel(state);
    setToast({
      message: "Exported property-pro-scenario.xlsx.",
      severity: "success",
    });
  }

  function saveScenario() {
    saveToBrowser();
    setToast({ message: "Scenario saved in this browser.", severity: "success" });
  }

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "transparent" }}>
      <Box
        component="header"
        sx={{
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: (t) =>
            t.palette.mode === "light" ? alpha("#fbfcfb", 0.72) : alpha("#15201c", 0.82),
          backdropFilter: "blur(14px)",
        }}
      >
        <Container maxWidth="lg" sx={{ py: { xs: 2.5, sm: 3.5 } }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={{ xs: 2.5, md: 4 }}
            alignItems={{ md: "flex-end" }}
            justifyContent="space-between"
          >
            <Box className="pp-rise" sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                component="h1"
                sx={{
                  fontFamily: "var(--pp-font-display)",
                  fontWeight: 800,
                  fontSize: { xs: "2.55rem", sm: "3.4rem", md: "3.85rem" },
                  letterSpacing: "-0.045em",
                  lineHeight: 0.95,
                  color: "text.primary",
                  mb: 1.25,
                }}
              >
                Property Pro
              </Typography>
              <Typography
                className="pp-rise-delay"
                variant="body1"
                color="text.secondary"
                sx={{
                  maxWidth: 420,
                  fontSize: { xs: "1rem", sm: "1.08rem" },
                  lineHeight: 1.45,
                  mb: 2,
                }}
              >
                Model the payment, cash to close, rental yield, and exit — one scenario, yours to keep.
              </Typography>
              <Stack
                className="pp-rise-delay"
                direction="row"
                spacing={1}
                flexWrap="wrap"
                useFlexGap
                alignItems="center"
              >
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<SaveOutlinedIcon />}
                  onClick={saveScenario}
                  aria-label="Save scenario"
                  sx={{ minHeight: 44, px: 2.25 }}
                >
                  Save
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<FileDownloadOutlinedIcon />}
                  onClick={exportExcel}
                  aria-label="Export scenario to Excel"
                  sx={{ minHeight: 44 }}
                >
                  Export Excel
                </Button>
                <Tooltip title="Reset to defaults">
                  <IconButton onClick={reset} aria-label="reset scenario">
                    <RestartAltIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={isDark ? "Light mode" : "Dark mode"}>
                  <IconButton
                    onClick={() => setMode(isDark ? "light" : "dark")}
                    aria-label="toggle color mode"
                  >
                    {isDark ? (
                      <LightModeOutlinedIcon fontSize="small" />
                    ) : (
                      <DarkModeOutlinedIcon fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>

            <Box
              className="pp-metric-pop"
              sx={{
                flexShrink: 0,
                minWidth: { xs: "100%", md: 280 },
                maxWidth: { md: 320 },
                pl: { md: 3 },
                borderLeft: { md: "1px solid" },
                borderColor: { md: "divider" },
                pt: { xs: 1.5, md: 0 },
                borderTop: { xs: "1px solid", md: "none" },
              }}
            >
              <Typography
                variant="overline"
                sx={{ color: "secondary.dark", display: "block", mb: 0.5 }}
              >
                Estimated / month
              </Typography>
              <Typography
                sx={{
                  fontFamily: "var(--pp-font-display)",
                  fontWeight: 800,
                  fontSize: { xs: "2.4rem", sm: "2.75rem" },
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {moneyDec.format(payment.total)}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 1, lineHeight: 1.4, maxWidth: 280 }}
              >
                {state.interestRateApr}% APR · {state.termYears}-year ·{" "}
                {moneyDec.format(payment.loanAmount)} loan
              </Typography>
            </Box>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ pb: { xs: 3, sm: 4 } }}>
        <Box
          role="tablist"
          aria-label="Main sections"
          className="pp-fade-in"
          sx={{
            display: "flex",
            gap: { xs: 0.5, sm: 1.5 },
            mt: { xs: 2, sm: 2.5 },
            mb: 0.5,
            borderBottom: "1px solid",
            borderColor: "divider",
            overflowX: "auto",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {TABS.map(({ label, id }, i) => {
            const selected = tab === i;
            return (
              <Button
                key={id}
                size="medium"
                disableElevation
                id={`tab-${id}`}
                aria-controls={`tabpanel-${id}`}
                aria-selected={selected}
                role="tab"
                onClick={() => setTab(i)}
                sx={{
                  position: "relative",
                  py: 1.35,
                  px: { xs: 1.25, sm: 1.75 },
                  minWidth: "auto",
                  borderRadius: 0,
                  bgcolor: "transparent !important",
                  boxShadow: "none !important",
                  color: selected ? "text.primary" : "text.secondary",
                  fontWeight: selected ? 700 : 600,
                  fontSize: { xs: "0.9rem", sm: "1rem" },
                  letterSpacing: "-0.02em",
                  whiteSpace: "nowrap",
                  "&::after": {
                    content: '""',
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 2,
                    bgcolor: "secondary.main",
                    transform: selected ? "scaleX(1)" : "scaleX(0)",
                    transformOrigin: "left center",
                    transition: "transform 0.28s var(--pp-ease, ease)",
                  },
                  "&:hover": {
                    color: "text.primary",
                    bgcolor: "transparent",
                  },
                }}
              >
                {label}
              </Button>
            );
          })}
        </Box>

        <Box
          role="tabpanel"
          hidden={tab !== 0}
          id="tabpanel-mortgage"
          aria-labelledby="tab-mortgage"
          className={tab === 0 ? "pp-fade-in" : undefined}
        >
          {tab === 0 ? <MortgageTab state={state} patch={patch} /> : null}
        </Box>
        <Box
          role="tabpanel"
          hidden={tab !== 1}
          id="tabpanel-upfront"
          aria-labelledby="tab-upfront"
          className={tab === 1 ? "pp-fade-in" : undefined}
        >
          {tab === 1 ? <UpfrontCashTab state={state} patch={patch} /> : null}
        </Box>
        <Box
          role="tabpanel"
          hidden={tab !== 2}
          id="tabpanel-rental"
          aria-labelledby="tab-rental"
          className={tab === 2 ? "pp-fade-in" : undefined}
        >
          {tab === 2 ? <RentalTab state={state} patch={patch} /> : null}
        </Box>
        <Box
          role="tabpanel"
          hidden={tab !== 3}
          id="tabpanel-sell"
          aria-labelledby="tab-sell"
          className={tab === 3 ? "pp-fade-in" : undefined}
        >
          {tab === 3 ? <WhenToSellTab state={state} patch={patch} /> : null}
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ lineHeight: 1.5, pt: 3, pb: 1, maxWidth: 640 }}
        >
          Estimates only — not an offer or advice. One shared scenario across tabs; edits auto-save
          locally. Export Excel for an offline workbook.
        </Typography>
      </Container>

      <Snackbar
        open={toast != null}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setToast(null)}
          severity={toast?.severity ?? "success"}
          variant="filled"
          sx={{ width: "100%", bgcolor: "primary.main" }}
        >
          {toast?.message ?? ""}
        </Alert>
      </Snackbar>
    </Box>
  );
}
