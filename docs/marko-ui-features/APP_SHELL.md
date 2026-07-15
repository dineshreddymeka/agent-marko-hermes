# App Shell — Detailed Implementation

## Goal

Provide the Marko chrome around chat: icon rail, sessions sidebar, main column, optional right panel, mobile nav, footer, theme, toasts, and keyboard shortcuts.

## Layout

```
┌────────┬────────────┬────────────────────────┬──────────┐
│ Icon   │ Sessions   │ ChatColumn / Panel     │ Right    │
│ Rail   │ Sidebar    │                        │ Panel    │
│        │ (optional) │                        │(optional)│
├────────┴────────────┴────────────────────────┴──────────┤
│ StatusFooter (context ring + model)                     │
└─────────────────────────────────────────────────────────┘
```

**Files:** `AppShell.tsx`, `IconRail.tsx`, `Sidebar.tsx`, `ChatColumn.tsx`, `RightPanel.tsx`, `MobileNav.tsx`, `StatusFooter.tsx`

## Routing (TanStack Router)

| Route | Purpose |
|-------|---------|
| `/` | Default → empty chat or redirect |
| `/session/$id` | Chat for session |
| `/panel/$name` | Full-bleed panel (workspace, skills, …) |
| `/login` | Auth gate |

**Files:** `ui/src/routes/*`, `routeTree.gen.ts`

`panel.$name.tsx` maps name → panel component; unknown/descoped → `DescopedPanel`.

## UI store

**File:** `ui/src/stores/ui.ts`

| Field | Purpose |
|-------|---------|
| `theme` | `dark \| dim \| light` |
| `sidebarOpen` | Sessions drawer |
| `rightPanelOpen` | Agent state / preview |
| `activePanel` | Current rail panel id |
| `workspacePreviewPath` | File opened by frontend tool |
| `commandPaletteOpen` | Ctrl+K |
| `toasts` | Global toast stack |

Persist theme (e.g. zustand persist `hermes-ui`).

Apply theme: `document.documentElement.dataset.theme = theme`.

## Keyboard shortcuts

**File:** `ui/src/hooks/useKeyboardShortcuts.ts` (or similar)

| Shortcut | Action |
|----------|--------|
| Ctrl+K | Command palette |
| Ctrl+N | New session |
| Ctrl+B | Toggle sidebar |
| Ctrl+Alt+B | Toggle right panel |
| Esc | Close palette / cancel run |

## Command palette

**File:** `CommandPalette.tsx`

Actions: jump to panel, new session, run slash command, theme cycle.

## Toasts

**File:** `Toasts.tsx` + `ui.addToast({ title, description?, variant })`

Triggered by dispatcher customs, panel mutations, A2UI actions.

## Status footer

**File:** `StatusFooter.tsx`

- Context ring from `hermes.context` / `chat.contextUsage`
- Model label from `/api/health` poll

## Right panel

Default: agent state (todos / plan from `STATE_*` events) via `AgentStatePanel.tsx` + `stores/agentState.ts`.

Also hosts workspace file preview when `workspacePreviewPath` set.

## Implementation steps

1. Build AppShell grid with rail + conditional sidebars.
2. Wire TanStack routes for session + panel.
3. Implement ui store + theme persistence.
4. Add shortcuts + command palette.
5. Add toast host + status footer.
6. Gate rail items via capabilities ([CAPABILITIES.md](./CAPABILITIES.md)).

## Acceptance

- [ ] Desktop layout matches diagram; mobile uses MobileNav.
- [ ] Theme persists across reload.
- [ ] Ctrl+K opens palette; Esc closes / cancels appropriately.
- [ ] Opening `/panel/workspace` shows Workspace full-bleed.

## Reference files

| Concern | Path |
|---------|------|
| Shell | `ui/src/components/shell/AppShell.tsx` |
| Rail | `ui/src/components/shell/IconRail.tsx` |
| Routes | `ui/src/routes/` |
| UI store | `ui/src/stores/ui.ts` |
| Palette | `ui/src/components/common/CommandPalette.tsx` |
| Toasts | `ui/src/components/common/Toasts.tsx` |
| Footer | `ui/src/components/shell/StatusFooter.tsx` |
