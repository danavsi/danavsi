/*
  router-stage.js
  The routing demo in the hero. Four example requests run through the router
  and land on the smallest level that can do the job. One of them fails
  verification and escalates, one is planned and delegated.

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

  var LEVEL_NAMES = ['L0 tool', 'L1 small model', 'L2 medium model', 'L3 large model'];
  var STATUS = { idle: 'Idle', active: 'Running', checking: 'Checking', passed: 'Passed', failed: 'Not resolved' };

  /* Each step: [kind, ...args]. Kinds: go, work, verify, mark, now, back, final */
  var SCENARIOS = [
    {
      needs: 'Code edit, no reasoning',
      path: 'Tool, no model call',
      budget: 'None',
      result: 'Renamed across the project. Type check passed.',
      steps: [['go', 0], ['work', 0, 500], ['verify', 0, true]]
    },
    {
      needs: 'Write a unit test',
      path: 'Small model',
      budget: 'Low',
      result: 'Test written and passing.',
      steps: [['go', 1], ['work', 1, 900], ['verify', 1, true]]
    },
    {
      needs: 'Diagnose a failing build',
      path: 'Small, escalate if needed',
      budget: 'Low, may grow',
      result: 'Cause found and fixed. The build passes on rerun.',
      steps: [
        ['go', 1], ['work', 1, 800], ['verify', 1, false],
        ['now', 'Not resolved. Escalating.'], ['back', 1],
        ['go', 2], ['work', 2, 1000], ['verify', 2, true]
      ]
    },
    {
      needs: 'Multi-step change',
      path: 'Plan, then delegate',
      budget: 'High plan, low subtasks',
      result: 'Plan written, subtasks done by smaller levels, combined result checked.',
      steps: [
        ['go', 3], ['work', 3, 900], ['mark', 3, 'passed', 'Plan ready'], ['back', 3],
        ['now', 'Delegating the first subtask'], ['go', 1], ['work', 1, 700], ['verify', 1, true], ['back', 1],
        ['now', 'Delegating the second subtask'], ['go', 0], ['work', 0, 500], ['verify', 0, true], ['back', 0],
        ['final']
      ]
    }
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

  /* ---------- state writers ---------- */

  function setRouter(state) {
    routerEl.setAttribute('data-state', state);
  }

  function setReadout(values) {
    Object.keys(values).forEach(function (key) {
      out[key].textContent = values[key];
    });
  }

  function setLevel(index, state, label) {
    var el = levelEls[index];
    el.setAttribute('data-state', state);
    el.querySelector('.level__status').textContent = label || STATUS[state];
  }

  function setResult(state, chip, text) {
    resultEl.setAttribute('data-state', state);
    resultChip.textContent = chip;
    resultText.textContent = text;
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
        setResult('working', 'Escalating', 'Not resolved at ' + LEVEL_NAMES[n] + '. Trying a more capable level.');
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
      setReadout({ now: 'Verified, done' });
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

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      if (!running) { start(lastIndex, { instant: true }); }
    });
  }

  /* ---------- first frame ---------- */

  updateToggle();
  start(RESTING_INDEX, { instant: true });
  scheduleLoop(1800);
})();
