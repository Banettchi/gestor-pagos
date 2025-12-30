// ===== App de Gestion de Pagos y Almacenamiento - PWA =====

// Configuracion
const CONFIG = {
    ALERT_DAYS: 4,
    NOTIFICATION_HOUR: 9,
    STORAGE_KEY: 'payment_services',
    PRODUCTS_KEY: 'storage_products',
    HISTORY_KEY: 'storage_history',
    TOKEN_KEY: 'github_token',
    // GitHub Sync Config
    GITHUB_OWNER: 'Banettchi',
    GITHUB_REPO: 'gestor-pagos',
    GITHUB_FILE: 'data.json'
};

// Token se obtiene de localStorage
function getGitHubToken() {
    return localStorage.getItem(CONFIG.TOKEN_KEY);
}

// Tipos de servicio con iconos
const SERVICE_TYPES = {
    luz: { name: 'Luz', icon: '💡' },
    agua: { name: 'Agua', icon: '💧' },
    admin: { name: 'Administración', icon: '🏢' },
    cuota: { name: 'Cuota Local', icon: '🏠' },
    bodega: { name: 'Bodega', icon: '📦' },
    directv: { name: 'DirecTV', icon: '📺' },
    internet: { name: 'Internet', icon: '🌐' },
    telefono: { name: 'Teléfono', icon: '📱' },
    etb: { name: 'ETB', icon: '📞' },
    sayco: { name: 'Sayco', icon: '🎵' },
    otro: { name: 'Otro', icon: '🔧' }
};

// Estado de la aplicación - Pagos
let services = [];
let currentTab = 'pending';
let editingId = null;

// Estado de la aplicación - Almacenamiento
let products = [];
let storageHistory = [];
let currentStorageTab = 'nevera';
let editingProductId = null;
let movingProductId = null;

// ===== Inicialización =====
document.addEventListener('DOMContentLoaded', () => {
    loadServices();
    renderServices();
    setupEventListeners();
    registerServiceWorker();
    checkNotificationPermission();
    scheduleNotificationCheck();
});

// ===== Event Listeners =====
function setupEventListeners() {
    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentTab = e.target.dataset.tab;
            renderServices();
        });
    });

    // Form submit
    document.getElementById('serviceForm').addEventListener('submit', handleFormSubmit);

    // Botón agregar en header
    document.getElementById('btnAdd').addEventListener('click', openAddModal);

    // Botón notificaciones
    document.getElementById('btnNotifications').addEventListener('click', requestNotificationPermission);
}

// ===== Service Worker =====
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('sw.js');
            console.log('Service Worker registrado:', registration.scope);
        } catch (error) {
            console.error('Error registrando SW:', error);
        }
    }
}

// ===== Notificaciones =====
function checkNotificationPermission() {
    const btn = document.getElementById('btnNotifications');
    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            btn.textContent = '🔔';
            btn.title = 'Notificaciones activadas';
        } else if (Notification.permission === 'denied') {
            btn.textContent = '🔕';
            btn.title = 'Notificaciones bloqueadas';
        } else {
            btn.textContent = '🔔';
            btn.title = 'Activar notificaciones';
        }
    }
}

async function requestNotificationPermission() {
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        checkNotificationPermission();
        if (permission === 'granted') {
            showToast('Notificaciones activadas ✓');
            // Mostrar notificación de prueba inmediata
            setTimeout(() => {
                new Notification('🔔 Gestor de Pagos', {
                    body: '¡Notificaciones activadas! Recibirás alertas de tus pagos.',
                    icon: 'icon-192.png'
                });
            }, 1000);
            // También verificar pagos pendientes
            setTimeout(() => {
                checkPendingPayments();
            }, 3000);
        } else {
            showToast('Notificaciones bloqueadas');
        }
    }
}

function showNotification(title, body, tag = 'payment-reminder') {
    if ('Notification' in window && Notification.permission === 'granted') {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(title, {
                    body: body,
                    icon: 'icon-192.png',
                    badge: 'icon-192.png',
                    tag: tag,
                    vibrate: [200, 100, 200],
                    requireInteraction: true
                });
            });
        } else {
            new Notification(title, { body, icon: 'icon-192.png' });
        }
    }
}

function scheduleNotificationCheck() {
    // Verificar pagos pendientes cada hora
    checkPendingPayments();
    setInterval(checkPendingPayments, 60 * 60 * 1000); // Cada hora
}

function checkPendingPayments() {
    const pendingServices = services.filter(s => !s.paid);

    pendingServices.forEach(service => {
        const daysUntilDue = getDaysUntilDue(service);

        // Si faltan 4 días o menos, notificar
        if (daysUntilDue <= CONFIG.ALERT_DAYS && daysUntilDue >= 0) {
            const type = SERVICE_TYPES[service.type] || SERVICE_TYPES.otro;
            let message;

            if (daysUntilDue === 0) {
                message = `⚠️ ${type.name} vence HOY! Monto: $${formatNumber(service.amount)}`;
            } else if (daysUntilDue === 1) {
                message = `⚠️ ${type.name} vence MAÑANA! Monto: $${formatNumber(service.amount)}`;
            } else {
                message = `${type.name} vence en ${daysUntilDue} días. Monto: $${formatNumber(service.amount)}`;
            }

            showNotification('💰 Recordatorio de Pago', message, `payment-${service.id}`);
        }
    });
}

// ===== Storage con GitHub Sync =====
let fileSha = null;

async function loadServices() {
    const token = getGitHubToken();

    // Si no hay token configurado, pedir al usuario
    if (!token) {
        const newToken = prompt('Para sincronizar datos, ingresa tu GitHub Token:\n(Dejalo vacio para usar solo este dispositivo)');
        if (newToken) {
            localStorage.setItem(CONFIG.TOKEN_KEY, newToken);
        }
    }

    const currentToken = getGitHubToken();

    if (currentToken) {
        showToast('Sincronizando...');
        try {
            const response = await fetch(
                `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/contents/${CONFIG.GITHUB_FILE}`,
                {
                    headers: {
                        'Authorization': `token ${currentToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );

            if (response.ok) {
                const data = await response.json();
                fileSha = data.sha;
                const content = JSON.parse(atob(data.content));
                services = content.services || [];
                localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(services));
                showToast('Sincronizado OK');
            } else {
                loadFromLocalStorage();
            }
        } catch (error) {
            console.error('Error:', error);
            loadFromLocalStorage();
        }
    } else {
        loadFromLocalStorage();
    }
    renderServices();
}

function loadFromLocalStorage() {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (stored) {
        services = JSON.parse(stored);
        showToast('Modo local');
    } else {
        loadInitialData();
    }
}

async function saveServices() {
    // Guardar localmente primero
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(services));

    // Luego sincronizar con GitHub si hay token
    const token = getGitHubToken();
    if (!token) {
        console.log('Sin token - guardado solo local');
        return;
    }

    // Si no tenemos el SHA, intentar obtenerlo
    if (!fileSha) {
        try {
            const getResponse = await fetch(
                `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/contents/${CONFIG.GITHUB_FILE}`,
                {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            if (getResponse.ok) {
                const getData = await getResponse.json();
                fileSha = getData.sha;
            }
        } catch (e) {
            console.log('No se pudo obtener SHA:', e);
        }
    }

    try {
        const content = {
            services: services,
            lastUpdated: new Date().toISOString()
        };

        const body = {
            message: 'Actualizar datos de pagos',
            content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))))
        };

        // Solo incluir sha si existe (para crear nuevo archivo si no existe)
        if (fileSha) {
            body.sha = fileSha;
        }

        const response = await fetch(
            `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/contents/${CONFIG.GITHUB_FILE}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }
        );

        if (response.ok) {
            const data = await response.json();
            fileSha = data.content.sha;
            showToast('Sincronizado ✓');
        } else {
            const error = await response.json();
            console.error('Error GitHub:', error);
            showToast('Error al sincronizar');
        }
    } catch (error) {
        console.error('Error guardando:', error);
        showToast('Error de conexion');
    }
}

function loadInitialData() {
    services = [
        { id: 'bodega-001', type: 'bodega', name: 'Bodega', amount: 0, dueDay: 1, periodMonths: 1, paid: true, paidDate: '2024-12-01' },
        { id: 'admin-001', type: 'admin', name: 'Administracion', amount: 0, dueDay: 10, periodMonths: 1, paid: true, paidDate: '2024-12-07' },
        { id: 'cuota-001', type: 'cuota', name: 'Cuota Local', amount: 0, dueDay: 5, periodMonths: 1, paid: true, paidDate: '2024-12-04' },
        { id: 'agua-001', type: 'agua', name: 'Agua', amount: 0, dueDay: 25, periodMonths: 2, paid: false, paidDate: null },
        { id: 'luz-001', type: 'luz', name: 'Luz', amount: 0, dueDay: 18, periodMonths: 1, paid: true, paidDate: '2024-12-18' },
        { id: 'directv-001', type: 'directv', name: 'DirecTV', amount: 0, dueDay: 22, periodMonths: 1, paid: false, paidDate: null },
        { id: 'etb-001', type: 'etb', name: 'ETB', amount: 0, dueDay: 26, periodMonths: 1, paid: false, paidDate: null }
    ];
    saveServices();
}


// ===== Render =====
function renderServices() {
    const container = document.getElementById('servicesList');
    const emptyState = document.getElementById('emptyState');

    let filteredServices = [...services];

    // Filtrar según tab
    if (currentTab === 'pending') {
        filteredServices = services.filter(s => !s.paid);
    } else if (currentTab === 'paid') {
        filteredServices = services.filter(s => s.paid);
    }

    // Ordenar por días hasta vencimiento
    filteredServices.sort((a, b) => getDaysUntilDue(a) - getDaysUntilDue(b));

    if (filteredServices.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    container.innerHTML = filteredServices.map(service => createServiceCard(service)).join('');
}

function createServiceCard(service) {
    let type = SERVICE_TYPES[service.type] || SERVICE_TYPES.otro;

    // Para servicios personalizados, usar nombre y emoji custom
    if (service.type === 'otro' && (service.customName || service.customEmoji)) {
        type = {
            name: service.customName || 'Otro',
            icon: service.customEmoji || '🔧'
        };
    }

    const daysUntilDue = getDaysUntilDue(service);
    const isUrgent = !service.paid && daysUntilDue <= CONFIG.ALERT_DAYS;

    let statusClass = 'status-pending';
    let statusText = `Vence en ${daysUntilDue} días`;
    let cardClass = '';

    if (service.paid) {
        statusClass = 'status-paid';
        statusText = 'Pagado ✓';
        cardClass = 'paid';
    } else if (daysUntilDue < 0) {
        statusClass = 'status-urgent';
        statusText = `Vencido hace ${Math.abs(daysUntilDue)} días`;
        cardClass = 'urgent';
    } else if (daysUntilDue === 0) {
        statusClass = 'status-urgent';
        statusText = 'Vence HOY';
        cardClass = 'urgent';
    } else if (isUrgent) {
        statusClass = 'status-urgent';
        cardClass = 'urgent';
    }

    const dueDate = getNextDueDateForService(service);
    const periodText = service.periodMonths === 2 ? ' (Bimestral)' : '';

    return `
        <div class="service-card ${cardClass}" data-id="${service.id}">
            <div class="service-header">
                <span class="service-name">${type.icon} ${type.name}${periodText}</span>
                <span class="service-status ${statusClass}">${statusText}</span>
            </div>
            <div class="service-info">
                <span>Vence el día ${service.dueDay}${service.periodMonths === 2 ? ' cada 2 meses' : ' de cada mes'}</span>
                <span>${dueDate}</span>
            </div>
            ${service.amount > 0 ? `<div class="service-amount">$${formatNumber(service.amount)}</div>` : ''}
            <div class="service-actions">
                ${!service.paid ? `<button class="btn btn-success" onclick="openPayModal('${service.id}')">✓ Pagar</button>` :
            `<button class="btn btn-secondary" onclick="renewService('${service.id}')">↻ Renovar</button>`}
                <button class="btn btn-secondary" onclick="editService('${service.id}')">✏️</button>
                <button class="btn btn-danger" onclick="deleteService('${service.id}')">🗑️</button>
            </div>
        </div>
    `;
}

// ===== CRUD Operations =====
function handleFormSubmit(e) {
    e.preventDefault();

    const typeValue = document.getElementById('serviceType').value;
    const amount = parseFloat(document.getElementById('amount').value) || 0;
    const dueDay = parseInt(document.getElementById('dueDay').value);
    const alreadyPaid = document.getElementById('alreadyPaid').checked;

    // Campos personalizados para tipo "otro"
    let customName = '';
    let customEmoji = '';
    if (typeValue === 'otro') {
        customName = document.getElementById('customName').value.trim() || 'Otro';
        customEmoji = document.getElementById('customEmoji').value.trim() || '';
    }

    if (editingId) {
        const index = services.findIndex(s => s.id === editingId);
        if (index !== -1) {
            services[index] = {
                ...services[index],
                type: typeValue,
                amount: amount,
                dueDay: dueDay,
                customName: customName,
                customEmoji: customEmoji
            };
            showToast('Servicio actualizado');
        }
        editingId = null;
    } else {
        const newService = {
            id: generateId(),
            type: typeValue,
            amount: amount,
            dueDay: dueDay,
            paid: alreadyPaid,
            paidDate: alreadyPaid ? new Date().toISOString() : null,
            customName: customName,
            customEmoji: customEmoji,
            createdAt: new Date().toISOString()
        };
        services.push(newService);
        showToast('Servicio agregado');
    }

    saveServices();
    renderServices();
    closeModal();
}

// Mostrar/ocultar campos personalizados
function toggleCustomFields() {
    const type = document.getElementById('serviceType').value;
    const customFields = document.getElementById('customFields');
    if (type === 'otro') {
        customFields.style.display = 'block';
    } else {
        customFields.style.display = 'none';
    }
}

function openPayModal(id) {
    const service = services.find(s => s.id === id);
    if (service) {
        const type = SERVICE_TYPES[service.type] || SERVICE_TYPES.otro;
        document.getElementById('payServiceName').textContent = `${type.icon} ${type.name}`;
        document.getElementById('payAmount').value = service.amount;
        document.getElementById('payModal').dataset.serviceId = id;
        document.getElementById('payModal').classList.add('open');
    }
}

function closePayModal() {
    document.getElementById('payModal').classList.remove('open');
}

function confirmPay() {
    const id = document.getElementById('payModal').dataset.serviceId;
    const amount = parseFloat(document.getElementById('payAmount').value);

    const index = services.findIndex(s => s.id === id);
    if (index !== -1) {
        services[index].paid = true;
        services[index].paidDate = new Date().toISOString();
        services[index].paidAmount = amount;

        saveServices();
        renderServices();
        closePayModal();
        showToast('Pago registrado ✓');
    }
}

function renewService(id) {
    const index = services.findIndex(s => s.id === id);
    if (index !== -1) {
        services[index].paid = false;
        services[index].paidDate = null;
        saveServices();
        renderServices();
        showToast('Servicio renovado para el próximo mes');
    }
}

function editService(id) {
    const service = services.find(s => s.id === id);
    if (service) {
        editingId = id;
        document.getElementById('modalTitle').textContent = 'Editar Servicio';
        document.getElementById('serviceType').value = service.type;
        document.getElementById('amount').value = service.amount;
        document.getElementById('dueDay').value = service.dueDay;
        document.getElementById('alreadyPaid').checked = service.paid;
        document.getElementById('addModal').classList.add('open');
    }
}

function deleteService(id) {
    if (confirm('¿Eliminar este servicio?')) {
        services = services.filter(s => s.id !== id);
        saveServices();
        renderServices();
        showToast('Servicio eliminado');
    }
}

// ===== Modal =====
function openAddModal() {
    editingId = null;
    document.getElementById('modalTitle').textContent = 'Agregar Servicio';
    document.getElementById('serviceForm').reset();
    document.getElementById('addModal').classList.add('open');
}

function closeModal() {
    document.getElementById('addModal').classList.remove('open');
    editingId = null;
}

// ===== Helpers =====
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatNumber(num) {
    return new Intl.NumberFormat('es-CO').format(num);
}

function getDaysUntilDue(service) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const periodMonths = service.periodMonths || 1;
    let dueDate = new Date(today.getFullYear(), today.getMonth(), service.dueDay);

    // Para servicios bimestrales, verificar si este mes corresponde
    if (periodMonths === 2) {
        // Si el mes actual es par (dic=12), el próximo vencimiento es en mes impar (ene=1)
        const currentMonth = today.getMonth(); // 0-11
        // Agua vence en meses impares (ene, mar, may, jul, sep, nov) = 0, 2, 4, 6, 8, 10
        if (currentMonth % 2 === 1) { // Meses pares en JS (dic=11)
            // Próximo vencimiento es el siguiente mes
            dueDate = new Date(today.getFullYear(), today.getMonth() + 1, service.dueDay);
        }
    }

    // Si ya pasó la fecha de este período y no está pagado
    if (dueDate < today && !service.paid) {
        dueDate = new Date(dueDate.getFullYear(), dueDate.getMonth() + periodMonths, service.dueDay);
    }

    // Si está pagado, calcular para el próximo período
    if (service.paid) {
        dueDate = new Date(today.getFullYear(), today.getMonth() + periodMonths, service.dueDay);
    }

    const diffTime = dueDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
}

function getNextDueDateForService(service) {
    const today = new Date();
    const periodMonths = service.periodMonths || 1;
    let dueDate = new Date(today.getFullYear(), today.getMonth(), service.dueDay);

    if (dueDate < today || service.paid) {
        dueDate = new Date(today.getFullYear(), today.getMonth() + periodMonths, service.dueDay);
    }

    return dueDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getNextDueDate(dueDay) {
    const today = new Date();
    let dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay);

    if (dueDate < today) {
        dueDate = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
    }

    return dueDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Cerrar modales al hacer clic fuera
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('open');
        }
    });
});

// =====================================================
// ===== MÓDULO DE ALMACENAMIENTO =====
// =====================================================

// Datos iniciales de productos
const INITIAL_PRODUCTS = {
    nevera: [
        { name: 'Corona 0.0', qty: 6 },
        { name: 'Sol', qty: 5 },
        { name: 'Coca Cola', qty: 1 },
        { name: 'Agua', qty: 0 },
        { name: 'RedBull', qty: 0 },
        { name: 'Heineken', qty: 6 },
        { name: 'Stella', qty: 14 },
        { name: 'Bretaña', qty: 0 },
        { name: 'Tonica', qty: 0 },
        { name: 'Corona', qty: 23 },
        { name: 'Poker', qty: 8 },
        { name: 'Aguila', qty: 22 },
        { name: 'Aguila Light', qty: 6 },
        { name: 'Club Roja', qty: 10 },
        { name: 'Club Trigo', qty: 0 },
        { name: 'Club Dorada', qty: 25 },
        { name: 'Cordillera Rosada', qty: 5 },
        { name: 'Cordillera Roja', qty: 5 },
        { name: 'Cordillera Negra', qty: 5 },
        { name: 'Cordillera Mestiza', qty: 5 },
        { name: 'BBC Rose', qty: 10 }
    ],
    bodega: [
        { name: 'Corona 0.0', qty: 14 },
        { name: 'Sol', qty: 32 },
        { name: 'Coca Cola', qty: 4 },
        { name: 'Agua', qty: 23 },
        { name: 'RedBull', qty: 3 },
        { name: 'Heineken', qty: 24 },
        { name: 'Stella', qty: 54 },
        { name: 'Bretaña', qty: 11 },
        { name: 'Tonica', qty: 12 },
        { name: 'Corona', qty: 60 },
        { name: 'Poker', qty: 32 },
        { name: 'Aguila', qty: 60 },
        { name: 'Aguila Light', qty: 12 },
        { name: 'Club Roja', qty: 60 },
        { name: 'Club Trigo', qty: 0 },
        { name: 'Club Dorada', qty: 91 },
        { name: 'Cordillera Rosada', qty: 33 },
        { name: 'Cordillera Roja', qty: 13 },
        { name: 'Cordillera Negra', qty: 21 },
        { name: 'Cordillera Mestiza', qty: 29 },
        { name: 'BBC Rose', qty: 16 }
    ]
};

// ===== Navegación entre pantallas =====
function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

    if (screen === 'home') {
        document.getElementById('homeScreen').classList.add('active');
    } else if (screen === 'storage') {
        document.getElementById('storageScreen').classList.add('active');
        loadProducts();
        renderProducts();
    } else if (screen === 'payments') {
        document.getElementById('paymentsScreen').classList.add('active');
        loadServices();
        renderServices();
    }
}

// ===== Cargar productos =====
function loadProducts() {
    const stored = localStorage.getItem(CONFIG.PRODUCTS_KEY);
    if (stored) {
        products = JSON.parse(stored);
    } else {
        // Cargar datos iniciales
        products = [];
        INITIAL_PRODUCTS.nevera.forEach(p => {
            products.push({
                id: generateId(),
                name: p.name,
                location: 'nevera',
                qty: p.qty
            });
        });
        INITIAL_PRODUCTS.bodega.forEach(p => {
            products.push({
                id: generateId(),
                name: p.name,
                location: 'bodega',
                qty: p.qty
            });
        });
        saveProducts();
    }

    // Cargar historial
    const storedHistory = localStorage.getItem(CONFIG.HISTORY_KEY);
    if (storedHistory) {
        storageHistory = JSON.parse(storedHistory);
    }
}

// ===== Guardar productos =====
function saveProducts() {
    localStorage.setItem(CONFIG.PRODUCTS_KEY, JSON.stringify(products));
}

// ===== Guardar historial =====
function saveHistory() {
    localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(storageHistory));
}

// ===== Agregar al historial =====
function addToHistory(action, productName, details) {
    storageHistory.unshift({
        id: generateId(),
        action: action,
        product: productName,
        details: details,
        timestamp: new Date().toISOString()
    });
    // Mantener solo últimos 100 registros
    if (storageHistory.length > 100) {
        storageHistory = storageHistory.slice(0, 100);
    }
    saveHistory();
}

// ===== Cambiar pestaña de almacenamiento =====
function switchStorageTab(tab) {
    currentStorageTab = tab;
    document.querySelectorAll('[data-storage-tab]').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-storage-tab="${tab}"]`).classList.add('active');
    renderProducts();
}

// ===== Renderizar productos =====
function renderProducts() {
    const container = document.getElementById('productsList');
    const emptyState = document.getElementById('emptyProducts');

    const filtered = products.filter(p => p.location === currentStorageTab);

    // Ordenar: sin stock primero, luego por nombre
    filtered.sort((a, b) => {
        if (a.qty === 0 && b.qty !== 0) return -1;
        if (a.qty !== 0 && b.qty === 0) return 1;
        return a.name.localeCompare(b.name);
    });

    if (filtered.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    container.innerHTML = filtered.map(product => createProductCard(product)).join('');
}

// ===== Crear tarjeta de producto =====
function createProductCard(product) {
    let cardClass = '';
    let qtyClass = '';

    if (product.qty === 0) {
        cardClass = 'no-stock';
        qtyClass = 'zero';
    } else if (product.qty <= 3) {
        cardClass = 'low-stock';
    }

    const otherLocation = product.location === 'nevera' ? 'bodega' : 'nevera';
    const otherIcon = product.location === 'nevera' ? '📦' : '🧊';

    return `
        <div class="product-card ${cardClass}" data-id="${product.id}">
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-qty ${qtyClass}">Stock: <span>${product.qty}</span></div>
            </div>
            <div class="qty-controls">
                <button class="qty-btn minus" onclick="adjustQty('${product.id}', -1)">−</button>
                <button class="qty-btn plus" onclick="adjustQty('${product.id}', 1)">+</button>
            </div>
            <div class="product-actions">
                <button class="btn-move" onclick="openMoveModal('${product.id}')">${otherIcon}</button>
            </div>
        </div>
    `;
}

// ===== Ajustar cantidad =====
function adjustQty(id, delta) {
    const index = products.findIndex(p => p.id === id);
    if (index !== -1) {
        const product = products[index];
        const oldQty = product.qty;
        product.qty = Math.max(0, product.qty + delta);

        if (product.qty !== oldQty) {
            const action = delta > 0 ? 'Entrada' : 'Salida';
            addToHistory(action, product.name, `${Math.abs(delta)} unidad(es) en ${product.location}`);
            saveProducts();
            renderProducts();
        }
    }
}

// ===== Abrir modal agregar producto =====
function openAddProductModal() {
    editingProductId = null;
    document.getElementById('productModalTitle').textContent = 'Agregar Producto';
    document.getElementById('productForm').reset();
    document.getElementById('productLocation').value = currentStorageTab;
    document.getElementById('addProductModal').classList.add('open');
}

// ===== Cerrar modal producto =====
function closeProductModal() {
    document.getElementById('addProductModal').classList.remove('open');
    editingProductId = null;
}

// ===== Guardar producto =====
function saveProduct(e) {
    e.preventDefault();

    const name = document.getElementById('productName').value.trim();
    const location = document.getElementById('productLocation').value;
    const qty = parseInt(document.getElementById('productQty').value) || 0;

    if (!name) return;

    if (editingProductId) {
        const index = products.findIndex(p => p.id === editingProductId);
        if (index !== -1) {
            products[index].name = name;
            products[index].location = location;
            products[index].qty = qty;
        }
        showToast('Producto actualizado');
    } else {
        products.push({
            id: generateId(),
            name: name,
            location: location,
            qty: qty
        });
        addToHistory('Agregado', name, `${qty} unidad(es) en ${location}`);
        showToast('Producto agregado');
    }

    saveProducts();
    renderProducts();
    closeProductModal();
}

// ===== Abrir modal mover producto =====
function openMoveModal(id) {
    movingProductId = id;
    const product = products.find(p => p.id === id);
    if (product) {
        document.getElementById('moveProductName').textContent = `📦 ${product.name} (${product.qty} disponibles)`;
        document.getElementById('moveQty').value = 1;
        document.getElementById('moveQty').max = product.qty;

        // Establecer destino al contrario de la ubicación actual
        const destination = product.location === 'nevera' ? 'bodega' : 'nevera';
        document.getElementById('moveDestination').value = destination;

        document.getElementById('moveProductModal').classList.add('open');
    }
}

// ===== Cerrar modal mover =====
function closeMoveModal() {
    document.getElementById('moveProductModal').classList.remove('open');
    movingProductId = null;
}

// ===== Confirmar movimiento =====
function confirmMove() {
    const qty = parseInt(document.getElementById('moveQty').value) || 0;
    const destination = document.getElementById('moveDestination').value;

    if (qty <= 0 || !movingProductId) {
        closeMoveModal();
        return;
    }

    const sourceIndex = products.findIndex(p => p.id === movingProductId);
    if (sourceIndex === -1) {
        closeMoveModal();
        return;
    }

    const sourceProduct = products[sourceIndex];

    if (qty > sourceProduct.qty) {
        showToast('No hay suficiente stock');
        return;
    }

    if (sourceProduct.location === destination) {
        showToast('Ya está en esa ubicación');
        closeMoveModal();
        return;
    }

    // Reducir del origen
    sourceProduct.qty -= qty;

    // Buscar o crear en destino
    let destProduct = products.find(p => p.name === sourceProduct.name && p.location === destination);
    if (destProduct) {
        destProduct.qty += qty;
    } else {
        products.push({
            id: generateId(),
            name: sourceProduct.name,
            location: destination,
            qty: qty
        });
    }

    const fromLabel = sourceProduct.location === 'nevera' ? 'Nevera' : 'Bodega';
    const toLabel = destination === 'nevera' ? 'Nevera' : 'Bodega';
    addToHistory('Movido', sourceProduct.name, `${qty} de ${fromLabel} a ${toLabel}`);

    saveProducts();
    renderProducts();
    closeMoveModal();
    showToast(`Movido ${qty} unidades a ${toLabel}`);
}

// ===== Modal Historial =====
function showHistoryModal() {
    const container = document.getElementById('historyList');

    if (storageHistory.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--gray); padding: 40px;">Sin movimientos registrados</p>';
    } else {
        container.innerHTML = storageHistory.slice(0, 50).map(item => {
            const date = new Date(item.timestamp);
            const timeStr = date.toLocaleDateString('es-CO', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div class="history-item">
                    <div class="history-info">
                        <div class="history-action">${item.action} <span class="history-product">${item.product}</span></div>
                        <div class="history-details">${item.details}</div>
                    </div>
                    <div class="history-time">${timeStr}</div>
                </div>
            `;
        }).join('');
    }

    document.getElementById('historyModal').classList.add('open');
}

function closeHistoryModal() {
    document.getElementById('historyModal').classList.remove('open');
}
