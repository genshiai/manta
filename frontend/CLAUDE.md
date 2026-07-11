# Manta Frontend — Design Rules

This file is auto-loaded by Claude Code when working in `frontend/`. It combines:

1. **Manta-specific rules** (this section) — read first
2. **StyleSeed Design Engine** (below) — the upstream design system Manta adopted

---

## Manta-Specific Rules (READ FIRST)

### Project Context

Manta は外来クリニック向け EMR SaaS。**カルテ画面のオーケストレータは [`src/components/ChartWorkspace.tsx`](src/components/ChartWorkspace.tsx)**（データ取得・状態管理を集約）、描画は [`src/components/chart/`](src/components/chart/) 以下に分割済み。**モダン SaaS 水準（Apple HIG / Linear / Vercel / Stripe）を目指し、レガシー EMR の多色・高密度パターンは採用しない**（[`../docs/DESIGN_GUIDELINES.md`](../docs/DESIGN_GUIDELINES.md) のセクション 0「絶対原則」）。

> **カルテ UI は「読む・書く・作業する」ドキュメント型に転換済み。** 新規実装の正本は [`../docs/KARTE_UI_SPEC.md`](../docs/KARTE_UI_SPEC.md)（[ADR 0006](../docs/decisions/0006-karte-document-ui.md)）、ビジュアル正本は [`../docs/mock-html/karte-b.html`](../docs/mock-html/karte-b.html)。[`CHART-DESIGN.md`](CHART-DESIGN.md)（3ペイン+8タブ前提）は旧方針（Superseded）。

### Design System Status (2026-07-05 時点)

- **採用**: StyleSeed エンジン + **Apple HIG skin**（`--brand #0071e3` / theme.css が正本 / [ADR 0003](../docs/decisions/0003-color-system-apple-hig.md)）。旧「Notion skin」記述は陳腐化。
- **離脱**: デジタル庁デザインシステム参照（[ADR 0001](../docs/decisions/0001-design-system-digital-cho-and-pivot.md)）
- **方針転換は必ず ADR に記録**: `docs/decisions/template.md` をコピーして起票

### レガシートークン禁止（§2-6 ガードレール）

新規コードで以下を使わない（既存コードはファイル単位で別 PR 置換）:

- クラス: `solid-gray-*` / `text-mono-*` / `text-std-*` / `text-oln-*`（旧デジタル庁トークン）
- インポート: `@/vendor/dads` / `../lib/cn`（新規は `@/components/ui/utils` の `cn`）
- 臨床画面（カルテ・温度板）に `.dark` を伝播させない。ルートに `.clinical` を付与しライト固定（[KARTE_UI_SPEC §9.1](../docs/KARTE_UI_SPEC.md)）

### 既存トークンとのマイグレーション境界

旧トークン（[`../docs/design-system/tailwind-theme/`](../docs/design-system/tailwind-theme/) 由来）が既存コードに残っている:

```
text-std-18B-160      → 18px Bold lh160% （旧）
text-oln-14N-100      → 14px Normal lh100% （旧）
text-oln-16B-100      → 16px Bold lh100% （旧）
```

**新規コード**: StyleSeed Notion skin の token を使う（`text-[18px] font-bold leading-snug` 等、`CLAUDE.md` 下部の "Font Size by Context" 表を参照）。
**既存コード**: ファイル単位で別 PR で置換。1 PR で全置換しない。

### `cn()` の置き場

- **新規**: `src/components/ui/utils.ts` の `cn` を使う（StyleSeed 標準）。インポート: `import { cn } from "@/components/ui/utils"`（または相対）
- **旧**: `src/lib/cn.ts` も当面残るが、新規コードでは使わない。段階廃止予定

### 必読 ADR / ドキュメント

- [`../docs/KARTE_UI_SPEC.md`](../docs/KARTE_UI_SPEC.md) — **カルテ UI 実装の正本**（読む・書く・作業する / 寸法・トークン・API・フェーズ・受け入れ基準）
- [ADR 0006](../docs/decisions/0006-karte-document-ui.md) — カルテのドキュメント型転換（決定と経緯）
- [`../docs/DESIGN_GUIDELINES.md`](../docs/DESIGN_GUIDELINES.md) セクション 0「絶対原則」 — モダン SaaS 志向 / 多色禁止 / プライマリ 1 色等
- [`../docs/decisions/`](../docs/decisions/) — 主要意思決定の経緯（ADR）
- [`DESIGN-LANGUAGE.md`](DESIGN-LANGUAGE.md) — StyleSeed の 69 視覚設計ルール（新規 UI 着手前に Table of Contents → rules 14, 18, 19, 61-63 を読む）

### Manta UX 原則（カルテ・EMR 固有）

これらは StyleSeed の Golden Rules と矛盾しない範囲で優先する:

1. **時系列データはスクロール、クリック式タブで隠さない**（過去カルテ・受診履歴・検査トレンド等）
2. **過去カルテの主情報は記述本文 + サマリ/病名のみ。薬剤・検査・PMDA はデフォルト折り畳み**（副情報）
3. **3 クリック以内で主要操作に到達**（候補選択と遷移を分けない。頻度の低い行為を初期タブにしない。候補クリック = 選択 + 遷移を同時に行う）
4. **左ペイン = WHO（不変情報）／中央 = WHAT（記録）／右 = DO（次の行動）** の責務分離（カルテ指針確定後 [`CHART-DESIGN.md`] に明文化予定）
5. **方針文書に矛盾・両論併記を残さない**（迷ったらどちらに寄せるか提案する）

### このリポジトリでの作業時の注意

- 新規 UI 作成は `/ss-page` `/ss-component` `/ss-pattern` を活用
- UI コードのレビューは `/ss-review <path>` `/ss-lint <path>` `/ss-audit <path>` を使う
- カルテ機能は中央スクロール式 + 折り畳み副情報の方針が確定するまで、**過去カルテ画面の構造変更は議論してから着手**

---

# StyleSeed — Design Engine

A brand-agnostic design engine that makes AI produce professional-quality UI.
The engine provides layout rules, components, and skills. The skin provides colors and fonts.

## Golden Rules (NEVER break these)

```
 1. All content inside cards — NEVER on bare page background
 2. Single accent color (--brand) — everything else grayscale
 3. No pure black (#000) — darkest text is defined by skin (~#2A2A2A)
 4. Numbers 2:1 with units — 48px number + 24px unit, always
 5. space-y-6 between sections · mx-6 for single cards · px-6 for grids
 6. Never repeat same section type consecutively — create visual rhythm
 7. Card shadows ≤ 8% opacity — if visible, it's too strong
 8. Touch targets ≥ 44×44px — no tiny tap areas
 9. Semantic tokens only (text-brand, bg-card) — NEVER hardcode hex in components
10. Font sizes from the "Font Size by Context" table ONLY — don't guess
11. After generating ANY page → run /ss-review to verify compliance
```

Reference this guide when Claude Code sets up a new project or implements UI.

> **When to read which file:**
> - **This file (CLAUDE.md)**: Tokens, component API, imports, forbidden patterns — reference while coding
> - **DESIGN-LANGUAGE.md**: Visual design rules, page layout, composition recipes — read **before** building a new page. Start with the Table of Contents, then rules 14, 18, 19, 61-63.

## Quick Start — New Project Setup

1. Copy `engine/` files into your project:
   - `scaffold/` → project root
   - `css/` → `src/styles/`
   - `components/` → `src/components/`
2. Pick a skin from `skins/` (toss, stripe, linear, vercel, notion, or 58+ via awesome-design-md)
3. Copy the skin's `theme.css` → `src/styles/theme.css`
4. `npm install` (or pnpm install)
5. Or just run `/ss-setup` and it does all of this interactively

## Token Customization

### Colors
Modify in `:root` of `src/styles/theme.css`:

| Variable | Purpose | Default |
|----------|---------|---------|
| `--brand` | Brand accent color | Defined by skin (e.g. `#721FE5` for toss) |
| `--primary` | Buttons, links, primary UI | `#030213` |
| `--destructive` | Error/danger | `#d4183d` |
| `--success` | Success indicator | `#6B9B7A` |
| `--warning` | Warning | `#D97706` |
| `--info` | Information | `#3B82F6` |

Other semantic tokens (`--background`, `--foreground`, `--muted`, etc.) typically don't need changes.

### Typography
- Default font: Inter (Latin) + Pretendard (option for Korean/CJK projects)
- To change: modify the `css/fonts.css` import + update font-family in `css/base.css`
- Default size: 16px (`--font-size`)

#### Font Size Scale (14 steps)
| Token | Size | Usage |
|-------|------|-------|
| `2xs` | 10px | Micro text, units |
| `xs` | 11px | Small labels, status text |
| `sm` | 12px | Captions, badges, secondary labels |
| `caption` | 13px | Subtitles, dates, trend values |
| `base` | 14px | Body default, list titles |
| `body` | 15px | In-card body text |
| `md` | 16px | Inputs, buttons |
| `subhead` | 17px | Amounts, emphasized text |
| `lg` | 18px | Section titles, card headers |
| `xl` | 20px | h2 |
| `2xl` | 24px | h1 |
| `3xl` | 30px | Large headings |
| `4xl` | 36px | KPI metrics |
| `5xl` | 48px | Hero numbers |

#### Line Height Rules (by size)
| Text Size | Line Height | Tailwind | Reason |
|-----------|-------------|----------|--------|
| 36-48px (display) | 1.0 | `leading-none` | Large numbers stay tight |
| 18-24px (heading) | 1.35 | `leading-snug` | Headings slightly tighter |
| 14-17px (body) | 1.5 | `leading-normal` | Readability |
| 10-13px (caption) | 1.5~1.65 | `leading-normal`~`leading-relaxed` | Small text needs more space |

#### Letter Spacing Rules (by size)
| Text Size | Tracking | Value | Reason |
|-----------|---------|-------|--------|
| 36-48px (display) | tighter | `-0.02em` | Large text needs tighter tracking |
| 18-24px (heading) | tight | `-0.01em` | Headings slightly tighter |
| 14-17px (body) | normal | `0em` | Default |
| 10-13px uppercase | wide | `0.05em` | Uppercase labels need wider tracking |

#### Font Weights
- **400 (normal)**: Body text, descriptions
- **500 (medium)**: Labels, buttons, default headings
- **600 (semibold)**: Nav labels, emphasized captions
- **700 (bold)**: Metric values, list titles, section headers

#### Font Size by Context (USE THIS — don't guess sizes)

| Context | Number | Unit | Label | Tailwind Example |
|---------|--------|------|-------|-----------------|
| **Hero card** | `text-[48px]` | `text-[24px]` | `text-[12px] uppercase` | `<p class="text-[48px] font-bold">3.8<span class="text-[24px]">M</span></p>` |
| **KPI card** | `text-[36px]` | `text-[18px]` | `text-[12px] uppercase` | `<p class="text-[36px] font-bold">$48.2<span class="text-[18px]">K</span></p>` |
| **Section title** | — | — | `text-[18px] font-bold` | `<h3 class="text-[18px] font-bold">Recent Activity</h3>` |
| **List item name** | — | — | `text-[14px] font-bold` | `<p class="text-[14px] font-bold">Acme Corp</p>` |
| **List item amount** | `text-[17px]` | `text-[11px]` | — | `<span class="text-[17px] font-bold">$8,400</span>` |
| **Chart stat footer** | `text-[18px]` | `text-[10px]` | `text-[11px] uppercase` | — |
| **Trend %** | `text-[13px]` | — | — | `<span class="text-[13px] text-success font-bold">+8.2%</span>` |
| **Subtitle/date** | — | — | `text-[13px] text-text-tertiary` | `<p class="text-[13px] text-text-tertiary">April 7, 2026</p>` |
| **Status dot text** | — | — | `text-[11px] font-bold` | `<span class="text-[11px] font-bold" style="color: #22C55E">Completed</span>` |
| **Badge label** | — | — | `text-[12px] uppercase tracking-wide` | `<span class="text-[12px] font-bold uppercase tracking-[0.05em]">ALERT</span>` |

**Rule: NEVER pick a font size that's not in this table.** If unsure, use the closest context match.

#### IMPORTANT: Font Size Anti-Pattern

```
✗ NEVER create CSS variables for font sizes (e.g., --text-sm, --fs-body)
  → Tailwind v4 uses --text-* namespace internally. Custom --text-* variables
    WILL conflict and break line-height, letter-spacing, and icon sizing.

✗ NEVER use text-[var(--anything)] for font sizes
  → Tailwind v4 interprets text-[var(--x)] as COLOR, not font-size!
  → Result: `color: 13px` (invalid) instead of `font-size: 13px`
  → Even text-[length:var(--x)] is fragile — requires 860+ replacements if wrong

✗ NEVER change --font-size in theme.css
  → All rem-based spacing (h-14, px-6, gap-3) depends on root font-size
  → Changing it breaks icon sizes, nav text, button padding — everything

✓ ALWAYS use explicit px values: text-[36px], text-[18px], text-[13px]
  → This is intentional, not a hack. The "Font Size by Context" table above
    IS the token system. Look up the context, use the exact class.
  → Explicit px values are predictable, don't conflict, and never break.
```

### Spacing
- Uses Tailwind default utilities
- 6px multiples recommended: `p-1.5`(6px), `p-3`(12px), `p-6`(24px)
- Page horizontal padding: `px-6` (24px)
- Between sections: `space-y-6` (24px)

### Border Radius
- Default: `--radius: 0.625rem` (10px)
- Cards: `rounded-2xl` (16px)
- Inputs/buttons: `rounded-md` (based on --radius)

### Shadows
- `--shadow-card`: Card default (`0 1px 3px rgba(0,0,0,0.04)`)
- `--shadow-card-hover`: Hover (`0 2px 4px rgba(0,0,0,0.08)`)
- `--shadow-elevated`: Floating (`0 4px 12px rgba(0,0,0,0.08)`)
- `--shadow-modal`: Modal (`0 8px 24px rgba(0,0,0,0.12)`)

## Critical Layout Rule: mx-6 vs px-6

> **This is the most common mistake. Get this right.**

| Wrapping | Use For | Effect |
|----------|---------|--------|
| `mx-6` | Single card (SectionCard, HeroCard) | Card **floats** with side margins |
| `px-6` | Multi-card grid or carousel | Content **fills** edge to edge |

```
✓ SectionCard already has mx-6 built in — do NOT add another mx-6 wrapper
✓ HeroCard already has mx-6 built in — do NOT add another mx-6 wrapper
✓ KPI grid needs px-6 on the grid container: <div className="grid grid-cols-2 gap-4 px-6">
✓ Carousel needs px-6 on the scroll container
✗ Never use px-4, mx-4, px-8, mx-8 — only px-6 and mx-6
```

## Component Usage Rules

### Import Pattern
```tsx
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/utils"
```

### Component Conventions
- Use `data-slot="component-name"` attribute on all components
- Always use `cn()` for className composition (no template literals)
- Use CVA (`class-variance-authority`) for variant management
- Use `React.ComponentProps<>` for props typing
- Support `className` prop on all visual components
- Use `asChild` + Radix `Slot` for composition

### New Component Template
```tsx
import * as React from "react"
import { cn } from "./utils"

function MyComponent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="my-component"
      className={cn("base-classes-here", className)}
      {...props}
    />
  )
}

export { MyComponent }
```

### Adding Tier 2 Components
For components not included in the seed, check shadcn/ui registry for additional components:
(calendar, carousel, chart, command, context-menu, drawer, hover-card, input-otp, menubar, navigation-menu, pagination, resizable, sidebar, slider, sonner, breadcrumb, collapsible, alert-dialog, aspect-ratio)

## Color Usage Cheatsheet

### Text Hierarchy
| Usage | Tailwind Class | Note |
|-------|---------------|------|
| Metrics/titles | `text-text-primary` | Defined by skin |
| Labels/captions | `text-text-secondary` | Defined by skin |
| Subtitles/axis labels | `text-text-tertiary` | Defined by skin |
| Inactive/disabled | `text-text-disabled` | Defined by skin |
| Default icons | `text-icon-default` | Defined by skin |

### Backgrounds/Surfaces
| Usage | Tailwind Class | Note |
|-------|---------------|------|
| Page background | `bg-surface-page` | Defined by skin |
| List items | `bg-surface-subtle` | Defined by skin |
| Progress bars/borders | `bg-surface-muted` | Defined by skin |
| Brand tint (selected row) | `bg-brand-tint` | Defined by skin |
| Card background | `bg-card` | Defined by skin |
| Pure background | `bg-background` | Defined by skin |

### UI Colors
| Usage | Tailwind Class | Note |
|-------|---------------|------|
| Brand accent | `text-brand` / `bg-brand` | Defined by skin |
| Primary button | `bg-primary` | Defined by skin |
| Success/up | `text-success` | Defined by skin |
| Error/danger | `text-destructive` | Defined by skin |
| Warning | `text-warning` | Defined by skin |
| Info | `text-info` | Defined by skin |
| Alert badge | `bg-alert-badge` | Defined by skin |
| Border | `border-border` | Defined by skin |

## Pattern Components

### `<StatCard>` — Stats Card
```tsx
import { StatCard } from "@/components/patterns/stat-card"
import { CreditCard } from "lucide-react"

<StatCard
  icon={CreditCard}
  label="Today's Revenue"
  value="48.2"
  unit="K"
  trend={{ value: "+8.2%", direction: "up" }}
/>
```

### `<PageShell>` + `<PageContent>` — Mobile Page Wrapper
```tsx
import { PageShell, PageContent } from "@/components/patterns/page-shell"

<PageShell maxWidth="430px">
  <TopBar />
  <PageContent>
    {/* sections */}
  </PageContent>
  <BottomNav />
</PageShell>
```

### `<TopBar>` + `<TopBarAction>` — App Header
```tsx
import { TopBar, TopBarAction } from "@/components/patterns/top-bar"
import { Bell } from "lucide-react"

<TopBar
  logo={<Logo />}
  subtitle="March 30, 2026"
  actions={
    <TopBarAction badge>
      <Bell className="size-[18px] text-icon-default" />
    </TopBarAction>
  }
/>
```

### `<BottomNav>` — Bottom Navigation
```tsx
import { BottomNav } from "@/components/patterns/bottom-nav"
import { Home, Package, TrendingUp, Settings } from "lucide-react"

<BottomNav
  items={[
    { name: "Home", icon: Home },
    { name: "Orders", icon: Package },
    { name: "Analytics", icon: TrendingUp },
    { name: "Settings", icon: Settings },
  ]}
  activeIndex={0}
/>
```

### `<EmptyState>` — Empty State
```tsx
import { EmptyState } from "@/components/patterns/empty-state"
import { Package } from "lucide-react"
import { Button } from "@/components/ui/button"

<EmptyState
  icon={Package}
  title="No orders yet"
  description="Add a new order to get started"
  action={<Button>Add Order</Button>}
/>
```

### `<ListItem>` — List Item
```tsx
import { ListItem } from "@/components/patterns/list-item"

<ListItem
  title="Acme Corp, Downtown"
  status={{ label: "Completed", color: "#22C55E" }}
  trailing={<span className="font-bold">$8.4K</span>}
/>
```

### `<HeroCard>` — Hero Metric Card
```tsx
import { HeroCard } from "@/components/patterns/hero-card"
import { Wallet } from "lucide-react"

<HeroCard
  icon={Wallet}
  label="Total Revenue This Month"
  value="3.8"
  unit="M"
  trend={{ value: "+12.4%", direction: "up", label: "vs last month" }}
  watermarkIcon={Wallet}
/>
```

### `<SectionCard>` — Section Card Wrapper
```tsx
import { SectionCard } from "@/components/patterns/section-card"

<SectionCard title="Recent Activity">
  {/* inner content */}
</SectionCard>
```

### `<BriefingCarousel>` — Alert Card Carousel
```tsx
import { BriefingCarousel } from "@/components/patterns/briefing-carousel"
import { AlertCircle } from "lucide-react"

<BriefingCarousel
  title="Today's Briefing"
  items={[
    { icon: AlertCircle, badge: "Urgent", badgeColor: "#C85A54",
      title: "Storage capacity warning", description: "18.2 GB remaining" },
  ]}
/>
```

### `<ChartCard>` — Chart Card (Period Toggle + Bottom Stats)
```tsx
import { ChartCard } from "@/components/patterns/chart-card"

<ChartCard
  title="Revenue Trend"
  periods={["1W", "1M", "3M"]}
  activePeriod="1W"
  onPeriodChange={setPeriod}
  stats={[
    { label: "Web", value: "1,648", unit: "/unit" },
    { label: "Mobile", value: "1,520", unit: "/unit" },
  ]}
>
  {/* Recharts or other chart component */}
</ChartCard>
```

### `<DonutChartCard>` — Donut Chart Card
```tsx
import { DonutChartCard } from "@/components/patterns/donut-chart-card"

<DonutChartCard
  title="Usage Breakdown"
  centerValue={66}
  centerUnit="%"
  centerLabel="Average"
  items={[{ name: "Web", value: 80, stock: 32.0, unit: "GB" }]}
  chartElement={/* PieChart */}
  bottomStats={[{ label: "Web", value: 8, subLabel: "days" }]}
/>
```

### `<RankedList>` — Ranked List
```tsx
import { RankedList } from "@/components/patterns/ranked-list"

<RankedList
  title="Competitor Pricing"
  items={[
    { rank: 1, name: "Acme Corp", value: "$1,520" },
    { rank: 2, name: "My Store", value: "$1,528", isHighlighted: true, badge: "My Store" },
  ]}
  footer="Last 30 days · All regions"
/>
```

## Tech Stack

- React 18 + TypeScript
- Vite 6 + @tailwindcss/vite
- Tailwind CSS v4 (CSS-first, no tailwind.config.js)
- Radix UI-based components
- class-variance-authority + clsx + tailwind-merge
- Lucide React icons
- Optional additions: Recharts, Motion (Framer Motion), react-hook-form

## File Structure

```
src/
  styles/
    fonts.css          # Font imports
    theme.css          # CSS custom properties + @theme inline
    base.css           # Base element styles
    index.css          # Entry point
  components/
    ui/                # Primitive components (shadcn-style)
    patterns/          # Composed pattern components
  app/
    App.tsx            # Main app component
  main.tsx             # React entry point
```

## Dark Mode

Uses `.dark` class strategy:
```css
@custom-variant dark (&:is(.dark *));
```
All semantic tokens have dark mode values defined in theme.css.

## Motion / Animation

Uses motion tokens defined as CSS variables:
- `--duration-fast` (100ms): Hover, color changes
- `--duration-normal` (200ms): Enter animations, expand
- `--duration-slow` (350ms): Page transitions, spring effects
- `--ease-default`: Default easing
- `--ease-spring`: Elastic micro-interactions

```tsx
// Example: using tokens in transitions
className="transition-all duration-[var(--duration-normal)] ease-[var(--ease-default)]"

// For simple cases, Tailwind shorthand also works
className="transition-colors"  // Uses Tailwind defaults
```

All animations auto-disable when `prefers-reduced-motion: reduce` is set (`base.css`).

## Accessibility (a11y) Rules

### Required
- **Touch targets**: Interactive elements minimum 44x44px (`min-h-11 min-w-11` or `.touch-target`)
- **Focus rings**: All interactive elements need `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- **Don't convey info by color alone**: Pair with icons or text
- **Image alt text**: All `<img>` must have `alt` attribute
- **Screen reader**: Use `sr-only` class for visually hidden content

### Color Contrast (WCAG AA)
Exact contrast ratios depend on your skin's color values. Verify your skin meets these minimums:

| Token | Minimum Contrast | Usage |
|-------|-----------------|-------|
| `--foreground` | 7:1+ | Body text |
| `--muted-foreground` | 4.5:1+ | Secondary text |
| `--brand` | 4.5:1+ | Accent (verify with your brand color) |
| `--destructive` | 4.5:1+ | Error |
| `--warning` | 4.5:1+ | Warning text |
| `--success` | 3:1+ | Large text/icons only |

### Safe Area
For notch/Dynamic Island support on mobile:
- Use `pb-safe`, `pt-safe`, `px-safe` classes (base.css)
- `viewport-fit=cover` is already set in `index.html`

## Prohibited Practices

- Do not use inline hex for colors that have semantic tokens
- Do not create wrapper components that only add className (use `cn()` at the call site)
- Do not use `@mui/material` (use Radix UI instead)
- Avoid px values in Tailwind for **spacing** (`p-6` OK, `p-[24px]` not OK)
- **Font sizes: USE `text-[Npx]` directly** — do NOT create CSS variables for font sizes (`--text-sm`, `--fs-body` etc.) — they conflict with Tailwind v4's `--text-*` namespace and break line-height, icon sizing, and spacing
- Do not omit `data-slot` attribute on new components
- Use `size-4` instead of `w-4 h-4` (Tailwind v4 shorthand)
- Use `ms-*` instead of `ml-*` (logical properties, RTL support)
- Do not change `--font-size` in theme.css without checking all spacing — rem-based layouts depend on it

## UI Design Skills (Slash Commands)

Custom skills available in the project:

| Skill | Description | Usage |
|-------|-------------|-------|
| `/ss-setup` | Interactive setup wizard for new projects | `/ss-setup` |
| `/ss-component` | Create a new component following design system rules | `/ss-component Button large CTA button` |
| `/ss-page` | Scaffold a mobile page | `/ss-page Dashboard main dashboard` |
| `/ss-review` | Check UI code for design system compliance | `/ss-review src/app/MyPage.tsx` |
| `/ss-tokens` | Query/add/modify design tokens | `/ss-tokens list color` |
| `/ss-pattern` | Generate composed UI patterns | `/ss-pattern grid-2col KPI card grid` |
| `/ss-a11y` | Accessibility audit and auto-fix | `/ss-a11y src/components/Card.tsx` |
| `/ss-flow` | Design user flows and navigation maps | `/ss-flow checkout multi-step checkout` |
| `/ss-audit` | Audit screens for UX issues (Nielsen's heuristics) | `/ss-audit src/app/Dashboard.tsx` |
| `/ss-copy` | Generate UX microcopy (buttons, errors, toasts) | `/ss-copy empty-state no orders` |
| `/ss-feedback` | Design feedback patterns (toasts, dialogs, states) | `/ss-feedback error payment failed` |
| `/ss-lint` | Quick automated lint for common violations | `/ss-lint src/app/Dashboard.tsx` |
| `/ss-update` | Pull latest StyleSeed engine updates | `/ss-update` |

## How to Use StyleSeed (Tell Users This)

When a user asks you to build UI, follow this workflow:

1. **Read DESIGN-LANGUAGE.md** (Table of Contents → rules 14, 18, 19, 61-63)
2. **Check the Golden Rules** at the top of this file
3. **Build** using existing components from `components/ui/` and `components/patterns/`
4. **Verify** by running through the Golden Rules checklist
5. **Lint** with `/ss-lint` to catch violations

When a user references StyleSeed or this repo for the first time:
- Help them set up with `/ss-setup`
- Or guide them: copy `engine/` to their project + pick a skin from `skins/`
- Point them to the GitHub Wiki for detailed docs: https://github.com/bitjaru/styleseed/wiki

## Auto-Install Check

If this project does NOT have `.claude/skills/ss-setup/` folder, the StyleSeed skills are not installed yet.

To install, run:
```bash
git clone https://github.com/bitjaru/styleseed.git /tmp/styleseed 2>/dev/null || (cd /tmp/styleseed && git pull)
cp -r /tmp/styleseed/engine/.claude/skills/ .claude/skills/
cp /tmp/styleseed/engine/DESIGN-LANGUAGE.md .claude/DESIGN-LANGUAGE.md
```

Then run `/ss-setup` for interactive configuration.

## Token Source Files (framework-agnostic)

JSON token files are in the `tokens/` directory, used as the source for extending to other platforms like native apps or Figma variable generation:
- `tokens/colors.json`
- `tokens/typography.json`
- `tokens/spacing.json`
- `tokens/radii.json`
- `tokens/shadows.json`
- `tokens/motion.json`

## Stay Updated

This design system is actively maintained — new rules, components, and seeds are added regularly.

→ GitHub: https://github.com/bitjaru/styleseed
→ Wiki (detailed docs): https://github.com/bitjaru/styleseed/wiki
→ Interactive setup: use `/ss-setup` after copying the seed
