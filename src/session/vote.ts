import { bus } from '../events';
import type { Track, Message } from '../types';
import * as sessionState from './state';
import * as youtube from '../player/youtube';
import { PeerHost } from '../peer/host';

const VOTE_DURATION = 30000; // 30 seconds

interface ActiveVote {
  track: Track;
  deadline: number;
  votes: Map<string, 'yes' | 'no'>;
  timer: ReturnType<typeof setTimeout>;
}

let activeVote: ActiveVote | null = null;

/**
 * Broadcast and emit the current vote tally
 */
function emitTally(host: PeerHost): void {
  if (!activeVote) return;
  const yes = Array.from(activeVote.votes.values()).filter((v) => v === 'yes').length;
  const no = Array.from(activeVote.votes.values()).filter((v) => v === 'no').length;
  const total = sessionState.getState().members.length;

  // Emit locally for host UI
  bus.emit('vote:update', { yes, no, total });
  // Broadcast to guests
  host.broadcast({ type: 'VOTE_UPDATE', yes, no, total });
}

/**
 * Start a vote on a track (host only)
 */
export function startVote(track: Track, host: PeerHost, submitterId?: string): void {
  if (activeVote) {
    bus.emit('ui:show-toast', { message: 'A vote is already in progress', type: 'info' });
    return;
  }

  const deadline = Date.now() + VOTE_DURATION;

  activeVote = {
    track,
    deadline,
    votes: new Map(),
    timer: setTimeout(() => {
      resolveVote(host);
    }, VOTE_DURATION),
  };

  // Auto-vote yes for the submitter
  if (submitterId) {
    activeVote.votes.set(submitterId, 'yes');
  }

  // Broadcast vote start
  host.broadcast({ type: 'VOTE_START', track, deadline, submitterId: submitterId ?? '' });

  // Also emit locally for host UI
  bus.emit('vote:started', { track, deadline, submitterId: submitterId ?? '' });

  // Emit initial tally (includes auto-vote)
  emitTally(host);

  // Check if auto-vote already decides the outcome
  const yes = Array.from(activeVote.votes.values()).filter((v) => v === 'yes').length;
  const no = Array.from(activeVote.votes.values()).filter((v) => v === 'no').length;
  const total = sessionState.getState().members.length;
  const remaining = total - activeVote.votes.size;
  if (yes > no + remaining || no > yes + remaining || remaining === 0) {
    resolveVote(host);
  }
}

/**
 * Cast a vote (called on host when receiving VOTE_CAST)
 */
export function castVote(from: string, vote: 'yes' | 'no', host: PeerHost): void {
  if (!activeVote) return;

  // Don't allow double-voting
  if (activeVote.votes.has(from)) return;

  activeVote.votes.set(from, vote);

  const yes = Array.from(activeVote.votes.values()).filter((v) => v === 'yes').length;
  const no = Array.from(activeVote.votes.values()).filter((v) => v === 'no').length;
  const total = sessionState.getState().members.length;
  const remaining = total - activeVote.votes.size;

  emitTally(host);

  // Resolve early only if the outcome can no longer change
  if (yes > no + remaining || no > yes + remaining) {
    resolveVote(host);
  } else if (remaining === 0) {
    resolveVote(host);
  }
}

/**
 * Host casts their vote (for tiebreaker or just voting)
 */
export function hostVote(vote: 'yes' | 'no', host: PeerHost): void {
  if (!activeVote) return;
  const hostId = sessionState.getState().hostId;
  activeVote.votes.set(hostId, vote);

  const yes = Array.from(activeVote.votes.values()).filter((v) => v === 'yes').length;
  const no = Array.from(activeVote.votes.values()).filter((v) => v === 'no').length;
  const total = sessionState.getState().members.length;
  const remaining = total - activeVote.votes.size;

  emitTally(host);

  // Resolve early only if the outcome can no longer change
  if (yes > no + remaining || no > yes + remaining) {
    resolveVote(host);
  } else if (remaining === 0) {
    resolveVote(host);
  }
}

/**
 * Resolve the current vote
 */
function resolveVote(host: PeerHost): void {
  if (!activeVote) return;

  clearTimeout(activeVote.timer);

  const yes = Array.from(activeVote.votes.values()).filter((v) => v === 'yes').length;
  const no = Array.from(activeVote.votes.values()).filter((v) => v === 'no').length;

  // Tie? Host breaks it. If host hasn't voted, default to 'no'
  let approved: boolean;
  if (yes > no) {
    approved = true;
  } else if (no > yes) {
    approved = false;
  } else {
    // Tie - check host's vote
    const hostId = sessionState.getState().hostId;
    const hostVoteValue = activeVote.votes.get(hostId);
    approved = hostVoteValue === 'yes';
  }

  const track = activeVote.track;

  // Broadcast result
  host.broadcast({ type: 'VOTE_RESULT', approved, track });
  bus.emit('vote:ended', { approved, track });

  if (approved) {
    if (!sessionState.getState().currentTrack) {
      // Nothing playing — start it immediately
      sessionState.setCurrentTrack(track);
      youtube.loadVideo(track.videoId);
      const syncMsg: Message = {
        type: 'SYNC',
        videoId: track.videoId,
        position: 0,
        playing: true,
        ts: Date.now(),
        title: track.title,
        submittedBy: track.submittedBy,
      };
      host.broadcast(syncMsg);
      bus.emit('ui:show-toast', { message: `"${track.title}" approved! Now playing.`, type: 'success' });
    } else {
      sessionState.addToQueue(track);
      host.broadcast({ type: 'QUEUE_UPDATE', queue: sessionState.getState().queue });
      bus.emit('ui:show-toast', { message: `"${track.title}" approved and added to queue!`, type: 'success' });
    }
  } else {
    bus.emit('ui:show-toast', { message: `"${track.title}" was rejected`, type: 'info' });
  }

  activeVote = null;
}

/**
 * Check if a vote is currently active
 */
export function isVoteActive(): boolean {
  return activeVote !== null;
}

/**
 * Get the current vote state (for UI)
 */
export function getVoteState(): { track: Track; deadline: number; yes: number; no: number } | null {
  if (!activeVote) return null;

  const yes = Array.from(activeVote.votes.values()).filter((v) => v === 'yes').length;
  const no = Array.from(activeVote.votes.values()).filter((v) => v === 'no').length;

  return {
    track: activeVote.track,
    deadline: activeVote.deadline,
    yes,
    no,
  };
}
