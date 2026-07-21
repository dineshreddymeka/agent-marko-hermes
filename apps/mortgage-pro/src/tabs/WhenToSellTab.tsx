import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import Paper from "@mui/material/Paper";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha, type Theme } from "@mui/material/styles";
import { useMemo, useState, type ReactNode } from "react";
import { MortgageInputsFields } from "../components/MortgageInputsFields";
import { computeMonthlyPayment } from "../lib/mortgageMath";
import {
  cashFlowAnnualFromYieldToggles,
  computeRentalAnalysis,
  cumulativeCashFlowThroughExitMonths,
  RENTAL_YIELD_PI_ID,
  RENTAL_YIELD_PMI_ID,
} from "../lib/rentalMath";
import {
  buildRealWealthExitSnapshots,
  buildSellYearlyRows,
  futureHomeValue,
  REAL_WEALTH_MILESTONE_YEARS,
  type RealWealthExitSnapshot,
} from "../lib/whenToSellMath";
import type { AppPersisted } from "../storage/mortgageState";

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function signedMoney(n: number): string {
  if (!Number.isFinite(n)) return money.format(0);
  if (n < 0) return `−${money.format(Math.abs(n))}`;
  return money.format(n);
}

/** Prefix + for positive amounts in running totals (zero stays plain). */
function plusMoney(n: number): string {
  if (!Number.isFinite(n)) return money.format(0);
  if (n < 0) return signedMoney(n);
  if (n === 0) return money.format(0);
  return `+${money.format(n)}`;
}

function formatNumberField(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value);
}

function formatPercentField(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}

/** Total gain as % of upfront cash invested (down + closing + misc). */
function formatGainVsCashInPct(gain: number, cashIn: number): string {
  if (!Number.isFinite(gain) || !Number.isFinite(cashIn) || cashIn <= 0) return "—";
  const raw = (gain / cashIn) * 100;
  const rounded = Math.round(raw * 10) / 10;
  const abs = Math.abs(rounded);
  const body = abs % 1 === 0 ? String(Math.round(abs)) : abs.toFixed(1);
  if (rounded > 0) return `+${body}%`;
  if (rounded < 0) return `−${body}%`;
  return "0%";
}

/** Text color for signed P&amp;L-style amounts (gain / loss / flat). */
function plTextColor(theme: Theme, n: number): string {
  if (n > 0) return theme.palette.mode === "dark" ? theme.palette.success.light : theme.palette.success.dark;
  if (n < 0) return theme.palette.mode === "dark" ? theme.palette.error.light : theme.palette.error.dark;
  return theme.palette.text.secondary;
}

/** Bordered accordion used across When to sell sections. */
const sectionAccordionSx = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 1,
  overflow: "hidden",
  bgcolor: "transparent",
  "&:before": { display: "none" },
  boxShadow: "none",
  "&.Mui-expanded": {
    borderColor: "secondary.main",
    boxShadow: "none",
  },
} as const;

const sectionAccordionSummarySx = {
  px: { xs: 1, sm: 1.25 },
  py: { xs: 0.5, sm: 0.4 },
  minHeight: { xs: 48, sm: 44 },
  alignItems: "center",
  transition: "background-color 0.15s ease",
  "&:hover": { bgcolor: "action.hover" },
  "& .MuiAccordionSummary-content": { my: 0.5, overflow: "hidden", minWidth: 0, width: "100%" },
} as const;

/** Net sale proceeds cell: green when cash-out, red when zero/underwater. */
function saleProceedsCellSx(n: number) {
  return (theme: Theme) => {
    const strong = theme.palette.mode === "dark" ? 0.14 : 0.09;
    if (n <= 0)
      return {
        fontVariantNumeric: "tabular-nums" as const,
        fontWeight: 600,
        bgcolor: alpha(theme.palette.error.main, strong),
        color: plTextColor(theme, -1),
      };
    return {
      fontVariantNumeric: "tabular-nums" as const,
      fontWeight: 600,
      bgcolor: alpha(theme.palette.success.main, strong),
      color: plTextColor(theme, 1),
    };
  };
}

/** Full-width row: click anywhere to toggle include/exclude in gain math. */
function YieldGainToggleRow(props: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  detail: ReactNode;
}) {
  return (
    <ListItemButton
      role="checkbox"
      aria-checked={props.checked}
      onClick={() => props.onToggle()}
      sx={{
        alignItems: "flex-start",
        py: { xs: 1.1, sm: 1 },
        px: { xs: 1, sm: 1.25 },
        mb: 0.65,
        borderRadius: 1.25,
        border: "1px solid",
        borderColor: "divider",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        "&:hover": { bgcolor: "action.hover" },
        "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
      }}
    >
      <ListItemIcon sx={{ minWidth: 44, mt: 0.2 }}>
        <Checkbox
          size="medium"
          edge="start"
          checked={props.checked}
          tabIndex={-1}
          disableRipple
          sx={{ p: 0.35, pointerEvents: "none" }}
        />
      </ListItemIcon>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
          gap: { xs: 0.65, sm: 1.5 },
          pr: { xs: 0, sm: 0.5 },
        }}
      >
        <Typography
          variant="body2"
          sx={{ fontSize: { xs: "0.875rem", sm: "0.9rem" }, fontWeight: 600, lineHeight: 1.35 }}
        >
          {props.title}
        </Typography>
        <Box
          sx={{
            textAlign: { xs: "left", sm: "right" },
            alignSelf: { xs: "stretch", sm: "auto" },
            width: { xs: "100%", sm: "auto" },
          }}
        >
          {props.detail}
        </Box>
      </Box>
    </ListItemButton>
  );
}

export type WhenToSellTabProps = {
  state: AppPersisted;
  patch: (partial: Partial<AppPersisted>) => void;
};

export function WhenToSellTab({ state, patch }: WhenToSellTabProps) {
  const [rentDraft, setRentDraft] = useState<string | null>(null);
  const loanAmount = Math.max(0, state.homePrice - state.downPayment);
  const apr = state.interestRateApr;
  const basePrice = Math.max(0, state.homePrice);

  /** Sale / net-proceeds detail row follows Mortgage tab loan term (clamped 1–30 yr). */
  const exitHorizonYears = Math.min(30, Math.max(1, Math.round(state.termYears)));

  const appreciationPct = state.sellAnnualAppreciationPercent;
  const sellingCostPct = state.sellClosingCostPercent;
  const yearsOwnedClamped = Math.max(1, Math.round(state.yearsOwned));
  /** Value from scenario purchase × implied compound rate × years (sanity-check vs your present value). */
  const calculatedPresentHomeValue = useMemo(
    () => futureHomeValue(basePrice, appreciationPct, yearsOwnedClamped),
    [basePrice, appreciationPct, yearsOwnedClamped]
  );

  const monthly30 = useMemo(
    () =>
      computeMonthlyPayment(
        state.homePrice,
        state.downPayment,
        apr,
        30,
        state.propertyTaxAnnual,
        state.insuranceAnnual,
        state.hoaMonthly,
        state.pmiMonthly
      ),
    [
      state.homePrice,
      state.downPayment,
      apr,
      state.propertyTaxAnnual,
      state.insuranceAnnual,
      state.hoaMonthly,
      state.pmiMonthly,
    ]
  );

  const monthly15 = useMemo(
    () =>
      computeMonthlyPayment(
        state.homePrice,
        state.downPayment,
        apr,
        15,
        state.propertyTaxAnnual,
        state.insuranceAnnual,
        state.hoaMonthly,
        state.pmiMonthly
      ),
    [
      state.homePrice,
      state.downPayment,
      apr,
      state.propertyTaxAnnual,
      state.insuranceAnnual,
      state.hoaMonthly,
      state.pmiMonthly,
    ]
  );

  const monthlyUserTerm = useMemo(
    () =>
      computeMonthlyPayment(
        state.homePrice,
        state.downPayment,
        apr,
        exitHorizonYears,
        state.propertyTaxAnnual,
        state.insuranceAnnual,
        state.hoaMonthly,
        state.pmiMonthly
      ),
    [
      state.homePrice,
      state.downPayment,
      apr,
      exitHorizonYears,
      state.propertyTaxAnnual,
      state.insuranceAnnual,
      state.hoaMonthly,
      state.pmiMonthly,
    ]
  );

  const rental30Path = useMemo(() => computeRentalAnalysis(state, monthly30), [state, monthly30]);
  const rental15Path = useMemo(() => computeRentalAnalysis(state, monthly15), [state, monthly15]);
  const rentalUserTermPath = useMemo(
    () => computeRentalAnalysis(state, monthlyUserTerm),
    [state, monthlyUserTerm]
  );
  /** Extra columns when the Mortgage tab term is not exactly 15 or 30 (those match the comparison paths). */
  const showUserTermColumn = exitHorizonYears !== 15 && exitHorizonYears !== 30;
  const initialCashInvested = rental30Path.initialCashInvested;

  const yieldCf30Annual = useMemo(
    () => cashFlowAnnualFromYieldToggles(rental30Path, state.sellRentalYieldInclude),
    [rental30Path, state.sellRentalYieldInclude]
  );
  const yieldCf15Annual = useMemo(
    () => cashFlowAnnualFromYieldToggles(rental15Path, state.sellRentalYieldInclude),
    [rental15Path, state.sellRentalYieldInclude]
  );

  /** Cumulative rent cash in gain math: P&amp;I only while that amortization is still active (then NOI-only months). */
  const cumulativeRentByExitYear = useMemo(() => {
    const maxY = 30;
    const path30: number[] = new Array(maxY + 1).fill(0);
    const path15: number[] = new Array(maxY + 1).fill(0);
    const pathUserTerm: number[] = new Array(maxY + 1).fill(0);
    for (let y = 1; y <= maxY; y++) {
      const m = y * 12;
      path30[y] = cumulativeCashFlowThroughExitMonths(
        rental30Path,
        state.sellRentalYieldInclude,
        30,
        m
      );
      path15[y] = cumulativeCashFlowThroughExitMonths(
        rental15Path,
        state.sellRentalYieldInclude,
        15,
        m
      );
      pathUserTerm[y] = cumulativeCashFlowThroughExitMonths(
        rentalUserTermPath,
        state.sellRentalYieldInclude,
        exitHorizonYears,
        m
      );
    }
    return { path30, path15, pathUserTerm };
  }, [
    rental30Path,
    rental15Path,
    rentalUserTermPath,
    exitHorizonYears,
    state.sellRentalYieldInclude,
  ]);

  function setYieldIncluded(id: string, on: boolean) {
    const excl: Record<string, boolean> = {};
    if (state.sellRentalYieldInclude) {
      for (const [k, v] of Object.entries(state.sellRentalYieldInclude)) {
        if (v === false) excl[k] = false;
      }
    }
    if (on) delete excl[id];
    else excl[id] = false;
    patch({ sellRentalYieldInclude: Object.keys(excl).length > 0 ? excl : undefined });
  }

  const yieldIncluded = (id: string) => state.sellRentalYieldInclude?.[id] !== false;

  const upfrontDown = Math.max(0, state.downPayment);
  const upfrontClosing = Math.max(0, state.closingCosts);
  const upfrontMisc = Math.max(0, state.miscInitialCash);
  const upfrontTotal = upfrontDown + upfrontClosing + upfrontMisc;

  const rows = useMemo(
    () =>
      buildSellYearlyRows(
        loanAmount,
        apr,
        basePrice,
        appreciationPct,
        sellingCostPct,
        30,
        exitHorizonYears
      ),
    [loanAmount, apr, basePrice, appreciationPct, sellingCostPct, exitHorizonYears]
  );

  const wealthSnapshots = useMemo(
    () =>
      buildRealWealthExitSnapshots(
        state,
        loanAmount,
        apr,
        rows,
        REAL_WEALTH_MILESTONE_YEARS,
        state.sellRentalYieldInclude
      ),
    [state, loanAmount, apr, rows]
  );

  const totalGainHeadingYears = useMemo(() => {
    const ys = [...REAL_WEALTH_MILESTONE_YEARS];
    const mid = Math.ceil(ys.length / 2);
    return { line1: ys.slice(0, mid).join(", "), line2: ys.slice(mid).join(", ") };
  }, []);

  return (
    <Stack spacing={0.75}>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
        Uses your <strong>Mortgage</strong> numbers (price, down payment, interest rate) and your <strong>Rental</strong>{" "}
        income and costs — editable below. We compare the <strong>same loan size</strong> on a <strong>30-year</strong>{" "}
        payment plan vs a <strong>15-year</strong> plan. In real life 15-year rates are often lower — adjust APR here or
        on Mortgage.
      </Typography>

      <Paper variant="outlined" elevation={0} sx={{ borderRadius: 1, overflow: "hidden", boxShadow: "none", bgcolor: "transparent" }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          columnGap={1}
          rowGap={0}
          sx={{
            px: 1.25,
            py: 0.65,
            minHeight: 36,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "transparent",
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: "0.8rem", lineHeight: 1.2 }}>
            Upfront &amp; financing
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.62rem", lineHeight: 1.2 }}>
            Syncs Mortgage/Rental · expand a box to edit
          </Typography>
        </Stack>

        <Grid container columnSpacing={0.75} rowSpacing={0.5} sx={{ px: 0.75, pt: 0.5, pb: 0.25 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Accordion defaultExpanded={false} disableGutters elevation={0} sx={sectionAccordionSx}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ fontSize: "1.1rem" }} />}
                sx={{
                  px: 0.75,
                  py: 0,
                  alignItems: "center",
                  minHeight: 36,
                  maxHeight: 36,
                  "& .MuiAccordionSummary-expandIconWrapper": { mr: -0.25 },
                  "& .MuiAccordionSummary-content": { my: 0, overflow: "hidden" },
                }}
              >
                <Typography
                  component="div"
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    lineHeight: 1.2,
                    fontSize: "0.68rem",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={`Purchase ${money.format(basePrice)} · Down ${money.format(upfrontDown)} · Closing ${money.format(upfrontClosing)} · Misc ${money.format(upfrontMisc)} · Total upfront ${money.format(upfrontTotal)}`}
                >
                  <Box component="span" sx={{ fontWeight: 700, color: "text.primary", mr: 0.35 }}>
                    Upfront
                  </Box>
                  Price{" "}
                  <Box component="span" sx={{ color: "text.primary", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {money.format(basePrice)}
                  </Box>
                  {" · "}D{" "}
                  <Box component="span" sx={{ color: "text.primary", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {money.format(upfrontDown)}
                  </Box>
                  {" · "}Closing{" "}
                  <Box component="span" sx={{ color: "text.primary", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {money.format(upfrontClosing)}
                  </Box>
                  {" · "}M{" "}
                  <Box component="span" sx={{ color: "text.primary", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {money.format(upfrontMisc)}
                  </Box>
                  {" · "}
                  <Box component="span" sx={{ fontWeight: 700, color: "text.primary", fontVariantNumeric: "tabular-nums" }}>
                    Tot {money.format(upfrontTotal)}
                  </Box>
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0.75, pt: 0, pb: 0.5, borderTop: 1, borderColor: "divider" }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 0.5, lineHeight: 1.35, fontSize: "0.72rem" }}
                >
                  Purchase price and down payment are under <strong>Financing</strong> (same fields as Mortgage).
                </Typography>
                <Grid container spacing={0.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Closing (at purchase)"
                      size="small"
                      fullWidth
                      value={formatNumberField(state.closingCosts)}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                        if (Number.isFinite(n)) patch({ closingCosts: Math.max(0, n) });
                      }}
                      slotProps={{
                        input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Misc one-time cash"
                      size="small"
                      fullWidth
                      value={formatNumberField(state.miscInitialCash)}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                        if (Number.isFinite(n)) patch({ miscInitialCash: Math.max(0, n) });
                      }}
                      slotProps={{
                        input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                      }}
                    />
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      label="Total upfront (read-only)"
                      size="small"
                      fullWidth
                      value={money.format(upfrontTotal)}
                      slotProps={{ input: { readOnly: true } }}
                    />
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Accordion defaultExpanded={false} disableGutters elevation={0} sx={sectionAccordionSx}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ fontSize: "1.1rem" }} />}
                sx={{
                  px: 0.75,
                  py: 0,
                  alignItems: "center",
                  minHeight: 36,
                  maxHeight: 36,
                  "& .MuiAccordionSummary-expandIconWrapper": { mr: -0.25 },
                  "& .MuiAccordionSummary-content": { my: 0, overflow: "hidden" },
                }}
              >
                <Typography
                  component="div"
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    lineHeight: 1.2,
                    fontSize: "0.68rem",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={`${money.format(basePrice)} ${state.downPaymentPercent.toFixed(1)}% ${money.format(loanAmount)} ${apr.toFixed(2)}% ${state.termYears}y PI30 ${money.format(monthly30.principalAndInterest)} PI15 ${money.format(monthly15.principalAndInterest)} TIH ${money.format(monthly30.propertyTax + monthly30.insurance + monthly30.hoa)}`}
                >
                  <Box component="span" sx={{ fontWeight: 700, color: "text.primary", mr: 0.35 }}>
                    Financing
                  </Box>
                  {money.format(basePrice)} · {state.downPaymentPercent.toFixed(1)}% · Ln {money.format(loanAmount)} ·{" "}
                  {apr.toFixed(2)}% · {state.termYears}y · PI30 {money.format(monthly30.principalAndInterest)} · PI15{" "}
                  {money.format(monthly15.principalAndInterest)} · TIH{" "}
                  {money.format(monthly30.propertyTax + monthly30.insurance + monthly30.hoa)}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0.75, pt: 0, pb: 0.5, borderTop: 1, borderColor: "divider" }}>
                <MortgageInputsFields
                  state={state}
                  patch={patch}
                  inputSize="small"
                  purchasePriceHelperText="Loan size, sale baseline, and rental carrying costs (tax/insurance/HOA)"
                />
                <Grid container spacing={0.5} sx={{ mt: 0.25 }}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Loan amount (read-only)"
                      size="small"
                      fullWidth
                      value={money.format(loanAmount)}
                      slotProps={{ input: { readOnly: true } }}
                    />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 0.65 }} />

            <Stack spacing={0.35}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
                <Typography variant="body2" color="text.secondary">
                  Principal &amp; interest (30-yr)
                </Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {money.format(monthly30.principalAndInterest)}/mo
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
                <Typography variant="body2" color="text.secondary">
                  Principal &amp; interest (15-yr)
                </Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {money.format(monthly15.principalAndInterest)}/mo
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35, pt: 0.25, fontSize: "0.72rem" }}>
                Tax, insurance, HOA ({money.format(monthly30.propertyTax + monthly30.insurance + monthly30.hoa)}/mo) — edit on{" "}
                <strong>Mortgage</strong>.
              </Typography>
            </Stack>
              </AccordionDetails>
            </Accordion>
          </Grid>
        </Grid>

        <Grid
          container
          columnSpacing={0.75}
          rowSpacing={0.75}
          sx={{
            px: 0.75,
            pb: 0.75,
            pt: 0.35,
            borderTop: 1,
            borderColor: "divider",
            alignItems: "flex-start",
          }}
        >
          <Grid size={{ xs: 12, sm: 6 }} sx={{ minWidth: 0 }}>
            <Accordion defaultExpanded={false} disableGutters elevation={0} sx={{ ...sectionAccordionSx, width: "100%" }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ fontSize: "1.15rem" }} />}
                sx={sectionAccordionSummarySx}
              >
                <Box sx={{ minWidth: 0, width: "100%", pr: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, fontSize: "0.8rem", display: "block", lineHeight: 1.2 }}>
                    At sale (modeled)
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: "block",
                      fontSize: "0.68rem",
                      lineHeight: 1.25,
                      mt: 0.25,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={`${Number.isFinite(appreciationPct) ? appreciationPct.toFixed(2) : "0"}% implied · present ${money.format(state.currentHomeValue)} · ${sellingCostPct}% closing · ${yearsOwnedClamped} yr held`}
                  >
                    {Number.isFinite(appreciationPct) ? appreciationPct.toFixed(2) : "0"}% implied · present{" "}
                    {money.format(state.currentHomeValue)} · {sellingCostPct}% closing · {yearsOwnedClamped} yr
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails
                sx={{ px: 0.75, pt: 0.5, pb: 0.75, borderTop: 1, borderColor: "divider" }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35, fontSize: "0.72rem", display: "block", mb: 0.75 }}>
                  Implied <strong>appreciation</strong> from purchase ({money.format(basePrice)}), <strong>years</strong>, and{" "}
                  <strong>present value</strong>. <strong>Calculated value</strong> = purchase × (1 + rate)
                  <sup>{yearsOwnedClamped}</sup> — should match your present value. Same rate drives projections below.
                </Typography>
                <Grid container spacing={0.5}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      label="Annual appreciation (implied)"
                      size="small"
                      fullWidth
                      value={Number.isFinite(appreciationPct) ? appreciationPct.toFixed(2) : "0"}
                      helperText="Compound %/yr"
                      slotProps={{
                        input: {
                          readOnly: true,
                          endAdornment: <InputAdornment position="end">%</InputAdornment>,
                        },
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      label="Years since purchase"
                      size="small"
                      fullWidth
                      value={String(state.yearsOwned)}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                        if (Number.isFinite(n)) {
                          patch({ yearsOwned: Math.min(80, Math.max(1, Math.round(n))) });
                        }
                      }}
                      helperText="Min 1 yr"
                      slotProps={{ input: { inputMode: "numeric" } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      label="Closing cost at sale"
                      size="small"
                      fullWidth
                      value={String(sellingCostPct)}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                        if (Number.isFinite(n)) {
                          patch({ sellClosingCostPercent: Math.min(15, Math.max(0, n)) });
                        }
                      }}
                      helperText="% of sale price"
                      slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                    />
                  </Grid>
                  <Grid size={12}>
                    <Paper
                      variant="outlined"
                      elevation={0}
                      sx={{
                        p: 1,
                        borderRadius: 1,
                        boxShadow: "none",
                        bgcolor: "transparent",
                        borderColor: "divider",
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 700, fontSize: "0.7rem", display: "block", mb: 0.5, letterSpacing: "0.02em" }}
                      >
                        Present value — calculated vs yours
                      </Typography>
                      <Grid container spacing={0.5}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField
                            label="Calculated home value"
                            size="small"
                            fullWidth
                            value={money.format(Math.round(calculatedPresentHomeValue))}
                            helperText={`× (1 + ${Number.isFinite(appreciationPct) ? appreciationPct.toFixed(2) : "0"}%) ^ ${yearsOwnedClamped}`}
                            slotProps={{ input: { readOnly: true } }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <TextField
                            label="Present home value"
                            size="small"
                            fullWidth
                            value={formatNumberField(state.currentHomeValue)}
                            onChange={(e) => {
                              const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                              if (Number.isFinite(n)) patch({ currentHomeValue: Math.max(0, Math.round(n)) });
                            }}
                            helperText="Your market value"
                            slotProps={{
                              input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                            }}
                          />
                        </Grid>
                      </Grid>
                    </Paper>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }} sx={{ minWidth: 0 }}>
            <Accordion defaultExpanded={false} disableGutters elevation={0} sx={{ ...sectionAccordionSx, width: "100%" }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon sx={{ fontSize: "1.15rem" }} />}
                sx={sectionAccordionSummarySx}
              >
                <Box sx={{ minWidth: 0, width: "100%", pr: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, fontSize: "0.8rem", display: "block", lineHeight: 1.2 }}>
                    Rental yield in total gain
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: "block",
                      fontSize: "0.68rem",
                      lineHeight: 1.3,
                      mt: 0.25,
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                    }}
                  >
                    Rent {money.format(state.monthlyRent)}/mo · cap {(rental30Path.capRate * 100).toFixed(2)}% · modeled CF{" "}
                    {money.format(yieldCf30Annual / 12)}/mo (30) · {money.format(yieldCf15Annual / 12)}/mo (15)
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0.75, pt: 0.5, pb: 0.75, borderTop: 1, borderColor: "divider" }}>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35, fontSize: "0.72rem", display: "block", mb: 0.65 }}>
                  Same scenario as the Rental tab. Fields below; then expand <strong>What counts in gain</strong> for checkboxes.
                </Typography>
                <Grid container spacing={0.5} sx={{ mb: 0.75 }}>
                  <Grid size={12}>
                    <TextField
                      label="Monthly rent"
                      size="small"
                      fullWidth
                      value={rentDraft !== null ? rentDraft : formatNumberField(state.monthlyRent)}
                      onChange={(e) => setRentDraft(e.target.value.replace(/[^0-9]/g, ""))}
                      onFocus={() => setRentDraft(formatNumberField(state.monthlyRent))}
                      onBlur={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, "");
                        setRentDraft(null);
                        if (digits === "") return;
                        const n = Math.round(Number(digits));
                        if (!Number.isFinite(n)) return;
                        patch({ monthlyRent: Math.min(999_999, Math.max(0, n)) });
                      }}
                      helperText="$0–999,999/mo · saves on blur"
                      slotProps={{
                        input: {
                          startAdornment: <InputAdornment position="start">$</InputAdornment>,
                          inputMode: "numeric",
                        },
                      }}
                    />
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      label="Other income"
                      size="small"
                      fullWidth
                      value={formatNumberField(state.otherMonthlyIncome)}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                        if (Number.isFinite(n)) patch({ otherMonthlyIncome: Math.min(3_000, Math.max(0, Math.round(n))) });
                      }}
                      helperText="0–3,000/mo · GSI with rent"
                      slotProps={{
                        input: {
                          startAdornment: <InputAdornment position="start">$</InputAdornment>,
                          inputMode: "numeric",
                        },
                      }}
                    />
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      label="Vacancy"
                      size="small"
                      fullWidth
                      value={formatPercentField(state.vacancyRatePercent)}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                        if (Number.isFinite(n)) patch({ vacancyRatePercent: Math.min(100, Math.max(0, n)) });
                      }}
                      helperText="0–100% · applied to GSI"
                      slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                    />
                  </Grid>
                </Grid>
                <Accordion defaultExpanded={false} disableGutters elevation={0} sx={{ ...sectionAccordionSx, width: "100%" }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: "1.1rem" }} />} sx={sectionAccordionSummarySx}>
                    <Typography variant="caption" sx={{ fontWeight: 700, fontSize: "0.78rem" }}>
                      What counts in gain — checkboxes
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ px: 0.5, pt: 0.25, pb: 0.85 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mb: 0.85, lineHeight: 1.4, fontSize: "0.72rem" }}
                    >
                      Tap a row to include or exclude it (full row is clickable).
                    </Typography>
                    <List dense disablePadding sx={{ width: "100%", maxWidth: "100%" }}>
                      <YieldGainToggleRow
                        checked={yieldIncluded(RENTAL_YIELD_PI_ID)}
                        onToggle={() => setYieldIncluded(RENTAL_YIELD_PI_ID, !yieldIncluded(RENTAL_YIELD_PI_ID))}
                        title="Principal & interest"
                        detail={
                          <Typography
                            component="div"
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              fontSize: { xs: "0.8125rem", sm: "0.875rem" },
                              fontVariantNumeric: "tabular-nums",
                              lineHeight: 1.45,
                            }}
                          >
                            {money.format(rental30Path.principalAndInterestMonthly)}/mo (30-yr) ·{" "}
                            {money.format(rental15Path.principalAndInterestMonthly)}/mo (15-yr)
                          </Typography>
                        }
                      />
                      {rental30Path.pmiMonthly > 0.001 ? (
                        <YieldGainToggleRow
                          checked={yieldIncluded(RENTAL_YIELD_PMI_ID)}
                          onToggle={() => setYieldIncluded(RENTAL_YIELD_PMI_ID, !yieldIncluded(RENTAL_YIELD_PMI_ID))}
                          title="PMI"
                          detail={
                            <Typography
                              component="div"
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                fontSize: { xs: "0.8125rem", sm: "0.875rem" },
                                fontVariantNumeric: "tabular-nums",
                                lineHeight: 1.45,
                              }}
                            >
                              {money.format(rental30Path.pmiMonthly)}/mo
                            </Typography>
                          }
                        />
                      ) : null}
                      {rental30Path.operatingExpenseLines.map((line) => (
                        <YieldGainToggleRow
                          key={line.id}
                          checked={yieldIncluded(line.id)}
                          onToggle={() => setYieldIncluded(line.id, !yieldIncluded(line.id))}
                          title={line.label}
                          detail={
                            <Typography
                              component="div"
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                fontSize: { xs: "0.8125rem", sm: "0.875rem" },
                                fontVariantNumeric: "tabular-nums",
                                lineHeight: 1.45,
                              }}
                            >
                              {money.format(line.amount)}/mo
                            </Typography>
                          }
                        />
                      ))}
                    </List>
                  </AccordionDetails>
                </Accordion>
              </AccordionDetails>
            </Accordion>
          </Grid>
        </Grid>
      </Paper>

      <Stack spacing={0.75}>
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.25, lineHeight: 1.4 }}>
          <strong>Your total gain</strong> = sale cash + cumulative monthly rent (while the loan is active: yield toggles
          and NOI − P&amp;I; <strong>after payoff</strong>: effective gross income only — vacancy applied,{" "}
          <strong>no</strong> property operating expenses or P&amp;I) − upfront cash (down, closing, misc).{" "}
          <strong>Gain %</strong> is total gain / upfront cash (not annualized).
        </Typography>

        <Box sx={{ px: 0.25 }}>
          <Typography variant="subtitle2" component="div" sx={{ fontWeight: 600, lineHeight: 1.35 }}>
            Your total gain by exit year ({totalGainHeadingYears.line1},
            <br />
            {totalGainHeadingYears.line2})
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4, display: "block", mt: 0.25, mb: 0.5 }}>
            Each card is <strong>if you sold after that many years</strong> from purchase (3, 5, 7… — not your{" "}
            <strong>Years since purchase</strong> field, which only helps set implied appreciation).{" "}
            <strong>Your total gain</strong> (bottom row) is green when the full outcome is positive, red when negative:
            sale proceeds + cumulative rent through that exit − upfront cash. The <strong>Rent</strong> row can be amber
            (negative cumulative operating cash) while total gain is still green if sale proceeds are large enough.{" "}
            <strong>Left border + chip</strong> summarize the 30-yr vs 15-yr comparison only.
          </Typography>
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75} sx={{ mb: 0.75 }}>
            <Chip size="small" variant="outlined" color="success" label="Gain: both paths" sx={{ fontWeight: 600, borderRadius: 1 }} />
            <Chip size="small" variant="outlined" color="error" label="Loss: both paths" sx={{ fontWeight: 600, borderRadius: 1 }} />
            <Chip size="small" variant="outlined" color="warning" label="Mixed" sx={{ fontWeight: 600, borderRadius: 1 }} />
          </Stack>
        </Box>
        <Grid container spacing={1}>
          {wealthSnapshots.map((w) => (
            <Grid key={w.year} size={{ xs: 12, sm: 6, lg: 4 }}>
              <MilestoneWealthCard
                snapshot={w}
                showUserTermColumn={showUserTermColumn}
                userTermYears={exitHorizonYears}
              />
            </Grid>
          ))}
        </Grid>

        <Accordion
          variant="outlined"
          disableGutters
          elevation={0}
          sx={{ borderRadius: 1, boxShadow: "none", bgcolor: "transparent", "&:before": { display: "none" } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={sectionAccordionSummarySx}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Optional: interest paid to the bank and loan principal (detail only)
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.65, lineHeight: 1.4 }}>
              These rows are for curiosity. They are <strong>not</strong> extra subtractions from your total gain —
              interest is already counted inside your yearly rent line (via the mortgage payment).
            </Typography>
            <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Sell after</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Interest (30-yr)
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Interest (15-yr)
                    </TableCell>
                    {showUserTermColumn ? (
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        Interest ({exitHorizonYears}-yr)
                      </TableCell>
                    ) : null}
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Principal paid (30-yr)
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Principal paid (15-yr)
                    </TableCell>
                    {showUserTermColumn ? (
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        Principal paid ({exitHorizonYears}-yr)
                      </TableCell>
                    ) : null}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {wealthSnapshots.map((w) => (
                    <TableRow key={w.year}>
                      <TableCell>{w.year} yr</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {money.format(w.interestToBank30)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {money.format(w.interestToBank15)}
                      </TableCell>
                      {showUserTermColumn ? (
                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                          {money.format(w.interestToBankUserTerm)}
                        </TableCell>
                      ) : null}
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {money.format(w.principalPaidIntoLoan30)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {money.format(w.principalPaidIntoLoan15)}
                      </TableCell>
                      {showUserTermColumn ? (
                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                          {money.format(w.principalPaidIntoLoanUserTerm)}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      </Stack>

      <Card variant="outlined" elevation={0} sx={{ borderRadius: 1, boxShadow: "none", bgcolor: "transparent" }}>
        <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
          <Stack
            direction="row"
            alignItems="baseline"
            justifyContent="space-between"
            flexWrap="wrap"
            columnGap={1}
            rowGap={0.25}
            sx={{ mb: 0.75 }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Year-by-year projection
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.72rem", lineHeight: 1.35 }}>
              {appreciationPct}%/yr on price · {sellingCostPct}% closing at sale · edit in{" "}
              <strong>Upfront &amp; financing</strong>
            </Typography>
          </Stack>
          <TableContainer
            sx={{
              maxHeight: { xs: "min(42vh, 280px)", sm: "min(44vh, 320px)" },
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
            }}
          >
            <Table size="small" stickyHeader>
                <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper", py: 0.65 }}>Year</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "background.paper", py: 0.65 }}>
                    Est. value
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "background.paper", py: 0.65 }}>
                    Net 30
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "background.paper", py: 0.65 }}>
                    Net 15
                  </TableCell>
                  {showUserTermColumn ? (
                    <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "background.paper", py: 0.65 }}>
                      Net {exitHorizonYears}y
                    </TableCell>
                  ) : null}
                  <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "background.paper", py: 0.65 }}>
                    Gain 30
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "background.paper", py: 0.65 }}>
                    Gain 15
                  </TableCell>
                  {showUserTermColumn ? (
                    <TableCell align="right" sx={{ fontWeight: 700, bgcolor: "background.paper", py: 0.65 }}>
                      Gain {exitHorizonYears}y
                    </TableCell>
                  ) : null}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => {
                  const hi = r.year === exitHorizonYears;
                  const gainY30 =
                    r.netProceeds30 + cumulativeRentByExitYear.path30[r.year] - initialCashInvested;
                  const gainY15 =
                    r.netProceeds15 + cumulativeRentByExitYear.path15[r.year] - initialCashInvested;
                  const gainYUser =
                    r.netProceedsUserTerm + cumulativeRentByExitYear.pathUserTerm[r.year] - initialCashInvested;
                  return (
                    <TableRow
                      key={r.year}
                      sx={(theme) => ({
                        bgcolor: hi
                          ? alpha(theme.palette.secondary.main, theme.palette.mode === "dark" ? 0.14 : 0.1)
                          : undefined,
                        boxShadow: hi ? `inset 3px 0 0 ${theme.palette.secondary.main}` : undefined,
                        "&:hover": {
                          bgcolor: hi
                            ? alpha(theme.palette.secondary.main, theme.palette.mode === "dark" ? 0.18 : 0.12)
                            : "action.hover",
                        },
                      })}
                    >
                      <TableCell sx={{ fontWeight: hi ? 700 : 400, py: 0.45 }}>{r.year}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.45 }}>
                        {money.format(r.futureHomeValue)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={(theme) => ({ ...saleProceedsCellSx(r.netProceeds30)(theme), py: 0.45 })}
                      >
                        {money.format(r.netProceeds30)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={(theme) => ({ ...saleProceedsCellSx(r.netProceeds15)(theme), py: 0.45 })}
                      >
                        {money.format(r.netProceeds15)}
                      </TableCell>
                      {showUserTermColumn ? (
                        <TableCell
                          align="right"
                          sx={(theme) => ({ ...saleProceedsCellSx(r.netProceedsUserTerm)(theme), py: 0.45 })}
                        >
                          {money.format(r.netProceedsUserTerm)}
                        </TableCell>
                      ) : null}
                      <TableCell align="right" sx={{ verticalAlign: "top", py: 0.35 }}>
                        <Stack alignItems="flex-end" spacing={0}>
                          <Typography
                            variant="body2"
                            sx={(theme) => ({
                              fontWeight: 600,
                              fontVariantNumeric: "tabular-nums",
                              fontSize: "0.8125rem",
                              color: plTextColor(theme, gainY30),
                            })}
                          >
                            {signedMoney(gainY30)}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={(theme) => ({
                              fontWeight: 600,
                              fontVariantNumeric: "tabular-nums",
                              lineHeight: 1.1,
                              fontSize: "0.68rem",
                              color: plTextColor(theme, gainY30),
                            })}
                          >
                            {formatGainVsCashInPct(gainY30, initialCashInvested)}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="right" sx={{ verticalAlign: "top", py: 0.35 }}>
                        <Stack alignItems="flex-end" spacing={0}>
                          <Typography
                            variant="body2"
                            sx={(theme) => ({
                              fontWeight: 600,
                              fontVariantNumeric: "tabular-nums",
                              fontSize: "0.8125rem",
                              color: plTextColor(theme, gainY15),
                            })}
                          >
                            {signedMoney(gainY15)}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={(theme) => ({
                              fontWeight: 600,
                              fontVariantNumeric: "tabular-nums",
                              lineHeight: 1.1,
                              fontSize: "0.68rem",
                              color: plTextColor(theme, gainY15),
                            })}
                          >
                            {formatGainVsCashInPct(gainY15, initialCashInvested)}
                          </Typography>
                        </Stack>
                      </TableCell>
                      {showUserTermColumn ? (
                        <TableCell align="right" sx={{ verticalAlign: "top", py: 0.35 }}>
                          <Stack alignItems="flex-end" spacing={0}>
                            <Typography
                              variant="body2"
                              sx={(theme) => ({
                                fontWeight: 600,
                                fontVariantNumeric: "tabular-nums",
                                fontSize: "0.8125rem",
                                color: plTextColor(theme, gainYUser),
                              })}
                            >
                              {signedMoney(gainYUser)}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={(theme) => ({
                                fontWeight: 600,
                                fontVariantNumeric: "tabular-nums",
                                lineHeight: 1.1,
                                fontSize: "0.68rem",
                                color: plTextColor(theme, gainYUser),
                              })}
                            >
                              {formatGainVsCashInPct(gainYUser, initialCashInvested)}
                            </Typography>
                          </Stack>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, lineHeight: 1.35 }}>
            Highlighted row = <strong>Mortgage term</strong> ({exitHorizonYears} yr). Net = value − payoff −{" "}
            {sellingCostPct}% sale closing. Gain adds cumulative rent (yield toggles apply with loan; after payoff,{" "}
            <strong>EGI only</strong> — no OpEx). {showUserTermColumn ? (
              <>
                <strong>Net/Gain {exitHorizonYears}y</strong> matches your Mortgage tab term; 30 and 15 are comparisons.
              </>
            ) : exitHorizonYears === 15 ? (
              <>
                <strong>Gain 15</strong> matches your Mortgage tab term.
              </>
            ) : exitHorizonYears === 30 ? (
              <>
                <strong>Gain 30</strong> matches your Mortgage tab term.
              </>
            ) : null}{" "}
            % vs upfront cash.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}

type MilestoneScenario = "bothGain" | "bothLoss" | "mixed";

function milestoneScenario(g30: number, g15: number): MilestoneScenario {
  if (g30 >= 0 && g15 >= 0) return "bothGain";
  if (g30 < 0 && g15 < 0) return "bothLoss";
  return "mixed";
}

function MilestoneWealthCard(props: {
  snapshot: RealWealthExitSnapshot;
  showUserTermColumn: boolean;
  userTermYears: number;
}) {
  const w = props.snapshot;
  const showUser = props.showUserTermColumn;
  const ty = props.userTermYears;
  const g30 = w.realWealthMade30;
  const g15 = w.realWealthMade15;
  const gUser = w.realWealthMadeUserTerm;
  const scenario = milestoneScenario(g30, g15);

  const chipLabel =
    scenario === "bothGain" ? "Both gain" : scenario === "bothLoss" ? "Both loss" : "Mixed outcome";
  const chipTone =
    scenario === "bothGain" ? "success" : scenario === "bothLoss" ? "error" : ("warning" as const);

  const rentCellSx = (n: number) => (theme: Theme) => ({
    fontVariantNumeric: "tabular-nums" as const,
    py: 0.65,
    borderRadius: 1,
    bgcolor:
      n < 0 ? alpha(theme.palette.warning.main, theme.palette.mode === "dark" ? 0.16 : 0.1) : undefined,
    color: n < 0 ? (theme.palette.mode === "dark" ? theme.palette.warning.light : theme.palette.warning.dark) : undefined,
  });

  const gainCellSx = (n: number) => (theme: Theme) => ({
    verticalAlign: "top" as const,
    pt: 0.85,
    pb: 0.55,
    px: 0.75,
    borderTop: "1px solid",
    borderColor: "divider",
    bgcolor:
      n > 0
        ? alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.16 : 0.1)
        : n < 0
          ? alpha(theme.palette.error.main, theme.palette.mode === "dark" ? 0.16 : 0.08)
          : "transparent",
  });

  return (
    <Card
      variant="outlined"
      elevation={0}
      sx={(theme) => ({
        height: "100%",
        borderRadius: 1,
        overflow: "hidden",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "divider",
        borderLeftWidth: 3,
        borderLeftColor:
          scenario === "bothGain"
            ? theme.palette.success.main
            : scenario === "bothLoss"
              ? theme.palette.error.main
              : theme.palette.warning.main,
        bgcolor: "transparent",
        boxShadow: "none",
      })}
    >
      <CardContent sx={{ py: 1.1, "&:last-child": { pb: 1.1 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1} sx={{ mb: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            Sell after year {w.year}
          </Typography>
          <Chip
            size="small"
            label={chipLabel}
            color={chipTone}
            variant="outlined"
            sx={{
              fontWeight: 700,
              flexShrink: 0,
              borderRadius: 1,
              boxShadow: "none",
            }}
          />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, lineHeight: 1.35 }}>
          Rent and income for this model are under <strong>Rental yield in total gain</strong> on this tab (also on Rental).
          We compare 30- vs 15-year amortization (same rate)
          {showUser ? ` plus your Mortgage tab term (${ty} yr)` : ""}. After payoff, the rent line adds{" "}
          <strong>EGI / mo</strong> (no OpEx, no P&amp;I).
          Amber cells = negative rent drag in the model.
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, borderBottom: "none", py: 0.5 }} />
              <TableCell align="right" sx={{ fontWeight: 600, py: 0.5 }}>
                30-yr loan
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, py: 0.5 }}>
                15-yr loan
              </TableCell>
              {showUser ? (
                <TableCell align="right" sx={{ fontWeight: 600, py: 0.5 }}>
                  {ty}-yr loan
                </TableCell>
              ) : null}
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell sx={{ color: "text.secondary", borderBottom: "none", py: 0.65, maxWidth: 168 }}>
                Cash you put in at closing
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.65 }}>
                {money.format(w.initialCashInvested)}
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.65 }}>
                {money.format(w.initialCashInvested)}
              </TableCell>
              {showUser ? (
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.65 }}>
                  {money.format(w.initialCashInvested)}
                </TableCell>
              ) : null}
            </TableRow>
            <TableRow>
              <TableCell sx={{ color: "text.secondary", borderBottom: "none", py: 0.65 }}>
                + Rent in gain
              </TableCell>
              <TableCell align="right" sx={rentCellSx(w.cumulativeRentalCashFlow30)}>
                {plusMoney(w.cumulativeRentalCashFlow30)}
              </TableCell>
              <TableCell align="right" sx={rentCellSx(w.cumulativeRentalCashFlow15)}>
                {plusMoney(w.cumulativeRentalCashFlow15)}
              </TableCell>
              {showUser ? (
                <TableCell align="right" sx={rentCellSx(w.cumulativeRentalCashFlowUserTerm)}>
                  {plusMoney(w.cumulativeRentalCashFlowUserTerm)}
                </TableCell>
              ) : null}
            </TableRow>
            <TableRow>
              <TableCell sx={{ color: "text.secondary", borderBottom: "none", py: 0.65 }}>
                + Cash when you sell
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.65 }}>
                {plusMoney(w.netProceeds30)}
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.65 }}>
                {plusMoney(w.netProceeds15)}
              </TableCell>
              {showUser ? (
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.65 }}>
                  {plusMoney(w.netProceedsUserTerm)}
                </TableCell>
              ) : null}
            </TableRow>
            <TableRow>
              <TableCell
                sx={{
                  fontWeight: 700,
                  pt: 0.65,
                  borderTop: "1px solid",
                  borderColor: "divider",
                }}
              >
                = Your total gain
              </TableCell>
              <TableCell align="right" sx={gainCellSx(g30)}>
                <Stack alignItems="flex-end" spacing={0.15}>
                  <Typography
                    sx={(theme) => ({
                      fontWeight: 800,
                      fontSize: "1.05rem",
                      letterSpacing: "-0.02em",
                      fontVariantNumeric: "tabular-nums",
                      color: plTextColor(theme, g30),
                    })}
                  >
                    {signedMoney(g30)}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={(theme) => ({
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1.2,
                      color: plTextColor(theme, g30),
                    })}
                  >
                    {formatGainVsCashInPct(g30, w.initialCashInvested)}
                  </Typography>
                </Stack>
              </TableCell>
              <TableCell align="right" sx={gainCellSx(g15)}>
                <Stack alignItems="flex-end" spacing={0.15}>
                  <Typography
                    sx={(theme) => ({
                      fontWeight: 800,
                      fontSize: "1.05rem",
                      letterSpacing: "-0.02em",
                      fontVariantNumeric: "tabular-nums",
                      color: plTextColor(theme, g15),
                    })}
                  >
                    {signedMoney(g15)}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={(theme) => ({
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1.2,
                      color: plTextColor(theme, g15),
                    })}
                  >
                    {formatGainVsCashInPct(g15, w.initialCashInvested)}
                  </Typography>
                </Stack>
              </TableCell>
              {showUser ? (
                <TableCell align="right" sx={gainCellSx(gUser)}>
                  <Stack alignItems="flex-end" spacing={0.15}>
                    <Typography
                      sx={(theme) => ({
                        fontWeight: 800,
                        fontSize: "1.05rem",
                        letterSpacing: "-0.02em",
                        fontVariantNumeric: "tabular-nums",
                        color: plTextColor(theme, gUser),
                      })}
                    >
                      {signedMoney(gUser)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={(theme) => ({
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1.2,
                        color: plTextColor(theme, gUser),
                      })}
                    >
                      {formatGainVsCashInPct(gUser, w.initialCashInvested)}
                    </Typography>
                  </Stack>
                </TableCell>
              ) : null}
            </TableRow>
          </TableBody>
        </Table>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.6, lineHeight: 1.4 }}>
          Your total gain = rent + cash when you sell − cash you put in at closing. Percent is gain or loss vs that upfront
          cash (not annualized).
        </Typography>
      </CardContent>
    </Card>
  );
}
