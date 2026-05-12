'use strict';

(function () {
  const ROUTES = {
    recording: () => window.RecordingPage,
    library: () => window.LibraryPage,
  };

  const view = document.getElementById('view');
  const tabs = document.querySelectorAll('.tab');
  let current = null;

  function getRouteFromHash() {
    const hash = (location.hash || '').replace(/^#\/?/, '');
    return ROUTES[hash] ? hash : 'recording';
  }

  function navigate(route) {
    if (current && current.page && typeof current.page.unmount === 'function') {
      current.page.unmount();
    }
    view.innerHTML = '';
    const factory = ROUTES[route];
    const page = factory ? factory() : null;
    if (page && typeof page.mount === 'function') {
      page.mount(view);
    } else {
      view.textContent = 'Page not found';
    }
    current = { route, page };
    tabs.forEach((t) => {
      const isActive = t.dataset.route === route;
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const route = tab.dataset.route;
      if (location.hash !== '#/' + route) {
        location.hash = '#/' + route;
      } else {
        navigate(route);
      }
    });
  });

  window.addEventListener('hashchange', () => navigate(getRouteFromHash()));

  navigate(getRouteFromHash());
})();
