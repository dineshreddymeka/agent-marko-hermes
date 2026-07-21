import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import type { MonthlyBreakdown } from "../lib/mortgageMath";

const moneyDec = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Segment = { key: string; label: string; amount: number; color: string };

export function MortgagePaymentBreakdown(props: { breakdown: MonthlyBreakdown }) {
  const theme = useTheme();
  const b = props.breakdown;
  const t = b.total > 0 ? b.total : 1;

  const segments: Segment[] = [
    { key: "pi", label: "Principal & interest", amount: b.principalAndInterest, color: theme.palette.primary.main },
    { key: "tax", label: "Property taxes", amount: b.propertyTax, color: theme.palette.info.main },
    { key: "ins", label: "Home insurance", amount: b.insurance, color: theme.palette.secondary.main },
    ...(b.hoa > 0.001
      ? [{ key: "hoa", label: "HOA", amount: b.hoa, color: theme.palette.success.main } as Segment]
      : []),
    ...(b.pmi > 0.001
      ? [{ key: "pmi", label: "PMI", amount: b.pmi, color: theme.palette.warning.main } as Segment]
      : []),
  ].filter((s) => s.amount > 0.001);

  return (
    <Stack spacing={1.25}>
      <Box
        sx={{
          display: "flex",
          height: 10,
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: alpha(theme.palette.divider, theme.palette.mode === "dark" ? 0.35 : 0.55),
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        {segments.map((s) => (
          <Box
            key={s.key}
            title={`${s.label}: ${moneyDec.format(s.amount)}`}
            sx={{
              width: `${(s.amount / t) * 100}%`,
              minWidth: s.amount > 0.001 ? 4 : 0,
              bgcolor: s.color,
              transition: "width 0.2s ease",
            }}
          />
        ))}
      </Box>
      <Stack spacing={0.65}>
        {segments.map((s) => (
          <Stack key={s.key} direction="row" justifyContent="space-between" alignItems="center" gap={1}>
            <Stack direction="row" alignItems="center" gap={0.75}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: 0.5,
                  bgcolor: s.color,
                  flexShrink: 0,
                }}
              />
              <Typography variant="body2" color="text.secondary">
                {s.label}
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              {moneyDec.format(s.amount)}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
