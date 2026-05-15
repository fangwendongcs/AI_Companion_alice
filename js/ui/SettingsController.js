export class SettingsController {
  constructor({ refs, registry }) {
    this.refs = refs;
    this.registry = registry;
  }

  init() {
    this.registry.addEventListener(this.refs.settingsBtn, 'click', () => {
      this.refs.sidePanel.classList.add('show');
    });
    this.registry.addEventListener(this.refs.closePanelBtn, 'click', () => {
      this.refs.sidePanel.classList.remove('show');
    });
  }
}
