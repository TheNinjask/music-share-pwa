import { navigate } from '../../router';
import { html } from '../render';

export function renderHome(container: HTMLElement): void {
  html(container, `
    <div class="flex-1 flex flex-col items-center justify-center text-center gap-8">
      <div>
        <h1 class="text-4xl font-bold bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent">
          Music Share
        </h1>
        <p class="text-slate-400 mt-2">Listen to YouTube together in real-time</p>
      </div>

      <div class="w-full max-w-sm flex flex-col gap-3">
        <button id="btn-create" class="btn-primary text-lg py-3">
          Create Session
        </button>
        <p class="text-slate-500 text-sm">
          Start a new listening session and invite friends
        </p>
      </div>

      <div class="text-slate-600 text-xs mt-8">
        <p>Powered by WebRTC &bull; No server needed</p>
        <p class="mt-1">Share music peer-to-peer</p>
      </div>
    </div>
  `);

  container.querySelector('#btn-create')!.addEventListener('click', () => {
    navigate('/create');
  });
}
