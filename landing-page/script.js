document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
  setupSectionReveals();
  setupAccordion();
});

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
