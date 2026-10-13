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
    var designWidth = canvas.offsetWidth;
    if (!designWidth) {
      return;
    }
    var scale = frame.clientWidth / designWidth;
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
