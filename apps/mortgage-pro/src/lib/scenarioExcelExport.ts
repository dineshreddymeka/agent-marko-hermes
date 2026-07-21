import * as XLSX from "xlsx";
import type { MonthlyBreakdown } from "./mortgageMath";
import type { RentalAnalysis } from "./rentalMath";
import { buildFullScenarioExport } from "./scenarioExport";
import type { AppPersisted } from "../storage/mortgageState";

type Cell = string | number | boolean | null;

function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
}

function aoaSheet(rows: Cell[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows);
}

function append(wb: XLSX.WorkBook, name: string, rows: Cell[][]) {
  XLSX.utils.book_append_sheet(wb, aoaSheet(rows), safeSheetName(name));
}

function flattenScenario(state: AppPersisted): Cell[][] {
  const header: Cell[][] = [["Key", "Value"]];
  const rows: Cell[][] = [];
  for (const [k, v] of Object.entries(state)) {
    if (v === undefined) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        rows.push([
          `${k}.${k2}`,
          typeof v2 === "object" ? JSON.stringify(v2) : (v2 as Cell),
        ]);
      }
    } else {
      rows.push([k, typeof v === "object" ? JSON.stringify(v) : (v as Cell)]);
    }
  }
  return header.concat(rows);
}

function monthlyBreakdownRows(label: string, a: MonthlyBreakdown, b: MonthlyBreakdown, c: MonthlyBreakdown): Cell[][] {
  return [
    [label, "Scenario_term", "PI_30_yr", "PI_15_yr"],
    [
      "principalAndInterest",
      a.principalAndInterest,
      b.principalAndInterest,
      c.principalAndInterest,
    ],
    ["propertyTax", a.propertyTax, b.propertyTax, c.propertyTax],
    ["insurance", a.insurance, b.insurance, c.insurance],
    ["hoa", a.hoa, b.hoa, c.hoa],
    ["pmi", a.pmi, b.pmi, c.pmi],
    ["total", a.total, b.total, c.total],
    ["loanAmount", a.loanAmount, b.loanAmount, c.loanAmount],
  ];
}

function rentalCompareSheet(
  scenario: RentalAnalysis,
  r30: RentalAnalysis,
  r15: RentalAnalysis,
  yield30: number,
  yield15: number
): Cell[][] {
  return [
    ["Metric", "Mortgage_term_path", "30yr_PI_path", "15yr_PI_path"],
    [
      "Gross_scheduled_income_mo",
      scenario.grossScheduledIncomeMonthly,
      r30.grossScheduledIncomeMonthly,
      r15.grossScheduledIncomeMonthly,
    ],
    [
      "Vacancy_loss_mo",
      scenario.vacancyLossMonthly,
      r30.vacancyLossMonthly,
      r15.vacancyLossMonthly,
    ],
    [
      "EGI_mo",
      scenario.effectiveGrossIncomeMonthly,
      r30.effectiveGrossIncomeMonthly,
      r15.effectiveGrossIncomeMonthly,
    ],
    ["NOI_mo", scenario.noiMonthly, r30.noiMonthly, r15.noiMonthly],
    ["NOI_annual", scenario.noiAnnual, r30.noiAnnual, r15.noiAnnual],
    ["Cap_rate", scenario.capRate, r30.capRate, r15.capRate],
    [
      "PI_mo",
      scenario.principalAndInterestMonthly,
      r30.principalAndInterestMonthly,
      r15.principalAndInterestMonthly,
    ],
    ["PMI_mo", scenario.pmiMonthly, r30.pmiMonthly, r15.pmiMonthly],
    [
      "Cash_flow_mo",
      scenario.cashFlowMonthly,
      r30.cashFlowMonthly,
      r15.cashFlowMonthly,
    ],
    [
      "Cash_flow_annual",
      scenario.cashFlowAnnual,
      r30.cashFlowAnnual,
      r15.cashFlowAnnual,
    ],
    [
      "Initial_cash_invested",
      scenario.initialCashInvested,
      r30.initialCashInvested,
      r15.initialCashInvested,
    ],
    ["Cash_on_cash", scenario.cashOnCash, r30.cashOnCash, r15.cashOnCash],
    ["Yield_adj_annual_CF_WTS", "", yield30, yield15],
  ];
}

function tableFromObjects<T extends object>(rows: T[], title: string): Cell[][] {
  if (rows.length === 0) return [[`${title} (empty)`]];
  const keys = Object.keys(rows[0]!);
  const header: Cell[] = keys;
  const body: Cell[][] = rows.map((r) =>
    keys.map((k) => (r as Record<string, Cell>)[k] ?? null)
  );
  return [header, ...body];
}

function amortRowSheet(title: string, row: Record<string, unknown> | null): Cell[][] {
  if (!row) return [[`${title}`, "(none)"]];
  const body: Cell[][] = Object.entries(row).map(([k, v]) => [
    k,
    typeof v === "object" ? JSON.stringify(v) : (v as Cell),
  ]);
  return [["Field", "Value"], ...body];
}

/** Build .xlsx workbook: inputs, formulas, and calculated tables (multi-sheet). */
export function buildScenarioExcelBlob(state: AppPersisted): Blob {
  const ex = buildFullScenarioExport(state);
  const wb = XLSX.utils.book_new();

  append(wb, "Info", [
    ["Field", "Value"],
    ["exportKind", ex.exportKind],
    ["exportVersion", ex.exportVersion],
    ["exportedAt", ex.exportedAt],
    [
      "Note",
      "Workbook is for review in Excel. Scenarios persist in this browser (Save) or reset to factory defaults.",
    ],
  ]);

  append(wb, "Scenario_inputs", flattenScenario(ex.scenario));

  append(
    wb,
    "Formulas",
    [["Metric", "Description"]].concat(Object.entries(ex.formulas).map(([k, v]) => [k, v]))
  );

  const c = ex.calculated;
  append(wb, "Summary", [
    ["Section", "Metric", "Value"],
    ["common", "purchasePrice", c.common.purchasePrice],
    ["common", "downPayment", c.common.downPayment],
    ["common", "loanAmount", c.common.loanAmount],
    ["common", "currentHomeValue", c.common.currentHomeValue],
    ["common", "yearsOwned", c.common.yearsOwned],
    [
      "common",
      "impliedAnnualAppreciationPct",
      c.common.impliedAnnualAppreciationPercent_fromPresentValue,
    ],
    [
      "common",
      "sellAnnualAppreciationPct_projections",
      c.common.sellAnnualAppreciationPercent_usedInProjections,
    ],
    ["mortgage", "termYears", c.mortgage.termYears],
    ["mortgage", "amortMonths", c.mortgage.amortizationForScenarioTerm.months],
    [
      "mortgage",
      "totalInterest",
      c.mortgage.amortizationForScenarioTerm.totalInterest,
    ],
    [
      "mortgage",
      "totalPrincipal",
      c.mortgage.amortizationForScenarioTerm.totalPrincipal,
    ],
    [
      "whenToSell",
      "exitHorizonYears",
      c.whenToSell.exitHorizonYears_clampedToTerm,
    ],
    [
      "rental",
      "yieldAdjAnnualCF_30",
      c.rental.whenToSell_yieldAdjustedAnnualCashFlow_30yrPath,
    ],
    [
      "rental",
      "yieldAdjAnnualCF_15",
      c.rental.whenToSell_yieldAdjustedAnnualCashFlow_15yrPath,
    ],
  ]);

  const mp = c.mortgage;
  append(
    wb,
    "Mortgage_monthly",
    monthlyBreakdownRows(
      "Line",
      mp.monthlyPaymentForScenarioTerm,
      mp.monthlyPaymentComparison30Year,
      mp.monthlyPaymentComparison15Year
    )
  );

  append(
    wb,
    "Amort_first_row",
    amortRowSheet("first", c.mortgage.firstAmortizationRow as Record<string, unknown> | null)
  );
  append(
    wb,
    "Amort_last_row",
    amortRowSheet("last", c.mortgage.lastAmortizationRow as Record<string, unknown> | null)
  );

  append(
    wb,
    "Rental_compare",
    rentalCompareSheet(
      c.rental.rentalProformaWithMortgageTerm,
      c.rental.rentalProformaWith30YearPI,
      c.rental.rentalProformaWith15YearPI,
      c.rental.whenToSell_yieldAdjustedAnnualCashFlow_30yrPath,
      c.rental.whenToSell_yieldAdjustedAnnualCashFlow_15yrPath
    )
  );

  append(
    wb,
    "When_sell_yearly",
    tableFromObjects(c.whenToSell.yearlyProjection_rows_year1Through30, "yearly")
  );
  append(
    wb,
    "Real_wealth_milestones",
    tableFromObjects(c.whenToSell.realWealthMilestoneSnapshots, "milestones")
  );

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadScenarioExcel(state: AppPersisted, filename = "property-pro-scenario.xlsx") {
  const blob = buildScenarioExcelBlob(state);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
