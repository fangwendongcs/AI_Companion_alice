import { DisposableRegistry } from '../core/lifecycle/DisposableRegistry.js';
import { AvatarSelectorController } from './AvatarSelectorController.js';
import { ChatPanelController } from './ChatPanelController.js';
import { DomEffectsController } from './DomEffectsController.js';
import { ErrorView } from './ErrorView.js';
import { InteractionPanelController } from './InteractionPanelController.js';
import { LLMSettingsController } from './LLMSettingsController.js';
import { SceneControlsController } from './SceneControlsController.js';
import { SettingsController } from './SettingsController.js';
import { StatusView } from './StatusView.js';
import { TTSSettingsController } from './TTSSettingsController.js';

export class UIController {
  constructor(deps) {
    this.deps = deps;
    this.refs = deps.refs;
    this.registry = new DisposableRegistry();
    this.errorView = new ErrorView(this.refs);
    this.statusView = new StatusView(this.refs, this.registry);
    this.avatarPanel = new AvatarSelectorController({
      ...deps,
      registry: this.registry,
      showLoading: () => this.errorView.showLoading()
    });
    this.controllers = [
      new SettingsController({ refs: this.refs, registry: this.registry }),
      new ChatPanelController({ refs: this.refs, registry: this.registry, actions: deps.actions }),
      new SceneControlsController({ ...deps, registry: this.registry }),
      this.avatarPanel,
      new LLMSettingsController({
        ...deps,
        registry: this.registry,
        statusView: this.statusView,
        getConfig: deps.getLLMConfig,
        setConfig: deps.setLLMConfig,
        readFormConfig: deps.readFormConfig
      }),
      new TTSSettingsController({
        ...deps,
        registry: this.registry,
        statusView: this.statusView,
        getConfig: deps.getTTSConfig,
        setConfig: deps.setTTSConfig
      }),
      new InteractionPanelController({ ...deps, registry: this.registry }),
      new DomEffectsController({ refs: this.refs, registry: this.registry })
    ];
  }

  init() {
    this.controllers.forEach((controller) => controller.init?.());
  }

  destroy() {
    this.registry.destroy();
  }
}
