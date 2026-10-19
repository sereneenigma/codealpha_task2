"""Database models: User, Product, Review, CartItem, Order, OrderItem."""
import json
from datetime import datetime

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    cart_items = db.relationship("CartItem", backref="user", cascade="all, delete-orphan")
    orders = db.relationship("Order", backref="user", order_by="Order.created_at.desc()")

    def set_password(self, raw):
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw):
        return check_password_hash(self.password_hash, raw)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "email": self.email}


class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default="")
    brand = db.Column(db.String(100), default="")
    category = db.Column(db.String(80), nullable=False, index=True)
    price = db.Column(db.Integer, nullable=False)  # selling price in INR
    mrp = db.Column(db.Integer, nullable=False)    # list price in INR
    rating = db.Column(db.Float, default=0)
    rating_count = db.Column(db.Integer, default=0)
    stock = db.Column(db.Integer, default=0)
    thumbnail = db.Column(db.String(500), default="")
    images = db.Column(db.Text, default="[]")  # JSON list of URLs
    specs = db.Column(db.Text, default="{}")   # JSON object

    reviews = db.relationship("Review", backref="product", cascade="all, delete-orphan",
                              order_by="Review.created_at.desc()")

    def to_dict(self, detail=False):
        data = {
            "id": self.id, "title": self.title, "brand": self.brand,
            "category": self.category, "price": self.price, "mrp": self.mrp,
            "discount": round((self.mrp - self.price) * 100 / self.mrp) if self.mrp else 0,
            "rating": round(self.rating or 0, 1), "rating_count": self.rating_count,
            "stock": self.stock, "thumbnail": self.thumbnail,
        }
        if detail:
            data.update({
                "description": self.description,
                "images": json.loads(self.images or "[]") or [self.thumbnail],
                "specs": json.loads(self.specs or "{}"),
                "reviews": [r.to_dict() for r in self.reviews[:30]],
            })
        return data


class Review(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("product.id"), nullable=False, index=True)
    user_name = db.Column(db.String(80), nullable=False)
    rating = db.Column(db.Integer, nullable=False)
    comment = db.Column(db.Text, default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {"user_name": self.user_name, "rating": self.rating, "comment": self.comment,
                "created_at": self.created_at.strftime("%d %b %Y")}


class CartItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("product.id"), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)

    product = db.relationship("Product")
    __table_args__ = (db.UniqueConstraint("user_id", "product_id", name="uq_user_product"),)


class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_number = db.Column(db.String(20), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    subtotal = db.Column(db.Integer, nullable=False)
    delivery_fee = db.Column(db.Integer, nullable=False, default=0)
    total = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(30), default="Confirmed")
    payment_method = db.Column(db.String(10), default="COD")
    full_name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(15), nullable=False)
    address = db.Column(db.String(300), nullable=False)
    city = db.Column(db.String(80), nullable=False)
    state = db.Column(db.String(80), nullable=False)
    pincode = db.Column(db.String(10), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    items = db.relationship("OrderItem", backref="order", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "order_number": self.order_number, "status": self.status,
            "subtotal": self.subtotal, "delivery_fee": self.delivery_fee, "total": self.total,
            "payment_method": self.payment_method,
            "created_at": self.created_at.strftime("%d %b %Y, %I:%M %p"),
            "shipping": {"full_name": self.full_name, "phone": self.phone, "address": self.address,
                         "city": self.city, "state": self.state, "pincode": self.pincode},
            "items": [i.to_dict() for i in self.items],
        }


class OrderItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("order.id"), nullable=False, index=True)
    product_id = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(200), nullable=False)  # snapshot at purchase time
    image = db.Column(db.String(500), default="")
    price = db.Column(db.Integer, nullable=False)
    quantity = db.Column(db.Integer, nullable=False)

    def to_dict(self):
        return {"product_id": self.product_id, "title": self.title, "image": self.image,
                "price": self.price, "quantity": self.quantity}
