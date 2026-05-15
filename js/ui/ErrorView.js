export class ErrorView {
  constructor(refs) {
    this.refs = refs;
  }

  showLoadingError(message) {
    if (!this.refs.loading) return;
    if (this.refs.loaderProgress) this.refs.loaderProgress.style.backgroundColor = 'red';
    this.refs.loading.replaceChildren();

    const title = document.createElement('div');
    title.style.color = 'red';
    title.style.marginBottom = '12px';
    title.textContent = 'SYSTEM ERROR: FAILED TO LOAD ASSETS';

    const detail = document.createElement('div');
    detail.style.fontSize = '12px';
    detail.style.color = '#888';
    detail.style.maxWidth = '80%';
    detail.style.textAlign = 'center';
    detail.textContent = `${message || '资源加载失败'}\n\n请确认使用本地服务器运行，并检查模型、动作和 manifest 路径。`;
    detail.style.whiteSpace = 'pre-line';

    this.refs.loading.append(title, detail);
  }

  showLoading() {
    if (!this.refs.loading) return;
    this.refs.loading.style.display = 'flex';
    this.refs.loading.style.opacity = '1';
  }

  hideLoading({ registry, fadeDelayMs, fadeMs, onHidden }) {
    registry.addTimeout(() => {
      this.refs.loading.style.opacity = '0';
      registry.addTimeout(() => {
        this.refs.loading.style.display = 'none';
        onHidden?.();
      }, fadeMs);
    }, fadeDelayMs);
  }
}
