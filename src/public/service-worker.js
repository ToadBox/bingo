// Bingo App Service Worker
const CACHE_NAME = 'bingo-app-v1';
const OFFLINE_URL = '/offline.html';
const OFFLINE_FALLBACK_IMAGE = '/images/offline-image.png';
const OFFLINE_FALLBACK_ICON = '/images/icons/icon-192x192.png';

// Assets to pre-cache
const PRE_CACHE_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  OFFLINE_URL,
  '/css/variables.css',
  '/css/common.css',
  '/css/index.css',
  '/css/board.css',
  '/css/theme.css',
  '/js/utils.js',
  '/js/api.js',
  '/js/theme.js',
  '/js/components.js',
  '/manifest.json',
  OFFLINE_FALLBACK_IMAGE,
  OFFLINE_FALLBACK_ICON,
  '/images/free-space.png'
];

// API routes to exclude from caching
const API_ROUTES = [
  '/api/',
  '/api/auth/',
];

// Install event - pre-cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      
      // Pre-cache critical assets
      await cache.addAll(PRE_CACHE_ASSETS);
      
      // Skip waiting to activate immediately
      await self.skipWaiting();
      
      console.log('[Service Worker] Installed and pre-cached assets');
    })()
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Get all cache keys
      const cacheKeys = await caches.keys();
      
      // Delete old caches
      await Promise.all(
        cacheKeys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      
      // Take control of all clients
      await self.clients.claim();
      
      console.log('[Service Worker] Activated and cleaned up old caches');
    })()
  );
});

// Helper function to determine if a request is for an API route
const isApiRoute = (url) => {
  return API_ROUTES.some(route => url.pathname.startsWith(route));
};

// Helper function to determine if the response is valid
const isValidResponse = (response) => {
  return response && response.status === 200 && response.type === 'basic';
};

// Fetch event - network-first for API, stale-while-revalidate for assets
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  const url = new URL(event.request.url);
  
  // Handle API requests - network only, no caching
  if (isApiRoute(url)) {
    event.respondWith(
      fetch(event.request).catch((error) => {
        console.error('[Service Worker] API fetch failed:', error);
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }
  
  // For GET requests, use stale-while-revalidate strategy
  if (event.request.method === 'GET') {
    event.respondWith(
      (async () => {
        // Check cache first
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);
        
        // Return cached response if available
        if (cachedResponse) {
          // Fetch in the background to update cache
          fetch(event.request)
            .then((networkResponse) => {
              if (isValidResponse(networkResponse)) {
                cache.put(event.request, networkResponse.clone());
              }
            })
            .catch((error) => {
              console.error('[Service Worker] Background fetch failed:', error);
            });
          
          return cachedResponse;
        }
        
        // If not in cache, try network
        try {
          const networkResponse = await fetch(event.request);
          
          // Cache valid responses
          if (isValidResponse(networkResponse)) {
            const clonedResponse = networkResponse.clone();
            cache.put(event.request, clonedResponse);
          }
          
          return networkResponse;
        } catch (error) {
          console.error('[Service Worker] Fetch failed:', error);
          
          // For image requests, use fallback image
          if (event.request.destination === 'image') {
            return caches.match(OFFLINE_FALLBACK_IMAGE);
          }
          
          // For HTML requests, show offline page
          if (event.request.destination === 'document') {
            return caches.match(OFFLINE_URL);
          }
          
          // For other requests, just return whatever might be appropriate
          return new Response('Network error', { status: 408, headers: { 'Content-Type': 'text/plain' } });
        }
      })()
    );
    return;
  }
  
  // For non-GET requests, go to network
  event.respondWith(
    fetch(event.request).catch((error) => {
      console.error('[Service Worker] Non-GET request failed:', error);
      return new Response('Offline mode: Only GET requests are supported.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      });
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-board-updates') {
    event.waitUntil(syncBoardUpdates());
  } else if (event.tag === 'sync-image-uploads') {
    event.waitUntil(syncImageUploads());
  }
});

// Push notification event handler
self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }
  
  let data;
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'New Notification',
      body: event.data.text(),
      icon: OFFLINE_FALLBACK_ICON
    };
  }
  
  const title = data.title || 'Bingo Board';
  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || OFFLINE_FALLBACK_ICON,
    badge: OFFLINE_FALLBACK_ICON,
    data: {
      url: data.url || '/'
    }
  };
  
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click event handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Try to focus existing window or open new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const url = event.notification.data?.url || '/';
        
        // Focus if already open
        for (const client of clientList) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window if not found
        return clients.openWindow(url);
      })
  );
});

// Function to sync board updates when back online
async function syncBoardUpdates() {
  try {
    const db = await openIndexedDB();
    const offlineUpdates = await getAllOfflineUpdates(db);
    
    if (!offlineUpdates || offlineUpdates.length === 0) {
      return;
    }
    
    for (const update of offlineUpdates) {
      try {
        // Try to send the update to the server
        const response = await fetch('/api/board/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update)
        });
        
        if (response.ok) {
          // Remove from IndexedDB if successful
          await deleteOfflineUpdate(db, update.id);
        }
      } catch (error) {
        console.error('[Service Worker] Failed to sync update:', error);
      }
    }
  } catch (error) {
    console.error('[Service Worker] Sync failed:', error);
  }
}

// Function to sync image uploads when back online
async function syncImageUploads() {
  try {
    const db = await openIndexedDB();
    const offlineUploads = await getAllOfflineUploads(db);
    
    if (!offlineUploads || offlineUploads.length === 0) {
      return;
    }
    
    for (const upload of offlineUploads) {
      try {
        // Create FormData with the stored image
        const formData = new FormData();
        formData.append('image', upload.file);
        formData.append('metadata', JSON.stringify(upload.metadata));
        
        // Try to upload the image
        const response = await fetch('/api/images/upload', {
          method: 'POST',
          body: formData
        });
        
        if (response.ok) {
          // Remove from IndexedDB if successful
          await deleteOfflineUpload(db, upload.id);
        }
      } catch (error) {
        console.error('[Service Worker] Failed to sync image upload:', error);
      }
    }
  } catch (error) {
    console.error('[Service Worker] Image sync failed:', error);
  }
}

// Helper function to open IndexedDB
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bingo-offline-db', 1);
    
    request.onerror = (event) => {
      reject(new Error('Failed to open IndexedDB'));
    };
    
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create stores if they don't exist
      if (!db.objectStoreNames.contains('updates')) {
        db.createObjectStore('updates', { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains('uploads')) {
        db.createObjectStore('uploads', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// Get all offline updates from IndexedDB
function getAllOfflineUpdates(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['updates'], 'readonly');
    const store = transaction.objectStore('updates');
    const request = store.getAll();
    
    request.onerror = (event) => {
      reject(new Error('Failed to get offline updates'));
    };
    
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
  });
}

// Delete an offline update by ID
function deleteOfflineUpdate(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['updates'], 'readwrite');
    const store = transaction.objectStore('updates');
    const request = store.delete(id);
    
    request.onerror = (event) => {
      reject(new Error('Failed to delete offline update'));
    };
    
    request.onsuccess = (event) => {
      resolve();
    };
  });
}

// Get all offline uploads from IndexedDB
function getAllOfflineUploads(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['uploads'], 'readonly');
    const store = transaction.objectStore('uploads');
    const request = store.getAll();
    
    request.onerror = (event) => {
      reject(new Error('Failed to get offline uploads'));
    };
    
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
  });
}

// Delete an offline upload by ID
function deleteOfflineUpload(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['uploads'], 'readwrite');
    const store = transaction.objectStore('uploads');
    const request = store.delete(id);
    
    request.onerror = (event) => {
      reject(new Error('Failed to delete offline upload'));
    };
    
    request.onsuccess = (event) => {
      resolve();
    };
  });
} 