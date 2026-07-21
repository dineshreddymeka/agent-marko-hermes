import ExpandMore from "@mui/icons-material/ExpandMore";
import { Stack, Typography } from "@mui/material";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Grid from "@mui/material/Grid2";
import { useMemo, type ReactNode } from "react";
import { AccordionSummaryMetric } from "../components/AccordionSummaryMetric";
import { AppSection } from "../components/AppSection";
import { MortgageBuyerCashPanel } from "../components/MortgageBuyerCashPanel";
import { MortgageLoanSummaryCard } from "../components/MortgageLoanSummaryCard";
import { MortgageInputsFields } from "../components/MortgageInputsFields";
import { MortgageAffordabilityDtiPanel } from "../components/MortgageAffordabilityDtiPanel";
import { MortgageLoanCompareCards } from "../components/MortgageLoanCompareCards";
import { MortgageRefiBreakevenCard } from "../components/MortgageRefiBreakevenCard";
import { MortgagePaymentBreakdown } from "../components/MortgagePaymentBreakdown";
import { PaydownYearlyMergedCompare } from "../components/PaydownYearlyMergedCompare";
import { PaydownYearlyColorLegend } from "../components/PaydownYearlyDetailTable";
import {
  aggregateYearlyPaydownDetailed,
  buildAmortizationSchedule,
  buildAmortizationScheduleWithExtraPrincipal,
  computeMonthlyPayment,
  scheduleTotals,
  type AmortizationRow,
} from "../lib/mortgageMath";
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

const summarySx = {
  px: 2,
  minHeight: 56,
  alignItems: "flex-start",
  "& .MuiAccordionSummary-content": { my: 1, width: "100%", maxWidth: "calc(100% - 36px)" },
} as const;

export type MortgageTabProps = {
  state: AppPersisted;
  patch: (partial: Partial<AppPersisted>) => void;
};

export function MortgageTab({ state, patch }: MortgageTabProps) {
  const extraPrincipalMonthly = Math.max(0, Math.round(Number(state.extraPrincipalMonthly) || 0));

  const breakdown = useMemo(
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

  const baselineSchedule: AmortizationRow[] = useMemo(
    () => buildAmortizationSchedule(breakdown.loanAmount, state.interestRateApr, state.termYears),
    [breakdown.loanAmount, state.interestRateApr, state.termYears]
  );

  const baselineSchedule15: AmortizationRow[] = useMemo(
    () => buildAmortizationSchedule(breakdown.loanAmount, state.interestRateApr, 15),
    [breakdown.loanAmount, state.interestRateApr]
  );

  const schedule15: AmortizationRow[] = useMemo(() => {
    if (breakdown.loanAmount <= 0) return [];
    if (extraPrincipalMonthly > 0) {
      return buildAmortizationScheduleWithExtraPrincipal(
        breakdown.loanAmount,
        state.interestRateApr,
        15,
        extraPrincipalMonthly
      );
    }
    return baselineSchedule15;
  }, [baselineSchedule15, breakdown.loanAmount, extraPrincipalMonthly, state.interestRateApr]);

  const yearlyDetailed15 = useMemo(
    () => aggregateYearlyPaydownDetailed(schedule15, breakdown.loanAmount),
    [schedule15, breakdown.loanAmount]
  );
  const { totalInterest: lifeInterest15, totalPrincipal: lifePrincipal15 } = useMemo(
    () => scheduleTotals(schedule15),
    [schedule15]
  );

  const schedule: AmortizationRow[] = useMemo(() => {
    if (extraPrincipalMonthly > 0) {
      return buildAmortizationScheduleWithExtraPrincipal(
        breakdown.loanAmount,
        state.interestRateApr,
        state.termYears,
        extraPrincipalMonthly
      );
    }
    return baselineSchedule;
  }, [
    baselineSchedule,
    breakdown.loanAmount,
    extraPrincipalMonthly,
    state.interestRateApr,
    state.termYears,
  ]);

  const baselineTotals = useMemo(() => scheduleTotals(baselineSchedule), [baselineSchedule]);

  const yearlyDetailed = useMemo(
    () => aggregateYearlyPaydownDetailed(schedule, breakdown.loanAmount),
    [schedule, breakdown.loanAmount]
  );
  const { totalInterest: lifeInterest, totalPrincipal: lifePrincipal } = useMemo(
    () => scheduleTotals(schedule),
    [schedule]
  );

  const prepaySummary = useMemo(() => {
    if (extraPrincipalMonthly <= 0 || breakdown.loanAmount <= 0) return null;
    const pt = scheduleTotals(schedule);
    const interestSaved = baselineTotals.totalInterest - pt.totalInterest;
    const monthsSaved = baselineSchedule.length - schedule.length;
    const payoffMo = schedule.length;
    return {
      interestSaved,
      monthsSaved,
      payoffMo,
      baselineInterest: baselineTotals.totalInterest,
    };
  }, [
    baselineSchedule.length,
    baselineTotals.totalInterest,
    breakdown.loanAmount,
    schedule,
    extraPrincipalMonthly,
  ]);

  const ltvPct = state.homePrice > 0 ? (breakdown.loanAmount / state.homePrice) * 100 : 0;
  const cashToClose = state.downPayment + state.closingCosts + state.miscInitialCash;

  return (
    <BoxSections>
      <AppSection
        title="Loan inputs"
        description="Set purchase price, down payment, rate, and carrying costs. The header payment updates as you type."
      >
        <MortgageInputsFields state={state} patch={patch} compactGrid inputSize="small" />
      </AppSection>

      <AppSection
        title="Cash to close"
        description="Down payment plus closing and one-time cash — shared with the Upfront tab."
      >
        <MortgageBuyerCashPanel
          state={state}
          patch={patch}
          loanAmount={breakdown.loanAmount}
          cashToClose={cashToClose}
        />
      </AppSection>

      <AppSection
        title="Payment split"
        description={`${moneyDec.format(breakdown.total)} /mo · LTV ${ltvPct.toFixed(1)}% · cash to close ${money.format(cashToClose)}`}
      >
        <Grid container spacing={2.5} alignItems="flex-start">
          <Grid size={{ xs: 12, md: 7 }}>
            <MortgagePaymentBreakdown breakdown={breakdown} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <MortgageLoanSummaryCard
              state={state}
              breakdown={breakdown}
              cashToClose={cashToClose}
              ltvPct={ltvPct}
              lifeInterest={lifeInterest}
              lifePrincipal={lifePrincipal}
              extraPrincipalMonthly={extraPrincipalMonthly}
              prepaySummary={prepaySummary}
            />
          </Grid>
        </Grid>
      </AppSection>

      <AppSection title="Compare & dig deeper" description="Loan length, year-by-year paydown, and refinance timing.">
        <Stack spacing={1.25}>
          <Accordion defaultExpanded={false} disableGutters elevation={0}>
            <AccordionSummary expandIcon={<ExpandMore />} sx={summarySx}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                alignItems={{ sm: "flex-end" }}
                justifyContent="space-between"
                sx={{ width: "100%", gap: 1 }}
              >
                <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="subtitle2">Compare loan length</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Monthly split, life interest, 15−30 deltas
                  </Typography>
                </Stack>
                <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1.25} sx={{ flexShrink: 0 }}>
                  <AccordionSummaryMetric label="Loan" value={money.format(breakdown.loanAmount)} />
                  <AccordionSummaryMetric label="P&I /mo" value={moneyDec.format(breakdown.principalAndInterest)} />
                </Stack>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <MortgageLoanCompareCards state={state} />
            </AccordionDetails>
          </Accordion>

          {breakdown.loanAmount > 0 ? (
            <Accordion defaultExpanded={false} disableGutters elevation={0}>
              <AccordionSummary expandIcon={<ExpandMore />} sx={summarySx}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ sm: "flex-end" }}
                  justifyContent="space-between"
                  sx={{ width: "100%", gap: 1 }}
                >
                  <Stack spacing={0.15} sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="subtitle2">Year-by-year (15-yr vs loan term)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      One table; 15-yr columns blank after payoff
                    </Typography>
                  </Stack>
                  <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1.25} sx={{ flexShrink: 0 }}>
                    <AccordionSummaryMetric label="Life int (15-yr)" value={money.format(lifeInterest15)} />
                    <AccordionSummaryMetric
                      label={`Life int (${state.termYears}-yr)`}
                      value={money.format(lifeInterest)}
                    />
                  </Stack>
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <PaydownYearlyColorLegend />
                <PaydownYearlyMergedCompare
                  rows15={yearlyDetailed15}
                  rowsTerm={yearlyDetailed}
                  termYearsLabel={state.termYears}
                  lifePrincipal15={lifePrincipal15}
                  lifeInterest15={lifeInterest15}
                  lifePrincipalTerm={lifePrincipal}
                  lifeInterestTerm={lifeInterest}
                />
              </AccordionDetails>
            </Accordion>
          ) : null}

          {breakdown.loanAmount > 0 ? (
            <Accordion defaultExpanded={false} disableGutters elevation={0}>
              <AccordionSummary expandIcon={<ExpandMore />} sx={summarySx}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ sm: "flex-end" }}
                  justifyContent="space-between"
                  sx={{ width: "100%", gap: 1 }}
                >
                  <Stack spacing={0.15} sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="subtitle2">Refi breakeven</Typography>
                    <Typography variant="caption" color="text.secondary">
                      New rate vs costs · months to recover
                    </Typography>
                  </Stack>
                  <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1.25} sx={{ flexShrink: 0 }}>
                    <AccordionSummaryMetric label="P&I now" value={moneyDec.format(breakdown.principalAndInterest)} />
                    <AccordionSummaryMetric label="Note %" value={`${state.interestRateApr}%`} />
                  </Stack>
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <MortgageRefiBreakevenCard
                  scenarioLoanAmount={breakdown.loanAmount}
                  scenarioPrincipalAndInterest={breakdown.principalAndInterest}
                  scenarioAprPercent={state.interestRateApr}
                  defaultRefiClosingCosts={state.closingCosts}
                  schedule={schedule}
                />
              </AccordionDetails>
            </Accordion>
          ) : null}
        </Stack>
      </AppSection>

      <AppSection
        title="Affordability"
        description="Front- and back-end DTI from your income and other debt."
      >
        <MortgageAffordabilityDtiPanel
          state={state}
          patch={patch}
          currentHousingPaymentMonthly={breakdown.total}
        />
      </AppSection>

      <Alert severity="info" variant="outlined" sx={{ mt: 1, mb: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45, display: "block" }}>
          Single-scenario calculator — no listings or live rates. Numbers stay in your browser until export or reset.
        </Typography>
      </Alert>
    </BoxSections>
  );
}

function BoxSections({ children }: { children: ReactNode }) {
  return <Stack spacing={0}>{children}</Stack>;
}
