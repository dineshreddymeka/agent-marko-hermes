import { InputAdornment } from "@mui/material";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { estimatePmiMonthly } from "../lib/mortgageMath";
import type { AppPersisted } from "../storage/mortgageState";

export type MortgageInputsFieldsProps = {
  state: AppPersisted;
  patch: (partial: Partial<AppPersisted>) => void;
  /** Helper under purchase price (e.g. cap rate note on Mortgage tab). */
  purchasePriceHelperText?: string;
  /** Defaults to medium (Mortgage / Rental). */
  inputSize?: "small" | "medium";
  /**
   * When true (Mortgage tab): up to 4 fields per row on `md+`, smaller gaps, fewer helper lines.
   */
  compactGrid?: boolean;
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

/** 4 per row desktop; 2 on tablet; full width phone */
const q4 = { xs: 12 as const, sm: 6 as const, md: 3 as const };
/** Last row with only 3 main fields (no PMI estimate button) */
const q3 = { xs: 12 as const, sm: 6 as const, md: 4 as const };

export function MortgageInputsFields({
  state,
  patch,
  purchasePriceHelperText = "Used as property value for rental cap rate",
  inputSize = "medium",
  compactGrid = false,
}: MortgageInputsFieldsProps) {
  const g = compactGrid ? q4 : { xs: 12 as const, sm: 6 as const };
  const spacing = compactGrid ? { xs: 0.75, md: 0.5 } : 1;
  const showPmiEstimate = state.downPaymentPercent < 20 && state.homePrice > state.downPayment;

  const hf = {
    purchase: compactGrid ? undefined : purchasePriceHelperText,
    downAmt: compactGrid ? undefined : "Updates % of purchase price",
    downPct: compactGrid ? undefined : "Keeps same % when you change purchase price",
    taxAnnual: compactGrid ? undefined : "Dollar amount per year",
    taxPct: compactGrid ? undefined : "Annual tax as % of purchase price",
    pmi: compactGrid ? undefined : "Private mortgage insurance — usually $0 when down payment is ~20%+",
    extra: compactGrid
      ? "Add-on principal / mo ($0 = none)"
      : "Optional P&amp;I prepayment each month ($0 = none). Shorter payoff changes amortization, yearly detail, and loan summary totals.",
  };

  return (
    <Grid container spacing={spacing}>
      <Grid size={g}>
        <TextField
          label="Purchase price"
          size={inputSize}
          fullWidth
          helperText={hf.purchase}
          title={purchasePriceHelperText}
          value={formatNumberField(state.homePrice)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
            if (!Number.isFinite(n)) return;
            const hp = Math.max(0, n);
            const dpPct = state.downPaymentPercent;
            const taxPct = state.propertyTaxPercent;
            patch({
              homePrice: hp,
              downPayment: Math.round((hp * dpPct) / 100),
              propertyTaxAnnual: Math.round((hp * taxPct) / 100),
            });
          }}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            },
          }}
        />
      </Grid>
      <Grid size={g}>
        <TextField
          label="Down payment ($)"
          size={inputSize}
          fullWidth
          helperText={hf.downAmt}
          title="Updates % of purchase price"
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
      <Grid size={g}>
        <TextField
          label="Down payment (%)"
          size={inputSize}
          fullWidth
          helperText={hf.downPct}
          title="Keeps same % when you change purchase price"
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
      <Grid size={g}>
        <TextField
          label="Interest rate (APR)"
          size={inputSize}
          fullWidth
          value={formatNumberField(state.interestRateApr)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
            if (Number.isFinite(n)) patch({ interestRateApr: Math.max(0, n) });
          }}
          slotProps={{
            input: {
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
            },
          }}
        />
      </Grid>
      <Grid size={g}>
        <TextField
          label="Loan term"
          size={inputSize}
          fullWidth
          select
          SelectProps={{ native: true }}
          value={state.termYears}
          onChange={(e) => patch({ termYears: Number(e.target.value) })}
        >
          {[10, 15, 20, 25, 30].map((y) => (
            <option key={y} value={y}>
              {y} years
            </option>
          ))}
        </TextField>
      </Grid>
      <Grid size={g}>
        <TextField
          label="Property tax (annual)"
          size={inputSize}
          fullWidth
          helperText={hf.taxAnnual}
          title="Annual property tax in dollars"
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
      <Grid size={g}>
        <TextField
          label="Property tax (%)"
          size={inputSize}
          fullWidth
          helperText={hf.taxPct}
          title="Annual tax as % of purchase price"
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
      <Grid size={g}>
        <TextField
          label="Home insurance (annual)"
          size={inputSize}
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
      </Grid>
      {compactGrid ? (
        <>
          <Grid size={showPmiEstimate ? q4 : q3}>
            <TextField
              label="HOA (monthly)"
              size={inputSize}
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
          </Grid>
          <Grid size={showPmiEstimate ? q4 : q3}>
            <TextField
              label="PMI (monthly)"
              size={inputSize}
              fullWidth
              helperText={hf.pmi}
              title="Private mortgage insurance — usually $0 when down is ~20%+"
              value={formatNumberField(state.pmiMonthly)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                if (Number.isFinite(n)) patch({ pmiMonthly: Math.max(0, Math.round(n)) });
              }}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                },
              }}
            />
          </Grid>
          {showPmiEstimate ? (
            <Grid size={q4}>
              <Button
                variant="outlined"
                color="secondary"
                size={inputSize === "small" ? "small" : "medium"}
                fullWidth
                sx={{ height: 56 }}
                onClick={() => {
                  const loan = Math.max(0, state.homePrice - state.downPayment);
                  patch({
                    pmiMonthly: Math.max(0, Math.round(estimatePmiMonthly(loan, state.downPaymentPercent))),
                  });
                }}
              >
                ~0.6%/yr PMI
              </Button>
            </Grid>
          ) : null}
          <Grid size={showPmiEstimate ? q4 : q3}>
            <TextField
              label="Extra principal (monthly)"
              size={inputSize}
              fullWidth
              helperText={hf.extra}
              title="Optional prepayment toward principal each month"
              value={formatNumberField(state.extraPrincipalMonthly)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                if (Number.isFinite(n)) patch({ extraPrincipalMonthly: Math.max(0, Math.round(n)) });
              }}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                },
              }}
            />
          </Grid>
        </>
      ) : (
        <>
          <Grid size={12}>
            <TextField
              label="HOA (monthly)"
              size={inputSize}
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
          </Grid>
          <Grid size={12}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "flex-start" }}>
              <TextField
                label="PMI (monthly)"
                size={inputSize}
                fullWidth
                helperText={hf.pmi}
                title="Private mortgage insurance — usually $0 when down payment is ~20%+"
                value={formatNumberField(state.pmiMonthly)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                  if (Number.isFinite(n)) patch({ pmiMonthly: Math.max(0, Math.round(n)) });
                }}
                slotProps={{
                  input: {
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  },
                }}
              />
              {showPmiEstimate ? (
                <Button
                  variant="outlined"
                  color="secondary"
                  size={inputSize === "small" ? "small" : "medium"}
                  sx={{ flexShrink: 0, alignSelf: { xs: "stretch", sm: "center" }, mt: { xs: 0, sm: 0.5 } }}
                  onClick={() => {
                    const loan = Math.max(0, state.homePrice - state.downPayment);
                    patch({
                      pmiMonthly: Math.max(0, Math.round(estimatePmiMonthly(loan, state.downPaymentPercent))),
                    });
                  }}
                >
                  Use ~0.6%/yr estimate
                </Button>
              ) : null}
            </Stack>
          </Grid>
          <Grid size={12}>
            <TextField
              label="Extra principal (monthly)"
              size={inputSize}
              fullWidth
              helperText={hf.extra}
              title="Optional prepayment toward principal each month"
              value={formatNumberField(state.extraPrincipalMonthly)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
                if (Number.isFinite(n)) patch({ extraPrincipalMonthly: Math.max(0, Math.round(n)) });
              }}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                },
              }}
            />
          </Grid>
        </>
      )}
    </Grid>
  );
}
