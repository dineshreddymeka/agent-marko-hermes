import ExpandMore from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid2";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import { AccordionSummaryMetric } from "./AccordionSummaryMetric";
import { dtiRatios, maxHomePriceForHousingBudget } from "../lib/mortgageMath";
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

function formatIntField(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value));
}

function dtiChipLabel(name: string, pct: number | null): string {
  if (pct == null) return `${name} —`;
  return `${name} ${pct.toFixed(1)}%`;
}

function dtiChipColor(
  pct: number | null,
  soft: "front" | "back"
): "default" | "success" | "warning" | "error" {
  if (pct == null) return "default";
  const hi = soft === "front" ? 31 : 41;
  const mid = soft === "front" ? 28 : 36;
  if (pct <= mid) return "success";
  if (pct <= hi) return "warning";
  return "error";
}

type Props = {
  state: AppPersisted;
  patch: (partial: Partial<AppPersisted>) => void;
  currentHousingPaymentMonthly: number;
};

export function MortgageAffordabilityDtiPanel({ state, patch, currentHousingPaymentMonthly }: Props) {
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null);

  const baseParams = useMemo(
    () => ({
      downPaymentPercent: state.downPaymentPercent,
      interestRateApr: state.interestRateApr,
      termYears: state.termYears,
      propertyTaxPercent: state.propertyTaxPercent,
      insuranceAnnual: state.insuranceAnnual,
      hoaMonthly: state.hoaMonthly,
      explicitPmiMonthly: state.pmiMonthly,
    }),
    [
      state.downPaymentPercent,
      state.interestRateApr,
      state.termYears,
      state.propertyTaxPercent,
      state.insuranceAnnual,
      state.hoaMonthly,
      state.pmiMonthly,
    ]
  );

  const dti = useMemo(
    () =>
      dtiRatios(state.annualGrossIncome, currentHousingPaymentMonthly, state.monthlyNonMortgageDebt),
    [state.annualGrossIncome, state.monthlyNonMortgageDebt, currentHousingPaymentMonthly]
  );

  const maxFrom28 = useMemo(() => {
    if (state.annualGrossIncome <= 0) return 0;
    const cap = (state.annualGrossIncome / 12) * 0.28;
    return maxHomePriceForHousingBudget(cap, baseParams);
  }, [state.annualGrossIncome, baseParams]);

  const customBudget =
    budgetDraft !== null && budgetDraft !== ""
      ? Math.max(0, Number(budgetDraft.replace(/[^0-9.]/g, "")) || 0)
      : 0;
  const maxFromCustom = useMemo(() => {
    if (customBudget <= 0) return 0;
    return maxHomePriceForHousingBudget(customBudget, baseParams);
  }, [customBudget, baseParams]);

  return (
    <Accordion
      defaultExpanded={false}
      disableGutters
      elevation={0}
      sx={{
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "transparent",
        boxShadow: "none",
        "&:before": { display: "none" },
        "&.Mui-expanded": { borderColor: "secondary.main" },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMore />}
        sx={{
          px: 1.25,
          minHeight: 52,
          alignItems: "flex-start",
          "&:hover": { bgcolor: "action.hover" },
          "& .MuiAccordionSummary-content": { my: 0.75, width: "100%", maxWidth: "calc(100% - 36px)" },
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ sm: "flex-end" }}
          justifyContent="space-between"
          sx={{ width: "100%", gap: 1 }}
        >
          <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Affordability &amp; DTI
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
              Income, debts, rough max price — expand to edit
            </Typography>
          </Stack>
          <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1.25} sx={{ flexShrink: 0 }}>
            <AccordionSummaryMetric label="Housing /mo" value={moneyDec.format(currentHousingPaymentMonthly)} />
            <AccordionSummaryMetric
              label="Front DTI"
              value={
                state.annualGrossIncome > 0 && dti.frontEndPct != null
                  ? `${dti.frontEndPct.toFixed(1)}%`
                  : "—"
              }
            />
            <AccordionSummaryMetric
              label="28% max price"
              value={maxFrom28 > 0 ? money.format(maxFrom28) : "—"}
            />
          </Stack>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.25, lineHeight: 1.45 }}>
          Estimates only — not a lender decision. Uses your <strong>rate, term, down %, tax %, insurance, HOA, PMI</strong>{" "}
          rules from above. Tax scales with price; insurance stays at your annual figure while searching max price.
        </Typography>

        <Grid container spacing={1.25}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Annual gross income (pre-tax)"
              size="small"
              fullWidth
              value={formatIntField(state.annualGrossIncome)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^0-9]/g, ""));
                if (Number.isFinite(n)) patch({ annualGrossIncome: Math.min(50_000_000, Math.max(0, n)) });
              }}
              helperText="0 = skip DTI numbers"
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  inputMode: "numeric",
                },
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Monthly non-housing debt"
              size="small"
              fullWidth
              value={formatIntField(state.monthlyNonMortgageDebt)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^0-9]/g, ""));
                if (Number.isFinite(n)) patch({ monthlyNonMortgageDebt: Math.min(500_000, Math.max(0, n)) });
              }}
              helperText="Cards, auto, student loans…"
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  inputMode: "numeric",
                },
              }}
            />
          </Grid>
        </Grid>

        {state.annualGrossIncome > 0 ? (
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              Housing payment in DTI: <strong>{moneyDec.format(currentHousingPaymentMonthly)}</strong>/mo (same as your
              estimated payment total above).
            </Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75} alignItems="center">
              <Chip
                size="small"
                variant="outlined"
                color={dtiChipColor(dti.frontEndPct, "front")}
                label={dtiChipLabel("Front-end DTI", dti.frontEndPct)}
              />
              <Chip
                size="small"
                variant="outlined"
                color={dtiChipColor(dti.backEndPct, "back")}
                label={dtiChipLabel("Back-end DTI", dti.backEndPct)}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
              Front-end = housing ÷ gross monthly income. Back-end = (housing + other debts) ÷ gross monthly. Many
              lenders use ~28% / 36% as rough guides — not universal.
            </Typography>
            {maxFrom28 > 0 ? (
              <Alert severity="info" variant="outlined" sx={{ py: 0.5, borderRadius: 1.5 }}>
                <strong>28% rule rough max price</strong> (housing ≤ 28% of gross monthly): about{" "}
                <strong>{money.format(maxFrom28)}</strong> with the same loan assumptions as this tab.
              </Alert>
            ) : null}
          </Stack>
        ) : null}

        <Stack spacing={1} sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Max price for a monthly budget
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "flex-end" }}>
            <TextField
              label="Max housing payment / mo"
              size="small"
              sx={{ minWidth: { sm: 220 } }}
              value={budgetDraft !== null ? budgetDraft : ""}
              onChange={(e) => setBudgetDraft(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={() => setBudgetDraft(null)}
              placeholder="e.g. 3200"
              helperText="PITI + HOA + PMI total you’re comfortable with"
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  inputMode: "numeric",
                },
              }}
            />
          </Stack>
          {maxFromCustom > 0 ? (
            <Typography variant="body2">
              At ≤ <strong>{moneyDec.format(customBudget)}</strong>/mo housing: estimated max price about{" "}
              <strong>{money.format(maxFromCustom)}</strong>.
            </Typography>
          ) : customBudget > 0 ? (
            <Typography variant="caption" color="text.secondary">
              No price found in the search range for that budget with current taxes/rate — try a higher budget or lower
              rate.
            </Typography>
          ) : null}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
