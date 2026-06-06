# Data Lab — Product Specification

## Overview

A single `index.html` file that is a complete, self-contained data analysis and dashboard tool.
No server, no build step, no framework. Everything — HTML, CSS, JavaScript, and the bundled
Titanic dataset — lives in one file.

The app accepts both **flat CSVs** (one row = one observation) and **cube CSVs** (one row =
an aggregated group with a row-count weight). Every statistic, chart, and aggregation is
weight-aware, making both formats work identically through the UI.

---

## Libraries (CDN, no npm)

| Library | Version | Purpose |
|---|---|---|
| Plotly.js | 2.35.2 | All charts and visualizations |
| Papa Parse | 5.4.1 | CSV parsing |

No other libraries. No jQuery, no Alpine, no React.

---

## Data Model

### Flat CSV
Standard CSV. Each row is one observation. Internally treated as weight = 1 per row.

### Cube CSV
CSV where one row represents many original observations that share the same combination of
column values. Must contain a **weight column** (default name: `Number_of_rows`) that holds
the count of original rows for that group.

### Weight column detection
1. App checks for a column with the exact name configured in Settings (`Number_of_rows` by default).
2. If found, the dataset is **cube mode**: all stats are weighted.
3. User can override the detected column in Settings.
4. If not found, dataset is **flat mode**: weight = 1 for all rows.

### Column type inference
Run on load; used throughout for chart selection and stat display.

| Rule | Type assigned |
|---|---|
| All non-null values parse as finite numbers AND unique count > 10 | `numeric` |
| All non-null values parse as finite numbers AND unique count ≤ 10 | `categorical` |
| Any non-numeric non-null value exists | `categorical` |
| The weight column | `numeric` (always, regardless of unique count) |

### Weighted statistics
All statistics use the weight column when in cube mode. In flat mode weight = 1 (same formulas).

- **Weighted mean**: `sum(w * x) / sum(w)`
- **Weighted variance**: `sum(w * (x - mean)²) / sum(w)`
- **Weighted quantile**: sort by value, walk cumulative weight until reaching `q * total_weight`
- **Weighted value counts**: `sum(w)` per distinct categorical value
- **Weighted Pearson r**: `Cov(X,Y,w) / sqrt(Var(X,w) * Var(Y,w))`
- **Total rows displayed**: `sum(weight_column)` for cube, `row count` for flat

---

## Design System

### Principles
- Purposeful whitespace — generous padding, no cramming
- Restrained color — 2–3 accent colors; color = meaning, not decoration
- Sharp typography — system font stack, clear size scale, no decorative fonts
- Precise geometry — 3px border radius everywhere; not bubbly

### Font stack
```
-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif
Monospace: 'SF Mono', 'Cascadia Code', Consolas, monospace
```

### Spacing scale
4 / 8 / 12 / 16 / 20 / 24 / 32 / 48px

### Border radius
3px everywhere (inputs, cards, badges, buttons, charts)

### Themes — 4 options, stored in localStorage

#### Dark (default)
```
--bg:        #0f1117    page background
--surface:   #1a1d27    cards, sidebar
--surface-2: #242736    table headers, inputs, hover states
--border:    #2e3148    all borders and dividers
--text:      #e8eaf0    primary text
--text-2:    #8b90a7    secondary text, labels
--text-3:    #555b75    placeholders, disabled
--accent:    #4f7cff    interactive, numeric type color
--categorical: #a78bfa  categorical type color
--danger:    #ff5f5f
--success:   #3ecf8e
--warn:      #f5a623
```

#### Light
```
--bg:        #f4f4f6
--surface:   #ffffff
--surface-2: #ececf0
--border:    #d8d8e0
--text:      #111827
--text-2:    #6b7280
--text-3:    #9ca3af
--accent:    #2563eb
--categorical: #7c3aed
--danger:    #dc2626
--success:   #16a34a
--warn:      #d97706
```

#### Nord
```
--bg:        #2e3440
--surface:   #3b4252
--surface-2: #434c5e
--border:    #4c566a
--text:      #eceff4
--text-2:    #d8dee9
--text-3:    #a0a8bb
--accent:    #88c0d0
--categorical: #b48ead
--danger:    #bf616a
--success:   #a3be8c
--warn:      #ebcb8b
```

#### Solarized
```
--bg:        #002b36
--surface:   #073642
--surface-2: #0d4a59
--border:    #1a5f70
--text:      #eee8d5
--text-2:    #93a1a1
--text-3:    #657b83
--accent:    #2aa198
--categorical: #6c71c4
--danger:    #dc322f
--success:   #859900
--warn:      #b58900
```

### Chart theming
All Plotly charts read CSS custom properties at render time via `getComputedStyle`.
`paper_bgcolor` and `plot_bgcolor` are always `transparent`.
Grid lines use `--border`. Tick labels use `--text-2`. Bars/lines default to `--accent`.

---

## Application Architecture

### File layout (inside index.html)
```
<head>
  CDN script tags (Plotly, PapaParse)
  <style> — all CSS </style>
</head>
<body>
  <!-- HTML shell: sidebar + page containers -->
  <script>
    // 1. EMBEDDED DATA     — TITANIC_CSV constant
    // 2. STATE             — single global State object
    // 3. STORAGE           — localStorage read/write
    // 4. DATA ENGINE       — weighted stats, parsing, transforms
    // 5. CHARTS            — Plotly wrappers
    // 6. FORMATTER         — number/percent/cell display
    // 7. ICONS             — inline SVG strings
    // 8. PAGES             — one object per page with render()
    // 9. UI                — routing, nav, drag-drop, file input
    // 10. INIT             — DOMContentLoaded → UI.init()
  </script>
</body>
```

### Global State object
```javascript
State = {
  data: [],             // array of row objects (typed: number or string or null)
  columns: [],          // ColumnMeta[]  { name, type, nullCount, uniqueCount, isWeight }
  weightCol: null,      // string | null — active weight column name
  isCubed: false,
  fileName: '',
  totalRows: 0,         // sum(weights) or row count
  transforms: [],       // ordered list of applied TransformStep objects
  currentPage: 'overview',
  prevPage: null,
  columnDetail: null,   // column name currently in Column Detail view
  dashboards: {},       // { [name]: DashboardDef }
  settings: {
    theme: 'dark',
    weightColumnName: 'Number_of_rows',
    tableRows: 10,
    pairplotMode: 'sample',   // 'sample' | 'density'
    sampleSize: 5000,
    exportDelimiter: ',',
    exportPrefix: 'datalab',
  },
}
```

### Module responsibilities

| Module | Responsibility |
|---|---|
| `DataEngine` | Parse CSV, infer types, weighted stats, histogram bins, correlation matrix, sampling, transform execution |
| `Charts` | Plotly wrappers (histogram, bar, heatmap, scatter, mini variants). Reads theme from CSS vars at call time |
| `Pages.overview` | Dataset header, quality grid, sample table |
| `Pages.explore` | Distribution grid, correlation heatmap, scatter builder |
| `Pages.columnDetail` | Stats summary, distribution chart, cross-column correlations |
| `Pages.transform` | Pipeline builder UI |
| `Pages.dashboard` | Dashboard editor + export |
| `Pages.settings` | Theme cards, all preference inputs |
| `UI` | `navigate(page)`, drag-drop setup, file input, sidebar toggle, toast |
| `Storage` | `save()` / `load()` — persists `settings` and `dashboards` to localStorage |
| `Themes` | `apply(theme)` — sets `data-theme` attribute, triggers chart re-render |

---

## Navigation

**Left sidebar**, always visible.

```
[brand icon] Data Lab           [collapse chevron]

  [icon] Overview
  [icon] Explore
  [icon] Transform
  [icon] Dashboard

  ─── footer ───
  [icon] Settings
```

- Collapsed state: icons only (48px wide), labels hidden
- Active page: accent background chip on nav item
- Sidebar toggle: small circular button on right edge of sidebar
- Column Detail is not a nav item — it is navigated to programmatically from Overview or Explore

---

## Pages

### Overview

**Purpose:** Entry point. Understand the dataset at a glance and access row-level data.

**Sections (top to bottom):**

1. **Dataset header card**
   - File name (large, bold)
   - Subtitle: "Cube dataset — all statistics weighted" or "Flat dataset"
   - Metric row: Total rows (weighted sum) / Column count / Numeric count / Categorical count
   - CUBE or FLAT badge
   - Active weight column badge (cube mode only)
   - [Load CSV] button (top right)

2. **Type legend**
   - Colored dots: N numeric columns / M categorical columns / 1 weight column (cube only)

3. **Column quality grid**
   - One card per column
   - Shows: column name, type badge (NUM / CAT), quality bar (fill = % non-null), null % label, unique count
   - Quality bar color: green (< 5% null) → yellow (5–20%) → orange (20–50%) → red (> 50%)

4. **Sample data table**
   - N random rows (N = `settings.tableRows`, default 10)
   - [Resample] button to re-randomize
   - Each column header:
     - Clickable name → navigates to Column Detail
     - [×] button on hover → removes column from dataset (with confirm dialog)
   - Null cells: shown as `null` in muted italic
   - Numeric cells: monospace, accent color
   - [+ Column] button in header row → opens Create Column modal (Phase 2)

---

### Explore

**Purpose:** Visual analysis of distributions, relationships, and custom scatter plots.

**Sections:**

1. **Distributions grid**
   - One mini-chart per column (excluding weight column)
   - Numeric: weighted histogram (15 bins, accent color, 100px tall)
   - Categorical: weighted bar chart of top 10 values (categorical color, 100px tall)
   - Column name is a link → navigates to Column Detail

2. **Correlation heatmap** (only if ≥ 2 numeric columns)
   - Weighted Pearson r for all numeric column pairs
   - Color scale: red (−1) → transparent (0) → accent (1)
   - Label: "weighted Pearson r" (cube) or "Pearson r" (flat)

3. **Scatter chart builder**
   - X axis selector, Y axis selector (numeric columns only), Color by selector (any column, optional)
   - Toggle: [Sample] [Density] — per-chart render mode
     - Sample: `scattergl` mode, up to `settings.sampleSize` rows
     - Density: `histogram2d` heatmap (no sampling needed)
   - Chart: 320px tall, WebGL scatter or 2D density heatmap
   - Sample size label shown when in sample mode

---

### Column Detail

**Purpose:** Deep inspection of one column — navigated to from Overview or Explore.

**Entry points:**
- Click column name in Overview table header
- Click mini-chart title in Explore distribution grid

**Layout:**
- [← Back to Overview / Explore] button (remembers where navigation came from)
- Column name (large) + type badge + Weight badge (if weight column)

**For numeric columns:**
- Stats grid: Mean / Median / Std dev / Min / Max / Q25 / Q75 / Null % / Unique count
  - All weighted in cube mode
  - Null % colored by quality color scale
- Distribution chart: weighted histogram (220px tall)
- Cross-column correlation bar chart:
  - Horizontal bar per numeric column (excluding self)
  - Sorted by absolute correlation value (strongest first)
  - Color: accent for positive, danger for negative

**For categorical columns:**
- Stats grid: Unique count / Null % / Top value / Top value %
- Value counts chart: horizontal bar chart, top 20 values, weighted counts, categorical color
  - Chart height scales with number of values

---

### Transform

**Purpose:** Modify the dataset through an ordered pipeline of steps. The result of all steps
becomes the active dataset used by Overview, Explore, and Column Detail.

**Step types:**

| Step | Description |
|---|---|
| Filter rows | Keep only rows where column OP value (=, ≠, <, >, contains) |
| Rollup | Group by one or more columns; aggregate numeric columns (sum, mean, count, min, max) |
| Pivot | Reshape: select index columns, pivot column, value column → wide format |
| Unpivot | Melt wide → long: select id columns, remaining columns become rows |
| Calculated column | Add new column: expression using existing column names (`col_a + col_b`, `col_a / col_b`, etc.) |
| Rename column | Rename a column |
| Drop column | Remove a column |

**UI layout:**
- Left: Step palette (buttons for each step type)
- Right: Applied steps list — ordered cards, each with:
  - Step type label + summary of parameters
  - [Edit] button → reopens config modal
  - [×] remove button
  - Drag handle for reordering (Phase 2)
- Below steps: [Preview result] button → shows sample of resulting data in a table
- [Reset all] button to clear all steps

**Step config:** Each step type opens a modal with its specific controls (column pickers,
operator dropdowns, expression input, etc.).

---

### Dashboard

**Purpose:** Compose named dashboards from saved plots and dataset metrics, then export them
as standalone HTML files.

**Dashboard list view** (default):
- Shows all named dashboards saved in localStorage
- [+ New dashboard] button
- Each item: dashboard name, last modified date, [Edit] [Export] [Delete] buttons
- Import: drag an exported dashboard `.html` file onto the page to re-open it for editing

**Dashboard editor:**
- Activated when creating new or editing existing dashboard
- Name input at top
- Responsive grid canvas (12 columns)
- [+ Add block] side panel with block types:
  - **Plot** — pick any chart from a list of charts generated in the current Explore session
  - **KPI card** — label + computed aggregate (sum / mean / count of a column, optionally filtered)
  - **Data table** — a small filtered/grouped table (column picker + optional filters)
  - **Text / Markdown** — free-form text, supports basic markdown (bold, italic, headings, lists)
- Block controls: drag to reorder, resize (small / medium / large / full-width), [×] remove
- [Save] → persists to localStorage
- [Export HTML] → generates and downloads a fully standalone `.html` file with all chart
  specs and data embedded (no CDN dependency, works offline)

**Export format:**
The exported file is a self-contained HTML with:
- Plotly.js bundled inline (from the same CDN response, re-embedded as a `<script>` tag)
- All chart data embedded as JSON
- KPI values pre-computed and rendered as static HTML
- Table data embedded as JSON
- Markdown blocks rendered to HTML at export time
- Reads the active theme's color values at export time

---

### Settings

**Purpose:** Preferences that persist across sessions via localStorage.

**Sections:**

1. **Theme** — 4 theme cards (Dark / Light / Nord / Solarized)
   - Each card: small color preview, name, sub-label
   - Selected card highlighted with accent border

2. **Dataset**
   - Weight column name (text input, default `Number_of_rows`)
   - Note: "Re-load your CSV after changing this"

3. **Table display**
   - Sample rows shown (number input, 5–100)

4. **Chart defaults**
   - Scatter sample size (number input, 100–50,000)
   - Default pairplot mode (Sample / Density toggle)

5. **Export**
   - Filename prefix (text input)
   - CSV delimiter (select: comma / semicolon / tab)

All changes save immediately on blur / change.

---

## Bundled Data

### Titanic
- Embedded as a JS template literal constant `TITANIC_CSV`
- 891 rows, 15 columns
- Loaded automatically on app start
- Columns: survived, pclass, sex, age, sibsp, parch, fare, embarked, class, who, adult_male, deck, embark_town, alive, alone

### Second test dataset — Online Retail II (UCI)
- ~1M transactions, ~8 columns
- User loads via drag-and-drop (too large to embed, ~50MB raw CSV)
- Download URL documented in README

---

## Build Phases

### Phase 1 — Foundation (build first)
- [ ] CSS design system: all 4 themes, all component styles
- [ ] HTML shell: sidebar, page containers, drop overlay, file input
- [ ] `State`, `Storage`, `DataEngine.parseCSV`, `DataEngine.analyzeColumn`
- [ ] `UI.init`, `UI.navigate`, drag-drop, file input wiring
- [ ] Titanic CSV embedded and auto-loaded
- [ ] **Overview page**: full (header card, quality grid, sample table)
- [ ] **Settings page**: full (themes, all preferences)

### Phase 2 — Column analysis & Explore
- [ ] `DataEngine` weighted stats (mean, std, quantile, histogram, correlation)
- [ ] `Charts` module (histogram, bar, heatmap, scatter, mini variants)
- [ ] **Column Detail page**: full (stats + charts)
- [ ] **Explore page**: full (distribution grid, heatmap, scatter builder)

### Phase 3 — Transform
- [ ] Transform step data model and execution engine
- [ ] Filter, Rollup, Pivot, Unpivot, Calculated column step types
- [ ] **Transform page**: full UI (palette, steps list, preview)

### Phase 4 — Dashboard
- [ ] Dashboard data model + localStorage persistence
- [ ] Dashboard list view
- [ ] Dashboard editor (grid, block types, add/remove/resize)
- [ ] Export to standalone HTML
- [ ] Import exported HTML for re-editing

---

## Key Constraints & Decisions

| Decision | Rationale |
|---|---|
| Single `.html` file | No build toolchain, fully portable, drag-and-drop shareable |
| Vanilla JS only | No framework overhead; app logic is simple enough; avoids dependency drift |
| Plotly.js from CDN | Battle-tested, handles WebGL scatter for large datasets, good theming API |
| Papa Parse from CDN | Fastest browser CSV parser; handles edge cases (quoted fields, BOM, encoding) |
| No emojis anywhere | Design principle: precise tool aesthetic |
| 3px border radius | Data tool precision aesthetic; not bubbly |
| Weight-aware from the start | Cube and flat data share the same code paths; no special casing later |
| localStorage for settings/dashboards | Zero backend, works offline, persists naturally |
| Exported dashboards fully standalone | Offline-safe, freely shareable without server |
| Charts re-render on theme change | CSS vars are read at render time; switching theme re-runs chart renderers |
