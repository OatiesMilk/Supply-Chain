# Microgenesis UI foundations — UI-005

This is a small set of native React controls and CSS tokens for the Supply Chain Portal. It retains the navy (`#1F3864`) and blue (`#0078C1`) identity and the existing task flows. Import from `@/components/ui`; the styles live in `client/src/index.css`. No framework or dependency was added.

## Inventory and first migration

| Existing pattern | Preserve | Shared foundation adopted here |
| --- | --- | --- |
| Navbar tools repeat compact button/focus/color classes | Menu, search shortcut, zoom limits, logout and guarded local demo reset | `Button`, `IconButton`, wrapping toolbar |
| MainLayout canvas and API error banner | Sidebar/route/data ownership | Canvas token and `ErrorState` |
| RecordCreateForm labels, bordered controls, footer actions | Company selection, category options, draft vs submit values, output actions and attachment retry | `Card`, `Field`, `Input`, `Select`, `Textarea`, `Button`, `IconButton` |
| ComboboxField filtering and keyboard selection | Custom selection callbacks and grouped options | Shared `Field`/`Input`, associated IDs and errors |
| OperationalDashboard panels, tools, filters and feedback | Five roles, KPI scopes, counts, chart proportions, query keys and pagination | `Card`, `PageHeader`, controls, `ErrorState`, `EmptyState`, readable `StatusBadge` |
| ActionDialog already uses native `showModal()` | Native modality, Escape/pending rules, backdrop opt-in, focus restoration and confirmDisabled | Shared dialog surface, Button and ErrorState |
| Pagination already has a tested windowing algorithm and native controls | Page bounds, page size callbacks, ellipses, record ranges and accessible names | Shared Button/Select and unique page-size label IDs |
| NotificationBell trigger | Notification loading/read/navigation/popover behavior | Trigger-only `IconButton`; remaining notification accessibility belongs to UI-001 |

The dashboard's proportional chart segments remain native buttons with their original width calculations. Applying a minimum width to those segments would misrepresent data. The adjacent text/table actions use the shared 44px controls. KPI cards remain native buttons with `mg-card mg-kpi`, keeping their card geometry and fixed scope.

Other modules retain their existing styles. Sidebar/navigation architecture, Driver execution, reporting, lifecycle statuses, server permissions and persistence are outside this migration.

## Tokens

| Family | Tokens / values | Use |
| --- | --- | --- |
| Brand | `--mg-brand-navy`, `--mg-brand-blue`, `--mg-brand-hover` | Primary action default/pressed/hover |
| Surface | `--mg-canvas`, `--mg-surface`, `--mg-surface-muted` | App canvas, cards/controls, quiet/disabled surfaces |
| Text and borders | `--mg-text`, `--mg-text-muted`, `--mg-border`, `--mg-control-border` | Body/helper text, panel boundaries, recognizable editable controls |
| Semantic | `--mg-{danger,success,warning,info}-{text,surface}` | Error/success/warning/info feedback; actual status words remain visible |
| Focus | `--mg-focus` | 2px focus-visible outline, 2px offset |
| Typography | `--mg-text-sm: .875rem`, `--mg-text-base: 1rem`, `--mg-text-title: 1.25rem` | Existing Plus Jakarta Sans/system stack; 14px data/actions, 16px editable controls/body, 20px titles |
| Spacing | `--mg-space-{1,2,3,4,6}` | 4/8/12/16/24px at the default root size |
| Geometry | `--mg-radius-control: .5rem`, `--mg-radius-panel: .75rem` | Controls and containers |
| Elevation | `--mg-elevation-panel`, `--mg-elevation-dialog` | Subtle panel boundary and modal separation |
| Size | `--mg-control-height: max(44px, 2.75rem)` | At least 44 CSS px even at the app's 90% minimum text setting; expands with larger text |
| Disabled | `--mg-disabled-text` plus muted surface/border | Native disabled interaction; visible state without blanket opacity |

`Input`, `Select` and `Textarea` use `.mg-control` at `--mg-text-base` (1rem, 16px at the default root size). Buttons, data, errors and functional navigation use `--mg-text-sm` / `text-data` (0.875rem, 14px). Both scale with the app Text Size preference. Editable controls must not inherit the smaller button/data font; explicit local typography overrides remain the caller's responsibility. See [UI typography](UI_TYPOGRAPHY.md) and the [GH-210 follow-up evidence](UI-002-readable-controls-verification.md).

Shared token text pairs are checked for a contrast ratio of at least 4.5:1; focus and control-border pairs on white are checked for at least 3:1. These are checks of the specified palette, not a claim that every screen or every rendered state meets WCAG. Screens with custom chart colors, imagery and existing utility overrides still need review.

## Before and after examples

| Before: repeated per-screen styles | After: shared native contract |
| --- | --- |
| `<button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold ...">Refresh</button>` | `<Button variant="secondary" onClick={refresh}>Refresh</Button>` |
| `<button className="p-1.5 ..."><X /></button>` | `<IconButton label="Close" onClick={close}><X aria-hidden="true" /></IconButton>` |
| Separate unassociated label/input/error paragraphs | `Field` provides one associated ID and descriptions to a native control (example below). |
| Repeated rounded white panel/box-shadow strings | `<Card as="section" aria-labelledby="summary-heading">...</Card>` |
| Per-screen status color with unclear meaning | `<StatusBadge tone="warning">Rescheduled</StatusBadge>` |
| Per-screen stale/empty paragraphs | `<ErrorState tone="warning">Dashboard is stale. ...</ErrorState>` / `<EmptyState title="No matching records." />` |

```tsx
import { Button, Field, Input, Select, Textarea } from '@/components/ui';

<Field id="reference" label="Reference (SAP Number)"
  required={!isDraft} error={errors.reference}
  description="Required when submitting; optional for drafts.">
  {control => <Input {...control} value={reference}
    onChange={event => setReference(event.target.value)} />}
</Field>

<Field id="module" label="Module">
  {control => <Select {...control} value={module} onChange={changeModule}>
    <option value="DELIVERY">Deliveries</option>
  </Select>}
</Field>
<Field id="remarks" label="Remarks (optional)">
  {control => <Textarea {...control} value={remarks} onChange={changeRemarks} rows={3} />}
</Field>

<Button type="submit" value="draft" variant="secondary">Save as Draft</Button>
<Button type="submit" value="submit" loading={saving}>Submit</Button>
```

`Button` defaults to `type="button"`. Set `type="submit"` explicitly, including the dashboard's Apply dates action. Keep native `name`, `value` and submitter handling: draft and submitted records have different existing validation rules. `loading` disables repeat activation and sets `aria-busy`, retaining the caller's label. Do not swap the business action or omit its native submit value.

`Field` uses an explicit ID or React `useId`, labels the control and associates helper/error text. Its render function supplies only `id` and ARIA attributes; it does **not** impose native `required`. The owning form decides validation. `Input`, `Select`, `Textarea` and `Button` forward native props and refs. `variant`, `loading`, `label` and `tone` are consumed by their components and never become DOM attributes.

`IconButton` requires a meaningful `label`. Decorative SVGs use `aria-hidden="true"`. For toggle/pressed state use native `aria-pressed`; the visual API does not invent toggle behavior. `StatusBadge` displays its children as text and accepts `neutral | info | success | warning | danger`; color is supplementary and never a new lifecycle status.

`PageHeader` accepts `title`, `description`, and wrapping `actions`; it renders an h1. Use it once for a page, keeping existing section headings below it. `Card` supports div or section, retaining landmark labels via native attributes. `ErrorState` announces a visible error with `role="alert"`; `EmptyState` exposes quiet feedback with `role="status"`. Pass real retry actions and current error messages from the owning feature rather than putting fetching or persistence into a presentational component.

## State matrix

| State | Buttons / icon actions | Fields | Feedback / containers |
| --- | --- | --- | --- |
| Default | Navy primary; bordered secondary; red destructive; quiet ghost | White surface, recognizable border, visible associated label | Quiet bordered cards; visible status text |
| Hover | Small background/border change; no movement | Darker boundary | Interactive KPI card boundary changes |
| Focus | Shared 2px outline with offset | Same outline; helper/error descriptions remain associated | `mg-focus` for native chart rows/segments; existing dialogs own containment |
| Pressed | Darker/brand background, native click/keyboard semantics | Native editing/select behavior | No scale/glow/glass treatment |
| Disabled | Native disabled; muted text/surface; not-allowed cursor | Native disabled | Feature supplies a reason where the user needs one |
| Loading | `loading` disables repeat submission, adds nondecorative-state `aria-busy` and decorative spinner | Feature retains values and determines editability | Existing query loading text remains a status |
| Error | Destructive style means an action, not a validation state | `aria-invalid` and associated visible Field error | ErrorState alert; dashboard retains its stale counts and last-successful timestamp |
| Success | Feature retains its action/result text | No automatic validation/rewrite | StatusBadge success includes the actual status wording |

Controls prefer 44×44 CSS px, stronger than WCAG 2.2 AA's 24px target criterion and its exceptions. Text, labels and help wrap; card padding grows from 16px to 24px on wider screens. Component transitions and the loading spinner stop under `prefers-reduced-motion: reduce`. No custom animation is required to understand state.

## Verification and rollout

```bash
npm run lint --workspace=client
npm run test:client
npm run build --workspace=client
npm run test:design-system --prefix e2e
npm run test:dashboard --prefix e2e
```

Focused `client/tests/designSystem*.test.ts` cover native props/submitters, no styling-prop leaks, palette contrast, labels/error links, combobox selection, draft vs submitted callbacks, dashboard date submission, KPI scope/navigation and quantitative chart widths. Existing Pagination tests retain algorithm/bounds/range checks. Browser tests exercise rendered target sizes, focus, reduced motion, responsive layouts, status text, modal pending/error/Escape behavior and attach visual screenshots. Mocked browser writes never prove real notification delivery or persisted record updates.

The pre-change dev build measured 3,240,471 bytes of JavaScript (947,731 bytes gzip) and 80,633 bytes of CSS (14,035 bytes gzip), across the complete client asset output. Compare the same aggregate files and gzip method after the migration; per-chunk naming changes alone are not a performance regression. No runtime performance claim follows solely from bundle size.

Before/after screenshots are captured at matching routes, fixtures and widths. See [UI-005 verification](UI-005-verification.md) for committed visual pairs in `docs/assets/ui005/`, comparable bundle measurements and browser outcomes. The Playwright report and CI artifacts contain additional state screenshots; review overflow, task visibility and state changes as well as appearance. Automated coverage does not replace a screen-reader pass or full accessibility audit.

## UI-001 integration

UI-001 [PR #215](https://github.com/MarcZxc1/Supply-Chain/pull/215) was merged into `dev` before UI-005 was rebased. Shared UI-005 primitives are combined with UI-001's accessible form, combobox, search, notification, attachment and dialog behaviors rather than replacing those files with the original design-system prototype.

After the rebase, the repository CI must run **both** `test:accessibility` and `test:design-system` Playwright suites, in addition to all role and dashboard tests. Manual NVDA/VoiceOver, real device/zoom and nondeveloper task verification remain necessary; visual screenshots in [UI-005 verification](UI-005-verification.md) are from the original standalone implementation, not recaptured integrated golden files.

Do not silently alter server permissions, record submission/draft distinctions, upload persistence or dashboard metrics when migrating visual components.
