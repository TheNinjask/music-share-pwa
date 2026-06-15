import { navigate } from '../../router';
import { html } from '../render';
import { PeerGuest } from '../../peer/guest';
import { bus } from '../../events';
import { restoreState } from '../../session/state';
import { initPlayer, loadVideo, play, pause, getVideoTitle } from '../../player/youtube';
import { handleSyncMessage, setClockOffset } from '../../player/sync';
import * as sessionState from '../../session/state';
import type { Message } from '../../types';

let guestInstance: PeerGuest | null = null;

export function getGuestInstance(): PeerGuest | null {
  return guestInstance;
}

export function renderJoin(container: HTMLElement, hostId: string): void {
  html(container, `
    <div class="flex-1 flex flex-col items-center justify-center gap-6">
      <div class="text-center">
        <h2 class="text-2xl font-bold">Join Session</h2>
        <p class="text-slate-400 text-sm mt-1">Connect to the host's listening room</p>
      </div>

      <div class="w-full max-w-sm card">
        <label class="block text-sm font-medium text-slate-300 mb-2">Your Name</label>
        <input id="guest-name" type="text" class="input" placeholder="Enter your name" maxlength="20" />
      </div>

      <button id="btn-join" class="btn-primary w-full max-w-sm py-3">
        Join
      </button>

      <div id="status" class="text-center text-slate-400 text-sm hidden">
        <div class="animate-pulse">Connecting...</div>
      </div>

      <button id="btn-back" class="text-slate-500 hover:text-slate-300 text-sm transition-colors">
        &larr; Back to home
      </button>
    </div>
  `);

  const btnJoin = container.querySelector('#btn-join') as HTMLButtonElement;
  const btnBack = container.querySelector('#btn-back') as HTMLButtonElement;
  const nameInput = container.querySelector('#guest-name') as HTMLInputElement;
  const statusDiv = container.querySelector('#status') as HTMLElement;

  btnBack.addEventListener('click', () => navigate('/'));

  btnJoin.addEventListener('click', async () => {
    const name = nameInput.value.trim() || 'Guest';

    btnJoin.disabled = true;
    statusDiv.classList.remove('hidden');

    try {
      // Initialize player first
      await initPlayer();

      // Connect to host
      guestInstance = new PeerGuest();
      await guestInstance.connect(hostId, name);

      // Listen for messages from host
      bus.on('peer:message', ({ message }) => {
        handleGuestMessage(message);
      });

      // Listen for track ended to notify host
      bus.on('player:ended', () => {
        guestInstance?.send({ type: 'TRACK_ENDED' });
      });

      // If disconnected from host, redirect to home
      bus.on('peer:disconnected', () => {
        guestInstance?.destroy();
        guestInstance = null;
        pause();
        bus.emit('ui:show-toast', { message: 'Lost connection to host', type: 'error' });
        navigate('/');
      });

      // Update clock offset periodically
      setInterval(() => {
        if (guestInstance) {
          setClockOffset(guestInstance.clockOffset);
        }
      }, 10000);

      // Navigate to session view
      navigate('/session');
    } catch (err) {
      statusDiv.innerHTML = `<span class="text-red-400">Failed to connect: ${(err as Error).message}</span>`;
      btnJoin.disabled = false;
    }
  });
}

function handleGuestMessage(message: Message): void {
  switch (message.type) {
    case 'STATE_SNAPSHOT': {
      restoreState(message.state);
      // If there's a currently playing track, load it
      if (message.state.currentTrack) {
        loadVideo(message.state.currentTrack.videoId, message.state.position);
        if (message.state.isPlaying) {
          play();
        }
      }
      break;
    }
    case 'SYNC': {
      // Empty videoId means playback has stopped
      if (!message.videoId) {
        pause();
        sessionState.setCurrentTrack(null);
        sessionState.setPlaying(false);
        sessionState.setPosition(0);
        break;
      }

      // Load video if it's a new track
      const currentState = sessionState.getState();
      if (currentState.currentTrack?.videoId !== message.videoId) {
        loadVideo(message.videoId, message.position);
        sessionState.setCurrentTrack({
          videoId: message.videoId,
          title: message.title ?? 'Loading...',
          submittedBy: message.submittedBy ?? '',
        });

        // Fetch the actual title if not provided
        if (!message.title) {
          getVideoTitle(message.videoId).then((title) => {
            const state = sessionState.getState();
            if (state.currentTrack?.videoId === message.videoId) {
              sessionState.setCurrentTrack({
                ...state.currentTrack,
                title,
              });
            }
          });
        }
      }
      handleSyncMessage(message);

      if (message.playing) {
        play();
        sessionState.setPlaying(true);
      } else {
        pause();
        sessionState.setPlaying(false);
      }
      sessionState.setPosition(message.position);
      break;
    }
    case 'QUEUE_UPDATE': {
      sessionState.setQueue(message.queue);
      break;
    }
    case 'MEMBER_UPDATE': {
      sessionState.setMembers(message.members);
      break;
    }
    case 'VOTE_START': {
      bus.emit('vote:started', { track: message.track, deadline: message.deadline, submitterId: message.submitterId });
      break;
    }
    case 'VOTE_RESULT': {
      bus.emit('vote:ended', { approved: message.approved, track: message.track });
      if (message.approved) {
        bus.emit('ui:show-toast', { message: `"${message.track.title}" approved!`, type: 'success' });
      } else {
        bus.emit('ui:show-toast', { message: `"${message.track.title}" was rejected`, type: 'info' });
      }
      break;
    }
    case 'VOTE_UPDATE': {
      bus.emit('vote:update', { yes: message.yes, no: message.no, total: message.total });
      break;
    }
    case 'PONG': {
      // Handled by PeerGuest internally
      break;
    }
    default:
      break;
  }

}
