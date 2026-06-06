# Data Lab

Interactive data analysis and dashboard tool — single `index.html` file, no server, no build step.

Open `index.html` in any modern browser. The Titanic dataset loads automatically. Drop any CSV file onto the page to load your own data.

## Features

- Flat and OLAP cube CSV support (weight-aware statistics throughout)
- Overview with data quality grid and sample table
- Explore: distributions, correlation heatmap, scatter chart builder
- Column detail: weighted stats, distributions, cross-column correlations
- Transform pipeline: filter, rollup, pivot, calculated columns
- Dashboard builder with drag-and-drop grid and standalone HTML export
- Four themes: Dark, Light, Nord, Solarized

## Second test dataset

**Online Retail II** (UCI Machine Learning Repository) — ~1M transactions, suitable for cube aggregation.

## Libraries

- [Plotly.js](https://plotly.com/javascript/) 2.35.2 — charts
- [Papa Parse](https://www.papaparse.com/) 5.4.1 — CSV parsing

## Spec

See [SPEC.md](SPEC.md) for full product specification and build phases.
