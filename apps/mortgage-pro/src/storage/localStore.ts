import {
  STORAGE_KEY,
  SYNC_CHANNEL,
  mergeParsedWithSchemaDefaults,
  parseMortgageState,
  serializeMortgageState,
  type MortgagePersisted,
} from "./mortgageState";

function readFromStorage(): MortgagePersisted {
  try {
    return mergeParsedWithSchemaDefaults(parseMortgageState(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return mergeParsedWithSchemaDefaults(parseMortgageState(null));
  }
}

function writeToStorage(state: MortgagePersisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeMortgageState(state));
  } catch {
    /* private mode / quota */
  }
}

const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(SYNC_CHANNEL)
    : null;

export function loadPersistedMortgageState(): MortgagePersisted {
  return readFromStorage();
}

export function savePersistedMortgageState(state: MortgagePersisted): void {
  writeToStorage(state);
  channel?.postMessage({ type: "state", payload: serializeMortgageState(state) });
}

type Listener = (state: MortgagePersisted) => void;

/** Other tabs: `storage`. Same machine, all tabs: `BroadcastChannel` (includes edge cases). */
export function subscribeMortgageStateRemote(listener: Listener): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || event.newValue == null) return;
    listener(mergeParsedWithSchemaDefaults(parseMortgageState(event.newValue)));
  };

  const onMessage = (event: MessageEvent) => {
    if (event.data?.type !== "state" || typeof event.data.payload !== "string") {
      return;
    }
    listener(mergeParsedWithSchemaDefaults(parseMortgageState(event.data.payload)));
  };

  window.addEventListener("storage", onStorage);
  channel?.addEventListener("message", onMessage);

  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.removeEventListener("message", onMessage);
  };
}
