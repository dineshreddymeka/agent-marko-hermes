import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import { useMemo } from "react";
import { buildAmortizationSchedule, computeMonthlyPayment, scheduleTotals } from "../lib/mortgageMath";
import type { AppPersisted } from "../storage/mortgageState";

const moneyDec = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const moneyInt = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type Props = { state: AppPersisted };

export function MortgageLoanCompareCards({ state }: Props) {
  const theme = useTheme();
  const apr = state.interestRateApr;
  const b30 = computeMonthlyPayment(
    state.homePrice,
    state.downPayment,
    apr,
    30,
    state.propertyTaxAnnual,
    state.insuranceAnnual,
    state.hoaMonthly,
    state.pmiMonthly
  );
  const b15 = computeMonthlyPayment(
    state.homePrice,
    state.downPayment,
    apr,
    15,
    state.propertyTaxAnnual,
    state.insuranceAnnual,
    state.hoaMonthly,
    state.pmiMonthly
  );
  const selected = state.termYears;

  const { int15, int30, yr1Int15, yr1Int30 } = useMemo(() => {
    const loan = b30.loanAmount;
    if (loan <= 0) {
      return { int15: 0, int30: 0, yr1Int15: 0, yr1Int30: 0 };
    }
    const s15 = buildAmortizationSchedule(loan, apr, 15);
    const s30 = buildAmortizationSchedule(loan, apr, 30);
    const t15 = scheduleTotals(s15);
    const t30 = scheduleTotals(s30);
    const y1 = (rows: typeof s15) => rows.slice(0, 12).reduce((s, r) => s + r.interest, 0);
    return { int15: t15.totalInterest, int30: t30.totalInterest, yr1Int15: y1(s15), yr1Int30: y1(s30) };
  }, [apr, b30.loanAmount]);

  if (b30.loanAmount <= 0) return null;

  const loan = b30.loanAmount;
  const lifePi15 = loan + int15;
  const lifePi30 = loan + int30;
  const moTotalDiff = b15.total - b30.total;
  const moPiDiff = b15.principalAndInterest - b30.principalAndInterest;
  const intLifeDelta = int15 - int30;
  const lifeOutlayDelta = lifePi15 - lifePi30;
  const yr1IntDelta = yr1Int15 - yr1Int30;
  const sameOther = b30.propertyTax + b30.insurance + b30.hoa + b30.pmi;

  const signedMoney = (n: number) => `${n >= 0 ? "+" : "−"}${moneyInt.format(Math.abs(n))}`;

  const colSx = (years: 15 | 30) =>
    selected === years
      ? {
          bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.16 : 0.08),
          fontWeight: 700,
          borderBottom: `2px solid ${theme.palette.primary.main}`,
        }
      : { fontWeight: 600 };

  const cell = {
    py: 0.45,
    px: 0.75,
    fontSize: "0.8125rem",
    lineHeight: 1.25,
    fontVariantNumeric: "tabular-nums" as const,
  };

  const labelCell = {
    ...cell,
    color: "text.secondary",
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
    maxWidth: { xs: 120, sm: 200 },
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
      <CardContent sx={{ py: 1, px: 1, "&:last-child": { pb: 1 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap gap={0.75} sx={{ mb: 0.75 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            Same price, down, rate, tax, insurance, HOA, PMI — only term changes.
          </Typography>
          <Stack direction="row" spacing={0.5}>
            {selected === 15 || selected === 30 ? (
              <Chip size="small" label={`Scenario: ${selected}-yr`} color="primary" variant="outlined" sx={{ height: 22, "& .MuiChip-label": { px: 0.75, fontSize: "0.7rem" } }} />
            ) : null}
          </Stack>
        </Stack>

        <TableContainer sx={{ overflowX: "auto", mx: -0.5 }}>
          <Table size="small" padding="none" aria-label="15-year versus 30-year loan comparison">
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...labelCell, py: 0.5 }}> </TableCell>
                <TableCell align="right" sx={{ ...cell, py: 0.65, ...colSx(15), minWidth: 92 }}>
                  15-yr
                </TableCell>
                <TableCell align="right" sx={{ ...cell, py: 0.65, ...colSx(30), minWidth: 92 }}>
                  30-yr
                </TableCell>
                <TableCell align="right" sx={{ ...labelCell, py: 0.65, minWidth: 76, display: { xs: "none", sm: "table-cell" } }}>
                  Δ (15−30)
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell sx={labelCell}>Total / mo</TableCell>
                <TableCell align="right" sx={{ ...cell, ...colSx(15) }}>
                  {moneyDec.format(b15.total)}
                </TableCell>
                <TableCell align="right" sx={{ ...cell, ...colSx(30) }}>
                  {moneyDec.format(b30.total)}
                </TableCell>
                <TableCell align="right" sx={{ ...cell, display: { xs: "none", sm: "table-cell" }, color: moTotalDiff >= 0 ? "error.main" : "success.main" }}>
                  {moTotalDiff >= 0 ? "+" : ""}
                  {moneyDec.format(moTotalDiff)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={labelCell}>P&amp;I / mo</TableCell>
                <TableCell align="right" sx={{ ...cell, ...colSx(15) }}>
                  {moneyDec.format(b15.principalAndInterest)}
                </TableCell>
                <TableCell align="right" sx={{ ...cell, ...colSx(30) }}>
                  {moneyDec.format(b30.principalAndInterest)}
                </TableCell>
                <TableCell align="right" sx={{ ...cell, display: { xs: "none", sm: "table-cell" }, color: moPiDiff >= 0 ? "error.main" : "success.main" }}>
                  {moPiDiff >= 0 ? "+" : ""}
                  {moneyDec.format(moPiDiff)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={labelCell}>Tax + ins + HOA + PMI / mo</TableCell>
                <TableCell align="right" sx={{ ...cell, ...colSx(15) }}>
                  {moneyDec.format(sameOther)}
                </TableCell>
                <TableCell align="right" sx={{ ...cell, ...colSx(30) }}>
                  {moneyDec.format(sameOther)}
                </TableCell>
                <TableCell align="right" sx={{ ...cell, display: { xs: "none", sm: "table-cell" } }}>
                  —
                </TableCell>
              </TableRow>
              <TableRow sx={{ "& td": { borderBottom: "1px solid", borderColor: "divider", pb: 0.65 } }}>
                <TableCell sx={labelCell}>Loan amount</TableCell>
                <TableCell align="right" sx={{ ...cell, ...colSx(15) }}>
                  {moneyInt.format(loan)}
                </TableCell>
                <TableCell align="right" sx={{ ...cell, ...colSx(30) }}>
                  {moneyInt.format(loan)}
                </TableCell>
                <TableCell align="right" sx={{ ...cell, display: { xs: "none", sm: "table-cell" } }}>
                  —
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={labelCell}>Interest (life, P&amp;I)</TableCell>
                <TableCell align="right" sx={{ ...cell, ...colSx(15), color: "success.main" }}>
                  {moneyInt.format(int15)}
                </TableCell>
                <TableCell align="right" sx={{ ...cell, ...colSx(30), color: "error.main" }}>
                  {moneyInt.format(int30)}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    ...cell,
                    display: { xs: "none", sm: "table-cell" },
                    color: intLifeDelta < 0 ? "success.main" : intLifeDelta > 0 ? "error.main" : "text.secondary",
                  }}
                >
                  {intLifeDelta === 0 ? "—" : signedMoney(intLifeDelta)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={labelCell}>Total P&amp;I outlay (life)</TableCell>
                <TableCell align="right" sx={{ ...cell, ...colSx(15) }}>
                  {moneyInt.format(lifePi15)}
                </TableCell>
                <TableCell align="right" sx={{ ...cell, ...colSx(30) }}>
                  {moneyInt.format(lifePi30)}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    ...cell,
                    display: { xs: "none", sm: "table-cell" },
                    color: lifeOutlayDelta < 0 ? "success.main" : lifeOutlayDelta > 0 ? "error.main" : "text.secondary",
                  }}
                >
                  {lifeOutlayDelta === 0 ? "—" : signedMoney(lifeOutlayDelta)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={labelCell}>Year 1 interest (P&amp;I)</TableCell>
                <TableCell align="right" sx={{ ...cell, ...colSx(15), color: "text.secondary" }}>
                  {moneyInt.format(yr1Int15)}
                </TableCell>
                <TableCell align="right" sx={{ ...cell, ...colSx(30), color: "text.secondary" }}>
                  {moneyInt.format(yr1Int30)}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    ...cell,
                    display: { xs: "none", sm: "table-cell" },
                    color: yr1IntDelta < 0 ? "success.main" : yr1IntDelta > 0 ? "error.main" : "text.secondary",
                  }}
                >
                  {yr1IntDelta === 0 ? "—" : signedMoney(yr1IntDelta)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ mt: 0.75, pt: 0.75, borderTop: "1px solid", borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35, display: "block" }}>
            <strong>Δ columns</strong> are 15-yr minus 30-yr: positive total / P&amp;I Δ means the 15-yr payment is higher each month. Negative life P&amp;I outlay Δ means 15-yr costs less over the full term. Green / red on interest rows match “less cost” vs “more cost” for quick scanning.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
