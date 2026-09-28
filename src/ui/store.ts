/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Reactive State Management & Local Storage Store
 */

import { AppState, Inputs, Profile, StudioStage } from '../core/types.js';
import { DEFAULT_INPUTS, STORAGE_KEY } from '../core/constants.js';

export class Store {
  private state: AppState;
  private listeners: Set<(state: AppState) => void> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.state = this.loadFromStorage();
  }

  public getState(): AppState {
    return this.state;
  }

  public getInputs(): Inputs {
    const activeProfile = this.state.profiles[this.state.activeProfileId];
    return activeProfile ? activeProfile.inputs : DEFAULT_INPUTS;
  }

  public updateInputs(partial: Partial<Inputs>, triggerCalculate = true) {
    const profile = this.state.profiles[this.state.activeProfileId];
    if (profile) {
      profile.inputs = { ...profile.inputs, ...partial };
      this.state.profiles[this.state.activeProfileId] = profile;
    }
    this.notify();
    this.scheduleSave();
  }

  public setStage(stage: StudioStage) {
    this.state.currentStage = stage;
    this.notify();
    this.scheduleSave();
  }

  public setMode(mode: 'mortgage' | 'cc' | 'loan' | 'portfolio') {
    this.state.currentMode = mode;
    this.notify();
    this.scheduleSave();
  }

  public toggleLeftPane() {
    this.state.leftPaneCollapsed = !this.state.leftPaneCollapsed;
    this.notify();
    this.scheduleSave();
  }

  public toggleRightPane() {
    this.state.rightPaneCollapsed = !this.state.rightPaneCollapsed;
    this.notify();
    this.scheduleSave();
  }

  public toggleTheme() {
    this.state.isDark = !this.state.isDark;
    this.applyTheme();
    this.notify();
    this.scheduleSave();
  }

  public setMobileTab(tab: 'pulse' | 'lab' | 'engine' | 'ledger') {
    this.state.mobileActiveTab = tab;
    this.notify();
  }

  public subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((fn) => fn(this.state));
  }

  private scheduleSave() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.saveToStorage();
    }, 200);
  }

  public applyTheme() {
    if (typeof document !== 'undefined') {
      if (this.state.isDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    }
  }

  private loadFromStorage(): AppState {
    const defaultProfileId = 'default-scenario';
    const defaultState: AppState = {
      currentStage: 'pulse',
      currentMode: 'mortgage',
      isDark: true,
      language: 'en',
      activeProfileId: defaultProfileId,
      profiles: {
        [defaultProfileId]: {
          id: defaultProfileId,
          name: 'Primary Scenario',
          createdAt: Date.now(),
          inputs: { ...DEFAULT_INPUTS }
        }
      },
      comparisonProfileId: null,
      compareModeActive: false,
      showTermMilestone: true,
      bankWagesView: 'days-owned',
      leftPaneCollapsed: false,
      rightPaneCollapsed: false,
      mobileActiveTab: 'pulse'
    };

    if (typeof window === 'undefined' || !window.localStorage) {
      return defaultState;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState;
      const parsed = JSON.parse(raw);
      return {
        ...defaultState,
        ...parsed,
        profiles: parsed.profiles || defaultState.profiles
      };
    } catch (e) {
      console.error('Failed to load settings from storage', e);
      return defaultState;
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to save settings to storage', e);
    }
  }
}
