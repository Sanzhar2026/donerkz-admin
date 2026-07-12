// ============================================
// Telegram Mini App
// ============================================
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// ============================================
// КОНФИГУРАЦИЯ
// ============================================
const API_BASE = 'https://bul-ai-backend-production.up.railway.app/api/doner';

// ============================================
// ДАННЫЕ РОЛЕЙ И СОТРУДНИКОВ
// ============================================
const STAFF_DATA = {
    '7789648911': {
        id: '7789648911',
        name: 'Директор',
        phone: '+7 778 964 8911',
        role: 'director',
        access: ['orders', 'stats', 'menu', 'staff', 'settings']
    },
    '7089249375': {
        id: '7089249375',
        name: 'Менеджер',
        phone: '+7 708 924 9375',
        role: 'manager',
        access: ['orders', 'stats', 'menu']
    }
};

// Дополнительные сотрудники (кассиры) - добавляются через админку
let staffMembers = {
    '7771234567': {
        id: '7771234567',
        name: 'Кассир 1',
        phone: '+7 777 123 4567',
        role: 'cashier',
        access: ['orders']
    }
};

// ============================================
// СОСТОЯНИЕ
// ============================================
let state = {
    user: null,
    role: null,
    orders: [],
    categories: [],
    products: [],
    stats: null,
    currentTab: 'orders',
    statusFilter: 'all'
};

// ============================================
// DOM ЭЛЕМЕНТЫ
// ============================================
const $ = id => document.getElementById(id);

// ============================================
// АВТОРИЗАЦИЯ
// ============================================
function getUserRole() {
    const user = tg.initDataUnsafe?.user;
    if (!user) return null;

    const userId = String(user.id);
    const phone = user.phone_number || '';

    // Проверяем по ID
    if (STAFF_DATA[userId]) return STAFF_DATA[userId];

    // Проверяем по телефону
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (STAFF_DATA[cleanPhone]) return STAFF_DATA[cleanPhone];

    // Проверяем в дополнительных сотрудниках
    if (staffMembers[userId]) return staffMembers[userId];

    return null;
}

function initAuth() {
    const userData = getUserRole();

    if (!userData) {
        tg.showPopup({
            title: '⛔ Доступ запрещен',
            message: 'У вас нет прав доступа к админ-панели.',
            buttons: [{ type: 'default', text: 'Закрыть' }]
        });
        return false;
    }

    state.user = userData;
    state.role = userData.role;

    document.getElementById('user-name').textContent = userData.name;
    document.getElementById('user-role').textContent = getRoleEmoji(userData.role);

    renderTabs(userData.access);
    return true;
}

function getRoleEmoji(role) {
    const emojis = {
        'director': '👑',
        'manager': '💼',
        'cashier': '🛒'
    };
    return emojis[role] || '👤';
}

function getRoleLabel(role) {
    const labels = {
        'director': 'Директор',
        'manager': 'Менеджер',
        'cashier': 'Кассир'
    };
    return labels[role] || role;
}

// ============================================
// РЕНДЕРИНГ ВКЛАДОК
// ============================================
function renderTabs(access) {
    const nav = document.getElementById('tabs-nav');
    const tabs = [
        { id: 'orders', icon: '📦', label: 'Заказы' },
        { id: 'stats', icon: '📊', label: 'Статистика' },
        { id: 'menu', icon: '📋', label: 'Меню' },
        { id: 'staff', icon: '👥', label: 'Персонал' },
        { id: 'settings', icon: '⚙️', label: 'Настройки' }
    ];

    nav.innerHTML = tabs
        .filter(tab => access.includes(tab.id))
        .map(tab => `
            <button class="tab ${tab.id === 'orders' ? 'active' : ''}" 
                    data-tab="${tab.id}"
                    onclick="switchTab('${tab.id}')">
                <span class="tab-icon">${tab.icon}</span>
                <span class="tab-label">${tab.label}</span>
            </button>
        `).join('');
}

function switchTab(tabId) {
    state.currentTab = tabId;

    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabId);
    });

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const target = document.getElementById(`${tabId}-tab`);
    if (target) target.classList.add('active');

    if (tabId === 'orders') loadOrders();
    else if (tabId === 'stats') loadStats();
    else if (tabId === 'menu') loadMenu();
    else if (tabId === 'staff') renderStaff();
}

// ============================================
// TOAST УВЕДОМЛЕНИЯ
// ============================================
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

// ============================================
// API ЗАПРОСЫ
// ============================================
async function apiFetch(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const defaultOptions = {
        headers: { 'Content-Type': 'application/json' }
    };

    try {
        const response = await fetch(url, { ...defaultOptions, ...options });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Ошибка запроса');
        return data;
    } catch (error) {
        console.error('API Error:', error);
        showToast(error.message || 'Ошибка соединения', 'error');
        throw error;
    }
}

// ============================================
// ЗАГРУЗКА ЗАКАЗОВ
// ============================================
async function loadOrders() {
    const container = document.getElementById('orders-list');
    container.innerHTML = '<div class="loading">Загрузка заказов...</div>';

    try {
        let url = '/orders?limit=100';
        if (state.statusFilter !== 'all') {
            url += `&status=${state.statusFilter}`;
        }

        const data = await apiFetch(url);
        state.orders = data.orders || [];
        renderOrders();
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div>Ошибка загрузки</div>`;
    }
}

function renderOrders() {
    const container = document.getElementById('orders-list');

    if (state.orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>Нет заказов</p>
            </div>
        `;
        return;
    }

    const statusLabels = {
        'new': 'Новый',
        'confirmed': 'Подтвержден',
        'cooking': 'Готовится',
        'ready': 'Готов',
        'completed': 'Выполнен',
        'cancelled': 'Отменен'
    };

    container.innerHTML = state.orders.map(order => {
        const itemsText = order.items.map(i => `${i.name} × ${i.qty}`).join(', ');
        const time = new Date(order.created_at).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="order-card status-${order.status}">
                <div class="order-header">
                    <span class="order-id">#${order.order_id}</span>
                    <span class="status-badge ${order.status}">${statusLabels[order.status] || order.status}</span>
                </div>
                <div class="order-user">👤 ${order.user_name || 'Гость'} ${order.phone ? '📞 ' + order.phone : ''}</div>
                <div class="order-items">${itemsText}</div>
                <div class="order-footer">
                    <span class="order-total">💰 ${order.total} тг</span>
                    <span class="order-time">🕐 ${time}</span>
                </div>
                ${getOrderActions(order)}
            </div>
        `;
    }).join('');
}

function getOrderActions(order) {
    const actions = [];
    const status = order.status;
    const role = state.role;

    if (role === 'cashier' || role === 'manager' || role === 'director') {
        if (status === 'new') {
            actions.push(`<button class="btn btn-success btn-sm" onclick="updateStatus('${order.order_id}','confirmed')">✅ Принять</button>`);
        }
        if (status === 'confirmed') {
            actions.push(`<button class="btn btn-warning btn-sm" onclick="updateStatus('${order.order_id}','cooking')">🍳 Готовить</button>`);
        }
        if (status === 'cooking') {
            actions.push(`<button class="btn btn-success btn-sm" onclick="updateStatus('${order.order_id}','ready')">✅ Готово</button>`);
        }
        if (status === 'ready') {
            actions.push(`<button class="btn btn-primary btn-sm" onclick="updateStatus('${order.order_id}','completed')">🏁 Выполнен</button>`);
        }
        if (status === 'new' && (role === 'manager' || role === 'director')) {
            actions.push(`<button class="btn btn-danger btn-sm" onclick="updateStatus('${order.order_id}','cancelled')">❌ Отменить</button>`);
        }
    }

    return actions.length ? `<div class="order-actions">${actions.join(' ')}</div>` : '';
}

async function updateStatus(orderId, newStatus) {
    try {
        await apiFetch(`/orders/${orderId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        showToast(`✅ Статус заказа #${orderId} обновлен`, 'success');
        loadOrders();
    } catch (error) {
        showToast('❌ Ошибка обновления', 'error');
    }
}

// ============================================
// СТАТИСТИКА
// ============================================
async function loadStats() {
    const container = document.getElementById('stats-grid');
    container.innerHTML = '<div class="loading">Загрузка статистики...</div>';

    try {
        const data = await apiFetch('/stats');
        state.stats = data;
        renderStats();
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div>Ошибка загрузки</div>`;
    }
}

function renderStats() {
    const s = state.stats;
    if (!s) return;

    document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${s.total_orders || 0}</div>
            <div class="stat-label">Всего заказов</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${s.today_orders || 0}</div>
            <div class="stat-label">За сегодня</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${s.total_revenue || 0} ₸</div>
            <div class="stat-label">Выручка</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${s.avg_check || 0} ₸</div>
            <div class="stat-label">Средний чек</div>
        </div>
        <div class="stat-card" style="grid-column: span 2;">
            <div class="stat-label">Популярные блюда</div>
            ${(s.popular_items || []).map(item => `
                <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:14px;">
                    <span>${item.name}</span>
                    <span>${item.count} шт</span>
                </div>
            `).join('') || '<p style="color:var(--tg-hint);margin-top:8px;">Нет данных</p>'}
        </div>
    `;
}

// ============================================
// МЕНЮ
// ============================================
async function loadMenu() {
    const container = document.getElementById('menu-list');
    container.innerHTML = '<div class="loading">Загрузка меню...</div>';

    try {
        const [categories, products] = await Promise.all([
            apiFetch('/menu/categories'),
            apiFetch('/menu/products')
        ]);

        state.categories = categories.categories || [];
        state.products = products.products || [];
        renderMenu();
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div>Ошибка загрузки</div>`;
    }
}

function renderMenu() {
    const container = document.getElementById('menu-list');
    const isEditable = state.role === 'manager' || state.role === 'director';

    if (state.categories.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <p>Меню пусто</p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.categories.map(cat => {
        const products = state.products.filter(p => p.category_id === cat.id);

        return `
            <div class="category-card">
                <div class="category-title">
                    <span>${cat.icon || '📋'} ${cat.name}</span>
                    ${isEditable ? `
                        <div class="category-actions">
                            <button class="btn btn-primary btn-sm" onclick="showAddProduct(${cat.id})">➕</button>
                            <button class="btn btn-secondary btn-sm" onclick="editCategory(${cat.id})">✏️</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteCategory(${cat.id})">🗑️</button>
                        </div>
                    ` : ''}
                </div>
                ${products.map(p => `
                    <div class="product-item ${p.is_available ? '' : 'product-unavailable'}">
                        <div>
                            <span class="product-name">${p.name}</span>
                            <span class="product-price">${p.price} тг</span>
                            ${!p.is_available ? ' 🚫' : ''}
                        </div>
                        ${isEditable ? `
                            <div>
                                <button class="btn ${p.is_available ? 'btn-danger' : 'btn-success'} btn-sm" 
                                        onclick="toggleProduct(${p.id})">
                                    ${p.is_available ? '🔴' : '🟢'}
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="editProduct(${p.id})">✏️</button>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');
}

// ============================================
// ПЕРСОНАЛ (только для Директора)
// ============================================
function renderStaff() {
    const container = document.getElementById('staff-list');
    const allStaff = { ...STAFF_DATA, ...staffMembers };

    container.innerHTML = Object.values(allStaff).map(staff => `
        <div class="staff-card">
            <div class="staff-info">
                <span class="staff-name">${staff.name}</span>
                <span class="staff-phone">${staff.phone}</span>
            </div>
            <div>
                <span class="staff-role ${staff.role}">${getRoleLabel(staff.role)}</span>
                ${staff.id !== '7789648911' ? `
                    <button class="btn btn-danger btn-sm" onclick="removeStaff('${staff.id}')">🗑️</button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function showAddStaffForm() {
    if (state.role !== 'director') {
        showToast('⛔ Только директор может управлять персоналом', 'error');
        return;
    }

    document.getElementById('modal-title').textContent = '➕ Добавить сотрудника';
    document.getElementById('modal-body').innerHTML = `
        <div class="form-group">
            <label>Имя</label>
            <input id="staff-name" placeholder="Введите имя" />
        </div>
        <div class="form-group">
            <label>Телефон</label>
            <input id="staff-phone" placeholder="+7 777 777 7777" />
        </div>
        <div class="form-group">
            <label>Роль</label>
            <select id="staff-role">
                <option value="cashier">Кассир</option>
                <option value="manager">Менеджер</option>
            </select>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
            <button class="btn btn-primary" onclick="addStaff()">Добавить</button>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
}

function addStaff() {
    const name = document.getElementById('staff-name').value.trim();
    const phone = document.getElementById('staff-phone').value.trim();
    const role = document.getElementById('staff-role').value;

    if (!name || !phone) {
        showToast('Заполните все поля', 'warning');
        return;
    }

    const id = phone.replace(/[^0-9]/g, '');
    staffMembers[id] = {
        id,
        name,
        phone,
        role,
        access: role === 'manager' ? ['orders', 'stats', 'menu'] : ['orders']
    };

    showToast('✅ Сотрудник добавлен', 'success');
    closeModal();
    renderStaff();
}

function removeStaff(id) {
    if (id === '7789648911') {
        showToast('❌ Нельзя удалить директора', 'error');
        return;
    }
    delete staffMembers[id];
    showToast('✅ Сотрудник удален', 'success');
    renderStaff();
}

// ============================================
// MODAL
// ============================================
function closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
}

// ============================================
// НАСТРОЙКИ
// ============================================
function saveSettings() {
    showToast('✅ Настройки сохранены', 'success');
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================
function init() {
    if (!initAuth()) return;

    loadOrders();
    loadStats();
    loadMenu();
    renderStaff();

    // Автообновление каждые 15 секунд
    setInterval(() => {
        if (state.currentTab === 'orders') loadOrders();
        else if (state.currentTab === 'stats') loadStats();
    }, 15000);
}

// ============================================
// EVENT LISTENERS
// ============================================
document.getElementById('status-filter')?.addEventListener('change', function() {
    state.statusFilter = this.value;
    loadOrders();
});

document.getElementById('refresh-orders')?.addEventListener('click', loadOrders);

document.getElementById('add-category-btn')?.addEventListener('click', function() {
    document.getElementById('modal-title').textContent = '➕ Новая категория';
    document.getElementById('modal-body').innerHTML = `
        <div class="form-group">
            <label>Название</label>
            <input id="cat-name" placeholder="Например: Донеры" />
        </div>
        <div class="form-group">
            <label>Иконка</label>
            <input id="cat-icon" placeholder="🌯" value="📋" />
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
            <button class="btn btn-primary" onclick="saveCategory()">Сохранить</button>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
});

document.getElementById('add-staff-btn')?.addEventListener('click', showAddStaffForm);
document.getElementById('modal-close')?.addEventListener('click', closeModal);

document.getElementById('modal-overlay')?.addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

// ============================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ INLINE ONCLICK
// ============================================
window.switchTab = switchTab;
window.updateStatus = updateStatus;
window.closeModal = closeModal;
window.saveSettings = saveSettings;
window.showAddStaffForm = showAddStaffForm;
window.addStaff = addStaff;
window.removeStaff = removeStaff;
window.renderStaff = renderStaff;
window.loadMenu = loadMenu;
window.loadOrders = loadOrders;

window.saveCategory = async function() {
    const name = document.getElementById('cat-name').value.trim();
    const icon = document.getElementById('cat-icon').value.trim() || '📋';
    if (!name) {
        showToast('Введите название', 'warning');
        return;
    }
    try {
        await apiFetch('/menu/categories', {
            method: 'POST',
            body: JSON.stringify({ name, icon })
        });
        showToast('✅ Категория создана', 'success');
        closeModal();
        loadMenu();
    } catch (e) {
        showToast('❌ Ошибка', 'error');
    }
};

window.editCategory = async function(id) {
    const cat = state.categories.find(c => c.id === id);
    if (!cat) return;
    document.getElementById('modal-title').textContent = '✏️ Редактировать категорию';
    document.getElementById('modal-body').innerHTML = `
        <div class="form-group">
            <label>Название</label>
            <input id="cat-name" value="${cat.name}" />
        </div>
        <div class="form-group">
            <label>Иконка</label>
            <input id="cat-icon" value="${cat.icon || '📋'}" />
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
            <button class="btn btn-primary" onclick="updateCategory(${id})">Сохранить</button>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
};

window.updateCategory = async function(id) {
    const name = document.getElementById('cat-name').value.trim();
    const icon = document.getElementById('cat-icon').value.trim() || '📋';
    if (!name) {
        showToast('Введите название', 'warning');
        return;
    }
    try {
        await apiFetch(`/menu/categories/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ name, icon })
        });
        showToast('✅ Категория обновлена', 'success');
        closeModal();
        loadMenu();
    } catch (e) {
        showToast('❌ Ошибка', 'error');
    }
};

window.deleteCategory = async function(id) {
    if (!confirm('Удалить категорию и все товары?')) return;
    try {
        await apiFetch(`/menu/categories/${id}`, { method: 'DELETE' });
        showToast('✅ Категория удалена', 'success');
        loadMenu();
    } catch (e) {
        showToast('❌ Ошибка', 'error');
    }
};

window.showAddProduct = function(categoryId) {
    document.getElementById('modal-title').textContent = '➕ Новый товар';
    document.getElementById('modal-body').innerHTML = `
        <input type="hidden" id="prod-category" value="${categoryId}" />
        <div class="form-group">
            <label>Название</label>
            <input id="prod-name" placeholder="Название товара" />
        </div>
        <div class="form-group">
            <label>Цена (тг)</label>
            <input id="prod-price" type="number" placeholder="1200" />
        </div>
        <div class="form-group">
            <label>Описание</label>
            <textarea id="prod-desc" placeholder="Описание"></textarea>
        </div>
        <div class="form-group">
            <label><input type="checkbox" id="prod-available" checked /> Доступен</label>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
            <button class="btn btn-primary" onclick="saveProduct()">Сохранить</button>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
};

window.saveProduct = async function() {
    const category_id = parseInt(document.getElementById('prod-category').value);
    const name = document.getElementById('prod-name').value.trim();
    const price = parseFloat(document.getElementById('prod-price').value);
    const description = document.getElementById('prod-desc').value.trim();
    const is_available = document.getElementById('prod-available').checked;

    if (!name || !price) {
        showToast('Заполните название и цену', 'warning');
        return;
    }
    try {
        await apiFetch('/menu/products', {
            method: 'POST',
            body: JSON.stringify({ category_id, name, price, description, is_available })
        });
        showToast('✅ Товар добавлен', 'success');
        closeModal();
        loadMenu();
    } catch (e) {
        showToast('❌ Ошибка', 'error');
    }
};

window.editProduct = async function(id) {
    const prod = state.products.find(p => p.id === id);
    if (!prod) return;
    document.getElementById('modal-title').textContent = '✏️ Редактировать товар';
    document.getElementById('modal-body').innerHTML = `
        <div class="form-group">
            <label>Название</label>
            <input id="prod-name" value="${prod.name}" />
        </div>
        <div class="form-group">
            <label>Цена (тг)</label>
            <input id="prod-price" type="number" value="${prod.price}" />
        </div>
        <div class="form-group">
            <label>Описание</label>
            <textarea id="prod-desc">${prod.description || ''}</textarea>
        </div>
        <div class="form-group">
            <label><input type="checkbox" id="prod-available" ${prod.is_available ? 'checked' : ''} /> Доступен</label>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
            <button class="btn btn-primary" onclick="updateProduct(${id})">Сохранить</button>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
};

window.updateProduct = async function(id) {
    const category_id = state.products.find(p => p.id === id)?.category_id || 0;
    const name = document.getElementById('prod-name').value.trim();
    const price = parseFloat(document.getElementById('prod-price').value);
    const description = document.getElementById('prod-desc').value.trim();
    const is_available = document.getElementById('prod-available').checked;

    if (!name || !price) {
        showToast('Заполните название и цену', 'warning');
        return;
    }
    try {
        await apiFetch(`/menu/products/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ category_id, name, price, description, is_available })
        });
        showToast('✅ Товар обновлен', 'success');
        closeModal();
        loadMenu();
    } catch (e) {
        showToast('❌ Ошибка', 'error');
    }
};

window.toggleProduct = async function(id) {
    try {
        await apiFetch(`/menu/products/${id}/toggle`, { method: 'PUT' });
        loadMenu();
    } catch (e) {
        showToast('❌ Ошибка', 'error');
    }
};

// ============================================
// ЗАПУСК
// ============================================
init();