import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useCallback, useMemo } from "react";
import { applyBuyerCostLineOverrides, estimateHomeBuyingOneTimeCosts } from "../lib/buyingCostsMath";
import type { AppPersisted } from "../storage/mortgageState";

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatNumberField(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(value);
}

export type UpfrontCashScenarioPanelProps = {
  state: AppPersisted;
  patch: (partial: Partial<AppPersisted>) => void;
  loanAmount: number;
  cashToClose: number;
  /** Hide the line about where to edit closing/misc (when this panel is already on the dedicated tab). */
  hideEditHint?: boolean;
};

export function UpfrontCashScenarioPanel({
  state,
  patch,
  loanAmount,
  cashToClose,
  hideEditHint = false,
}: UpfrontCashScenarioPanelProps) {
  const baseEst = useMemo(
    () =>
      estimateHomeBuyingOneTimeCosts({
        homePrice: state.homePrice,
        loanAmount,
        propertyTaxAnnual: state.propertyTaxAnnual,
        insuranceAnnual: state.insuranceAnnual,
        hoaMonthly: state.hoaMonthly,
      }),
    [
      state.homePrice,
      loanAmount,
      state.propertyTaxAnnual,
      state.insuranceAnnual,
      state.hoaMonthly,
    ]
  );

  const est = useMemo(
    () => applyBuyerCostLineOverrides(baseEst, state.buyingCostLineOverrides),
    [baseEst, state.buyingCostLineOverrides]
  );

  const setLineAmount = useCallback(
    (id: string, baseAmount: number, rawInput: string) => {
      const digits = rawInput.replace(/\D/g, "");
      const prev = state.buyingCostLineOverrides;
      if (digits === "") {
        if (!prev?.[id]) return;
        const next = { ...prev };
        delete next[id];
        patch({
          buyingCostLineOverrides: Object.keys(next).length > 0 ? next : undefined,
        });
        return;
      }
      const n = Math.max(0, Math.round(Number(digits)));
      if (n === baseAmount) {
        if (!prev?.[id]) return;
        const next = { ...prev };
        delete next[id];
        patch({
          buyingCostLineOverrides: Object.keys(next).length > 0 ? next : undefined,
        });
        return;
      }
      patch({
        buyingCostLineOverrides: { ...(prev ?? {}), [id]: n },
      });
    },
    [patch, state.buyingCostLineOverrides]
  );

  const closing = Math.max(0, state.closingCosts);
  const misc = Math.max(0, state.miscInitialCash);
  const down = Math.max(0, state.downPayment);
  const delta = est.suggestedClosingTotal - closing;

  return (
    <Stack spacing={1}>
      {!hideEditHint ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.35 }}>
          Edit down / closing / misc on the <strong>Upfront</strong> tab or under Rental → carrying costs. Modeled lines
          below are <strong>editable</strong> and saved with this scenario; totals compare to your entered closing bucket
          — not a Loan Estimate.
        </Typography>
      ) : (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.35 }}>
          <strong>Calculator-style</strong> fee / prepaid split — not a Loan Estimate. Lines use your scenario inputs
          and are <strong>editable</strong>; overrides persist with the scenario.
        </Typography>
      )}

      <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.5}>
        <Stat label="Down" value={money.format(down)} />
        <Stat label="Closing (entered)" value={money.format(closing)} />
        <Stat label="Misc one-time" value={money.format(misc)} />
        <Stat label="Total cash" value={money.format(cashToClose)} emphasized />
      </Stack>

      <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
        <Table size="small" padding="checkbox">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, py: 0.5, fontSize: "0.7rem" }}>Modeled line</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, py: 0.5, fontSize: "0.7rem", width: "28%" }}>
                Amount
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {est.lines.map((l) => {
              const baseAmount = baseEst.lines.find((b) => b.id === l.id)?.amount ?? l.amount;
              const overridden = state.buyingCostLineOverrides?.[l.id] !== undefined;
              return (
                <TableRow key={l.id}>
                  <TableCell sx={{ py: 0.35, fontSize: "0.72rem", lineHeight: 1.25 }}>
                    {l.label}
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                      ({l.kind === "fee" ? "fee" : "prepaid"}
                      {overridden ? " · edited" : ""})
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 0.25, width: "32%", maxWidth: 140 }}>
                    <TextField
                      size="small"
                      variant="outlined"
                      fullWidth
                      value={formatNumberField(l.amount)}
                      onChange={(e) => setLineAmount(l.id, baseAmount, e.target.value)}
                      inputProps={{
                        inputMode: "numeric",
                        "aria-label": `${l.label} amount in dollars`,
                      }}
                      sx={{
                        "& .MuiOutlinedInput-input": {
                          py: 0.35,
                          fontSize: "0.75rem",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        },
                      }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow>
              <TableCell sx={{ fontWeight: 700, py: 0.45, fontSize: "0.72rem" }}>Fees subtotal</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.72rem" }}>
                {money.format(est.feesSubtotal)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, py: 0.45, fontSize: "0.72rem" }}>Prepaids subtotal</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.72rem" }}>
                {money.format(est.prepaidsSubtotal)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ fontWeight: 800, py: 0.5, fontSize: "0.75rem" }}>Suggested closing bucket</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, fontSize: "0.75rem" }}>
                {money.format(est.suggestedClosingTotal)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.35 }}>
        vs entered closing: {delta >= 0 ? "+" : ""}
        {money.format(delta)} ({delta >= 0 ? "model higher" : "model lower"}).
      </Typography>

      <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75}>
        <Button
          size="small"
          variant="outlined"
          color="secondary"
          sx={{ textTransform: "none", fontWeight: 700 }}
          onClick={() => patch({ closingCosts: Math.max(0, Math.round(est.suggestedClosingTotal)) })}
        >
          Set closing to model (fees + prepaids)
        </Button>
        <Button
          size="small"
          variant="text"
          color="inherit"
          sx={{ textTransform: "none", fontWeight: 600 }}
          onClick={() => patch({ closingCosts: Math.max(0, Math.round(est.feesSubtotal)) })}
        >
          Fees only
        </Button>
        <Button
          size="small"
          variant="text"
          color="inherit"
          sx={{ textTransform: "none", fontWeight: 600 }}
          onClick={() => patch({ buyingCostLineOverrides: undefined })}
        >
          Reset lines to formula
        </Button>
      </Stack>
    </Stack>
  );
}

function Stat({ label, value, emphasized }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <Stack spacing={0.1} sx={{ minWidth: 100 }}>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: emphasized ? 800 : 600, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Typography>
    </Stack>
  );
}
