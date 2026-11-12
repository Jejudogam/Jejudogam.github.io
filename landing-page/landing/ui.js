/*
 * Page shell UI for landing.html: header theme, progress bar, section dots, stage-aligned links, main CTA and the band colour outside the canvas.
 * Every visual state is a function of window.__landing.progress (0~100), so scrolling back gives the same screen.
 * Static page (reduced motion, no stage): dots and progress follow the plain scroll position instead.
 */
(function () {
  "use strict";
  var root = document.documentElement;
  var L = window.__landing;
  if (!L) return; // no driver: the static HTML page stands on its own

  var RED = "#FD312E";
  // Canvas slots the scenes leave empty (brief section 4). left: the x is the left edge, otherwise the centre.
  var SLOTS = {
    filter: { landscape: { x: 144, y: 860, left: true }, portrait: { x: 540, y: 1560 }, show: [[59, 65]], theme: "dark" },
    size: { landscape: { x: 144, y: 900, left: true }, portrait: { x: 540, y: 1740 }, show: [[74, 77], [79.5, 82.5]], theme: "light" },
    cta: { landscape: { x: 700, y: 830 }, portrait: { x: 540, y: 1040 } }
  };
  var LINK_FADE = 0.5;       // % of progress for a stage link to fade in or out
  var CTA_FROM = 93, CTA_TO = 94;

  var topbar = document.getElementById("topbar");
  var bar = document.getElementById("progress-bar");
  var ctaSmall = document.getElementById("cta-small");
  var dots = document.getElementById("dots");
  var dotLinks = Array.prototype.slice.call(dots.querySelectorAll("a[data-sec]"));
  var dotsCurrent = document.getElementById("dots-current");
  var info = document.getElementById("info");
  var links = {
    filter: document.getElementById("link-filter"),
    size: document.getElementById("link-size")
  };
  var ctaSlot = document.getElementById("cta-slot");
  var sections = L.sections;

  var state = { p: 0, s: 1, theme: "", dotSec: -1, rect: null, smallHidden: null };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function isMotion() { return root.classList.contains("is-motion"); }
  function hexRgb(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function themeOf(rgb, hex) {
    if (hex && hex.toUpperCase() === RED) return "red";
    var lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return lum > 0.5 ? "light" : "dark";
  }

  // The band colour is decided by the driver (window.__landing.band, also --stage-bg); the shell only reads its theme.
  function bandNow() {
    var c = L.band || "#0A0A0A";
    var m = c.match(/\d+/g);
    var rgb = c.charAt(0) === "#" ? hexRgb(c) : [+m[0], +m[1], +m[2]];
    return { css: c, theme: themeOf(rgb, c.charAt(0) === "#" ? c : "") };
  }

  function windowOpacity(p, wins, fade) {
    var o = 0;
    for (var i = 0; i < wins.length; i++) {
      var a = wins[i][0], b = wins[i][1];
      var v = p < a ? (p - (a - fade)) / fade : p > b ? ((b + fade) - p) / fade : 1;
      o = Math.max(o, clamp(v, 0, 1));
    }
    return o;
  }

  // Spring-like pop: 0.6 -> 1.0 with a small overshoot (back.out).
  function backOut(k) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); }

  function setDots(sec) {
    if (sec === state.dotSec) return;
    state.dotSec = sec;
    dotLinks.forEach(function (a) {
      if (+a.getAttribute("data-sec") === sec) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
    var label = sec >= 2 ? sections[sec - 1].label : "";
    if (dotsCurrent.textContent !== label) dotsCurrent.textContent = label;
  }

  function placeOverlays() {
    var r = state.rect;
    if (!r) return;
    var o = r.orientation === "portrait" ? "portrait" : "landscape";
    ["filter", "size", "cta"].forEach(function (k) {
      var el = k === "cta" ? ctaSlot : links[k];
      var slot = SLOTS[k][o];
      el.style.setProperty("--x", (r.left + slot.x * r.scale).toFixed(1) + "px");
      el.style.setProperty("--y", (r.top + slot.y * r.scale).toFixed(1) + "px");
      el.style.setProperty("--s", r.scale.toFixed(4));
      if (k !== "cta") el.style.setProperty("--tx", slot.left ? "0px" : "-50%");
    });
  }

  // Motion page: everything below follows progress p.
  function update(p, s) {
    state.p = p;
    state.s = s;
    bar.style.setProperty("--p", (p / 100).toFixed(4));

    var band = bandNow();

    // Info band under the header (after the film): header turns light; covered CTA brings the small button back.
    var infoTop = info.getBoundingClientRect().top;
    var headerBottom = topbar.getBoundingClientRect().bottom;
    var theme = infoTop <= headerBottom - 28 ? "light" : band.theme;
    if (theme !== state.theme) { state.theme = theme; topbar.setAttribute("data-theme", theme); }
    dots.setAttribute("data-theme", band.theme);
    dots.classList.toggle("is-away", infoTop < window.innerHeight - 1);
    setDots(s);

    // Stage links: visible and focusable only in their reading windows.
    ["filter", "size"].forEach(function (k) {
      var el = links[k];
      var o = windowOpacity(p, SLOTS[k].show, LINK_FADE);
      el.style.setProperty("--o", o.toFixed(3));
      el.classList.toggle("is-on", o > 0);
      el.setAttribute("data-theme", SLOTS[k].theme);
    });

    // Main CTA: pops 93~94, settled 94~100. Scrolling back hides it again; at exactly 93 it is transparent, so it is off.
    var k = clamp((p - CTA_FROM) / (CTA_TO - CTA_FROM), 0, 1);
    var on = p > CTA_FROM;
    ctaSlot.style.setProperty("--pop", on ? (0.6 + 0.4 * backOut(k)).toFixed(4) : "0.6");
    ctaSlot.style.setProperty("--o", on ? Math.min(1, k * 2.5).toFixed(3) : "0");
    ctaSlot.classList.toggle("is-on", on);

    var ctaCovered = infoTop < (state.rect ? state.rect.top + SLOTS.cta[state.rect.orientation === "portrait" ? "portrait" : "landscape"].y * state.rect.scale + 40 : 0);
    var hideSmall = on && !ctaCovered;
    if (hideSmall !== state.smallHidden) { state.smallHidden = hideSmall; ctaSmall.classList.toggle("is-hidden", hideSmall); }
  }

  // Static page: the plain scroll position stands in for the progress.
  function updateStatic() {
    var max = Math.max(1, root.scrollHeight - window.innerHeight);
    bar.style.setProperty("--p", clamp(window.scrollY / max, 0, 1).toFixed(4));
    // The state is kept in step so a return to the motion page (a phone turned upright) repaints the header.
    state.theme = "light";
    topbar.setAttribute("data-theme", "light");
    var mid = window.innerHeight * 0.4, sec = 1;
    for (var i = 0; i < sections.length; i++) {
      var el = document.getElementById(sections[i].hash.slice(1));
      if (el && el.getBoundingClientRect().top <= mid) sec = i + 1;
    }
    var hex = sections[sec - 1].bg;
    dots.setAttribute("data-theme", themeOf(hexRgb(hex), hex));
    setDots(sec);
    state.smallHidden = false;
    ctaSmall.classList.remove("is-hidden");
  }

  var queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () {
      queued = false;
      if (isMotion()) update(L.progress, L.section); else updateStatic();
    });
  }

  L.onProgress(function (p, s) { if (isMotion()) update(p, s); else updateStatic(); });
  L.onStage(function (r) { state.rect = r; placeOverlays(); if (isMotion()) update(L.progress, L.section); });
  // The driver scrolls the back-to-top button to the top; the address drops its old #section with it.
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-scroll-top]") && location.hash) history.replaceState(null, "", location.pathname + location.search);
  });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  window.addEventListener("load", onScroll);
  onScroll();
})();
