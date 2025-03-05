const { createApp } = Vue;

createApp({
    data() {
        return {
            period: 'day',
            loading: false,
            salesChart: null,
            isChartCollapsed: false,
            stats: {
                revenue: 0,
                orders_count: 0,
                average_order: 0,
                cancellation_rate: 0,
                categories: [],
                top_products: [],
                time_stats: []
            }
        }
    },
    methods: {
        toggleChart() {
            this.isChartCollapsed = !this.isChartCollapsed;
            // Даем время на анимацию сворачивания/разворачивания
            setTimeout(() => {
                if (!this.isChartCollapsed) {
                    this.updateChart();
                }
            }, 300);
        },
        async loadStats() {
            this.loading = true;
            try {
                const response = await fetch(`/api/admin/statistics?period=${this.period}`);
                if (!response.ok) {
                    throw new Error('Ошибка при загрузке статистики');
                }
                const data = await response.json();
                this.stats = data;
                if (!this.isChartCollapsed) {
                    this.updateChart();
                }
            } catch (error) {
                console.error('Ошибка:', error);
                alert('Не удалось загрузить статистику');
            } finally {
                this.loading = false;
            }
        },
        updateChart() {
            const ctx = document.getElementById('salesChart').getContext('2d');
            
            // Уничтожаем предыдущий график если он существует
            if (this.salesChart) {
                this.salesChart.destroy();
            }
            
            // Подготавливаем данные
            const labels = this.stats.time_stats.map(stat => stat.time_period);
            const revenueData = this.stats.time_stats.map(stat => stat.revenue);
            const ordersData = this.stats.time_stats.map(stat => stat.orders_count);
            
            this.salesChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Выручка',
                            data: revenueData,
                            borderColor: 'rgb(75, 192, 192)',
                            yAxisID: 'y',
                        },
                        {
                            label: 'Количество заказов',
                            data: ordersData,
                            borderColor: 'rgb(255, 99, 132)',
                            yAxisID: 'y1',
                        }
                    ]
                },
                options: {
                    responsive: true,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    tooltips: {
                        callbacks: {
                            label: function(tooltipItem, data) {
                                if (tooltipItem.datasetIndex === 0) {
                                    return 'Выручка: ' + Number(tooltipItem.value).toLocaleString('ru-RU', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                    }) + ' ₽';
                                }
                                return 'Заказов: ' + tooltipItem.value;
                            }
                        }
                    },
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Выручка (₽)'
                            },
                            ticks: {
                                callback: function(value) {
                                    return Number(value).toLocaleString('ru-RU', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                    }) + ' ₽';
                                }
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Количество заказов'
                            },
                            grid: {
                                drawOnChartArea: false
                            }
                        }
                    }
                }
            });
        },
        setPeriod(period) {
            this.period = period;
            this.loadStats();
        },
        formatCurrency(value) {
            return Number(value).toLocaleString('ru-RU', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }) + ' ₽';
        }
    },
    mounted() {
        this.loadStats();
    }
}).mount('#adminStats');