/**
 * Rule-of-thumb buyer one-time costs (not a Loan Estimate).
 * Used to suggest a closing-costs figure vs user-entered `closingCosts`.
 */

export type BuyerCostLine = {
  id: string;
  label: string;
  amount: number;
  /** Rough buckets for UI / partial apply. */
  kind: "fee" | "prepaid";
};

export type HomeBuyingCostEstimate = {
  lines: BuyerCostLine[];
  feesSubtotal: number;
  prepaidsSubtotal: number;
  /** Sum of all modeled lines — typical single “closing costs” bucket in this app. */
  suggestedClosingTotal: number;
};

/**
 * @param prepaidTaxMonths — months of property tax collected at closing (often ~2–6).
 * @param prepaidInsuranceMonths — first-year homeowners prepay window (often ~12–15).
 */
export function estimateHomeBuyingOneTimeCosts(params: {
  homePrice: number;
  loanAmount: number;
  propertyTaxAnnual: number;
  insuranceAnnual: number;
  hoaMonthly: number;
  prepaidTaxMonths?: number;
  prepaidInsuranceMonths?: number;
}): HomeBuyingCostEstimate {
  const hp = Math.max(0, params.homePrice);
  const loan = Math.max(0, params.loanAmount);
  const tax = Math.max(0, params.propertyTaxAnnual);
  const ins = Math.max(0, params.insuranceAnnual);
  const hoa = Math.max(0, params.hoaMonthly);
  const prepaidTaxMo = Math.min(12, Math.max(0, params.prepaidTaxMonths ?? 3));
  const prepaidInsMo = Math.min(18, Math.max(0, params.prepaidInsuranceMonths ?? 13));

  const lines: BuyerCostLine[] = [];

  const recording = Math.round(Math.min(Math.max(hp * 0.0025, 150), 7500));
  lines.push({ id: "recording", label: "Recording / transfer (est.)", amount: recording, kind: "fee" });

  lines.push({ id: "appraisal", label: "Appraisal (est.)", amount: 600, kind: "fee" });
  lines.push({ id: "inspection", label: "Home inspection (est.)", amount: 500, kind: "fee" });

  const lenderTitle = Math.round(Math.min(Math.max(loan * 0.009, 800), 25_000));
  lines.push({
    id: "lenderTitle",
    label: "Lender / title / settlement (est., % of loan)",
    amount: lenderTitle,
    kind: "fee",
  });

  const prepaidTax = Math.round((tax / 12) * prepaidTaxMo);
  lines.push({
    id: "escrowTax",
    label: `Property tax escrow (~${prepaidTaxMo} mo)`,
    amount: prepaidTax,
    kind: "prepaid",
  });

  const prepaidIns = Math.round((ins / 12) * prepaidInsMo);
  lines.push({
    id: "insPrepay",
    label: `Homeowners insurance prepaid (~${prepaidInsMo} mo)`,
    amount: prepaidIns,
    kind: "prepaid",
  });

  if (hoa > 0) {
    lines.push({
      id: "hoaPrepay",
      label: "HOA prepaid (~2 mo)",
      amount: Math.round(hoa * 2),
      kind: "prepaid",
    });
  }

  const feesSubtotal = lines.filter((l) => l.kind === "fee").reduce((s, l) => s + l.amount, 0);
  const prepaidsSubtotal = lines.filter((l) => l.kind === "prepaid").reduce((s, l) => s + l.amount, 0);
  const suggestedClosingTotal = feesSubtotal + prepaidsSubtotal;

  return {
    lines,
    feesSubtotal,
    prepaidsSubtotal,
    suggestedClosingTotal,
  };
}

/**
 * Apply per-line USD overrides (by `BuyerCostLine.id`) on top of `estimateHomeBuyingOneTimeCosts`.
 * Missing or non-finite keys keep the modeled amount. Recomputes fee / prepaid subtotals and suggested total.
 */
export function applyBuyerCostLineOverrides(
  estimate: HomeBuyingCostEstimate,
  overrides: Partial<Record<string, number>> | undefined | null
): HomeBuyingCostEstimate {
  if (!overrides || Object.keys(overrides).length === 0) return estimate;
  const lines = estimate.lines.map((l) => {
    const o = overrides[l.id];
    if (o === undefined || !Number.isFinite(o)) return l;
    return { ...l, amount: Math.max(0, Math.round(o)) };
  });
  const feesSubtotal = lines.filter((l) => l.kind === "fee").reduce((s, l) => s + l.amount, 0);
  const prepaidsSubtotal = lines.filter((l) => l.kind === "prepaid").reduce((s, l) => s + l.amount, 0);
  return {
    lines,
    feesSubtotal,
    prepaidsSubtotal,
    suggestedClosingTotal: feesSubtotal + prepaidsSubtotal,
  };
}
