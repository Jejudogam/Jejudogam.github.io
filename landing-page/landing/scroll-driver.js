/*
 * Scroll driver for landing.html.
 * Loads index.html (the HyperFrames root composition, 100 s) into the stage iframe with the local runtime first, as the HyperFrames preview does.
 * The scroll position seeks it.
 *
 * Mapping: progress (0~100) = timeline seconds = (scrollY - top of #film) / (height of #film - 100svh) * 100.
 * With #film at 1100svh that is exactly 1000svh of scroll. Without #film: 1000svh from the top of the page.
 * Opening at the top plays 0 -> 1 s once in about 1.1 s; after that the film never shows less than 1 s.
 * Opening with #detect #sort #check #filter #size #end jumps to 10.5 30.5 50 59 74 95.
 *
 * Canvas: 1920x1080 when the stage box is landscape, 1080x1920 when it is portrait (window.__orient in the stage).
 * The canvas covers the content box of #stage when their ratios differ by 1.06 or less, otherwise it is fitted whole (contain); the padding is left free.
 * A change of orientation reloads the stage with the other canvas and seeks it to the same progress.
 *
 * Contract with the page shell (landing.html, landing/ui.js):
 *   window.__landing = { progress, section, sections, orientation, ready,
 *                        onProgress(cb), seekToPercent(percent, { smooth }), stageRect(), onStage(cb) }
 * Reduced motion or a failed load sets html.is-static, and the plain HTML sections become the page.
 */
(function () {
  "use strict";
  var root = document.documentElement;
  var stage = document.getElementById("stage");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var TOTAL = 100;
  var EPS = 1 / 120;         // a clip shows over [start, end): never seek exactly to the end
  var INTRO_TO = 1;          // first screen: 0 -> 1 s ...
  var INTRO_MS = 1100;       // ... in 1.1 s, once
  var ORIENT_DELAY = 220;    // ms of stable size before the stage reloads for a new orientation

  // start/end: the section's own range without overlap (s3's host starts at 15 under s2).
  // read: reading windows [[from, to], ...]. at: where its #hash and dot seek to.
  // bg: the canvas edge colour, for the bands outside the canvas (s6 shows a room photo; its band stays Warm Grey).
  var SECTIONS = [
    { id: "s1-hook", hash: "#top", label: "", start: 0, end: 8, read: [[0.6, 1]], at: 0, bg: "#0A0A0A" },
    { id: "s2-detect", hash: "#detect", label: "감지", start: 8, end: 20, read: [[10.5, 15]], at: 10.5, bg: "#FD312E" },
    { id: "s3-sort", hash: "#sort", label: "구분", start: 20, end: 38, read: [[30.5, 35]], at: 30.5, bg: "#F0ECE4" },
    { id: "s4-confirm", hash: "#check", label: "확인", start: 38, end: 55, read: [[50, 53.5]], at: 50, bg: "#0A0A0A" },
    { id: "s5-filter", hash: "#filter", label: "M5 필터", start: 55, end: 68, read: [[59, 65]], at: 59, bg: "#0A0A0A" },
    { id: "s6-size", hash: "#size", label: "본체 크기", start: 68, end: 84, read: [[74, 77], [79.5, 82.5]], at: 74, bg: "#F0ECE4" },
    { id: "s7-cta", hash: "#end", label: "제품", start: 84, end: 100, read: [[94, 100]], at: 95, bg: "#FFFFFF" }
  ];

  var progressCbs = [];
  var stageCbs = [];
  var api = {
    progress: 0,
    section: 1,
    band: "",
    sections: SECTIONS,
    orientation: "landscape",
    ready: false,
    onProgress: function (cb) {
      if (typeof cb !== "function") return function () {};
      progressCbs.push(cb);
      try { cb(api.progress, api.section); } catch (e) { setTimeout(function () { throw e; }); }
      return function () { var i = progressCbs.indexOf(cb); if (i >= 0) progressCbs.splice(i, 1); };
    },
    onStage: function (cb) {
      if (typeof cb !== "function") return function () {};
      stageCbs.push(cb);
      var r = api.stageRect();
      if (r) { try { cb(r); } catch (e) { setTimeout(function () { throw e; }); } }
      return function () { var i = stageCbs.indexOf(cb); if (i >= 0) stageCbs.splice(i, 1); };
    },
    seekToPercent: function (percent, opts) { seekStatic(percent, opts); },
    stageRect: function () { return null; }
  };
  window.__landing = api;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sectionAt(p) {
    for (var i = 0; i < SECTIONS.length; i++) if (p < SECTIONS[i].end) return i + 1;
    return SECTIONS.length;
  }
  function sectionByHash(hash) {
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].hash === hash) return SECTIONS[i];
    return null;
  }
  function emit(list, args) {
    for (var i = 0; i < list.length; i++) {
      try { list[i].apply(null, args); } catch (e) { setTimeout(function () { throw e; }); }
    }
  }
  function behavior(opts) { return opts && opts.smooth && !reduce.matches ? "smooth" : "instant"; }

  // Static page: seek means "go to that section's block".
  function seekStatic(percent, opts) {
    var s = SECTIONS[sectionAt(clamp(+percent || 0, 0, TOTAL)) - 1];
    var el = document.getElementById(s.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: behavior(opts), block: "start" });
  }

  function goStatic(reason) {
    root.classList.add("is-static");
    root.classList.remove("is-motion", "is-ready");
    if (reason) root.setAttribute("data-static-reason", reason);
    api.ready = false;
    api.seekToPercent = seekStatic;
    api.stageRect = function () { return null; };
  }

  // Buttons that are not links (works in every mode).
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-scroll-top]");
    if (b) { e.preventDefault(); api.seekToPercent(0, { smooth: true }); }
  });

  var frame = document.getElementById("stage-frame");
  if (!stage || !frame || reduce.matches) { goStatic(reduce.matches ? "reduced-motion" : "no-stage"); return; }
  root.classList.add("is-motion");

  // ---------- Scroll mapping ----------
  var probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;left:0;top:0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);

  var filmTop = 0, dist = 1;
  function measure() {
    var svh = probe.offsetHeight || window.innerHeight;
    var film = document.getElementById("film");
    filmTop = film ? film.getBoundingClientRect().top + window.scrollY : 0;
    var d = film ? film.offsetHeight - svh : 0;
    dist = d >= svh ? d : 10 * svh;
  }
  // A seek lands on whole pixels, so the requested value is kept while the page rests there (10.5 stays 10.5).
  var pin = null;
  function scrollPercent() {
    if (pin && Math.abs(window.scrollY - pin.y) < 1) return pin.p;
    return clamp((window.scrollY - filmTop) / dist * TOTAL, 0, TOTAL);
  }
  function yAt(percent) { return Math.round(filmTop + clamp(+percent || 0, 0, TOTAL) / TOTAL * dist); }

  function seekMotion(percent, opts) {
    var p = clamp(+percent || 0, 0, TOTAL);
    pin = { y: yAt(p), p: p };
    window.scrollTo({ top: pin.y, left: 0, behavior: behavior(opts) });
    schedule();
  }
  api.seekToPercent = seekMotion;

  // ---------- Canvas fit ----------
  var orient = null, W = 1920, H = 1080, rect = null;
  function box() {
    var cs = window.getComputedStyle(stage);
    var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
    var pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
    var r = stage.getBoundingClientRect();
    return {
      x: pl, y: pt,
      left: r.left + stage.clientLeft + pl, top: r.top + stage.clientTop + pt,
      width: Math.max(1, stage.clientWidth - pl - pr), height: Math.max(1, stage.clientHeight - pt - pb)
    };
  }
  function orientOf(b) { return b.height > b.width ? "portrait" : "landscape"; }
  // Cover when the box and canvas ratios differ by COVER_MAX or less, otherwise contain with the band colour around the canvas.
  // The cover crop is then under 3% of the canvas on a side, inside the 96px (landscape) and 60px (portrait) margins.
  var COVER_MAX = 1.06;
  function fitMode(b) {
    var r = (b.width / b.height) / (W / H);
    return Math.max(r, 1 / r) <= COVER_MAX + 1e-9 ? "cover" : "contain";
  }
  // Contain: scale in steps of 1/120 so both canvas sides (16:9 or 9:16 units of 120) and the offsets land on whole pixels.
  // A fractional edge lets the stage document's background bleed through as a hairline.
  // Cover: the box is taken on whole pixels and the canvas covers it with 1px to spare at each end of the fitting side.
  // The canvas edge rows (where the layer under a scene bleeds through as a light row) then sit outside the box and are clipped with the rest of the overhang.
  // view is the part of the screen the canvas shows in (the whole canvas when contained).
  var COVER_SPARE = 1;
  function snap(v) { var r = Math.round(v); return Math.abs(v - r) < 0.01 ? r : v; }
  function place(el, b) {
    var mode = fitMode(b), s, tx, ty, view;
    if (mode === "cover") {
      var x0 = Math.round(b.x), y0 = Math.round(b.y);
      var bw = Math.round(b.x + b.width) - x0, bh = Math.round(b.y + b.height) - y0;
      s = Math.max((bw + 2 * COVER_SPARE) / W, (bh + 2 * COVER_SPARE) / H);
      tx = snap(x0 + (bw - W * s) / 2);
      ty = snap(y0 + (bh - H * s) / 2);
      // inset() is in canvas px (before the transform): it cuts the canvas exactly at the whole-pixel box.
      el.style.clipPath = "inset(" + [(y0 - ty) / s, (tx + W * s - x0 - bw) / s, (ty + H * s - y0 - bh) / s, (x0 - tx) / s]
        .map(function (v) { return Math.max(0, v).toFixed(4) + "px"; }).join(" ") + ")";
      view = { left: b.left - b.x + x0, top: b.top - b.y + y0, width: bw, height: bh };
    } else {
      s = Math.max(1, Math.floor(Math.min(b.width * 120 / W, b.height * 120 / H) + 1e-6)) / 120;
      tx = Math.round(b.x + (b.width - W * s) / 2);
      ty = Math.round(b.y + (b.height - H * s) / 2);
      el.style.clipPath = "";
      view = { left: b.left - b.x + tx, top: b.top - b.y + ty, width: W * s, height: H * s };
    }
    el.style.width = W + "px";
    el.style.height = H + "px";
    el.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + s + ")";
    root.setAttribute("data-fit", mode);
    return { left: b.left - b.x + tx, top: b.top - b.y + ty, width: W * s, height: H * s, scale: s, orientation: orient, fit: mode, view: view };
  }
  // The stage document's own background matches the band, so any edge antialiasing blends into the same colour.
  function paintStage(f, bg) {
    try {
      var d = f.contentDocument;
      if (!d || !d.documentElement) return;
      d.documentElement.style.background = bg;
      if (d.body) d.body.style.background = bg;
    } catch (e) { /* stage not ready */ }
  }
  function stageRectNow() {
    return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height, scale: rect.scale, orientation: rect.orientation, fit: rect.fit,
      view: { left: rect.view.left, top: rect.view.top, width: rect.view.width, height: rect.view.height } } : null;
  }
  api.stageRect = stageRectNow;
  function setOrient(o) {
    orient = o;
    W = o === "portrait" ? 1080 : 1920;
    H = o === "portrait" ? 1920 : 1080;
    api.orientation = o;
    root.setAttribute("data-orient", o);
  }
  function fit() {
    rect = place(frame, box());
    emit(stageCbs, [api.stageRect()]);
  }

  // ---------- Phone on its side: the static document ----------
  // A stage this low on a touch screen would draw the landscape canvas at about 0.3x, too small to read.
  var LOW_STAGE = 500;
  var coarse = window.matchMedia("(pointer: coarse)");
  var topbar = document.getElementById("topbar");
  var low = false, lowKeep = 0, lowSec = 1;
  function isLow() {
    var vh = probe.offsetHeight || window.innerHeight;
    return coarse.matches && window.innerWidth > vh && vh - (topbar ? topbar.offsetHeight : 56) <= LOW_STAGE;
  }
  function staticSection() {
    var mid = window.innerHeight * 0.4, sec = 1;
    for (var i = 0; i < SECTIONS.length; i++) {
      var el = document.getElementById(SECTIONS[i].hash.slice(1));
      if (el && el.getBoundingClientRect().top <= mid) sec = i + 1;
    }
    return sec;
  }
  function enterLow() {
    low = true;
    lowKeep = api.progress;
    clearTimeout(orientTimer);
    root.classList.add("is-static");
    root.classList.remove("is-motion", "is-ready", "is-reorienting");
    root.setAttribute("data-static-reason", "low-stage");
    api.seekToPercent = seekStatic;
    api.stageRect = function () { return null; };
    seekStatic(lowKeep);
    lowSec = sectionAt(lowKeep);
  }
  // The section read on the static document is taken while it is still laid out on its side.
  // Upright, the document reflows to the narrow width first, so the same scroll position lands in another section.
  window.addEventListener("scroll", function () { if (low && isLow()) lowSec = staticSection(); }, { passive: true });
  // Back in portrait: the same progress if the reader stayed in that section, else that section's reading place.
  function leaveLow() {
    var sec = lowSec;
    var keep = sectionAt(lowKeep) === sec ? lowKeep : SECTIONS[sec - 1].at;
    low = false;
    root.classList.remove("is-static");
    root.removeAttribute("data-static-reason");
    root.classList.add("is-motion");
    api.seekToPercent = seekMotion;
    api.stageRect = stageRectNow;
    measure();
    var o = orientOf(box());
    if (o !== orient || !loadedOnce) {
      setOrient(o);
      if (indexHtml) { root.classList.add("is-reorienting"); reloading = true; load(); }
    } else if (player) root.classList.add("is-ready");
    fit();
    seekMotion(keep);
  }

  // ---------- Stage loading ----------
  var indexHtml = null, player = null, loadSeq = 0, loadedOnce = false, reloading = false;
  // After a turn the stage stays hidden (only the band shows) until the canvas for the new orientation is ready.
  function shown() { reloading = false; root.classList.remove("is-reorienting"); }

  // Runs inside the stage window (portrait only): scene roots declare 1920x1080, so their text is swapped before the runtime parses it.
  // A stylesheet also pins every composition box to the portrait canvas, over the runtime's inline sizes.
  function portraitPatch() {
    var swap = function (s) {
      return String(s).replace(/(data-composition-id="[^"]*"[^>]*?)data-width="1920"([^>]*?)data-height="1080"/g, '$1data-width="1080"$2data-height="1920"')
        .replace(/(data-composition-id="[^"]*"[^>]*?)data-height="1080"([^>]*?)data-width="1920"/g, '$1data-height="1920"$2data-width="1080"');
    };
    var parse = DOMParser.prototype.parseFromString;
    DOMParser.prototype.parseFromString = function (text, type) { return parse.call(this, swap(text), type); };
  }

  function compositionHtml(html, o) {
    // The written stage resolves URLs against the page's URL, not the page's <base>, so the base is passed on.
    var inject = '<base href="' + document.baseURI.replace(/"/g, "%22") + '">' +
      "<script>window.__timelines=window.__timelines||{};window.__orient=" + JSON.stringify(o) +
      ";document.documentElement.setAttribute('data-orient'," + JSON.stringify(o) + ");" +
      "document.documentElement.setAttribute('data-canvas'," + JSON.stringify(o) + ");<\/script>";
    if (o === "portrait") {
      inject += "<script>(" + portraitPatch.toString() + ")();<\/script>" +
        "<style>html,body{width:1080px!important;height:1920px!important;}" +
        "[data-composition-id]{width:1080px!important;height:1920px!important;}<\/style>";
      html = html.replace(/data-width="1920" data-height="1080"/g, 'data-width="1080" data-height="1920"')
        .replace('content="width=1920, height=1080"', 'content="width=1080, height=1920"');
    }
    inject += '<script src="lib/hyperframe.runtime.iife.js"><\/script>';
    return html.replace(/<head([^>]*)>/i, "<head$1>" + inject);
  }

  function load() {
    var seq = ++loadSeq;
    var o = orient;
    var old = frame, f = frame;
    if (loadedOnce) {
      // A fresh element gives a fresh window (document.open would keep the old runtime alive).
      f = old.cloneNode(false);
      f.style.transition = "none";
      f.style.opacity = "0";
      old.parentNode.insertBefore(f, old.nextSibling);
      place(f, box());
    }
    loadedOnce = true;
    // document.write keeps the iframe's URL equal to this page, so assets/ and compositions/ resolve.
    var d = f.contentDocument;
    d.open();
    d.write(compositionHtml(indexHtml, o));
    d.close();
    waitForPlayer(f, seq, 0, function (p) {
      if (seq !== loadSeq || o !== orient) { f.remove(); return; }
      player = p;
      lastT = -1;
      if (f !== old) {
        frame = f;
        fit();
        render();
        window.requestAnimationFrame(function () {
          f.style.opacity = "";
          old.remove();
          if (seq === loadSeq) shown();
          window.requestAnimationFrame(function () { f.style.transition = ""; });
        });
      } else {
        render();
        shown();
      }
      api.ready = true;
      root.classList.add("is-ready");
    });
  }

  function waitForPlayer(f, seq, tries, done) {
    if (seq !== loadSeq) { if (f !== frame) f.remove(); return; }
    var w = f.contentWindow;
    if (w && w.__playerReady && w.__player && typeof w.__player.seek === "function") { done(w.__player); return; }
    if (w && w.__hfStartupError) { goStatic("runtime-error"); return; }
    if (tries > 900) { goStatic("timeout"); return; }
    window.requestAnimationFrame(function () { waitForPlayer(f, seq, tries + 1, done); });
  }

  // ---------- Band colour (the only place it is decided) ----------
  // Wipes switch when half of the canvas perimeter shows the new colour, measured per orientation from 0.05 s frames.
  // s5's ground fades #0A0A0A -> Warm Grey over 65.9~67.7 with sine.inOut, so the band fades the same way.
  var BAND_SWITCH = { landscape: [7.757, 19.573, 37.581, 83.685], portrait: [7.435, 19.518, 37.635, 83.64] };
  var FADE = { from: 65.9, to: 67.7, a: [10, 10, 10], b: [240, 236, 228] };
  function bandAt(p) {
    var sw = BAND_SWITCH[orient] || BAND_SWITCH.landscape;
    if (p < sw[0]) return "#0A0A0A";
    if (p < sw[1]) return "#FD312E";
    if (p < sw[2]) return "#F0ECE4";
    if (p <= FADE.from) return "#0A0A0A";
    if (p < FADE.to) {
      var k = 0.5 - 0.5 * Math.cos(Math.PI * (p - FADE.from) / (FADE.to - FADE.from));
      return "rgb(" + [0, 1, 2].map(function (i) { return Math.round(FADE.a[i] + (FADE.b[i] - FADE.a[i]) * k); }).join(",") + ")";
    }
    if (p < sw[3]) return "#F0ECE4";
    return "#FFFFFF";
  }

  // ---------- Render ----------
  var introT = INTRO_TO, lastT = -1, queued = false, paintedFrame = null;
  function render() {
    queued = false;
    if (low) return;
    var p = Math.max(scrollPercent(), introT);
    var s = sectionAt(p);
    var band = bandAt(p);
    var changed = p !== api.progress || s !== api.section || band !== api.band;
    if (band !== api.band || paintedFrame !== frame) {
      api.band = band;
      root.style.setProperty("--stage-bg", band);
      if (player) { paintStage(frame, band); paintedFrame = frame; }
    }
    if (s !== api.section || !root.hasAttribute("data-section")) root.setAttribute("data-section", String(s));
    api.progress = p;
    api.section = s;
    if (player) {
      var t = Math.min(p, TOTAL - EPS);
      if (Math.abs(t - lastT) >= 0.0005) {
        lastT = t;
        try { player.seek(t); } catch (e) { setTimeout(function () { throw e; }); }
        root.style.setProperty("--film-t", t.toFixed(3));
      }
    }
    if (changed) emit(progressCbs, [p, s]);
  }
  function schedule() {
    if (!queued) { queued = true; window.requestAnimationFrame(render); }
  }

  function playIntro() {
    introT = 0;
    var t0 = null;
    function step(now) {
      if (t0 === null) t0 = now;
      introT = Math.min(INTRO_TO, (now - t0) / INTRO_MS * INTRO_TO);
      render();
      if (introT < INTRO_TO) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  // ---------- Addresses ----------
  function jumpToHash(smooth) {
    var s = sectionByHash(location.hash);
    if (!s) return false;
    api.seekToPercent(s.at, { smooth: smooth });
    return true;
  }
  document.addEventListener("click", function (e) {
    if (low || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var s = sectionByHash(a.getAttribute("href"));
    if (!s) return;
    e.preventDefault();
    if (location.hash !== s.hash) history.replaceState(null, "", s.hash);
    seekMotion(s.at, { smooth: true });
  });
  window.addEventListener("hashchange", function () { jumpToHash(false); });

  // ---------- Resize and orientation ----------
  var orientTimer = 0;
  function onResize() {
    if (isLow() !== low) { if (low) leaveLow(); else enterLow(); return; }
    if (low) return;
    var keep = api.progress;
    var oldTop = filmTop, oldDist = dist;
    measure();
    if (Math.abs(filmTop - oldTop) > 1 || Math.abs(dist - oldDist) > 1) seekMotion(keep);
    fit();
    schedule();
    var o = orientOf(box());
    clearTimeout(orientTimer);
    if (o !== orient && indexHtml) {
      root.classList.add("is-reorienting");
      orientTimer = setTimeout(function () {
        if (orientOf(box()) === orient) { if (!reloading) shown(); return; }
        setOrient(orientOf(box()));
        fit();
        reloading = true;
        load();
      }, ORIENT_DELAY);
    } else if (!reloading) shown();
  }

  // ---------- Start ----------
  setOrient(orientOf(box()));
  measure();
  fit();
  var hasHash = !!sectionByHash(location.hash);
  if (hasHash && "scrollRestoration" in history) history.scrollRestoration = "manual";
  if (isLow()) enterLow();
  if (hasHash) jumpToHash(false);
  render();

  fetch("film.html", { cache: "no-cache" })
    .then(function (res) { if (!res.ok) throw new Error("film.html " + res.status); return res.text(); })
    .then(function (html) {
      indexHtml = html;
      if (low) return;
      load();
      // The intro plays only when the page opens at the top without an address.
      var startReady = function () {
        if (api.ready) {
          if (!hasHash && window.scrollY - filmTop < 2) playIntro(); else render();
          return;
        }
        if (root.classList.contains("is-static")) return;
        window.requestAnimationFrame(startReady);
      };
      startReady();
    })
    .catch(function () { goStatic("load-failed"); });

  // Late layout (fonts, images) can move #film: re-measure once everything has loaded.
  window.addEventListener("load", function () {
    if (low) return;
    measure();
    if (hasHash) jumpToHash(false);
    fit();
    schedule();
  });
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  if (reduce.addEventListener) reduce.addEventListener("change", function (e) { if (e.matches) goStatic("reduced-motion"); });
})();
