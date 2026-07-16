"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AssistantRuntimeProvider,
  type ThreadMessage,
} from "@assistant-ui/react";
import { HttpAgent } from "@ag-ui/client";
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui";

type StoredThread = {
  id: string;
  messages: readonly ThreadMessage[];
};

type BootState =
  | { status: "loading" }
  | { status: "ready"; token: string | null; authRequired: boolean }
  | { status: "error"; message: string };

const SESSION_HEADER = "X-Hermes-Session-Token";

/** Same-origin `/agui` via Next rewrite → Hermes `:9119`. */
function aguiUrl(): string {
  return process.env.NEXT_PUBLIC_AGUI_AGENT_URL?.trim() || "/agui";
}

async function fetchHermesBoot(): Promise<BootState> {
  try {
    const res = await fetch("/api/marko/boot", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        status: "error",
        message: `Hermes boot failed (${res.status}). Is Hermes on :9119? ${detail}`,
      };
    }
    const data = (await res.json()) as {
      token?: string | null;
      authRequired?: boolean;
    };
    return {
      status: "ready",
      token: data.token ?? null,
      authRequired: Boolean(data.authRequired),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "error",
      message: `Cannot reach Hermes boot endpoint: ${message}`,
    };
  }
}

function HermesAgUiRuntime({
  token,
  children,
}: Readonly<{ token: string | null; children: ReactNode }>) {
  const threadsRef = useRef<Map<string, StoredThread>>(new Map());
  const [currentThreadId, setCurrentThreadId] = useState<string>(() => {
    const id = crypto.randomUUID();
    threadsRef.current.set(id, { id, messages: [] });
    return id;
  });

  const agentUrl = aguiUrl();

  const agent = useMemo(() => {
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    };
    if (token) {
      headers[SESSION_HEADER] = token;
    }
    return new HttpAgent({
      url: agentUrl,
      threadId: currentThreadId,
      headers,
    });
  }, [agentUrl, currentThreadId, token]);

  const threadListAdapter = useMemo(
    () => ({
      threadId: currentThreadId,
      onSwitchToNewThread: async () => {
        const newId = crypto.randomUUID();
        threadsRef.current.set(newId, { id: newId, messages: [] });
        setCurrentThreadId(newId);
      },
      onSwitchToThread: async (threadId: string) => {
        const thread = threadsRef.current.get(threadId);
        if (!thread) {
          throw new Error(`Thread ${threadId} not found`);
        }
        setCurrentThreadId(threadId);
        return { messages: thread.messages };
      },
    }),
    [currentThreadId],
  );

  const runtime = useAgUiRuntime({
    agent,
    logger: {
      debug: (...a: unknown[]) => console.debug("[agui]", ...a),
      error: (...a: unknown[]) => console.error("[agui]", ...a),
    },
    adapters: {
      threadList: threadListAdapter,
    },
  });

  useEffect(() => {
    return runtime.thread.subscribe(() => {
      threadsRef.current.set(currentThreadId, {
        id: currentThreadId,
        messages: runtime.thread.getState().messages,
      });
    });
  }, [runtime, currentThreadId]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

/**
 * assistant-ui AG-UI runtime pointed at this repo's Hermes FastAPI `/agui`.
 */
export function MyRuntimeProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [boot, setBoot] = useState<BootState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void fetchHermesBoot().then((next) => {
      if (!cancelled) setBoot(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (boot.status === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
        Connecting to Hermes…
      </div>
    );
  }

  if (boot.status === "error") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium">Hermes unavailable</p>
        <p className="max-w-md text-sm text-muted-foreground">{boot.message}</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Start Hermes with{" "}
          <code className="rounded bg-muted px-1">
            bash scripts/start-hermes-ui.sh --skip-build
          </code>{" "}
          (dashboard on :9119), then reload.
        </p>
      </div>
    );
  }

  if (boot.authRequired && !boot.token) {
    return (
      <div className="flex h-dvh items-center justify-center px-6 text-center text-sm">
        Hermes auth is required. Sign in via the Marko/Hermes dashboard, then
        retry.
      </div>
    );
  }

  return (
    <HermesAgUiRuntime token={boot.token}>{children}</HermesAgUiRuntime>
  );
}
