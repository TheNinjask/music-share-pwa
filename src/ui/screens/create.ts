import { navigate } from '../../router';
import { html } from '../render';
import { PeerHost } from '../../peer/host';
import { initState } from '../../session/state';
import { createModeHandler, ModeHandler } from '../../session/modes';
import { initHostSync } from '../../player/sync';
import { initPlayer } from '../../player/youtube';
import { bus } from '../../events';
import { castVote } from '../../session/vote';
import * as sessionState from '../../session/state';
import type { SessionMode, Message } from '../../types';

// Store host instance globally for use by the session
let hostInstance: PeerHost | null = null;
let modeHandler: ModeHandler | null = null;

export function getHostInstance(): PeerHost | null {
  return hostInstance;
}

export function getModeHandler(): ModeHandler | null {
  return modeHandler;
}

export function renderCreate(container: HTMLElement): void {
  html(container, `
    <div class="flex-1 flex flex-col gap-6">
      <div>
        <button id="btn-back" class="text-slate-400 hover:text-white transition-colors">
          &larr; Back
        </button>
        <h2 class="text-2xl font-bold mt-2">Create Session</h2>
        <p class="text-slate-400 text-sm mt-1">Set up your listening room</p>
      </div>

      <div class="card">
        <label class="block text-sm font-medium text-slate-300 mb-2">Your Name</label>
        <input id="host-name" type="text" class="input" placeholder="Enter your name" maxlength="20" />
      </div>

      <div class="card">
        <label class="block text-sm font-medium text-slate-300 mb-3">Playback Mode</label>

        <div class="flex flex-col gap-2" id="mode-options">
          <label class="flex items-start gap-3 p-3 rounded-lg border border-slate-600 cursor-pointer hover:border-primary-500 transition-colors has-[:checked]:border-primary-500 has-[:checked]:bg-primary-500/10">
            <input type="radio" name="mode" value="queue" class="mt-1" checked />
            <div>
              <div class="font-medium">Queue</div>
              <div class="text-xs text-slate-400">Tracks play in order. New submissions go to the end.</div>
            </div>
          </label>

          <label class="flex items-start gap-3 p-3 rounded-lg border border-slate-600 cursor-pointer hover:border-primary-500 transition-colors has-[:checked]:border-primary-500 has-[:checked]:bg-primary-500/10">
            <input type="radio" name="mode" value="override" class="mt-1" />
            <div>
              <div class="font-medium">Override</div>
              <div class="text-xs text-slate-400">Any submission immediately starts playing for everyone.</div>
            </div>
          </label>

          <label class="flex items-start gap-3 p-3 rounded-lg border border-slate-600 cursor-pointer hover:border-primary-500 transition-colors has-[:checked]:border-primary-500 has-[:checked]:bg-primary-500/10">
            <input type="radio" name="mode" value="democratic" class="mt-1" />
            <div>
              <div class="font-medium">Democratic</div>
              <div class="text-xs text-slate-400">Group votes on each submission. Host breaks ties.</div>
            </div>
          </label>
        </div>
      </div>

      <button id="btn-start" class="btn-primary text-lg py-3 mt-auto">
        Start Session
      </button>

      <div id="status" class="text-center text-slate-400 text-sm hidden">
        <div class="animate-pulse">Creating session...</div>
      </div>
    </div>
  `);

  const btnBack = container.querySelector('#btn-back') as HTMLButtonElement;
  const btnStart = container.querySelector('#btn-start') as HTMLButtonElement;
  const nameInput = container.querySelector('#host-name') as HTMLInputElement;
  const statusDiv = container.querySelector('#status') as HTMLElement;

  btnBack.addEventListener('click', () => navigate('/'));

  btnStart.addEventListener('click', async () => {
    const name = nameInput.value.trim() || 'Host';
    const mode = (container.querySelector('input[name="mode"]:checked') as HTMLInputElement).value as SessionMode;

    btnStart.disabled = true;
    statusDiv.classList.remove('hidden');

    try {
      // Initialize player
      await initPlayer();

      // Create host peer
      hostInstance = new PeerHost();
      const hostId = await hostInstance.init(name);

      // Initialize session state
      initState(mode, hostId, name);

      // Create mode handler
      modeHandler = createModeHandler(mode);

      // Set up host sync (heartbeat broadcasts)
      initHostSync(
        (msg) => hostInstance!.broadcast(msg),
        () => sessionState.getState().currentTrack?.videoId ?? null
      );

      // Listen for messages from guests
      bus.on('peer:message', ({ from, message }) => {
        handleHostMessage(from, message);
      });

      // Listen for track ended
      bus.on('player:ended', () => {
        modeHandler!.handleTrackEnded(hostInstance!);
      });

      // Navigate to session view
      navigate('/session');
    } catch (err) {
      statusDiv.innerHTML = `<span class="text-red-400">Error: ${(err as Error).message}</span>`;
      btnStart.disabled = false;
    }
  });
}

function handleHostMessage(from: string, message: Message): void {
  if (!hostInstance || !modeHandler) return;

  switch (message.type) {
    case 'SUBMIT': {
      const track = {
        videoId: message.videoId,
        title: message.title,
        submittedBy: message.submittedBy,
      };
      modeHandler.handleSubmit(track, hostInstance);
      break;
    }
    case 'VOTE_CAST': {
      castVote(from, message.vote, hostInstance);
      break;
    }
    case 'PING': {
      hostInstance.sendTo(from, {
        type: 'PONG',
        clientTs: message.ts,
        hostTs: Date.now(),
      });
      break;
    }
    case 'TRACK_ENDED': {
      // Guest reports track ended - host already handles this
      break;
    }
    case 'SKIP': {
      // Only host can skip - handle if needed
      modeHandler.handleTrackEnded(hostInstance);
      break;
    }
    default:
      break;
  }
}
