import { AvatarState } from './states.js';

const actionStates = [
  AvatarState.REACTING,
  AvatarState.INTERACTING,
  AvatarState.ARM_ACTION,
  AvatarState.HEAD_ACTION,
  AvatarState.LEG_ACTION
];

const transitions = {
  [AvatarState.BOOT]: [AvatarState.IDLE, AvatarState.ERROR],
  [AvatarState.ENTERING]: [AvatarState.IDLE, AvatarState.ERROR],
  [AvatarState.IDLE]: [
    AvatarState.BOOT,
    AvatarState.ENTERING,
    AvatarState.LISTENING,
    AvatarState.THINKING,
    AvatarState.SPEAKING,
    ...actionStates,
    AvatarState.INTERRUPTED,
    AvatarState.ERROR,
    AvatarState.IDLE
  ],
  [AvatarState.LISTENING]: [AvatarState.THINKING, AvatarState.SPEAKING, AvatarState.IDLE, AvatarState.INTERRUPTED, AvatarState.ERROR],
  [AvatarState.THINKING]: [AvatarState.SPEAKING, AvatarState.IDLE, AvatarState.INTERRUPTED, AvatarState.ERROR],
  [AvatarState.SPEAKING]: [
    AvatarState.IDLE,
    AvatarState.INTERRUPTED,
    AvatarState.ERROR,
    ...actionStates
  ],
  [AvatarState.INTERACTING]: [AvatarState.IDLE, AvatarState.SPEAKING, ...actionStates],
  [AvatarState.REACTING]: [AvatarState.IDLE, AvatarState.SPEAKING, ...actionStates],
  [AvatarState.ARM_ACTION]: [AvatarState.IDLE, AvatarState.SPEAKING, ...actionStates],
  [AvatarState.HEAD_ACTION]: [AvatarState.IDLE, AvatarState.SPEAKING, ...actionStates],
  [AvatarState.LEG_ACTION]: [AvatarState.IDLE, AvatarState.SPEAKING, ...actionStates],
  [AvatarState.INTERRUPTED]: [AvatarState.IDLE, AvatarState.ERROR],
  [AvatarState.ERROR]: [AvatarState.IDLE]
};

const stateActions = {
  [AvatarState.BOOT]: { action: 'intro', layer: 'gesture', mode: 'play' },
  [AvatarState.ENTERING]: { action: 'intro', layer: 'gesture', mode: 'play' },
  [AvatarState.IDLE]: { action: 'idle', layer: 'base', mode: 'base' },
  [AvatarState.LISTENING]: { action: 'listening', layer: 'base', mode: 'base' },
  [AvatarState.THINKING]: { action: 'listening', layer: 'base', mode: 'base' },
  [AvatarState.SPEAKING]: { action: 'speaking', layer: 'base', mode: 'base' },
  [AvatarState.REACTING]: { action: 'bodyTap', layer: 'gesture', mode: 'enqueue' },
  [AvatarState.INTERACTING]: { action: 'bodyTap', layer: 'gesture', mode: 'enqueue' },
  [AvatarState.ARM_ACTION]: { action: 'armTap', layer: 'gesture', mode: 'enqueue' },
  [AvatarState.HEAD_ACTION]: { action: 'headTap', layer: 'gesture', mode: 'enqueue' },
  [AvatarState.LEG_ACTION]: { action: 'legTap', layer: 'gesture', mode: 'enqueue' },
  [AvatarState.INTERRUPTED]: { action: 'idle', layer: 'base', mode: 'base' },
  [AvatarState.ERROR]: { action: 'idle', layer: 'base', mode: 'base' }
};

const transientStates = new Set([
  AvatarState.BOOT,
  AvatarState.ENTERING,
  AvatarState.REACTING,
  AvatarState.INTERACTING,
  AvatarState.ARM_ACTION,
  AvatarState.HEAD_ACTION,
  AvatarState.LEG_ACTION,
  AvatarState.INTERRUPTED,
  AvatarState.ERROR
]);

export function isTransientAnimationState(state) {
  return transientStates.has(state);
}

export class AnimationStateMachine {
  constructor(initialState = AvatarState.IDLE) {
    this.current = initialState;
  }

  canTransition(nextState) {
    if (nextState === this.current) return true;
    if ([AvatarState.IDLE, AvatarState.INTERRUPTED, AvatarState.ERROR].includes(nextState)) return true;
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
