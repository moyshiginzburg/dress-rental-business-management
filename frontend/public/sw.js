const SHARE_CACHE = 'share-target-cache-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function getCacheRequest(url) {
  return new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
}

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const files = [];

    for (const value of formData.values()) {
      if (value instanceof File && value.size > 0) {
        files.push(value);
      }
    }

    const file = files[0];
    if (!file) {
      return Response.redirect('/share-target?error=no-file', 303);
    }

    const shareId = self.crypto && self.crypto.randomUUID
      ? self.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const resourceUrl = new URL(`/share-target/data/${shareId}`, self.location.origin);
    const cache = await caches.open(SHARE_CACHE);
    const cacheRequest = getCacheRequest(resourceUrl);

    const responseHeaders = new Headers({
      'content-type': file.type || 'application/octet-stream',
      'x-file-name': encodeURIComponent(file.name || 'shared-file'),
      'cache-control': 'no-store'
    });

    await cache.put(cacheRequest, new Response(file, { headers: responseHeaders }));

    return Response.redirect(`/share-target?sharedId=${encodeURIComponent(shareId)}`, 303);
  } catch (error) {
    console.error('share_target_error', error);
    return Response.redirect('/share-target?error=processing-failed', 303);
  }
}

async function handleSharedDataRequest(requestUrl) {
  const cache = await caches.open(SHARE_CACHE);
  const cacheRequest = getCacheRequest(requestUrl);
  const cachedResponse = await cache.match(cacheRequest);

  if (!cachedResponse) {
    return new Response('Not found', { status: 404 });
  }

  await cache.delete(cacheRequest);
  return cachedResponse;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(request));
    return;
  }

  if (request.method === 'GET' && url.pathname.startsWith('/share-target/data/')) {
    event.respondWith(handleSharedDataRequest(url));
  }
});

// Push notification received
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const options = {
      body: payload.body,
      data: payload.data, // Contains url, whatsappUrl, etc.
      icon: '/logo.png',
      actions: payload.actions || [],
      vibrate: [200, 100, 200],
      requireInteraction: true
    };

    event.waitUntil(
      self.registration.showNotification(payload.title, options)
    );
  } catch (error) {
    console.error('Error processing push event:', error);
  }
});

// Push notification clicked: open the order, or (WhatsApp action) open the app window with the
// WhatsApp link, which the orders page then follows - Android only launches the WhatsApp app
// from a page. openWindow() is tried first because it also brings a background app to the front.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action;

  let targetUrl = '/dashboard/orders';

  if (action === 'whatsapp' && data.whatsappUrl) {
    targetUrl = `/dashboard/orders?id=${data.orderId || ''}&whatsappUrl=${encodeURIComponent(data.whatsappUrl)}`;
  } else if (data.url) {
    targetUrl = data.url;
  }

  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      if (self.clients.openWindow) {
        const newClient = await self.clients.openWindow(absoluteUrl);
        if (newClient && 'focus' in newClient) {
          return newClient.focus();
        }
      }

      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        if ('focus' in client) {
          await client.navigate(absoluteUrl);
          return client.focus();
        }
      }
    })()
  );
});
