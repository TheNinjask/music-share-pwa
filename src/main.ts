import './style.css';
import { initRouter } from './router';
import { bus } from './events';
import { renderHome } from './ui/screens/home';
import { renderCreate } from './ui/screens/create';
import { renderJoin } from './ui/screens/join';
import { renderPlayer } from './ui/screens/player';
import { showToast } from './ui/components/toast';

// Initialize the app
function init(): void {
  const app = document.getElementById('app')!;

  // Listen for route changes and render the appropriate screen
  bus.on('route:change', ({ route, params }) => {
    app.innerHTML = '';

    switch (route) {
      case 'home':
        renderHome(app);
        break;
      case 'create':
        renderCreate(app);
        break;
      case 'join':
        renderJoin(app, params.hostId);
        break;
      case 'session':
        renderPlayer(app);
        break;
      default:
        renderHome(app);
    }
  });

  // Toast notifications
  bus.on('ui:show-toast', ({ message, type }) => {
    showToast(message, type);
  });

  // Start the router
  initRouter();
}

// Wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
