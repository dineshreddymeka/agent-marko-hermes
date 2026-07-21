import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid2";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import {
  balanceAfterCompletedLoanYears,
  monthlyPiForRefi,
  refiBreakevenMonthsFromSavings,
  type AmortizationRow,
} from "../lib/mortgageMath";

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatNumberField(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value);
}

export type MortgageRefiBreakevenCardProps = {
  /** Loan amount from the active scenario (starting balance default). */
  scenarioLoanAmount: number;
  /** Current scenario P&amp;I (defaults “your payment before refi”). */
  scenarioPrincipalAndInterest: number;
  /** Scenario note rate — seeds “new rate” when it changes. */
  scenarioAprPercent: number;
  /** Suggested refi closing costs default (e.g. scenario closingCosts). */
  defaultRefiClosingCosts: number;
  /**
   * Current-loan amortization (same as Mortgage tab). When set, user can pick a completed loan year
   * to snap “balance to refinance” to the modeled remaining balance.
   */
  schedule?: AmortizationRow[] | null;
};

export function MortgageRefiBreakevenCard({
  scenarioLoanAmount,
  scenarioPrincipalAndInterest,
  scenarioAprPercent,
  defaultRefiClosingCosts,
  schedule = null,
}: MortgageRefiBreakevenCardProps) {
  const [balance, setBalance] = useState(scenarioLoanAmount);
  const [currentPi, setCurrentPi] = useState(scenarioPrincipalAndInterest);
  const [newRate, setNewRate] = useState(scenarioAprPercent);
  const [newTerm, setNewTerm] = useState(30);
  const [refiCosts, setRefiCosts] = useState(defaultRefiClosingCosts);
  const [loanYearEndPick, setLoanYearEndPick] = useState(0);

  const scheduleLen = schedule?.length ?? 0;
  const maxLoanYearEnd = useMemo(
    () => (scheduleLen > 0 ? Math.max(1, Math.ceil(scheduleLen / 12)) : 0),
    [scheduleLen]
  );

  useEffect(() => {
    setCurrentPi(scenarioPrincipalAndInterest);
  }, [scenarioPrincipalAndInterest]);

  useEffect(() => {
    setRefiCosts(defaultRefiClosingCosts);
  }, [defaultRefiClosingCosts]);

  /** Reset timepoint when the modeled loan changes; snap balance from pick (usually year 0). */
  useEffect(() => {
    setLoanYearEndPick(0);
    setBalance(balanceAfterCompletedLoanYears(schedule ?? [], 0, scenarioLoanAmount));
  }, [scenarioLoanAmount, schedule]);

  const newPi = useMemo(
    () => monthlyPiForRefi(balance, newRate, newTerm),
    [balance, newRate, newTerm]
  );

  const monthlySavings = currentPi - newPi;
  const breakevenMo = useMemo(
    () => refiBreakevenMonthsFromSavings(refiCosts, currentPi, newPi),
    [refiCosts, currentPi, newPi]
  );

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
          Refinance breakeven (P&amp;I)
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5, lineHeight: 1.45 }}>
          Compare a new fixed-rate loan on your <strong>remaining balance</strong> to your current <strong>P&amp;I</strong>{" "}
          (level each month on a fixed loan). Pick how far you are into the <strong>current</strong> loan to snap the
          balance from the amortization model, then edit if needed. Ignores taxes, insurance, and PMI.
        </Typography>
        <Grid container spacing={1.5}>
          {scheduleLen > 0 ? (
            <Grid size={12}>
              <TextField
                label="Where you are on the current loan (snap balance)"
                size="small"
                fullWidth
                select
                SelectProps={{ native: true }}
                value={loanYearEndPick}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  setLoanYearEndPick(y);
                  if (schedule?.length) {
                    setBalance(balanceAfterCompletedLoanYears(schedule, y, scenarioLoanAmount));
                  }
                }}
                helperText="End of loan year = after 12× that many payments on this tab’s schedule (incl. extra principal if modeled)."
              >
                <option value={0}>Year 0 — at closing (orig. loan amount)</option>
                {Array.from({ length: maxLoanYearEnd }, (_, i) => i + 1).map((y) => {
                  const monthsThru = Math.min(y * 12, scheduleLen);
                  return (
                    <option key={y} value={y}>
                      After loan year {y} (through mo {monthsThru})
                    </option>
                  );
                })}
              </TextField>
            </Grid>
          ) : null}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Loan balance to refinance"
              size="small"
              fullWidth
              value={formatNumberField(balance)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                if (Number.isFinite(n)) setBalance(Math.max(0, n));
              }}
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Your current P&amp;I (before refi)"
              size="small"
              fullWidth
              value={formatNumberField(Math.round(currentPi * 100) / 100)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                if (Number.isFinite(n)) setCurrentPi(Math.max(0, n));
              }}
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="New rate (APR)"
              size="small"
              fullWidth
              value={formatNumberField(newRate)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                if (Number.isFinite(n)) setNewRate(Math.max(0, n));
              }}
              slotProps={{
                input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="New term"
              size="small"
              fullWidth
              select
              SelectProps={{ native: true }}
              value={newTerm}
              onChange={(e) => setNewTerm(Number(e.target.value))}
            >
              {[10, 15, 20, 25, 30].map((y) => (
                <option key={y} value={y}>
                  {y} years
                </option>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Refi closing costs"
              size="small"
              fullWidth
              value={formatNumberField(refiCosts)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                if (Number.isFinite(n)) setRefiCosts(Math.max(0, n));
              }}
              slotProps={{
                input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
              }}
            />
          </Grid>
        </Grid>

        <Stack spacing={0.75} sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            New estimated P&amp;I: <strong>{money.format(newPi)}</strong>/mo
          </Typography>
          {monthlySavings > 0 ? (
            <Typography variant="body2" color="success.main">
              Monthly P&amp;I savings: <strong>{money.format(monthlySavings)}</strong>/mo vs your current P&amp;I
            </Typography>
          ) : monthlySavings < 0 ? (
            <Typography variant="body2" color="warning.main">
              New P&amp;I is higher by <strong>{money.format(-monthlySavings)}</strong>/mo — no simple payback on
              costs alone.
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Same P&amp;I at these inputs.
            </Typography>
          )}
          {breakevenMo != null && monthlySavings > 0 ? (
            <Typography variant="body2">
              Payback on closing costs:{" "}
              <strong>
                {breakevenMo === 0
                  ? "immediate ($0 net costs)"
                  : breakevenMo < 12
                    ? `${breakevenMo.toFixed(1)} months`
                    : `${(breakevenMo / 12).toFixed(2)} years (${breakevenMo.toFixed(0)} mo)`}
              </strong>
            </Typography>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
