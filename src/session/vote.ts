import { bus } from '../events';
import type { Track } from '../types';
import * as sessionState from './state';
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
 * Start a vote on a track (host only)
 */
export function startVote(track: Track, host: PeerHost): void {
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

  // Broadcast vote start
  host.broadcast({ type: 'VOTE_START', track, deadline });

  // Also emit locally for host UI
  bus.emit('vote:started', { track, deadline });
}

/**
 * Cast a vote (called on host when receiving VOTE_CAST)
 */
export function castVote(from: string, vote: 'yes' | 'no', host: PeerHost): void {
  if (!activeVote) return;

  // Don't allow double-voting
  if (activeVote.votes.has(from)) return;

  activeVote.votes.set(from, vote);

  // Broadcast vote tally update
  const yes = Array.from(activeVote.votes.values()).filter((v) => v === 'yes').length;
  const no = Array.from(activeVote.votes.values()).filter((v) => v === 'no').length;
  const total = sessionState.getState().members.length;

  bus.emit('vote:update', { yes, no, total });

  // Check if all members have voted (early resolution)
  if (activeVote.votes.size >= total - 1) {
    // -1 because host votes as tiebreaker only
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

  // Check resolution
  const total = sessionState.getState().members.length;
  if (activeVote.votes.size >= total) {
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
    sessionState.addToQueue(track);
    host.broadcast({ type: 'QUEUE_UPDATE', queue: sessionState.getState().queue });
    bus.emit('ui:show-toast', { message: `"${track.title}" approved and added to queue!`, type: 'success' });
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
