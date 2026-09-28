import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '../src/ui/store.js';

describe('Panel Collapse and Restoration Functionality', () => {
  let store: Store;

  beforeEach(() => {
    localStorage.clear();
    store = new Store();
  });

  it('initializes with panels expanded by default', () => {
    const state = store.getState();
    expect(state.leftPaneCollapsed).toBe(false);
    expect(state.rightPaneCollapsed).toBe(false);
  });

  it('toggles left pane collapsed state', () => {
    store.toggleLeftPane();
    expect(store.getState().leftPaneCollapsed).toBe(true);

    store.toggleLeftPane();
    expect(store.getState().leftPaneCollapsed).toBe(false);
  });

  it('toggles right pane collapsed state', () => {
    store.toggleRightPane();
    expect(store.getState().rightPaneCollapsed).toBe(true);

    store.toggleRightPane();
    expect(store.getState().rightPaneCollapsed).toBe(false);
  });

  it('supports explicit setLeftPane and setRightPane', () => {
    store.setLeftPane(true);
    expect(store.getState().leftPaneCollapsed).toBe(true);
    store.setLeftPane(false);
    expect(store.getState().leftPaneCollapsed).toBe(false);

    store.setRightPane(true);
    expect(store.getState().rightPaneCollapsed).toBe(true);
    store.setRightPane(false);
    expect(store.getState().rightPaneCollapsed).toBe(false);
  });

  it('expands all panes simultaneously with expandAllPanes', () => {
    store.setLeftPane(true);
    store.setRightPane(true);
    expect(store.getState().leftPaneCollapsed).toBe(true);
    expect(store.getState().rightPaneCollapsed).toBe(true);

    store.expandAllPanes();
    expect(store.getState().leftPaneCollapsed).toBe(false);
    expect(store.getState().rightPaneCollapsed).toBe(false);
  });

  it('collapses all panes simultaneously with collapseAllPanes', () => {
    store.collapseAllPanes();
    expect(store.getState().leftPaneCollapsed).toBe(true);
    expect(store.getState().rightPaneCollapsed).toBe(true);
  });

  it('notifies subscribers on pane state change', () => {
    let notifiedState: any = null;
    const unsubscribe = store.subscribe((state) => {
      notifiedState = state;
    });

    store.toggleLeftPane();
    expect(notifiedState).not.toBeNull();
    expect(notifiedState.leftPaneCollapsed).toBe(true);

    store.toggleRightPane();
    expect(notifiedState.rightPaneCollapsed).toBe(true);

    unsubscribe();
  });

  describe('DOM Synchronization & Restoration Affordances', () => {
    let leftPane: HTMLElement;
    let rightPane: HTMLElement;
    let restoreLeft: HTMLButtonElement;
    let restoreRight: HTMLButtonElement;
    let headerToggleLeft: HTMLButtonElement;
    let headerToggleRight: HTMLButtonElement;

    // Helper mirroring StudioApp syncPaneCollapse
    function syncPaneCollapse(state: any) {
      const isLeftCollapsed = !!state.leftPaneCollapsed;
      const isRightCollapsed = !!state.rightPaneCollapsed;

      if (isLeftCollapsed) {
        leftPane.classList.add('collapsed');
        leftPane.setAttribute('aria-hidden', 'true');
      } else {
        leftPane.classList.remove('collapsed');
        leftPane.setAttribute('aria-hidden', 'false');
      }

      if (isRightCollapsed) {
        rightPane.classList.add('collapsed');
        rightPane.setAttribute('aria-hidden', 'true');
      } else {
        rightPane.classList.remove('collapsed');
        rightPane.setAttribute('aria-hidden', 'false');
      }

      restoreLeft.classList.toggle('visible', isLeftCollapsed);
      restoreLeft.setAttribute('aria-expanded', (!isLeftCollapsed).toString());

      restoreRight.classList.toggle('visible', isRightCollapsed);
      restoreRight.setAttribute('aria-expanded', (!isRightCollapsed).toString());

      headerToggleLeft.classList.toggle('active', !isLeftCollapsed);
      headerToggleLeft.classList.toggle('collapsed', isLeftCollapsed);
      headerToggleLeft.setAttribute('aria-pressed', (!isLeftCollapsed).toString());
      headerToggleLeft.title = isLeftCollapsed
        ? 'Expand Parameters Panel ([)'
        : 'Collapse Parameters Panel ([)';

      headerToggleRight.classList.toggle('active', !isRightCollapsed);
      headerToggleRight.classList.toggle('collapsed', isRightCollapsed);
      headerToggleRight.setAttribute('aria-pressed', (!isRightCollapsed).toString());
      headerToggleRight.title = isRightCollapsed
        ? 'Expand AI Copilot & Milestones (])'
        : 'Collapse AI Copilot & Milestones (])';
    }

    beforeEach(() => {
      document.body.innerHTML = `
        <button id="btn-header-toggle-left" class="active"></button>
        <button id="btn-header-toggle-right" class="active"></button>
        <main class="studio-workspace">
          <button id="btn-restore-pane-left" class="pane-restore-tab left"></button>
          <aside class="studio-pane studio-pane-left" id="left-pane"></aside>
          <section class="studio-canvas-center" id="center-canvas"></section>
          <aside class="studio-pane studio-pane-right" id="right-pane"></aside>
          <button id="btn-restore-pane-right" class="pane-restore-tab right"></button>
        </main>
      `;

      leftPane = document.getElementById('left-pane')!;
      rightPane = document.getElementById('right-pane')!;
      restoreLeft = document.getElementById('btn-restore-pane-left') as HTMLButtonElement;
      restoreRight = document.getElementById('btn-restore-pane-right') as HTMLButtonElement;
      headerToggleLeft = document.getElementById('btn-header-toggle-left') as HTMLButtonElement;
      headerToggleRight = document.getElementById('btn-header-toggle-right') as HTMLButtonElement;

      restoreLeft.addEventListener('click', () => store.toggleLeftPane());
      restoreRight.addEventListener('click', () => store.toggleRightPane());
      headerToggleLeft.addEventListener('click', () => store.toggleLeftPane());
      headerToggleRight.addEventListener('click', () => store.toggleRightPane());

      store.subscribe((state) => syncPaneCollapse(state));
      syncPaneCollapse(store.getState());
    });

    it('displays restore tab and updates header when left pane collapses, and clicking restores it', () => {
      // Initially expanded
      expect(leftPane.classList.contains('collapsed')).toBe(false);
      expect(restoreLeft.classList.contains('visible')).toBe(false);
      expect(headerToggleLeft.classList.contains('active')).toBe(true);

      // Collapse left pane
      store.toggleLeftPane();
      expect(leftPane.classList.contains('collapsed')).toBe(true);
      expect(restoreLeft.classList.contains('visible')).toBe(true);
      expect(headerToggleLeft.classList.contains('collapsed')).toBe(true);
      expect(headerToggleLeft.title).toBe('Expand Parameters Panel ([)');

      // User clicks the floating edge restore button to bring it back
      restoreLeft.click();
      expect(store.getState().leftPaneCollapsed).toBe(false);
      expect(leftPane.classList.contains('collapsed')).toBe(false);
      expect(restoreLeft.classList.contains('visible')).toBe(false);
      expect(headerToggleLeft.classList.contains('active')).toBe(true);
      expect(headerToggleLeft.title).toBe('Collapse Parameters Panel ([)');
    });

    it('displays restore tab and updates header when right pane collapses, and clicking header restores it', () => {
      // Collapse right pane
      store.toggleRightPane();
      expect(rightPane.classList.contains('collapsed')).toBe(true);
      expect(restoreRight.classList.contains('visible')).toBe(true);
      expect(headerToggleRight.classList.contains('collapsed')).toBe(true);
      expect(headerToggleRight.title).toBe('Expand AI Copilot & Milestones (])');

      // User clicks the top header button to bring it back
      headerToggleRight.click();
      expect(store.getState().rightPaneCollapsed).toBe(false);
      expect(rightPane.classList.contains('collapsed')).toBe(false);
      expect(restoreRight.classList.contains('visible')).toBe(false);
      expect(headerToggleRight.classList.contains('active')).toBe(true);
    });
  });
});
