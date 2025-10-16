const CACHE_NAME = 'git-done-v3';
const STATIC_ASSETS = [
  '/',
  '/static/css/style.css',
  '/static/js/app.js',
  '/static/images/GD-Logo.png',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        // Cache static assets individually to prevent one failure from breaking all
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => {
              console.warn(`Failed to cache ${url}:`, err);
              return null;
            })
          )
        );
      })
      .then((results) => {
        console.log('Service Worker: Installation complete');
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length > 0) {
          console.warn('Service Worker: Some assets failed to cache:', failed);
        }
        // Skip waiting to activate immediately for better PWA installation experience
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Installation failed', error);
        // Don't fail installation even if caching fails - PWA should still install
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activation complete');
        // Take control of all pages immediately
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip Chrome extension requests
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // Network-first strategy for the root page (to handle login/logout properly)
  const url = new URL(event.request.url);

  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Cache-first strategy for everything else
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('Service Worker: Serving from cache', event.request.url);
          return cachedResponse;
        }

        console.log('Service Worker: Fetching from network', event.request.url);
        return fetch(event.request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();

            if (event.request.url.includes('/static/') || 
                event.request.url === new URL('/', location).href) {
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }

            return response;
          })
          .catch((error) => {
            console.error('Service Worker: Fetch failed', error);

            if (event.request.destination === 'document') {
              return caches.match('/');
            }
            
            throw error;
          });
      })
  );
});


self.addEventListener('sync', (event) => {
  if (event.tag === 'goal-sync') {
    console.log('Service Worker: Background sync for goals');
  }
});


self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    console.log('Service Worker: Push notification received', data);
    
    const options = {
      body: data.body,
      icon: '/static/images/GD-Logo.png',
      badge: '/static/images/GD-Logo.png',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/'
      }
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Git-Done', options)
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked');
  
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});