import { html } from '../render';
import { bus } from '../../events';
import { getHostInstance } from '../screens/create';
import { getGuestInstance } from '../screens/join';
import { hostVote } from '../../session/vote';
import type { Track } from '../../types';

export function renderVoteOverlay(container: HTMLElement, track: Track, deadline: number): void {
  const isHost = getHostInstance() !== null;

  html(container, `
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
      <div class="card max-w-sm w-full">
        <h3 class="text-lg font-bold">Vote: Add to Queue?</h3>
        <div class="mt-3">
          <div class="font-medium">${track.title}</div>
          <div class="text-sm text-slate-400">Submitted by ${track.submittedBy}</div>
        </div>

        <div class="mt-4">
          <div class="text-sm text-slate-400 mb-2">
            Time remaining: <span id="vote-timer" class="font-mono text-primary-300"></span>
          </div>
          <div class="flex gap-3 text-center text-sm mb-3">
            <div class="flex-1 bg-green-900/30 rounded-lg py-2">
              <span id="vote-yes-count" class="text-green-400 font-bold">0</span> Yes
            </div>
            <div class="flex-1 bg-red-900/30 rounded-lg py-2">
              <span id="vote-no-count" class="text-red-400 font-bold">0</span> No
            </div>
          </div>
        </div>

        <div class="flex gap-3 mt-4" id="vote-buttons">
          <button id="btn-vote-yes" class="flex-1 btn bg-green-600 hover:bg-green-700 text-white">
            Vote Yes
          </button>
          <button id="btn-vote-no" class="flex-1 btn bg-red-600 hover:bg-red-700 text-white">
            Vote No
          </button>
        </div>
      </div>
    </div>
  `);

  // Timer countdown
  const timerEl = container.querySelector('#vote-timer')!;
  const updateTimer = () => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    timerEl.textContent = `${remaining}s`;
    if (remaining > 0) {
      requestAnimationFrame(() => setTimeout(updateTimer, 250));
    }
  };
  updateTimer();

  // Vote tally updates
  bus.on('vote:update', ({ yes, no }) => {
    const yesCount = container.querySelector('#vote-yes-count');
    const noCount = container.querySelector('#vote-no-count');
    if (yesCount) yesCount.textContent = String(yes);
    if (noCount) noCount.textContent = String(no);
  });

  // Button handlers
  const btnYes = container.querySelector('#btn-vote-yes') as HTMLButtonElement;
  const btnNo = container.querySelector('#btn-vote-no') as HTMLButtonElement;
  const buttonsDiv = container.querySelector('#vote-buttons') as HTMLElement;

  const handleVote = (vote: 'yes' | 'no') => {
    buttonsDiv.innerHTML = '<p class="text-slate-400 text-sm text-center w-full">Vote submitted!</p>';

    if (isHost) {
      hostVote(vote, getHostInstance()!);
    } else {
      getGuestInstance()?.send({ type: 'VOTE_CAST', vote, from: '' });
    }
  };

  btnYes.addEventListener('click', () => handleVote('yes'));
  btnNo.addEventListener('click', () => handleVote('no'));
}
