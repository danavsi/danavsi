/*
  scale-frame.js
  Fits each [data-scale-frame] canvas to the width of its frame by scaling it
  uniformly. The canvas keeps its design layout at every size.
*/
(function () {
  'use strict';

  var frames = [].slice.call(document.querySelectorAll('[data-scale-frame]'));
  if (!frames.length) {
    return;
  }

  function fit(frame) {
    var canvas = frame.querySelector('.scale-canvas');
    if (!canvas) { return; }
    var designWidth = parseFloat(frame.getAttribute('data-design-width')) || canvas.offsetWidth;
    if (!designWidth) {
      return;
    }
    var maxScale = frame.hasAttribute('data-max-scale') ? parseFloat(frame.getAttribute('data-max-scale')) : null;
    var scale = frame.clientWidth / designWidth;
    if (maxScale !== null && scale > maxScale) {
      scale = maxScale;
    }
    frame.style.setProperty('--scale', scale.toFixed(4));
    frame.style.setProperty('--canvas-height', canvas.offsetHeight + 'px');
    frame.setAttribute('data-ready', '');
  }

  function fitAll() {
    frames.forEach(fit);
  }

  var queued = false;
  function queueFit() {
    if (queued) { return; }
    queued = true;
    window.requestAnimationFrame(function () {
      queued = false;
      fitAll();
    });
  }

  fitAll();
  window.addEventListener('resize', queueFit);

  if (window.ResizeObserver) {
    var observer = new ResizeObserver(queueFit);
    frames.forEach(function (frame) {
      observer.observe(frame);
      observer.observe(frame.querySelector('.scale-canvas'));
    });
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(queueFit);
  }
})();

/*
  theme.js
  Theme toggle. The page is dark by default. A viewer's explicit data-theme or
  a remembered choice (when storage is available) switches it to light.
*/
(function () {
  'use strict';

  var KEY = 'danav-theme';
  var root = document.documentElement;
  var button = document.getElementById('theme-toggle');

  function readStored() {
    try {
      var value = window.localStorage.getItem(KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function writeStored(value) {
    try {
      window.localStorage.setItem(KEY, value);
    } catch (error) {
      /* storage unavailable, the choice lasts for this visit only */
    }
  }

  function effective() {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function updateLabel() {
    if (button) {
      button.setAttribute('aria-label', effective() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
  }

  var stored = readStored();
  if (stored) {
    root.setAttribute('data-theme', stored);
  }
  updateLabel();

  if (button) {
    button.addEventListener('click', function () {
      var next = effective() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      writeStored(next);
      updateLabel();
    });
  }
})();

/*
  router-stage.js
  The System One routing demo in the hero (illustrative). Four example requests run
  through the router and land on the cheapest lane that can do the job. One
  falls below the 0.80 confidence bar and escalates, one is planned by System Two
  and delegated. Scenarios map to Danav_Master_Spec.md features #10, #30, #44,
  #45, #75 and #98.

  The demo lives in a scale canvas, so it always has one layout. Wire paths and
  the token position are measured once per run and converted back to the
  canvas's own coordinates, so they stay correct at any scale. All appearance
  rules live in styles/components/stage.css.
*/
(function () {
  'use strict';

  var stage = document.getElementById('router-stage');
  if (!stage) {
    return;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var CANCEL = { cancelled: true };

  var body = document.getElementById('stage-body');
  var wiresSvg = document.getElementById('stage-wires');
  var token = document.getElementById('stage-token');
  var routerEl = document.getElementById('router-node');
  var toggle = document.getElementById('stage-toggle');
  var live = document.getElementById('stage-live');
  var resultEl = document.getElementById('stage-result');
  var resultText = document.getElementById('result-text');
  var resultChip = document.getElementById('result-chip');
  var out = {
    needs: document.getElementById('ro-needs'),
    path: document.getElementById('ro-path'),
    budget: document.getElementById('ro-budget'),
    now: document.getElementById('ro-now')
  };
  var requestButtons = [].slice.call(stage.querySelectorAll('.request'));
  var levelEls = [].slice.call(stage.querySelectorAll('.level'));

  var motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');

  var LEVEL_NAMES = ['L0 Rust tool', 'L1 System One', 'L2 cheap lane', 'L3 frontier lane'];
  var STATUS = { idle: 'Idle', active: 'Running', checking: 'Checking', passed: 'Passed', failed: 'Not resolved' };

  /* Each step: [kind, ...args]. Kinds: go, work, verify, mark, now, back, final */
  var SCENARIOS = [
    { needs: 'AST symbol edit, no reasoning', path: 'Rust tool, no model call', budget: 'Not needed',
      result: 'edit_symbol applied, Tree-sitter syntax check passed. No model call (#44).',
      steps: [['go', 0], ['work', 0, 500], ['verify', 0, true]] },
    { needs: 'Risk gate on a proposed diff', path: 'System One Score gate', budget: 'Score below 6.5 (blast radius)',
      result: 'Score rubric passed in under 50 ms, so no adversarial review needed (#98).',
      steps: [['go', 1], ['work', 1, 900], ['verify', 1, true]] },
    { needs: 'Diagnose a failing test', path: 'System One, escalate if needed', budget: 'Choice p below 0.80, escalate',
      result: 'Stack trace resolved to AST symbols, corrective brief injected, test passes (#41, #75).',
      steps: [['go', 1], ['work', 1, 800], ['verify', 1, false], ['now', 'Below 0.80. Escalating.'], ['back', 1], ['go', 2], ['work', 2, 1000], ['verify', 2, true]] },
    { needs: 'Multi-file refactor', path: 'Plan, then delegate', budget: 'Plan on L3, subtasks on L1/L0',
      result: 'Plan from System Two, subtasks on cheaper lanes, impact_check before edits (#10, #45).',
      steps: [['go', 3], ['work', 3, 900], ['mark', 3, 'passed', 'Plan ready'], ['back', 3], ['now', 'Delegating the first subtask'], ['go', 1], ['work', 1, 700], ['verify', 1, true], ['back', 1], ['now', 'Delegating the second subtask'], ['go', 0], ['work', 0, 500], ['verify', 0, true], ['back', 0], ['final']] }
  ];

  var RESTING_INDEX = 2;

  var reqWires = [];
  var levelWires = [];
  var runId = 0;
  var running = false;
  var current = null;
  var currentAnim = null;
  var lastIndex = RESTING_INDEX;
  var paused = false;
  var loopId = 0;
  var loopTimer = null;

  /* ---------- small helpers ---------- */

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function guard(ctx) {
    if (ctx.id !== runId) {
      throw CANCEL;
    }
  }

  async function pause(ms, ctx) {
    if (!ctx.instant) {
      await sleep(ms);
    }
    guard(ctx);
  }

  /* ---------- text auto-scaler: scales font-size down pixel-by-pixel without breaking observers ---------- */

  var autoScaleTargets = [].slice.call(stage.querySelectorAll(
    '.request__text, .level__name, .level__note, .router__row dd, .stage__result-text, .stage__col-title, #stage-title'
  ));

  var measureCanvas = document.createElement('canvas');
  var measureCtx = measureCanvas.getContext('2d');

  function getNaturalTextWidth(el, baseSize) {
    var computed = window.getComputedStyle(el);
    var weight = computed.fontWeight || '400';
    var family = computed.fontFamily || 'sans-serif';
    measureCtx.font = weight + ' ' + baseSize + 'px ' + family;
    return measureCtx.measureText((el.textContent || '').trim()).width;
  }

  function scaleElementToFit(el) {
    if (!el) { return; }
    if (!el._baseFontSize) {
      var computed = window.getComputedStyle(el);
      el._baseFontSize = parseFloat(computed.fontSize) || 14;
    }

    var available = el.clientWidth;
    if (available <= 0) { return; }

    var naturalWidth = getNaturalTextWidth(el, el._baseFontSize);

    // Only scale down if text hits the pixel edge of available space (pixel-by-pixel fit)
    if (naturalWidth > available) {
      var ratio = available / naturalWidth;
      var scaledSize = Math.max(9, el._baseFontSize * ratio);
      el.style.fontSize = scaledSize.toFixed(2) + 'px';
    } else if (el.style.fontSize) {
      el.style.fontSize = '';
    }
  }

  function autoScaleAllTexts() {
    autoScaleTargets.forEach(scaleElementToFit);
    if (out) {
      Object.keys(out).forEach(function (k) {
        if (out[k]) { scaleElementToFit(out[k]); }
      });
    }
    if (resultText) {
      scaleElementToFit(resultText);
    }
  }

  /* ---------- state writers ---------- */

  function setRouter(state) {
    routerEl.setAttribute('data-state', state);
  }

  function setReadout(values) {
    Object.keys(values).forEach(function (key) {
      out[key].textContent = values[key];
      scaleElementToFit(out[key]);
    });
  }

  function setLevel(index, state, label) {
    var el = levelEls[index];
    el.setAttribute('data-state', state);
    el.querySelector('.level__status').textContent = label || STATUS[state];
    scaleElementToFit(el.querySelector('.level__name'));
  }

  function setResult(state, chip, text) {
    resultEl.setAttribute('data-state', state);
    resultChip.textContent = chip;
    resultText.textContent = text;
    scaleElementToFit(resultText);
  }

  function selectRequest(index) {
    requestButtons.forEach(function (btn, i) {
      if (i === index) {
        btn.setAttribute('aria-current', 'true');
      } else {
        btn.removeAttribute('aria-current');
      }
    });
  }

  function activateWire(wire) {
    if (!wire) { return; }
    wire.classList.add('is-active');
    wiresSvg.appendChild(wire);
  }

  function resetVisuals() {
    levelEls.forEach(function (_, i) { setLevel(i, 'idle'); });
    reqWires.concat(levelWires).forEach(function (w) { w.classList.remove('is-active'); });
    setRouter('idle');
    token.setAttribute('data-visible', 'false');
  }

  /* ---------- geometry ---------- */

  function makePath(points) {
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'wire');
    path.setAttribute('fill', 'none');
    path.setAttribute('d', 'M' + points.map(function (p) { return p[0] + ' ' + p[1]; }).join(' L'));
    path.points = points;
    return path;
  }

  function buildGeometry() {
    autoScaleAllTexts();
    var origin = body.getBoundingClientRect();
    /* The canvas is scaled as a whole: divide measured sizes by the scale to
       get the canvas's own coordinates. */
    var scale = origin.width / body.offsetWidth || 1;

    function box(el) {
      var r = el.getBoundingClientRect();
      return {
        l: (r.left - origin.left) / scale,
        r: (r.right - origin.left) / scale,
        y: (r.top - origin.top + r.height / 2) / scale
      };
    }

    while (wiresSvg.firstChild) {
      wiresSvg.removeChild(wiresSvg.firstChild);
    }
    reqWires = [];
    levelWires = [];

    var router = box(routerEl);

    requestButtons.forEach(function (btn) {
      var q = box(btn);
      var mx = (q.r + router.l) / 2;
      reqWires.push(makePath([[q.r, q.y], [mx, q.y], [mx, router.y], [router.l, router.y]]));
    });

    levelEls.forEach(function (el) {
      var lv = box(el);
      var mx = (router.r + lv.l) / 2;
      levelWires.push(makePath([[router.r, router.y], [mx, router.y], [mx, lv.y], [lv.l, lv.y]]));
    });

    reqWires.concat(levelWires).forEach(function (w) { wiresSvg.appendChild(w); });
  }

  function place(point) {
    var half = token.offsetWidth / 2;
    token.style.transform = 'translate(' + (point[0] - half) + 'px,' + (point[1] - half) + 'px)';
  }

  async function travel(points, ctx) {
    if (ctx.instant) { return; }
    var half = token.offsetWidth / 2;
    function at(p) { return 'translate(' + (p[0] - half) + 'px,' + (p[1] - half) + 'px)'; }
    place(points[0]);
    token.setAttribute('data-visible', 'true');
    for (var i = 1; i < points.length; i += 1) {
      var from = points[i - 1];
      var to = points[i];
      var length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      if (length < 1) { continue; }
      var anim = token.animate(
        [{ transform: at(from) }, { transform: at(to) }],
        { duration: clamp(length / 0.55, 220, 800), easing: 'linear', fill: 'forwards' }
      );
      currentAnim = anim;
      try {
        await anim.finished;
      } catch (error) {
        throw CANCEL;
      }
      guard(ctx);
      place(to);
      anim.cancel();
    }
  }

  /* ---------- scenario runner ---------- */

  async function performStep(step, ctx) {
    var kind = step[0];
    var n = step[1];

    if (kind === 'go') {
      setRouter('routing');
      setReadout({ now: 'Sending to ' + LEVEL_NAMES[n] });
      activateWire(levelWires[n]);
      await travel(levelWires[n].points, ctx);
      guard(ctx);
      setLevel(n, 'active');
      setReadout({ now: LEVEL_NAMES[n] + ' is working' });
    } else if (kind === 'work') {
      await pause(step[2], ctx);
    } else if (kind === 'verify') {
      setLevel(n, 'checking');
      setReadout({ now: 'Checking the output' });
      await pause(600, ctx);
      setLevel(n, step[2] ? 'passed' : 'failed');
      if (!step[2]) {
        setResult('working', 'Escalating', 'Not resolved at ' + LEVEL_NAMES[n] + '. Trying a more capable lane.');
      }
    } else if (kind === 'mark') {
      setLevel(n, step[2], step[3]);
    } else if (kind === 'now') {
      setReadout({ now: step[1] });
      await pause(450, ctx);
    } else if (kind === 'back') {
      setReadout({ now: 'Back at the router' });
      await travel(levelWires[n].points.slice().reverse(), ctx);
      guard(ctx);
    } else if (kind === 'final') {
      setRouter('thinking');
      setReadout({ now: 'Checking the combined result' });
      await pause(800, ctx);
    }
  }

  async function runScenario(index, options) {
    var ctx = { id: ++runId, instant: !!options.instant || motionMedia.matches };
    var scenario = SCENARIOS[index];
    running = true;
    lastIndex = index;
    if (currentAnim) { currentAnim.cancel(); }

    try {
      buildGeometry();
      resetVisuals();
      selectRequest(index);
      setResult('working', 'Working', 'Routing the request.');
      setReadout({ needs: 'Reading the request', path: 'Not decided', budget: 'Not decided', now: 'Classifying' });
      setRouter('thinking');

      activateWire(reqWires[index]);
      await travel(reqWires[index].points, ctx);
      guard(ctx);
      await pause(650, ctx);

      setReadout({ needs: scenario.needs, path: scenario.path, budget: scenario.budget, now: 'Routing' });
      setRouter('routing');

      for (var i = 0; i < scenario.steps.length; i += 1) {
        await performStep(scenario.steps[i], ctx);
      }

      setRouter('done');
      setReadout({ now: 'Done' });
      setResult('done', 'Verified', scenario.result);
      token.setAttribute('data-visible', 'false');
      if (options.announce) {
        live.textContent = scenario.result;
      }
      return true;
    } catch (error) {
      if (error !== CANCEL) { throw error; }
      return false;
    } finally {
      if (ctx.id === runId) { running = false; }
    }
  }

  function start(index, options) {
    current = runScenario(index, options || {});
    return current;
  }

  /* ---------- autoplay ---------- */

  async function loop(startIndex) {
    var mine = ++loopId;
    var index = startIndex;
    while (!paused && mine === loopId) {
      var finished = await start(index);
      if (!finished || mine !== loopId) { return; }
      await sleep(2200);
      index = (index + 1) % SCENARIOS.length;
    }
  }

  function scheduleLoop(delay) {
    clearTimeout(loopTimer);
    if (paused || motionMedia.matches) { return; }
    loopTimer = setTimeout(function () {
      loop((lastIndex + 1) % SCENARIOS.length);
    }, delay);
  }

  function updateToggle() {
    toggle.hidden = motionMedia.matches;
    toggle.textContent = paused ? 'Play demo' : 'Pause demo';
  }

  toggle.addEventListener('click', async function () {
    if (paused) {
      paused = false;
      updateToggle();
      if (current) {
        try { await current; } catch (error) { /* ignore */ }
      }
      scheduleLoop(300);
    } else {
      paused = true;
      loopId += 1;
      clearTimeout(loopTimer);
      updateToggle();
    }
  });

  requestButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      paused = true;
      loopId += 1;
      clearTimeout(loopTimer);
      updateToggle();
      start(Number(btn.getAttribute('data-scenario')), { announce: true });
    });
  });

  if (motionMedia.addEventListener) {
    motionMedia.addEventListener('change', function () {
      updateToggle();
      if (motionMedia.matches) {
        loopId += 1;
        clearTimeout(loopTimer);
      } else {
        scheduleLoop(800);
      }
    });
  }

  var scheduleGeomTimer = 0;
  function scheduleAutoScaleAndGeometry() {
    if (scheduleGeomTimer) { return; }
    scheduleGeomTimer = window.requestAnimationFrame(function () {
      scheduleGeomTimer = 0;
      autoScaleAllTexts();
      buildGeometry();
    });
  }

  window.addEventListener('resize', scheduleAutoScaleAndGeometry);

  if (window.ResizeObserver) {
    var stageRo = new ResizeObserver(function () {
      scheduleAutoScaleAndGeometry();
    });
    stageRo.observe(stage);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      scheduleAutoScaleAndGeometry();
      if (!running) { start(lastIndex, { instant: true }); }
    });
  }

  /* ---------- first frame ---------- */

  updateToggle();
  autoScaleAllTexts();
  start(RESTING_INDEX, { instant: true });
  scheduleLoop(1800);
})();

/* page.js: topology tabs, scroll rail on step lists, expand-all for feature groups */
(function () {
  'use strict';
  var MODES = {
    desktop: { siteA: 'Native desktop app', siteB: 'Embedded on this machine', link: 'Tauri IPC', name: 'Danav Desktop', role: 'Application',
      detail: 'Tauri v2 app that embeds danav-daemon directly, with system tray hooks, global shortcuts and accessibility permissions.',
      list: ['Agent Studio and DAG Builder', 'Memory Graph and Trace Replay', 'BYO-Sub Pool and Budget Router', 'Escalation Inbox'],
      caption: 'Native Desktop Mode: Tauri embeds danav-daemon into the OS binary and talks to it over zero-copy IPC commands.' },
    web: { siteA: 'Your browser', siteB: 'danavd on this machine', link: 'REST and WebSocket on 127.0.0.1:7420', name: 'Control Center', role: 'Web UI',
      detail: 'The same frontend bundle, served as static files by danavd with the danav ui command.',
      list: ['Visual Memory Graph browser', 'Trace Replay Viewer', 'Skill manager and review queue', 'Live RAM and disk cleanup panel'],
      caption: 'Headless Server Mode: danavd serves the compiled frontend over WebSockets and REST at localhost:7420.' },
    cli: { siteA: 'Your terminals and editors', siteB: 'danavd on this machine', link: 'MCP (stdio / SSE) and API proxy', name: 'CLIs and IDEs', role: 'Clients',
      detail: 'Claude Code, Cursor, Gemini CLI, Codex and VS Code read and write one brain through MCP or the OpenAI/Anthropic-compatible proxy.',
      list: ['Claude Code', 'Cursor', 'Gemini CLI and Codex', 'VS Code, Neovim and Zed'],
      caption: 'Every CLI, IDE and agent shares a single local relational memory graph and AST index.' }
  };
  var tabs = [].slice.call(document.querySelectorAll('.segmented__tab'));
  var topology = document.getElementById('topology');
  function $(id) { return document.getElementById(id); }
  function selectMode(mode, moveFocus) {
    var c = MODES[mode];
    if (!c || !topology) { return; }
    tabs.forEach(function (tab) {
      var on = tab.getAttribute('data-mode') === mode;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      if (on) { topology.setAttribute('aria-labelledby', tab.id); if (moveFocus) { tab.focus(); } }
    });
    topology.setAttribute('data-mode', mode);
    $('site-a').textContent = c.siteA; $('site-b').textContent = c.siteB;
    $('link-label').textContent = c.link; $('topology-caption').textContent = c.caption;
    $('a-name').textContent = c.name; $('a-role').textContent = c.role; $('a-detail').textContent = c.detail;
    $('a-list').innerHTML = c.list.map(function (t) { return '<li>' + t + '</li>'; }).join('');
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { selectMode(tab.getAttribute('data-mode'), false); });
    tab.addEventListener('keydown', function (e) {
      var n = null;
      if (e.key === 'ArrowRight') { n = (index + 1) % tabs.length; }
      if (e.key === 'ArrowLeft') { n = (index - 1 + tabs.length) % tabs.length; }
      if (e.key === 'Home') { n = 0; }
      if (e.key === 'End') { n = tabs.length - 1; }
      if (n !== null) { e.preventDefault(); selectMode(tabs[n].getAttribute('data-mode'), true); }
    });
  });

  var steps = [].slice.call(document.querySelectorAll('.step'));
  var ticking = false;
  function updateSteps() {
    ticking = false;
    var line = window.innerHeight * 0.6;
    steps.forEach(function (s) {
      var m = s.querySelector('.step__marker').getBoundingClientRect();
      s.classList.toggle('is-passed', m.top + m.height / 2 < line);
    });
  }
  function req() { if (!ticking) { ticking = true; window.requestAnimationFrame(updateSteps); } }
  if (steps.length) {
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    updateSteps();
  }

  var tog = $('features-toggle');
  if (tog) {
    var groups = [].slice.call(document.querySelectorAll('.feature-group'));
    tog.addEventListener('click', function () {
      var open = tog.getAttribute('data-open') !== 'true';
      groups.forEach(function (g) { g.open = open; });
      tog.setAttribute('data-open', open ? 'true' : 'false');
      tog.textContent = open ? 'Collapse all' : 'Expand all';
    });
  }
})();


/*
  motion.js
  Scroll reveal, section-aware navigation underline. Everything degrades to a
  static page without IntersectionObserver or when motion is reduced.
*/
(function () {
  'use strict';

  var targets = [].slice.call(document.querySelectorAll('[data-reveal], [data-reveal-group]'));

  targets.forEach(function (group) {
    if (group.hasAttribute('data-reveal-group')) {
      [].slice.call(group.querySelectorAll('[data-reveal-item]')).forEach(function (item, index) {
        item.style.setProperty('--reveal-index', index);
      });
    }
  });

  function show(el) {
    el.classList.add('is-in');
  }

  if (!('IntersectionObserver' in window)) {
    targets.forEach(show);
  } else {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          show(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
    targets.forEach(function (el) { observer.observe(el); });
  }
})();

(function () {
  'use strict';

  var nav = document.querySelector('.site-nav__links');
  var bar = document.querySelector('.site-nav');
  var navToggle = document.getElementById('nav-toggle');
  if (!nav || !bar) {
    return;
  }

  var links = [].slice.call(nav.querySelectorAll('a'));
  var byKey = {};
  links.forEach(function (a) {
    byKey[a.getAttribute('href').slice(1)] = a;
  });

  if (navToggle) {
    function closeNav() {
      bar.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'Open navigation menu');
    }

    navToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = bar.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      navToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
    });

    links.forEach(function (a) {
      a.addEventListener('click', function () {
        closeNav();
      });
    });

    document.addEventListener('click', function (e) {
      if (bar.classList.contains('is-open') && !bar.contains(e.target)) {
        closeNav();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && bar.classList.contains('is-open')) {
        closeNav();
        navToggle.focus();
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth >= 768 && bar.classList.contains('is-open')) {
        closeNav();
      }
    });
  }

  var blocks = [].slice.call(document.querySelectorAll('main > section, main > .band'));
  var current = null;
  var ticking = false;
  var ready = false;

  function keyOf(el) {
    var key = el.getAttribute('data-nav-group') || el.id;
    return byKey[key] ? key : null;
  }

  function place() {
    var link = current && byKey[current];
    if (!link || window.innerWidth < 768) {
      nav.classList.remove('has-active');
      return;
    }
    var n = nav.getBoundingClientRect();
    var r = link.getBoundingClientRect();
    nav.style.setProperty('--indicator-x', (r.left - n.left) + 'px');
    nav.style.setProperty('--indicator-y', (r.bottom - n.top - 2) + 'px');
    nav.style.setProperty('--indicator-w', r.width + 'px');
    nav.classList.add('has-active');
    if (!ready) {
      ready = true;
      window.requestAnimationFrame(function () { nav.classList.add('is-ready'); });
    }
  }

  function update() {
    ticking = false;
    var line = bar.offsetHeight + window.innerHeight * 0.3;
    var key = null;
    blocks.forEach(function (block) {
      if (block.getBoundingClientRect().top <= line) {
        key = keyOf(block);
      }
    });
    if (key !== current) {
      current = key;
      links.forEach(function (a) {
        if (key && byKey[key] === a) {
          a.setAttribute('aria-current', 'location');
        } else {
          a.removeAttribute('aria-current');
        }
      });
    }
    place();
  }

  function queue() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(queue);
  }
  update();
})();

/* view-switch.js: Human vs Agent tab switching */
(function () {
  'use strict';

  var tabHuman = document.getElementById('tab-human');
  var tabAgent = document.getElementById('tab-agent');
  var copyBtn = document.getElementById('agent-copy-btn');
  var copyText = document.getElementById('agent-copy-text');
  var downloadBtn = document.getElementById('agent-download-btn');
  var rawSpec = document.getElementById('agent-raw-spec');

  if (!tabHuman || !tabAgent) {
    return;
  }

  function setView(mode, updateHistory) {
    var isAgent = mode === 'agent';
    document.body.setAttribute('data-view', isAgent ? 'agent' : 'human');

    tabHuman.setAttribute('aria-selected', isAgent ? 'false' : 'true');
    tabHuman.classList.toggle('is-active', !isAgent);

    tabAgent.setAttribute('aria-selected', isAgent ? 'true' : 'false');
    tabAgent.classList.toggle('is-active', isAgent);

    if (updateHistory) {
      try {
        if (isAgent) {
          window.location.hash = 'agent';
        } else if (window.location.hash === '#agent') {
          history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      } catch (e) { /* ignore */ }
    }

    if (!isAgent) {
      window.requestAnimationFrame(function () {
        window.dispatchEvent(new Event('resize'));
      });
    }
  }

  tabHuman.addEventListener('click', function () {
    setView('human', true);
  });

  tabAgent.addEventListener('click', function () {
    setView('agent', true);
  });

  if (copyBtn && rawSpec) {
    copyBtn.addEventListener('click', function () {
      var text = rawSpec.textContent || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          if (copyText) {
            var orig = copyText.textContent;
            copyText.textContent = 'Copied!';
            copyBtn.classList.add('agent-view__btn--active');
            setTimeout(function () {
              copyText.textContent = orig;
              copyBtn.classList.remove('agent-view__btn--active');
            }, 2200);
          }
        });
      }
    });
  }

  if (downloadBtn && rawSpec) {
    downloadBtn.addEventListener('click', function () {
      var text = rawSpec.textContent || '';
      var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'danav-master-spec.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }

  // Initial state check
  var params = new URLSearchParams(window.location.search);
  if (window.location.hash === '#agent' || params.get('view') === 'agent') {
    setView('agent', false);
  }
})();

