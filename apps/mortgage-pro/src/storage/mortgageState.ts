import scenarioDefaultsJson from "../defaults/scenario-defaults.json";
import { impliedAnnualAppreciationPercent } from "../lib/mortgageMath";

export const STORAGE_KEY = "mortgage-pro:v1";
export const SYNC_CHANNEL = "mortgage-pro-sync";

/** v1: mortgage only. v2: mortgage + rental pro-forma fields. */
export const SCHEMA_VERSION = 2 as const;
export const SCHEMA_VERSION_LEGACY = 1 as const;

export type AppPersisted = {
  v: typeof SCHEMA_VERSION;
  homePrice: number;
  downPayment: number;
  /** 0–100; kept in sync when purchase price changes (same % → new dollar amount). */
  downPaymentPercent: number;
  interestRateApr: number;
  termYears: number;
  propertyTaxAnnual: number;
  /** Annual property tax as % of purchase price (0–100); synced with `propertyTaxAnnual`. */
  propertyTaxPercent: number;
  insuranceAnnual: number;
  hoaMonthly: number;
  /** Private mortgage insurance per month ($0 if none / removed / not modeled). */
  pmiMonthly: number;
  /** Optional extra principal paid every month (P&amp;I prepayment; $0 = off). */
  extraPrincipalMonthly: number;
  /** Pre-tax annual income for DTI / affordability (0 = leave DTI blank). */
  annualGrossIncome: number;
  /** Car, cards, student loans, etc. — not housing (for back-end DTI). */
  monthlyNonMortgageDebt: number;
  monthlyRent: number;
  otherMonthlyIncome: number;
  vacancyRatePercent: number;
  closingCosts: number;
  /** One-time cash at closing not in lender fees (repairs, moving, escrow top-up, etc.). Counts toward cash-on-cash denominator. */
  miscInitialCash: number;
  propertyMgmtPercent: number;
  maintenancePercent: number;
  capexPercent: number;
  /**
   * When to sell: optional exclusions from rental cash flow in total-gain math.
   * If `lineId` or `"pi"` is `false`, that piece is omitted from operating costs or P&amp;I (default: all included).
   */
  sellRentalYieldInclude?: Record<string, boolean>;
  /** When to sell: modeled annual appreciation on purchase price until exit (%). Derived from present value & years owned. */
  sellAnnualAppreciationPercent: number;
  /** When to sell: closing costs at sale as % of sale price. */
  sellClosingCostPercent: number;
  /** Estimated market value today (vs purchase price) — drives implied annual appreciation. */
  currentHomeValue: number;
  /** Whole years since purchase — used with present value to imply compound annual appreciation. */
  yearsOwned: number;
  /**
   * Optional USD overrides for modeled buyer-cost lines (`estimateHomeBuyingOneTimeCosts` line `id`s).
   * Omitted keys use the formula amount. Persisted with the scenario.
   */
  buyingCostLineOverrides?: Partial<Record<string, number>>;
};

/** @deprecated Use AppPersisted */
export type MortgagePersisted = AppPersisted;

/**
 * Shape of `scenario-defaults.json`. Omit `v` (always current schema) and `sellAnnualAppreciationPercent`
 * (derived from purchase price, present value, and years owned).
 */
export type ScenarioDefaultsFile = Omit<AppPersisted, "v" | "sellAnnualAppreciationPercent">;

/** Editable factory defaults — single source of truth is `src/defaults/scenario-defaults.json`. */
export const SCENARIO_DEFAULTS_JSON = scenarioDefaultsJson as ScenarioDefaultsFile;

export function defaultAppStateFromJson(d: ScenarioDefaultsFile): AppPersisted {
  const yearsOwned = Math.max(1, Math.round(d.yearsOwned));
  const sellAnnualAppreciationPercent = impliedAnnualAppreciationPercent(
    d.homePrice,
    d.currentHomeValue,
    yearsOwned
  );
  return {
    v: SCHEMA_VERSION,
    ...d,
    yearsOwned,
    sellAnnualAppreciationPercent,
  };
}

/** Fresh scenario (Reset, corrupt storage). Values come from `scenario-defaults.json`. */
export const defaultAppState = (): AppPersisted => defaultAppStateFromJson(SCENARIO_DEFAULTS_JSON);

/**
 * Merge parsed storage with current schema defaults so new fields (e.g. `pmiMonthly`) appear
 * when older localStorage JSON omitted them.
 */
export function mergeParsedWithSchemaDefaults(parsed: AppPersisted): AppPersisted {
  const merged: AppPersisted = {
    ...defaultAppState(),
    ...parsed,
    v: SCHEMA_VERSION,
  };
  const { buyingCostLineOverrides: rawLineOverrides, ...mergedRest } = merged;
  const buyingCostLineOverrides = parseBuyingCostLineOverrides(rawLineOverrides);
  return {
    ...mergedRest,
    pmiMonthly: Math.max(0, Math.round(Number(merged.pmiMonthly) || 0)),
    extraPrincipalMonthly: Math.max(0, Math.round(Number(merged.extraPrincipalMonthly) || 0)),
    annualGrossIncome: Math.max(0, Math.round(Number(merged.annualGrossIncome) || 0)),
    monthlyNonMortgageDebt: Math.max(0, Math.round(Number(merged.monthlyNonMortgageDebt) || 0)),
    ...(buyingCostLineOverrides ? { buyingCostLineOverrides } : {}),
  };
}

export const defaultMortgageState = defaultAppState;

function num(x: unknown, fallback: number): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

type MortgageCore = Pick<
  AppPersisted,
  | "homePrice"
  | "downPayment"
  | "interestRateApr"
  | "termYears"
  | "propertyTaxAnnual"
  | "insuranceAnnual"
  | "hoaMonthly"
  | "pmiMonthly"
  | "extraPrincipalMonthly"
  | "annualGrossIncome"
  | "monthlyNonMortgageDebt"
>;

function clampPct(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(100, Math.max(0, p));
}

function parseV1Mortgage(data: Record<string, unknown>): MortgageCore {
  const base = defaultAppState();
  return {
    homePrice: num(data.homePrice, base.homePrice),
    downPayment: num(data.downPayment, base.downPayment),
    interestRateApr: num(data.interestRateApr, base.interestRateApr),
    termYears: num(data.termYears, base.termYears),
    propertyTaxAnnual: num(data.propertyTaxAnnual, base.propertyTaxAnnual),
    insuranceAnnual: num(data.insuranceAnnual, base.insuranceAnnual),
    hoaMonthly: num(data.hoaMonthly, base.hoaMonthly),
    pmiMonthly: num(data.pmiMonthly, base.pmiMonthly),
    extraPrincipalMonthly: num(data.extraPrincipalMonthly, base.extraPrincipalMonthly),
    annualGrossIncome: num(data.annualGrossIncome, base.annualGrossIncome),
    monthlyNonMortgageDebt: num(data.monthlyNonMortgageDebt, base.monthlyNonMortgageDebt),
  };
}

/** Derive dollar down + percent from stored JSON (prefers `downPaymentPercent` when present). */
function normalizeDownPayment(
  m: MortgageCore,
  data: Record<string, unknown>,
  base: AppPersisted
): Pick<AppPersisted, "downPayment" | "downPaymentPercent"> {
  const hp = m.homePrice;
  if (hp <= 0) {
    return {
      downPayment: Math.max(0, m.downPayment),
      downPaymentPercent: clampPct(num(data.downPaymentPercent, base.downPaymentPercent)),
    };
  }
  if (data.downPaymentPercent !== undefined && data.downPaymentPercent !== null) {
    const pct = clampPct(num(data.downPaymentPercent, base.downPaymentPercent));
    return { downPaymentPercent: pct, downPayment: Math.round((hp * pct) / 100) };
  }
  const pct = clampPct((m.downPayment / hp) * 100);
  return { downPaymentPercent: pct, downPayment: Math.round((hp * pct) / 100) };
}

type MortgageAfterDown = MortgageCore & Pick<AppPersisted, "downPayment" | "downPaymentPercent">;

/** Derive annual tax + % of value from JSON (prefers `propertyTaxPercent` when present). */
function normalizePropertyTax(
  m: MortgageAfterDown,
  data: Record<string, unknown>,
  base: AppPersisted
): Pick<AppPersisted, "propertyTaxAnnual" | "propertyTaxPercent"> {
  const hp = m.homePrice;
  const annualRaw = m.propertyTaxAnnual;
  if (hp <= 0) {
    return {
      propertyTaxAnnual: Math.max(0, annualRaw),
      propertyTaxPercent: clampPct(num(data.propertyTaxPercent, base.propertyTaxPercent)),
    };
  }
  if (data.propertyTaxPercent !== undefined && data.propertyTaxPercent !== null) {
    const pct = clampPct(num(data.propertyTaxPercent, base.propertyTaxPercent));
    return { propertyTaxPercent: pct, propertyTaxAnnual: Math.round((hp * pct) / 100) };
  }
  const pct = clampPct((annualRaw / hp) * 100);
  return { propertyTaxPercent: pct, propertyTaxAnnual: Math.round((hp * pct) / 100) };
}

type RentalOnly = Pick<
  AppPersisted,
  | "monthlyRent"
  | "otherMonthlyIncome"
  | "vacancyRatePercent"
  | "closingCosts"
  | "miscInitialCash"
  | "propertyMgmtPercent"
  | "maintenancePercent"
  | "capexPercent"
>;

function parseBuyingCostLineOverrides(raw: unknown): Partial<Record<string, number>> | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Partial<Record<string, number>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length === 0) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) continue;
    out[k] = Math.max(0, Math.round(n));
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseSellRentalYieldInclude(data: Record<string, unknown>): Record<string, boolean> | undefined {
  const raw = data.sellRentalYieldInclude;
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseRentalFields(data: Record<string, unknown>, base: AppPersisted): RentalOnly {
  return {
    monthlyRent: num(data.monthlyRent, base.monthlyRent),
    otherMonthlyIncome: num(data.otherMonthlyIncome, base.otherMonthlyIncome),
    vacancyRatePercent: num(data.vacancyRatePercent, base.vacancyRatePercent),
    closingCosts: num(data.closingCosts, base.closingCosts),
    miscInitialCash: num(data.miscInitialCash, base.miscInitialCash),
    propertyMgmtPercent: num(data.propertyMgmtPercent, base.propertyMgmtPercent),
    maintenancePercent: num(data.maintenancePercent, base.maintenancePercent),
    capexPercent: num(data.capexPercent, base.capexPercent),
  };
}

export function parseMortgageState(raw: string | null): AppPersisted {
  if (!raw) return defaultAppState();
  try {
    const data = JSON.parse(raw) as Record<string, unknown> & { v?: unknown };
    const base = defaultAppState();

    if (data.v === SCHEMA_VERSION_LEGACY) {
      const m0 = parseV1Mortgage(data);
      const d = normalizeDownPayment(m0, data, base);
      const m1 = { ...m0, ...d };
      const t = normalizePropertyTax(m1, data, base);
      const m = { ...m1, ...t };
      const merged: AppPersisted = {
        ...base,
        ...m,
        ...parseRentalFields({}, base),
        v: SCHEMA_VERSION,
      };
      const yearsOwned = Math.max(1, Math.round(merged.yearsOwned));
      const apr = merged.sellAnnualAppreciationPercent;
      const currentHomeValue = merged.homePrice * (1 + apr / 100) ** yearsOwned;
      return {
        ...merged,
        yearsOwned,
        currentHomeValue,
        sellAnnualAppreciationPercent: impliedAnnualAppreciationPercent(
          merged.homePrice,
          currentHomeValue,
          yearsOwned
        ),
      };
    }

    if (data.v !== SCHEMA_VERSION) {
      return defaultAppState();
    }

    const m0 = parseV1Mortgage(data);
    const d = normalizeDownPayment(m0, data, base);
    const m1 = { ...m0, ...d };
    const t = normalizePropertyTax(m1, data, base);
    const m = { ...m1, ...t };
    const r = parseRentalFields(data, base);
    const y = parseSellRentalYieldInclude(data);
    const yearsOwned = Math.max(1, Math.round(num(data.yearsOwned, base.yearsOwned)));
    const sellAprStored = num(data.sellAnnualAppreciationPercent, base.sellAnnualAppreciationPercent);
    const hasExplicitPresent =
      data.currentHomeValue !== undefined &&
      data.currentHomeValue !== null &&
      data.currentHomeValue !== "" &&
      Number.isFinite(Number(data.currentHomeValue));
    const currentHomeValue = hasExplicitPresent
      ? Math.max(0, Number(data.currentHomeValue))
      : m.homePrice * (1 + sellAprStored / 100) ** yearsOwned;
    const sellAnnualAppreciationPercent = impliedAnnualAppreciationPercent(
      m.homePrice,
      currentHomeValue,
      yearsOwned
    );
    const buyingCostLineOverrides = parseBuyingCostLineOverrides(data.buyingCostLineOverrides);
    return {
      v: SCHEMA_VERSION,
      ...m,
      ...r,
      pmiMonthly: num(data.pmiMonthly, base.pmiMonthly),
      extraPrincipalMonthly: num(data.extraPrincipalMonthly, base.extraPrincipalMonthly),
      annualGrossIncome: num(data.annualGrossIncome, base.annualGrossIncome),
      monthlyNonMortgageDebt: num(data.monthlyNonMortgageDebt, base.monthlyNonMortgageDebt),
      yearsOwned,
      currentHomeValue,
      sellAnnualAppreciationPercent,
      sellClosingCostPercent: num(data.sellClosingCostPercent, base.sellClosingCostPercent),
      ...(y !== undefined ? { sellRentalYieldInclude: y } : {}),
      ...(buyingCostLineOverrides ? { buyingCostLineOverrides } : {}),
    };
  } catch {
    return defaultAppState();
  }
}

export function serializeMortgageState(state: AppPersisted): string {
  return JSON.stringify({ ...state, v: SCHEMA_VERSION });
}

