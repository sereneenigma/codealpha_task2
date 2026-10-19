"""REST API routes (all under /api). Token auth via signed, expiring bearer tokens."""
import random
import re
from functools import wraps

from flask import Blueprint, current_app, g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import func, or_
from sqlalchemy.exc import SQLAlchemyError

from models import CartItem, Order, OrderItem, Product, Review, User, db

api = Blueprint("api", __name__, url_prefix="/api")

TOKEN_MAX_AGE = 7 * 24 * 3600
MAX_QTY = 10
FREE_DELIVERY_ABOVE = 499
DELIVERY_FEE = 40
ALIASES = {
    "clothes": ["mens-shirts", "tops", "womens-dresses", "kids-wear"], "clothing": ["mens-shirts", "tops", "womens-dresses", "kids-wear"],
    "cloth": ["mens-shirts", "tops", "womens-dresses", "kids-wear"], "footwear": ["mens-shoes", "womens-shoes", "sports-shoes"],
    "shoes": ["mens-shoes", "womens-shoes", "sports-shoes"], "fruit": ["fruits"], "fruits": ["fruits"],
    "vegetable": ["vegetables"], "vegetables": ["vegetables"], "veggies": ["vegetables"],
    "makeup": ["makeup"], "cosmetics": ["makeup", "skin-care"], "beauty": ["makeup", "skin-care", "fragrances"],
}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------------------------------------------------------------- helpers
def err(message, code=400):
    return jsonify({"error": message}), code


def _serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="auth-token")


def login_required(fn):
    """Protects a route: requires 'Authorization: Bearer <token>'."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return err("Please log in to continue.", 401)
        try:
            data = _serializer().loads(header[7:], max_age=TOKEN_MAX_AGE)
        except SignatureExpired:
            return err("Your session has expired. Please log in again.", 401)
        except BadSignature:
            return err("Invalid session. Please log in again.", 401)
        user = db.session.get(User, data.get("uid"))
        if not user:
            return err("Account not found. Please log in again.", 401)
        g.user = user
        return fn(*args, **kwargs)
    return wrapper


def cart_payload(user):
    """Cart contents plus price breakdown."""
    rows, subtotal, mrp_total, count = [], 0, 0, 0
    for ci in CartItem.query.filter_by(user_id=user.id).order_by(CartItem.id).all():
        p = ci.product
        rows.append({"product": p.to_dict(), "quantity": ci.quantity, "line_total": p.price * ci.quantity})
        subtotal += p.price * ci.quantity
        mrp_total += p.mrp * ci.quantity
        count += ci.quantity
    delivery = 0 if (subtotal == 0 or subtotal >= FREE_DELIVERY_ABOVE) else DELIVERY_FEE
    return {"items": rows, "count": count, "subtotal": subtotal, "mrp_total": mrp_total,
            "discount": mrp_total - subtotal, "delivery": delivery, "total": subtotal + delivery}


# ---------------------------------------------------------------- auth
@api.post("/auth/register")
def register():
    d = request.get_json(silent=True) or {}
    name = str(d.get("name", "")).strip()
    email = str(d.get("email", "")).strip().lower()
    password = str(d.get("password", ""))
    if len(name) < 2:
        return err("Enter your name (at least 2 characters).")
    if not EMAIL_RE.match(email):
        return err("Enter a valid email address.")
    if len(password) < 6:
        return err("Password must be at least 6 characters.")
    if User.query.filter_by(email=email).first():
        return err("An account with this email already exists. Try logging in.", 409)
    user = User(name=name, email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify({"token": _serializer().dumps({"uid": user.id}), "user": user.to_dict()}), 201


@api.post("/auth/login")
def login():
    d = request.get_json(silent=True) or {}
    email = str(d.get("email", "")).strip().lower()
    password = str(d.get("password", ""))
    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):  # same message for both: avoids user enumeration
        return err("Incorrect email or password.", 401)
    return jsonify({"token": _serializer().dumps({"uid": user.id}), "user": user.to_dict()})


@api.get("/auth/me")
@login_required
def me():
    return jsonify({"user": g.user.to_dict(), "order_count": len(g.user.orders)})


# ---------------------------------------------------------------- catalog
@api.get("/categories")
def categories():
    rows = db.session.query(Product.category, func.count(Product.id)).group_by(Product.category).all()
    out = []
    for slug, count in sorted(rows):
        first = Product.query.filter_by(category=slug).first()
        out.append({"slug": slug, "name": slug.replace("-", " ").title(), "count": count,
                    "image": first.thumbnail if first else ""})
    return jsonify(out)


@api.get("/products")
def list_products():
    q = Product.query
    search = request.args.get("q", "").strip()
    alias = ALIASES.get(search.lower())
    if alias:  # "clothes", "footwear", "fruits"... map to category groups
        q = q.filter(Product.category.in_(alias))
    elif search:
        like = f"%{search}%"
        q = q.filter(or_(Product.title.ilike(like), Product.brand.ilike(like),
                         Product.category.ilike(like), Product.description.ilike(like)))
    cats = [c for c in request.args.get("category", "").split(",") if c]
    if cats:
        q = q.filter(Product.category.in_(cats))
    for arg, col, op in (("min_price", Product.price, "ge"), ("max_price", Product.price, "le"),
                         ("min_rating", Product.rating, "ge")):
        raw = request.args.get(arg)
        if raw:
            try:
                val = float(raw)
            except ValueError:
                return err(f"Invalid value for {arg}.")
            q = q.filter(col >= val if op == "ge" else col <= val)

    sort = request.args.get("sort", "relevance")
    order = {
        "price_asc": Product.price.asc(), "price_desc": Product.price.desc(),
        "rating": Product.rating.desc(),
        "discount": ((Product.mrp - Product.price) * 1.0 / Product.mrp).desc(),
    }.get(sort, Product.id.asc())
    q = q.order_by(order)

    try:
        page = max(int(request.args.get("page", 1)), 1)
        per_page = min(max(int(request.args.get("per_page", 20)), 1), 60)
    except ValueError:
        return err("Invalid pagination values.")
    p = q.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({"items": [x.to_dict() for x in p.items], "total": p.total, "page": p.page, "pages": p.pages})


@api.get("/products/<int:pid>")
def product_detail(pid):
    p = db.session.get(Product, pid)
    if not p:
        return err("Product not found.", 404)
    return jsonify(p.to_dict(detail=True))


@api.post("/products/<int:pid>/reviews")
@login_required
def add_review(pid):
    p = db.session.get(Product, pid)
    if not p:
        return err("Product not found.", 404)
    d = request.get_json(silent=True) or {}
    try:
        rating = int(d.get("rating"))
    except (TypeError, ValueError):
        return err("Choose a rating from 1 to 5.")
    comment = str(d.get("comment", "")).strip()[:1000]
    if not 1 <= rating <= 5:
        return err("Choose a rating from 1 to 5.")
    db.session.add(Review(product_id=pid, user_name=g.user.name, rating=rating, comment=comment))
    # Running average across existing ratings + this one
    p.rating = (p.rating * p.rating_count + rating) / (p.rating_count + 1)
    p.rating_count += 1
    db.session.commit()
    return jsonify(p.to_dict(detail=True)), 201


# ---------------------------------------------------------------- cart
@api.get("/cart")
@login_required
def get_cart():
    return jsonify(cart_payload(g.user))


@api.post("/cart")
@login_required
def add_to_cart():
    d = request.get_json(silent=True) or {}
    try:
        pid, qty = int(d.get("product_id")), int(d.get("quantity", 1))
    except (TypeError, ValueError):
        return err("Invalid product or quantity.")
    if qty < 1:
        return err("Quantity must be at least 1.")
    p = db.session.get(Product, pid)
    if not p:
        return err("Product not found.", 404)
    if p.stock < 1:
        return err("This product is out of stock.", 409)
    ci = CartItem.query.filter_by(user_id=g.user.id, product_id=pid).first()
    if not ci:
        ci = CartItem(user_id=g.user.id, product_id=pid, quantity=0)
        db.session.add(ci)
    ci.quantity = min(ci.quantity + qty, MAX_QTY, p.stock)
    db.session.commit()
    return jsonify(cart_payload(g.user)), 201


@api.put("/cart/<int:pid>")
@login_required
def update_cart(pid):
    d = request.get_json(silent=True) or {}
    try:
        qty = int(d.get("quantity"))
    except (TypeError, ValueError):
        return err("Invalid quantity.")
    ci = CartItem.query.filter_by(user_id=g.user.id, product_id=pid).first()
    if not ci:
        return err("Item is not in your cart.", 404)
    if qty <= 0:
        db.session.delete(ci)
    else:
        ci.quantity = min(qty, MAX_QTY, ci.product.stock)
    db.session.commit()
    return jsonify(cart_payload(g.user))


@api.delete("/cart/<int:pid>")
@login_required
def remove_from_cart(pid):
    CartItem.query.filter_by(user_id=g.user.id, product_id=pid).delete()
    db.session.commit()
    return jsonify(cart_payload(g.user))


# ---------------------------------------------------------------- orders
def _new_order_number():
    while True:
        number = "OD" + "".join(random.choices("0123456789", k=12))
        if not Order.query.filter_by(order_number=number).first():
            return number


@api.post("/orders")
@login_required
def place_order():
    d = request.get_json(silent=True) or {}
    fields = ("full_name", "phone", "address", "city", "state", "pincode")
    s = {k: str(d.get(k, "")).strip() for k in fields}
    if not all(s.values()):
        return err("Fill in all shipping address fields.")
    if not re.fullmatch(r"\d{10}", s["phone"]):
        return err("Enter a valid 10-digit mobile number.")
    if not re.fullmatch(r"\d{6}", s["pincode"]):
        return err("Enter a valid 6-digit pincode.")
    payment = str(d.get("payment_method", "COD")).upper()
    if payment not in ("COD", "UPI", "CARD"):
        return err("Choose a valid payment method.")

    items = CartItem.query.filter_by(user_id=g.user.id).all()
    if not items:
        return err("Your cart is empty. Add items before placing an order.")
    for ci in items:
        if ci.quantity > ci.product.stock:
            return err(f"Only {ci.product.stock} unit(s) of '{ci.product.title}' left in stock. Update your cart.", 409)

    cart = cart_payload(g.user)
    try:
        order = Order(order_number=_new_order_number(), user_id=g.user.id, subtotal=cart["subtotal"],
                      delivery_fee=cart["delivery"], total=cart["total"], payment_method=payment, **s)
        db.session.add(order)
        db.session.flush()
        for ci in items:
            p = ci.product
            db.session.add(OrderItem(order_id=order.id, product_id=p.id, title=p.title, image=p.thumbnail,
                                     price=p.price, quantity=ci.quantity))
            p.stock -= ci.quantity
            db.session.delete(ci)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return err("We couldn't place your order. Please try again.", 500)
    return jsonify(order.to_dict()), 201


@api.get("/orders")
@login_required
def list_orders():
    return jsonify([o.to_dict() for o in g.user.orders])


@api.get("/orders/<order_number>")
@login_required
def get_order(order_number):
    order = Order.query.filter_by(order_number=order_number, user_id=g.user.id).first()
    if not order:
        return err("Order not found.", 404)
    return jsonify(order.to_dict())
