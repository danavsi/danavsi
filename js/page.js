/*
  page.js
  Two small behaviors: the topology tabs (where the server runs) and the
  scroll-driven rail on the router's six decisions.
*/
(function () {
  'use strict';

  /* ---------- Topology tabs ---------- */

  var MODES = {
    same: {
      siteA: 'On this machine',
      siteB: 'On this machine',
      link: 'Localhost',
      caption: 'Client and server run side by side. Models run on hardware you control.'
    },
    lan: {
      siteA: 'Your machine',
      siteB: 'Another machine on your network',
      link: 'Endpoint and API key',
      caption: 'Put the models on a stronger machine and connect from any client with the server endpoint and an API key.'
    },
    remote: {
      siteA: 'Your machine',
      siteB: 'Remote server',
      link: 'Endpoint and API key',
      caption: 'A remote server works the same way. Each client gets its own generated API key with scoped permissions.'
    }
  };

  var tabs = [].slice.call(document.querySelectorAll('.segmented__tab'));
  var topology = document.getElementById('topology');
  var siteA = document.getElementById('site-a');
  var siteB = document.getElementById('site-b');
  var linkLabel = document.getElementById('link-label');
  var caption = document.getElementById('topology-caption');

  function selectMode(mode, moveFocus) {
    var config = MODES[mode];
    if (!config || !topology) { return; }

    tabs.forEach(function (tab) {
      var active = tab.getAttribute('data-mode') === mode;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
      if (active) {
        topology.setAttribute('aria-labelledby', tab.id);
        if (moveFocus) { tab.focus(); }
      }
    });

    topology.setAttribute('data-mode', mode);
    siteA.textContent = config.siteA;
    siteB.textContent = config.siteB;
    linkLabel.textContent = config.link;
    caption.textContent = config.caption;
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () {
      selectMode(tab.getAttribute('data-mode'), false);
    });

    tab.addEventListener('keydown', function (event) {
      var next = null;
      if (event.key === 'ArrowRight') { next = (index + 1) % tabs.length; }
      if (event.key === 'ArrowLeft') { next = (index - 1 + tabs.length) % tabs.length; }
      if (event.key === 'Home') { next = 0; }
      if (event.key === 'End') { next = tabs.length - 1; }
      if (next !== null) {
        event.preventDefault();
        selectMode(tabs[next].getAttribute('data-mode'), true);
      }
    });
  });

  /* ---------- Scroll rail on the six decisions ---------- */

  var steps = [].slice.call(document.querySelectorAll('.step'));
  var ticking = false;

  function updateSteps() {
    ticking = false;
    var line = window.innerHeight * 0.6;
    steps.forEach(function (step) {
      var marker = step.querySelector('.step__marker').getBoundingClientRect();
      step.classList.toggle('is-passed', marker.top + marker.height / 2 < line);
    });
  }

  function requestUpdate() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(updateSteps);
    }
  }

  if (steps.length) {
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    updateSteps();
  }
})();
