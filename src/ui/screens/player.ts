import { bus } from '../../events';
import { navigate } from '../../router';
import { html, formatTime } from '../render';
import * as sessionState from '../../session/state';
import * as youtube from '../../player/youtube';
import { getHostInstance, getModeHandler } from './create';
import { getGuestInstance } from './join';
import { renderSharePanel } from '../components/share';
import { renderQueuePanel } from '../components/queue';
import { renderVoteOverlay } from '../components/vote';
import { renderMembersPanel } from '../components/members';
import type { Track, SessionMode } from '../../types';

let progressTimer: ReturnType<typeof setInterval> | null = null;

export function renderPlayer(container: HTMLElement): void {
  const state = sessionState.getState();
  const isHost = getHostInstance() !== null;
  const isGuest = getGuestInstance() !== null;

  // No active session — stop audio and redirect to home
  if (!isHost && !isGuest) {
    youtube.pause();
    navigate('/');
    return;
  }

  html(container, `
    <div class="flex-1 flex flex-col gap-4">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold">Now Playing</h2>
          <div class="flex items-center gap-2 mt-0.5">
            <span id="mode-badge" class="badge-${state.mode === 'democratic' ? 'yellow' : state.mode === 'override' ? 'primary' : 'green'}">${state.mode}</span>
            ${isHost ? '<span class="badge-primary">Host</span>' : '<span class="badge-green">Guest</span>'}
          </div>
        </div>
        <button id="btn-share" class="btn-secondary text-sm">
          Share
        </button>
      </div>

      <!-- Track Info -->
      <div class="card" id="track-info">
        <div id="track-title" class="font-medium text-lg truncate">
          ${state.currentTrack?.title ?? 'No track playing'}
        </div>
        <div id="track-submitter" class="text-sm text-slate-400 mt-1">
          ${state.currentTrack ? `Submitted by ${state.currentTrack.submittedBy}` : 'Submit a YouTube link to start'}
        </div>

        <!-- Progress -->
        <div class="mt-3" id="progress-container" style="${state.currentTrack ? '' : 'display:none'}">
          <div class="w-full bg-slate-700 rounded-full h-1.5">
            <div id="progress-bar" class="bg-primary-500 h-1.5 rounded-full transition-all duration-1000" style="width: 0%"></div>
          </div>
          <div class="flex justify-between text-xs text-slate-500 mt-1">
            <span id="time-current">0:00</span>
            <span id="time-duration">0:00</span>
          </div>
        </div>

        <!-- Controls (host only) -->
        ${isHost ? `
        <div id="player-controls" class="flex items-center justify-center gap-4 mt-4" style="${state.currentTrack ? '' : 'display:none'}">
          <button id="btn-play-pause" class="w-12 h-12 rounded-full bg-primary-500 hover:bg-primary-600 flex items-center justify-center transition-colors">
            <span id="play-icon">${state.isPlaying ? '&#9646;&#9646;' : '&#9654;'}</span>
          </button>
          <button id="btn-skip" class="w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors text-sm">
            &#9654;&#9654;
          </button>
        </div>
        ` : ''}
      </div>

      <!-- Submit URL -->
      <div class="card">
        <label class="block text-sm font-medium text-slate-300 mb-2">Submit a track</label>
        <div class="flex gap-2">
          <input id="url-input" type="url" class="input flex-1" placeholder="Paste YouTube URL..." />
          <button id="btn-submit" class="btn-primary">Add</button>
        </div>
      </div>

      <!-- Queue -->
      <div id="queue-panel"></div>

      <!-- Members -->
      <div id="members-panel"></div>

      <!-- Share Modal -->
      <div id="share-modal" class="hidden"></div>

      <!-- Vote Overlay -->
      <div id="vote-overlay" class="hidden"></div>

      <!-- Ad Blocker Banner -->
      <div id="ad-banner" class="hidden fixed top-0 left-0 right-0 bg-yellow-600/90 text-white text-center text-sm py-2 px-4 z-50">
        ⚠️ Ad detected — audio muted until it ends
      </div>
    </div>
  `);

  // Bind controls
  bindControls(container, isHost);

  // Render sub-panels
  renderQueuePanel(container.querySelector('#queue-panel')!);
  renderMembersPanel(container.querySelector('#members-panel')!);

  // Subscribe to state updates
  setupListeners(container, isHost);

  // Start progress tracking
  startProgressTracking(container);
}

function bindControls(container: HTMLElement, isHost: boolean): void {
  const urlInput = container.querySelector('#url-input') as HTMLInputElement;
  const btnSubmit = container.querySelector('#btn-submit') as HTMLButtonElement;
  const btnShare = container.querySelector('#btn-share') as HTMLButtonElement;

  // Submit track
  btnSubmit.addEventListener('click', () => submitTrack(urlInput));
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitTrack(urlInput);
  });

  // Share
  btnShare.addEventListener('click', () => {
    const modal = container.querySelector('#share-modal') as HTMLElement;
    modal.classList.remove('hidden');
    const state = sessionState.getState();
    renderSharePanel(modal, state.hostId);
  });

  // Host controls
  if (isHost) {
    const btnPlayPause = container.querySelector('#btn-play-pause') as HTMLButtonElement;
    const btnSkip = container.querySelector('#btn-skip') as HTMLButtonElement;
    const host = getHostInstance()!;

    btnPlayPause?.addEventListener('click', () => {
      const state = sessionState.getState();
      if (state.isPlaying) {
        youtube.pause();
        sessionState.setPlaying(false);
        host.broadcast({
          type: 'SYNC',
          videoId: state.currentTrack!.videoId,
          position: youtube.getCurrentTime(),
          playing: false,
          ts: Date.now(),
        });
      } else {
        youtube.play();
        sessionState.setPlaying(true);
        host.broadcast({
          type: 'SYNC',
          videoId: state.currentTrack!.videoId,
          position: youtube.getCurrentTime(),
          playing: true,
          ts: Date.now(),
        });
      }
      updatePlayPauseButton(container);
    });

    btnSkip?.addEventListener('click', () => {
      getModeHandler()?.handleTrackEnded(host);
    });
  }
}

async function submitTrack(urlInput: HTMLInputElement): Promise<void> {
  const url = urlInput.value.trim();
  if (!url) return;

  const videoId = youtube.extractVideoId(url);
  if (!videoId) {
    bus.emit('ui:show-toast', { message: 'Invalid YouTube URL', type: 'error' });
    return;
  }

  urlInput.value = '';
  urlInput.disabled = true;

  const title = await youtube.getVideoTitle(videoId);
  const state = sessionState.getState();

  const isHost = getHostInstance() !== null;

  if (isHost) {
    // Host handles submission directly via mode handler
    const track: Track = { videoId, title, submittedBy: state.members.find(m => m.isHost)?.name ?? 'Host' };
    getModeHandler()?.handleSubmit(track, getHostInstance()!, state.hostId);
  } else {
    // Guest sends to host
    const guestName = state.members.find(m => !m.isHost)?.name ?? 'Guest';
    getGuestInstance()?.send({
      type: 'SUBMIT',
      videoId,
      title,
      submittedBy: guestName,
    });
    bus.emit('ui:show-toast', { message: 'Track submitted!', type: 'success' });
  }

  urlInput.disabled = false;
}

function setupListeners(container: HTMLElement, _isHost: boolean): void {
  bus.on('session:track-change', ({ track }) => {
    updateTrackDisplay(container, track);
  });

  bus.on('session:state-update', (state) => {
    updatePlayPauseButton(container);
    updateModeBadge(container, state.mode);
    renderQueuePanel(container.querySelector('#queue-panel')!);
    renderMembersPanel(container.querySelector('#members-panel')!);
  });

  bus.on('vote:started', ({ track, deadline, submitterId }) => {
    const overlay = container.querySelector('#vote-overlay') as HTMLElement;
    overlay.classList.remove('hidden');
    renderVoteOverlay(overlay, track, deadline, submitterId);
  });

  bus.on('vote:ended', () => {
    const overlay = container.querySelector('#vote-overlay') as HTMLElement;
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  });

  // Ad blocker UI feedback
  bus.on('player:ad-blocked', () => {
    const adBanner = container.querySelector('#ad-banner') as HTMLElement | null;
    if (adBanner) {
      adBanner.classList.remove('hidden');
    }
    bus.emit('ui:show-toast', { message: 'Ad detected — audio muted', type: 'info' });
  });

  bus.on('player:ad-ended', () => {
    const adBanner = container.querySelector('#ad-banner') as HTMLElement | null;
    if (adBanner) {
      adBanner.classList.add('hidden');
    }
  });
}

function updateTrackDisplay(container: HTMLElement, track: Track | null): void {
  const titleEl = container.querySelector('#track-title');
  const submitterEl = container.querySelector('#track-submitter');
  const progressContainer = container.querySelector('#progress-container') as HTMLElement;
  const playerControls = container.querySelector('#player-controls') as HTMLElement | null;

  if (titleEl) {
    titleEl.textContent = track?.title ?? 'No track playing';
  }
  if (submitterEl) {
    submitterEl.textContent = track ? `Submitted by ${track.submittedBy}` : 'Submit a YouTube link to start';
  }
  if (progressContainer) {
    progressContainer.style.display = track ? '' : 'none';
  }
  if (playerControls) {
    playerControls.style.display = track ? '' : 'none';
  }
}

function updateModeBadge(container: HTMLElement, mode: SessionMode): void {
  const badge = container.querySelector('#mode-badge');
  if (badge) {
    const badgeClass = mode === 'democratic' ? 'badge-yellow' : mode === 'override' ? 'badge-primary' : 'badge-green';
    badge.className = badgeClass;
    badge.textContent = mode;
  }
}

function updatePlayPauseButton(container: HTMLElement): void {
  const icon = container.querySelector('#play-icon');
  if (icon) {
    const state = sessionState.getState();
    icon.innerHTML = state.isPlaying ? '&#9646;&#9646;' : '&#9654;';
  }
}

function startProgressTracking(container: HTMLElement): void {
  if (progressTimer) clearInterval(progressTimer);

  progressTimer = setInterval(() => {
    const state = sessionState.getState();
    if (!state.currentTrack || !state.isPlaying) return;

    const current = youtube.getCurrentTime();
    const duration = youtube.getDuration();

    if (duration > 0) {
      const pct = (current / duration) * 100;
      const bar = container.querySelector('#progress-bar') as HTMLElement;
      const timeCurrent = container.querySelector('#time-current');
      const timeDuration = container.querySelector('#time-duration');

      if (bar) bar.style.width = `${pct}%`;
      if (timeCurrent) timeCurrent.textContent = formatTime(current);
      if (timeDuration) timeDuration.textContent = formatTime(duration);
    }
  }, 1000);
}
