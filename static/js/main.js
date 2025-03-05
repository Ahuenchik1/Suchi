const { createApp } = Vue

const app = createApp({
    data() {
        return {
            categories: [],
            products: {},  // Объект с продуктами по категориям
            activeSection: null,
            popularProducts: [],
            cart: JSON.parse(localStorage.getItem('cart')) || [],
            showCart: false,  // Добавляем переменную для управления видимостью корзины
            // Добавляем новые данные для модального окна
            selectedProduct: null,
            selectedSize: null,
            selectedDough: null,
            selectedToppings: [],
            pizzaSizes: [],
            pizzaDough: [],
            pizzaToppings: [],
            showNutrition: false,
            productModal: null,
            currentCartItem: null,  // Добавляем поле для отслеживания текущего товара в корзине
            cartMap: new Map(JSON.parse(localStorage.getItem('cartMap')) || []),
            productIngredients: [],
            cartModal: null,
            isCartModalInitialized: false,
            additionalOffers: [],  // Для дополнительных предложений
            isEditMode: false,  // Флаг режима редактирования
            editingCartItem: null,  // Текущий редактируемый элемент корзины
            condiments: [],        // Специи
            selectedCondiments: [], // Выбранные специи и их количество
            currentSlide: 0,
            autoScrollInterval: null,
            isManualScrolling: false
        }
    },
    computed: {
        filteredProducts() {
            return this.activeSection ? 
                   this.products[this.activeSection] || [] : 
                   []
        },
        calculateTotalPrice() {
            let basePrice = this.selectedProduct ? this.selectedProduct.price : 0;
            
            // Учитываем размер
            if (this.selectedSize && this.pizzaSizes) {
                const size = this.pizzaSizes.find(s => s.id === this.selectedSize);
                if (size) {
                    basePrice = Math.round(basePrice * size.price_modifier);
                }
            }
            
            // Добавляем стоимость топпингов
            if (this.selectedToppings && this.pizzaToppings) {
                const toppingsPrice = this.selectedToppings.reduce((sum, toppingId) => {
                    const topping = this.pizzaToppings.find(t => t.id === toppingId);
                    return sum + (topping ? topping.price : 0);
                }, 0);
                basePrice += toppingsPrice;
            }
            
            // Добавляем стоимость специй
            if (this.selectedCondiments.length > 0) {
                const condimentsPrice = this.selectedCondiments.reduce((sum, condiment) => {
                    return sum + (condiment.price * condiment.quantity);
                }, 0);
                basePrice += condimentsPrice;
            }
            
            return basePrice;
        },
        getCurrentCartItem() {
            if (!this.selectedProduct) return null;
            
            const key = this.getCartItemKey(this.selectedProduct);
            return this.cartMap.get(key);
        },
        defaultSize() {
            return this.pizzaSizes.find(s => s.value === 30)?.id
        },
        defaultDough() {
            return this.pizzaDough.find(d => d.name === 'Традиционное')?.id
        }
    },
    watch: {
        cart: {
            deep: true,
            handler(newCart) {
                localStorage.setItem('cart', JSON.stringify(newCart));
                localStorage.setItem('cartMap', JSON.stringify([...this.cartMap]));
            }
        },
        getCurrentCartItem: {
            immediate: true,
            handler(newItem) {
                this.currentCartItem = newItem;
            }
        },
        showCart(newVal) {
            if (newVal) {
                this.showCartModal()
            } else {
                this.hideCartModal()
            }
        },
        showNutrition(newVal) {
            if (newVal) {
                this.checkNutritionPopupPosition();
            }
        }
    },
    async mounted() {
        if (localStorage.getItem('cartMap')) {
            this.cartMap = new Map(JSON.parse(localStorage.getItem('cartMap')));
        }
        
        await this.fetchCategories()
        await this.fetchAllProducts()
        await this.fetchPopularProducts()
        
        // Инициализация модального окна после монтирования
        this.$nextTick(() => {
            const modalEl = document.getElementById('productModal');
            this.productModal = new bootstrap.Modal(modalEl, {
                backdrop: true,
                keyboard: true
            });
            
            // Обработчик перед закрытием модального окна
            modalEl.addEventListener('hide.bs.modal', () => {
                // Убираем фокус со всех элементов внутри модального окна
                const focusableElements = modalEl.querySelectorAll(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                focusableElements.forEach(el => el.setAttribute('tabindex', '-1'));
            });
            
            modalEl.addEventListener('hidden.bs.modal', () => {
                this.selectedProduct = null;
                this.selectedSize = null;
                this.selectedDough = null;
                this.selectedToppings = [];
                this.productIngredients = [];
                setTimeout(() => {
                    const activeElement = document.activeElement;
                    if (activeElement) {
                        activeElement.blur();
                    }
                }, 0);
            });
        });
        
        // Загружаем данные для пиццы
        await this.fetchPizzaData()
        
        // Добавляем обработчик клика для закрытия всплывающего окна
        document.addEventListener('click', this.handleOutsideClick)
        
        // Инициализация модального окна корзины
        this.initCartModal()
        this.initScrollSpy()
        
        // Добавляем слушатель для закрытия окна при клике вне его
        document.addEventListener('click', this.closeNutrition);
        this.initDeliverySlider();
    },
    beforeUnmount() {
        // Удаляем обработчик при уничтожении компонента
        document.removeEventListener('click', this.handleOutsideClick)
        
        // Удаляем слушатель при уничтожении компонента
        document.removeEventListener('click', this.closeNutrition);
    },
    methods: {
        async fetchCategories() {
            try {
                const response = await fetch('/api/categories')
                this.categories = await response.json()
            } catch (error) {
                console.error('Ошибка при загрузке категорий:', error)
            }
        },
        async fetchAllProducts() {
            try {
                // Загружаем продукты для каждой категории
                for (const category of this.categories) {
                    const response = await fetch(`/api/products/${category.id}`)
                    this.products[category.id] = await response.json()
                }
            } catch (error) {
                console.error('Ошибка при загрузке продуктов:', error)
            }
        },
        async fetchPopularProducts() {
            try {
                const response = await fetch('/api/products/popular')
                this.popularProducts = await response.json()
            } catch (error) {
                console.error('Ошибка при загрузке популярных продуктов:', error)
            }
        },
        getProductsByCategory(categoryId) {
            return this.products[categoryId] || []
        },
        getCurrentCategoryName() {
            const category = this.categories.find(c => c.id === this.activeSection)
            return category ? category.name : ''
        },
        scrollToCategory(categoryId) {
            const element = document.getElementById(categoryId);
            if (element) {
                // Получаем позицию элемента относительно верха страницы
                const elementRect = element.getBoundingClientRect();
                const absoluteElementTop = elementRect.top + window.pageYOffset;
                
                // Вычисляем центр экрана
                const windowHeight = window.innerHeight;
                const offset = windowHeight / 3; // Смещение от верха (1/3 экрана)
                
                // Вычисляем позицию прокрутки
                const scrollPosition = absoluteElementTop - offset;
                
                // Выполняем плавную прокрутку
                window.scrollTo({
                    top: scrollPosition,
                    behavior: 'smooth'
                });
            }
        },
        initScrollSpy() {
            this.category_nav = document.querySelector('.category-nav');
            const navHeight = this.category_nav.offsetHeight;
            const sections = document.querySelectorAll('section[id]');
            const windowHeight = window.innerHeight;
  
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach(entry => {
                        const rect = entry.target.getBoundingClientRect();
                        const elementCenter = rect.top + rect.height / 2;
                        const viewportCenter = windowHeight / 2;
  
                        // Определяем активную секцию по центру экрана
                        if (entry.isIntersecting) {
                            const distanceFromCenter = Math.abs(elementCenter - viewportCenter);
                            if (distanceFromCenter < rect.height / 3) {  // Используем треть высоты секции как порог
                                this.activeSection = entry.target.id;
                            }
                        }
                    });
                },
                {
                    rootMargin: '0px',
                    threshold: [0, 0.25, 0.5, 0.75, 1]  // Увеличиваем количество точек наблюдения
                }
            );
  
            // Наблюдаем за всеми секциями категорий
            sections.forEach((section) => {
                observer.observe(section);
            });
            
            // Обработчик скролла для более плавного определения активной секции
            window.addEventListener('scroll', () => {
                const viewportMiddle = window.scrollY + windowHeight / 2;
                sections.forEach(section => {
                    const sectionTop = section.offsetTop;
                    const sectionBottom = sectionTop + section.offsetHeight;
                    if (viewportMiddle >= sectionTop && viewportMiddle <= sectionBottom) {
                        this.activeSection = section.id;
                    }
                });
            });
        },
        getCartItemKey(product) {
            if (product.category_name === 'Пицца') {
                return `${product.id}-${this.selectedSize}-${this.selectedDough}-${JSON.stringify(this.selectedToppings)}`;
            }
            return String(product.id);
        },
        async fetchProductIngredients() {
            if (!this.selectedProduct) return
            
            try {
                const response = await fetch(`/api/products/${this.selectedProduct.id}/ingredients`)
                const ingredients = await response.json()
                this.productIngredients = ingredients.map(ing => ({
                    ...ing,
                    selected: true  // Теперь все ингредиенты по умолчанию выбраны
                }))
            } catch (error) {
                console.error('Ошибка при загрузке ингредиентов:', error)
                this.productIngredients = []
            }
        },
        addToCart() {
            const item = {
                product_id: this.selectedProduct.id,
                name: this.selectedProduct.name,
                price: this.calculateTotalPrice,
                quantity: 1,
                image_path: this.selectedProduct.image_path,
                ingredients: this.productIngredients.filter(ing => ing.selected).map(ing => ing.name),
                options: {
                    size: this.selectedProduct.category_name === 'Пицца' && this.selectedSize ? 
                        this.pizzaSizes.find(s => s.id === this.selectedSize) : null,
                    dough: this.selectedProduct.category_name === 'Пицца' && this.selectedDough ? 
                        this.pizzaDough.find(d => d.id === this.selectedDough) : null,
                    toppings: this.selectedProduct.category_name === 'Пицца' ? this.selectedToppings.map(id => 
                        this.pizzaToppings.find(t => t.id === id)
                    ).filter(Boolean) : [],
                    condiments: this.selectedCondiments
                        .filter(c => c.quantity > 0)
                        .map(condiment => ({
                            id: condiment.id,
                            name: condiment.name,
                            price: condiment.price,
                            quantity: condiment.quantity
                        }))
                }
            }
            
            // Генерируем уникальный ключ для корзины
            const cartKey = this.generateCartKey(item)
            
            const existingItem = this.cartMap.get(cartKey)
            if (existingItem) {
                existingItem.quantity++
                existingItem.totalPrice = Math.round((existingItem.quantity * this.calculateTotalPrice) * 100) / 100
            } else {
                item.totalPrice = this.calculateTotalPrice
                this.cart.push(item)
                this.cartMap.set(cartKey, item)
            }
            
            this.closeModal()
        },
        generateCartKey(item) {
            return JSON.stringify({
                product_id: item.product_id,
                size_id: item.options.size?.id,
                dough_id: item.options.dough?.id,
                ingredients: item.ingredients,
                toppings: item.options.toppings?.map(t => t.id).sort(),
                condiments: item.options.condiments?.map(c => ({
                    id: c.id,
                    quantity: c.quantity
                })).sort((a, b) => a.id - b.id)
            })
        },
        async fetchPizzaData() {
            try {
                // Загружаем размеры
                const sizesResponse = await fetch('/api/pizza/sizes')
                this.pizzaSizes = await sizesResponse.json()
                
                // Загружаем типы теста
                const doughResponse = await fetch('/api/pizza/dough')
                this.pizzaDough = await doughResponse.json()
                
                // Загружаем добавки
                const toppingsResponse = await fetch('/api/pizza/toppings')
                this.pizzaToppings = await toppingsResponse.json()
                
            } catch (error) {
                console.error('Ошибка при загрузке данных для пиццы:', error)
            }
        },
        
        async showProductDetails(product) {
            console.log('Категория продукта:', product.category_name);
            this.selectedProduct = product;
            
            // Сначала загружаем все необходимые данные
            if (product.category_name === 'Пицца') {
                await this.fetchPizzaData();
            } else if ([
                'Роллы ФУТОМАКИ',
                'Роллы УРАМАКИ',
                'Теплые роллы',
                'Суши классические',
                'Суши спайси',
                'Сеты'
            ].includes(product.category_name)) {
                await this.fetchCondiments();
            }
            
            await this.fetchProductIngredients();
            
            // Если это редактирование существующего товара
            if (this.isEditMode && this.editingCartItem) {
                // Восстанавливаем состояние ингредиентов
                if (this.productIngredients.length && this.editingCartItem.ingredients) {
                    this.productIngredients.forEach(ing => {
                        ing.selected = this.editingCartItem.ingredients.includes(ing.name);
                    });
                }
                
                // Восстанавливаем размер и тесто для пиццы
                if (this.editingCartItem.options.size) {
                    this.selectedSize = this.editingCartItem.options.size.id;
                }
                if (this.editingCartItem.options.dough) {
                    this.selectedDough = this.editingCartItem.options.dough.id;
                }
                
                // Восстанавливаем дополнительные топпинги для пиццы
                if (this.editingCartItem.options.toppings) {
                    this.selectedToppings = this.editingCartItem.options.toppings.map(t => t.id);
                } else {
                    this.selectedToppings = [];
                }
                
                // Восстанавливаем выбранные специи
                if (this.editingCartItem.options.condiments) {
                    this.selectedCondiments = this.editingCartItem.options.condiments.map(c => ({
                        id: c.id,
                        name: c.name,
                        price: c.price,
                        quantity: c.quantity
                    }));
                } else {
                    this.selectedCondiments = [];
                }
            } else {
                // Сброс значений для нового товара
                this.selectedToppings = [];
                this.selectedCondiments = [];
                // Устанавливаем все ингредиенты как выбранные для нового товара
                if (this.productIngredients.length) {
                    this.productIngredients.forEach(ing => {
                        ing.selected = true;
                    });
                }
                // Устанавливаем значения по умолчанию только для пиццы
                if (product.category_name === 'Пицца') {
                    // Находим размер 30 см
                    const mediumSize = this.pizzaSizes.find(s => s.value === 30);
                    this.selectedSize = mediumSize ? mediumSize.id : this.pizzaSizes[0].id;
                    if (this.pizzaDough.length > 0) {
                        this.selectedDough = this.pizzaDough[0].id;
                    }
                } else {
                    this.selectedSize = null;
                    this.selectedDough = null;
                }
            }
            
            if (!this.productModal) {
                this.productModal = new bootstrap.Modal(document.getElementById('productModal'));
            }
            this.productModal.show();
        },
        
        selectSize(size) {
            this.selectedSize = size.id
        },
        
        selectDough(dough) {
            this.selectedDough = dough.id
        },
        
        increaseQuantity(item) {
            const cartItem = item || this.currentCartItem;
            if (cartItem) {
                cartItem.quantity++;
                cartItem.totalPrice = Math.round((cartItem.quantity * cartItem.price) * 100) / 100;
                // Обновляем состояние для реактивности
                this.cart = [...this.cart];
            }
        },
        decreaseQuantity(item) {
            const cartItem = item || this.currentCartItem;
            if (cartItem) {
                cartItem.quantity--;
                
                if (cartItem.quantity <= 0) {
                    // Удаляем товар из корзины
                    const index = this.cart.indexOf(cartItem);
                    if (index > -1) {
                        this.cart.splice(index, 1);
                        const key = this.generateCartKey(cartItem);
                        this.cartMap.delete(key);
                    }
                } else {
                    // Обновляем цену
                    cartItem.totalPrice = Math.round((cartItem.quantity * cartItem.price) * 100) / 100;
                    // Обновляем состояние для реактивности
                    this.cart = [...this.cart];
                }
            }
        },
        calculatePriceForSize(size) {
            if (!this.selectedProduct) return 0
            return Math.round(this.selectedProduct.price * size.price_modifier)
        },
        handleOutsideClick() {
            this.showNutrition = false
        },
        closeModal() {
            if (this.productModal) {
                this.productModal.hide();
                this.isEditMode = false;
                this.editingCartItem = null;
            }
        },
        calculateTotal() {
            return this.cart.reduce((sum, item) => sum + item.totalPrice, 0)
        },
        initCartModal() {
            if (!this.isCartModalInitialized) {
                const cartModalEl = document.getElementById('cartModal')
                if (cartModalEl) {
                    this.cartModal = new bootstrap.Modal(cartModalEl)
                    
                    // Добавляем обработчики событий
                    cartModalEl.addEventListener('hidden.bs.modal', () => {
                        this.showCart = false
                    })
                    
                    cartModalEl.addEventListener('shown.bs.modal', () => {
                        this.showCart = true
                    })
                    
                    this.isCartModalInitialized = true
                }
            }
        },
        showCartModal() {
            this.initCartModal()
            if (this.cartModal) {
                this.cartModal.show()
            }
        },
        hideCartModal() {
            if (this.cartModal) {
                this.cartModal.hide()
            }
        },
        proceedToCheckout() {
            // Сохраняем текущее состояние корзины со всеми характеристиками
            const cartData = this.cart.map(item => {
                const cartItem = {
                    ...item,
                    quantity: item.quantity,
                    totalPrice: item.price * item.quantity
                };
                
                // Добавляем характеристики для пиццы
                if (item.category_name === 'Пицца') {
                    cartItem.options = {
                        size: item.options.size,
                        dough: item.options.dough,
                        removedIngredients: item.removedIngredients || [],
                        addedToppings: item.addedToppings || []
                    };
                }
                
                // Добавляем выбранные специи
                if (item.selectedCondiments && item.selectedCondiments.length) {
                    cartItem.condiments = item.selectedCondiments;
                }
                
                return cartItem;
            });
            
            // Сохраняем детальные данные корзины
            localStorage.setItem('checkoutCart', JSON.stringify(cartData));
            
            // Закрываем модальное окно корзины
            this.showCart = false;
            
            // Переходим на страницу оформления
            window.location.href = '/checkout';
        },
        // Метод для склонения слов
        pluralize(count, words) {
            const cases = [2, 0, 1, 1, 1, 2];
            return words[(count % 100 > 4 && count % 100 < 20) ? 2 : 
                        cases[(count % 10 < 5) ? count % 10 : 5]];
        },
        
        // Проверка возможности модификации товара
        canBeModified(item) {
            return item.options && (item.options.size || item.ingredients);
        },
        
        // Модификация товара
        modifyItem(item) {
            this.isEditMode = true;
            this.editingCartItem = item;
            
            // Находим продукт в соответствующей категории
            const product = Object.values(this.products)
                .flat()
                .find(p => p.id === item.product_id);
            
            if (!product) return;
            
            // Устанавливаем базовую информацию о продукте
            this.selectedProduct = product;
            
            // Закрываем корзину и показываем модальное окно продукта
            if (this.cartModal) {
                this.cartModal.hide();
                
                // Ждем завершения анимации закрытия корзины
                setTimeout(async () => {
                    // Сначала загружаем все необходимые данные
                    if (product.category_name === 'Пицца') {
                        await this.fetchPizzaData();
                    }
                    await this.fetchProductIngredients();
                    
                    // Затем устанавливаем сохраненные опции
                    if (item.options) {
                        this.selectedSize = item.options.size?.id;
                        this.selectedDough = item.options.dough?.id;
                        this.selectedToppings = item.options.toppings?.map(t => t.id) || [];
                    }
                    
                    // Устанавливаем состояние ингредиентов
                    if (item.ingredients) {
                        this.productIngredients.forEach(ing => {
                            ing.selected = item.ingredients.includes(ing.name);
                        });
                    }
                    
                    this.showProductDetails(product);
                }, 300);
            }
        },
        
        // Обновление товара в корзине
        updateCartItem() {
            if (this.editingCartItem) {
                const updatedItem = {
                    ...this.editingCartItem,
                    price: this.calculateTotalPrice,
                    totalPrice: this.calculateTotalPrice * this.editingCartItem.quantity,
                    options: {
                        size: this.selectedSize ? 
                            this.pizzaSizes.find(s => s.id === this.selectedSize) : 
                            this.editingCartItem.options.size,
                        dough: this.selectedDough ? 
                            this.pizzaDough.find(d => d.id === this.selectedDough) : 
                            this.editingCartItem.options.dough,
                        toppings: this.selectedToppings.length ? 
                            this.selectedToppings.map(id => 
                                this.pizzaToppings.find(t => t.id === id)
                            ).filter(Boolean) : 
                            this.editingCartItem.options.toppings,
                        condiments: this.selectedCondiments.length ?
                            this.selectedCondiments
                                .filter(c => c.quantity > 0)
                                .map(condiment => ({
                                    id: condiment.id,
                                    name: condiment.name,
                                    price: condiment.price,
                                    quantity: condiment.quantity
                                })) :
                            this.editingCartItem.options.condiments
                    },
                    ingredients: this.productIngredients.length ? 
                        this.productIngredients.filter(ing => ing.selected).map(ing => ing.name) :
                        this.editingCartItem.ingredients
                };

                // Обновляем элемент в корзине
                const index = this.cart.findIndex(item => item === this.editingCartItem);
                if (index !== -1) {
                    // Обновляем элемент в массиве cart
                    this.cart.splice(index, 1, updatedItem);
                    
                    // Обновляем cartMap
                    const oldKey = this.generateCartKey(this.editingCartItem);
                    const newKey = this.generateCartKey(updatedItem);
                    this.cartMap.delete(oldKey);
                    this.cartMap.set(newKey, updatedItem);
                }

                // Сбрасываем режим редактирования
                this.isEditMode = false;
                this.editingCartItem = null;
                
                // Закрываем модальное окно продукта и открываем корзину
                if (this.productModal) {
                    this.productModal.hide();
                    
                    // Ждем завершения анимации закрытия модального окна
                    setTimeout(() => {
                        this.showCart = true;
                    }, 300);
                }
            }
        },
        
        // Удаление товара из корзины
        removeFromCart(item) {
            const index = this.cart.indexOf(item);
            if (index > -1) {
                this.cart.splice(index, 1);
                const key = this.generateCartKey(item);
                this.cartMap.delete(key);
            }
        },
        checkNutritionPopupPosition() {
            this.$nextTick(() => {
                const popup = document.querySelector('.nutrition-popup');
                if (popup) {
                    // Сначала сбрасываем все позиционные классы
                    popup.classList.remove('position-top', 'position-right', 'position-left');
                    popup.style.left = '50%';
                    popup.style.transform = 'translateX(-50%)';

                    const rect = popup.getBoundingClientRect();
                    const windowHeight = window.innerHeight;
                    const windowWidth = window.innerWidth;
                    
                    // Проверяем выход за границы по вертикали и горизонтали
                    const isOverflowingBottom = rect.bottom > windowHeight;
                    const isOverflowingRight = rect.right > windowWidth;
                    const isOverflowingLeft = rect.left < 0;
                    
                    // Сначала проверяем вертикальное переполнение
                    if (isOverflowingBottom) {
                        popup.classList.add('position-top');
                    }
                    
                    // Затем корректируем горизонтальное положение
                    if (isOverflowingRight) {
                        popup.classList.add('position-right');
                        popup.style.transform = 'none';
                    } else if (isOverflowingLeft) {
                        popup.classList.add('position-left');
                        popup.style.transform = 'none';
                    }
                }
            });
        },
        closeNutrition(event) {
            // Закрываем окно при клике вне его
            if (!event.target.closest('.nutrition-popup') && 
                !event.target.closest('.btn-link')) {
                this.showNutrition = false;
            }
        },
        async fetchCondiments() {
            try {
                const response = await fetch('/api/condiments');
                const data = await response.json();
                console.log('Ответ от сервера со специями:', data); // Добавим для отладки
                this.condiments = data;
            } catch (error) {
                console.error('Ошибка при загрузке специй:', error);
            }
        },
        getCondimentQuantity(condimentId) {
            const condiment = this.selectedCondiments.find(c => c.id === condimentId)
            return condiment ? condiment.quantity : 0
        },
        increaseCondiment(condiment) {
            const existing = this.selectedCondiments.find(c => c.id === condiment.id)
            if (existing) {
                existing.quantity++
            } else {
                this.selectedCondiments.push({
                    id: condiment.id,
                    name: condiment.name,
                    price: condiment.price,
                    quantity: 1
                })
            }
        },
        decreaseCondiment(condiment) {
            const index = this.selectedCondiments.findIndex(c => c.id === condiment.id)
            if (index !== -1) {
                if (this.selectedCondiments[index].quantity > 1) {
                    this.selectedCondiments[index].quantity--
                } else {
                    this.selectedCondiments.splice(index, 1)
                }
            }
        },
        initDeliverySlider() {
            const slider = document.querySelector('.delivery-grid');
            if (!slider) return;
  
            let startX;
            let startTransform;
            let isDown = false;
            this.currentSlide = 0;
  
            // Запускаем автоматическую прокрутку
            this.startAutoScroll();
  
            // Touch события
            slider.addEventListener('touchstart', (e) => {
                isDown = true;
                this.isManualScrolling = true;
                this.pauseAutoScroll();
                startX = e.touches[0].pageX - slider.offsetLeft;
                // Получаем текущую позицию слайдера
                startTransform = -(this.currentSlide * (280 + 16));
            });
  
            slider.addEventListener('touchend', () => {
                isDown = false;
                this.isManualScrolling = false;
                const currentPosition = parseFloat(slider.style.transform.replace('translateX(', '').replace('px)', '') || 0);
                const slideWidth = 280 + 16;
                let nearestSlide = Math.round(Math.abs(currentPosition) / slideWidth);
                
                // Обработка перехода через границы
                if (nearestSlide > 4) {
                    nearestSlide = 0;
                } else if (nearestSlide < 0) {
                    nearestSlide = 4;
                }
                
                this.scrollToSlide(nearestSlide);
                this.resumeAutoScroll();
            });
  
            slider.addEventListener('touchmove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.touches[0].pageX - slider.offsetLeft;
                const walk = (x - startX);
                const newPosition = startTransform + walk;
                
                // Позволяем свободную прокрутку
                slider.style.transform = `translateX(${newPosition}px)`;
            });
  
            // Добавляем обработчики кликов по индикаторам
            document.querySelectorAll('.scroll-indicator').forEach((indicator, index) => {
                indicator.addEventListener('click', () => {
                    this.scrollToSlide(index);
                });
            });
        },
        startAutoScroll() {
            if (this.autoScrollInterval) {
                clearInterval(this.autoScrollInterval);
            }
            
            this.autoScrollInterval = setInterval(() => {
                if (!this.isManualScrolling) {
                    const nextSlide = this.currentSlide + 1;
                    this.scrollToSlide(nextSlide);
                }
            }, 3000);
        },
        pauseAutoScroll() {
            clearInterval(this.autoScrollInterval);
            this.autoScrollInterval = null;
        },
        resumeAutoScroll() {
            // Ждем окончания анимации перехода
            setTimeout(() => {
                if (!this.isManualScrolling) {
                    // Запускаем автопрокрутку с текущего слайда через 3 секунды
                    this.startAutoScroll();
                }
            }, 300);  // Время равно длительности анимации перехода
        },
        scrollToSlide(index) {
            const slider = document.querySelector('.delivery-grid');
            if (!slider) return;
  
            // Обработка бесконечной прокрутки
            if (index < 0) {
                index = 4;  // Переход к последнему слайду
            } else if (index > 4) {
                index = 0;  // Переход к первому слайду
            }
  
            this.currentSlide = index;
            const slideWidth = 280 + 16;
            const position = -(index * slideWidth);
            
            slider.style.transition = 'transform 0.3s ease-out';
            slider.style.transform = `translateX(${position}px)`;
            
            // Сбрасываем transition после анимации
            setTimeout(() => {
                slider.style.transition = '';
            }, 300);
            
            this.updateScrollIndicators();
        },
        updateScrollIndicators() {
            const indicators = document.querySelectorAll('.scroll-indicator');
            if (!indicators.length) return;
  
            indicators.forEach((indicator, index) => {
                indicator.classList.toggle('active', index === this.currentSlide);
            });
        },
        beforeDestroy() {
            // Очищаем интервал при уничтожении компонента
            if (this.autoScrollInterval) {
                clearInterval(this.autoScrollInterval);
                this.autoScrollInterval = null;
            }
        }
    }
})

// Регистрация компонента карточки продукта
app.component('product-card', {
    props: ['product'],
    methods: {
        showProductDetails() {
            this.$parent.showProductDetails(this.product)
        }
    },
    computed: {
        priceDisplay() {
            return this.product.category_name === 'Пицца' 
                ? `от ${this.product.price} ₽` 
                : `${this.product.price} ₽`
        }
    },
    template: `
        <div class="card product-card h-100" 
             @click="showProductDetails" 
             style="cursor: pointer">
            <img :src="product.image_path || '/static/images/placeholder.jpg'"
                 class="card-img-top"
                 :alt="product.name">
            <div class="card-body">
                <h5 class="card-title">{{ product.name }}</h5>
                <p class="card-text flex-grow-1">{{ product.description }}</p>
                
                <!-- Цена и кнопка добавления в корзину -->
                <div class="d-flex justify-content-between align-items-center mt-auto">
                    <div class="price">
                        <span class="fs-5 fw-bold">{{ priceDisplay }}</span>
                    </div>
                    <button class="btn btn-primary" 
                            @click.stop="showProductDetails"
                            :disabled="!product.is_available">
                        Выбрать
                    </button>
                </div>
            </div>
        </div>
    `
})

app.mount('#app') 