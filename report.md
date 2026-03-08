# Phase 2 Report — Netflix Content Strategy Analytics (Feb 18, 2026)

## Scope
Final Phase 2 deliverable lives in `Phase2/index.html` with logic in `Phase2/main.js` and styling in `Phase2/styles.css`. Data is loaded directly from `netflix_movies_detailed_up_to_2025.csv` and `netflix_tv_shows_detailed_up_to_2025.csv` (paths resolved via three fallbacks or the symlinks inside `Phase2/`). The visuals are tuned for the 2010–2025 catalog and no longer depend on a brush control.

## Dataset review
- Size: ~32k titles (≈16k movies, ≈16k TV) covering release years 2010–2025.
- Fields: ids, creative metadata, `country`, `date_added`, `release_year`, `rating`, `duration`, `genres`, `language`, `popularity`, `vote_count`; movies add `budget` and `revenue`.
- Quality: multi-valued `genres`/`country`; sparse `director`/`cast` for the long tail; some low-vote titles.
- Resilience: CSV loader tries `../`, `./`, `/`; inline error banner surfaces failures instead of blocking alerts.

## Visuals (linked through shared state)

### 1) Content Quality & Volume
- Bubble chart per release year (x) and rating (y). Bubble **area** uses √-scale so area ∝ count (perceptually correct).
- Mode toggle: **Movies** (default) or **TV Shows**. Legend and axes refresh on resize.
- Tooltip: rating bin, title count, and mean rating for that bin/year.

### 2) Genre Ecosystem
- **Sunburst** (default) for hierarchy; **Treemap** alternative for area comparison. Top 15 genres plus “Other”.
- Click a genre segment to zoom; reset button restores full view. Tooltip shows genre/type counts and share of catalog.

### 3) Geographic Diversity
- **Streamgraph** (wiggle) and **Stacked Area** modes for top 8 countries + “Other”.
- Optional Simpson’s Diversity Index overlay (amber dashed line) on secondary axis; toggleable.
- Tooltip lists per-year counts and shares; legend abbreviates USA/UK.

### Cross-view plumbing
- Metrics strip (total, movies, shows, avg rating, year range) driven from shared state; auto-updates on resize.
- Tooltip helper shared across charts; aria-pressed states on all toggles for accessibility.
- State defaults to full extent (2010–2025); if data is refreshed, `state.yearExtent` and domains recompute automatically.

## Risks and mitigations
- **Local hosting:** serve from repo root (`python -m http.server 8000`) to avoid `file://` fetch blocking; symlinks in `Phase2/` keep relative paths working.
- **CDN dependencies:** d3@7 and Google Fonts pulled from CDN; mirror locally for offline use.
- **Data freshness:** If the dataset extends beyond 2025, adjust `state.filters.yearRange` after load (or re-enable a brush) to expose the new years.

## Ready-for-grade checklist
- No console errors on load; CSV fallbacks handle both root and `/Phase2/` serving.
- Axes label every year; left margin padded to avoid collision with first tick.
- Buttons carry `aria-pressed` for screen readers; status banner surfaces load errors.
- All charts redraw responsively on resize with consistent color tokens.
