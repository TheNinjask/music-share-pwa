import { bus } from '../events';
import type { SessionState, Track, Member, SessionMode } from '../types';

let state: SessionState = {
  mode: 'queue',
  hostId: '',
  currentTrack: null,
  queue: [],
  members: [],
  isPlaying: false,
  position: 0,
};

/**
 * Get current session state
 */
export function getState(): SessionState {
  return { ...state };
}

/**
 * Initialize session state
 */
export function initState(mode: SessionMode, hostId: string, hostName: string): void {
  state = {
    mode,
    hostId,
    currentTrack: null,
    queue: [],
    members: [{ id: hostId, name: hostName, isHost: true }],
    isPlaying: false,
    position: 0,
  };
  emitUpdate();
}

/**
 * Restore session state from a snapshot (for guests)
 */
export function restoreState(snapshot: SessionState): void {
  state = { ...snapshot };
  emitUpdate();
}

/**
 * Set the current track
 */
export function setCurrentTrack(track: Track | null): void {
  state.currentTrack = track;
  state.isPlaying = track !== null;
  state.position = 0;
  bus.emit('session:track-change', { track });
  emitUpdate();
}

/**
 * Add a track to the queue
 */
export function addToQueue(track: Track): void {
  state.queue.push(track);
  bus.emit('session:queue-update', { queue: [...state.queue] });
  emitUpdate();
}

/**
 * Remove a track from the queue by index
 */
export function removeFromQueue(index: number): void {
  state.queue.splice(index, 1);
  bus.emit('session:queue-update', { queue: [...state.queue] });
  emitUpdate();
}

/**
 * Pop the next track from the queue
 */
export function popNextTrack(): Track | null {
  const next = state.queue.shift() ?? null;
  if (next) {
    bus.emit('session:queue-update', { queue: [...state.queue] });
  }
  emitUpdate();
  return next;
}

/**
 * Update the queue entirely
 */
export function setQueue(queue: Track[]): void {
  state.queue = [...queue];
  bus.emit('session:queue-update', { queue: [...state.queue] });
  emitUpdate();
}

/**
 * Update members list
 */
export function setMembers(members: Member[]): void {
  state.members = [...members];
  emitUpdate();
}

/**
 * Update playing state
 */
export function setPlaying(playing: boolean): void {
  state.isPlaying = playing;
  emitUpdate();
}

/**
 * Update current position
 */
export function setPosition(position: number): void {
  state.position = position;
}

/**
 * Get session mode
 */
export function getMode(): SessionMode {
  return state.mode;
}

function emitUpdate(): void {
  bus.emit('session:state-update', { ...state });
}
