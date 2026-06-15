import { bus } from './events';

interface Route {
  pattern: RegExp;
  name: string;
}

const routes: Route[] = [
  { pattern: /^#?\/?$/, name: 'home' },
  { pattern: /^#\/create$/, name: 'create' },
  { pattern: /^#\/join\/(.+)$/, name: 'join' },
  { pattern: /^#\/session$/, name: 'session' },
];

export function getCurrentRoute(): { route: string; params: Record<string, string> } {
  const hash = window.location.hash || '#/';

  for (const r of routes) {
    const match = hash.match(r.pattern);
    if (match) {
      const params: Record<string, string> = {};
      if (r.name === 'join' && match[1]) {
        params.hostId = match[1];
      }
      return { route: r.name, params };
    }
  }

  return { route: 'home', params: {} };
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function initRouter(): void {
  const handleRoute = () => {
    const { route, params } = getCurrentRoute();
    bus.emit('route:change', { route, params });
  };

  window.addEventListener('hashchange', handleRoute);
  // Fire initial route
  handleRoute();
}
