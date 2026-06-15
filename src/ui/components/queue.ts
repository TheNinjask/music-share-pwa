import * as sessionState from '../../session/state';
import { html } from '../render';

export function renderQueuePanel(container: HTMLElement): void {
  const state = sessionState.getState();

  if (state.queue.length === 0) {
    html(container, `
      <div class="card">
        <h3 class="text-sm font-medium text-slate-300 mb-2">Queue</h3>
        <p class="text-slate-500 text-sm">No tracks in queue</p>
      </div>
    `);
    return;
  }

  const trackItems = state.queue
    .map((track, index) => `
      <div class="flex items-center gap-3 py-2 ${index > 0 ? 'border-t border-slate-700' : ''}">
        <span class="text-slate-500 text-sm w-5">${index + 1}</span>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">${track.title}</div>
          <div class="text-xs text-slate-500">${track.submittedBy}</div>
        </div>
      </div>
    `)
    .join('');

  html(container, `
    <div class="card">
      <h3 class="text-sm font-medium text-slate-300 mb-2">Queue (${state.queue.length})</h3>
      <div class="max-h-48 overflow-y-auto">
        ${trackItems}
      </div>
    </div>
  `);
}
