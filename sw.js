// Service Worker para PWA - Notificaciones y Offline

const CACHE_NAME = 'payment-app-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// Instalación - Cachear recursos
self.addEventListener('install', event => {
    console.log('[SW] Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Cacheando recursos');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Activación - Limpiar caches viejos
self.addEventListener('activate', event => {
    console.log('[SW] Activando...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('[SW] Eliminando cache viejo:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch - Servir desde cache, si no, ir a red
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

// Push Notifications
self.addEventListener('push', event => {
    console.log('[SW] Push recibido');

    let data = { title: 'Recordatorio de Pago', body: 'Tienes pagos pendientes' };

    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'payment-reminder',
        requireInteraction: true,
        actions: [
            { action: 'open', title: 'Ver pagos' },
            { action: 'dismiss', title: 'Cerrar' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Click en notificación
self.addEventListener('notificationclick', event => {
    console.log('[SW] Notificación clickeada');
    event.notification.close();

    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then(clientList => {
                // Si ya hay una ventana abierta, enfocarla
                for (const client of clientList) {
                    if (client.url.includes('index.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Si no, abrir nueva
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
        );
    }
});

// Verificación periódica (Background Sync)
self.addEventListener('periodicsync', event => {
    if (event.tag === 'check-payments') {
        console.log('[SW] Verificación periódica de pagos');
        event.waitUntil(checkAndNotifyPayments());
    }
});

// Función para verificar pagos y notificar
async function checkAndNotifyPayments() {
    try {
        // Obtener servicios del localStorage vía mensaje a cliente
        const clients = await self.clients.matchAll();

        if (clients.length > 0) {
            // Si hay cliente activo, él maneja las notificaciones
            return;
        }

        // Si no hay cliente, intentar notificar desde SW
        // (Limitado porque SW no tiene acceso directo a localStorage)
        self.registration.showNotification('💰 Recordatorio de Pagos', {
            body: 'Revisa tus pagos pendientes',
            icon: 'icon-192.png',
            tag: 'daily-reminder',
            requireInteraction: true
        });

    } catch (error) {
        console.error('[SW] Error verificando pagos:', error);
    }
}

// Mensaje desde la app
self.addEventListener('message', event => {
    console.log('[SW] Mensaje recibido:', event.data);

    if (event.data.type === 'CHECK_PAYMENTS') {
        // Programar verificación
        checkAndNotifyPayments();
    }
});
