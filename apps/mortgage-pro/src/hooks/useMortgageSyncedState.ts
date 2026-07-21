import { useCallback, useEffect, useRef, useState } from "react";
import { impliedAnnualAppreciationPercent } from "../lib/mortgageMath";
import {
  defaultMortgageState,
  SCHEMA_VERSION,
  serializeMortgageState,
  type AppPersisted,
} from "../storage/mortgageState";
import {
  loadPersistedMortgageState,
  savePersistedMortgageState,
  subscribeMortgageStateRemote,
} from "../storage/localStore";

export function useMortgageSyncedState() {
  const [state, setState] = useState<AppPersisted>(loadPersistedMortgageState);
  const lastSerialized = useRef(serializeMortgageState(state));

  useEffect(() => {
    return subscribeMortgageStateRemote((remote) => {
      const incoming = serializeMortgageState(remote);
      if (incoming === lastSerialized.current) return;
      lastSerialized.current = incoming;
      setState(remote);
    });
  }, []);

  useEffect(() => {
    const serialized = serializeMortgageState(state);
    if (serialized === lastSerialized.current) return;
    lastSerialized.current = serialized;
    savePersistedMortgageState(state);
  }, [state]);

  const patch = useCallback((partial: Partial<AppPersisted>) => {
    setState((prev) => {
      const normalized =
        partial.extraPrincipalMonthly !== undefined
          ? {
              ...partial,
              extraPrincipalMonthly: Math.max(0, Math.round(Number(partial.extraPrincipalMonthly) || 0)),
            }
          : partial;
      const next = { ...prev, ...normalized, v: SCHEMA_VERSION };
      const apr = impliedAnnualAppreciationPercent(
        next.homePrice,
        next.currentHomeValue,
        next.yearsOwned
      );
      return { ...next, sellAnnualAppreciationPercent: apr };
    });
  }, []);

  const reset = useCallback(() => {
    const next = defaultMortgageState();
    lastSerialized.current = serializeMortgageState(next);
    savePersistedMortgageState(next);
    setState(next);
  }, []);

  const replace = useCallback((next: AppPersisted) => {
    const yearsOwned = Math.max(1, Math.round(next.yearsOwned ?? 1));
    const currentHomeValue =
      next.currentHomeValue !== undefined && Number.isFinite(next.currentHomeValue)
        ? Math.max(0, next.currentHomeValue)
        : next.homePrice * (1 + (next.sellAnnualAppreciationPercent ?? 0) / 100) ** yearsOwned;
    const synced: AppPersisted = {
      ...next,
      yearsOwned,
      currentHomeValue,
      v: SCHEMA_VERSION,
      sellAnnualAppreciationPercent: impliedAnnualAppreciationPercent(
        next.homePrice,
        currentHomeValue,
        yearsOwned
      ),
    };
    lastSerialized.current = serializeMortgageState(synced);
    savePersistedMortgageState(synced);
    setState(synced);
  }, []);

  /** Writes current scenario JSON to localStorage (same as auto-save; use for explicit “Save”). */
  const saveToBrowser = useCallback(() => {
    const serialized = serializeMortgageState(state);
    lastSerialized.current = serialized;
    savePersistedMortgageState(state);
  }, [state]);

  return { state, patch, reset, replace, saveToBrowser };
}
