export class DomEffectsController {
  constructor({ refs, registry }) {
    this.refs = refs;
    this.registry = registry;
  }

  init() {
    this.initSmoothDetails();
    this.initButtonRipple();
  }

  initSmoothDetails() {
    document.querySelectorAll('details.section').forEach((detail) => {
      const content = detail.querySelector('.details-content');
      const summary = detail.querySelector('summary');
      if (!content || !summary) return;

      if (detail.open) {
        content.style.opacity = '1';
        content.style.maxHeight = 'none';
        content.style.overflow = 'visible';
      } else {
        content.style.maxHeight = '0';
        content.style.opacity = '0';
        content.style.overflow = 'hidden';
      }

      this.registry.addEventListener(summary, 'click', (event) => {
        event.preventDefault();

        if (detail.open) {
          content.style.overflow = 'hidden';
          content.style.maxHeight = `${content.scrollHeight || 0}px`;
          requestAnimationFrame(() => {
            content.style.maxHeight = '0';
            content.style.opacity = '0';
          });
          content.addEventListener('transitionend', function handler() {
            detail.open = false;
            content.removeEventListener('transitionend', handler);
          }, { once: true });
        } else {
          detail.open = true;
          content.style.overflow = 'hidden';
          content.style.maxHeight = '0';
          requestAnimationFrame(() => {
            content.style.maxHeight = `${content.scrollHeight}px`;
            content.style.opacity = '1';
          });
          content.addEventListener('transitionend', function handler() {
            content.style.maxHeight = 'none';
            content.style.overflow = 'visible';
            content.removeEventListener('transitionend', handler);
          }, { once: true });
        }
      });
    });
  }

  initButtonRipple() {
    const registry = this.registry;
    document.querySelectorAll('.custom-btn, .tag, .dock-btn').forEach((btn) => {
      this.registry.addEventListener(btn, 'click', function(event) {
        const existingRipple = this.querySelector('.ripple-effect');
        if (existingRipple) existingRipple.remove();

        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        ripple.classList.add('ripple-effect');
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

        this.style.position = 'relative';
        this.style.overflow = 'hidden';
        this.appendChild(ripple);
        registry.addTimeout(() => ripple.remove(), 600);
      });
    });
  }
}
