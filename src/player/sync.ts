import { bus } from '../events';
import * as youtube from './youtube';

const HEARTBEAT_INTERVAL = 5000; // 5 seconds
const DRIFT_THRESHOLD = 0.5; // 500ms

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let isHost = false;
let clockOffset = 0; // For guests: offset to convert local time to host time

/**
 * Initialize sync engine for the host
 * Host periodically broadcasts its playback state
 */
export function initHostSync(broadcastFn: (msg: { type: 'SYNC'; videoId: string; position: number; playing: boolean; ts: number }) => void, getCurrentVideoId: () => string | null): void {
  isHost = true;

  // Start heartbeat
  heartbeatTimer = setInterval(() => {
    const videoId = getCurrentVideoId();
    if (!videoId) return;

    // Don't broadcast during ads — position would be wrong
    if (youtube.isAdActive()) return;

    broadcastFn({
      type: 'SYNC',
      videoId,
      position: youtube.getCurrentTime(),
      playing: youtube.isPlaying(),
      ts: Date.now(),
    });
  }, HEARTBEAT_INTERVAL);

  // Handle PING messages for clock sync
  bus.on('peer:message', ({ from, message }) => {
    if (message.type === 'PING') {
      // Reply with PONG including our timestamp
      // The sendTo function needs to be available - we'll use an event
      void from; // used by the session controller
      void message; // handled by session controller
    }
  });
}

/**
 * Handle incoming sync message (for guests)
 */
export function handleSyncMessage(msg: { type: 'SYNC'; videoId: string; position: number; playing: boolean; ts: number }): void {
  if (isHost) return;

  // Don't fight the player during an ad — wait for it to finish
  if (youtube.isAdActive()) return;

  // Calculate what the host's position should be now, accounting for network delay
  const networkDelay = (Date.now() - msg.ts + clockOffset) / 1000; // seconds
  const expectedPosition = msg.position + (msg.playing ? networkDelay : 0);

  const currentPosition = youtube.getCurrentTime();
  const drift = Math.abs(currentPosition - expectedPosition);

  // If drift exceeds threshold, correct it
  if (drift > DRIFT_THRESHOLD) {
    youtube.seekTo(expectedPosition);
  }

  // Match play/pause state
  if (msg.playing && !youtube.isPlaying()) {
    youtube.play();
  } else if (!msg.playing && youtube.isPlaying()) {
    youtube.pause();
  }
}

/**
 * Set the clock offset (for guests, from NTP-lite sync)
 */
export function setClockOffset(offset: number): void {
  clockOffset = offset;
}

/**
 * Stop the sync engine
 */
export function stopSync(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  isHost = false;
  clockOffset = 0;
}
