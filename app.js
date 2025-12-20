// ===== App de Gestión de Pagos - PWA =====

// Configuración
const CONFIG = {
    ALERT_DAYS: 4,           // Días antes para empezar alertas
    NOTIFICATION_HOUR: 9,    // Hora del día para notificar (9 AM)
    STORAGE_KEY: 'payment_services'
};

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
    sayco: { name: 'Sayco', icon: '🎵' },
    otro: { name: 'Otro', icon: '🔧' }
};

// Estado de la aplicación
let services = [];
let currentTab = 'pending';
let editingId = null;

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

// ===== Storage =====
function loadServices() {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (stored) {
        services = JSON.parse(stored);
    } else {
        // Cargar datos iniciales del usuario
        loadInitialData();
    }
}

function loadInitialData() {
    // Datos iniciales del usuario - Diciembre 2024
    services = [
        {
            id: 'bodega-001',
            type: 'bodega',
            name: 'Bodega',
            amount: 0, // No especificado
            dueDay: 1,
            periodMonths: 1, // Mensual
            paid: true,
            paidDate: '2024-12-01',
            createdAt: new Date().toISOString()
        },
        {
            id: 'admin-001',
            type: 'admin',
            name: 'Administración',
            amount: 0,
            dueDay: 10,
            periodMonths: 1,
            paid: true,
            paidDate: '2024-12-07',
            createdAt: new Date().toISOString()
        },
        {
            id: 'cuota-001',
            type: 'cuota',
            name: 'Cuota Local',
            amount: 0,
            dueDay: 5,
            periodMonths: 1,
            paid: true,
            paidDate: '2024-12-04',
            createdAt: new Date().toISOString()
        },
        {
            id: 'agua-001',
            type: 'agua',
            name: 'Agua',
            amount: 0,
            dueDay: 25,
            periodMonths: 2, // Bimestral
            paid: false,
            paidDate: null,
            createdAt: new Date().toISOString()
        },
        {
            id: 'luz-001',
            type: 'luz',
            name: 'Luz',
            amount: 0,
            dueDay: 18,
            periodMonths: 1,
            paid: true,
            paidDate: '2024-12-18',
            createdAt: new Date().toISOString()
        },
        {
            id: 'directv-001',
            type: 'directv',
            name: 'DirecTV',
            amount: 0,
            dueDay: 22,
            periodMonths: 1,
            paid: false,
            paidDate: null,
            createdAt: new Date().toISOString()
        }
    ];
    saveServices();
}

function saveServices() {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(services));
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
    const type = SERVICE_TYPES[service.type] || SERVICE_TYPES.otro;
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
    const amount = parseFloat(document.getElementById('amount').value);
    const dueDay = parseInt(document.getElementById('dueDay').value);
    const alreadyPaid = document.getElementById('alreadyPaid').checked;

    if (editingId) {
        // Editar existente
        const index = services.findIndex(s => s.id === editingId);
        if (index !== -1) {
            services[index] = {
                ...services[index],
                type: typeValue,
                amount: amount,
                dueDay: dueDay
            };
            showToast('Servicio actualizado');
        }
        editingId = null;
    } else {
        // Crear nuevo
        const newService = {
            id: generateId(),
            type: typeValue,
            amount: amount,
            dueDay: dueDay,
            paid: alreadyPaid,
            paidDate: alreadyPaid ? new Date().toISOString() : null,
            createdAt: new Date().toISOString()
        };
        services.push(newService);
        showToast('Servicio agregado');
    }

    saveServices();
    renderServices();
    closeModal();
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

    let dueDate = new Date(today.getFullYear(), today.getMonth(), service.dueDay);
    const periodMonths = service.periodMonths || 1;

    // Si ya pasó este mes, usar el próximo período
    if (dueDate < today && !service.paid) {
        dueDate = new Date(today.getFullYear(), today.getMonth() + periodMonths, service.dueDay);
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
