// Компонент модального окна продукта
const productModal = {
    data() {
        return {
            product: null,
            selectedSize: null,
            selectedDough: null,
            selectedToppings: [],
            selectedModifications: [],
            showNutrition: false
        }
    },
    mounted() {
        // Слушаем событие для открытия модального окна
        window.addEventListener('show-product-modal', (event) => {
            const { productId, product, category } = event.detail;
            // Если у нас есть полные данные о продукте, используем их
            if (product) {
                this.product = product;
                this.resetSelections();
                this.modal.show();
            } else {
                // Иначе загружаем данные через API
                this.loadProduct(productId);
            }
        });
    },
    methods: {
        resetSelections() {
            this.selectedSize = null;
            this.selectedDough = null;
            this.selectedToppings = [];
            this.selectedModifications = [];
        }
        // ... остальные методы
    }
}; 