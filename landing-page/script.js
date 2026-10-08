document.documentElement.classList.add('js');

function init() {
  setupSectionReveals();
  setupAccordion();
  setupAnalyticsTracking();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function setupSectionReveals() {
  const items = [...document.querySelectorAll('.reveal')];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, {
    threshold: 0.14,
    rootMargin: '0px 0px -8% 0px'
  });

  items.forEach((item) => observer.observe(item));
}

function setupAccordion() {
  const triggers = document.querySelectorAll('.accordion__trigger');

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const panelId = trigger.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      const item = trigger.closest('.accordion__item');

      if (!panel || !item) return;

      const willOpen = trigger.getAttribute('aria-expanded') !== 'true';
      trigger.setAttribute('aria-expanded', String(willOpen));
      panel.hidden = !willOpen;
      item.classList.toggle('is-open', willOpen);
    });
  });
}

function setupAnalyticsTracking() {
  if (window.__dingDongPetAnalyticsTrackingInitialized) {
    return;
  }

  window.__dingDongPetAnalyticsTrackingInitialized = true;

  const sections = [
    { element: document.getElementById('hero-title'), name: 'hero' },
    { element: document.getElementById('detail-space-title') || document.getElementById('proof-title'), name: 'detail' },
    { element: document.getElementById('purchase-title') || document.getElementById('final-title'), name: 'cta' }
  ].filter((section) => section.element);

  const sentSectionNames = new Set();
  let sectionObserver = null;

  const sendEvent = (eventName, parameters) => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, parameters);
    }
  };

  const getHeaderHeight = () => {
    const header = document.getElementById('header');
    if (!header) return 0;

    const headerBounds = header.getBoundingClientRect();
    return Math.max(0, Math.min(headerBounds.bottom, window.innerHeight));
  };

  const isAtLeastHalfVisible = (element) => {
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return false;

    const visibleTop = Math.max(bounds.top, getHeaderHeight());
    const visibleRight = Math.min(bounds.right, window.innerWidth);
    const visibleBottom = Math.min(bounds.bottom, window.innerHeight);
    const visibleLeft = Math.max(bounds.left, 0);
    const visibleWidth = Math.max(0, visibleRight - visibleLeft);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);

    return (visibleWidth * visibleHeight) / (bounds.width * bounds.height) >= 0.5;
  };

  const recordSectionView = (section) => {
    if (sentSectionNames.has(section.name)) return;

    sentSectionNames.add(section.name);
    sendEvent('section_view', { section_name: section.name });

    if (sectionObserver) {
      sectionObserver.unobserve(section.element);
    }
  };

  const checkVisibleSections = () => {
    if (document.visibilityState !== 'visible') return;

    sections.forEach((section) => {
      if (!sentSectionNames.has(section.name) && isAtLeastHalfVisible(section.element)) {
        recordSectionView(section);
      }
    });
  };

  const observeSections = () => {
    if (!('IntersectionObserver' in window)) {
      checkVisibleSections();
      return;
    }

    if (sectionObserver) {
      sectionObserver.disconnect();
    }

    sectionObserver = new IntersectionObserver((entries) => {
      if (document.visibilityState !== 'visible') return;

      entries.forEach((entry) => {
        if (entry.intersectionRatio < 0.5) return;

        const section = sections.find((item) => item.element === entry.target);
        if (section) recordSectionView(section);
      });
    }, {
      threshold: [0.5],
      rootMargin: `-${Math.ceil(getHeaderHeight())}px 0px 0px 0px`
    });

    sections.forEach((section) => {
      if (!sentSectionNames.has(section.name)) {
        sectionObserver.observe(section.element);
      }
    });

    checkVisibleSections();
  };

  const ctaTargets = new Map();
  [
    { selector: '#cta-hero, [data-cta-location="hero"]', location: 'hero' },
    { selector: '#cta-final, [data-cta-location="final"]', location: 'final' }
  ].forEach(({ selector, location }) => {
    document.querySelectorAll(selector).forEach((element) => {
      ctaTargets.set(element, location);
    });
  });

  ctaTargets.forEach((location, element) => {
    element.addEventListener('click', () => {
      sendEvent('cta_click', { button_location: location });
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkVisibleSections();
    }
  });

  window.addEventListener('pageshow', checkVisibleSections);
  window.addEventListener('resize', observeSections, { passive: true });
  observeSections();
}
