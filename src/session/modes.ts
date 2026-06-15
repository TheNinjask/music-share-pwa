import { bus } from '../events';
import type { Track, Message, SessionMode } from '../types';
import * as sessionState from './state';
import * as youtube from '../player/youtube';
import { PeerHost } from '../peer/host';
import { startVote } from './vote';

export interface ModeHandler {
  handleSubmit(track: Track, host: PeerHost): void;
  handleTrackEnded(host: PeerHost): void;
}

/**
 * Override mode: immediately plays any submitted track
 */
class OverrideMode implements ModeHandler {
  handleSubmit(track: Track, host: PeerHost): void {
    playTrack(track, host);
  }

  handleTrackEnded(host: PeerHost): void {
    // Play next from queue if any (in override, queue builds up from rapid submissions)
    playNextOrStop(host);
  }
}

/**
 * Queue mode: adds tracks to queue, plays sequentially
 */
class QueueMode implements ModeHandler {
  handleSubmit(track: Track, host: PeerHost): void {
    if (!sessionState.getState().currentTrack) {
      // Nothing playing, start immediately
      playTrack(track, host);
    } else {
      // Add to queue
      sessionState.addToQueue(track);
      host.broadcast({ type: 'QUEUE_UPDATE', queue: sessionState.getState().queue });
      bus.emit('ui:show-toast', { message: `"${track.title}" added to queue`, type: 'info' });
    }
  }

  handleTrackEnded(host: PeerHost): void {
    playNextOrStop(host);
  }
}

/**
 * Democratic mode: voting before adding to queue
 */
class DemocraticMode implements ModeHandler {
  handleSubmit(track: Track, host: PeerHost): void {
    if (!sessionState.getState().currentTrack) {
      // Nothing playing, start immediately (no vote needed)
      playTrack(track, host);
    } else {
      // Start a vote
      startVote(track, host);
    }
  }

  handleTrackEnded(host: PeerHost): void {
    playNextOrStop(host);
  }
}

/**
 * Create a mode handler based on the session mode
 */
export function createModeHandler(mode: SessionMode): ModeHandler {
  switch (mode) {
    case 'override':
      return new OverrideMode();
    case 'queue':
      return new QueueMode();
    case 'democratic':
      return new DemocraticMode();
  }
}

/**
 * Play a track and broadcast to all peers
 */
function playTrack(track: Track, host: PeerHost): void {
  sessionState.setCurrentTrack(track);
  youtube.loadVideo(track.videoId);

  const syncMsg: Message = {
    type: 'SYNC',
    videoId: track.videoId,
    position: 0,
    playing: true,
    ts: Date.now(),
  };
  host.broadcast(syncMsg);
}

/**
 * Play next track from queue, or stop if empty
 */
function playNextOrStop(host: PeerHost): void {
  const next = sessionState.popNextTrack();
  if (next) {
    playTrack(next, host);
    host.broadcast({ type: 'QUEUE_UPDATE', queue: sessionState.getState().queue });
  } else {
    sessionState.setCurrentTrack(null);
    sessionState.setPlaying(false);
  }
}
