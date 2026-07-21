import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableFooter from "@mui/material/TableFooter";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import type { AmortizationRow } from "../lib/mortgageMath";

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Props = {
  rows: AmortizationRow[];
  totalInterest: number;
  totalPrincipal: number;
  /** Extra line under the standard amortization disclaimer (e.g. prepayment note). */
  scheduleNote?: string;
  /** Footer label for the totals row (default: full contract term). */
  footerLabel?: string;
  /**
   * Purchase price (or value) for a simple equity column: `value − loan balance` each month.
   * Omits lender/equity columns when unset.
   */
  estimatedHomeValueForEquity?: number;
  /**
   * No outer `Card`; tighter copy; table area scrolls with the page (no fixed-height inner box).
   * Use inside an accordion or dense layout.
   */
  embedded?: boolean;
};

export function AmortizationTableCard({
  rows,
  totalInterest,
  totalPrincipal,
  scheduleNote,
  footerLabel = "Totals (loan life)",
  estimatedHomeValueForEquity,
  embedded = false,
}: Props) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(12);

  useEffect(() => {
    setPage(0);
  }, [rows.length]);

  if (rows.length === 0) {
    return null;
  }

  const slice = rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const homeVal = Math.max(0, Number(estimatedHomeValueForEquity) || 0);
  const showEquity = homeVal > 0;
  const last = rows[rows.length - 1];
  const endingLoanBalance = last ? last.balance : 0;
  const endingEquity = showEquity ? Math.max(0, homeVal - endingLoanBalance) : null;

  const body = (
    <>
      {!embedded ? (
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
          Amortization schedule
        </Typography>
      ) : null}
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        sx={{ mb: scheduleNote ? 0.25 : embedded ? 0.5 : 1, lineHeight: 1.35 }}
      >
        Principal &amp; interest only (taxes, insurance, HOA are not amortized).
      </Typography>
      {showEquity ? (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ mb: scheduleNote ? 0.25 : embedded ? 0.5 : 1, lineHeight: 1.35 }}
        >
          <strong>Lender still owed</strong> is the remaining loan principal. <strong>Est. equity (your ownership)</strong>{" "}
          is purchase price minus that balance, assuming the home value stays at your modeled purchase price (no
          appreciation).
        </Typography>
      ) : null}
      {scheduleNote ? (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: embedded ? 0.5 : 1, lineHeight: 1.35 }}>
          {scheduleNote}
        </Typography>
      ) : null}
      <TableContainer sx={{ maxHeight: embedded ? "none" : 320, overflowX: embedded ? "visible" : "auto" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Month</TableCell>
                <TableCell align="right">Payment</TableCell>
                <TableCell align="right">Principal</TableCell>
                <TableCell align="right">Interest</TableCell>
                <TableCell align="right">{showEquity ? "Lender still owed" : "Balance"}</TableCell>
                {showEquity ? (
                  <TableCell align="right">Est. equity (ownership)</TableCell>
                ) : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {slice.map((r) => (
                <TableRow key={r.month} hover>
                  <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>{r.month}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {money.format(r.payment)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {money.format(r.principal)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {money.format(r.interest)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {money.format(r.balance)}
                  </TableCell>
                  {showEquity ? (
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {money.format(Math.max(0, homeVal - r.balance))}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} sx={{ fontWeight: 600 }}>
                  {footerLabel}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {money.format(totalPrincipal)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {money.format(totalInterest)}
                </TableCell>
                {showEquity ? (
                  <>
                    <TableCell align="right" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {money.format(endingLoanBalance)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {endingEquity != null ? money.format(endingEquity) : "—"}
                    </TableCell>
                  </>
                ) : (
                  <TableCell align="right">—</TableCell>
                )}
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      <TablePagination
        component="div"
        size="small"
        count={rows.length}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[12, 24, 60, 120]}
        labelRowsPerPage="Rows"
      />
    </>
  );

  if (embedded) {
    return body;
  }

  return (
    <Card>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
