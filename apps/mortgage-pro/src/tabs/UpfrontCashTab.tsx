import Grid from "@mui/material/Grid2";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { AppSection } from "../components/AppSection";
import { UpfrontCashScenarioPanel } from "../components/UpfrontCashScenarioPanel";
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

export type UpfrontCashTabProps = {
  state: AppPersisted;
  patch: (partial: Partial<AppPersisted>) => void;
};

function formatNumberField(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value);
}

function formatPercentField(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function UpfrontCashTab({ state, patch }: UpfrontCashTabProps) {
  const loanAmount = Math.max(0, state.homePrice - state.downPayment);
  const cashToClose = state.downPayment + state.closingCosts + state.miscInitialCash;

  return (
    <Stack spacing={0}>
      <AppSection
        title="Cash at settlement"
        description="Down payment + closing bucket + misc one-time. Same total whether you call it cash to close or upfront cash to buy."
        aside={
          <Stack spacing={0.25} sx={{ textAlign: { xs: "left", sm: "right" } }}>
            <Typography variant="overline" color="secondary.dark">
              Total due
            </Typography>
            <Typography
              sx={{
                fontFamily: "var(--pp-font-display)",
                fontWeight: 800,
                fontSize: "1.85rem",
                letterSpacing: "-0.035em",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {moneyDec.format(cashToClose)}
            </Typography>
          </Stack>
        }
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 2, sm: 4 }}
          sx={{ pt: 0.5 }}
        >
          <Stack spacing={0.35}>
            <Typography variant="caption" color="text.secondary">
              Down payment
            </Typography>
            <Typography variant="h6" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {money.format(state.downPayment)}
            </Typography>
          </Stack>
          <Stack spacing={0.35}>
            <Typography variant="caption" color="text.secondary">
              Closing + misc
            </Typography>
            <Typography variant="h6" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {money.format(state.closingCosts + state.miscInitialCash)}
            </Typography>
          </Stack>
          <Stack spacing={0.35}>
            <Typography variant="caption" color="text.secondary">
              Amount financed
            </Typography>
            <Typography variant="h6" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {money.format(loanAmount)}
            </Typography>
          </Stack>
        </Stack>
      </AppSection>

      <AppSection title="Your inputs" description="Edits sync with Mortgage and Rental.">
        <Grid container spacing={1.5}>
          <Grid size={12}>
            <TextField
              label="Purchase price"
              size="small"
              fullWidth
              helperText="Syncs annual tax $ when you use tax % on Mortgage"
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
          </Grid>
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
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Closing costs (fees & prepaids bucket)"
              size="small"
              fullWidth
              helperText="Single line — compare to modeled split below"
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
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Misc. one-time at close"
              size="small"
              fullWidth
              helperText="Moving, repairs, appliances — not monthly"
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
          </Grid>
        </Grid>
      </AppSection>

      <AppSection
        title="Modeled buyer costs"
        description="Line-item estimate versus the closing number you entered above."
      >
        <UpfrontCashScenarioPanel
          state={state}
          patch={patch}
          loanAmount={loanAmount}
          cashToClose={cashToClose}
          hideEditHint
        />
      </AppSection>
    </Stack>
  );
}
