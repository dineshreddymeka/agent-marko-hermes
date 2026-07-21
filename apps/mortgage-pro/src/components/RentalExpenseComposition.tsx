import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { RentalPieSlice } from "../lib/rentalMath";

const moneyDec = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const PALETTE_KEYS = [
  "primary.main",
  "secondary.main",
  "success.main",
  "warning.main",
  "info.main",
  "error.main",
] as const;

type Props = {
  slices: RentalPieSlice[];
};

function sliceColor(theme: Theme, i: number): string {
  const key = PALETTE_KEYS[i % PALETTE_KEYS.length];
  if (key === "primary.main") return theme.palette.primary.main;
  if (key === "secondary.main") return theme.palette.secondary.main;
  if (key === "success.main") return theme.palette.success.main;
  if (key === "warning.main") return theme.palette.warning.main;
  if (key === "info.main") return theme.palette.info.main;
  return theme.palette.error.main;
}

function pctLabel(amount: number, total: number): string {
  const p = total > 0 ? (amount / total) * 100 : 0;
  if (p > 0 && p < 0.5) return "<1%";
  return `${p.toFixed(0)}%`;
}

export function RentalExpenseComposition({ slices }: Props) {
  const theme = useTheme();
  const total = slices.reduce((a, s) => a + s.amount, 0);

  if (total <= 0) {
    return (
      <Typography variant="caption" color="text.secondary">
        No P&amp;I + operating obligations to show (check loan and expenses).
      </Typography>
    );
  }

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, letterSpacing: "-0.02em" }}>
            Monthly obligations
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35, display: "block" }}>
            P&amp;I + property tax, insurance, HOA, mgmt, maintenance, CapEx reserve
          </Typography>
        </Box>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            color: "text.primary",
          }}
        >
          Total {moneyDec.format(total)}/mo
        </Typography>
      </Stack>

      <Grid container spacing={0.75} columns={12}>
        {slices.map((s, i) => {
          const color = sliceColor(theme, i);
          return (
            <Grid size={{ xs: 12, sm: 6 }} key={s.id}>
              <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ py: 0.25 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: 0.5,
                    bgcolor: color,
                    flexShrink: 0,
                    mt: 0.35,
                  }}
                />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3, display: "block" }}>
                    {s.label}
                  </Typography>
                  <Stack direction="row" spacing={0.75} alignItems="baseline" flexWrap="wrap" useFlexGap>
                    <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {moneyDec.format(s.amount)}/mo
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {pctLabel(s.amount, total)} of obligations
                    </Typography>
                  </Stack>
                </Box>
              </Stack>
            </Grid>
          );
        })}
      </Grid>
    </Stack>
  );
}
