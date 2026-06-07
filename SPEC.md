# Data Lab — Product Specification

## Overview

A single `index.html` file that is a complete, self-contained data analysis and dashboard tool.
No server, no build step, no framework. Everything — HTML, CSS, JavaScript, and the bundled
Titanic dataset — lives in one file.

The app accepts both **flat CSVs** (one row = one observation) and **cube CSVs** (one row =
an aggregated group with a row-count weight). Every statistic, chart, aggregation, and model
is weight-aware, making both formats work identically through the UI.

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
2. If found, the dataset is **cube mode**: all stats and models are weighted.
3. User can override the detected column in Settings.
4. If not found, dataset is **flat mode**: weight = 1 for all rows.

### Column type inference
Run on load; used throughout for chart selection, stat display, and model variable handling.

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
- No emojis anywhere

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
    // 4. DATA ENGINE       — weighted stats, parsing, transforms, exportCSV
    // 5. MODELS ENGINE     — binning, WoE, LR, scoring, evaluation
    // 6. CHARTS            — Plotly wrappers
    // 7. FORMATTER         — number/percent/cell display
    // 8. ICONS             — inline SVG strings
    // 9. PAGES             — one object per page with render()
    // 10. UI               — routing, nav, drag-drop, file input
    // 11. INIT             — DOMContentLoaded → UI.init()
  </script>
</body>
```

### Global State object
```javascript
State = {
  data: [],             // array of row objects (typed: number or string or null)
  rawData: [],          // immutable copy of parsed data before transforms
  _rawColumns: [],      // immutable column metadata before transforms
  columns: [],          // ColumnMeta[]  { name, type, nullCount, uniqueCount, isWeight }
  weightCol: null,      // string | null — active weight column name
  isCubed: false,
  fileName: '',
  totalRows: 0,         // sum(weights) or row count
  transforms: [],       // ordered list of TransformStep objects
  _stepCounts: [],      // parallel to transforms — { before, after } or null (if disabled)
  models: [],           // ephemeral ModelInstance[] — cleared on page refresh
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

### ModelInstance object
```javascript
{
  id: string,           // Date.now().toString(36)
  name: string,         // auto-generated, user-editable (e.g. "scorecard_001")
  type: 'scorecard',    // model family
  target: string,       // target column name
  targetType: 'binary', // 'binary' | 'categorical' | 'continuous'
  params: {},           // hyperparameters used
  result: null,         // output of ModelsEngine.fit() — null until trained
  splitCol: string|null,// name of _split column used (null = full data)
  createdAt: number,    // timestamp
}
```

### Module responsibilities

| Module | Responsibility |
|---|---|
| `DataEngine` | Parse CSV, infer types, weighted stats, histogram bins, correlation matrix, sampling, transform execution, exportCSV |
| `ModelsEngine` | Optimal binning (DP), WoE computation, logistic regression (gradient descent), scorecard points scaling, model evaluation (Gini, AUC, KS), grid search |
| `Charts` | Plotly wrappers (histogram, bar, heatmap, scatter, ROC curve, score distribution, IV bar chart). Reads theme from CSS vars at call time |
| `Pages.overview` | Dataset header, quality grid, sample table with sortable columns |
| `Pages.explore` | Distribution grid, correlation heatmap, scatter builder, pairplot, breakdown charts |
| `Pages.columnDetail` | Stats summary, distribution chart, cross-column correlations |
| `Pages.transform` | Pipeline builder UI — step palette, step cards with enable/disable/reorder, preview table, Download CSV |
| `Pages.models` | Model workbench — prerequisite panel, model tabs, setup/variables/parameters sections, output panels, write-back UI, model compare |
| `Pages.dashboard` | Dashboard editor + export |
| `Pages.settings` | Theme cards, all preference inputs |
| `UI` | `navigate(page, prevOverride)`, drag-drop setup, file input, sidebar toggle, toast |
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
  [icon] Models
  [icon] Dashboard

  ─── footer ───
  [icon] Settings
```

- Collapsed state: icons only (48px wide), labels hidden
- Active page: accent background chip on nav item
- Sidebar toggle: small circular button on right edge of sidebar
- Column Detail is not a nav item — navigated to programmatically from Overview or Explore
- Models sits between Transform and Dashboard (logical pipeline order)

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
   - [Resample] button to re-randomize; click clears any active column sort
   - Column headers clickable to sort asc/desc; sort state shown in subtitle; [Clear sort] button
   - Each column name is a link → navigates to Column Detail
   - Null cells: shown as `null` in muted italic
   - Numeric cells: monospace, accent color

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
   - Categorical color columns use discrete palette (`_catPalette`)
   - Toggle: [Sample] [Density] — per-chart render mode
   - Chart: 320px tall, WebGL scatter or 2D density heatmap

4. **Pairplot** (splom — all numeric columns)
   - Color by selector (categorical columns, optional)
   - Mode: sample (up to sampleSize rows) or density

5. **Breakdown** (box / violin / histogram by group)
   - Numeric column selector, Group by selector (categorical), chart type toggle

---

### Column Detail

**Purpose:** Deep inspection of one column — navigated to from Overview or Explore.

**Entry points:**
- Click column name in Overview table header
- Click mini-chart title in Explore distribution grid

**Layout:**
- [← Back to Overview / Explore] button (remembers navigation source via `prevPage`)
- Column name (large) + type badge + Weight badge (if weight column)

**For numeric columns:**
- Stats grid: Mean / Median / Std dev / Min / Max / Q25 / Q75 / Null % / Unique count
- Distribution chart: weighted histogram (220px tall)
- Cross-column correlation bar chart: horizontal bars, sorted by abs(r), accent/danger colors

**For categorical columns:**
- Stats grid: Unique count / Null % / Top value / Top value %
- Value counts chart: horizontal bar chart, top 20 values, weighted counts

---

### Transform

**Purpose:** Modify the dataset through an ordered pipeline of steps. Result becomes the
active dataset used by all other pages including Models.

**Step types:**

| Step | Description |
|---|---|
| Filter rows | Keep only rows where column OP value (=, ≠, <, >, contains) |
| Rollup | Group by one or more columns; aggregate numeric columns (sum, mean, count, min, max) |
| Pivot | Reshape: select index columns, pivot column, value column → wide format |
| Unpivot | Melt wide → long: select id columns, remaining columns become rows |
| Calculated column | Add new column: expression using existing column names |
| Rename column | Rename a column |
| Drop column | Remove a column |
| Null handling | Impute or flag missing values in one or more columns (see below) |
| Model split | Add a `_split` column partitioning rows into train/validation/test (see below) |
| Apply model | Embed a trained model's scoring table and apply it to produce output columns (see below) |

**Step cards — controls per step:**
- Step number badge, type badge, summary text, row count delta (e.g. `891 → 342`, red when rows drop)
- ↑ / ↓ reorder buttons, Enable/Disable toggle, Edit button, Remove button
- Disabled steps are visually dimmed and skipped in pipeline execution

**Banner (when steps active):**
- Step count label, [Download CSV] button (exports current derived dataset), [Reset all] button

**Below steps:** Preview table (first 10 rows of derived dataset, column headers, scrollable)

---

#### Null handling step

**Config modal:** Shows only columns with ≥ 1 null value.
Each column row displays: name | null count | null % | strategy dropdown | value input (constant only).
User configures only the columns they care about — unconfigured columns are left unchanged.

**Strategies per column:**

| Strategy | Applicable to | Description |
|---|---|---|
| Mean | Numeric | Replace nulls with weighted mean |
| Median | Numeric | Replace nulls with weighted median |
| Mode | Any | Replace nulls with most frequent value (weighted) |
| Constant | Any | Replace nulls with a user-supplied value |
| Drop rows | Any | Remove rows where this column is null |
| Add indicator | Any | Add `{col}_is_null` boolean column; original column unchanged |
| Forward fill | Any | Propagate last non-null value forward (time-ordered data) |
| Backward fill | Any | Propagate next non-null value backward |

**Note:** Independent of the scorecard model's null bin. If a column is both imputed here
and scored through the scorecard, the scorecard will not see nulls for that column. A warning
is shown in the Models prerequisite panel if this overlap is detected.

---

#### Model split step

**Purpose:** Partition the dataset into named splits for model training and evaluation.

**Config modal:**

| Strategy | Description |
|---|---|
| Random | Uniform random assignment with a user-supplied seed |
| Stratified | Random, but preserving target class proportions — requires target column selection |
| Time-based | User selects a date/index column and specifies cut points |

**Split ratios:** User configures via sliders — train / validation (optional) / test.
Example: 70 / 15 / 15 or 80 / 20 (no validation).

**Output:** New column (default name `_split`) with values `"train"` / `"validation"` / `"test"`.

**Integration:** Models tab auto-detects the `_split` column in `State.data` by name.

---

#### Apply model step

**Purpose:** Re-apply a trained model's transformations deterministically after the model
has been trained and outputs written back from the Models tab.

**Contents:** The step embeds the complete scoring table (bin thresholds, WoE values, points,
LR coefficients) as a self-contained JSON blob. It does not reference the ephemeral
`State.models` — it is fully standalone and survives model session resets.

**Edit behavior:** The step shows its parameters as read-only JSON. To retrain, the user
goes back to the Models tab, trains a new model, and writes back new outputs.

---

### Models

**Purpose:** Build, evaluate, and apply supervised (and future unsupervised) machine learning
models against a user-selected target variable.

#### Architecture

- Models are **ephemeral** — stored in `State.models[]`, cleared on page refresh.
- Multiple models are shown as **tabs** across the top of the Models page. "+" adds a new model.
- Model results can be composed into Dashboard blocks manually using existing block types
  (KPI cards for Gini/AUC, table blocks for scorecard table).
- Model outputs can be written back to the dataset, which adds an `apply_model` transform step.
- The **Model compare** button appears in the tab bar when 2 or more models exist in the session.

#### Prerequisite panel

Displayed at the top of the workbench. Read-only summary of data preparation state:

```
Data preparation
  [✓] Null handling — age, fare, deck handled
  [!] No split detected — model will train on full data; in-sample metrics only
      [Set up split →]    ← teleports to Transform, opens model_split modal
```

Scanned from `State.transforms` (for null_handling steps) and `State.data` columns
(for the presence of a `_split` column).

#### Model workbench layout

Three collapsible sections stacked vertically. Sections 1 and 2 must be complete before
section 3 is enabled. All parameters show a `?` tooltip with a 1–2 line mathematical or
engineering explanation on hover.

**Section 1 — Setup**

| Field | Description |
|---|---|
| Target variable | Dropdown of all columns. Auto-detects type (binary / categorical / continuous). |
| Target type | Read-only detection badge. Scorecard requires binary; shows warning otherwise. |
| Evaluation metric | Gini (default) / AUC / KS — used to rank parameter search results. |
| Mode | Automatic \| Parameter Search \| Manual (Manual = future implementation) |

**Section 2 — Variables**

Table with one row per non-target, non-weight column. All included by default.

| Column | Description |
|---|---|
| Variable name | Column name |
| Type | NUM / CAT badge |
| IV | Information Value — computed on demand or after first run. Color-coded (< 0.02 red, 0.02–0.1 orange, 0.1–0.3 yellow, > 0.3 green). |
| Include | Toggle — exclude from model without dropping from dataset |
| Monotonicity | auto / ascending / descending / unconstrained (per-variable override) |
| Cat. ordering | Event rate / Target mean / Frequency / Alphabetical / Custom (categorical variables only) |

Row expand → reveals additional per-variable overrides (max_bins, min_bin_size, special value bin).

IV threshold parameter (below table): variables below threshold are flagged in red in output
but still included unless the user explicitly excludes them.

**Section 3 — Parameters**

*Automatic mode:*

| Parameter | Default | Tooltip (shown on hover) |
|---|---|---|
| max_bins | 5 | Maximum number of bins per variable. More bins = more granular WoE but risk of overfitting to training data. |
| pre_bins | 20 | Number of quantile pre-bins before DP optimization. Higher = finer search space; 20 is the practical sweet spot. |
| min_bin_size | 5% | Minimum fraction of total weighted observations per bin. Prevents unstable WoE estimates from near-empty bins. |
| monotonicity | auto | WoE direction constraint: ascending, descending, unconstrained, or auto (tries both, picks higher IV). |
| cat. ordering | event rate | Sort order for category levels before binning: event rate, target mean, frequency, alphabetical, or custom. |
| IV threshold | 0.02 | Variables below this IV are flagged in output. Convention: < 0.02 useless, 0.02–0.1 weak, 0.1–0.3 medium, > 0.3 strong. |
| λ (regularization) | 0.01 | L2 penalty on logistic regression coefficients. Higher λ = more shrinkage toward zero, more robust to small bins. |
| max_iter | 500 | Maximum gradient descent iterations. Increase if a convergence warning appears in output. |
| PDO | 20 | Points to Double the Odds. Controls score spread. Industry standard = 20. B = PDO / ln(2). |
| base_score | 600 | Score assigned at base_odds. Typical credit scorecard convention: 600 at 1-in-20 default rate. |
| base_odds | 1/19 | Odds ratio at which base_score is achieved. A = base_score + B × ln(base_odds). |

[Run model] button (disabled until Setup and Variables are complete).

*Parameter search mode:*

Same parameters as Automatic, but with sweep ranges added. A [Pre-compute grid] button
triggers background evaluation of all parameter combinations (shows progress bar). After
completion:

- **Metric heatmap**: X = parameter A, Y = parameter B, cell color = evaluation metric.
- **Ranked table**: all combinations sorted by metric on validation set (or full data if no split).
  Click any row to load that configuration into the Parameters section.
- **[Run automated tuning]** button: selects the best-performing row and runs the model.

Parameter sweep is **global** — the swept parameter applies uniformly to all variables.
Per-variable tuning belongs to Manual mode (future).

#### Model output

Displayed below the parameter sections after [Run model] completes. Four sub-sections:

**Performance**
- Metric table: Gini / AUC / KS — columns for each split (train / validation / test, or "full data").
- ROC curve (Plotly): one trace per split.
- Score distribution histogram: overall population vs. events (two overlaid histograms).

**Scorecard table**
- One row per variable × bin combination.
- Columns: Variable | Bin label | Count | Count % | Event rate | WoE | Points.
- Variables below IV threshold shown in red with an explicit note: "Not included — IV below threshold."
- Null bin shown as a separate row per variable (if nulls exist and no prior imputation).

**Variable summary**
- IV per variable, sorted descending, with color coding.
- Horizontal bar chart of IV values.

**Binning detail**
- Click any variable in the scorecard table to expand a detail view.
- Shows: event rate per bin (bar), WoE per bin (line), monotonicity direction label.

#### Write outputs to dataset

Panel below output (appears after model runs):

```
Add to dataset:
  [x] Score column         name: [score          ]
  [x] Predicted probability name: [prob_default    ]
  [ ] WoE columns          prefix: [woe_           ]
  [ ] Bin label columns    prefix: [bin_           ]

  [Apply to dataset]
```

[Apply to dataset] adds an `apply_model` transform step embedding all scoring parameters.

#### Model compare

Triggered by [Model compare] button (visible when 2+ models exist in the session tab bar).
User selects two models from dropdowns.

- **Same model type:** Side-by-side hyperparameter table with cell highlighting where values
  differ between the two models, plus side-by-side performance metrics.
- **Different model types:** Side-by-side performance metrics only. (Further comparison
  features to be designed when more model types are implemented.)

#### Future models roadmap

Models planned (not yet specified — architecture should be extensible):

| Model | Type | Notes |
|---|---|---|
| Logistic regression | Supervised / classifier | Plain LR, no scorecard points scaling |
| Decision tree | Supervised / classifier + regressor | |
| Random forest | Supervised / classifier + regressor | |
| K-means | Unsupervised / clustering | |
| PCA | Unsupervised / dimensionality reduction | |
| Scorecard (continuous target) | Supervised / regressor | Swap LR for linear regression, WoE for target-mean encoding |

---

### Scorecard Algorithm (implementation reference)

#### Weight normalization
Flat datasets: weight = 1 per row. Cube datasets: weight = `Number_of_rows` value.
All subsequent computations are weight-aware.

#### Stage 1 — Pre-binning (numeric predictors)
1. Collect all non-null values of X with their weights.
2. Compute K=20 weighted quantile cut points (default).
3. Assign each value to a pre-bin index 0..K−1.
4. For each pre-bin: compute `n_events` (weighted sum where target=1) and `n_non_events`.

#### Stage 1 — Category ordering (categorical predictors)
Sort category levels by chosen ordering, then treat them as ordinal — the same DP applies.

| Ordering | Sort key |
|---|---|
| Event rate | P(target=1 \| category) ascending |
| Target mean | mean(target \| category) ascending — same as event rate for binary |
| Frequency | sum(weight \| category) ascending (rarest first) |
| Alphabetical | Lexicographic ascending |
| Custom | User-specified drag order |

#### Stage 2 — DP optimization (per predictor)
Partition K pre-bins into ≤ `max_bins` final bins to maximize total Information Value.

IV contribution of a bin:
```
WoE_bin = ln( (n_events_bin / total_events) / (n_non_events_bin / total_non_events) )
IV_bin  = (n_events_bin/total_events − n_non_events_bin/total_non_events) × WoE_bin
```

DP recurrence:
```
dp[i][j] = max over 0≤k<i of ( dp[k−1][j−1] + IV(k..i) )
```

Complexity: O(K² × max_bins) — with K=20 and max_bins=10 this is ~4,000 operations per
variable, essentially instant. Bins smaller than `min_bin_size` are penalized (merged into
adjacent bin during DP construction).

#### Stage 3 — Monotonicity enforcement
After DP, check the WoE sequence across bins.
If the chosen constraint is violated, merge the two adjacent bins with the smallest IV loss.
Repeat until the sequence satisfies the constraint.
`auto` mode: runs both ascending and descending enforcement, keeps whichever achieves higher total IV.
`unconstrained`: skip this stage.

#### Stage 4 — Null bin
Rows where the predictor is null are assigned to a dedicated null bin.
Its WoE is computed from the event/non-event counts of all null rows for that variable.
If null handling was applied upstream (transform step), this bin will be empty.

#### Stage 5 — Compression for logistic regression
After binning all selected predictors:
1. Assign each row its bin index vector (one index per predictor).
2. Group rows by unique bin index combination.
3. Each group becomes one compressed row with summed event/non-event weights.
4. Maximum compressed rows: `max_bins^P` where P = number of predictors.
   With P=10 predictors and max_bins=5: at most 5^10 groups, but in practice far fewer.
5. Logistic regression runs on this compressed dataset → fast on any original dataset size.

#### Stage 6 — Logistic regression
L2-regularized logistic regression via gradient descent on the compressed weighted dataset.

```
Loss = −∑ w_i [ y_i log(p_i) + (1−y_i) log(1−p_i) ] + λ ∑ β_j²
p_i = sigmoid( β₀ + ∑_j β_j × WoE_{ij} )
```

Gradient descent with learning rate decay. Default: λ=0.01, max_iter=500.
Convergence criterion: gradient L2-norm < 1e-6.

#### Stage 7 — Points scaling
```
B = PDO / ln(2)
A = base_score + B × ln(base_odds)
points_j(bin) = −(β_j × WoE_j(bin) + β₀/P) × B
score(row)    = A + ∑_j points_j(bin_j(row))
probability   = sigmoid(β₀ + ∑_j β_j × WoE_j(bin_j(row)))
```

#### Stage 8 — Evaluation
```
Gini = 2 × AUC − 1
AUC  = area under ROC curve (trapezoidal rule on sorted score thresholds)
KS   = max over thresholds of |CDF_events(t) − CDF_non_events(t)|
```

All metrics computed per split (train / validation / test) if a `_split` column exists.

---

### Dashboard

**Purpose:** Compose named dashboards from saved plots and dataset metrics, then export them
as standalone HTML files.

**Dashboard list view** (default):
- Shows all named dashboards saved in localStorage
- [+ New dashboard] button
- Each item: dashboard name, last modified date, [Edit] [Export] [Delete] buttons

**Dashboard editor:**
- Name input at top
- Responsive grid canvas
- [+ Add block] side panel with block types:
  - **Plot** — pick any chart from the current Explore session (from `Charts._registry`)
  - **KPI card** — label + computed aggregate (sum / mean / count / Gini / AUC)
  - **Data table** — small filtered/grouped table
  - **Text / Markdown** — free-form text, supports bold/italic/headings/lists
- Block controls: drag to reorder (HTML5 DnD), resize (small/medium/large/full-width), [×] remove
- [Save] → persists to localStorage
- [Export HTML] → generates standalone `.html` with Plotly.js bundled inline

**Export format:** Self-contained HTML with Plotly bundled, all chart data as JSON,
KPI values pre-computed, table data as JSON, Markdown rendered to HTML.

---

### Settings

**Purpose:** Preferences that persist across sessions via localStorage.

**Sections:**
1. **Theme** — 4 theme cards (Dark / Light / Nord / Solarized)
2. **Dataset** — Weight column name; note to re-load after changing
3. **Table display** — Sample rows shown (5–100)
4. **Chart defaults** — Scatter sample size; default pairplot mode
5. **Export** — Filename prefix; CSV delimiter

All changes save immediately on blur / change.

---

## Bundled Data

### Titanic
- Served as `titanic.csv` alongside `index.html`, fetched on startup
- 891 rows, 15 columns (survived, pclass, sex, age, sibsp, parch, fare, embarked, class, who, adult_male, deck, embark_town, alive, alone)
- Loaded automatically on app start

### Second test dataset — Online Retail II (UCI)
- ~1M transactions, ~8 columns
- User loads via drag-and-drop (too large to embed, ~50MB raw CSV)
- Download URL documented in README

---

## Build Phases

### Phase 1 — Foundation ✓ COMPLETE
- CSS design system: all 4 themes, all component styles
- HTML shell: sidebar, page containers, drop overlay, file input
- `State`, `Storage`, `DataEngine.parseCSV`, `DataEngine.analyzeColumn`
- `UI.init`, `UI.navigate`, drag-drop, file input wiring
- Titanic CSV auto-loaded
- **Overview page**: full
- **Settings page**: full

### Phase 2 — Column analysis & Explore ✓ COMPLETE
- `DataEngine` weighted stats (mean, std, quantile, histogram, correlation)
- `Charts` module (histogram, bar, heatmap, scatter, box/violin, pairplot, mini variants)
- **Column Detail page**: full
- **Explore page**: full (distribution grid, heatmap, scatter builder, pairplot, breakdown)

### Phase 3 — Transform ✓ COMPLETE
- Transform step data model and execution engine
- Filter, Rollup, Pivot, Unpivot, Calculated column, Rename, Drop step types
- Enable/disable toggle, row count delta, step reordering, Download CSV
- **Transform page**: full UI

### Phase 4 — Dashboard ✓ COMPLETE
- Dashboard data model + localStorage persistence
- Dashboard list view
- Dashboard editor (grid, 4 block types, HTML5 DnD reordering, resize)
- Export to standalone HTML (Plotly bundled inline)

### Phase 5 — Models (next)

#### 5a — Transform prerequisites
- [ ] `null_handling` step type: config modal (nulls-only columns, all strategies), pipeline execution
- [ ] `model_split` step type: config modal (random/stratified/time-based), `_split` column output

#### 5b — Models engine (core JS)
- [ ] `ModelsEngine.preBin(col, weights, target, K)` — weighted quantile pre-binning
- [ ] `ModelsEngine.categoryOrder(col, weights, target, ordering)` — category sorting
- [ ] `ModelsEngine.dpOptimize(preBins, maxBins, minBinSize)` — DP partition with IV maximization
- [ ] `ModelsEngine.enforceMonotonicity(bins, direction)` — merge loop
- [ ] `ModelsEngine.computeWoE(bins, totalEvents, totalNonEvents)` — WoE + IV per bin
- [ ] `ModelsEngine.compress(data, binMaps)` — group by bin combination for fast LR
- [ ] `ModelsEngine.fitLR(compressed, lambda, maxIter)` — weighted L2 logistic regression
- [ ] `ModelsEngine.scalePoints(coefs, binWoE, PDO, baseScore, baseOdds)` — scorecard points
- [ ] `ModelsEngine.evaluate(scores, targets, weights, split)` — Gini, AUC, KS

#### 5c — Models page UI
- [ ] `Pages.models` object with `render()`, `renderPrerequisites()`, `renderSetup()`, `renderVariables()`, `renderParameters()`, `renderOutput()`, `renderWriteBack()`, `renderCompare()`
- [ ] Model tab bar (multiple models, "+" button, Model compare button)
- [ ] Prerequisite panel with teleport buttons to Transform
- [ ] Automatic mode: 3-section workbench, [Run model] button
- [ ] Parameter search mode: grid pre-computation with progress bar, metric heatmap, ranked table
- [ ] Output panels: Performance, Scorecard table, Variable summary, Binning detail
- [ ] Write-back UI: output column checkboxes, [Apply to dataset] → `apply_model` step
- [ ] Model compare view: same-type (param diff + metrics) and different-type (metrics only)

#### 5d — Apply model transform step
- [ ] `apply_model` step type: stores scoring JSON blob, applies binning + scoring to `State.data`

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
| Models ephemeral | Keeps State simple; model outputs persist via apply_model transform step and dashboard blocks |
| DP pre-binning on K=20 pre-bins | Reduces binning from O(N²) on raw rows to O(K² × max_bins) — fast on any dataset size |
| LR on compressed data | Grouping by bin combination bounds LR input size to max_bins^P regardless of dataset size |
| `_split` column convention | Decouples model split transform from Models tab — Models tab just reads State.data |
| `apply_model` step embeds full scoring JSON | Makes model application reproducible and independent of ephemeral model session |
| Parameter tooltips on hover | Engineering/math explainers on every parameter — respects expert users, avoids cluttering the UI |
| Models tab between Transform and Dashboard | Reflects logical pipeline order: prepare data → model → visualize results |
| Categorical ordering: 5 options | Different domains need different orderings; event-rate default is optimal for credit scoring |
| Exported dashboards fully standalone | Offline-safe, freely shareable without server |
| Charts re-render on theme change | CSS vars are read at render time; switching theme re-runs chart renderers |
