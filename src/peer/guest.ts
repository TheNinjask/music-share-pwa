import Peer, { DataConnection } from 'peerjs';
import { bus } from '../events';
import type { Message } from '../types';

export class PeerGuest {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private _clockOffset: number = 0;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private hostId: string = '';
  private guestName: string = '';

  get clockOffset(): number {
    return this._clockOffset;
  }

  get peerId(): string {
    return this.peer?.id ?? '';
  }

  async connect(hostId: string, name: string): Promise<void> {
    this.hostId = hostId;
    this.guestName = name;

    return new Promise((resolve, reject) => {
      this.peer = new Peer();

      this.peer.on('open', () => {
        this.connection = this.peer!.connect(hostId, { reliable: true });

        this.connection.on('open', () => {
          this.reconnectAttempts = 0;
          bus.emit('peer:connected', { peerId: hostId });

          // Send JOIN message with name
          this.send({ type: 'JOIN', name });

          // Initiate clock sync
          this.syncClock();

          resolve();
        });

        this.connection.on('data', (data) => {
          const message = data as Message;
          this.handleMessage(message);
        });

        this.connection.on('close', () => {
          bus.emit('peer:disconnected', { peerId: hostId });
          this.attemptReconnect();
        });

        this.connection.on('error', (err) => {
          bus.emit('peer:error', { error: err });
          reject(err);
        });
      });

      this.peer.on('error', (err) => {
        bus.emit('peer:error', { error: err });
        reject(err);
      });
    });
  }

  private handleMessage(message: Message): void {
    // Handle clock sync response
    if (message.type === 'PONG') {
      const now = Date.now();
      const roundTrip = now - message.clientTs;
      const oneWay = roundTrip / 2;
      this._clockOffset = message.hostTs - message.clientTs - oneWay;
      return;
    }

    // Respond to host health-check pings
    if (message.type === 'PING') {
      this.send({ type: 'PONG', clientTs: message.ts, hostTs: Date.now() });
      return;
    }

    bus.emit('peer:message', { from: this.hostId, message });
  }

  private syncClock(): void {
    // Perform 3 ping-pong roundtrips and average
    let attempts = 0;
    const offsets: number[] = [];

    const doPing = () => {
      if (attempts >= 3) {
        // Average the offsets
        this._clockOffset = offsets.reduce((a, b) => a + b, 0) / offsets.length;
        return;
      }

      this.send({ type: 'PING', ts: Date.now() });
      attempts++;

      // The PONG handling is done in handleMessage
      // Schedule next ping after a short delay
      setTimeout(() => {
        offsets.push(this._clockOffset);
        doPing();
      }, 200);
    };

    // Start after a small delay to let the connection settle
    setTimeout(doPing, 100);
  }

  send(message: Message): void {
    if (this.connection && this.connection.open) {
      this.connection.send(message);
    }
  }

  getHostTime(): number {
    return Date.now() + this._clockOffset;
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      bus.emit('peer:disconnected', { peerId: this.hostId });
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

    bus.emit('ui:show-toast', {
      message: `Reconnecting... (attempt ${this.reconnectAttempts})`,
      type: 'info',
    });

    setTimeout(() => {
      this.peer?.destroy();
      this.connect(this.hostId, this.guestName).catch(() => {
        this.attemptReconnect();
      });
    }, delay);
  }

  destroy(): void {
    this.connection?.close();
    this.peer?.destroy();
    this.connection = null;
    this.peer = null;
  }
}
