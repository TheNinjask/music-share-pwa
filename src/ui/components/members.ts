import * as sessionState from '../../session/state';
import { html } from '../render';

export function renderMembersPanel(container: HTMLElement): void {
  const state = sessionState.getState();

  const memberItems = state.members
    .map((member) => `
      <div class="flex items-center gap-2 py-1.5">
        <div class="w-7 h-7 rounded-full bg-primary-500/30 flex items-center justify-center text-xs font-bold text-primary-300">
          ${member.name.charAt(0).toUpperCase()}
        </div>
        <span class="text-sm">${member.name}</span>
        ${member.isHost ? '<span class="badge-primary text-[10px]">Host</span>' : ''}
      </div>
    `)
    .join('');

  html(container, `
    <div class="card">
      <h3 class="text-sm font-medium text-slate-300 mb-2">Members (${state.members.length})</h3>
      <div class="max-h-32 overflow-y-auto">
        ${memberItems}
      </div>
    </div>
  `);
}
