import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableFooter from "@mui/material/TableFooter";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { alpha, useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useMemo } from "react";
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

function byYear(rows: YearlyPaydownDetailed[]): Map<number, YearlyPaydownDetailed> {
  return new Map(rows.map((r) => [r.year, r]));
}

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

export type PaydownYearlyMergedCompareProps = {
  rows15: YearlyPaydownDetailed[];
  rowsTerm: YearlyPaydownDetailed[];
  termYearsLabel: number;
  lifePrincipal15: number;
  lifeInterest15: number;
  lifePrincipalTerm: number;
  lifeInterestTerm: number;
};

const denseCell = {
  px: { xs: 0.35, sm: 0.6 },
  py: 0.35,
  fontSize: { xs: "0.65rem", sm: "0.72rem" },
  lineHeight: 1.2,
} as const;

export function PaydownYearlyMergedCompare({
  rows15,
  rowsTerm,
  termYearsLabel,
  lifePrincipal15,
  lifeInterest15,
  lifePrincipalTerm,
  lifeInterestTerm,
}: PaydownYearlyMergedCompareProps) {
  const theme = useTheme();

  const col = useMemo(() => {
    const dark = theme.palette.mode === "dark";
    const gBg = alpha(theme.palette.success.main, dark ? 0.2 : 0.1);
    const gFg = dark ? theme.palette.success.light : theme.palette.success.dark;
    const rBg = alpha(theme.palette.error.main, dark ? 0.2 : 0.1);
    const rFg = dark ? theme.palette.error.light : theme.palette.error.dark;
    const headPad = {
      ...denseCell,
      py: 0.5,
      fontWeight: 800,
      letterSpacing: "0.02em",
      fontSize: { xs: "0.6rem", sm: "0.68rem" },
    };
    return {
      greenHead: { ...headPad, bgcolor: gBg, color: gFg },
      redHead: { ...headPad, bgcolor: rBg, color: rFg },
      greenCell: {
        bgcolor: alpha(theme.palette.success.main, dark ? 0.14 : 0.06),
        color: gFg,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums" as const,
        ...denseCell,
      },
      redCell: {
        bgcolor: alpha(theme.palette.error.main, dark ? 0.14 : 0.06),
        color: rFg,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums" as const,
        ...denseCell,
      },
      greenFoot: {
        bgcolor: alpha(theme.palette.success.main, dark ? 0.24 : 0.14),
        color: gFg,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums" as const,
        ...denseCell,
      },
      redFoot: {
        bgcolor: alpha(theme.palette.error.main, dark ? 0.24 : 0.14),
        color: rFg,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums" as const,
        ...denseCell,
      },
    };
  }, [theme]);

  const bodyRows = useMemo(() => {
    const m15 = byYear(rows15);
    const mT = byYear(rowsTerm);
    const maxY = Math.max(rows15.at(-1)?.year ?? 0, rowsTerm.at(-1)?.year ?? 0);
    if (maxY <= 0) return [];
    const out: { year: number; l?: YearlyPaydownDetailed; r?: YearlyPaydownDetailed }[] = [];
    for (let y = 1; y <= maxY; y += 1) {
      const l = m15.get(y);
      const r = mT.get(y);
      if (l || r) out.push({ year: y, l, r });
    }
    return out;
  }, [rows15, rowsTerm]);

  if (bodyRows.length === 0) return null;

  const end15 = rows15[rows15.length - 1];
  const endT = rowsTerm[rowsTerm.length - 1];

  const group15Sx = {
    bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.12 : 0.06),
    fontWeight: 800,
    fontSize: { xs: "0.62rem", sm: "0.75rem" },
    py: 0.5,
    borderBottom: "1px solid",
    borderColor: "divider",
  };

  const groupTermSx = {
    bgcolor: alpha(theme.palette.secondary.main, theme.palette.mode === "dark" ? 0.14 : 0.07),
    fontWeight: 800,
    fontSize: { xs: "0.62rem", sm: "0.75rem" },
    py: 0.5,
    borderBottom: "1px solid",
    borderColor: "divider",
  };

  return (
    <TableContainer
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        overflow: "visible",
        maxWidth: "100%",
      }}
    >
      <Table
        size="small"
        padding="none"
        sx={{
          tableLayout: "fixed",
          width: "100%",
          "& .MuiTableCell-root": { verticalAlign: "middle" },
        }}
        aria-label={`Year-by-year principal and interest: 15-year vs ${termYearsLabel}-year`}
      >
        <TableHead>
          <TableRow>
            <TableCell
              rowSpan={2}
              sx={{
                fontWeight: 800,
                width: "6%",
                bgcolor: "action.hover",
                ...denseCell,
                fontSize: { xs: "0.62rem", sm: "0.7rem" },
              }}
            >
              Yr
            </TableCell>
            <TableCell
              rowSpan={2}
              sx={{
                fontWeight: 800,
                width: "11%",
                bgcolor: "action.hover",
                whiteSpace: "nowrap",
                ...denseCell,
                fontSize: { xs: "0.62rem", sm: "0.7rem" },
              }}
            >
              Mo
            </TableCell>
            <TableCell colSpan={4} align="center" sx={group15Sx}>
              15-year fixed
            </TableCell>
            <TableCell colSpan={4} align="center" sx={groupTermSx}>
              {termYearsLabel}-year (Loan term)
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell align="right" sx={{ ...col.greenHead, width: "10.5%" }}>
              Prin
            </TableCell>
            <TableCell align="right" sx={{ ...col.redHead, width: "10.5%" }}>
              Int
            </TableCell>
            <TableCell align="right" sx={{ ...col.redHead, width: "7.5%" }}>
              Int%
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 800, bgcolor: "action.hover", width: "11%", ...denseCell }}>
              Bal
            </TableCell>
            <TableCell align="right" sx={{ ...col.greenHead, width: "10.5%" }}>
              Prin
            </TableCell>
            <TableCell align="right" sx={{ ...col.redHead, width: "10.5%" }}>
              Int
            </TableCell>
            <TableCell align="right" sx={{ ...col.redHead, width: "7.5%" }}>
              Int%
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 800, bgcolor: "action.hover", width: "11%", ...denseCell }}>
              Bal
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {bodyRows.map(({ year, l, r }) => {
            const mo =
              l != null
                ? `${l.firstLoanMonth}–${l.lastLoanMonth}`
                : r != null
                  ? `${r.firstLoanMonth}–${r.lastLoanMonth}`
                  : "—";
            const nMo = l?.monthsInYear ?? r?.monthsInYear;

            const side = (row: YearlyPaydownDetailed | undefined) => {
              if (!row) {
                return (
                  <>
                    <TableCell align="right" sx={{ ...denseCell, color: "text.disabled" }}>
                      —
                    </TableCell>
                    <TableCell align="right" sx={{ ...denseCell, color: "text.disabled" }}>
                      —
                    </TableCell>
                    <TableCell align="right" sx={{ ...denseCell, color: "text.disabled" }}>
                      —
                    </TableCell>
                    <TableCell align="right" sx={{ ...denseCell, color: "text.disabled" }}>
                      —
                    </TableCell>
                  </>
                );
              }
              return (
                <>
                  <TableCell align="right" sx={col.greenCell}>
                    {money.format(row.principal)}
                  </TableCell>
                  <TableCell align="right" sx={col.redCell}>
                    {money.format(row.interest)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontVariantNumeric: "tabular-nums",
                      ...denseCell,
                      ...interestShareCellSx(theme, row.interestShareOfPiPct),
                    }}
                  >
                    {row.interestShareOfPiPct == null ? "—" : `${pct1.format(row.interestShareOfPiPct)}%`}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", ...denseCell }}>
                    {money.format(row.endingBalance)}
                  </TableCell>
                </>
              );
            };

            return (
              <TableRow key={year} hover>
                <TableCell sx={{ fontVariantNumeric: "tabular-nums", ...denseCell }}>{year}</TableCell>
                <TableCell sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", ...denseCell }}>
                  {mo}
                  {typeof nMo === "number" ? (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ opacity: 0.85 }}>
                      {" "}
                      ·{nMo} mo
                    </Typography>
                  ) : null}
                </TableCell>
                {side(l)}
                {side(r)}
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2} sx={{ fontWeight: 800, bgcolor: "action.selected", ...denseCell }}>
              Loan totals
            </TableCell>
            <TableCell align="right" sx={col.greenFoot}>
              {money.format(lifePrincipal15)}
            </TableCell>
            <TableCell align="right" sx={col.redFoot}>
              {money.format(lifeInterest15)}
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 700, ...denseCell }}>
              —
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", ...denseCell }}>
              {money.format(end15?.endingBalance ?? 0)}
            </TableCell>
            <TableCell align="right" sx={col.greenFoot}>
              {money.format(lifePrincipalTerm)}
            </TableCell>
            <TableCell align="right" sx={col.redFoot}>
              {money.format(lifeInterestTerm)}
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 700, ...denseCell }}>
              —
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", ...denseCell }}>
              {money.format(endT?.endingBalance ?? 0)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </TableContainer>
  );
}
