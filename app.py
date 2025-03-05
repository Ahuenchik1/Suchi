from flask import Flask, render_template, jsonify, request, redirect, url_for, session, flash
from database import Database
from functools import wraps
import os
import json
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta
import serverless_wsgi

app = Flask(__name__)
db = Database()

# Добавим конфигурацию
app.config['SECRET_KEY'] = os.urandom(24)
ADMIN_USERNAME = "admin"  
ADMIN_PASSWORD = "admin123"  

# После создания приложения добавим:
app.config['UPLOAD_FOLDER'] = os.path.join('static', 'uploads')
# Создаем папку для загрузок, если её нет
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def handler(event, context):
    return serverless_wsgi.handle_request(app, event, context)

# Декоратор для защиты админ-роутов
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_logged_in' not in session:
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/products/<int:category_id>')
def get_products(category_id):
    products = db.get_products_by_category(category_id)
    return jsonify(products)

@app.route('/api/categories')
def get_categories():
    categories = [cat for cat in db.get_categories() if cat['slug'] != 'spices']
    return jsonify(categories)

@app.route('/api/products')
@admin_required
def get_all_products():
    products = db.get_all_products()
    return jsonify(products)

@app.route('/api/products/popular')
def get_popular_products():
    products = db.get_popular_products(limit=4)
    return jsonify(products)

# Роуты для админки
@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        if (request.form.get('username') == ADMIN_USERNAME and 
            request.form.get('password') == ADMIN_PASSWORD):
            session['admin_logged_in'] = True
            return redirect(url_for('admin_dashboard'))
        flash('Неверные учетные данные', 'error')
    return render_template('admin/login.html')

@app.route('/admin/logout')
def admin_logout():
    session.pop('admin_logged_in', None)
    return redirect(url_for('admin_login'))

@app.route('/admin')
@admin_required
def admin_dashboard():
    return render_template('admin/dashboard.html')

@app.route('/admin/products')
@admin_required
def admin_products():
    categories = db.get_all_categories()  # Получаем все категории для админки
    products = db.get_all_products()
    return render_template('admin/products.html', categories=categories, products=products)

@app.route('/api/products/add', methods=['POST'])
@admin_required
def api_add_product():
    try:
        data = request.form
        image = request.files.get('image')
        
        if image:
            filename = secure_filename(f"{os.urandom(8).hex()}_{image.filename}")
            image.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            image_path = f"/static/uploads/{filename}"
        else:
            image_path = None
            
        product_id = db.add_product(
            category_id=int(data['category_id']),
            name=data['name'],
            description=data['description'],
            price=float(data['price']),
            image_path=image_path
        )
        
        ingredients_json = data.get('ingredients')
        if ingredients_json:
            ingredients = json.loads(ingredients_json)
            db.add_product_ingredients(product_id, ingredients)
        
        return jsonify({'message': 'Продукт успешно добавлен'}), 200
    except Exception as e:
        print('Ошибка при добавлении продукта:', str(e))
        return jsonify({'error': str(e)}), 400

@app.route('/api/products/<int:product_id>/edit', methods=['POST'])
@admin_required
def api_edit_product(product_id):
    try:
        data = request.form
        image = request.files.get('image')
        
        update_data = {
            'name': data['name'],
            'description': data['description'],
            'price': float(data['price']),
            'category_id': int(data['category_id']),
            'is_available': data.get('is_available', '1') == '1',
            'image_path': None  # Добавляем значение по умолчанию
        }
        
        if image:
            filename = secure_filename(f"{os.urandom(8).hex()}_{image.filename}")
            image.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            update_data['image_path'] = f"/static/uploads/{filename}"
        else:
            # Если новое изображение не загружено, сохраняем текущий путь
            cursor = db.conn.cursor()
            cursor.execute('SELECT image_path FROM products WHERE id = ?', (product_id,))
            current_image = cursor.fetchone()
            if current_image:
                update_data['image_path'] = current_image['image_path']
        
        db.update_product(product_id, update_data)
        
        # Обновляем ингредиенты
        ingredients_json = data.get('ingredients')
        if ingredients_json:
            ingredients = json.loads(ingredients_json)
            db.update_product_ingredients(product_id, ingredients)
        
        return jsonify({'message': 'Продукт успешно обновлен'}), 200
    except Exception as e:
        print('Ошибка при обновлении продукта:', str(e))  # Добавляем для отладки
        return jsonify({'error': str(e)}), 400

@app.route('/api/products/<int:product_id>/delete', methods=['POST'])
@admin_required
def api_delete_product(product_id):
    try:
        db.delete_product(product_id)
        return jsonify({'message': 'Продукт успешно удален'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/pizza/sizes')
def get_pizza_sizes():
    try:
        sizes = db.get_pizza_sizes()
        print("Размеры пиццы:", sizes)  # Отладочная информация
        return jsonify(sizes)
    except Exception as e:
        print("Ошибка при получении размеров:", str(e))  # Отладочная информация
        return jsonify({'error': str(e)}), 500

@app.route('/api/pizza/dough')
def get_pizza_dough():
    try:
        dough = db.get_pizza_dough()
        print("Типы теста:", dough)  # Отладочная информация
        return jsonify(dough)
    except Exception as e:
        print("Ошибка при получении типов теста:", str(e))  # Отладочная информация
        return jsonify({'error': str(e)}), 500

@app.route('/api/ingredients')
def get_ingredients():
    try:
        ingredients = db.get_ingredients()
        return jsonify(ingredients)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/products/<int:product_id>/ingredients')
def get_product_ingredients(product_id):
    try:
        ingredients = db.get_product_ingredients(product_id)
        return jsonify(ingredients)
    except Exception as e:
        print('Ошибка при получении ингредиентов:', str(e))  # Добавляем для отладки
        return jsonify({'error': str(e)}), 500

@app.route('/api/products/<int:product_id>/ingredients', methods=['POST'])
@admin_required
def update_product_ingredients(product_id):
    try:
        ingredients = request.json
        db.update_product_ingredients(product_id, ingredients)
        return jsonify({'message': 'Ингредиенты обновлены'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Добавляем новые маршруты для управления добавками к пицце
@app.route('/api/pizza/toppings')
def get_pizza_toppings():
    try:
        toppings = db.get_pizza_toppings()
        return jsonify(toppings)
    except Exception as e:
        print("Ошибка при получении добавок:", str(e))  # Для отладки
        return jsonify({'error': str(e)}), 500

@app.route('/api/pizza/toppings/add', methods=['POST'])
@admin_required
def add_pizza_topping():
    try:
        data = request.form.to_dict()
        image = request.files.get('image')
        if image:
            filename = secure_filename(f"{os.urandom(8).hex()}_{image.filename}")
            image.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            data['image_path'] = f"/static/uploads/{filename}"
        else:
            data['image_path'] = None
        
        # Убедимся, что цена передается как число
        data['price'] = float(data['price'])
        
        db.add_pizza_topping(data)
        return jsonify({'message': 'Добавка успешно добавлена'}), 200
    except Exception as e:
        print('Ошибка при добавлении добавки:', str(e))
        return jsonify({'error': str(e)}), 400

@app.route('/api/pizza/toppings/<int:topping_id>/edit', methods=['POST'])
@admin_required
def api_edit_topping(topping_id):
    try:
        data = request.form
        image = request.files.get('image')
        
        update_data = {
            'name': data['name'],
            'price': float(data['price']),
            'is_available': data.get('is_available', '1') == '1'
        }
        
        if image:
            filename = secure_filename(f"{os.urandom(8).hex()}_{image.filename}")
            image.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            update_data['image_path'] = f"/static/uploads/{filename}"
        
        db.update_pizza_topping(topping_id, update_data)
        return jsonify({'message': 'Добавка успешно обновлена'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/pizza/toppings/<int:topping_id>/delete', methods=['POST'])
@admin_required
def api_delete_topping(topping_id):
    try:
        db.delete_pizza_topping(topping_id)
        return jsonify({'message': 'Добавка успешно удалена'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/admin/categories')
@admin_required
def api_admin_categories():
    categories = db.get_all_categories()
    return jsonify(categories)

@app.route('/api/admin/clear-toppings', methods=['POST'])
@admin_required
def clear_toppings():
    try:
        db.clear_pizza_toppings()
        return jsonify({'message': 'Добавки к пицце успешно удалены'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/condiments')
def get_condiments():
    try:
        # Получаем продукты из категории "Специи"
        condiments = db.get_products_by_category_slug('spices')
        return jsonify(condiments)
    except Exception as e:
        print("Ошибка при получении специй:", str(e))  # Для отладки
        return jsonify({'error': str(e)}), 500

@app.route('/api/orders/create', methods=['POST'])
def create_order():
    try:
        order_data = request.json
        order_id = db.create_order(
            customer_name=order_data['customer_name'],
            phone=order_data['phone'],
            address=order_data['address'],
            total_amount=order_data['total_amount']
        )
        
        # Сохраняем товары заказа и обновляем их счетчики
        for item in order_data['items']:
            db.add_order_item(order_id, item)
            db.increment_product_order_count(item['product_id'])
        
        return jsonify({'message': 'Заказ успешно создан', 'order_id': order_id}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/checkout', methods=['GET'])
def checkout():
    return render_template('checkout.html')

@app.route('/api/delivery-slots')
def get_delivery_slots():
    try:
        slots = db.get_available_delivery_slots()
        print('Доступные слоты:', slots)  # Для отладки
        return jsonify(slots)
    except Exception as e:
        print('Ошибка при получении слотов:', str(e))  # Для отладки
        return jsonify({'error': str(e)}), 500

@app.route('/api/checkout', methods=['POST'])
def process_checkout():
    try:
        data = request.json
        print('Данные заказа:', data)
        print('Товары в заказе:', data['items'])
        
        # Обработка времени доставки
        if data['deliverySlot'] == 'asap':
            # Ищем ближайший доступный слот
            nearest_slot = db.find_nearest_available_slot()
            print('Ближайший слот:', nearest_slot)  # Логируем слот
            # Получаем количество активных заказов
            active_orders = db.get_active_orders_count()
            # Добавляем 10 минут к базовому времени за каждые 3 активных заказа
            additional_time = (active_orders // 3) * 10
            total_wait_time = db.PREPARATION_TIME + additional_time
            
            if nearest_slot:
                # Если нашли слот, используем его
                start_time = datetime.strptime(nearest_slot['time_start'], '%Y-%m-%d %H:%M:%S').strftime('%H:%M')
                end_time = datetime.strptime(nearest_slot['time_end'], '%Y-%m-%d %H:%M:%S').strftime('%H:%M')
                delivery_time = f"{start_time} - {end_time}"
                slot_for_increment = delivery_time
            else:
                # Если слот не найден, устанавливаем примерное время
                estimated_time = datetime.now() + timedelta(minutes=total_wait_time)
                delivery_time = f"Ближайшее время (ориентировочно к {estimated_time.strftime('%H:%M')})"
                slot_for_increment = None
        else:
            # Если выбран конкретный слот
            start_time = datetime.strptime(data['deliverySlot'], '%Y-%m-%d %H:%M:%S').strftime('%H:%M')
            # Получаем время окончания из слота
            slot = db.get_delivery_slot_by_start_time(data['deliverySlot'])
            if slot:
                end_time = datetime.strptime(slot['time_end'], '%Y-%m-%d %H:%M:%S').strftime('%H:%M')
                delivery_time = f"{start_time} - {end_time}"
                slot_for_increment = data['deliverySlot']
            else:
                delivery_time = start_time
                slot_for_increment = data['deliverySlot']
        
        order_id = db.create_order(
            customer_name=data['name'],
            phone=data['phone'],
            address=data['address'],
            total_amount=data['total'],
            delivery_time=delivery_time
        )
        
        # Сохраняем товары заказа
        for item in data['items']:
            print('Обработка товара:', item)
            db.add_order_item(order_id, item)
            db.increment_product_order_count(item['product_id'])
        
        # Увеличиваем счетчик заказов для выбранного слота
        if slot_for_increment:
            db.increment_slot_orders(slot_for_increment)
        
        # Создаем запись о платеже
        db.create_payment(
            order_id=order_id,
            payment_method=data['paymentMethod'],
            amount=data['total']
        )
        
        return jsonify({
            'status': 'success',
            'order_id': order_id
        })
    except Exception as e:
        print('Ошибка при оформлении заказа:', str(e))
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 400

@app.route('/admin/delivery-slots')
@admin_required
def admin_delivery_slots():
    return render_template('admin/delivery-slots.html')

@app.route('/admin/orders')
@admin_required
def admin_orders():
    return render_template('admin/orders.html')

@app.route('/admin/statistics')
@admin_required
def admin_statistics():
    return render_template('admin/statistics.html')

@app.route('/api/admin/delivery-slots', methods=['GET'])
@admin_required
def get_admin_delivery_slots():
    try:
        slots = db.get_all_delivery_slots()
        return jsonify(slots)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/delivery-slots', methods=['POST'])
@admin_required
def add_delivery_slot():
    try:
        data = request.json
        db.add_delivery_slot(
            time_start=data['time_start'],
            time_end=data['time_end'],
            max_orders=data['max_orders']
        )
        return jsonify({'message': 'Слот успешно добавлен'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/admin/delivery-slots/<int:slot_id>', methods=['PUT'])
@admin_required
def update_delivery_slot(slot_id):
    try:
        data = request.json
        db.update_delivery_slot(slot_id, data)
        return jsonify({'message': 'Слот успешно обновлен'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/admin/delivery-slots/<int:slot_id>', methods=['DELETE'])
@admin_required
def delete_delivery_slot(slot_id):
    try:
        db.delete_delivery_slot(slot_id)
        return jsonify({'message': 'Слот успешно удален'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/order-success/<int:order_id>')
def order_success(order_id):
    # Добавим endpoint в контекст шаблона
    endpoint = 'order_success'
    return render_template('order-success.html')

@app.route('/api/orders/<int:order_id>')
def get_order_details(order_id):
    try:
        order = db.get_order_details(order_id)
        return jsonify(order)
    except Exception as e:
        return jsonify({'error': str(e)}), 404

@app.route('/payment/card/<int:order_id>')
def card_payment(order_id):
    # Здесь будет интеграция с платежной системой
    return render_template('payment/card.html')

@app.route('/api/payment/sbp/<int:order_id>')
def get_sbp_qr(order_id):
    # Здесь будет генерация QR-кода для СБП
    return jsonify({
        'qr_code': 'URL_to_QR_code'
    })

@app.route('/api/payment/status/<int:order_id>')
def check_payment_status(order_id):
    # Здесь будет проверка статуса оплаты
    return jsonify({
        'is_paid': False
    })

@app.route('/api/admin/orders')
@admin_required
def get_admin_orders():
    try:
        status = request.args.get('status')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        offset = (page - 1) * per_page
        
        print('Получение заказов с параметрами:', {
            'status': status,
            'page': page,
            'per_page': per_page,
            'offset': offset
        })
        
        orders = db.get_orders_with_details(
            limit=per_page,
            offset=offset,
            status=status
        )
        print('Получены заказы:', orders)
        return jsonify(orders)
    except Exception as e:
        print('Ошибка при получении заказов:', str(e))
        import traceback
        print('Traceback:', traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/orders/<int:order_id>/status', methods=['PUT'])
@admin_required
def update_order_status(order_id):
    try:
        data = request.json
        db.update_order_status(order_id, data['status'])
        return jsonify({'message': 'Статус заказа обновлен'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/admin/orders/<int:order_id>', methods=['DELETE'])
@admin_required
def delete_order(order_id):
    try:
        db.delete_order(order_id)
        return jsonify({'message': 'Заказ удален'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/admin/orders/stats')
@admin_required
def get_orders_stats():
    try:
        stats = db.get_orders_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/statistics')
@admin_required
def get_statistics():
    try:
        period = request.args.get('period', 'day')
        stats = db.get_statistics(period)
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True) 