import type { AppPersisted } from "../storage/mortgageState";
import type { AmortizationRow } from "./mortgageMath";
import { buildAmortizationSchedule, computeMonthlyPayment } from "./mortgageMath";
import {
  computeRentalAnalysis,
  cumulativeCashFlowThroughExitMonths,
} from "./rentalMath";

export type SellYearRow = {
  year: number;
  month: number;
  futureHomeValue: number;
  balance30: number;
  balance15: number;
  /** Remaining balance on the mortgage tab loan term (10–30 yr). */
  balanceUserTerm: number;
  equity30: number;
  equity15: number;
  equityUserTerm: number;
  netProceeds30: number;
  netProceeds15: number;
  netProceedsUserTerm: number;
  cumInterest30: number;
  cumInterest15: number;
  cumInterestUserTerm: number;
  equityPct30: number;
  equityPct15: number;
  equityPctUserTerm: number;
};

export function balanceAfterPaymentMonth(schedule: AmortizationRow[], paymentMonth: number): number {
  if (paymentMonth <= 0) {
    if (schedule.length === 0) return 0;
    return (schedule[0]?.balance ?? 0) + (schedule[0]?.principal ?? 0);
  }
  const idx = Math.min(paymentMonth, schedule.length) - 1;
  if (idx < 0) return 0;
  return schedule[idx]?.balance ?? 0;
}

export function cumulativeInterestThroughMonth(schedule: AmortizationRow[], paymentMonth: number): number {
  const n = Math.min(Math.max(0, paymentMonth), schedule.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += schedule[i]?.interest ?? 0;
  return s;
}

export function futureHomeValue(basePrice: number, appreciationPctAnnual: number, years: number): number {
  const g = appreciationPctAnnual / 100;
  return basePrice * (1 + g) ** years;
}

/** Net cash at closing after selling costs (% of sale price) and paying off loan. */
export function netProceedsAtSale(
  futureHomeValue: number,
  remainingBalance: number,
  sellingCostPctOfSale: number
): number {
  const costs = futureHomeValue * (sellingCostPctOfSale / 100);
  return Math.max(0, futureHomeValue - remainingBalance - costs);
}

export function equityPctOfValue(futureHomeValue: number, remainingBalance: number): number {
  if (futureHomeValue <= 0) return 0;
  const eq = futureHomeValue - remainingBalance;
  return (eq / futureHomeValue) * 100;
}

/** First calendar year (1-based) where equity/value >= 50%, or null. */
export function firstYearMajorityEquity(
  loanAmount: number,
  apr: number,
  termYears: number,
  basePrice: number,
  appreciationPctAnnual: number,
  maxYears: number
): number | null {
  const sched = buildAmortizationSchedule(loanAmount, apr, termYears);
  for (let y = 1; y <= maxYears; y++) {
    const m = y * 12;
    const fv = futureHomeValue(basePrice, appreciationPctAnnual, y);
    const bal = balanceAfterPaymentMonth(sched, m);
    if (equityPctOfValue(fv, bal) >= 50) return y;
  }
  return null;
}

export function buildSellYearlyRows(
  loanAmount: number,
  apr: number,
  baseHomePrice: number,
  appreciationPctAnnual: number,
  sellingCostPct: number,
  maxYears: number,
  userTermYears: number
): SellYearRow[] {
  const termY = Math.min(30, Math.max(1, Math.round(userTermYears)));
  const s30 = buildAmortizationSchedule(loanAmount, apr, 30);
  const s15 = buildAmortizationSchedule(loanAmount, apr, 15);
  const sUser = buildAmortizationSchedule(loanAmount, apr, termY);
  const rows: SellYearRow[] = [];
  for (let year = 1; year <= maxYears; year++) {
    const month = year * 12;
    const fv = futureHomeValue(baseHomePrice, appreciationPctAnnual, year);
    const b30 = balanceAfterPaymentMonth(s30, month);
    const b15 = balanceAfterPaymentMonth(s15, month);
    const bUser = balanceAfterPaymentMonth(sUser, month);
    const e30 = fv - b30;
    const e15 = fv - b15;
    const eUser = fv - bUser;
    rows.push({
      year,
      month,
      futureHomeValue: fv,
      balance30: b30,
      balance15: b15,
      balanceUserTerm: bUser,
      equity30: e30,
      equity15: e15,
      equityUserTerm: eUser,
      netProceeds30: netProceedsAtSale(fv, b30, sellingCostPct),
      netProceeds15: netProceedsAtSale(fv, b15, sellingCostPct),
      netProceedsUserTerm: netProceedsAtSale(fv, bUser, sellingCostPct),
      cumInterest30: cumulativeInterestThroughMonth(s30, month),
      cumInterest15: cumulativeInterestThroughMonth(s15, month),
      cumInterestUserTerm: cumulativeInterestThroughMonth(sUser, month),
      equityPct30: equityPctOfValue(fv, b30),
      equityPct15: equityPctOfValue(fv, b15),
      equityPctUserTerm: equityPctOfValue(fv, bUser),
    });
  }
  return rows;
}

export function addYearsToDate(d: Date, years: number): Date {
  const x = new Date(d.getTime());
  x.setFullYear(x.getFullYear() + years);
  return x;
}

/** Whole months from `from` (inclusive start of month) to `to` (exclusive end), clamped 1–360. */
export function wholeMonthsBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), 1);
  const b = new Date(to.getFullYear(), to.getMonth(), 1);
  const m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return Math.min(360, Math.max(1, m));
}

export function yearsFromMonths(months: number): number {
  return Math.max(1, Math.min(30, Math.ceil(months / 12)));
}

/** Standard exit horizons for the “real wealth” summary table. */
export const REAL_WEALTH_MILESTONE_YEARS = [3, 5, 7, 10, 15, 20, 25, 30] as const;

export type RealWealthExitSnapshot = {
  year: number;
  /** Down + closing + misc (from Rental / Mortgage scenario). */
  initialCashInvested: number;
  /** Cumulative P&I interest to the lender through exit month (30-yr amortization). */
  interestToBank30: number;
  /** Same, 15-yr amortization. */
  interestToBank15: number;
  /** Interest on the Mortgage tab loan term through exit. */
  interestToBankUserTerm: number;
  /** Principal dollars that paid down the 30-yr loan through exit (loan − remaining balance). */
  principalPaidIntoLoan30: number;
  principalPaidIntoLoan15: number;
  principalPaidIntoLoanUserTerm: number;
  /**
   * Sum of monthly amounts through exit: yield-adjusted cash while the loan is active; after payoff,
   * effective gross income only (no OpEx). Not discounted.
   */
  cumulativeRentalCashFlow30: number;
  cumulativeRentalCashFlow15: number;
  cumulativeRentalCashFlowUserTerm: number;
  futureHomeValue: number;
  netProceeds30: number;
  netProceeds15: number;
  netProceedsUserTerm: number;
  /**
   * Net cash at sale + cumulative rental cash − upfront cash (down + closing + misc).
   * Interest is not subtracted again — it is already inside rental cash flow via P&I.
   */
  realWealthMade30: number;
  realWealthMade15: number;
  realWealthMadeUserTerm: number;
};

/**
 * Build per-year snapshots for “real wealth made”: upfront, bank interest, rental contribution,
 * sale proceeds, and a simple life-to-exit total.
 */
export function buildRealWealthExitSnapshots(
  state: AppPersisted,
  loanAmount: number,
  apr: number,
  sellRows: SellYearRow[],
  years: readonly number[],
  sellRentalYieldInclude?: Record<string, boolean>
): RealWealthExitSnapshot[] {
  const hp = Math.max(0, state.homePrice);
  const dp = Math.max(0, state.downPayment);

  const termY = Math.min(30, Math.max(1, Math.round(state.termYears)));
  const m30 = computeMonthlyPayment(
    hp,
    dp,
    apr,
    30,
    state.propertyTaxAnnual,
    state.insuranceAnnual,
    state.hoaMonthly,
    state.pmiMonthly
  );
  const m15 = computeMonthlyPayment(
    hp,
    dp,
    apr,
    15,
    state.propertyTaxAnnual,
    state.insuranceAnnual,
    state.hoaMonthly,
    state.pmiMonthly
  );
  const mUser = computeMonthlyPayment(
    hp,
    dp,
    apr,
    termY,
    state.propertyTaxAnnual,
    state.insuranceAnnual,
    state.hoaMonthly,
    state.pmiMonthly
  );
  const r30 = computeRentalAnalysis(state, m30);
  const r15 = computeRentalAnalysis(state, m15);
  const rUser = computeRentalAnalysis(state, mUser);
  const initial = r30.initialCashInvested;

  const s30 = buildAmortizationSchedule(loanAmount, apr, 30);
  const s15 = buildAmortizationSchedule(loanAmount, apr, 15);
  const sUser = buildAmortizationSchedule(loanAmount, apr, termY);

  const out: RealWealthExitSnapshot[] = [];
  for (const year of years) {
    if (year < 1 || year > sellRows.length) continue;
    const row = sellRows[year - 1];
    if (!row) continue;
    const months = year * 12;
    const int30 = cumulativeInterestThroughMonth(s30, months);
    const int15 = cumulativeInterestThroughMonth(s15, months);
    const intUser = cumulativeInterestThroughMonth(sUser, months);
    const bal30 = balanceAfterPaymentMonth(s30, months);
    const bal15 = balanceAfterPaymentMonth(s15, months);
    const balUser = balanceAfterPaymentMonth(sUser, months);
    const prin30 = Math.max(0, loanAmount - bal30);
    const prin15 = Math.max(0, loanAmount - bal15);
    const prinUser = Math.max(0, loanAmount - balUser);
    const cf30 = cumulativeCashFlowThroughExitMonths(r30, sellRentalYieldInclude, 30, months);
    const cf15 = cumulativeCashFlowThroughExitMonths(r15, sellRentalYieldInclude, 15, months);
    const cfUser = cumulativeCashFlowThroughExitMonths(rUser, sellRentalYieldInclude, termY, months);

    out.push({
      year,
      initialCashInvested: initial,
      interestToBank30: int30,
      interestToBank15: int15,
      interestToBankUserTerm: intUser,
      principalPaidIntoLoan30: prin30,
      principalPaidIntoLoan15: prin15,
      principalPaidIntoLoanUserTerm: prinUser,
      cumulativeRentalCashFlow30: cf30,
      cumulativeRentalCashFlow15: cf15,
      cumulativeRentalCashFlowUserTerm: cfUser,
      futureHomeValue: row.futureHomeValue,
      netProceeds30: row.netProceeds30,
      netProceeds15: row.netProceeds15,
      netProceedsUserTerm: row.netProceedsUserTerm,
      realWealthMade30: row.netProceeds30 + cf30 - initial,
      realWealthMade15: row.netProceeds15 + cf15 - initial,
      realWealthMadeUserTerm: row.netProceedsUserTerm + cfUser - initial,
    });
  }
  return out;
}
