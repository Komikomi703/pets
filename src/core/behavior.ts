import { clampDt, physicalToLogical } from './geometry';
import type { BehaviorContext, BehaviorOutput, PetState, PetAction, Personality, CharacterId } from './types';

const MIN_DURATION: Record<PetState, number> = {
  idle: 2.2, walk: 1.1, sit: 4, sleep: 8, stretch: 1.2,
  groom: 2.5, happy: 1.8, eat: 2.5, play: 2.2, dragged: 0, sulk: 2.5, land: .4, wake: .8, stumble: 1.4,
};
const COOLDOWN: Record<PetAction, number> = { pet: 1.5, feed: 4, play: 3 };
const AUTONOMOUS_COOLDOWN: Partial<Record<PetState, number>> = {
  sleep: 12, stretch: 8, groom: 7, happy: 10, play: 10,
};
const MAX_SPEED = 52;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function unit(value: number): number {
  return Math.min(1, Math.max(0, finite(value)));
}

export class CatBehavior {
  private state: PetState = 'idle';
  private stateTime = 0;
  private elapsed = 0;
  private direction: 1 | -1 = 1;
  private dragged = false;
  private pending: PetAction | null = null;
  private pendingFromSleep = false;
  private requestedState: PetState | null = null;
  private nextAllowed: Record<PetAction, number> = { pet: 0, feed: 0, play: 0 };
  private nextAutonomous: Partial<Record<PetState, number>> = {};
  private followUntil = 0;
  private nextFollow = 0;
  private wasFocusMode = false;

  private pokeTimes: number[] = [];
  private nextSulk = 0;
  private nextSpeech = 0;
  private speechUntil = 0;
  constructor(private readonly random: () => number = Math.random, private readonly character: CharacterId = 'cat') {
    this.nextAutonomous.stumble = 45;
  }
  poke(): void {
    if (this.character !== 'gugugaga' || this.dragged) return;
    this.pokeTimes = this.pokeTimes.filter(t => this.elapsed - t < 2.2);
    this.pokeTimes.push(this.elapsed);
    if (this.pokeTimes.length >= 3 && this.elapsed >= this.nextSulk) {
      this.pending = null; this.pendingFromSleep = false; this.requestedState = 'sulk';
      this.nextSulk = this.elapsed + 8; this.pokeTimes = []; this.speechUntil = 0;
      this.enter('sulk', true);
    }
  }

  /** Platform-approved actions have already passed the real-time rate limit. */
  interact(action: PetAction, acceptedByPlatform = false): void {
    if (this.dragged || (this.character === 'gugugaga' && this.state === 'sulk' && this.stateTime < 1.5)) return;
    if (!acceptedByPlatform && this.elapsed < this.nextAllowed[action]) return;
    this.nextAllowed[action] = this.elapsed + COOLDOWN[action];
    this.pending = action;
    if (this.state === 'sleep') {
      this.pendingFromSleep = true;
      this.enter(this.character === 'gugugaga' ? 'wake' : 'stretch');
    }
  }

  setDragged(dragged: boolean): void {
    if (this.dragged === dragged) return;
    this.dragged = dragged;
    if (dragged) {
      // A grab supersedes an unfinished interaction. Refund its cooldown so
      // the same action can be requested again after the cat is put down.
      if (this.pending) this.nextAllowed[this.pending] = this.elapsed;
      this.pending = null;
      this.pendingFromSleep = false;
      this.requestedState = null;
    }
    this.speechUntil = 0;
    this.enter(dragged ? 'dragged' : this.character === 'gugugaga' ? 'land' : 'idle');
  }

  /** `time` is elapsed seconds in the current state; hidden time is paused. */
  step(dtSeconds: number, context: BehaviorContext): BehaviorOutput {
    if (!context.visible) return this.output(context, 0);
    // Holding before the drag threshold freezes autonomy, too.
    if (context.desktop.pressed && !context.desktop.dragging && !this.dragged) return this.output(context, 0);
    const dt = clampDt(dtSeconds);
    this.elapsed += dt;
    this.stateTime += dt;
    const enteredFocus = context.settings.focusMode && !this.wasFocusMode;
    this.wasFocusMode = context.settings.focusMode;

    if (context.settings.focusMode) {
      if (this.pending) this.nextAllowed[this.pending] = this.elapsed;
      this.pending = null;
      this.requestedState = null;
      this.followUntil = 0;
    }

    if (this.dragged || context.desktop.dragging) {
      if (this.state !== 'dragged') {
        if (this.pending) this.nextAllowed[this.pending] = this.elapsed;
        this.pending = null;
        this.pendingFromSleep = false;
        this.requestedState = null;
        this.enter('dragged');
      }
      return this.output(context, 0);
    }
    if (this.state === 'dragged') this.enter(this.character === 'gugugaga' ? 'land' : 'idle');
    if (context.settings.focusMode) {
      if (this.pendingFromSleep) this.enter('sleep');
      else if (this.state !== 'sleep' && this.state !== 'sit' && this.state !== 'stretch') this.enter('sit');
      this.pendingFromSleep = false;
      if (!enteredFocus && this.stateTime >= MIN_DURATION[this.state]) this.chooseNext(context);
      return this.output(context, 0);
    }

    const waking = this.state === 'stretch' || this.state === 'wake';
    const clickFirst = this.character === 'gugugaga' && this.state === 'happy' && this.pending !== 'pet' && this.stateTime < MIN_DURATION.happy;
    if (this.pending && !waking && !clickFirst && this.state !== 'land') {
      const action = this.pending;
      this.pending = null;
      this.pendingFromSleep = false;
      this.requestedState = this.actionState(action);
      this.enter(this.requestedState, true);
    } else if (this.pending && waking && this.stateTime >= MIN_DURATION[this.state]) {
      const action = this.pending;
      this.pending = null;
      this.pendingFromSleep = false;
      this.requestedState = this.actionState(action);
      this.enter(this.requestedState, true);
    } else if (this.state === 'walk' && this.followUntil > 0 && this.elapsed >= this.followUntil) {
      this.enter('sit');
    } else if (this.stateTime >= MIN_DURATION[this.state] && !(this.state === 'walk' && this.followUntil > 0)) {
      this.chooseNext(context);
    }

    return this.output(context, this.walkVelocity(context));
  }

  private actionState(action: PetAction): PetState {
    if (action === 'feed') return 'eat';
    return action === 'pet' ? 'happy' : 'play';
  }

  private enter(state: PetState, restart = false): void {
    if (this.state === state && !restart) return;
    this.state = state;
    this.stateTime = 0;
    const cooldown = AUTONOMOUS_COOLDOWN[state];
    if (cooldown) this.nextAutonomous[state] = this.elapsed + cooldown;
    if (state === 'stumble') this.nextAutonomous.stumble = this.elapsed + 90;
    if (this.character === 'gugugaga' && state === 'happy' && this.elapsed >= this.nextSpeech) { this.speechUntil = this.elapsed + 1.5; this.nextSpeech = this.elapsed + 9; }
    if (state !== 'walk') this.followUntil = 0;
  }

  private chooseNext(context: BehaviorContext): void {
    if (context.settings.focusMode) {
      if (this.state === 'sleep') this.enter('stretch');
      else if (this.state === 'stretch') this.enter('sit');
      else if (this.state === 'sit') {
        const energy = unit(context.needs.energy / 100);
        if (this.random() < 0.25 + (1 - energy) * 0.6) this.enter('sleep');
        else this.stateTime = 0;
      }
      return;
    }
    if (this.requestedState === this.state) {
      this.requestedState = null;
      this.enter('idle');
      return;
    }
    if (this.state === 'sleep') {
      this.enter(this.character === 'gugugaga' ? 'wake' : 'stretch');
      return;
    }
    if (['stretch', 'wake', 'land', 'sulk', 'stumble'].includes(this.state)) {
      this.enter(context.settings.focusMode ? 'sit' : 'idle');
      return;
    }
    const { settings, needs } = context;
    const energy = unit(needs.energy / 100);
    const hunger = 1 - unit(needs.fullness / 100);
    const affection = unit(needs.affection / 100);
    const weights: Partial<Record<PetState, number>> = {
      idle: 3, sit: 3 + hunger * 6, walk: 2, sleep: 0.5 + (1 - energy) * 14,
      groom: 1 + (1 - affection) * 2,
      happy: (1 - affection) * 1.5, play: energy * 1.5, stretch: 0.5,
    };
    if (this.character === 'gugugaga') { weights.stumble = .07; weights.groom = .5; }
    const personality: Personality = settings.personality;
    if (personality === 'calm') {
      weights.sit = (weights.sit ?? 0) * 1.8;
      weights.sleep = (weights.sleep ?? 0) * 1.3;
      weights.walk = (weights.walk ?? 0) * 0.6;
      weights.play = (weights.play ?? 0) * 0.5;
    } else if (personality === 'affectionate') {
      weights.groom = (weights.groom ?? 0) * 2;
      weights.happy = (weights.happy ?? 0) * 2.5;
      if (this.canApproach(context)) weights.walk = (weights.walk ?? 0) * (2.8 + (1 - affection) * 1.2);
    } else {
      weights.walk = (weights.walk ?? 0) * 2.5;
      weights.play = (weights.play ?? 0) * 3;
      weights.sleep = (weights.sleep ?? 0) * 0.75;
    }
    for (const state of Object.keys(weights) as PetState[]) {
      if (state === this.state || this.elapsed < (this.nextAutonomous[state] ?? 0)) weights[state] = 0;
    }
    const entries = Object.entries(weights) as [PetState, number][];
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    if (total <= 0) { this.enter(settings.focusMode ? 'sit' : 'idle'); return; }
    let pick = unit(this.random()) * total;
    for (const [state, weight] of entries) {
      if (weight <= 0) continue;
      pick -= weight;
      if (pick <= 0) {
        this.enter(state);
        if (state === 'walk') this.selectWalkDirection(context);
        return;
      }
    }
    this.enter(entries.find(([, weight]) => weight > 0)?.[0] ?? 'idle');
  }

  private selectWalkDirection(context: BehaviorContext): void {
    const { desktop, settings } = context;
    const center = desktop.x + desktop.width / 2;
    const distance = physicalToLogical(desktop.cursor.x - center, desktop.scale);
    const affection = unit(context.needs.affection / 100);
    const chance = settings.personality === 'affectionate' ? 0.7 + (1 - affection) * 0.25
      : settings.personality === 'energetic' ? 0.45 : 0.25;
    if (this.canApproach(context) && this.random() < chance) {
      this.direction = distance < 0 ? -1 : 1;
      this.followUntil = this.elapsed + Math.max(MIN_DURATION.walk, 1.3);
      this.nextFollow = this.elapsed + (settings.personality === 'affectionate' ? 3.5 : settings.personality === 'energetic' ? 6 : 8);
    } else {
      const left = desktop.x - desktop.workArea.x;
      const right = desktop.workArea.x + desktop.workArea.width - desktop.x - desktop.width;
      if (left < 45 * desktop.scale) this.direction = 1;
      else if (right < 45 * desktop.scale) this.direction = -1;
      else this.direction = this.random() < 0.5 ? -1 : 1;
    }
  }

  private canApproach(context: BehaviorContext): boolean {
    const { desktop, settings } = context;
    const center = desktop.x + desktop.width / 2;
    const distance = Math.abs(physicalToLogical(desktop.cursor.x - center, desktop.scale));
    const verticalDistance = Math.abs(physicalToLogical(
      desktop.cursor.y - desktop.y - desktop.height / 2, desktop.scale,
    ));
    const area = desktop.workArea;
    const cursorInWorkArea = desktop.cursor.x >= area.x && desktop.cursor.x < area.x + area.width &&
      desktop.cursor.y >= area.y && desktop.cursor.y < area.y + area.height;
    return settings.followMouse && !settings.focusMode && this.elapsed >= this.nextFollow &&
      cursorInWorkArea && verticalDistance <= 200 && distance >= 85 && distance <= 320;
  }

  private walkVelocity(context: BehaviorContext): number {
    const chasing = this.character === 'gugugaga' && this.state === 'play' && this.stateTime < 1.2;
    if ((!chasing && this.state !== 'walk') || context.settings.focusMode || this.dragged) return 0;
    if (this.followUntil > 0 && this.elapsed >= this.followUntil) {
      this.enter('sit');
      return 0;
    }
    const { desktop } = context;
    const edgePhysical = this.direction === 1
      ? desktop.workArea.x + desktop.workArea.width - desktop.x - desktop.width
      : desktop.x - desktop.workArea.x;
    const edgeLogical = physicalToLogical(edgePhysical, desktop.scale);
    if (edgeLogical <= 0) {
      this.direction = this.direction === 1 ? -1 : 1;
      this.enter('sit');
      return 0;
    }
    const slowdown = Math.min(1, edgeLogical / 65);
    const speed = Math.min(MAX_SPEED * 2, MAX_SPEED * Math.max(0, finite(context.settings.speed, 1))) * slowdown;
    return this.direction * speed * (chasing ? .55 : this.character === 'gugugaga' ? .72 : 1);
  }

  private output(context: BehaviorContext, velocity: number): BehaviorOutput {
    const { desktop } = context;
    const centerX = desktop.x + desktop.width / 2;
    const centerY = desktop.y + desktop.height / 2;
    const distanceX = physicalToLogical(desktop.cursor.x - centerX, desktop.scale);
    const distanceY = physicalToLogical(desktop.cursor.y - centerY, desktop.scale);
    const lookX = context.settings.followMouse && !context.settings.focusMode
      ? Math.max(-1, Math.min(1, distanceX / 180)) : 0;
    const lookY = context.settings.followMouse && !context.settings.focusMode
      ? Math.max(-1, Math.min(1, distanceY / 140)) : 0;
    return {
      state: this.state, time: this.stateTime, direction: this.direction,
      speed: Math.abs(velocity), velocity, lookX, lookY,
      speech: this.character === 'gugugaga' && this.elapsed < this.speechUntil && !context.settings.focusMode ? 'ぐぐがが〜' : undefined,
    };
  }
}
