var STATIC_CACHE_NAME = 'grunwald-static:2021-10-15T10:08:06';
var DATA_CACHE_NAME = 'grunwald-data';
var ABS_PATH = 'local/templates/grunwald/';

function selectImage(url, params) {
    return url.replace(/(\.[a-z]+)$/, function (ext) {
        var prefix = '';
        if (params) {
            if (params.retina === 'true') {
                prefix = '@2x';
            }
            if (params.webp === 'true') {
                ext = '.webp';
            }
        }
        return prefix + ext;
    });
}

function precache(params) {
    return Promise.all([
        caches.open(STATIC_CACHE_NAME).then(function (cache) {
            return cache.addAll([
                ABS_PATH + 'vendor/normalize.min.css',
                ABS_PATH + 'css/global.min.css',

                ABS_PATH + 'vendor/jquery.min.js',
                ABS_PATH + 'js/global.min.js',

                ABS_PATH + 'img/sprite.svg',

                // selectImage(ABS_PATH + 'img/tech.png', params)
            ]);
        }),
        // caches.open(DATA_CACHE_NAME).then(function (cache) {
        //     return cache.addAll([
        //         '/offline/'
        //     ]);
        // })
    ]).then(function () {
        return self.skipWaiting();
    });
}

function getCacheName(request) {
    return request.url.match(new RegExp(ABS_PATH, 'i')) ? STATIC_CACHE_NAME : DATA_CACHE_NAME;
}

function get(request) {
    return fetch(request).then(function (response) {
        if (response.status < 400) {
            var clonedResponse = response.clone();
            var cacheName = getCacheName(request);
            caches.open(cacheName).then(function (cache) {
                cache.put(request, clonedResponse);
            });
        }

        return response;
    }).catch(function () {
        return caches.open(getCacheName(request)).then(function (cache) {
            return cache.match(request).then(function (cachedResponse) {
                if (cachedResponse) {
                    return cachedResponse;
                    // } else if (request.mode === 'navigate') {
                    //     return cache.match('/offline/');
                } else if (request.destination === 'image') {
                    return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><path fill="#F0F0F0" fill-rule="nonzero" d="M68.929 27.6L58.313 44.8l-10.456-8.428L31 62h59L68.929 27.6zM37.32 31.9c3.49 0 6.3220003-2.885 6.3220003-6.45C43.643 21.89 40.81 19 37.32 19 33.832 19 31 21.89 31 25.45c0 3.565 2.832 6.45 6.321 6.45h-.001z"/></svg>', {
                        status: 503,
                        statusText: 'SW: Service Unavailable',
                        headers: new Headers({
                            'Content-Type': 'image/svg+xml'
                        })
                    });
                } else {
                    return new Response('<h1>Service Unavailable</h1>', {
                        status: 503,
                        statusText: 'SW: Service Unavailable',
                        headers: new Headers({
                            'Content-Type': 'text/html'
                        })
                    });
                }
            });
        });
    });
}

function remove() {
    return caches.keys().then(function (cacheNames) {
        return Promise.all(cacheNames.map(function (cacheName) {
            if (cacheName !== STATIC_CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
                return caches.delete(cacheName);
            }
        }));
    });
}

function isValidPathname(pathname) {
    var isValid = true;
    var blackList = [
        '/admin',
        '/master',
        '/bitrix',
        '/ajax',
        '/forms',
        'service-worker.min.js'
    ];

    blackList.forEach(function (substr) {
        if (pathname.indexOf(substr) !== -1) {
            isValid = false;
        }
    });

    return isValid;
}

self.addEventListener('install', function (event) {
    var params = {};
    new URL(self.location).searchParams.forEach(function (paramValue, paramName) {
        params[paramName] = paramValue;
    });
    event.waitUntil(precache(params));
});

self.addEventListener('activate', function (event) {
    event.waitUntil(remove());
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
    var requestURL = new URL(event.request.url);

    var isValidMethod = event.request.method === 'GET';
    var isValidOrigin = requestURL.origin === self.location.origin;

    if (isValidMethod && isValidOrigin && isValidPathname(requestURL.pathname)) {
        event.respondWith(get(event.request));
    }
});

//# sourceMappingURL=service-worker.js.map