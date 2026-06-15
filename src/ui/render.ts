/**
 * Create an element with classes and optional attributes
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classes: string = '',
  attrs: Record<string, string> = {}
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (classes) {
    element.className = classes;
  }
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value);
  }
  return element;
}

/**
 * Set innerHTML safely with template
 */
export function html(container: HTMLElement, template: string): void {
  container.innerHTML = template;
}

/**
 * Format seconds to mm:ss
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
