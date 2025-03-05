const { createApp } = Vue

createApp({
    data() {
        return {
            products: [],
            categories: [],
            activeCategory: null,
            currentProduct: {
                name: '',
                category_id: '',
                description: '',
                price: '',
                is_available: true
            },
            isEditing: false,
            loading: false,
            alert: null,
            imagePreview: null,
            modal: null,
            productIngredients: [],
            selectedCategory: null,
            toppings: [],
            currentTopping: {
                name: '',
                price: '',
            },
            productModal: null,
            toppingModal: null
        }
    },
    computed: {
        filteredProducts() {
            return this.products.filter(product => product.category_id === this.activeCategory)
        }
    },
    async mounted() {
        await this.fetchCategories()
        await this.fetchProducts()
        await this.fetchToppings()
        this.productModal = new bootstrap.Modal(document.getElementById('productModal'))
        this.toppingModal = new bootstrap.Modal(document.getElementById('toppingModal'))
    },
    methods: {
        getCategoryName(categoryId) {
            const category = this.categories.find(c => c.id === categoryId)
            return category ? category.name : ''
        },
        async fetchCategories() {
            try {
                const response = await fetch('/api/admin/categories')
                this.categories = await response.json()
                if (this.categories.length > 0) {
                    this.activeCategory = this.categories[0].id
                }
            } catch (error) {
                console.error('Ошибка при загрузке категорий:', error)
            }
        },
        async fetchProducts() {
            try {
                const response = await fetch('/api/products')
                this.products = await response.json()
            } catch (error) {
                console.error('Ошибка при загрузке продуктов:', error)
            }
        },
        showAddModal() {
            this.isEditing = false
            this.currentProduct = {
                name: '',
                category_id: '',
                description: '',
                price: '',
                is_available: true
            }
            this.imagePreview = null
            this.productIngredients = []
            this.selectedCategory = null
            this.productModal.show()
        },
        editProduct(product) {
            this.isEditing = true
            this.currentProduct = { ...product }
            this.imagePreview = product.image_path
            this.productModal.show()
            this.selectedCategory = this.categories.find(c => c.id === product.category_id)
            
            // Загружаем ингредиенты продукта
            this.fetchProductIngredients(product.id)
        },
        async deleteProduct(productId) {
            if (!confirm('Вы уверены, что хотите удалить этот продукт?')) return
            
            try {
                const response = await fetch(`/api/products/${productId}/delete`, {
                    method: 'POST'
                });
                
                if (!response.ok) {
                    throw new Error('Ошибка при удалении продукта');
                }
                
                await this.fetchProducts()
                this.showAlert('Продукт успешно удален', 'success')
            } catch (error) {
                this.showAlert('Ошибка при удалении продукта', 'danger')
                console.error('Ошибка:', error)
            }
        },
        async saveProduct() {
            this.loading = true
            const formData = new FormData(document.getElementById('productForm'))
            
            // Добавляем все поля продукта в formData
            Object.keys(this.currentProduct).forEach(key => {
                formData.append(key, this.currentProduct[key])
            })
            
            // Добавляем ингредиенты только для определенных категорий
            if (this.selectedCategory && 
                ['pizza', 'futomaki', 'uramaki', 'hot_rolls', 'classic_sushi', 'spicy_sushi']
                .includes(this.selectedCategory.slug) && 
                this.productIngredients.length > 0) {
                formData.append('ingredients', JSON.stringify(this.productIngredients))
            }
            
            if (this.$refs.imageInput.files[0]) {
                formData.append('image', this.$refs.imageInput.files[0])
            }
            
            try {
                if (this.isEditing) {
                    await axios.post(`/api/products/${this.currentProduct.id}/edit`, formData)
                    this.showAlert('Продукт успешно обновлен', 'success')
                } else {
                    await axios.post('/api/products/add', formData)
                    this.showAlert('Продукт успешно добавлен', 'success')
                }
                
                await this.fetchProducts()
                this.productModal.hide()
            } catch (error) {
                console.error('Ошибка при сохранении:', error)
                this.showAlert('Ошибка при сохранении продукта', 'danger')
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
        },
        addIngredient() {
            this.productIngredients.push({
                name: '',
                is_default: true
            })
        },
        removeIngredient(index) {
            this.productIngredients.splice(index, 1)
        },
        async fetchProductIngredients(productId) {
            try {
                const response = await fetch(`/api/products/${productId}/ingredients`)
                this.productIngredients = await response.json()
            } catch (error) {
                console.error('Ошибка при загрузке ингредиентов:', error)
                this.productIngredients = []
            }
        },
        async fetchToppings() {
            try {
                const response = await fetch('/api/pizza/toppings')
                this.toppings = await response.json()
            } catch (error) {
                console.error('Ошибка при загрузке добавок:', error)
                this.showAlert('Ошибка при загрузке добавок', 'danger')
            }
        },
        showAddToppingModal() {
            this.isEditing = false
            this.currentTopping = {
                name: '',
                price: '',
            }
            this.toppingModal.show()
        },
        async saveTopping() {
            this.loading = true
            const formData = new FormData()
            
            // Добавляем все поля в formData
            formData.append('name', this.currentTopping.name)
            formData.append('price', this.currentTopping.price)
            
            // Добавляем файл изображения, если он выбран
            if (this.$refs.toppingImageInput.files[0]) {
                formData.append('image', this.$refs.toppingImageInput.files[0])
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
                this.toppingModal.hide()
            } catch (error) {
                console.error('Ошибка при сохранении:', error)
                this.showAlert('Ошибка при сохранении добавки', 'danger')
            } finally {
                this.loading = false
            }
        },
        editTopping(topping) {
            this.isEditing = true
            this.currentTopping = { ...topping }
            this.toppingModal.show()
        },
        async deleteTopping(toppingId) {
            if (!confirm('Вы уверены, что хотите удалить эту добавку?')) return
            
            try {
                const response = await fetch(`/api/pizza/toppings/${toppingId}/delete`, {
                    method: 'POST'
                })
                
                if (!response.ok) throw new Error('Ошибка при удалении')
                
                await this.fetchToppings()
                this.showAlert('Добавка удалена', 'success')
            } catch (error) {
                console.error('Ошибка:', error)
                this.showAlert('Ошибка при удалении', 'danger')
            }
        }
    }
}).mount('#adminApp') 