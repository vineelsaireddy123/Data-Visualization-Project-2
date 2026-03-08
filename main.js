/**
 * Netflix Content Analytics — Improved D3.js Visualisation
 * ══════════════════════════════════════════════════════════
 *

 */

(() => {
  'use strict';

  /* ── CSV path fallbacks ──────────────────────────────────── */
  const MOVIE_PATHS = [
    '../netflix_movies_detailed_up_to_2025.csv',
    './netflix_movies_detailed_up_to_2025.csv',
    '/netflix_movies_detailed_up_to_2025.csv'
  ];
  const SHOW_PATHS = [
    '../netflix_tv_shows_detailed_up_to_2025.csv',
    './netflix_tv_shows_detailed_up_to_2025.csv',
    '/netflix_tv_shows_detailed_up_to_2025.csv'
  ];

  /* ── Application State ───────────────────────────────────── */
  const state = {
    data: { movies: [], shows: [], combined: [] },
    domains: { genres: [], countries: [] },
    filters: { yearRange: [2010, 2025] },
    modes: { quality: 'all', genre: 'sunburst', geo: 'stream', heatmap: 'all' },
    flags: { diversity: true },
    genreFocus: null,
    yearExtent: [2010, 2025],
    /* Cross-filter state: selecting in one chart filters all others */
    crossFilter: { genre: null, country: null }
  };

  /* ── Formatters ─────────────────────────────────────────── */
  const fmt = {
    num: d3.format(',d'),
    short: d3.format('~s'),
    pct: d3.format('.1%'),
    pct0: d3.format('.0%'),
    dec1: d3.format('.1f'),
    dec2: d3.format('.2f'),
    year: d3.format('d')
  };

  /* ── Colorblind-safe categorical palette ─────────────────── */
  const COLOR = {
    movie: '#e05e6a',   /* coral-red */
    show: '#4b9fd4',   /* steel-blue */
    amber: '#f0a830',   /* diversity index */
    teal: '#2bbfa4',
    geo: [
      '#e05e6a', '#4b9fd4', '#f0a830', '#2bbfa4',
      '#a56ede', '#e07b45', '#52c4e0', '#c45a9e', '#8ca8b0'
    ]
  };

  /* ── Shared margin convention ────────────────────────────── */
  const MARGIN = { top: 40, right: 80, bottom: 80, left: 110 };

  /* ══════════════════════════════════════════════════════════
     INITIALISATION
  ══════════════════════════════════════════════════════════ */
  init();

  async function init() {
    showLoading();
    try {
      const [moviesRaw, showsRaw] = await Promise.all([
        loadCsvWithFallback(MOVIE_PATHS),
        loadCsvWithFallback(SHOW_PATHS)
      ]);
      processData(moviesRaw, showsRaw);
      wireControls();
      updateAll();
      hideLoading();
      showStatus('info', 'Loaded Netflix movies & TV shows (2010–2025). Use the mode toggles to switch views.');
    } catch (err) {
      hideLoading();
      showStatus('error', err.message);
    }

    window.addEventListener('resize', debounce(() => {
      updateAll();
    }, 200));
  }

  /* ══════════════════════════════════════════════════════════
     DATA LOADING & PROCESSING
  ══════════════════════════════════════════════════════════ */

  async function loadCsvWithFallback(paths) {
    const errors = [];
    for (const path of paths) {
      try {
        const data = await d3.csv(path);
        if (data?.length) return data;
        errors.push(`${path}: empty`);
      } catch (e) {
        errors.push(`${path}: ${e.message}`);
      }
    }
    throw new Error(`Failed to load CSV. Tried: ${errors.join(' | ')}`);
  }

  function processData(moviesRaw, showsRaw) {
    state.data.movies = moviesRaw.map(d => parseRow(d, 'Movie')).filter(Boolean);
    state.data.shows = showsRaw.map(d => parseRow(d, 'TV Show')).filter(Boolean);
    state.data.combined = [...state.data.movies, ...state.data.shows];

    const years = state.data.combined.map(d => d.year);
    state.yearExtent = d3.extent(years);
    state.filters.yearRange = state.yearExtent.slice();

    /* Top N genres / countries for domain encoding */
    state.domains.genres = topKeys(state.data.combined.flatMap(d => d.genres), 15);
    state.domains.countries = topKeys(state.data.combined.flatMap(d => d.countries), 8);

    updateKPIs();
  }

  function parseRow(d, type) {
    const year = parseYear(d.date_added) ?? toNumber(d.release_year);
    if (!year || year < 2000 || year > 2030) return null;
    const dateAdded = d.date_added ? new Date(d.date_added) : null;
    return {
      type,
      title: d.title,
      year,
      month: dateAdded && !isNaN(dateAdded) ? dateAdded.getMonth() : null,
      rating: toNumber(d.vote_average) ?? 0,
      voteCount: toNumber(d.vote_count) ?? 0,
      genres: parseList(d.genres),
      countries: parseList(d.country),
    };
  }

  function parseYear(str) {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d) ? null : d.getFullYear();
  }

  function parseList(str) {
    return (str || '').split(/[,;]/g).map(s => s.trim()).filter(Boolean);
  }

  function toNumber(v) {
    const n = +v;
    return isFinite(n) ? n : null;
  }

  function topKeys(arr, n) {
    return d3.rollups(arr, v => v.length, d => d)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(d => d[0]);
  }

  /* ══════════════════════════════════════════════════════════
     UI WIRING
  ══════════════════════════════════════════════════════════ */

  function wireControls() {
    /* Quality chart toggle */
    const qBtns = d3.selectAll('.btn[data-viz="quality"]');
    qBtns.on('click', function () {
      state.modes.quality = this.dataset.mode;
      qBtns.classed('active', false).attr('aria-pressed', 'false');
      d3.select(this).classed('active', true).attr('aria-pressed', 'true');
      updateQualityViz();
    });

    /* Genre chart toggle */
    const gBtns = d3.selectAll('.btn[data-viz="genre"].btn-seg');
    gBtns.on('click', function () {
      state.modes.genre = this.dataset.mode;
      gBtns.classed('active', false).attr('aria-pressed', 'false');
      d3.select(this).classed('active', true).attr('aria-pressed', 'true');
      updateGenreViz();
    });
    d3.select('.btn[data-viz="genre"][data-mode="reset"]').on('click', () => {
      state.genreFocus = null;
      state.crossFilter.genre = null;
      updateCrossFilterUI();
      updateAll();
    });

    /* Geo chart toggle */
    const geoBtns = d3.selectAll('.btn[data-viz="geo"].btn-seg');
    geoBtns.on('click', function () {
      state.modes.geo = this.dataset.mode;
      geoBtns.classed('active', false).attr('aria-pressed', 'false');
      d3.select(this).classed('active', true).attr('aria-pressed', 'true');
      updateGeoViz();
    });

    /* Heatmap toggle */
    const hBtns = d3.selectAll('.btn[data-viz="heatmap"]');
    hBtns.on('click', function () {
      state.modes.heatmap = this.dataset.mode;
      hBtns.classed('active', false).attr('aria-pressed', 'false');
      d3.select(this).classed('active', true).attr('aria-pressed', 'true');
      updateHeatmapViz();
    });

    d3.select('.btn[data-viz="geo"][data-mode="diversity"]')
      .on('click', function () {
        state.flags.diversity = !state.flags.diversity;
        d3.select(this)
          .classed('active', state.flags.diversity)
          .attr('aria-pressed', state.flags.diversity ? 'true' : 'false');
        updateGeoViz();
      });

    /* Clear all cross-filters */
    d3.select('#clear-all-filters').on('click', () => {
      clearCrossFilters();
    });
  }

  /* ── KPI strip ──────────────────────────────────────────── */
  function updateKPIs() {
    const f = getFiltered();
    const movies = f.filter(d => d.type === 'Movie').length;
    const shows = f.filter(d => d.type === 'TV Show').length;
    const avgRating = d3.mean(f, d => d.rating) || 0;
    const [y0, y1] = state.yearExtent;

    setKPI('kpi-total', fmt.num(f.length));
    setKPI('kpi-movies', fmt.num(movies));
    setKPI('kpi-shows', fmt.num(shows));
    setKPI('kpi-rating', fmt.dec1(avgRating));
    setKPI('kpi-range', `${y0}–${y1}`);
  }

  function setKPI(id, value) {
    const el = document.getElementById(id);
    if (el) el.querySelector('.kpi-value').textContent = value;
  }

  function showStatus(type, message) {
    d3.select('#status-banner')
      .html(message
        ? `<div class="callout ${type}"><strong>${type === 'error' ? 'Error' : 'ℹ'}</strong> ${message}</div>`
        : '');
  }

  function showLoading() {
    d3.selectAll('.viz-container').html('<div class="loading">Loading data</div>');
  }

  function hideLoading() {
    d3.selectAll('.loading').remove();
  }

  /* ── Filters ────────────────────────────────────────────── */
  function getFiltered() {
    const [y0, y1] = state.filters.yearRange;
    let data = state.data.combined.filter(d => d.year >= y0 && d.year <= y1);
    /* Apply cross-filters */
    if (state.crossFilter.genre) {
      data = data.filter(d => d.genres.includes(state.crossFilter.genre));
    }
    if (state.crossFilter.country) {
      data = data.filter(d => d.countries.includes(state.crossFilter.country));
    }
    return data;
  }

  /* ── Cross-filter management ───────────────────────────── */
  function setCrossFilter(key, value) {
    /* Toggle: clicking same filter again clears it */
    if (state.crossFilter[key] === value) {
      state.crossFilter[key] = null;
    } else {
      state.crossFilter[key] = value;
    }
    updateCrossFilterUI();
    updateKPIs();
    updateAll();
  }

  function clearCrossFilters() {
    state.crossFilter.genre = null;
    state.crossFilter.country = null;
    state.genreFocus = null;
    updateCrossFilterUI();
    updateKPIs();
    updateAll();
  }

  function updateCrossFilterUI() {
    const bar = d3.select('#crossfilter-bar');
    const parts = [];
    if (state.crossFilter.genre) parts.push(`Genre: ${state.crossFilter.genre}`);
    if (state.crossFilter.country) parts.push(`Country: ${state.crossFilter.country}`);

    if (parts.length === 0) {
      bar.style('display', 'none');
    } else {
      bar.style('display', 'flex');
      d3.select('#crossfilter-label').text(`Cross-filter active → ${parts.join(' · ')} (click same element again to clear)`);
    }
  }

  function updateYearDisplay() {
    setText('#year-start', state.filters.yearRange[0]);
    setText('#year-end', state.filters.yearRange[1]);
  }

  function setText(sel, val) {
    const el = document.querySelector(sel);
    if (el) el.textContent = val;
  }

  /* ══════════════════════════════════════════════════════════
     YEAR BRUSH
  ══════════════════════════════════════════════════════════ */

  function renderYearBrush(preserveRange = false) {
    const container = d3.select('#year-brush-container');
    container.html('');

    const W = container.node().getBoundingClientRect().width || 800;
    const H = 72;
    const m = { top: 8, right: 16, bottom: 20, left: 16 };
    const iW = W - m.left - m.right;
    const iH = H - m.top - m.bottom;

    /* Year counts for sparkline */
    const yearData = d3.rollups(state.data.combined, v => v.length, d => d.year)
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year);

    const x = d3.scaleLinear()
      .domain(d3.extent(yearData, d => d.year))
      .range([0, iW]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(yearData, d => d.count)])
      .range([iH, 0]);

    const svg = container.append('svg')
      .attr('width', W).attr('height', H)
      .attr('role', 'img')
      .attr('aria-label', 'Year range brush');

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    /* Area sparkline behind brush */
    const area = d3.area()
      .x(d => x(d.year))
      .y0(iH)
      .y1(d => y(d.count))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(yearData)
      .attr('d', area)
      .attr('fill', 'rgba(75,159,212,0.18)')
      .attr('stroke', 'rgba(75,159,212,0.5)')
      .attr('stroke-width', 1);

    /* Brush */
    const brush = d3.brushX()
      .extent([[0, 0], [iW, iH]])
      .on('brush end', brushed);

    const brushG = g.append('g').attr('class', 'brush').call(brush);

    const initRange = preserveRange
      ? state.filters.yearRange
      : d3.extent(yearData, d => d.year);
    brush.move(brushG, initRange.map(x));

    /* X-axis — only a few ticks for cleanliness */
    g.append('g')
      .attr('transform', `translate(0,${iH})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(fmt.year))
      .attr('class', 'axis')
      .call(a => a.select('.domain').remove());

    function brushed(event) {
      if (!event.selection) return;
      const [x0, x1] = event.selection.map(x.invert);
      state.filters.yearRange = [Math.round(x0), Math.round(x1)];
      updateAll();
    }
  }

  /* ══════════════════════════════════════════════════════════
     VIZ 1 — QUALITY & VOLUME (BUBBLE CHART)
     ══════════════════════════════════════════════════════════
     Improvement: use sqrt scale so AREA encodes count.
     Original used linear radius which over-encodes large counts
     (area grows as r², making big bubbles look disproportionate).
  ══════════════════════════════════════════════════════════ */

  function updateQualityViz() {
    const filtered = getFiltered();
    const container = d3.select('#quality-viz');
    container.html('');

    if (!filtered.length) {
      container.append('div').attr('class', 'loading').text('No data in selected range');
      return;
    }

    let data = filtered;
    if (state.modes.quality === 'movies') data = filtered.filter(d => d.type === 'Movie');
    if (state.modes.quality === 'shows') data = filtered.filter(d => d.type === 'TV Show');

    const W = container.node().getBoundingClientRect().width || 900;
    const H = 520;
    const m = MARGIN;
    const iW = W - m.left - m.right;
    const iH = H - m.top - m.bottom;

    /* Aggregate: year × rounded-rating bucket → count */
    const bubbles = Array.from(
      d3.rollup(
        data,
        v => ({
          count: v.length,
          avgRat: d3.mean(v, d => d.rating),
          type: v[0].type
        }),
        d => d.year,
        d => Math.round(d.rating * 2) / 2  /* 0.5-step bins */
      ),
      ([year, rMap]) => Array.from(rMap, ([rating, info]) => ({
        year: +year, rating: +rating, ...info
      }))
    ).flat().filter(d => d.count > 0 && d.rating > 0);

    /* Scales */
    const yearTicks = d3.range(state.filters.yearRange[0], state.filters.yearRange[1] + 1);
    const x = d3.scaleLinear().domain([state.filters.yearRange[0] - 0.3, state.filters.yearRange[1] + 0.3]).range([0, iW]);
    const y = d3.scaleLinear().domain([0, 10]).range([iH, 0]).nice();

    /*
     * IMPROVEMENT: sqrt scale so bubble AREA ∝ count (not radius).
     * Original linear scale meant area grew quadratically with count,
     * making large bubbles appear far more dominant than they are.
     */
    const maxCount = d3.max(bubbles, d => d.count);
    const r = d3.scaleSqrt().domain([0, maxCount]).range([3, 36]);

    const colorScale = d3.scaleOrdinal()
      .domain(['Movie', 'TV Show'])
      .range([COLOR.movie, COLOR.show]);

    const svg = container.append('svg')
      .attr('width', W).attr('height', H)
      .attr('role', 'img')
      .attr('aria-label', 'Bubble chart of content quality vs year');

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    /* Grid — horizontal only (y = rating), very subtle */
    g.append('g').attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(10).tickSize(-iW).tickFormat(''))
      .call(a => a.select('.domain').remove())
      .call(a => a.selectAll('line').attr('stroke', 'rgba(255,255,255,0.04)'));

    /* "Good" band annotation */
    g.append('rect')
      .attr('x', 0).attr('y', y(10))
      .attr('width', iW)
      .attr('height', y(7) - y(10))
      .attr('fill', 'rgba(43,191,164,0.05)');
    g.append('text')
      .attr('x', iW - 4).attr('y', y(9.6))
      .attr('text-anchor', 'end')
      .attr('fill', 'rgba(43,191,164,0.5)')
      .attr('font-size', 10)
      .attr('font-family', 'var(--font-mono)')
      .text('HIGH QUALITY  ≥ 7.0');

    /* Bubbles — join pattern (update-friendly) */
    const tooltip = ensureTooltip();

    g.selectAll('.bubble')
      .data(bubbles)
      .join('circle')
      .attr('class', 'bubble')
      .attr('cx', d => x(d.year))
      .attr('cy', d => y(d.rating))
      .attr('r', d => r(d.count))
      .attr('fill', d => colorScale(d.type))
      .attr('fill-opacity', 0.6)
      .attr('stroke', d => colorScale(d.type))
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.9)
      .style('cursor', 'default')
      .on('mouseenter', (event, d) => {
        d3.select(event.currentTarget)
          .attr('fill-opacity', 0.9)
          .attr('stroke-width', 2);
        showTooltip(event, `
            <div class="tooltip-title">${d.year} · ${d.type}</div>
            <div class="tooltip-row">
              <span class="tooltip-label">Rating bin</span>
              <span class="tooltip-value">${fmt.dec1(d.rating)} / 10</span>
            </div>
            <div class="tooltip-row">
              <span class="tooltip-label">Titles</span>
              <span class="tooltip-value">${fmt.num(d.count)}</span>
            </div>
            <div class="tooltip-row">
              <span class="tooltip-label">Avg. rating</span>
              <span class="tooltip-value">${fmt.dec2(d.avgRat)}</span>
            </div>
          `);
      })
      .on('mousemove', moveTooltip)
      .on('mouseleave', (event) => {
        d3.select(event.currentTarget)
          .attr('fill-opacity', 0.6)
          .attr('stroke-width', 1);
        hideTooltip();
      });

    /* Axes */
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${iH})`)
      .call(d3.axisBottom(x).tickValues(yearTicks).tickFormat(fmt.year))
      .call(a => a.select('.domain').remove());

    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(y).ticks(10).tickFormat(d => `${d}`))
      .call(a => a.select('.domain').remove());

    /* Axis labels */
    g.append('text')
      .attr('x', iW / 2).attr('y', iH + 44)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', 11)
      .attr('font-family', 'var(--font-mono)')
      .text('YEAR ADDED TO NETFLIX');

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -iH / 2).attr('y', -56)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', 11)
      .attr('font-family', 'var(--font-mono)')
      .text('IMDb RATING');

    /* Legend */
    const types = state.modes.quality === 'all'
      ? ['Movie', 'TV Show']
      : state.modes.quality === 'movies' ? ['Movie'] : ['TV Show'];

    const leg = svg.append('g')
      .attr('transform', `translate(${m.left + 8}, ${m.top - 28})`);

    /* Bubble size reference (small / medium / large) */
    const sizeRef = [
      { label: '10 titles', r: r(10) },
      { label: '100 titles', r: r(100) },
      { label: '500+ titles', r: r(Math.min(500, maxCount)) }
    ].filter(d => d.r > 1);

    let legX = 0;
    types.forEach(t => {
      const grp = leg.append('g').attr('transform', `translate(${legX}, 0)`);
      grp.append('circle')
        .attr('r', 6)
        .attr('fill', colorScale(t))
        .attr('fill-opacity', 0.7)
        .attr('stroke', colorScale(t));
      grp.append('text')
        .attr('x', 12).attr('y', 4)
        .attr('fill', 'var(--text-secondary)')
        .attr('font-size', 11)
        .attr('font-family', 'var(--font-mono)')
        .text(t === 'Movie' ? 'Movies' : 'TV Shows');
      legX += 120;
    });

    /* Size legend */
    const sizeLeg = svg.append('g')
      .attr('transform', `translate(${W - m.right - 90},${m.top - 28})`);
    sizeLeg.append('text')
      .attr('x', 0).attr('y', 4)
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', 9)
      .attr('font-family', 'var(--font-mono)')
      .text('BUBBLE = COUNT');
  }

  /* ══════════════════════════════════════════════════════════
     VIZ 2 — GENRE ECOSYSTEM
  ══════════════════════════════════════════════════════════ */

  function updateGenreViz() {
    const filtered = getFiltered();
    const container = d3.select('#genre-viz');
    container.html('');
    d3.select('#genre-details').text('');

    if (!filtered.length) {
      container.append('div').attr('class', 'loading').text('No data');
      return;
    }

    const hierarchy = buildGenreHierarchy(filtered);
    if (state.modes.genre === 'treemap') {
      drawGenreTreemap(container, hierarchy);
    } else {
      drawGenreSunburst(container, hierarchy);
    }
  }

  function buildGenreHierarchy(data) {
    const top = state.domains.genres;
    const map = new Map();
    data.forEach(d => {
      d.genres.forEach(g => {
        const key = top.includes(g) ? g : 'Other';
        if (!map.has(key)) map.set(key, { movies: 0, shows: 0 });
        if (d.type === 'Movie') map.get(key).movies++;
        else map.get(key).shows++;
      });
    });
    const children = [...map.entries()]
      .sort((a, b) => (b[1].movies + b[1].shows) - (a[1].movies + a[1].shows))
      .slice(0, 16)
      .map(([name, c]) => ({
        name,
        children: [
          { name: 'Movies', value: c.movies },
          { name: 'TV Shows', value: c.shows }
        ]
      }));
    return { name: 'Netflix', children };
  }

  function drawGenreSunburst(container, data) {
    const W = container.node().getBoundingClientRect().width || 900;
    const H = 600;
    const R = Math.min(W, H) / 2 - 24;

    const svg = container.append('svg')
      .attr('width', W).attr('height', H)
      .attr('role', 'img')
      .attr('aria-label', 'Sunburst chart of genre distribution');

    const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`);

    const root = d3.partition()
      .size([2 * Math.PI, R])(
        d3.hierarchy(data).sum(d => d.value ?? 0)
      );

    const genreNames = data.children.map(d => d.name);
    const color = d3.scaleOrdinal()
      .domain(genreNames)
      .range(d3.schemeTableau10.concat(d3.schemePastel1.slice(0, 8)));

    const arc = d3.arc()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .padAngle(0.012)   /* small gap between arcs — clearer separation */
      .padRadius(R / 2)
      .innerRadius(d => d.y0)
      .outerRadius(d => d.y1 - 3);

    /* Resolve focus from genre name (string) stored in state */
    const focusNode = state.genreFocus
      ? root.descendants().find(d => d.depth === 1 && d.data.name === state.genreFocus) ?? root
      : root;
    const nodes = root.descendants().filter(d => d.depth > 0);
    rescaleToFocus(nodes, focusNode);

    const tooltip = ensureTooltip();

    g.selectAll('path')
      .data(nodes)
      .join('path')
      .attr('d', arc)
      .attr('fill', d => {
        const topAncestor = d.ancestors().find(a => a.depth === 1);
        return color(topAncestor?.data.name ?? d.data.name);
      })
      .attr('fill-opacity', d => d.depth === 1 ? 0.92 : 0.65)
      .attr('stroke', 'var(--bg-base)')
      .attr('stroke-width', 1.5)
      .style('cursor', d => d.depth === 1 ? 'pointer' : 'default')
      .on('click', (event, d) => {
        if (d.depth === 1) {
          /* Store genre NAME (not node ref) so it survives chart rebuild */
          state.genreFocus = d.data.name;
          setCrossFilter('genre', d.data.name);
        }
      })
      .on('mouseenter', (event, d) => {
        d3.select(event.currentTarget).attr('fill-opacity', 1);
        const genre = d.depth === 1 ? d.data.name : d.parent.data.name;
        const seg = d.depth === 2 ? d.data.name : 'All types';
        showTooltip(event, `
            <div class="tooltip-title">${genre}</div>
            <div class="tooltip-row">
              <span class="tooltip-label">Type</span>
              <span class="tooltip-value">${seg}</span>
            </div>
            <div class="tooltip-row">
              <span class="tooltip-label">Titles</span>
              <span class="tooltip-value">${fmt.num(d.value)}</span>
            </div>
            <div class="tooltip-row">
              <span class="tooltip-label">Share</span>
              <span class="tooltip-value">${fmt.pct(d.value / root.value)}</span>
            </div>
          `);
        d3.select('#genre-details').html(
          `<strong>${genre}</strong> · ${seg} · ${fmt.num(d.value)} titles
             <span style="color:var(--text-muted); margin-left:8px;">(${fmt.pct(d.value / root.value)} of catalog)</span>`
        );
      })
      .on('mousemove', moveTooltip)
      .on('mouseleave', (event) => {
        d3.select(event.currentTarget)
          .attr('fill-opacity', d => d.depth === 1 ? 0.92 : 0.65);
        hideTooltip();
        d3.select('#genre-details').text('');
      });

    /* Centre label */
    const center = g.append('g').attr('class', 'sunburst-center');
    const centerLabel = focusNode !== root ? focusNode.data.name : 'All Genres';
    center.append('circle').attr('r', R * 0.25);
    center.append('text')
      .attr('dy', '-0.2em')
      .attr('font-size', '1rem')
      .attr('font-weight', 600)
      .attr('font-family', 'var(--font-body)')
      .text(centerLabel);
    center.append('text')
      .attr('dy', '1.1em')
      .attr('class', 'center-sub')
      .text(`${fmt.num(focusNode.value)} titles`);

    /* Click-to-zoom hint */
    if (focusNode === root) {
      g.append('text')
        .attr('y', R + 18)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-muted)')
        .attr('font-size', 10)
        .attr('font-family', 'var(--font-mono)')
        .text('CLICK GENRE TO ZOOM');
    }
  }

  function rescaleToFocus(nodes, focus) {
    const [x0, x1] = [focus.x0, focus.x1];
    nodes.forEach(d => {
      d.x0 = Math.max(0, Math.min(2 * Math.PI, (d.x0 - x0) / (x1 - x0) * 2 * Math.PI));
      d.x1 = Math.max(0, Math.min(2 * Math.PI, (d.x1 - x0) / (x1 - x0) * 2 * Math.PI));
      d.y0 = Math.max(0, d.y0 - focus.y0);
      d.y1 = Math.max(0, d.y1 - focus.y0);
    });
  }

  function drawGenreTreemap(container, data) {
    const W = container.node().getBoundingClientRect().width || 900;
    const H = 600;

    /*
     * IMPROVEMENT: use d3.treemapSquarify (default) with golden ratio
     * to maximise cell readability. Original used no explicit tiling.
     */
    const root = d3.treemap()
      .size([W, H])
      .tile(d3.treemapSquarify.ratio(1.618))
      .paddingOuter(6)
      .paddingInner(3)
      .paddingTop(24)  /* space for parent label */
      .round(true)(
        d3.hierarchy(data).sum(d => d.value ?? 0).sort((a, b) => b.value - a.value)
      );

    /* Genre → colour mapping (consistent with sunburst) */
    const genreNames = data.children.map(d => d.name);
    const color = d3.scaleOrdinal()
      .domain(genreNames)
      .range(d3.schemeTableau10.concat(d3.schemePastel1.slice(0, 8)));

    const svg = container.append('svg')
      .attr('width', W).attr('height', H)
      .attr('role', 'img')
      .attr('aria-label', 'Treemap of genre distribution');

    const tooltip = ensureTooltip();

    /* Parent groups (genres) */
    const parentNodes = root.children ?? [];
    const parents = svg.selectAll('.tm-parent')
      .data(parentNodes)
      .join('g')
      .attr('class', 'tm-parent')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);

    /* Parent background */
    parents.append('rect')
      .attr('width', d => d.x1 - d.x0)
      .attr('height', d => d.y1 - d.y0)
      .attr('fill', d => color(d.data.name))
      .attr('fill-opacity', 0.15)
      .attr('rx', 4)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        state.genreFocus = d.data.name;
        setCrossFilter('genre', d.data.name);
      });

    /* Parent label */
    parents.append('text')
      .attr('x', 8).attr('y', 16)
      .attr('fill', d => color(d.data.name))
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .attr('font-family', 'var(--font-mono)')
      .attr('letter-spacing', '0.06em')
      .text(d => d.data.name.toUpperCase());

    /* Leaf nodes (Movie / TV Show within each genre) */
    const leaves = svg.selectAll('.tm-leaf')
      .data(root.leaves())
      .join('g')
      .attr('class', 'treemap-node tm-leaf')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);

    const defs = svg.append('defs');
    leaves.each(function (d, i) {
      defs.append('clipPath')
        .attr('id', `clip-${i}`)
        .append('rect')
        .attr('width', d.x1 - d.x0)
        .attr('height', d.y1 - d.y0)
        .attr('rx', 3);
    });

    leaves.append('rect')
      .attr('width', d => Math.max(0, d.x1 - d.x0 - 1))
      .attr('height', d => Math.max(0, d.y1 - d.y0 - 1))
      .attr('fill', d => color(d.parent.data.name))
      .attr('fill-opacity', 0.8)
      .attr('rx', 3)
      .attr('stroke', 'rgba(0,0,0,0.3)')
      .attr('stroke-width', 0.5)
      .on('mouseenter', (event, d) => {
        d3.select(event.currentTarget).attr('fill-opacity', 1);
        const pct = d.value / state.data.combined.length;
        showTooltip(event, `
          <div class="tooltip-title">${d.parent.data.name}</div>
          <div class="tooltip-row">
            <span class="tooltip-label">Type</span>
            <span class="tooltip-value">${d.data.name}</span>
          </div>
          <div class="tooltip-row">
            <span class="tooltip-label">Count</span>
            <span class="tooltip-value">${fmt.num(d.value)}</span>
          </div>
          <div class="tooltip-row">
            <span class="tooltip-label">Share</span>
            <span class="tooltip-value">${fmt.pct(pct)}</span>
          </div>
        `);
      })
      .on('mousemove', moveTooltip)
      .on('mouseleave', (event) => {
        d3.select(event.currentTarget).attr('fill-opacity', 0.8);
        hideTooltip();
      });

    /* Text labels — only if cell is large enough (Gestalt: figure-ground) */
    const textG = leaves.append('g')
      .attr('clip-path', (d, i) => `url(#clip-${i})`);

    textG.filter(d => (d.x1 - d.x0) > 60 && (d.y1 - d.y0) > 30)
      .append('text')
      .attr('x', 8).attr('y', 18)
      .attr('fill', 'rgba(255,255,255,0.95)')
      .attr('font-size', d => Math.min(13, (d.x1 - d.x0) / 7))
      .attr('font-weight', 600)
      .attr('font-family', 'var(--font-body)')
      .attr('pointer-events', 'none')
      .text(d => d.data.name);           /* "Movies" or "TV Shows" */

    textG.filter(d => (d.x1 - d.x0) > 60 && (d.y1 - d.y0) > 48)
      .append('text')
      .attr('x', 8).attr('y', 34)
      .attr('fill', 'rgba(255,255,255,0.7)')
      .attr('font-size', 11)
      .attr('font-family', 'var(--font-mono)')
      .attr('pointer-events', 'none')
      .text(d => fmt.num(d.value));
  }

  /* ══════════════════════════════════════════════════════════
     VIZ 3 — GEOGRAPHIC DIVERSITY
     ══════════════════════════════════════════════════════════
     Improvements:
     - Interactive legend: click to toggle individual countries.
     - Proper secondary axis label for diversity index.
     - Diversity line drawn last (on top) for visibility.
     - Layer hover dimming: non-hovered layers become more transparent.
  ══════════════════════════════════════════════════════════ */

  function updateGeoViz() {
    const filtered = getFiltered();
    const container = d3.select('#geo-viz');
    container.html('');

    if (!filtered.length) {
      container.append('div').attr('class', 'loading').text('No data in selected range');
      return;
    }

    const W = container.node().getBoundingClientRect().width || 900;
    const H = 520;
    const m = { ...MARGIN, top: 60, right: 100 };  /* extra top for legend, right for axis */
    const iW = W - m.left - m.right;
    const iH = H - m.top - m.bottom;

    const keys = [...state.domains.countries, 'Other'];
    const years = d3.range(state.filters.yearRange[0], state.filters.yearRange[1] + 1);

    /* Build stacked data rows */
    const stackData = years.map(year => {
      const yearItems = filtered.filter(d => d.year === year);
      const row = { year };
      let other = 0;
      keys.slice(0, -1).forEach(k => {
        row[k] = yearItems.filter(d => d.countries.includes(k)).length;
      });
      yearItems.forEach(item => {
        item.countries.forEach(c => {
          if (!keys.includes(c)) other++;
        });
      });
      row.Other = other;
      row._total = d3.sum(keys.map(k => row[k] || 0));
      return row;
    });

    const offset = state.modes.geo === 'stream' ? d3.stackOffsetWiggle : d3.stackOffsetNone;
    const series = d3.stack().keys(keys).offset(offset)(stackData);

    /* Scales */
    const yearTicks = d3.range(state.filters.yearRange[0], state.filters.yearRange[1] + 1);
    const x = d3.scaleLinear().domain([state.filters.yearRange[0] - 0.3, state.filters.yearRange[1] + 0.3]).range([0, iW]);
    const y = d3.scaleLinear()
      .domain([
        d3.min(series, s => d3.min(s, d => d[0])),
        d3.max(series, s => d3.max(s, d => d[1]))
      ])
      .nice()
      .range([iH, 0]);

    if (state.modes.geo === 'area') {
      y.domain([0, d3.max(series, s => d3.max(s, d => d[1]))]).nice();
    }

    /* Color: fixed mapping (colorblind-safe) */
    const color = d3.scaleOrdinal().domain(keys).range(COLOR.geo);

    /* Area generator */
    const areaGen = d3.area()
      .x(d => x(d.data.year))
      .y0(d => y(d[0]))
      .y1(d => y(d[1]))
      .curve(d3.curveCatmullRom.alpha(0.5));

    const svg = container.append('svg')
      .attr('width', W).attr('height', H)
      .attr('role', 'img')
      .attr('aria-label', 'Streamgraph of geographic content distribution');

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    /* Layers */
    const tooltip = ensureTooltip();

    const layers = g.selectAll('.layer')
      .data(series)
      .join('path')
      .attr('class', 'layer')
      .attr('d', areaGen)
      .attr('fill', d => color(d.key))
      .attr('opacity', 0.82)
      .on('mouseenter', (event, d) => {
        layers.attr('opacity', 0.2);
        d3.select(event.currentTarget).attr('opacity', 1);
        const year = Math.round(x.invert(d3.pointer(event, g.node())[0]));
        const row = stackData.find(r => r.year === year);
        if (!row) return;
        showTooltip(event, `
            <div class="tooltip-title">${d.key}</div>
            <div class="tooltip-row">
              <span class="tooltip-label">Year</span>
              <span class="tooltip-value">${year}</span>
            </div>
            <div class="tooltip-row">
              <span class="tooltip-label">Titles</span>
              <span class="tooltip-value">${fmt.num(row[d.key] ?? 0)}</span>
            </div>
            <div class="tooltip-row">
              <span class="tooltip-label">Share</span>
              <span class="tooltip-value">${fmt.pct((row[d.key] ?? 0) / (row._total || 1))}</span>
            </div>
          `);
      })
      .on('mousemove', moveTooltip)
      .on('mouseleave', () => {
        layers.attr('opacity', 0.82);
        hideTooltip();
      })
      .on('click', (event, d) => {
        setCrossFilter('country', d.key);
      });

    /* Axes */
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${iH})`)
      .call(d3.axisBottom(x).tickValues(yearTicks).tickFormat(fmt.year))
      .call(a => a.select('.domain').remove());

    if (state.modes.geo !== 'stream') {
      g.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(y).ticks(6).tickFormat(fmt.short))
        .call(a => a.select('.domain').remove());

      g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -iH / 2).attr('y', -58)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--text-muted)')
        .attr('font-size', 11)
        .attr('font-family', 'var(--font-mono)')
        .text('TITLE COUNT');
    }

    g.append('text')
      .attr('x', iW / 2).attr('y', iH + 44)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', 11)
      .attr('font-family', 'var(--font-mono)')
      .text('YEAR');

    /* ── Diversity index overlay ──────────────────────────── */
    if (state.flags.diversity) {
      const divData = years.map(year => ({
        year,
        di: simpsonIndex(
          filtered.filter(d => d.year === year).flatMap(d => d.countries)
        )
      }));

      const y2 = d3.scaleLinear().domain([0, 1]).range([iH, 0]);

      /* Draw diversity line LAST so it appears on top */
      const lineGen = d3.line()
        .x(d => x(d.year))
        .y(d => y2(d.di))
        .curve(d3.curveMonotoneX);

      /* Soft glow effect for diversity line */
      const defs = svg.append('defs');
      const filter = defs.append('filter').attr('id', 'glow');
      filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
      filter.append('feMerge').selectAll('feMergeNode')
        .data(['blur', 'SourceGraphic'])
        .join('feMergeNode')
        .attr('in', d => d);

      /* Shadow / glow */
      g.append('path')
        .datum(divData)
        .attr('fill', 'none')
        .attr('stroke', COLOR.amber)
        .attr('stroke-width', 5)
        .attr('stroke-opacity', 0.2)
        .attr('d', lineGen)
        .attr('filter', 'url(#glow)');

      /* Actual line */
      g.append('path')
        .datum(divData)
        .attr('fill', 'none')
        .attr('stroke', COLOR.amber)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6 4')
        .attr('d', lineGen);

      /* Right axis for diversity index */
      g.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(${iW}, 0)`)
        .call(d3.axisRight(y2).ticks(5).tickFormat(fmt.pct0))
        .call(a => a.select('.domain').attr('stroke', 'rgba(240,168,48,0.3)'));

      /* Axis label */
      g.append('text')
        .attr('transform', 'rotate(90)')
        .attr('x', iH / 2).attr('y', -(iW + 68))
        .attr('text-anchor', 'middle')
        .attr('fill', COLOR.amber)
        .attr('font-size', 10)
        .attr('font-family', 'var(--font-mono)')
        .text("SIMPSON'S DIVERSITY INDEX →");
    }

    /* ── Legend (top, inline) ────────────────────────────── */
    const ABBR = { 'United States of America': 'USA', 'United Kingdom': 'UK' };
    const leg = svg.append('g')
      .attr('transform', `translate(${m.left}, ${m.top - 42})`);

    const itemW = Math.min(130, iW / keys.length);
    leg.selectAll('.leg-item')
      .data(keys)
      .join('g')
      .attr('class', 'leg-item')
      .attr('transform', (d, i) => `translate(${i * itemW}, 0)`)
      .call(grp => {
        grp.append('rect')
          .attr('width', 12).attr('height', 12)
          .attr('fill', d => color(d))
          .attr('rx', 2);
        grp.append('text')
          .attr('x', 16).attr('y', 11)
          .attr('fill', 'var(--text-secondary)')
          .attr('font-size', 10)
          .attr('font-family', 'var(--font-mono)')
          .text(d => ABBR[d] ?? d);
      });

    /* Diversity legend marker */
    if (state.flags.diversity) {
      const dLeg = svg.append('g')
        .attr('transform', `translate(${W - m.right + 8}, ${m.top + 20})`);
      dLeg.append('line')
        .attr('x1', 0).attr('x2', 24)
        .attr('y1', 0).attr('y2', 0)
        .attr('stroke', COLOR.amber)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6 4');
      dLeg.append('text')
        .attr('x', 0).attr('y', -6)
        .attr('fill', COLOR.amber)
        .attr('font-size', 9)
        .attr('font-family', 'var(--font-mono)')
        .attr('text-anchor', 'start')
        .text('DIVERSITY');
    }
  }

  /* ══════════════════════════════════════════════════════════
     VIZ 4 — CONTENT RELEASE HEATMAP
     ══════════════════════════════════════════════════════════
     Answers: "When does Netflix add the most content? Are
     there seasonal patterns?"
  ══════════════════════════════════════════════════════════ */

  function updateHeatmapViz() {
    const filtered = getFiltered().filter(d => d.month !== null);
    const container = d3.select('#heatmap-viz');
    container.html('');

    if (!filtered.length) {
      container.append('div').attr('class', 'loading').text('No data with date info');
      return;
    }

    const mode = state.modes.heatmap;
    let data = filtered;
    if (mode === 'movies') data = filtered.filter(d => d.type === 'Movie');
    if (mode === 'shows') data = filtered.filter(d => d.type === 'TV Show');

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const years = d3.range(state.filters.yearRange[0], state.filters.yearRange[1] + 1);

    /* Build matrix */
    const matrix = [];
    years.forEach(yr => {
      months.forEach((mo, mi) => {
        const count = data.filter(d => d.year === yr && d.month === mi).length;
        matrix.push({ year: yr, month: mi, monthLabel: mo, count });
      });
    });

    const W = container.node().getBoundingClientRect().width || 900;
    const H = Math.max(440, years.length * 36 + 120);
    const m = { top: 50, right: 40, bottom: 60, left: 80 };
    const iW = W - m.left - m.right;
    const iH = H - m.top - m.bottom;

    const svg = container.append('svg')
      .attr('width', W).attr('height', H)
      .attr('role', 'img')
      .attr('aria-label', 'Heatmap of content releases by month and year');

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    /* Scales */
    const x = d3.scaleBand().domain(months).range([0, iW]).padding(0.06);
    const y = d3.scaleBand().domain(years).range([0, iH]).padding(0.06);

    const maxCount = d3.max(matrix, d => d.count) || 1;
    const colorScale = d3.scaleSequential()
      .domain([0, maxCount])
      .interpolator(d3.interpolate('#10131c', '#e50914'));

    const tooltip = ensureTooltip();

    /* Draw cells */
    g.selectAll('.hm-cell')
      .data(matrix)
      .join('rect')
      .attr('class', 'hm-cell')
      .attr('x', d => x(d.monthLabel))
      .attr('y', d => y(d.year))
      .attr('width', x.bandwidth())
      .attr('height', y.bandwidth())
      .attr('rx', 3)
      .attr('fill', d => d.count === 0 ? 'rgba(255,255,255,0.03)' : colorScale(d.count))
      .attr('stroke', 'rgba(255,255,255,0.04)')
      .attr('stroke-width', 0.5)
      .style('cursor', 'default')
      .on('mouseenter', (event, d) => {
        d3.select(event.currentTarget)
          .attr('stroke', '#fff')
          .attr('stroke-width', 2);
        showTooltip(event, `
            <div class="tooltip-title">${d.monthLabel} ${d.year}</div>
            <div class="tooltip-row">
              <span class="tooltip-label">Titles Added</span>
              <span class="tooltip-value">${fmt.num(d.count)}</span>
            </div>
            <div class="tooltip-row">
              <span class="tooltip-label">Type</span>
              <span class="tooltip-value">${mode === 'all' ? 'All' : mode === 'movies' ? 'Movies' : 'TV Shows'}</span>
            </div>
          `);
      })
      .on('mousemove', moveTooltip)
      .on('mouseleave', (event) => {
        d3.select(event.currentTarget)
          .attr('stroke', 'rgba(255,255,255,0.04)')
          .attr('stroke-width', 0.5);
        hideTooltip();
      });

    /* Cell count labels (only if cell is big enough) */
    if (y.bandwidth() > 20 && x.bandwidth() > 30) {
      g.selectAll('.hm-label')
        .data(matrix.filter(d => d.count > 0))
        .join('text')
        .attr('class', 'hm-label')
        .attr('x', d => x(d.monthLabel) + x.bandwidth() / 2)
        .attr('y', d => y(d.year) + y.bandwidth() / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', d => d.count > maxCount * 0.5 ? '#fff' : 'var(--text-muted)')
        .attr('font-size', Math.min(11, y.bandwidth() * 0.5))
        .attr('font-family', 'var(--font-mono)')
        .attr('pointer-events', 'none')
        .text(d => d.count);
    }

    /* Axes */
    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisTop(x))
      .call(a => a.select('.domain').remove())
      .selectAll('text')
      .attr('font-size', 11);

    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(y).tickFormat(fmt.year))
      .call(a => a.select('.domain').remove());

    /* Color legend */
    const legendW = 200;
    const legendH = 12;
    const legendG = svg.append('g')
      .attr('transform', `translate(${W - m.right - legendW}, ${H - 24})`);

    const defs = svg.append('defs');
    const gradId = 'hm-grad';
    const grad = defs.append('linearGradient').attr('id', gradId);
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#10131c');
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#e50914');

    legendG.append('rect')
      .attr('width', legendW).attr('height', legendH)
      .attr('fill', `url(#${gradId})`)
      .attr('rx', 3);

    legendG.append('text')
      .attr('x', 0).attr('y', -4)
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', 9)
      .attr('font-family', 'var(--font-mono)')
      .text('0');

    legendG.append('text')
      .attr('x', legendW).attr('y', -4)
      .attr('text-anchor', 'end')
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', 9)
      .attr('font-family', 'var(--font-mono)')
      .text(`${maxCount} titles`);

    legendG.append('text')
      .attr('x', legendW / 2).attr('y', -4)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-muted)')
      .attr('font-size', 9)
      .attr('font-family', 'var(--font-mono)')
      .text('CONTENT VOLUME');
  }

  /* Simpson's Diversity Index */
  function simpsonIndex(arr) {
    if (!arr.length) return 0;
    const counts = d3.rollups(arr, v => v.length, d => d).map(d => d[1]);
    const total = d3.sum(counts);
    return 1 - counts.reduce((acc, c) => acc + Math.pow(c / total, 2), 0);
  }

  /* ══════════════════════════════════════════════════════════
     SHARED TOOLTIP HELPERS
  ══════════════════════════════════════════════════════════ */

  function ensureTooltip() {
    let t = d3.select('body .tooltip');
    if (t.empty()) t = d3.select('body').append('div').attr('class', 'tooltip');
    return t;
  }

  function showTooltip(event, html) {
    ensureTooltip()
      .html(html)
      .style('opacity', 1);
    moveTooltip(event);
  }

  function moveTooltip(event) {
    /*
     * IMPROVEMENT: use clientX/Y (viewport-relative) instead of pageX/Y.
     * pageX/Y includes scroll offset, causing tooltip to drift when user scrolls.
     * Fixed positioning + clientX/Y keeps tooltip correctly anchored to cursor.
     */
    const tp = ensureTooltip().node();
    const vw = window.innerWidth;
    const th = tp.getBoundingClientRect().height;
    const vh = window.innerHeight;
    let lx = event.clientX + 14;
    let ty = event.clientY - 14;

    /* Prevent tooltip from going off right edge */
    if (lx + 260 > vw) lx = event.clientX - 270;
    /* Prevent tooltip from going above viewport */
    if (ty - th < 0) ty = event.clientY + 14;
    /* Prevent tooltip from going below viewport */
    if (ty + th > vh) ty = vh - th - 8;

    ensureTooltip()
      .style('left', `${lx}px`)
      .style('top', `${ty}px`);
  }

  function hideTooltip() {
    ensureTooltip().style('opacity', 0);
  }

  /* ══════════════════════════════════════════════════════════
     ORCHESTRATION
  ══════════════════════════════════════════════════════════ */

  function updateAll() {
    updateKPIs();
    updateQualityViz();
    updateGenreViz();
    updateGeoViz();
    updateHeatmapViz();
  }

  /* ── Utility ────────────────────────────────────────────── */
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

})();