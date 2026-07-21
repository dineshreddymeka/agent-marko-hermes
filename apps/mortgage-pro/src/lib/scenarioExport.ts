import type { AppPersisted } from "../storage/mortgageState";
import {
  buildAmortizationSchedule,
  buildAmortizationScheduleWithExtraPrincipal,
  computeMonthlyPayment,
  impliedAnnualAppreciationPercent,
  scheduleTotals,
} from "./mortgageMath";
import { cashFlowAnnualFromYieldToggles, computeRentalAnalysis } from "./rentalMath";
import {
  buildRealWealthExitSnapshots,
  buildSellYearlyRows,
  REAL_WEALTH_MILESTONE_YEARS,
} from "./whenToSellMath";

/**
 * Human-readable formulas matching app logic (Mortgage, Rental, When to sell).
 * Export-only documentation; not executed.
 */
export const SCENARIO_EXPORT_FORMULAS: Record<string, string> = {
  impliedAnnualAppreciationPercent:
    "Compound annual rate from purchase to present: ((currentHomeValue / homePrice)^(1 / yearsOwned) - 1) * 100, with yearsOwned at least 1.",
  futureHomeValue:
    "Modeled value at exit year Y: homePrice * (1 + sellAnnualAppreciationPercent/100) ^ Y.",
  netProceedsAtSale:
    "max(0, futureHomeValue - remainingLoanBalance - futureHomeValue * sellClosingCostPercent/100).",
  monthlyPayment:
    "Fixed-rate amortizing P&I from loan amount, APR, term; property tax, insurance, HOA, and optional PMI per month in MonthlyBreakdown.",
  extraPrincipalMonthly:
    "Optional add-on principal each month: same scheduled P&I as the no-prepay loan; surplus reduces balance early (Mortgage tab schedule used for refi/yearly views; rental / other paths may use standard amortization).",
  refiBreakevenSimple:
    "P&I savings = current P&I − new fixed P&I on refinanced balance; payback (months) = refi closing costs / monthly savings when savings > 0. Remaining balance can be snapped from the modeled schedule by completed loan year.",
  rentalGsiEgi:
    "GSI = monthlyRent + otherMonthlyIncome; vacancy loss = GSI * vacancyRatePercent/100; EGI = GSI - vacancy loss.",
  rentalNoi:
    "NOI (monthly) = EGI - management - maintenance - capex reserve - monthly property tax - monthly insurance - HOA.",
  rentalCashFlow:
    "Monthly cash flow = NOI - P&I. Yield toggles (sellRentalYieldInclude) can omit OpEx lines or P&I for alternate gain paths.",
  cashOnCash: "Annual cash flow / (downPayment + closingCosts + miscInitialCash).",
  capRate: "NOI (annual) / purchasePrice (homePrice).",
  totalGainWhenToSell:
    "At exit: netProceeds + sum of monthly amounts through exit − initial cash. While the loan is active: yield-adjusted cash flow (NOI − P&I with toggles). After the loan is paid off: effective gross income only (vacancy applied; no operating expenses or P&I).",
};

export function buildFullScenarioExport(state: AppPersisted) {
  const hp = Math.max(0, state.homePrice);
  const dp = Math.max(0, state.downPayment);
  const loanAmount = Math.max(0, hp - dp);
  const apr = state.interestRateApr;
  const termYears = Math.min(30, Math.max(1, Math.round(state.termYears)));

  const monthlyScenario = computeMonthlyPayment(
    hp,
    dp,
    apr,
    termYears,
    state.propertyTaxAnnual,
    state.insuranceAnnual,
    state.hoaMonthly,
    state.pmiMonthly
  );
  const monthly30 = computeMonthlyPayment(
    hp,
    dp,
    apr,
    30,
    state.propertyTaxAnnual,
    state.insuranceAnnual,
    state.hoaMonthly,
    state.pmiMonthly
  );
  const monthly15 = computeMonthlyPayment(
    hp,
    dp,
    apr,
    15,
    state.propertyTaxAnnual,
    state.insuranceAnnual,
    state.hoaMonthly,
    state.pmiMonthly
  );

  const schedTerm = buildAmortizationSchedule(loanAmount, apr, termYears);
  const totalsTerm = scheduleTotals(schedTerm);
  const schedPrepay =
    state.extraPrincipalMonthly > 0
      ? buildAmortizationScheduleWithExtraPrincipal(loanAmount, apr, termYears, state.extraPrincipalMonthly)
      : null;
  const totalsPrepay = schedPrepay ? scheduleTotals(schedPrepay) : null;

  const rentalTerm = computeRentalAnalysis(state, monthlyScenario);
  const rental30 = computeRentalAnalysis(state, monthly30);
  const rental15 = computeRentalAnalysis(state, monthly15);

  const yieldCf30 = cashFlowAnnualFromYieldToggles(rental30, state.sellRentalYieldInclude);
  const yieldCf15 = cashFlowAnnualFromYieldToggles(rental15, state.sellRentalYieldInclude);

  const sellRows = buildSellYearlyRows(
    loanAmount,
    apr,
    hp,
    state.sellAnnualAppreciationPercent,
    state.sellClosingCostPercent,
    30,
    termYears
  );
  const milestones = buildRealWealthExitSnapshots(
    state,
    loanAmount,
    apr,
    sellRows,
    REAL_WEALTH_MILESTONE_YEARS,
    state.sellRentalYieldInclude
  );

  const impliedAprVerify = impliedAnnualAppreciationPercent(hp, state.currentHomeValue, state.yearsOwned);

  return {
    exportKind: "property-pro-full-export",
    exportVersion: 2,
    exportedAt: new Date().toISOString(),
    scenario: state,
    formulas: SCENARIO_EXPORT_FORMULAS,
    calculated: {
      common: {
        purchasePrice: hp,
        downPayment: dp,
        loanAmount,
        currentHomeValue: state.currentHomeValue,
        yearsOwned: state.yearsOwned,
        impliedAnnualAppreciationPercent_fromPresentValue: impliedAprVerify,
        sellAnnualAppreciationPercent_usedInProjections: state.sellAnnualAppreciationPercent,
      },
      mortgage: {
        termYears: state.termYears,
        monthlyPaymentForScenarioTerm: monthlyScenario,
        monthlyPaymentComparison30Year: monthly30,
        monthlyPaymentComparison15Year: monthly15,
        amortizationForScenarioTerm: {
          months: schedTerm.length,
          totalInterest: totalsTerm.totalInterest,
          totalPrincipal: totalsTerm.totalPrincipal,
        },
        amortizationWithExtraPrincipalWhenSet:
          schedPrepay && totalsPrepay
            ? {
                extraPrincipalMonthly: state.extraPrincipalMonthly,
                months: schedPrepay.length,
                totalInterest: totalsPrepay.totalInterest,
                totalPrincipal: totalsPrepay.totalPrincipal,
                interestSavedVsNoPrepay: totalsTerm.totalInterest - totalsPrepay.totalInterest,
                monthsShortenedVsNoPrepay: schedTerm.length - schedPrepay.length,
              }
            : null,
        firstAmortizationRow: schedTerm[0] ?? null,
        lastAmortizationRow: schedTerm.length > 0 ? schedTerm[schedTerm.length - 1] ?? null : null,
      },
      rental: {
        rentalProformaWithMortgageTerm: rentalTerm,
        rentalProformaWith30YearPI: rental30,
        rentalProformaWith15YearPI: rental15,
        whenToSell_yieldAdjustedAnnualCashFlow_30yrPath: yieldCf30,
        whenToSell_yieldAdjustedAnnualCashFlow_15yrPath: yieldCf15,
      },
      whenToSell: {
        exitHorizonYears_clampedToTerm: termYears,
        yearlyProjection_rows_year1Through30: sellRows,
        realWealthMilestoneSnapshots: milestones,
      },
    },
  };
}
