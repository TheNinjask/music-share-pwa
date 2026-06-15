// ===== Session Modes =====
export type SessionMode = 'override' | 'queue' | 'democratic';

// ===== Track =====
export interface Track {
  videoId: string;
  title: string;
  submittedBy: string;
  duration?: number;
}

// ===== Member =====
export interface Member {
  id: string;
  name: string;
  isHost: boolean;
}

// ===== Session State =====
export interface SessionState {
  mode: SessionMode;
  hostId: string;
  currentTrack: Track | null;
  queue: Track[];
  members: Member[];
  isPlaying: boolean;
  position: number;
}

// ===== Message Protocol =====
export type Message =
  | { type: 'SYNC'; videoId: string; position: number; playing: boolean; ts: number; title?: string; submittedBy?: string }
  | { type: 'SUBMIT'; videoId: string; title: string; submittedBy: string }
  | { type: 'QUEUE_UPDATE'; queue: Track[] }
  | { type: 'VOTE_START'; track: Track; deadline: number; submitterId: string }
  | { type: 'VOTE_CAST'; vote: 'yes' | 'no'; from: string }
  | { type: 'VOTE_UPDATE'; yes: number; no: number; total: number }
  | { type: 'VOTE_RESULT'; approved: boolean; track: Track }
  | { type: 'MEMBER_UPDATE'; members: Member[] }
  | { type: 'STATE_SNAPSHOT'; state: SessionState }
  | { type: 'PING'; ts: number }
  | { type: 'PONG'; clientTs: number; hostTs: number }
  | { type: 'TRACK_ENDED' }
  | { type: 'JOIN'; name: string }
  | { type: 'SKIP' };

// ===== Events =====
export interface AppEvents {
  'route:change': { route: string; params: Record<string, string> };
  'peer:connected': { peerId: string };
  'peer:disconnected': { peerId: string };
  'peer:error': { error: Error };
  'peer:host-ready': { hostId: string };
  'peer:guest-joined': { member: Member };
  'peer:guest-left': { memberId: string };
  'peer:message': { from: string; message: Message };
  'player:ready': void;
  'player:state-change': { playing: boolean; position: number };
  'player:ended': void;
  'player:error': { error: string };
  'session:state-update': SessionState;
  'session:track-change': { track: Track | null };
  'session:queue-update': { queue: Track[] };
  'vote:started': { track: Track; deadline: number; submitterId: string };
  'vote:update': { yes: number; no: number; total: number };
  'vote:ended': { approved: boolean; track: Track };
  'ui:show-toast': { message: string; type: 'info' | 'error' | 'success' };
}
