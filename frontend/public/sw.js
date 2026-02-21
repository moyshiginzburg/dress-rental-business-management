const SHARE_CACHE = 'share-target-cache-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
