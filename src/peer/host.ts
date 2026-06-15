import Peer, { DataConnection } from 'peerjs';
import { bus } from '../events';
import type { Message, Member } from '../types';

export class PeerHost {
  private peer: Peer | null = null;
  private connections = new Map<string, DataConnection>();
  private members = new Map<string, Member>();
  private lastPong = new Map<string, number>();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _hostId: string = '';

  private static PING_INTERVAL = 5000; // 5 seconds
  private static DEAD_TIMEOUT = 15000; // 15 seconds without pong = dead

  get hostId(): string {
    return this._hostId;
  }

  get connectedMembers(): Member[] {
    return Array.from(this.members.values());
  }

  async init(hostName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.peer = new Peer();

      this.peer.on('open', (id) => {
        this._hostId = id;
        // Add self as host member
        this.members.set(id, { id, name: hostName, isHost: true });
        bus.emit('peer:host-ready', { hostId: id });
        this.startHealthCheck();
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        bus.emit('peer:error', { error: err });
        reject(err);
      });
    });
  }

  private handleConnection(conn: DataConnection): void {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      bus.emit('peer:connected', { peerId: conn.peer });
    });

    conn.on('data', (data) => {
      const message = data as Message;

      // Track pong for health check
      if (message.type === 'PONG') {
        this.lastPong.set(conn.peer, Date.now());
      }

      // Handle JOIN message to register member name
      if (message.type === 'JOIN') {
        const member: Member = { id: conn.peer, name: message.name, isHost: false };
        this.members.set(conn.peer, member);
        this.lastPong.set(conn.peer, Date.now());
        bus.emit('peer:guest-joined', { member });
        // Broadcast updated member list
        this.broadcast({ type: 'MEMBER_UPDATE', members: this.connectedMembers });
      }

      bus.emit('peer:message', { from: conn.peer, message });
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.members.delete(conn.peer);
      this.lastPong.delete(conn.peer);
      bus.emit('peer:guest-left', { memberId: conn.peer });
      // Broadcast updated member list
      this.broadcast({ type: 'MEMBER_UPDATE', members: this.connectedMembers });
    });

    conn.on('error', (err) => {
      console.error(`Connection error with ${conn.peer}:`, err);
      this.connections.delete(conn.peer);
      this.members.delete(conn.peer);
      this.lastPong.delete(conn.peer);
    });
  }

  broadcast(message: Message): void {
    const data = message;
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(data);
      }
    }
  }

  sendTo(peerId: string, message: Message): void {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send(message);
    }
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      const now = Date.now();

      // Send PING to all connections
      for (const conn of this.connections.values()) {
        if (conn.open) {
          conn.send({ type: 'PING', ts: now });
        }
      }

      // Check for dead peers
      for (const [peerId, lastTime] of this.lastPong.entries()) {
        if (now - lastTime > PeerHost.DEAD_TIMEOUT) {
          // Peer is dead — clean up
          const conn = this.connections.get(peerId);
          if (conn) conn.close();
          this.connections.delete(peerId);
          this.members.delete(peerId);
          this.lastPong.delete(peerId);
          bus.emit('peer:guest-left', { memberId: peerId });
          this.broadcast({ type: 'MEMBER_UPDATE', members: this.connectedMembers });
        }
      }
    }, PeerHost.PING_INTERVAL);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  destroy(): void {
    this.stopHealthCheck();
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
    this.members.clear();
    this.lastPong.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}
