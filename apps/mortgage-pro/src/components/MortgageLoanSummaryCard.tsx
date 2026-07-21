import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import type { MonthlyBreakdown } from "../lib/mortgageMath";
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

export type PrepaySummary = {
  interestSaved: number;
  monthsSaved: number;
  payoffMo: number;
};

export type MortgageLoanSummaryCardProps = {
  state: AppPersisted;
  breakdown: MonthlyBreakdown;
  cashToClose: number;
  ltvPct: number;
  lifeInterest: number;
  lifePrincipal: number;
  extraPrincipalMonthly: number;
  prepaySummary: PrepaySummary | null;
};

function formatYearsMonthsFromMonths(totalMonths: number): string {
  const m = Math.max(0, Math.round(totalMonths));
  if (m <= 0) return "—";
  const y = Math.floor(m / 12);
  const r = m % 12;
  if (y <= 0) return `${r} mo`;
  if (r === 0) return `${y} yr`;
  return `${y} yr ${r} mo`;
}

function StatTile({
  kicker,
  value,
  hint,
}: {
  kicker: string;
  value: string;
  hint?: string;
}) {
  return (
    <Paper
      elevation={0}
      variant="outlined"
      sx={{
        p: { xs: 0.85, sm: 1 },
        height: "100%",
        borderRadius: 1,
        borderColor: "divider",
        bgcolor: "transparent",
        boxShadow: "none",
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontSize: "0.65rem",
          color: "text.secondary",
          display: "block",
          mb: 0.2,
        }}
      >
        {kicker}
      </Typography>
      <Typography
        variant="h6"
        sx={{
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.03em",
          lineHeight: 1.12,
          fontSize: { xs: "1rem", sm: "1.1rem" },
          fontFamily: "var(--pp-font-display)",
          color: "text.primary",
        }}
      >
        {value}
      </Typography>
      {hint ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25, lineHeight: 1.25, fontSize: "0.68rem" }}>
          {hint}
        </Typography>
      ) : null}
    </Paper>
  );
}

function SectionTitle({ children, tightTop }: { children: ReactNode; tightTop?: boolean }) {
  return (
    <Typography
      variant="overline"
      sx={{
        display: "block",
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: "text.secondary",
        mt: tightTop ? 0.35 : 1,
        mb: 0.35,
        fontSize: "0.65rem",
      }}
    >
      {children}
    </Typography>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      gap={1.5}
      sx={(t) => ({
        py: 0.4,
        px: 0.5,
        mx: -0.5,
        borderRadius: 1,
        borderBottom: `1px solid ${alpha(t.palette.divider, 0.9)}`,
        "&:hover": { bgcolor: alpha(t.palette.secondary.main, t.palette.mode === "light" ? 0.06 : 0.1) },
      })}
    >
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.25, fontSize: "0.78rem" }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
          fontSize: "0.78rem",
          lineHeight: 1.25,
          flexShrink: 0,
        }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

export function MortgageLoanSummaryCard({
  state,
  breakdown,
  cashToClose,
  ltvPct,
  lifeInterest,
  lifePrincipal,
  extraPrincipalMonthly,
  prepaySummary,
}: MortgageLoanSummaryCardProps) {
  const hasLoan = breakdown.loanAmount > 0;

  return (
    <Card
      variant="outlined"
      elevation={0}
      sx={{
        borderRadius: 1,
        overflow: "hidden",
        borderColor: "divider",
        boxShadow: "none",
        bgcolor: "transparent",
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1.1,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "transparent",
        }}
      >
        <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: "0.12em", color: "text.secondary" }}>
          Loan summary
        </Typography>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: "-0.02em", mt: 0.15, fontSize: "1rem" }}>
          At a glance
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.35, lineHeight: 1.3, fontSize: "0.7rem" }}>
          Key numbers for this scenario.
        </Typography>
      </Box>

      <CardContent sx={{ pt: 1.25, pb: 1.25, px: 1.5, "&:last-child": { pb: 1.25 } }}>
        <Grid container spacing={0.75}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <StatTile kicker="Loan amount" value={money.format(breakdown.loanAmount)} hint="Financed at purchase" />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <StatTile
              kicker="P&amp;I / month"
              value={hasLoan ? moneyDec.format(breakdown.principalAndInterest) : "—"}
              hint="Principal + interest"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <StatTile kicker="Cash to close" value={money.format(cashToClose)} hint="Down + closing + misc" />
          </Grid>
        </Grid>

        <Divider sx={{ my: 0.75 }} />

        <SectionTitle tightTop>Purchase &amp; equity</SectionTitle>
        <Stack spacing={0}>
          <DetailRow
            label="Down payment"
            value={`${money.format(state.downPayment)} (${state.downPaymentPercent.toFixed(1)}%)`}
          />
          <DetailRow label="Cash to close (full detail)" value={money.format(cashToClose)} />
        </Stack>

        {hasLoan ? (
          <>
            <SectionTitle>Loan terms</SectionTitle>
            <Stack spacing={0}>
              <DetailRow label="Term" value={`${state.termYears} years`} />
              <DetailRow label="LTV (loan / price)" value={`${ltvPct.toFixed(2)}%`} />
              <DetailRow label="Note rate" value={`${state.interestRateApr}% APR`} />
              {breakdown.pmi > 0.001 ? (
                <DetailRow label="PMI (monthly)" value={moneyDec.format(breakdown.pmi)} />
              ) : (
                <DetailRow label="PMI (monthly)" value="$0.00" />
              )}
            </Stack>

            <SectionTitle>Life of loan (P&amp;I)</SectionTitle>
            <Stack spacing={0}>
              <DetailRow label="Total interest" value={money.format(lifeInterest)} />
              <DetailRow label="Total principal paid" value={money.format(lifePrincipal)} />
            </Stack>

            {prepaySummary ? (
              <>
                <SectionTitle>Prepayment (modeled)</SectionTitle>
                <Stack spacing={0}>
                  <DetailRow label="Extra principal" value={`${money.format(extraPrincipalMonthly)}/mo`} />
                  <DetailRow label="Payoff timing" value={formatYearsMonthsFromMonths(prepaySummary.payoffMo)} />
                  <DetailRow
                    label="Time vs no prepay"
                    value={
                      prepaySummary.monthsSaved > 0
                        ? `${prepaySummary.monthsSaved} mo shorter`
                        : "Same length (try a larger add-on)"
                    }
                  />
                  <DetailRow
                    label="Interest vs no prepay"
                    value={
                      prepaySummary.interestSaved > 0
                        ? `${money.format(prepaySummary.interestSaved)} less`
                        : money.format(0)
                    }
                  />
                </Stack>
              </>
            ) : null}
          </>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, lineHeight: 1.35 }}>
            Enter purchase price and down payment to see loan terms and life-of-loan totals.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
