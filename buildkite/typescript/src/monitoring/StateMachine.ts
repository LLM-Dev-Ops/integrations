/**
 * Buildkite State Machine
 *
 * Tracks and validates build/job state transitions.
 * @module monitoring/StateMachine
 */

import type { BuildState } from '../types/build.js';
import type { JobState } from '../types/job.js';

export interface StateTransition<T> {
  from: T;
  to: T;
  timestamp: Date;
}

/** Valid build state transitions */
const VALID_BUILD_TRANSITIONS: Map<BuildState, BuildState[]> = new Map([
  ['scheduled' as BuildState, ['running', 'canceled', 'skipped'] as BuildState[]],
  ['running' as BuildState, ['passed', 'failed', 'canceled', 'blocked', 'canceling'] as BuildState[]],
  ['blocked' as BuildState, ['running', 'canceled', 'canceling'] as BuildState[]],
  ['canceling' as BuildState, ['canceled'] as BuildState[]],
  ['waiting' as BuildState, ['running', 'canceled'] as BuildState[]],
]);

/** Valid job state transitions */
const VALID_JOB_TRANSITIONS: Map<JobState, JobState[]> = new Map([
  ['pending' as JobState, ['waiting', 'scheduled', 'skipped'] as JobState[]],
  ['waiting' as JobState, ['waiting_failed', 'scheduled', 'skipped'] as JobState[]],
  ['waiting_failed' as JobState, ['scheduled', 'skipped'] as JobState[]],
  ['blocked' as JobState, ['unblocked', 'canceled'] as JobState[]],
  ['unblocked' as JobState, ['scheduled'] as JobState[]],
  ['limiting' as JobState, ['limited', 'scheduled'] as JobState[]],
  ['limited' as JobState, ['scheduled'] as JobState[]],
  ['scheduled' as JobState, ['assigned', 'canceled', 'expired'] as JobState[]],
  ['assigned' as JobState, ['accepted', 'canceled', 'expired'] as JobState[]],
  ['accepted' as JobState, ['running', 'canceled'] as JobState[]],
  ['running' as JobState, ['passed', 'failed', 'canceled', 'timed_out', 'canceling'] as JobState[]],
  ['canceling' as JobState, ['canceled'] as JobState[]],
]);

export class BuildStateMachine {
  private currentState: BuildState;
  private readonly history: StateTransition<BuildState>[] = [];

  constructor(initialState: BuildState = 'scheduled' as BuildState) {
    this.currentState = initialState;
  }

  /**
   * Transition to a new state
   */
  transition(newState: BuildState): boolean {
    const validTransitions = VALID_BUILD_TRANSITIONS.get(this.currentState);

    if (!validTransitions || !validTransitions.includes(newState)) {
      return false;
    }

    this.history.push({
      from: this.currentState,
      to: newState,
      timestamp: new Date(),
    });

    this.currentState = newState;
    return true;
  }

  /**
   * Force state update without validation
   */
  forceState(newState: BuildState): void {
    if (newState !== this.currentState) {
      this.history.push({
        from: this.currentState,
        to: newState,
        timestamp: new Date(),
      });
      this.currentState = newState;
    }
  }

  /**
   * Get current state
   */
  getState(): BuildState {
    return this.currentState;
  }

  /**
   * Get transition history
   */
  getHistory(): ReadonlyArray<StateTransition<BuildState>> {
    return [...this.history];
  }

  /**
   * Check if in terminal state
   */
  isTerminal(): boolean {
    const terminalStates: BuildState[] = ['passed', 'failed', 'canceled', 'skipped', 'not_run'] as BuildState[];
    return terminalStates.includes(this.currentState);
  }

  /**
   * Check if transition is valid
   */
  canTransitionTo(newState: BuildState): boolean {
    const validTransitions = VALID_BUILD_TRANSITIONS.get(this.currentState);
    return validTransitions?.includes(newState) ?? false;
  }
}

export class JobStateMachine {
  private currentState: JobState;
  private readonly history: StateTransition<JobState>[] = [];

  constructor(initialState: JobState = 'pending' as JobState) {
    this.currentState = initialState;
  }

  /**
   * Transition to a new state
   */
  transition(newState: JobState): boolean {
    const validTransitions = VALID_JOB_TRANSITIONS.get(this.currentState);

    if (!validTransitions || !validTransitions.includes(newState)) {
      return false;
    }

    this.history.push({
      from: this.currentState,
      to: newState,
      timestamp: new Date(),
    });

    this.currentState = newState;
    return true;
  }

  /**
   * Force state update without validation
   */
  forceState(newState: JobState): void {
    if (newState !== this.currentState) {
      this.history.push({
        from: this.currentState,
        to: newState,
        timestamp: new Date(),
      });
      this.currentState = newState;
    }
  }

  /**
   * Get current state
   */
  getState(): JobState {
    return this.currentState;
  }

  /**
   * Get transition history
   */
  getHistory(): ReadonlyArray<StateTransition<JobState>> {
    return [...this.history];
  }

  /**
   * Check if in terminal state
   */
  isTerminal(): boolean {
    const terminalStates: JobState[] = ['passed', 'failed', 'canceled', 'timed_out', 'skipped', 'expired', 'broken'] as JobState[];
    return terminalStates.includes(this.currentState);
  }

  /**
   * Check if transition is valid
   */
  canTransitionTo(newState: JobState): boolean {
    const validTransitions = VALID_JOB_TRANSITIONS.get(this.currentState);
    return validTransitions?.includes(newState) ?? false;
  }
}
