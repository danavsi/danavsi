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
