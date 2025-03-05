const { createApp } = Vue;

createApp({
    name: 'CheckoutPage',
    data() {
        return {
            cart: JSON.parse(localStorage.getItem('checkoutCart')) || [],
            form: {
                name: '',
                phone: '',
                address: '',
                deliverySlot: null,
                paymentMethod: 'card'
            },
            loading: false,
            error: null,
            deliveryPrice: 500,
            freeDeliveryThreshold: 1000,
            orderItemsExpanded: false,
            summaryCollapsed: false,
            paymentMethods: [
                { id: 'card', name: 'Банковской картой онлайн', icon: 'bi-credit-card' },
                { id: 'sbp', name: 'Система быстрых платежей', icon: 'bi-phone' },
                { id: 'cash', name: 'Наличными курьеру', icon: 'bi-cash' }
            ],
            deliverySlots: [],
            loadingSlots: false
        }
    },
    mounted() {
        // Проверяем наличие товаров в корзине
        if (!this.cart.length) {
            window.location.href = '/';  // Редирект на главную если корзина пуста
        }
        // Инициализируем значения из localStorage если есть
        const savedForm = localStorage.getItem('checkoutForm');
        if (savedForm) {
            this.form = { ...this.form, ...JSON.parse(savedForm) };
        }
        this.loadDeliverySlots();
    },
    computed: {
        isMobile() {
            return window.innerWidth <= 768;
        },
        subtotal() {
            return this.cart.reduce((sum, item) => sum + item.totalPrice, 0)
        },
        needDeliveryFee() {
            return this.subtotal < this.freeDeliveryThreshold
        },
        totalAmount() {
            return this.subtotal + (this.needDeliveryFee ? this.deliveryPrice : 0)
        },
        isFormValid() {
            return this.form.name && 
                   this.form.phone && 
                   this.form.address && 
                   this.form.paymentMethod &&
                   this.form.deliverySlot
        },
        deliveryTimeText() {
            if (this.form.deliverySlot === 'asap') {
                const estimatedTime = new Date();
                // Базовое время 40 минут + возможное дополнительное время из-за загрузки
                const waitTime = this.estimatedWaitTime || 40;
                estimatedTime.setMinutes(estimatedTime.getMinutes() + waitTime);
                const timeStr = estimatedTime.toLocaleTimeString('ru-RU', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                return `В ближайшее время (приблизительно к ${timeStr}${waitTime > 40 ? ', повышенная загрузка' : ''})`;
            }
            const slot = this.deliverySlots.find(s => s.time_start === this.form.deliverySlot);
            return slot ? this.formatDeliveryTime(slot) : '';
        }
    },
    methods: {
        toggleSummary() {
            this.summaryCollapsed = !this.summaryCollapsed;
        },
        toggleOrderItems() {
            this.orderItemsExpanded = !this.orderItemsExpanded;
        },
        backToMenu() {
            // Сохраняем текущее состояние корзины перед возвратом
            localStorage.setItem('cart', JSON.stringify(this.cart));
            window.location.href = '/';
        },
        async submitOrder() {
            if (this.loading) return;
            this.loading = true;
            this.error = null;
            
            try {
                const orderData = {
                    name: this.form.name,
                    phone: this.form.phone,
                    address: this.form.address,
                    deliverySlot: this.form.deliverySlot,
                    paymentMethod: this.form.paymentMethod,
                    items: this.cart,
                    total: this.totalAmount
                };
                // Проверяем данные товаров перед отправкой
                console.log('Корзина перед отправкой:', this.cart);
                console.log('Данные заказа:', orderData);
                
                const response = await fetch('/api/checkout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(orderData)
                });
                
                const result = await response.json();
                console.log('Ответ сервера:', result);
                if (result.status === 'success') {
                    // Очищаем все данные корзины
                    localStorage.removeItem('cart')
                    localStorage.removeItem('cartMap')
                    localStorage.removeItem('checkoutCart')
                    localStorage.removeItem('checkoutForm')
                    // Перенаправляем на страницу успешного оформления
                    window.location.href = `/order-success/${result.order_id}`
                } else {
                    this.error = result.message || 'Ошибка при оформлении заказа';
                }
            } catch (error) {
                console.error('Ошибка при оформлении заказа:', error)
                this.error = 'Произошла ошибка при отправке заказа';
            } finally {
                this.loading = false;
            }
        },
        formatDeliveryTime(slot) {
            const start = this.formatTime(slot.time_start);
            const end = this.formatTime(slot.time_end);
            const availabilityText = slot.slots_left <= 3 
                ? ` (осталось мест: ${slot.slots_left})`
                : '';
            return `${start} - ${end}${availabilityText}`;
        },
        formatTime(datetime) {
            if (!datetime) return '';
            const match = datetime.match(/\d{2}:\d{2}/);
            return match ? match[0] : datetime;
        },
        async loadDeliverySlots() {
            this.loadingSlots = true;
            try {
                const response = await fetch('/api/delivery-slots');
                const slots = await response.json();
                console.log('Полученные слоты:', slots); // Для отладки
                this.deliverySlots = slots;
            } catch (error) {
                console.error('Ошибка при загрузке слотов доставки:', error);
            } finally {
                this.loadingSlots = false;
            }
        }
    },
    watch: {
        form: {
            handler(newForm) {
                localStorage.setItem('checkoutForm', JSON.stringify(newForm));
            },
            deep: true
        }
    }
}).mount('#checkout') 