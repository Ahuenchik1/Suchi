const { createApp } = Vue;

createApp({
    data() {
        return {
            orderId: window.location.pathname.split('/').pop(),
            order: null,
            sbpQrCode: null,
            paymentCheckInterval: null,
            loading: true,
            error: null
        }
    },
    computed: {
        formattedDeliveryTime() {
            if (!this.order || !this.order.delivery_time) return '';
            
            // Если это "ближайшее время"
            if (this.order.delivery_time.includes('Ближайшее время')) {
                return this.order.delivery_time;
            }
            
            try {
                // Проверяем, содержит ли строка диапазон времени
                if (this.order.delivery_time.includes(' - ')) {
                    return this.order.delivery_time;
                } else {
                    // Если нет диапазона, извлекаем время
                    const timeMatch = this.order.delivery_time.match(/\d{2}:\d{2}/);
                    if (timeMatch) {
                        return timeMatch[0];
                    }
                }
                return this.order.delivery_time;
            } catch (error) {
                return this.order.delivery_time;
            }
        }
    },
    async mounted() {
        try {
            await this.loadOrderDetails();
            if (this.order && this.order.payment_method === 'card' && !this.order.is_paid) {
                this.redirectToPayment();
            } else if (this.order && this.order.payment_method === 'sbp' && !this.order.is_paid) {
                await this.loadSbpQrCode();
                this.startPaymentCheck();
            }
        } catch (error) {
            console.error('Ошибка при инициализации:', error);
            this.error = 'Произошла ошибка при загрузке страницы';
        }
    },
    methods: {
        async loadOrderDetails() {
            try {
                const response = await fetch(`/api/orders/${this.orderId}`);
                if (!response.ok) {
                    throw new Error('Не удалось загрузить данные заказа');
                }
                this.order = await response.json();
            } catch (error) {
                console.error('Ошибка при загрузке деталей заказа:', error);
                this.error = 'Произошла ошибка при загрузке данных заказа';
            } finally {
                this.loading = false;
            }
        },
        redirectToPayment() {
            setTimeout(() => {
                window.location.href = `/payment/card/${this.orderId}`;
            }, 2000);
        },
        async loadSbpQrCode() {
            try {
                const response = await fetch(`/api/payment/sbp/${this.orderId}`);
                const data = await response.json();
                this.sbpQrCode = data.qr_code;
            } catch (error) {
                console.error('Ошибка при загрузке QR-кода:', error);
            }
        },
        startPaymentCheck() {
            this.paymentCheckInterval = setInterval(async () => {
                try {
                    const response = await fetch(`/api/payment/status/${this.orderId}`);
                    const data = await response.json();
                    if (data.is_paid) {
                        this.order.is_paid = true;
                        clearInterval(this.paymentCheckInterval);
                    }
                } catch (error) {
                    console.error('Ошибка при проверке статуса оплаты:', error);
                }
            }, 5000);
        }
    },
    beforeUnmount() {
        if (this.paymentCheckInterval) {
            clearInterval(this.paymentCheckInterval);
        }
    }
}).mount('#orderSuccessApp'); 