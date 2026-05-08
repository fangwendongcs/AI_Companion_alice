import { AvatarState } from './states.js';

const actionStates = [
  AvatarState.INTERACTING,
  AvatarState.ARM_ACTION,
  AvatarState.HEAD_ACTION,
  AvatarState.LEG_ACTION
];

const transitions = {
  [AvatarState.BOOT]: [AvatarState.IDLE],
  [AvatarState.IDLE]: [
    AvatarState.BOOT,
    AvatarState.THINKING,
    AvatarState.SPEAKING,
    ...actionStates,
    AvatarState.IDLE
  ],
  [AvatarState.THINKING]: [AvatarState.SPEAKING, AvatarState.IDLE],
  [AvatarState.SPEAKING]: [
    AvatarState.IDLE,
    ...actionStates
  ],
  [AvatarState.INTERACTING]: [AvatarState.IDLE, AvatarState.SPEAKING, ...actionStates],
  [AvatarState.ARM_ACTION]: [AvatarState.IDLE, AvatarState.SPEAKING, ...actionStates],
  [AvatarState.HEAD_ACTION]: [AvatarState.IDLE, AvatarState.SPEAKING, ...actionStates],
  [AvatarState.LEG_ACTION]: [AvatarState.IDLE, AvatarState.SPEAKING, ...actionStates]
};

const stateActions = {
  [AvatarState.BOOT]: { action: 'boot', layer: 'gesture', mode: 'play' },
  [AvatarState.IDLE]: { action: 'idle', layer: 'base', mode: 'base' },
  [AvatarState.THINKING]: { action: 'idle', layer: 'base', mode: 'base' },
  [AvatarState.SPEAKING]: { action: 'idle', layer: 'base', mode: 'base' },
  [AvatarState.INTERACTING]: { action: 'interact', layer: 'gesture', mode: 'enqueue' },
  [AvatarState.ARM_ACTION]: { action: 'arm', layer: 'gesture', mode: 'enqueue' },
  [AvatarState.HEAD_ACTION]: { action: 'head', layer: 'gesture', mode: 'enqueue' },
  [AvatarState.LEG_ACTION]: { action: 'leg', layer: 'gesture', mode: 'enqueue' }
};

export class AnimationStateMachine {
  constructor(initialState = AvatarState.IDLE) {
    this.current = initialState;
  }

  canTransition(nextState) {
    if (nextState === this.current) return true;
    return transitions[this.current]?.includes(nextState) || nextState === AvatarState.IDLE;
  }

  transition(nextState) {
    if (!this.canTransition(nextState)) {
      return {
        ok: false,
        from: this.current,
        to: nextState,
        actionPlan: stateActions[this.current]
      };
    }

    const previous = this.current;
    this.current = nextState;
    return {
      ok: true,
      from: previous,
      to: nextState,
      actionPlan: stateActions[nextState]
    };
  }
}
