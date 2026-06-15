import { bus } from '../events';

// YouTube IFrame API types
declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

declare namespace YT {
  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }

  interface PlayerOptions {
    height: string;
    width: string;
    videoId?: string;
    playerVars?: Record<string, number | string>;
    events?: {
      onReady?: (event: { target: Player }) => void;
      onStateChange?: (event: { data: PlayerState }) => void;
      onError?: (event: { data: number }) => void;
    };
  }

  class Player {
    constructor(elementId: string, options: PlayerOptions);
    loadVideoById(videoId: string, startSeconds?: number): void;
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead?: boolean): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): PlayerState;
    setVolume(volume: number): void;
    getVolume(): number;
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
    destroy(): void;
  }
}

let player: YT.Player | null = null;
let isReady = false;
let apiLoaded = false;

/**
 * Load the YouTube IFrame API script
 */
function loadYouTubeAPI(): Promise<void> {
  if (apiLoaded) return Promise.resolve();

  return new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScript = document.getElementsByTagName('script')[0];
    firstScript.parentNode!.insertBefore(tag, firstScript);

    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true;
      resolve();
    };
  });
}

/**
 * Initialize the YouTube player
 */
export async function initPlayer(): Promise<void> {
  await loadYouTubeAPI();

  // Create a container div for the player
  const container = document.getElementById('youtube-container')!;
  const playerDiv = document.createElement('div');
  playerDiv.id = 'yt-player';
  container.appendChild(playerDiv);

  return new Promise((resolve) => {
    player = new YT.Player('yt-player', {
      height: '1',
      width: '1',
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          isReady = true;
          bus.emit('player:ready');
          resolve();
        },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.ENDED) {
            bus.emit('player:ended');
          }
          if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.PAUSED) {
            bus.emit('player:state-change', {
              playing: event.data === YT.PlayerState.PLAYING,
              position: player?.getCurrentTime() ?? 0,
            });
          }
        },
        onError: (event) => {
          bus.emit('player:error', { error: `YouTube player error: ${event.data}` });
        },
      },
    });
  });
}

/**
 * Load and play a video by ID
 */
export function loadVideo(videoId: string, startSeconds = 0): void {
  if (!player || !isReady) return;
  player.loadVideoById(videoId, startSeconds);
}

/**
 * Play the current video
 */
export function play(): void {
  if (!player || !isReady) return;
  player.playVideo();
}

/**
 * Pause the current video
 */
export function pause(): void {
  if (!player || !isReady) return;
  player.pauseVideo();
}

/**
 * Seek to a specific time
 */
export function seekTo(seconds: number): void {
  if (!player || !isReady) return;
  player.seekTo(seconds, true);
}

/**
 * Get current playback time
 */
export function getCurrentTime(): number {
  if (!player || !isReady) return 0;
  return player.getCurrentTime();
}

/**
 * Get video duration
 */
export function getDuration(): number {
  if (!player || !isReady) return 0;
  return player.getDuration();
}

/**
 * Set volume (0-100)
 */
export function setVolume(volume: number): void {
  if (!player || !isReady) return;
  player.setVolume(volume);
}

/**
 * Check if player is currently playing
 */
export function isPlaying(): boolean {
  if (!player || !isReady) return false;
  return player.getPlayerState() === YT.PlayerState.PLAYING;
}

/**
 * Extract video ID from various YouTube URL formats
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // bare video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Get video title via oEmbed (no API key needed)
 */
export async function getVideoTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`
    );
    const data = await res.json();
    return data.title || 'Unknown Track';
  } catch {
    return 'Unknown Track';
  }
}
