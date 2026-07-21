export type MonthlyBreakdown = {
  principalAndInterest: number;
  propertyTax: number;
  insurance: number;
  hoa: number;
  /** Private mortgage insurance (monthly); often $0 when down payment ≥ ~20%. */
  pmi: number;
  total: number;
  loanAmount: number;
};

export type AmortizationRow = {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
};

export type YearlyPaydown = {
  year: number;
  principal: number;
  interest: number;
};

/** Per loan-year rollups for principal vs interest (from P&amp;I amortization rows). */
export type YearlyPaydownDetailed = {
  /** 1-based loan year (months 1–12 → year 1, etc.). */
  year: number;
  firstLoanMonth: number;
  lastLoanMonth: number;
  monthsInYear: number;
  principal: number;
  interest: number;
  /** Principal + interest paid this loan year. */
  totalPi: number;
  /** Interest as % of this year’s total P&amp;I (null if no payment). */
  interestShareOfPiPct: number | null;
  /** Loan balance after the last payment in this loan year. */
  endingBalance: number;
  cumulativePrincipal: number;
  cumulativeInterest: number;
  /** Cumulative principal as % of original loan (100 at payoff). */
  paidDownPctOfOriginal: number;
};

/** Rule-of-thumb PMI when LTV &gt; 80%: ~0.6% of loan balance per year (varies by lender). */
export function estimatePmiMonthly(loanAmount: number, downPaymentPercent: number): number {
  if (loanAmount <= 0 || downPaymentPercent >= 19.99) return 0;
  return (loanAmount * 0.006) / 12;
}

export function computeMonthlyPayment(
  homePrice: number,
  downPayment: number,
  interestRateApr: number,
  termYears: number,
  propertyTaxAnnual: number,
  insuranceAnnual: number,
  hoaMonthly: number,
  pmiMonthly = 0
): MonthlyBreakdown {
  const pmiSafe = Math.max(0, Number(pmiMonthly) || 0);
  const loanAmount = Math.max(0, homePrice - downPayment);
  const n = Math.max(1, Math.round(termYears * 12));
  const monthlyRate = interestRateApr / 100 / 12;

  let principalAndInterest = 0;
  if (loanAmount > 0) {
    if (monthlyRate <= 0) {
      principalAndInterest = loanAmount / n;
    } else {
      const factor = (1 + monthlyRate) ** n;
      principalAndInterest = (loanAmount * (monthlyRate * factor)) / (factor - 1);
    }
  }

  const propertyTax = propertyTaxAnnual / 12;
  const insurance = insuranceAnnual / 12;
  const hoa = hoaMonthly;
  const pmi = pmiSafe;
  const total = principalAndInterest + propertyTax + insurance + hoa + pmi;

  return {
    principalAndInterest,
    propertyTax,
    insurance,
    hoa,
    pmi,
    total,
    loanAmount,
  };
}

/** Fixed-rate level P&amp;I (principal + interest) payment for a fully amortizing loan. */
export function monthlyPiPayment(loanAmount: number, monthlyRate: number, n: number): number {
  if (loanAmount <= 0 || n <= 0) return 0;
  if (monthlyRate <= 0) return loanAmount / n;
  const factor = (1 + monthlyRate) ** n;
  return (loanAmount * (monthlyRate * factor)) / (factor - 1);
}

/**
 * Amortization with a fixed **extra** principal payment every month (on top of scheduled P&amp;I).
 * The scheduled payment stays the same as the no-prepay loan; surplus reduces principal early.
 * Returns fewer rows than the nominal term when the loan pays off sooner.
 */
export function buildAmortizationScheduleWithExtraPrincipal(
  loanAmount: number,
  interestRateApr: number,
  termYears: number,
  extraPrincipalMonthly: number
): AmortizationRow[] {
  const extra = Math.max(0, Number(extraPrincipalMonthly) || 0);
  if (loanAmount <= 0) return [];
  if (extra <= 0) return buildAmortizationSchedule(loanAmount, interestRateApr, termYears);

  const nMax = Math.max(1, Math.round(termYears * 12));
  const monthlyRate = interestRateApr / 100 / 12;
  const scheduledPayment = monthlyPiPayment(loanAmount, monthlyRate, nMax);
  const rows: AmortizationRow[] = [];
  let balance = loanAmount;
  const safetyCap = nMax + 600;

  for (let month = 1; month <= safetyCap && balance > 1e-6; month++) {
    const interest = monthlyRate <= 0 ? 0 : balance * monthlyRate;
    let scheduledPrincipal = scheduledPayment - interest;
    scheduledPrincipal = Math.max(0, Math.min(scheduledPrincipal, balance));
    let principal = Math.min(balance, scheduledPrincipal + extra);
    if (balance - principal < 1e-4) principal = balance;
    const payment = principal + interest;
    balance = Math.max(0, balance - principal);
    rows.push({
      month: rows.length + 1,
      payment,
      principal,
      interest,
      balance,
    });
    if (balance <= 1e-6) break;
  }

  return rows;
}

export function buildAmortizationSchedule(
  loanAmount: number,
  interestRateApr: number,
  termYears: number
): AmortizationRow[] {
  const n = Math.max(1, Math.round(termYears * 12));
  const monthlyRate = interestRateApr / 100 / 12;
  const payment = monthlyPiPayment(loanAmount, monthlyRate, n);
  const rows: AmortizationRow[] = [];
  let balance = loanAmount;

  for (let month = 1; month <= n; month++) {
    const interest = monthlyRate <= 0 ? 0 : balance * monthlyRate;
    let principal = payment - interest;
    if (month === n) {
      principal = balance;
    }
    principal = Math.max(0, Math.min(principal, balance));
    balance = Math.max(0, balance - principal);
    rows.push({
      month,
      payment: principal + interest,
      principal,
      interest,
      balance,
    });
  }

  return rows;
}

/**
 * Loan-year breakdown: sums, ending balance, running totals, and interest share of P&amp;I.
 * `originalLoanBalance` should match the starting principal (for “paid down %”); use `0` to omit that column’s meaning.
 */
export function aggregateYearlyPaydownDetailed(
  rows: AmortizationRow[],
  originalLoanBalance: number
): YearlyPaydownDetailed[] {
  if (rows.length === 0) return [];

  type Agg = {
    principal: number;
    interest: number;
    firstLoanMonth: number;
    lastLoanMonth: number;
    lastRow: AmortizationRow;
  };
  const byYear = new Map<number, Agg>();
  for (const row of rows) {
    const y = Math.ceil(row.month / 12);
    const cur = byYear.get(y);
    if (!cur) {
      byYear.set(y, {
        principal: row.principal,
        interest: row.interest,
        firstLoanMonth: row.month,
        lastLoanMonth: row.month,
        lastRow: row,
      });
    } else {
      cur.principal += row.principal;
      cur.interest += row.interest;
      cur.lastLoanMonth = row.month;
      cur.lastRow = row;
      byYear.set(y, cur);
    }
  }

  const orig = Math.max(0, Number(originalLoanBalance) || 0);
  let cumP = 0;
  let cumI = 0;
  const sortedYears = [...byYear.keys()].sort((a, b) => a - b);

  return sortedYears.map((year) => {
    const v = byYear.get(year)!;
    cumP += v.principal;
    cumI += v.interest;
    const totalPi = v.principal + v.interest;
    const interestShareOfPiPct = totalPi > 1e-9 ? (v.interest / totalPi) * 100 : null;
    const paidDownPctOfOriginal = orig > 0 ? (cumP / orig) * 100 : 0;
    return {
      year,
      firstLoanMonth: v.firstLoanMonth,
      lastLoanMonth: v.lastLoanMonth,
      monthsInYear: v.lastLoanMonth - v.firstLoanMonth + 1,
      principal: v.principal,
      interest: v.interest,
      totalPi,
      interestShareOfPiPct,
      endingBalance: v.lastRow.balance,
      cumulativePrincipal: cumP,
      cumulativeInterest: cumI,
      paidDownPctOfOriginal,
    };
  });
}

export function aggregateYearlyPaydown(rows: AmortizationRow[]): YearlyPaydown[] {
  return aggregateYearlyPaydownDetailed(rows, 0).map(({ year, principal, interest }) => ({
    year,
    principal,
    interest,
  }));
}

export function scheduleTotals(rows: AmortizationRow[]): {
  totalInterest: number;
  totalPrincipal: number;
} {
  let totalInterest = 0;
  let totalPrincipal = 0;
  for (const row of rows) {
    totalInterest += row.interest;
    totalPrincipal += row.principal;
  }
  return { totalInterest, totalPrincipal };
}

/**
 * Compound annual appreciation (%) implied by purchase price, estimated present value, and full years held.
 * Uses at least one year so the rate is well-defined.
 */
export function impliedAnnualAppreciationPercent(
  purchasePrice: number,
  presentHomeValue: number,
  fullYearsHeld: number
): number {
  const p = Math.max(0, purchasePrice);
  const v = Math.max(0, presentHomeValue);
  const y = Math.max(1, Math.round(fullYearsHeld));
  if (p <= 0) return 0;
  const ratio = v / p;
  if (ratio <= 0 || !Number.isFinite(ratio)) return 0;
  const r = ratio ** (1 / y) - 1;
  const pct = r * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.round(pct * 100) / 100;
}

export type HousingPaymentAtPriceParams = {
  homePrice: number;
  downPaymentPercent: number;
  interestRateApr: number;
  termYears: number;
  propertyTaxPercent: number;
  insuranceAnnual: number;
  hoaMonthly: number;
  /** If &gt; 0, use this PMI/mo for every price; else use {@link estimatePmiMonthly} when down &lt; ~20%. */
  explicitPmiMonthly: number;
};

/** Estimated PITI+HOA+PMI for a candidate purchase price (tax scales with price; insurance annual fixed). */
export function totalMonthlyHousingAtPrice(p: HousingPaymentAtPriceParams): number {
  const hp = Math.max(0, p.homePrice);
  const dpPct = Math.min(100, Math.max(0, p.downPaymentPercent));
  const down = Math.round((hp * dpPct) / 100);
  const taxAnnual = hp > 0 ? Math.round((hp * p.propertyTaxPercent) / 100) : 0;
  const loan = Math.max(0, hp - down);
  const pmi =
    p.explicitPmiMonthly > 0 ? Math.max(0, p.explicitPmiMonthly) : estimatePmiMonthly(loan, dpPct);
  return computeMonthlyPayment(
    hp,
    down,
    p.interestRateApr,
    p.termYears,
    taxAnnual,
    p.insuranceAnnual,
    p.hoaMonthly,
    pmi
  ).total;
}

/** Binary search: max purchase price whose estimated housing payment ≤ `maxHousingPaymentMonthly`. */
export function maxHomePriceForHousingBudget(
  maxHousingPaymentMonthly: number,
  base: Omit<HousingPaymentAtPriceParams, "homePrice">
): number {
  const target = Math.max(0, Number(maxHousingPaymentMonthly) || 0);
  if (target <= 0) return 0;
  let lo = 25_000;
  let hi = 20_000_000;
  if (totalMonthlyHousingAtPrice({ ...base, homePrice: hi }) <= target) return hi;
  if (totalMonthlyHousingAtPrice({ ...base, homePrice: lo }) > target) return 0;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const pay = totalMonthlyHousingAtPrice({ ...base, homePrice: mid });
    if (pay <= target) lo = mid;
    else hi = mid;
  }
  return Math.round(lo);
}

/**
 * Remaining principal after completing `completedLoanYears` full 12-payment loan years
 * (`0` = origination, before any payment). Uses row `month` 1…n; caps at the last row in `schedule`.
 */
export function balanceAfterCompletedLoanYears(
  schedule: AmortizationRow[],
  completedLoanYears: number,
  originalLoanAmount: number
): number {
  const orig = Math.max(0, originalLoanAmount);
  if (!schedule.length || completedLoanYears <= 0) return orig;
  const endMonth = Math.min(completedLoanYears * 12, schedule.length);
  const row = schedule[endMonth - 1];
  return row ? Math.max(0, row.balance) : orig;
}

/** New fixed-rate P&amp;I after a refinance (principal = balance being refinanced). */
export function monthlyPiForRefi(loanBalance: number, newAprPercent: number, newTermYears: number): number {
  const bal = Math.max(0, loanBalance);
  const n = Math.max(1, Math.round(Math.max(1, newTermYears) * 12));
  const monthlyRate = newAprPercent / 100 / 12;
  return monthlyPiPayment(bal, monthlyRate, n);
}

/**
 * Simple refi payback: closing costs divided by monthly P&amp;I savings.
 * Returns `null` if there is no positive savings.
 */
export function refiBreakevenMonthsFromSavings(
  refiClosingCosts: number,
  currentPiMonthly: number,
  newPiMonthly: number
): number | null {
  const savings = currentPiMonthly - newPiMonthly;
  if (!(savings > 0)) return null;
  const costs = Math.max(0, refiClosingCosts);
  if (costs <= 0) return 0;
  return costs / savings;
}

export function dtiRatios(
  annualGrossIncome: number,
  monthlyHousingPayment: number,
  monthlyNonMortgageDebt: number
): { grossMonthlyIncome: number; frontEndPct: number | null; backEndPct: number | null } {
  const gmi = Math.max(0, annualGrossIncome) / 12;
  if (gmi <= 0) return { grossMonthlyIncome: 0, frontEndPct: null, backEndPct: null };
  const fe = (monthlyHousingPayment / gmi) * 100;
  const be = ((monthlyHousingPayment + Math.max(0, monthlyNonMortgageDebt)) / gmi) * 100;
  return {
    grossMonthlyIncome: gmi,
    frontEndPct: Number.isFinite(fe) ? fe : null,
    backEndPct: Number.isFinite(be) ? be : null,
  };
}
