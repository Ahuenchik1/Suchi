const { createApp } = Vue;

createApp({
    data() {
        return {
            orders: [],
            currentStatus: 'all',
            currentPage: 1,
            perPage: 1000,
            totalOrders: 0,
            loading: false,
            error: null,
            searchQuery: '',
            selectedOrder: null,
            orderDetailsModal: null,
            stats: {
                all: 0,
                new: 0,
                processing: 0,
                delivering: 0,
                completed: 0,
                cancelled: 0
            },
            statusFilters: [
                { value: 'all', label: 'Все заказы' },
                { value: 'new', label: 'Новые' },
                { value: 'processing', label: 'Готовятся' },
                { value: 'delivering', label: 'Доставляются' },
                { value: 'completed', label: 'Выполненные' },
                { value: 'cancelled', label: 'Отмененные' }
            ],
            availableStatuses: [
                { value: 'new', label: 'Новый' },
                { value: 'processing', label: 'Готовится' },
                { value: 'delivering', label: 'Доставляется' },
                { value: 'completed', label: 'Выполнен' },
                { value: 'cancelled', label: 'Отменен' }
            ],
            lastNewOrdersCount: 0,
            refreshInterval: null,
            notificationSound: new Audio('/static/sounds/notification.mp3')
        }
    },
    computed: {
        totalPages() {
            return Math.ceil(this.totalOrders / this.perPage);
        }
    },
    methods: {
        async loadOrders() {
            this.loading = true;
            this.error = null;
            try {
                const params = new URLSearchParams({
                    page: this.currentPage,
                    per_page: this.perPage
                });
                
                if (this.currentStatus !== 'all') {
                    params.append('status', this.currentStatus);
                }
                
                console.log('Запрос заказов с параметрами:', params.toString());
                const response = await fetch(`/api/admin/orders?${params}`);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Ошибка при загрузке заказов');
                }
                const data = await response.json();
                console.log('Полученные заказы:', data);
                this.orders = data;
                this.lastNewOrdersCount = this.stats.new;
            } catch (error) {
                console.error('Ошибка при загрузке заказов:', error);
                this.error = error.message || 'Произошла ошибка при загрузке заказов';
            } finally {
                this.loading = false;
            }
        },
        async updateOrderStatus(order) {
            try {
                const response = await fetch(`/api/admin/orders/${order.id}/status`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ status: order.status })
                });

                if (!response.ok) {
                    throw new Error('Ошибка при обновлении статуса');
                }

                // Обновляем статистику после изменения статуса
                await this.loadStats();

            } catch (error) {
                console.error('Ошибка при обновлении статуса:', error);
                // Возвращаем предыдущий статус в случае ошибки
                order.status = order.previousStatus;
            }
        },
        async deleteOrder(order) {
            if (!confirm('Вы уверены, что хотите удалить заказ? Это действие нельзя отменить.')) {
                return;
            }
            
            try {
                const response = await fetch(`/api/admin/orders/${order.id}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error('Ошибка при удалении заказа');
                }

                // Удаляем заказ из списка
                const index = this.orders.findIndex(o => o.id === order.id);
                if (index !== -1) {
                    this.orders.splice(index, 1);
                }
                
                // Обновляем статистику
                await this.loadStats();
                
                // Если открыто модальное окно с этим заказом, закрываем его
                if (this.selectedOrder && this.selectedOrder.id === order.id) {
                    this.orderDetailsModal.hide();
                }

            } catch (error) {
                console.error('Ошибка при удалении заказа:', error);
                alert('Не удалось удалить заказ');
            }
        },
        setFilter(status) {
            this.currentStatus = status;
            this.currentPage = 1;
            this.loadOrders();
        },
        changePage(page) {
            if (page >= 1 && page <= this.totalPages) {
                this.currentPage = page;
                this.loadOrders();
            }
        },
        getStatusBadgeClass(status) {
            const classes = {
                'new': 'bg-primary',
                'processing': 'bg-warning',
                'delivering': 'bg-info',
                'completed': 'bg-success',
                'cancelled': 'bg-danger'
            };
            return classes[status] || 'bg-secondary';
        },
        getStatusText(status) {
            const texts = {
                'new': 'Новый',
                'processing': 'Готовится',
                'delivering': 'Доставляется',
                'completed': 'Выполнен',
                'cancelled': 'Отменен'
            };
            return texts[status] || status;
        },
        getPaymentMethodText(method) {
            const texts = {
                'card': 'Банковской картой',
                'cash': 'Наличными',
                'sbp': 'СБП'
            };
            return texts[method] || method;
        },
        formatDate(date) {
            return new Date(date).toLocaleString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit'
            });
        },
        formatDeliveryTime(time) {
            // Форматирование времени доставки
            return time;
        },
        getStatusSelectClass(status) {
            return `status-${status}`;
        },
        showOrderDetails(order) {
            this.selectedOrder = order;
            this.orderDetailsModal.show();
        },
        async handleSearch() {
            // Добавить логику поиска
            await this.loadOrders();
        },
        async loadStats() {
            try {
                const response = await fetch('/api/admin/orders/stats');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                this.stats = data;
            } catch (error) {
                console.error('Ошибка при загрузке статистики:', error);
                this.stats = {
                    all: 0,
                    new: 0,
                    processing: 0,
                    delivering: 0,
                    completed: 0,
                    cancelled: 0
                };
            }
        },
        printOrder(order) {
            // Создаем новое окно для печати
            const printWindow = window.open('', '_blank');
            
            // Формируем HTML для печати
            const printContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Заказ #${order.id}</title>
                    <style>
                        body { font-family: Arial, sans-serif; }
                        .header { text-align: center; margin-bottom: 20px; }
                        .info-block { margin-bottom: 20px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { padding: 8px; border: 1px solid #ddd; }
                        th { background: #f8f9fa; }
                        .total { text-align: right; font-weight: bold; margin-top: 20px; }
                        @media print {
                            body { margin: 0; padding: 15px; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2>Заказ #${order.id}</h2>
                        <p>${this.formatDate(order.created_at)}</p>
                    </div>
                    
                    <div class="info-block">
                        <h3>Информация о доставке</h3>
                        <p><strong>Клиент:</strong> ${order.customer_name}</p>
                        <p><strong>Телефон:</strong> ${order.phone}</p>
                        <p><strong>Адрес:</strong> ${order.address}</p>
                        <p><strong>Время доставки:</strong> ${order.delivery_time}</p>
                    </div>
                    
                    <div class="info-block">
                        <h3>Состав заказа</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Товар</th>
                                    <th>Модификации</th>
                                    <th>Кол-во</th>
                                    <th>Цена</th>
                                    <th>Сумма</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${order.items.map(item => `
                                    <tr>
                                        <td>${item.product_name}</td>
                                        <td>${this.formatModifications(item.modifications)}</td>
                                        <td>${item.quantity}</td>
                                        <td>${item.price} ₽</td>
                                        <td>${item.price * item.quantity} ₽</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <div class="total">
                            Итого: ${order.total_amount} ₽
                        </div>
                    </div>
                </body>
                </html>
            `;
            
            // Записываем HTML в новое окно и печатаем
            printWindow.document.write(printContent);
            printWindow.document.close();
            
            // Ждем загрузки контента и запускаем печать
            printWindow.onload = function() {
                printWindow.print();
                printWindow.close();
            };
        },
        formatModifications(mods) {
            if (!mods) return '';
            
            const parts = [];
            
            if (mods.size) {
                // Проверяем, является ли size объектом
                const sizeText = typeof mods.size === 'object' ? mods.size.name : mods.size;
                const doughText = typeof mods.dough === 'object' ? mods.dough.name : mods.dough;
                
                if (sizeText) parts.push(`Размер: ${sizeText}`);
                if (doughText) parts.push(`Тесто: ${doughText}`);
            }
            
            if (mods.removed_ingredients?.length) {
                parts.push(`Без: ${mods.removed_ingredients.join(', ')}`);
            }
            
            if (mods.added_ingredients?.length) {
                parts.push(`Добавлено: ${mods.added_ingredients.join(', ')}`);
            }
            
            if (mods.condiments?.length) {
                parts.push(`Специи: ${mods.condiments.map(c => 
                    `${c.name} (${c.quantity}шт.)`).join(', ')}`
                );
            }
            
            return parts.join(', ');
        },
        async checkNewOrders() {
            try {
                const response = await fetch('/api/admin/orders/stats');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                
                // Проверяем, появились ли новые заказы
                if (this.lastNewOrdersCount < data.new) {
                    // Воспроизводим звук
                    this.notificationSound.play();
                    // Обновляем список заказов
                    this.loadOrders();
                }
                
                this.lastNewOrdersCount = data.new;
                this.stats = data;
            } catch (error) {
                console.error('Ошибка при проверке новых заказов:', error);
            }
        },
        startAutoRefresh() {
            // Проверяем каждые 30 секунд
            this.refreshInterval = setInterval(() => {
                this.checkNewOrders();
            }, 30000);
        },
        stopAutoRefresh() {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
        }
    },
    mounted() {
        this.orderDetailsModal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
        this.loadOrders();
        this.loadStats();
        this.startAutoRefresh();
    },
    beforeUnmount() {
        this.stopAutoRefresh();
    }
}).mount('#adminOrders'); 