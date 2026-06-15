let toastTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Show a toast notification
 */
export function showToast(message: string, type: 'info' | 'error' | 'success' = 'info'): void {
  // Remove existing toast
  const existing = document.getElementById('toast');
  if (existing) {
    existing.remove();
  }
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  const colors = {
    info: 'bg-slate-700 border-slate-500',
    error: 'bg-red-900 border-red-600',
    success: 'bg-green-900 border-green-600',
  };

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = `fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg border text-sm font-medium z-50 transition-all duration-300 opacity-0 transform -translate-y-2 ${colors[type]}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.remove('opacity-0', '-translate-y-2');
    toast.classList.add('opacity-100', 'translate-y-0');
  });

  // Remove after 3 seconds
  toastTimeout = setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
