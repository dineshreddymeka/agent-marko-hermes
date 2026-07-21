import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableFooter from "@mui/material/TableFooter";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useEffect, useMemo, useState } from "react";
import type { YearlyPaydownDetailed } from "../lib/mortgageMath";

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const pct1 = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export type PaydownYearlyDetailTableProps = {
  rows: YearlyPaydownDetailed[];
  /** Life-of-loan principal total (footer check). */
  lifePrincipal: number;
  lifeInterest: number;
  /** `embedded`: panel title + table only (for 15 vs term compare layout). */
  mode?: "standalone" | "embedded";
  /** Used when `mode` is `embedded`; also overrides standalone main heading when set. */
  panelTitle?: string;
};

/** Green / red legend for yearly tables (shared by compare layout). */
export function PaydownYearlyColorLegend() {
  const theme = useTheme();
  return (
    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center" sx={{ py: 0.25 }}>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: 0.75,
            bgcolor: theme.palette.success.main,
          }}
        />
        <Typography variant="caption" color="text.secondary">
          Green — principal / paid down (your stake)
        </Typography>
      </Stack>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: 0.75,
            bgcolor: theme.palette.error.main,
          }}
        />
        <Typography variant="caption" color="text.secondary">
          Red — interest (lender cost)
        </Typography>
      </Stack>
    </Stack>
  );
}

/** Apple-style: green = principal / paid down; red = interest cost. */
function interestShareCellSx(theme: Theme, pct: number | null) {
  if (pct == null) return {};
  const dark = theme.palette.mode === "dark";
  if (pct >= 52) {
    return {
      bgcolor: alpha(theme.palette.error.main, dark ? 0.22 : 0.12),
      color: dark ? theme.palette.error.light : theme.palette.error.dark,
      fontWeight: 700,
    };
  }
  if (pct <= 28) {
    return {
      bgcolor: alpha(theme.palette.success.main, dark ? 0.2 : 0.1),
      color: dark ? theme.palette.success.light : theme.palette.success.dark,
      fontWeight: 700,
    };
  }
  return {
    bgcolor: alpha(theme.palette.warning.main, dark ? 0.14 : 0.07),
    color: theme.palette.text.secondary,
    fontWeight: 600,
  };
}

export function PaydownYearlyDetailTable({
  rows,
  lifePrincipal,
  lifeInterest,
  mode = "standalone",
  panelTitle,
}: PaydownYearlyDetailTableProps) {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(8);

  const col = useMemo(() => {
    const dark = theme.palette.mode === "dark";
    const gBg = alpha(theme.palette.success.main, dark ? 0.2 : 0.1);
    const gFg = dark ? theme.palette.success.light : theme.palette.success.dark;
    const rBg = alpha(theme.palette.error.main, dark ? 0.2 : 0.1);
    const rFg = dark ? theme.palette.error.light : theme.palette.error.dark;
    const headPad = { py: 1, fontWeight: 800, letterSpacing: "0.02em", fontSize: "0.7rem" };
    return {
      greenHead: { ...headPad, bgcolor: gBg, color: gFg },
      redHead: { ...headPad, bgcolor: rBg, color: rFg },
      greenCell: {
        bgcolor: alpha(theme.palette.success.main, dark ? 0.14 : 0.06),
        color: gFg,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums" as const,
      },
      redCell: {
        bgcolor: alpha(theme.palette.error.main, dark ? 0.14 : 0.06),
        color: rFg,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums" as const,
      },
      greenFoot: {
        bgcolor: alpha(theme.palette.success.main, dark ? 0.24 : 0.14),
        color: gFg,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums" as const,
      },
      redFoot: {
        bgcolor: alpha(theme.palette.error.main, dark ? 0.24 : 0.14),
        color: rFg,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums" as const,
      },
    };
  }, [theme]);

  /** Reset/clamp pagination so the body never goes out of range (e.g. deep page on 30-yr then shorter schedule). */
  useEffect(() => {
    if (rows.length === 0) {
      setPage(0);
      return;
    }
    const maxP = Math.max(0, Math.ceil(rows.length / rowsPerPage) - 1);
    setPage((p) => Math.min(p, maxP));
  }, [rows.length, rowsPerPage]);

  if (rows.length === 0) return null;

  const maxPage = Math.max(0, Math.ceil(rows.length / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);
  const slice = rows.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);
  const endRow = rows[rows.length - 1];
  const heading = panelTitle ?? "Year-by-year detail";

  const tableSection = (
    <>
      <TableContainer
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          overflowX: mode === "embedded" ? "auto" : "visible",
          overflowY: "visible",
          maxWidth: "100%",
        }}
      >
        <Table
          size="small"
          stickyHeader={mode === "standalone"}
          aria-label={`Principal and interest by loan year: ${heading}`}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 800, py: 1, bgcolor: "action.hover" }}>Loan yr</TableCell>
              <TableCell sx={{ fontWeight: 800, py: 1, bgcolor: "action.hover" }}>Mo range</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, py: 1, bgcolor: "action.hover" }}>
                # Mo
              </TableCell>
              <TableCell align="right" sx={col.greenHead}>
                Principal
              </TableCell>
              <TableCell align="right" sx={col.redHead}>
                Interest
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, py: 1, bgcolor: "action.hover" }}>
                Total P&amp;I
              </TableCell>
              <TableCell align="right" sx={col.redHead}>
                Int % of P&amp;I
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, py: 1, bgcolor: "action.hover" }}>
                End balance
              </TableCell>
              <TableCell align="right" sx={col.greenHead}>
                Cum. principal
              </TableCell>
              <TableCell align="right" sx={col.redHead}>
                Cum. interest
              </TableCell>
              <TableCell align="right" sx={col.greenHead}>
                Paid % orig
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {slice.map((r) => (
              <TableRow key={r.year} hover>
                <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>{r.year}</TableCell>
                <TableCell sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {r.firstLoanMonth}–{r.lastLoanMonth}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {r.monthsInYear}
                </TableCell>
                <TableCell align="right" sx={col.greenCell}>
                  {money.format(r.principal)}
                </TableCell>
                <TableCell align="right" sx={col.redCell}>
                  {money.format(r.interest)}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {money.format(r.totalPi)}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    fontVariantNumeric: "tabular-nums",
                    ...interestShareCellSx(theme, r.interestShareOfPiPct),
                  }}
                >
                  {r.interestShareOfPiPct == null ? "—" : `${pct1.format(r.interestShareOfPiPct)}%`}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {money.format(r.endingBalance)}
                </TableCell>
                <TableCell align="right" sx={col.greenCell}>
                  {money.format(r.cumulativePrincipal)}
                </TableCell>
                <TableCell align="right" sx={col.redCell}>
                  {money.format(r.cumulativeInterest)}
                </TableCell>
                <TableCell align="right" sx={col.greenCell}>
                  {pct1.format(r.paidDownPctOfOriginal)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} sx={{ fontWeight: 800, bgcolor: "action.selected" }}>
                Loan totals
              </TableCell>
              <TableCell align="right" sx={col.greenFoot}>
                {money.format(lifePrincipal)}
              </TableCell>
              <TableCell align="right" sx={col.redFoot}>
                {money.format(lifeInterest)}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                {money.format(lifePrincipal + lifeInterest)}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                —
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {money.format(endRow?.endingBalance ?? 0)}
              </TableCell>
              <TableCell align="right" sx={col.greenFoot}>
                {money.format(lifePrincipal)}
              </TableCell>
              <TableCell align="right" sx={col.redFoot}>
                {money.format(lifeInterest)}
              </TableCell>
              <TableCell align="right" sx={col.greenFoot}>
                {endRow ? `${pct1.format(endRow.paidDownPctOfOriginal)}%` : "—"}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        size="small"
        count={rows.length}
        page={safePage}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[5, 8, 12, 15, 30]}
        labelRowsPerPage="Years per page"
      />
    </>
  );

  if (mode === "embedded") {
    return (
      <Stack spacing={1} sx={{ mt: 0, minWidth: 0, width: "100%" }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>
          {heading}
        </Typography>
        {tableSection}
      </Stack>
    );
  }

  return (
    <Stack spacing={1} sx={{ mt: 2 }}>
      <Divider />
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {heading}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
        Each <strong>loan year</strong> is 12 payment months from closing (year 1 = loan months 1–12). Amounts are
        principal and interest only. <strong>Int % of P&amp;I</strong> is that year’s interest divided by principal +
        interest for that year. <strong>Paid % orig</strong> is cumulative principal ÷ starting loan.
      </Typography>
      <PaydownYearlyColorLegend />
      {tableSection}
    </Stack>
  );
}
