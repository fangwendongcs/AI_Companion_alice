export class SettingsController {
  constructor({ refs, registry }) {
    this.refs = refs;
    this.registry = registry;
  }

  init() {
    this.registry.addEventListener(this.refs.settingsBtn, 'click', () => {
      this.refs.sidePanel.classList.add('show');
      this.refs.sidePanel.style.setProperty('left', this.getOpenPanelLeft(), 'important');
    });
    this.registry.addEventListener(this.refs.closePanelBtn, 'click', () => {
      this.refs.sidePanel.classList.remove('show');
      this.refs.sidePanel.style.removeProperty('left');
    });
  }

  getOpenPanelLeft() {
    const viewportWidth = globalThis.innerWidth || this.refs.sidePanel?.ownerDocument?.documentElement?.clientWidth || 0;
    const panelWidth = Math.min(380, viewportWidth);
    return `${Math.max(0, viewportWidth - panelWidth)}px`;
  }
}
