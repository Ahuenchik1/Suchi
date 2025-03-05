const { createApp } = Vue

createApp({
    data() {
        return {
            slots: [],
            currentSlot: {
                time_start: '',
                time_end: '',
                max_orders: 10,
                is_available: true
            },
            isEditing: false,
            loading: false,
            modal: null
        }
    },
    mounted() {
        this.modal = new bootstrap.Modal(document.getElementById('slotModal'))
        this.loadSlots()
    },
    methods: {
        async loadSlots() {
            try {
                const response = await fetch('/api/admin/delivery-slots')
                this.slots = await response.json()
            } catch (error) {
                console.error('Ошибка при загрузке слотов:', error)
            }
        },
        showAddModal() {
            this.isEditing = false
            this.currentSlot = {
                time_start: '',
                time_end: '',
                max_orders: 10,
                is_available: true
            }
            this.modal.show()
        },
        editSlot(slot) {
            this.isEditing = true
            this.currentSlot = { ...slot }
            this.modal.show()
        },
        async saveSlot() {
            this.loading = true
            try {
                const url = this.isEditing 
                    ? `/api/admin/delivery-slots/${this.currentSlot.id}`
                    : '/api/admin/delivery-slots'
                
                const response = await fetch(url, {
                    method: this.isEditing ? 'PUT' : 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.currentSlot)
                })
                
                if (response.ok) {
                    await this.loadSlots()
                    this.modal.hide()
                }
            } catch (error) {
                console.error('Ошибка при сохранении слота:', error)
            } finally {
                this.loading = false
            }
        },
        async deleteSlot(slot) {
            if (!confirm('Вы уверены, что хотите удалить этот слот?')) return
            
            try {
                const response = await fetch(`/api/admin/delivery-slots/${slot.id}`, {
                    method: 'DELETE'
                })
                
                if (response.ok) {
                    await this.loadSlots()
                }
            } catch (error) {
                console.error('Ошибка при удалении слота:', error)
            }
        },
        formatTime(datetime) {
            if (!datetime) return '';
            // Если время уже в формате HH:MM, возвращаем как есть
            if (datetime.length === 5) return datetime;
            // Если это полная дата-время, извлекаем только время
            const match = datetime.match(/\d{2}:\d{2}/);
            return match ? match[0] : datetime;
        }
    }
}).mount('#adminApp') 