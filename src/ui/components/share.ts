import QRCode from 'qrcode';
import { html } from '../render';

export function renderSharePanel(container: HTMLElement, hostId: string): void {
  const baseUrl = window.location.origin + window.location.pathname;
  const joinUrl = `${baseUrl}#/join/${hostId}`;

  html(container, `
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
      <div class="card max-w-sm w-full">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold">Invite Friends</h3>
          <button id="btn-close-share" class="text-slate-400 hover:text-white text-xl">&times;</button>
        </div>

        <div class="flex flex-col items-center gap-4">
          <canvas id="qr-canvas" class="rounded-lg"></canvas>

          <div class="w-full">
            <label class="text-sm text-slate-400 mb-1 block">Share Link</label>
            <div class="flex gap-2">
              <input id="share-url" type="text" class="input text-sm" readonly value="${joinUrl}" />
              <button id="btn-copy" class="btn-secondary text-sm whitespace-nowrap">Copy</button>
            </div>
          </div>
        </div>

        <p class="text-xs text-slate-500 mt-4 text-center">
          Scan the QR code or share the link to let others join
        </p>
      </div>
    </div>
  `);

  // Generate QR code
  const canvas = container.querySelector('#qr-canvas') as HTMLCanvasElement;
  QRCode.toCanvas(canvas, joinUrl, {
    width: 200,
    margin: 2,
    color: {
      dark: '#e2e8f0',
      light: '#1e293b',
    },
  });

  // Copy button
  const btnCopy = container.querySelector('#btn-copy') as HTMLButtonElement;
  btnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      btnCopy.textContent = 'Copied!';
      setTimeout(() => {
        btnCopy.textContent = 'Copy';
      }, 2000);
    } catch {
      // Fallback
      const input = container.querySelector('#share-url') as HTMLInputElement;
      input.select();
      document.execCommand('copy');
      btnCopy.textContent = 'Copied!';
      setTimeout(() => {
        btnCopy.textContent = 'Copy';
      }, 2000);
    }
  });

  // Close button
  const btnClose = container.querySelector('#btn-close-share') as HTMLButtonElement;
  btnClose.addEventListener('click', () => {
    container.classList.add('hidden');
    container.innerHTML = '';
  });
}
