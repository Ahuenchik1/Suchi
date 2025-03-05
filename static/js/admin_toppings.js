const { createApp } = Vue

createApp({
    data() {
        return {
            toppings: [],
            currentTopping: {
                name: '',
                price: '',
                is_available: true
            },
            isEditing: false,
            loading: false,
            alert: null,
            imagePreview: null,
            modal: null
        }
    },
    async mounted() {
        await this.fetchToppings()
        this.modal = new bootstrap.Modal(document.getElementById('toppingModal'))
    },
    methods: {
        async fetchToppings() {
            try {
                const response = await axios.get('/api/pizza/toppings')
                this.toppings = response.data
            } catch (error) {
                this.showAlert('Ошибка при загрузке добавок', 'danger')
            }
        },
        showAddModal() {
            this.isEditing = false
            this.currentTopping = {
                name: '',
                price: '',
                is_available: true
            }
            this.imagePreview = null
            this.modal.show()
        },
        editTopping(topping) {
            this.isEditing = true
            this.currentTopping = { ...topping }
            this.imagePreview = topping.image_path
            this.modal.show()
        },
        async deleteTopping(topping) {
            if (!confirm('Вы уверены, что хотите удалить эту добавку?')) return
            
            try {
                await axios.post(`/api/pizza/toppings/${topping.id}/delete`)
                await this.fetchToppings()
                this.showAlert('Добавка успешно удалена', 'success')
            } catch (error) {
                this.showAlert('Ошибка при удалении добавки', 'danger')
            }
        },
        async saveTopping() {
            this.loading = true
            const formData = new FormData()
            
            Object.keys(this.currentTopping).forEach(key => {
                formData.append(key, this.currentTopping[key])
            })
            
            if (this.$refs.imageInput.files[0]) {
                formData.append('image', this.$refs.imageInput.files[0])
            }
            
            try {
                if (this.isEditing) {
                    await axios.post(`/api/pizza/toppings/${this.currentTopping.id}/edit`, formData)
                    this.showAlert('Добавка успешно обновлена', 'success')
                } else {
                    await axios.post('/api/pizza/toppings/add', formData)
                    this.showAlert('Добавка успешно добавлена', 'success')
                }
                
                await this.fetchToppings()
                this.modal.hide()
            } catch (error) {
                this.showAlert('Ошибка при сохранении добавки', 'danger')
            } finally {
                this.loading = false
            }
        },
        handleImageChange(event) {
            const file = event.target.files[0]
            if (file) {
                this.imagePreview = URL.createObjectURL(file)
            }
        },
        showAlert(message, type = 'success') {
            this.alert = { message, type }
            setTimeout(() => {
                this.alert = null
            }, 3000)
        }
    }
}).mount('#adminApp') 