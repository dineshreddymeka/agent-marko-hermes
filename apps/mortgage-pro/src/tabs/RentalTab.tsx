import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Chip, InputAdornment, Paper, Stack, Typography } from "@mui/material";
import Checkbox from "@mui/material/Checkbox";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { MortgageInputsFields } from "../components/MortgageInputsFields";
import { RentalExpenseComposition } from "../components/RentalExpenseComposition";
import { computeMonthlyPayment, type MonthlyBreakdown } from "../lib/mortgageMath";
import { computeRentalAnalysis } from "../lib/rentalMath";
import type { AppPersisted } from "../storage/mortgageState";

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const moneyDec = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pct1 = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const pct0 = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

function formatNumberField(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value);
}

function formatPercentField(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}

function pctOfEgi(amount: number, egi: number): string {
  if (!Number.isFinite(amount) || !Number.isFinite(egi) || egi <= 0) return "—";
  const p = (amount / egi) * 100;
  if (p > 0 && p < 0.5 && p !== 0) return "<1%";
  if (p < 0 && p > -0.5) return ">−1%";
  return `${pct0.format(p)}%`;
}

/** Pro-forma P&amp;I row id (not in operatingExpenseLines). */
const PF_PI_ID = "pi";

const PF_PMI_ID = "pmi";

const rentalAccordionSx = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 1,
  overflow: "hidden",
  bgcolor: "background.paper",
  boxShadow: "none",
  transition: "border-color 160ms ease",
  "&:before": { display: "none" },
  "&.Mui-expanded": {
    borderColor: "secondary.main",
    boxShadow: "none",
  },
} as const;

const accordionSummarySx = {
  px: 2,
  py: 0.75,
  minHeight: "unset",
  alignItems: "flex-start",
  "&:hover": { bgcolor: "action.hover" },
  "& .MuiAccordionSummary-content": {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 0.5,
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
    my: 0,
    overflow: "visible",
  },
  "& .MuiAccordionSummary-expandIconWrapper": {
    alignSelf: "flex-start",
    mt: 0.25,
  },
} as const;

const accordionDetailsSx = { px: 1.5, pt: 0.75, pb: 1 } as const;

/** Pro-forma OpEx line id → scroll target (tax / ins / HOA share one block). */
const OPEX_SCROLL_ANCHOR: Record<string, string> = {
  mgmt: "rental-edit-mgmt",
  maint: "rental-edit-maint",
  capex: "rental-edit-capex",
  tax: "rental-edit-monthly-taxes",
  ins: "rental-edit-monthly-taxes",
  hoa: "rental-edit-monthly-taxes",
};

type GoToOpts = { expandFinancing?: boolean };

function ProFormaNavCell(props: { onGo: () => void; children: ReactNode; sx?: object }) {
  const activate = () => props.onGo();

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    activate();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      activate();
    }
  };

  return (
    <TableCell
      role="button"
      tabIndex={0}
      title="Jump to where you edit this line"
      onClick={onClick}
      onKeyDown={onKeyDown}
      sx={{
        cursor: "pointer",
        userSelect: "none",
        "&:hover": { color: "primary.main" },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 2,
          borderRadius: 0.5,
        },
        ...(props.sx ?? {}),
      }}
    >
      {props.children}
    </TableCell>
  );
}

function pfLineOn(toggles: Record<string, boolean>, id: string): boolean {
  return toggles[id] !== false;
}

export type RentalTabProps = {
  state: AppPersisted;
  patch: (partial: Partial<AppPersisted>) => void;
};

export function RentalTab({ state, patch }: RentalTabProps) {
  const mortgage: MonthlyBreakdown = useMemo(
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
      state.downPaymentPercent,
      state.homePrice,
      state.hoaMonthly,
      state.insuranceAnnual,
      state.interestRateApr,
      state.propertyTaxAnnual,
      state.propertyTaxPercent,
      state.termYears,
      state.pmiMonthly,
    ]
  );

  const r = useMemo(() => computeRentalAnalysis(state, mortgage), [state, mortgage]);
  const egi = r.effectiveGrossIncomeMonthly;
  const totalOpexMo = r.operatingExpenseLines.reduce((a, x) => a + x.amount, 0);
  const totalCashIn = state.downPayment + state.closingCosts + state.miscInitialCash;

  /** Pro-forma only: unchecked rows are excluded from NOI / cash flow in the table below. */
  const [pfToggles, setPfToggles] = useState<Record<string, boolean>>({});
  const [financingOpen, setFinancingOpen] = useState(false);

  const goToRentalField = useCallback((anchorId: string, opts?: GoToOpts) => {
    const scroll = () => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    if (opts?.expandFinancing) {
      setFinancingOpen(true);
      window.setTimeout(scroll, 280);
    } else {
      scroll();
    }
  }, []);

  const piMonthly = mortgage.principalAndInterest;
  const pmiMo = mortgage.pmi;
  const monthlyCarrying = totalOpexMo + piMonthly + pmiMo;
  const piSummaryRight =
    pmiMo > 0.001
      ? `${moneyDec.format(piMonthly)}/mo P&I · ${moneyDec.format(pmiMo)}/mo PMI · ${state.termYears}-yr`
      : `${moneyDec.format(piMonthly)}/mo P&I · ${state.termYears}-yr`;

  const pfAdj = useMemo(() => {
    const opexIn = r.operatingExpenseLines.reduce(
      (sum, line) => sum + (pfLineOn(pfToggles, line.id) ? line.amount : 0),
      0
    );
    const noiAdj = egi - opexIn;
    const piIn = pfLineOn(pfToggles, PF_PI_ID);
    const piAmt = r.principalAndInterestMonthly;
    const piForCf = piIn ? piAmt : 0;
    const pmiIn = r.pmiMonthly > 0.0001 ? pfLineOn(pfToggles, PF_PMI_ID) : false;
    const pmiAmt = r.pmiMonthly;
    const pmiForCf = pmiIn ? pmiAmt : 0;
    const cfAdj = noiAdj - piForCf - pmiForCf;
    const ids = [
      ...r.operatingExpenseLines.map((l) => l.id),
      PF_PI_ID,
      ...(r.pmiMonthly > 0.0001 ? [PF_PMI_ID] : []),
    ];
    const hasExclusion = ids.some((id) => pfToggles[id] === false);
    const opexPartial = r.operatingExpenseLines.some((l) => pfToggles[l.id] === false);
    return { opexIn, noiAdj, piIn, piAmt, pmiIn, pmiAmt, cfAdj, hasExclusion, opexPartial };
  }, [egi, pfToggles, r]);

  /**
   * If you've held longer than the loan term: same convention as When to sell gain after payoff — EGI/mo
   * (no OpEx, no P&amp;I), not pro-forma NOI.
   */
  const yearsOwnedRounded = Math.max(0, Math.round(state.yearsOwned));
  const termYearsRounded = Math.max(1, Math.round(state.termYears));
  const loanPaidOffByYearsHeld = yearsOwnedRounded > termYearsRounded;
  const mortgageFreeMonthly = r.effectiveGrossIncomeMonthly;
  const mortgageFreeAnnual = mortgageFreeMonthly * 12;

  return (
    <Stack spacing={2}>
      <Paper
        variant="outlined"
        elevation={0}
        sx={{
          p: 1.75,
          borderRadius: 1,
          borderColor: "divider",
          bgcolor: "transparent",
          boxShadow: "none",
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: "-0.02em", mb: 0.75 }}>
          Same scenario as Mortgage
        </Typography>
        <Stack component="ul" spacing={0.75} sx={{ m: 0, pl: 2.25, color: "text.secondary" }}>
          <Typography component="li" variant="caption" sx={{ lineHeight: 1.45, display: "list-item" }}>
            Edits sync both tabs instantly (one saved scenario).
          </Typography>
          <Typography component="li" variant="caption" sx={{ lineHeight: 1.45, display: "list-item" }}>
            <strong>Financing</strong> = loan, rate, term, tax, insurance, HOA.
          </Typography>
          <Typography component="li" variant="caption" sx={{ lineHeight: 1.45, display: "list-item" }}>
            <strong>Upfront cash</strong> = down + closing + misc one-time. Loan <strong>term</strong> drives P&amp;I on
            both tabs.
          </Typography>
        </Stack>
      </Paper>

      <Accordion
        expanded={financingOpen}
        onChange={(_, expanded) => setFinancingOpen(expanded)}
        disableGutters
        elevation={0}
        sx={rentalAccordionSx}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ color: "text.secondary", fontSize: 22 }} />}
          aria-controls="rental-financing-panel"
          id="rental-financing-header"
          sx={accordionSummarySx}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600, letterSpacing: "-0.02em" }}>
            Financing &amp; property
          </Typography>
          <Typography
            component="div"
            variant="caption"
            color="text.secondary"
            sx={{
              display: { xs: "block", sm: "none" },
              lineHeight: 1.4,
              fontSize: "0.72rem",
              fontVariantNumeric: "tabular-nums",
            }}
            title={`Price ${money.format(state.homePrice)} · Loan ${money.format(mortgage.loanAmount)} · ${state.interestRateApr}% APR · ${state.termYears} yr · P&I ${moneyDec.format(mortgage.principalAndInterest)}/mo · PITI+HOA ${moneyDec.format(mortgage.total)}/mo`}
          >
            {money.format(state.homePrice)} · {state.downPaymentPercent.toFixed(1)}% down · ln{" "}
            {money.format(mortgage.loanAmount)} · {state.interestRateApr}% · {state.termYears}y · P&amp;I{" "}
            {moneyDec.format(mortgage.principalAndInterest)} · PITI {moneyDec.format(mortgage.total)}
          </Typography>
          <Box
            sx={{
              display: { xs: "none", sm: "grid" },
              width: "100%",
              gap: 1,
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            }}
          >
            <RentalSummaryStat label="Price" value={money.format(state.homePrice)} />
            <RentalSummaryStat label="Loan" value={money.format(mortgage.loanAmount)} />
            <RentalSummaryStat label={"P&I / mo"} value={moneyDec.format(mortgage.principalAndInterest)} />
            <RentalSummaryStat label="PITI+HOA / mo" value={moneyDec.format(mortgage.total)} />
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ lineHeight: 1.35, display: { xs: "none", sm: "block" } }}
          >
            {state.interestRateApr}% APR · {state.termYears} yr (collapsed summary above)
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={accordionDetailsSx}>
          <Box id="rental-edit-financing">
            <MortgageInputsFields
              state={state}
              patch={patch}
              purchasePriceHelperText="Drives cap rate (NOI ÷ this price)"
            />
          </Box>
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded={false} disableGutters elevation={0} sx={rentalAccordionSx}>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ color: "text.secondary", fontSize: 22 }} />}
          aria-controls="rental-initial-invest-panel"
          id="rental-initial-invest-header"
          sx={accordionSummarySx}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600, letterSpacing: "-0.02em" }}>
            Upfront cash (acquisition)
          </Typography>
          <Typography
            component="div"
            variant="caption"
            color="text.secondary"
            sx={{
              display: { xs: "block", md: "none" },
              lineHeight: 1.4,
              fontSize: "0.72rem",
              fontVariantNumeric: "tabular-nums",
            }}
            title={`Total cash in ${moneyDec.format(totalCashIn)} · Down ${money.format(state.downPayment)} · Closing ${money.format(state.closingCosts)} · Misc ${money.format(state.miscInitialCash)} · Financed ${money.format(Math.max(0, state.homePrice - state.downPayment))}`}
          >
            Tot {moneyDec.format(totalCashIn)} · D {money.format(state.downPayment)} · Close{" "}
            {money.format(state.closingCosts)} · Misc {money.format(state.miscInitialCash)} · Ln{" "}
            {money.format(Math.max(0, state.homePrice - state.downPayment))}
          </Typography>
          <Box
            sx={{
              display: { xs: "none", md: "grid" },
              width: "100%",
              gap: 1,
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            }}
          >
            <RentalSummaryStat label="Total cash in" value={moneyDec.format(totalCashIn)} emphasize />
            <RentalSummaryStat label="Down" value={money.format(state.downPayment)} />
            <RentalSummaryStat label="Closing fees" value={money.format(state.closingCosts)} />
            <RentalSummaryStat label="Misc one-time" value={money.format(state.miscInitialCash)} />
            <RentalSummaryStat label="Financed" value={money.format(Math.max(0, state.homePrice - state.downPayment))} />
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ lineHeight: 1.35, display: { xs: "none", md: "block" } }}
          >
            One-time at close (collapsed summary above)
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={accordionDetailsSx}>
          <Stack spacing={1}>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4, display: "block" }}>
              <strong>Upfront</strong> is money you bring once at closing (see the <strong>Upfront</strong> tab for a
              dedicated ledger). <strong>Monthly carrying</strong> (other card) is what it costs each month to own and
              operate. Price and down also live under <strong>Financing</strong>.
            </Typography>

            <RentalSubsection
              title="Purchase & equity"
              subtitle="Deal price and your equity; down payment caps at purchase price."
            >
              <TextField
                label="Purchase price"
                size="small"
                fullWidth
                helperText="Cap rate divisor; syncs annual tax $ when you use tax %"
                value={formatNumberField(state.homePrice)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                  if (!Number.isFinite(n)) return;
                  const hp = Math.max(0, n);
                  patch({
                    homePrice: hp,
                    downPayment: Math.round((hp * state.downPaymentPercent) / 100),
                    propertyTaxAnnual: Math.round((hp * state.propertyTaxPercent) / 100),
                  });
                }}
                slotProps={{
                  input: {
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  },
                }}
              />
              <Grid container spacing={1}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Down payment"
                    size="small"
                    fullWidth
                    value={formatNumberField(state.downPayment)}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                      if (!Number.isFinite(n)) return;
                      const hp = state.homePrice;
                      const dp = Math.max(0, n);
                      const capped = hp > 0 ? Math.min(dp, hp) : dp;
                      patch({
                        downPayment: capped,
                        downPaymentPercent: hp > 0 ? (capped / hp) * 100 : 0,
                      });
                    }}
                    slotProps={{
                      input: {
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Down %"
                    size="small"
                    fullWidth
                    value={formatPercentField(state.downPaymentPercent)}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                      if (!Number.isFinite(n)) return;
                      const pct = Math.min(100, Math.max(0, n));
                      const hp = state.homePrice;
                      patch({
                        downPaymentPercent: pct,
                        downPayment: hp > 0 ? Math.round((hp * pct) / 100) : state.downPayment,
                      });
                    }}
                    slotProps={{
                      input: {
                        endAdornment: <InputAdornment position="end">%</InputAdornment>,
                      },
                    }}
                  />
                </Grid>
              </Grid>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
                <Typography variant="caption" color="text.secondary">
                  Amount financed (loan)
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {money.format(Math.max(0, state.homePrice - state.downPayment))}
                </Typography>
              </Stack>
            </RentalSubsection>

            <RentalSubsection
              title="Closing fees & miscellaneous one-time"
              subtitle="Lender/title/transfer estimates plus any other cash at close (repairs, appliances, moving). Not monthly."
            >
              <TextField
                label="Closing costs (fees)"
                size="small"
                fullWidth
                helperText="Typical lender + title + recording; counts toward cash-on-cash denominator only"
                value={formatNumberField(state.closingCosts)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                  if (Number.isFinite(n)) patch({ closingCosts: Math.max(0, n) });
                }}
                slotProps={{
                  input: {
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  },
                }}
              />
              <TextField
                label="Misc. one-time at close"
                size="small"
                fullWidth
                helperText="Optional: rehabs, furniture, prepaid items — same treatment as closing for cash-in"
                value={formatNumberField(state.miscInitialCash)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                  if (Number.isFinite(n)) patch({ miscInitialCash: Math.max(0, n) });
                }}
                slotProps={{
                  input: {
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  },
                }}
              />
            </RentalSubsection>

            <Box
              sx={{
                borderRadius: 1,
                p: 1.25,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "transparent",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  fontSize: "0.65rem",
                  color: "text.secondary",
                  display: "block",
                  mb: 0.75,
                }}
              >
                Cash-in checklist
              </Typography>
              <Stack spacing={0.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                  <Typography variant="caption" color="text.secondary">
                    Down payment
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {moneyDec.format(state.downPayment)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                  <Typography variant="caption" color="text.secondary">
                    Closing fees
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {moneyDec.format(state.closingCosts)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                  <Typography variant="caption" color="text.secondary">
                    Misc. one-time
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {moneyDec.format(state.miscInitialCash)}
                  </Typography>
                </Stack>
                <Divider sx={{ my: 0.25 }} />
                <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    Total cash invested
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                    {moneyDec.format(totalCashIn)}
                  </Typography>
                </Stack>
              </Stack>
            </Box>
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Box id="rental-metrics-row" className="pp-fade-in" sx={{ py: 0.5 }}>
        <Typography variant="h6" sx={{ fontSize: { xs: "1.1rem", sm: "1.2rem" }, mb: 0.35 }}>
          Key metrics
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25, lineHeight: 1.4, maxWidth: 520 }}>
          Cash flow, NOI, and returns for this scenario.
        </Typography>
        <Grid container spacing={1}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <MetricCard
              label="Mo cash flow"
              value={moneyDec.format(r.cashFlowMonthly)}
              detail={`Yr ${moneyDec.format(r.cashFlowAnnual)}`}
              detailExtra={piSummaryRight}
              hint={`NOI ${moneyDec.format(r.noiMonthly)} − P&amp;I ${moneyDec.format(piMonthly)} (same ${state.termYears}-yr loan as Mortgage)`}
              positive={r.cashFlowMonthly >= 0}
              title={`Mo cash flow = monthly NOI minus monthly P&I. P&I is ${moneyDec.format(piMonthly)} on a ${state.termYears}-year amortizing loan — identical to the Mortgage tab for this scenario.`}
              note={
                loanPaidOffByYearsHeld ? (
                  <>
                    <strong>Approx. mortgage-free</strong> (years held &gt; {termYearsRounded} yr loan):{" "}
                    {moneyDec.format(mortgageFreeMonthly)}/mo — effective gross income (vacancy applied), no OpEx or P&amp;I{" "}
                    (matches When to sell rent after loan payoff). Uses <strong>Years since purchase</strong> on When to sell.
                  </>
                ) : undefined
              }
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <MetricCard
              label="Yr cash flow"
              value={moneyDec.format(r.cashFlowAnnual)}
              detail={`Mo ${moneyDec.format(r.cashFlowMonthly)}`}
              detailExtra={piSummaryRight}
              hint={`12 × mo cash flow; P&amp;I still ${moneyDec.format(piMonthly)}/mo (${state.termYears} yr)`}
              positive={r.cashFlowAnnual >= 0}
              title={`Year cash flow is twelve times monthly cash flow (NOI − P&I). Loan term is ${state.termYears} years on both tabs.`}
              note={
                loanPaidOffByYearsHeld ? (
                  <>
                    <strong>Approx. mortgage-free</strong>: {moneyDec.format(mortgageFreeAnnual)}/yr ({moneyDec.format(mortgageFreeMonthly)}
                    /mo EGI). Main figures above still assume debt service for side-by-side underwriting.
                  </>
                ) : undefined
              }
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <MetricCard
              label="NOI / yr"
              value={moneyDec.format(r.noiAnnual)}
              detail={`${moneyDec.format(r.noiMonthly)}/mo`}
              hint="Net operating income: after vacancy &amp; OpEx, before P&amp;I"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <MetricCard
              label="Cap rate"
              value={`${pct1.format(r.capRate * 100)}%`}
              detail={`Price ${money.format(state.homePrice)}`}
              hint="NOI (per year) ÷ purchase price"
              title="The price on the right is the purchase price used as the divisor for cap rate (same as Financing)."
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <MetricCard
              label="Cash-on-cash"
              value={`${pct1.format(r.cashOnCash * 100)}%`}
              detail={`${money.format(r.initialCashInvested)} in`}
              hint="Yr cash flow ÷ total cash in (down + closing fees + misc one-time)"
              title="Denominator is everything in Upfront cash: down payment, closing fees, and miscellaneous one-time at close."
            />
          </Grid>
        </Grid>
      </Box>

      <Grid container spacing={1}>
        <Grid size={{ xs: 12, md: 6 }}>
          <RentalPanelCard
            panelId="rental-edit-income"
            title={"Income (rent & vacancy)"}
            description={
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45, display: "block" }}>
                GSI {moneyDec.format(r.grossScheduledIncomeMonthly)} · vac −{moneyDec.format(r.vacancyLossMonthly)} →
                EGI {moneyDec.format(egi)}. Price &amp; down live in <strong>Upfront cash</strong> or{" "}
                <strong>Financing</strong>. Metrics and the pro-forma below allow <strong>negative cash flow</strong> when
                income is below carrying costs.
              </Typography>
            }
          >
            <Stack spacing={1}>
                <RentalFieldRow
                  anchorId="rental-edit-rent"
                  label="Rent"
                  detail="Any amount ≥ 0 · edit freely, saves when you leave the field"
                  valueLabel={money.format(state.monthlyRent)}
                  textLabel="$/mo"
                  textValue={formatNumberField(state.monthlyRent)}
                  numericCommitOnBlur={{
                    min: 0,
                    max: 999_999,
                    committed: state.monthlyRent,
                    onCommit: (n) => patch({ monthlyRent: n }),
                  }}
                  startAdornment={<InputAdornment position="start">$</InputAdornment>}
                />
                <RentalFieldRow
                  anchorId="rental-edit-other-income"
                  label="Other income"
                  detail="0–3k/mo"
                  valueLabel={money.format(state.otherMonthlyIncome)}
                  textLabel="$/mo"
                  textValue={formatNumberField(state.otherMonthlyIncome)}
                  onText={(raw) => {
                    const n = Number(raw.replace(/[^0-9.]/g, ""));
                    if (!Number.isFinite(n)) return;
                    patch({ otherMonthlyIncome: Math.min(3_000, Math.max(0, Math.round(n))) });
                  }}
                  startAdornment={<InputAdornment position="start">$</InputAdornment>}
                />
                <RentalFieldRow
                  anchorId="rental-edit-vacancy"
                  label="Vacancy"
                  detail="0–100% · high vacancy stresses cash flow"
                  valueLabel={`${state.vacancyRatePercent.toFixed(1)}%`}
                  textLabel="%"
                  textValue={formatPercentField(state.vacancyRatePercent)}
                  onText={(raw) => {
                    const n = Number(raw.replace(/[^0-9.]/g, ""));
                    if (!Number.isFinite(n)) return;
                    patch({ vacancyRatePercent: Math.min(100, Math.max(0, n)) });
                  }}
                  endAdornment={<InputAdornment position="end">%</InputAdornment>}
                />
              </Stack>
          </RentalPanelCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <RentalPanelCard
            panelId="rental-edit-carrying"
            title="Monthly carrying cost"
            headerExtra={
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={`${moneyDec.format(monthlyCarrying)}/mo total`}
                sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
              />
            }
            description={
              <Stack spacing={0.5}>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45, display: "block" }}>
                  Recurring cash to <strong>run</strong> the property: OpEx {moneyDec.format(totalOpexMo)}/mo + P&amp;I{" "}
                  {moneyDec.format(piMonthly)}/mo (before rent / EGI on the left).
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45, display: "block" }}>
                  OpEx vs EGI: {pctOfEgi(totalOpexMo, egi)} — tax, insurance, HOA match <strong>Financing</strong>.
                </Typography>
              </Stack>
            }
          >
            <Stack spacing={1}>
                <RentalSubsection
                  sectionId="rental-edit-debt-service"
                  title="Debt service"
                  subtitle={"Principal & interest from loan amount, rate, and term (edit under Financing)."}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
                    <Typography variant="body2" color="text.secondary">
                      P&amp;I / mo
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {moneyDec.format(piMonthly)}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                    {state.termYears}-year loan · {state.interestRateApr}% APR
                  </Typography>
                </RentalSubsection>

                <RentalSubsection
                  sectionId="rental-edit-monthly-taxes"
                  title="Taxes, insurance, HOA"
                  subtitle={"Escrow-style recurring; annual tax & insurance entered as yearly totals."}
                >
                  <Grid container spacing={1}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Property tax (yr)"
                        size="small"
                        fullWidth
                        value={formatNumberField(state.propertyTaxAnnual)}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                          if (!Number.isFinite(n)) return;
                          const hp = state.homePrice;
                          const annual = Math.max(0, n);
                          patch({
                            propertyTaxAnnual: annual,
                            propertyTaxPercent: hp > 0 ? (annual / hp) * 100 : 0,
                          });
                        }}
                        slotProps={{
                          input: {
                            startAdornment: <InputAdornment position="start">$</InputAdornment>,
                          },
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Property tax %"
                        size="small"
                        fullWidth
                        helperText="% of purchase / yr"
                        value={formatPercentField(state.propertyTaxPercent)}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                          if (!Number.isFinite(n)) return;
                          const pct = Math.min(100, Math.max(0, n));
                          const hp = state.homePrice;
                          patch({
                            propertyTaxPercent: pct,
                            propertyTaxAnnual: hp > 0 ? Math.round((hp * pct) / 100) : state.propertyTaxAnnual,
                          });
                        }}
                        slotProps={{
                          input: {
                            endAdornment: <InputAdornment position="end">%</InputAdornment>,
                          },
                        }}
                      />
                    </Grid>
                  </Grid>
                  <TextField
                    label="Insurance (yr)"
                    size="small"
                    fullWidth
                    value={formatNumberField(state.insuranceAnnual)}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                      if (Number.isFinite(n)) patch({ insuranceAnnual: Math.max(0, n) });
                    }}
                    slotProps={{
                      input: {
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      },
                    }}
                  />
                  <TextField
                    label="HOA (mo)"
                    size="small"
                    fullWidth
                    value={formatNumberField(state.hoaMonthly)}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                      if (Number.isFinite(n)) patch({ hoaMonthly: Math.max(0, n) });
                    }}
                    slotProps={{
                      input: {
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      },
                    }}
                  />
                </RentalSubsection>

                <RentalSubsection
                  sectionId="rental-edit-reserves-section"
                  title="Management & reserves"
                  subtitle="Budget lines tied to rent / scheduled income (pro-forma each month)."
                >
                  <RentalFieldRow
                    anchorId="rental-edit-mgmt"
                    label="Mgmt"
                    detail="% of scheduled income (0–50%)"
                    valueLabel={`${state.propertyMgmtPercent.toFixed(1)}%`}
                    textLabel="%"
                    textValue={formatPercentField(state.propertyMgmtPercent)}
                    onText={(raw) => {
                      const n = Number(raw.replace(/[^0-9.]/g, ""));
                      if (!Number.isFinite(n)) return;
                      patch({ propertyMgmtPercent: Math.min(50, Math.max(0, n)) });
                    }}
                    endAdornment={<InputAdornment position="end">%</InputAdornment>}
                  />
                  <RentalFieldRow
                    anchorId="rental-edit-maint"
                    label="Maint."
                    detail="% of base rent (0–50%)"
                    valueLabel={`${state.maintenancePercent.toFixed(1)}%`}
                    textLabel="%"
                    textValue={formatPercentField(state.maintenancePercent)}
                    onText={(raw) => {
                      const n = Number(raw.replace(/[^0-9.]/g, ""));
                      if (!Number.isFinite(n)) return;
                      patch({ maintenancePercent: Math.min(50, Math.max(0, n)) });
                    }}
                    endAdornment={<InputAdornment position="end">%</InputAdornment>}
                  />
                  <RentalFieldRow
                    anchorId="rental-edit-capex"
                    label="CapEx"
                    detail="% of base rent (0–30%)"
                    valueLabel={`${state.capexPercent.toFixed(1)}%`}
                    textLabel="%"
                    textValue={formatPercentField(state.capexPercent)}
                    onText={(raw) => {
                      const n = Number(raw.replace(/[^0-9.]/g, ""));
                      if (!Number.isFinite(n)) return;
                      patch({ capexPercent: Math.min(30, Math.max(0, n)) });
                    }}
                    endAdornment={<InputAdornment position="end">%</InputAdornment>}
                  />
                </RentalSubsection>
              </Stack>
          </RentalPanelCard>
        </Grid>
      </Grid>

      <Card variant="outlined" elevation={0} sx={{ borderRadius: 1, borderColor: "divider", boxShadow: "none" }}>
        <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
          <RentalExpenseComposition slices={r.composition} />
        </CardContent>
      </Card>

      <Card variant="outlined" elevation={0} sx={{ borderRadius: 1, borderColor: "divider", boxShadow: "none" }}>
        <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.35, letterSpacing: "-0.02em" }}>
            Monthly pro-forma
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1, lineHeight: 1.4 }}>
            <strong>EGI</strong> (effective gross income) = scheduled rent + other income, minus vacancy. The second
            table shows where that EGI goes; <strong>% of EGI</strong> is each row&apos;s dollars divided by the same
            monthly EGI ({moneyDec.format(egi)}). Use the checkboxes to leave a cost or P&amp;I out of the{" "}
            <strong>NOI</strong> and <strong>cash flow</strong> totals in this table (all included by default). Cards
            above still use your full inputs. <strong>Tip:</strong> click an <strong>item name</strong> (not the dollar
            amount) to scroll to where you edit it.
          </Typography>

          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.35 }}>
            1 · Income → EGI
          </Typography>
          <TableContainer sx={{ mb: 1.25 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ py: 0.5 }}>Item</TableCell>
                  <TableCell align="right" sx={{ py: 0.5, width: 108, fontWeight: 600 }}>
                    $ / mo
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <ProFormaNavCell onGo={() => goToRentalField("rental-edit-income")} sx={{ py: 0.35 }}>
                    Gross scheduled income
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
                      Rent + other before vacancy
                    </Typography>
                  </ProFormaNavCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.35, verticalAlign: "top" }}>
                    {moneyDec.format(r.grossScheduledIncomeMonthly)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <ProFormaNavCell onGo={() => goToRentalField("rental-edit-vacancy")} sx={{ pl: 1, color: "text.secondary", py: 0.35 }}>
                    Vacancy ({state.vacancyRatePercent.toFixed(1)}% of scheduled)
                  </ProFormaNavCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.35 }}>
                    −{moneyDec.format(r.vacancyLossMonthly)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <ProFormaNavCell onGo={() => goToRentalField("rental-edit-income")} sx={{ fontWeight: 600, py: 0.35 }}>
                    EGI
                  </ProFormaNavCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, py: 0.35 }}>
                    {moneyDec.format(egi)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.5} sx={{ mb: 0.35 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              2 · Operating costs, loan, cash flow (% of EGI)
            </Typography>
            {pfAdj.hasExclusion ? (
              <Typography
                component="button"
                type="button"
                variant="caption"
                onClick={() => setPfToggles({})}
                sx={{
                  cursor: "pointer",
                  border: 0,
                  bgcolor: "transparent",
                  p: 0,
                  m: 0,
                  font: "inherit",
                  color: "primary.main",
                  textDecoration: "underline",
                }}
              >
                Restore all lines
              </Typography>
            ) : null}
          </Stack>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" sx={{ width: 44, py: 0.5 }} aria-label="Include in totals" />
                  <TableCell sx={{ py: 0.5 }}>Item</TableCell>
                  <TableCell align="right" sx={{ py: 0.5, width: 96, fontWeight: 600 }}>
                    $ / mo
                  </TableCell>
                  <TableCell align="right" sx={{ py: 0.5, width: 72, fontWeight: 600 }}>
                    % of EGI
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {r.operatingExpenseLines.map((line) => {
                  const on = pfLineOn(pfToggles, line.id);
                  return (
                    <TableRow
                      key={line.id}
                      sx={{
                        opacity: on ? 1 : 0.55,
                        bgcolor: on ? undefined : "action.hover",
                      }}
                    >
                      <TableCell padding="checkbox" sx={{ py: 0.35, verticalAlign: "middle" }}>
                        <Checkbox
                          size="small"
                          checked={on}
                          onChange={() => setPfToggles((prev) => ({ ...prev, [line.id]: !pfLineOn(prev, line.id) }))}
                          inputProps={{ "aria-label": `Include ${line.label} in pro-forma NOI and cash flow` }}
                        />
                      </TableCell>
                      <ProFormaNavCell
                        onGo={() => goToRentalField(OPEX_SCROLL_ANCHOR[line.id] ?? "rental-edit-carrying")}
                        sx={{ pl: 0.5, py: 0.35 }}
                      >
                        {line.label}
                      </ProFormaNavCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.35 }}>
                        −{moneyDec.format(line.amount)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.35, color: "text.secondary" }}>
                        {on ? pctOfEgi(line.amount, egi) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell padding="checkbox" sx={{ py: 0.35 }} />
                  <ProFormaNavCell onGo={() => goToRentalField("rental-edit-carrying")} sx={{ fontWeight: 600, py: 0.35 }}>
                    NOI
                    {pfAdj.opexPartial ? (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.25 }}>
                        Uses checked operating costs only
                      </Typography>
                    ) : null}
                  </ProFormaNavCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, py: 0.35 }}>
                    {moneyDec.format(pfAdj.noiAdj)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.35, color: "text.secondary" }}>
                    {pctOfEgi(pfAdj.noiAdj, egi)}
                  </TableCell>
                </TableRow>
                <TableRow
                  sx={{
                    opacity: pfAdj.piIn ? 1 : 0.55,
                    bgcolor: pfAdj.piIn ? undefined : "action.hover",
                  }}
                >
                  <TableCell padding="checkbox" sx={{ py: 0.35, verticalAlign: "middle" }}>
                    <Checkbox
                      size="small"
                      checked={pfAdj.piIn}
                      onChange={() => setPfToggles((prev) => ({ ...prev, [PF_PI_ID]: !pfLineOn(prev, PF_PI_ID) }))}
                      inputProps={{ "aria-label": "Include principal and interest in pro-forma cash flow" }}
                    />
                  </TableCell>
                  <ProFormaNavCell
                    onGo={() => goToRentalField("rental-edit-financing", { expandFinancing: true })}
                    sx={{ pl: 0.5, py: 0.35 }}
                  >
                    P&amp;I (principal &amp; interest)
                    {!pfAdj.piIn ? (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.25 }}>
                        Unchecked → cash flow ignores loan payment here
                      </Typography>
                    ) : null}
                  </ProFormaNavCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.35 }}>
                    −{moneyDec.format(pfAdj.piAmt)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.35, color: "text.secondary" }}>
                    {pfAdj.piIn ? pctOfEgi(pfAdj.piAmt, egi) : "—"}
                  </TableCell>
                </TableRow>
                {r.pmiMonthly > 0.001 ? (
                  <TableRow
                    sx={{
                      opacity: pfAdj.pmiIn ? 1 : 0.55,
                      bgcolor: pfAdj.pmiIn ? undefined : "action.hover",
                    }}
                  >
                    <TableCell padding="checkbox" sx={{ py: 0.35, verticalAlign: "middle" }}>
                      <Checkbox
                        size="small"
                        checked={pfAdj.pmiIn}
                        onChange={() => setPfToggles((prev) => ({ ...prev, [PF_PMI_ID]: !pfLineOn(prev, PF_PMI_ID) }))}
                        inputProps={{ "aria-label": "Include PMI in pro-forma cash flow" }}
                      />
                    </TableCell>
                    <ProFormaNavCell
                      onGo={() => goToRentalField("rental-edit-financing", { expandFinancing: true })}
                      sx={{ pl: 0.5, py: 0.35 }}
                    >
                      PMI
                    </ProFormaNavCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.35 }}>
                      −{moneyDec.format(pfAdj.pmiAmt)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.35, color: "text.secondary" }}>
                      {pfAdj.pmiIn ? pctOfEgi(pfAdj.pmiAmt, egi) : "—"}
                    </TableCell>
                  </TableRow>
                ) : null}
                <TableRow>
                  <TableCell padding="checkbox" sx={{ py: 0.35 }} />
                  <ProFormaNavCell onGo={() => goToRentalField("rental-metrics-row")} sx={{ fontWeight: 700, py: 0.35 }}>
                    Cash flow
                  </ProFormaNavCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 700,
                      py: 0.35,
                      color: pfAdj.cfAdj >= 0 ? "success.main" : "error.main",
                    }}
                  >
                    {moneyDec.format(pfAdj.cfAdj)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", py: 0.35, color: "text.secondary" }}>
                    {pctOfEgi(pfAdj.cfAdj, egi)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Stack>
  );
}

function RentalPanelCard(props: {
  panelId?: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
  headerExtra?: ReactNode;
}) {
  return (
    <Card
      id={props.panelId}
      variant="outlined"
      elevation={0}
      sx={{
        height: "100%",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "none",
        bgcolor: "transparent",
      }}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1} flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: "-0.02em", flex: "1 1 8rem", minWidth: 0 }}>
            {props.title}
          </Typography>
          {props.headerExtra ?? null}
        </Stack>
        <Box sx={{ mt: 0.75 }}>{props.description}</Box>
      </Box>
      <CardContent sx={{ flex: 1, pt: 2, px: 2, pb: 2, "&:last-child": { pb: 2 } }}>{props.children}</CardContent>
    </Card>
  );
}

function RentalSummaryStat(props: { label: string; value: string; emphasize?: boolean }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        px: 1.25,
        py: 1,
        borderRadius: 1,
        bgcolor: "transparent",
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontSize: "0.65rem", lineHeight: 1.2, display: "block", textTransform: "none" }}
      >
        {props.label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontWeight: props.emphasize ? 800 : 700,
          fontVariantNumeric: "tabular-nums",
          fontSize: props.emphasize ? "0.9375rem" : "0.8125rem",
          lineHeight: 1.3,
          letterSpacing: props.emphasize ? "-0.02em" : undefined,
          mt: 0.25,
        }}
      >
        {props.value}
      </Typography>
    </Box>
  );
}

function RentalSubsection(props: { sectionId?: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Box
      id={props.sectionId}
      sx={{
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        p: 1.5,
        bgcolor: "transparent",
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          fontSize: "0.65rem",
          color: "text.secondary",
          display: "block",
        }}
      >
        {props.title}
      </Typography>
      {props.subtitle ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.35, lineHeight: 1.35 }}>
          {props.subtitle}
        </Typography>
      ) : null}
      <Stack spacing={0.75} sx={{ mt: 0.75 }}>
        {props.children}
      </Stack>
    </Box>
  );
}

function RentalFieldRow(props: {
  anchorId?: string;
  label: string;
  detail?: string;
  valueLabel: string;
  textLabel: string;
  textValue: string;
  onText?: (raw: string) => void;
  /** Digits-only while typing; clamp to [min, max] on blur (empty blur = keep saved value). */
  numericCommitOnBlur?: { min: number; max: number; committed: number; onCommit: (n: number) => void };
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
}) {
  const [numericDraft, setNumericDraft] = useState<string | null>(null);
  const commit = props.numericCommitOnBlur;

  const inputValue =
    commit != null
      ? numericDraft !== null
        ? numericDraft
        : formatNumberField(commit.committed)
      : props.textValue;

  return (
    <Grid id={props.anchorId} container spacing={1} alignItems="flex-end">
      <Grid size={{ xs: 12, md: 7 }}>
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={0.5}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2, display: "block" }}>
                {props.label}
              </Typography>
              {props.detail ? (
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem", lineHeight: 1.2, display: "block" }}>
                  {props.detail}
                </Typography>
              ) : null}
            </Box>
            <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              {props.valueLabel}
            </Typography>
          </Stack>
        </Box>
      </Grid>
      <Grid size={{ xs: 12, md: 5 }}>
        <TextField
          label={props.textLabel}
          size="small"
          fullWidth
          value={inputValue}
          onChange={(e) => {
            if (commit != null) {
              setNumericDraft(e.target.value.replace(/[^0-9]/g, ""));
            } else {
              props.onText?.(e.target.value);
            }
          }}
          onFocus={() => {
            if (commit != null) setNumericDraft(formatNumberField(commit.committed));
          }}
          onBlur={(e) => {
            if (commit == null) return;
            const digits = e.target.value.replace(/[^0-9]/g, "");
            setNumericDraft(null);
            if (digits === "") return;
            const n = Math.round(Number(digits));
            if (!Number.isFinite(n)) return;
            commit.onCommit(Math.min(commit.max, Math.max(commit.min, n)));
          }}
          slotProps={{
            input: {
              ...(props.startAdornment ? { startAdornment: props.startAdornment } : {}),
              ...(props.endAdornment ? { endAdornment: props.endAdornment } : {}),
            },
          }}
        />
      </Grid>
    </Grid>
  );
}

function MetricCard(props: {
  label: string;
  value: string;
  detail?: string;
  /** Second line under `detail` (e.g. P&amp;I + loan term). */
  detailExtra?: string;
  hint: string;
  positive?: boolean;
  /** Native tooltip for extra context (e.g. what the detail dollars mean). */
  title?: string;
  /** Optional callout below hint (e.g. post-payoff cash flow). */
  note?: ReactNode;
}) {
  const hasRight = Boolean(props.detail || props.detailExtra);
  return (
    <Box
      title={props.title}
      sx={{
        height: "100%",
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        px: 1.5,
        py: 1.25,
        bgcolor: "transparent",
        transition: "border-color 0.15s ease",
        "&:hover": { borderColor: "secondary.main" },
      }}
    >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontSize: "0.65rem", lineHeight: 1.2, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 700 }}
        >
          {props.label}
        </Typography>
        <Stack
          direction="row"
          alignItems={hasRight ? "flex-start" : "baseline"}
          justifyContent="space-between"
          gap={0.5}
          sx={{ mt: 0.125 }}
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              fontSize: "0.9375rem",
              letterSpacing: "-0.02em",
              fontFamily: "var(--pp-font-display)",
              color:
                props.positive === undefined
                  ? "text.primary"
                  : props.positive
                    ? "success.main"
                    : "error.main",
            }}
          >
            {props.value}
          </Typography>
          {hasRight ? (
            <Stack alignItems="flex-end" spacing={0.125} sx={{ minWidth: 0, textAlign: "right" }}>
              {props.detail ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontVariantNumeric: "tabular-nums", fontSize: "0.65rem", lineHeight: 1.2 }}
                >
                  {props.detail}
                </Typography>
              ) : null}
              {props.detailExtra ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontVariantNumeric: "tabular-nums",
                    fontSize: "0.6rem",
                    lineHeight: 1.2,
                    opacity: 0.92,
                  }}
                >
                  {props.detailExtra}
                </Typography>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", lineHeight: 1.25, display: "block", mt: 0.25 }}>
          {props.hint}
        </Typography>
        {props.note ? (
          <Typography
            variant="caption"
            sx={{
              display: "block",
              mt: 0.45,
              fontSize: "0.65rem",
              lineHeight: 1.35,
              color: "success.main",
            }}
          >
            {props.note}
          </Typography>
        ) : null}
    </Box>
  );
}
