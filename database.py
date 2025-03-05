import sqlite3
import os
from datetime import datetime, timedelta
import json
import traceback

class Database:
    # Время на приготовление и доставку заказа (в минутах)
    PREPARATION_TIME = 40

    def __init__(self):
        self.db_name = 'ronin.db'
        self._create_db_if_not_exists()
        self.init_db()  # Добавляем вызов метода инициализации
        
    def _create_db_if_not_exists(self):
        """Создание базы данных и таблиц при первом запуске"""
        need_to_create_tables = not os.path.exists(self.db_name)
        
        self.conn = sqlite3.connect(self.db_name, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        
        if need_to_create_tables:
            self._create_tables()
    
    def _create_tables(self):
        """Создание необходимых таблиц"""
        cursor = self.conn.cursor()
        
        # Таблица категорий
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_visible BOOLEAN DEFAULT 1
            )
        ''')
        
        # Таблица добавок к пицце
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pizza_toppings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                image_path TEXT DEFAULT NULL
            )
        ''')
        
        # Таблица продуктов
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                price REAL NOT NULL,
                image_path TEXT,
                is_available BOOLEAN DEFAULT 1,
                order_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories (id)
            )
        ''')
        
        # Таблица заказов
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                address TEXT NOT NULL,
                total_amount REAL NOT NULL,
                delivery_time TEXT,
                status TEXT DEFAULT 'new',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Таблица элементов заказа
        cursor.execute('DROP TABLE IF EXISTS order_items')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                price REAL NOT NULL,
                modifications TEXT,  -- JSON строка с модификациями (размер, тесто, доп. ингредиенты)
                special_instructions TEXT,  -- Особые инструкции
                FOREIGN KEY (order_id) REFERENCES orders (id),
                FOREIGN KEY (product_id) REFERENCES products (id)
            )
        ''')
        
        # Таблица размеров пиццы
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pizza_sizes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                value INTEGER NOT NULL,
                price_modifier REAL NOT NULL
            )
        ''')

        # Таблица типов теста
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pizza_dough (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price_modifier REAL NOT NULL
            )
        ''')

        # Таблица дополнительных ингредиентов
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS ingredients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                image_path TEXT,
                is_available BOOLEAN DEFAULT 1
            )
        ''')

        # Таблица ингредиентов блюд
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS product_ingredients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                is_default BOOLEAN DEFAULT 1,
                FOREIGN KEY (product_id) REFERENCES products (id)
            )
        ''')
        
        # Добавляем базовые категории
        default_categories = [
            ('Пицца', 'pizza', 1),
            ('Закуски', 'snacks', 1),
            ('Роллы ФУТОМАКИ', 'futomaki', 1),
            ('Роллы УРАМАКИ', 'uramaki', 1),
            ('Теплые роллы', 'hot_rolls', 1),
            ('Сеты', 'sets', 1),
            ('Суши классические', 'classic_sushi', 1),
            ('Суши спайси', 'spicy_sushi', 1),
            ('Специи', 'spices', 1),
            ('Добавки', 'toppings', 0)
        ]
        
        cursor.executemany(
            'INSERT OR IGNORE INTO categories (name, slug, is_visible) VALUES (?, ?, ?)',
            default_categories
        )
        
        # Добавим базовые данные
        cursor.execute('SELECT COUNT(*) FROM pizza_sizes')
        if cursor.fetchone()[0] == 0:
            cursor.executemany('INSERT INTO pizza_sizes (name, value, price_modifier) VALUES (?, ?, ?)',
                [
                    ('Маленькая', 25, 0.8),
                    ('Средняя', 30, 1.0),
                    ('Большая', 35, 1.2),
                ])

        cursor.execute('SELECT COUNT(*) FROM pizza_dough')
        if cursor.fetchone()[0] == 0:
            cursor.executemany('INSERT INTO pizza_dough (name, price_modifier) VALUES (?, ?)',
                [
                    ('Традиционное', 1.0),
                    ('Тонкое', 1.0),
                ])

        # Удаляем существующую таблицу nutrition_facts
        cursor.execute('DROP TABLE IF EXISTS nutrition_facts')

        # Создание таблицы платежей
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                payment_method TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                is_paid BOOLEAN DEFAULT 0,
                amount REAL NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders (id)
            )
        ''')
        
        self.conn.commit()
    
    def get_products_by_category(self, category_id):
        """Получение продуктов по категории"""
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT 
                p.id,
                p.name,
                p.description,
                p.price,
                p.image_path,
                p.is_available,
                c.name as category_name
            FROM products p
            JOIN categories c ON p.category_id = c.id
            WHERE p.category_id = ? AND p.is_available = 1
        ''', (category_id,))
        
        return [dict(row) for row in cursor.fetchall()]
    
    def add_product(self, category_id, name, description, price, image_path=None):
        """Добавление нового продукта"""
        cursor = self.conn.cursor()
        cursor.execute('''
            INSERT INTO products (category_id, name, description, price, image_path, is_available)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (category_id, name, description, price, image_path, True))
        self.conn.commit()
        return cursor.lastrowid  # Возвращаем ID добавленного продукта
    
    def update_product(self, product_id, data):
        """Обновление информации о продукте"""
        cursor = self.conn.cursor()
        # Получаем текущие данные продукта
        cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
        current_product = cursor.fetchone()
        
        # Если image_path не указан, используем текущий
        if data['image_path'] is None and current_product:
            data['image_path'] = current_product['image_path']
        
        query = '''
            UPDATE products 
            SET name = ?, description = ?, price = ?, 
                image_path = ?, is_available = ?, category_id = ?
            WHERE id = ?
        '''
        cursor.execute(query, (
            data['name'],
            data['description'],
            data['price'],
            data['image_path'],
            data['is_available'],
            data['category_id'],
            product_id
        ))
        self.conn.commit()
    
    def delete_product(self, product_id):
        """Удаление продукта"""
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM products WHERE id = ?', (product_id,))
        self.conn.commit()
    
    def create_order(self, customer_name, phone, address, total_amount, delivery_time):
        """Создание нового заказа"""
        cursor = self.conn.cursor()
        try:
            print('Создание заказа:', {  # Добавляем логирование
                'customer_name': customer_name,
                'phone': phone,
                'address': address,
                'total_amount': total_amount,
                'delivery_time': delivery_time
            })
            cursor.execute('''
                INSERT INTO orders (customer_name, phone, address, total_amount, delivery_time, status)
                VALUES (?, ?, ?, ?, ?, 'new')
            ''', (customer_name, phone, address, total_amount, delivery_time))
            self.conn.commit()
            return cursor.lastrowid
        except Exception as e:
            print('Ошибка при создании заказа:', str(e))  # Логируем ошибку
            raise

    def add_order_item(self, order_id, item):
        """Добавление товара к заказу"""
        cursor = self.conn.cursor()
        try:
            print('Добавление товара к заказу:', {
                'order_id': order_id,
                'item': item
            })
            
            # Проверяем, является ли товар пиццей
            cursor.execute('''
                SELECT c.slug, p.name as product_name
                FROM products p
                JOIN categories c ON p.category_id = c.id
                WHERE p.id = ?
            ''', (item['product_id'],))
            result = cursor.fetchone()
            is_pizza = result and result['slug'] == 'pizza'
            
            # Получаем options из товара
            options = item.get('options', {})
            print('Опции товара:', options)
            
            # Получаем удаленные ингредиенты для пиццы
            removed_ingredients = []
            if is_pizza:
                # Получаем полный базовый состав из БД
                cursor.execute('''
                    SELECT DISTINCT name 
                    FROM product_ingredients 
                    WHERE product_id = ?
                    ORDER BY name
                ''', (item['product_id'],))
                base_ingredients = [row['name'] for row in cursor.fetchall()]
                
                print(f"Продукт: {result['product_name']}")
                print('Полный базовый состав из БД:', base_ingredients)
                
                # Получаем текущие ингредиенты из заказа
                current_ingredients = item.get('ingredients', [])
                print('Текущий состав заказа:', current_ingredients)
                
                # Определяем удаленные ингредиенты
                removed_ingredients = [
                    ing for ing in base_ingredients 
                    if ing not in current_ingredients
                ]
                print('Удаленные ингредиенты:', removed_ingredients)
            
            # Готовим модификации для сохранения
            modifications = {
                'size': options.get('size', {}).get('name') if is_pizza and options.get('size') else None,
                'dough': options.get('dough', {}).get('name') if is_pizza and options.get('dough') else None,
                'added_ingredients': [
                    topping['name'] for topping in options.get('toppings', [])
                ] if is_pizza else [],
                'removed_ingredients': removed_ingredients,
                'condiments': [
                    {'name': condiment['name'], 'quantity': condiment['quantity']}
                    for condiment in options.get('condiments', [])
                    if condiment.get('quantity', 0) > 0
                ]
            }
            
            print('Подготовленные модификации перед сохранением:', modifications)
            
            cursor.execute('''
                INSERT INTO order_items (
                    order_id, 
                    product_id, 
                    quantity, 
                    price,
                    modifications,
                    special_instructions
                )
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                order_id,
                item['product_id'],
                item['quantity'],
                item['price'],
                json.dumps(modifications),
                item.get('special_instructions', '')
            ))
            self.conn.commit()
            
            # Проверяем, что данные сохранились корректно
            cursor.execute('''
                SELECT * FROM order_items WHERE order_id = ? AND product_id = ?
            ''', (order_id, item['product_id']))
            saved_item = cursor.fetchone()
            print('Сохраненный товар (сырые данные):', dict(saved_item))
            print('Сохраненные модификации:', json.loads(saved_item['modifications']))
            
        except Exception as e:
            print('Ошибка при добавлении товара к заказу:', str(e))
            raise
    
    def get_categories(self):
        """Получение списка всех категорий"""
        cursor = self.conn.cursor()
        cursor.execute('SELECT * FROM categories WHERE is_visible = 1')
        return [dict(row) for row in cursor.fetchall()]
    
    def get_all_categories(self):
        """Получение всех категорий для админки"""
        cursor = self.conn.cursor()
        cursor.row_factory = sqlite3.Row
        cursor.execute('''
            SELECT * FROM categories 
            ORDER BY id
        ''')
        return [dict(row) for row in cursor.fetchall()]
    
    def get_all_products(self):
        """Получение всех продуктов с информацией о категориях"""
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT 
                p.*,
                c.name as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            ORDER BY p.id DESC
        ''')
        return [dict(row) for row in cursor.fetchall()]
    
    def init_db(self):
        """Инициализация базы данных"""
        cursor = self.conn.cursor()
        
        # Создаем таблицы если их нет
        self._create_tables()
        
        # Проверяем и добавляем новые столбцы в таблицу orders
        def column_exists(table, column):
            cursor.execute(f"PRAGMA table_info({table})")
            columns = cursor.fetchall()
            return any(col[1] == column for col in columns)
        
        # Добавляем delivery_time, если его нет
        if not column_exists('orders', 'delivery_time'):
            cursor.execute('ALTER TABLE orders ADD COLUMN delivery_time TEXT')
        
        # Добавляем status, если его нет
        if not column_exists('orders', 'status'):
            cursor.execute('ALTER TABLE orders ADD COLUMN status TEXT DEFAULT "new"')
        
        # Проверяем и добавляем новые столбцы в таблицу order_items
        if not column_exists('order_items', 'modifications'):
            cursor.execute('ALTER TABLE order_items ADD COLUMN modifications TEXT')
        
        if not column_exists('order_items', 'special_instructions'):
            cursor.execute('ALTER TABLE order_items ADD COLUMN special_instructions TEXT')
        
        self.conn.commit()
        
        # Удаляем старые категории
        cursor.execute('DELETE FROM categories WHERE slug IN ("combo", "drinks")')
        
        # Удаляем продукты из удаленных категорий
        cursor.execute('''
            DELETE FROM products 
            WHERE category_id IN (
                SELECT id FROM categories 
                WHERE slug IN ("combo", "drinks")
            )
        ''')
        
        # Обновляем размеры пиццы
        cursor.execute('DELETE FROM pizza_sizes')
        cursor.executemany(
            'INSERT INTO pizza_sizes (name, value, price_modifier) VALUES (?, ?, ?)',
            [
                ('Маленькая', 25, 0.8),
                ('Средняя', 30, 1.0),
                ('Большая', 35, 1.2),
            ]
        )
        
        # Обновляем типы теста
        cursor.execute('DELETE FROM pizza_dough')
        cursor.executemany(
            'INSERT INTO pizza_dough (name, price_modifier) VALUES (?, ?)',
            [
                ('Традиционное', 1.0),
                ('Тонкое', 1.0),
            ]
        )
        
        # Добавляем тестовые ингредиенты
        cursor.execute('DELETE FROM ingredients')
        cursor.executemany(
            'INSERT INTO ingredients (name, price, is_available) VALUES (?, ?, ?)',
            [
                ('Сыр', 59, 1),
                ('Пепперони', 79, 1),
                ('Грибы', 49, 1),
                ('Ветчина', 79, 1),
            ]
        )
        
        # Создаем таблицу тайм-слотов
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS delivery_slots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                time_start TEXT NOT NULL,
                time_end TEXT NOT NULL,
                max_orders INTEGER NOT NULL,
                current_orders INTEGER DEFAULT 0,
                is_available BOOLEAN DEFAULT 1
            )
        ''')
        
        self.conn.commit()

    def get_pizza_sizes(self):
        """Получение доступных размеров пиццы"""
        cursor = self.conn.cursor()
        cursor.execute('SELECT * FROM pizza_sizes')
        return [dict(row) for row in cursor.fetchall()]

    def get_pizza_dough(self):
        """Получение типов теста"""
        cursor = self.conn.cursor()
        cursor.execute('SELECT * FROM pizza_dough')
        return [dict(row) for row in cursor.fetchall()]

    def get_ingredients(self):
        """Получение дополнительных ингредиентов"""
        cursor = self.conn.cursor()
        cursor.execute('SELECT * FROM ingredients WHERE is_available = 1')
        return [dict(row) for row in cursor.fetchall()]

    def add_product_ingredients(self, product_id, ingredients):
        """Добавление ингредиентов к продукту"""
        cursor = self.conn.cursor()
        cursor.executemany(
            'INSERT INTO product_ingredients (product_id, name, is_default) VALUES (?, ?, ?)',
            [(product_id, ing['name'], ing.get('is_default', True)) for ing in ingredients]
        )
        self.conn.commit()

    def get_product_ingredients(self, product_id):
        """Получение ингредиентов продукта"""
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT id, name, is_default
            FROM product_ingredients 
            WHERE product_id = ?
            ORDER BY is_default DESC, name
        ''', (product_id,))
        return [dict(row) for row in cursor.fetchall()]

    def update_product_ingredients(self, product_id, ingredients):
        """Обновление ингредиентов продукта"""
        cursor = self.conn.cursor()
        # Удаляем старые ингредиенты
        cursor.execute('DELETE FROM product_ingredients WHERE product_id = ?', (product_id,))
        # Добавляем новые
        self.add_product_ingredients(product_id, ingredients)
    
    def get_pizza_toppings(self):
        """Получение списка всех добавок к пицце"""
        cursor = self.conn.cursor()
        cursor.row_factory = sqlite3.Row  # Позволяет обращаться к колонкам по имени
        cursor.execute('SELECT * FROM pizza_toppings')
        rows = cursor.fetchall()
        return [dict(row) for row in rows]  # Преобразуем каждую строку в словарь

    def add_pizza_topping(self, data):
        """Добавление новой добавки к пицце"""
        cursor = self.conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO pizza_toppings (name, price, image_path)
                VALUES (?, ?, ?)
            ''', (
                data['name'],
                data['price'],
                data.get('image_path')
            ))
            self.conn.commit()
            return cursor.lastrowid
        except Exception as e:
            print('Ошибка в БД при добавлении добавки:', str(e))
            raise
    
    def update_pizza_topping(self, topping_id, data):
        """Обновление информации о добавке"""
        cursor = self.conn.cursor()
        cursor.execute('''
            UPDATE pizza_toppings 
            SET name = ?, price = ?, image_path = ?
            WHERE id = ?
        ''', (
            data['name'],
            data['price'],
            data.get('image_path'),
            topping_id
        ))
        self.conn.commit()
    
    def delete_pizza_topping(self, topping_id):
        """Удаление добавки"""
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM pizza_toppings WHERE id = ?', (topping_id,))
        self.conn.commit()
    
    def clear_pizza_toppings(self):
        """Очистка таблицы добавок к пицце"""
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM pizza_toppings')
        self.conn.commit()
    
    def __del__(self):
        """Закрытие соединения при удалении объекта"""
        if hasattr(self, 'conn'):
            self.conn.close()

    def get_products_by_category_slug(self, slug):
        """Получение продуктов по slug категории"""
        cursor = self.conn.cursor()
        cursor.row_factory = sqlite3.Row  # Добавим это для получения словарей
        cursor.execute('''
            SELECT p.* 
            FROM products p
            JOIN categories c ON p.category_id = c.id
            WHERE c.slug = ?
        ''', (slug,))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]  # Преобразуем результаты в список словарей

    def get_popular_products(self, limit=4):
        """Получение популярных продуктов"""
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT 
                p.*,
                c.id as category_id,
                c.name as category_name,
                c.slug as category_slug
            FROM products p
            JOIN categories c ON p.category_id = c.id
            WHERE p.is_available = 1
            ORDER BY order_count DESC
            LIMIT ?
        ''', (limit,))
        return [dict(row) for row in cursor.fetchall()]

    def increment_product_order_count(self, product_id):
        """Увеличение счетчика заказов продукта"""
        cursor = self.conn.cursor()
        cursor.execute('''
            UPDATE products 
            SET order_count = order_count + 1
            WHERE id = ?
        ''', (product_id,))
        self.conn.commit()

    def get_available_delivery_slots(self):
        """Получение доступных слотов доставки"""
        cursor = self.conn.cursor()
        now = datetime.now()
        # Добавляем время на приготовление к текущему времени
        min_delivery_time = now + timedelta(minutes=self.PREPARATION_TIME)
        
        cursor.execute('''
            SELECT 
                id,
                CASE 
                    WHEN time(time_start) < time(?, 'localtime') 
                    AND time(time_end) > time(?, 'localtime')
                    THEN ?
                    ELSE time_start
                END as time_start,
                time_end,
                max_orders,
                current_orders,
                (max_orders - current_orders) as slots_left
            FROM delivery_slots
            WHERE is_available = 1 
            AND current_orders < max_orders
            -- Проверяем, что конец слота хотя бы на 15 минут позже минимального времени доставки
            AND datetime(time_end) > datetime(?, '+15 minutes')
            -- Проверяем, что начало слота не раньше минимального времени доставки
            AND (
                (datetime(time_start) >= datetime(?))
                OR 
                (datetime(time_end) > datetime(?))
            )
            ORDER BY datetime(time_start)
        ''', (
            min_delivery_time.strftime('%H:%M'),
            min_delivery_time.strftime('%H:%M'),
            min_delivery_time.strftime('%Y-%m-%d %H:%M:00'),
            min_delivery_time.strftime('%Y-%m-%d %H:%M:00'),
            min_delivery_time.strftime('%Y-%m-%d %H:%M:00'),
            min_delivery_time.strftime('%Y-%m-%d %H:%M:00')
        ))
        return [dict(row) for row in cursor.fetchall()]

    def increment_slot_orders(self, time_start):
        """Увеличение счетчика заказов для временного слота"""
        cursor = self.conn.cursor()
        # Проверяем, является ли time_start диапазоном времени (например, "11:30 - 12:30")
        if ' - ' in time_start:
            # Если это диапазон, берем только время начала
            time_start = time_start.split(' - ')[0]
            # Добавляем текущую дату к времени
            current_date = datetime.now().strftime('%Y-%m-%d')
            time_start = f"{current_date} {time_start}:00"
        
        cursor.execute('''
            UPDATE delivery_slots 
            SET current_orders = current_orders + 1
            WHERE time_start = ?
        ''', (time_start,))
        self.conn.commit()

    def get_all_delivery_slots(self):
        """Получение всех слотов доставки для админки"""
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT * FROM delivery_slots
            ORDER BY time_start
        ''')
        return [dict(row) for row in cursor.fetchall()]

    def add_delivery_slot(self, time_start, time_end, max_orders):
        """Добавление нового слота доставки"""
        cursor = self.conn.cursor()
        # Преобразуем время в нужный формат, если оно пришло в формате HH:MM
        if len(time_start) == 5:
            current_date = datetime.now().strftime('%Y-%m-%d')
            time_start = f"{current_date} {time_start}:00"
        if len(time_end) == 5:
            current_date = datetime.now().strftime('%Y-%m-%d')
            time_end = f"{current_date} {time_end}:00"
        
        cursor.execute('''
            INSERT INTO delivery_slots (time_start, time_end, max_orders, current_orders, is_available)
            VALUES (?, ?, ?, 0, 1)
        ''', (time_start, time_end, max_orders))
        self.conn.commit()

    def update_delivery_slot(self, slot_id, data):
        """Обновление слота доставки"""
        cursor = self.conn.cursor()
        # Преобразуем время в нужный формат
        time_start = data['time_start']
        time_end = data['time_end']
        if len(time_start) == 5:
            time_start = f"{datetime.now().strftime('%Y-%m-%d')} {time_start}:00"
        if len(time_end) == 5:
            time_end = f"{datetime.now().strftime('%Y-%m-%d')} {time_end}:00"
        
        cursor.execute('''
            UPDATE delivery_slots
            SET time_start = ?, time_end = ?, max_orders = ?, is_available = ?
            WHERE id = ?
        ''', (time_start, time_end, data['max_orders'], data['is_available'], slot_id))
        self.conn.commit()

    def delete_delivery_slot(self, slot_id):
        """Удаление слота доставки"""
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM delivery_slots WHERE id = ?', (slot_id,))
        self.conn.commit()

    def get_active_orders_count(self):
        """Получение количества активных заказов"""
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT COUNT(*) as count
            FROM orders
            WHERE status = 'new'
            AND created_at >= datetime('now', '-2 hours')
        ''')
        result = cursor.fetchone()
        return result['count'] if result else 0

    def find_nearest_available_slot(self):
        """Поиск ближайшего доступного слота с учетом времени приготовления"""
        cursor = self.conn.cursor()
        now = datetime.now()
        # Получаем количество активных заказов
        active_orders = self.get_active_orders_count()
        # Добавляем дополнительное время за каждые 3 активных заказа
        additional_time = (active_orders // 3) * 10
        min_delivery_time = now + timedelta(minutes=self.PREPARATION_TIME + additional_time)
        
        cursor.execute('''
            SELECT 
                id,
                time_start,
                time_end,
                max_orders,
                current_orders,
                (max_orders - current_orders) as slots_left
            FROM delivery_slots
            WHERE is_available = 1 
            AND current_orders < max_orders
            AND datetime(time_end) > datetime(?, '+15 minutes')
            AND (
                (datetime(time_start) >= datetime(?))
                OR 
                (datetime(time_end) > datetime(?))
            )
            ORDER BY datetime(time_start)
            LIMIT 1
        ''', (
            min_delivery_time.strftime('%Y-%m-%d %H:%M:00'),
            min_delivery_time.strftime('%Y-%m-%d %H:%M:00'),
            min_delivery_time.strftime('%Y-%m-%d %H:%M:00')
        ))
        
        slot = cursor.fetchone()
        if slot:
            return dict(slot)
        return None

    def get_order_details(self, order_id):
        """Получение деталей заказа"""
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT 
                o.*,
                COALESCE(p.status, 'pending') as payment_status,
                COALESCE(p.is_paid, 0) as is_paid
            FROM orders o
            LEFT JOIN payments p ON o.id = p.order_id
            WHERE o.id = ?
        ''', (order_id,))
        order = cursor.fetchone()
        if not order:
            raise Exception('Заказ не найден')
        return dict(order)

    def create_payment(self, order_id, payment_method, amount):
        """Создание записи о платеже"""
        cursor = self.conn.cursor()
        cursor.execute('''
            INSERT INTO payments (order_id, payment_method, amount)
            VALUES (?, ?, ?)
        ''', (order_id, payment_method, amount))
        self.conn.commit()

    def get_delivery_slot_by_start_time(self, time_start):
        """Получение слота доставки по времени начала"""
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT * FROM delivery_slots
            WHERE time_start = ?
        ''', (time_start,))
        result = cursor.fetchone()
        return dict(result) if result else None

    def get_orders_with_details(self, limit=None, offset=None, status=None):
        """Получение заказов с детальной информацией"""
        cursor = self.conn.cursor()
        try:
            # Базовый запрос для получения заказов
            query = '''
                SELECT o.*, 
                       COUNT(DISTINCT oi.id) as items_count
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
            '''
            params = []
            
            # Добавляем фильтр по статусу если указан
            if status and status != 'all':
                query += ' WHERE o.status = ?'
                params.append(status)
                
            query += ' GROUP BY o.id ORDER BY o.created_at DESC'
            
            # Добавляем пагинацию
            if limit is not None:
                query += ' LIMIT ?'
                params.append(limit)
            if offset is not None:
                query += ' OFFSET ?'
                params.append(offset)
                
            cursor.execute(query, params)
            orders = []
            for order in cursor.fetchall():
                order_dict = dict(order)
                
                # Получаем товары заказа
                cursor.execute('''
                    SELECT oi.*, 
                           p.name as product_name,
                           c.name as category_name,
                           c.slug as category_slug
                    FROM order_items oi
                    JOIN products p ON oi.product_id = p.id
                    JOIN categories c ON p.category_id = c.id
                    WHERE oi.order_id = ?
                ''', (order['id'],))
                
                items = []
                for item in cursor.fetchall():
                    item_dict = dict(item)
                    # Преобразуем JSON-строку модификаций в словарь
                    if item_dict['modifications']:
                        try:
                            item_dict['modifications'] = json.loads(item_dict['modifications'])
                            # Преобразуем строковые значения в объекты для размера и теста
                            if item_dict['modifications'].get('size'):
                                size_value = item_dict['modifications']['size']
                                # Проверяем, содержит ли строка размера "см"
                                if "см" in size_value.lower():
                                    # Если есть "см", извлекаем числовое значение
                                    value = ''.join(filter(str.isdigit, size_value))
                                    item_dict['modifications']['size'] = {
                                        'name': f"{value} см",
                                        'value': value
                                    }
                                else:
                                    # Если нет "см", используем текстовое описание
                                    item_dict['modifications']['size'] = {
                                        'name': size_value,
                                        'value': None
                                    }
                            if item_dict['modifications'].get('dough'):
                                dough_value = item_dict['modifications']['dough']
                                item_dict['modifications']['dough'] = {
                                    'name': dough_value
                                }
                        except json.JSONDecodeError:
                            print(f"Ошибка декодирования JSON для товара {item_dict['id']}")
                            item_dict['modifications'] = {}
                    else:
                        item_dict['modifications'] = {}
                    items.append(item_dict)
                
                order_dict['items'] = items
                orders.append(order_dict)
                
            print('Результат запроса:', orders)
            return orders
            
        except Exception as e:
            print('Ошибка при выполнении запроса:', str(e))
            raise

    def update_order_status(self, order_id, status):
        """Обновление статуса заказа"""
        cursor = self.conn.cursor()
        try:
            cursor.execute('''
                UPDATE orders 
                SET status = ?
                WHERE id = ?
            ''', (status, order_id))
            self.conn.commit()
            return True
        except Exception as e:
            print('Ошибка при обновлении статуса заказа:', str(e))
            raise

    def delete_order(self, order_id):
        """Отмена заказа"""
        cursor = self.conn.cursor()
        try:
            # Сначала удаляем связанные записи в order_items
            cursor.execute('''
                DELETE FROM order_items 
                WHERE id = ?
            ''', (order_id,))
            
            # Затем удаляем сам заказ
            cursor.execute('''
                DELETE FROM orders 
                WHERE id = ?
            ''', (order_id,))
            
            self.conn.commit()
            return True
            
        except Exception as e:
            print('Ошибка при удалении заказа:', str(e))
            raise

    def get_orders_stats(self):
        """Получение статистики по заказам"""
        cursor = self.conn.cursor()
        try:
            # Получаем количество заказов по каждому статусу
            cursor.execute('''
                SELECT 
                    status,
                    COUNT(*) as count
                FROM orders
                GROUP BY status
            ''')
            
            # Формируем словарь со статистикой
            stats = {
                'all': 0,
                'new': 0,
                'processing': 0,
                'delivering': 0,
                'completed': 0,
                'cancelled': 0
            }
            
            rows = cursor.fetchall()
            for row in rows:
                status = row['status']
                count = row['count']
                stats[status] = count
                stats['all'] += count
                
            return stats
            
        except Exception as e:
            print('Ошибка при получении статистики заказов:', str(e))
            raise

    def get_statistics(self, period='day'):
        """Получение статистики за указанный период"""
        try:
            print(f"\n=== Начало получения статистики (период: {period}) ===")
            # Определяем начальную дату для периода
            now = datetime.now()
            if period == 'day':
                start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            elif period == 'week':
                start_date = now - timedelta(days=7)
            elif period == 'month':
                start_date = now - timedelta(days=30)
            else:  # year
                start_date = now - timedelta(days=365)
            
            print(f"Начальная дата периода: {start_date}")
            
            cursor = self.conn.cursor()
            
            # Базовая статистика
            print("\n--- Получение базовой статистики ---")
            cursor.execute('''
                SELECT 
                    SUM(total_amount) as revenue,
                    COUNT(*) as orders_count,
                    AVG(total_amount) as average_order,
                    ROUND(CAST(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS FLOAT) / 
                          COUNT(*) * 100, 1) as cancellation_rate
                FROM orders
                WHERE created_at >= ?
            ''', (start_date,))
            
            basic_stats = dict(cursor.fetchone())
            print(f"Базовая статистика: {basic_stats}")
            
            # Статистика по категориям
            print("\n--- Получение статистики по категориям ---")
            # Проверка наличия данных в таблицах
            cursor.execute('''
                SELECT COUNT(*) as cnt FROM order_items
            ''')
            print(f"Всего записей в order_items: {cursor.fetchone()['cnt']}")

            cursor.execute('''
                SELECT COUNT(*) as cnt FROM products
            ''')
            print(f"Всего записей в products: {cursor.fetchone()['cnt']}")

            cursor.execute('''
                SELECT COUNT(*) as cnt FROM categories
            ''')
            print(f"Всего записей в categories: {cursor.fetchone()['cnt']}")

            # Проверка связей между таблицами
            cursor.execute('''
                SELECT o.id, o.total_amount, oi.product_id, p.name, c.name as category
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                LEFT JOIN products p ON oi.product_id = p.id
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE o.status != 'cancelled'
                LIMIT 1
            ''')
            sample = cursor.fetchone()
            print(f"Пример связей в БД: {dict(sample) if sample else 'Нет данных'}")

            cursor.execute('''
                SELECT 
                    c.name,
                    COUNT(DISTINCT o.id) as count,
                    SUM(oi.price * oi.quantity) as amount
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                LEFT JOIN products p ON oi.product_id = p.id
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE o.status != 'cancelled'
                AND oi.id IS NOT NULL
                GROUP BY c.name
                ORDER BY amount DESC
            ''')
            
            categories = [dict(row) for row in cursor.fetchall()]
            print(f"Найдено категорий: {len(categories)}")
            print("Данные по категориям:", categories)
            
            # Топ продуктов
            print("\n--- Получение топ продуктов ---")
            cursor.execute('''
                SELECT 
                    p.name,
                    COUNT(DISTINCT o.id) as count,
                    SUM(oi.price * oi.quantity) as amount
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE o.status != 'cancelled'
                AND oi.id IS NOT NULL
                GROUP BY p.name
                ORDER BY amount DESC
                LIMIT 10
            ''')
            
            top_products = [dict(row) for row in cursor.fetchall()]
            print(f"Найдено топ продуктов: {len(top_products)}")
            print("Топ продукты:", top_products)

            # Получаем данные для графика продаж
            if period == 'day':
                # Группировка по часам для текущего дня
                cursor.execute('''
                    SELECT 
                        strftime('%H:00', created_at) as time_period,
                        COUNT(*) as orders_count,
                        SUM(total_amount) as revenue
                    FROM orders
                    WHERE created_at >= ?
                    GROUP BY strftime('%H', created_at)
                    ORDER BY time_period
                ''', (start_date,))
            elif period == 'week':
                # Группировка по дням для недели
                cursor.execute('''
                    SELECT 
                        date(created_at) as time_period,
                        COUNT(*) as orders_count,
                        SUM(total_amount) as revenue
                    FROM orders
                    WHERE created_at >= ?
                    GROUP BY date(created_at)
                    ORDER BY time_period
                ''', (start_date,))
            else:
                # Группировка по дням для месяца/года
                cursor.execute('''
                    SELECT 
                        date(created_at) as time_period,
                        COUNT(*) as orders_count,
                        SUM(total_amount) as revenue
                    FROM orders
                    WHERE created_at >= ?
                    GROUP BY date(created_at)
                    ORDER BY time_period
                ''', (start_date,))
            
            time_stats = [dict(row) for row in cursor.fetchall()]

            print("\n=== Завершение получения статистики ===\n")
            
            return {
                'revenue': basic_stats['revenue'] or 0,
                'orders_count': basic_stats['orders_count'] or 0,
                'average_order': round(basic_stats['average_order'] or 0, 2),
                'cancellation_rate': round(basic_stats['cancellation_rate'] or 0, 1),
                'categories': categories,
                'top_products': top_products,
                'time_stats': time_stats
            }
            
        except Exception as e:
            print(f"\n!!! Ошибка при получении статистики: {str(e)}")
            print("Traceback:", traceback.format_exc())
            raise 

    # Проверка таблиц с заказами
    def check_orders_tables(self):
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT name FROM sqlite_master 
            WHERE type='table' AND (
                name='orders' OR 
                name='order_items' OR 
                name='order_item_toppings'
            )
        ''')
        tables = cursor.fetchall()
        print("\nСуществующие таблицы заказов:", [t['name'] for t in tables])

        # Проверка данных в orders
        cursor.execute('''
            SELECT o.*, 
                   COUNT(DISTINCT oi.id) as items_count,
                   COUNT(DISTINCT oit.id) as toppings_count
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN order_item_toppings oit ON oi.id = oit.order_item_id
            GROUP BY o.id
            LIMIT 5
        ''')
        orders = cursor.fetchall()
        print("\nПоследние 5 заказов:")
        for order in orders:
            print(f"""
            Заказ #{order['id']}:
            - Сумма: {order['total_amount']}
            - Статус: {order['status']}
            - Количество товаров: {order['items_count']}
            - Количество добавок: {order['toppings_count']}
            """) 