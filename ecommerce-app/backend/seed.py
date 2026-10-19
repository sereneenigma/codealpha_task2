"""Seeds the catalog.
1. Tries DummyJSON (real product photos) and remaps its categories to shopper-friendly ones
   (makeup, fruits, vegetables, ...).
2. Adds a built-in catalog (clothes, footwear, fruits, vegetables, makeup, ...) for any category
   DummyJSON lacks. Built-in items use generated artwork served from /art/*.svg, so they work offline.
If the DB holds a small/old catalog and DummyJSON is reachable, it is replaced by the full one."""
import json
import random
from urllib.parse import quote

import requests

from models import CartItem, Product, Review, db

USD_TO_INR = 83
FULL_CATALOG_MIN = 50
REVIEWERS = ["Aarav S.", "Priya M.", "Rohan K.", "Neha P.", "Vikram T.", "Sneha R.", "Arjun D.", "Isha G."]
COMMENTS = ["Great value for money.", "Quality is excellent, as described.", "Delivery was quick.",
            "Decent product, does the job.", "Fresh and well packed.", "Highly recommended!",
            "Exceeded my expectations."]

FRUIT_WORDS = ("apple", "banana", "kiwi", "lemon", "mango", "orange", "strawberry", "mulberry", "grape", "watermelon", "papaya")
VEG_WORDS = ("cucumber", "pepper", "potato", "onion", "tomato", "carrot", "broccoli", "spinach", "cabbage", "chili")

# (title, brand, category, price, mrp, emoji)
FALLBACK = [
    # Clothing
    ("Men's Slim Fit Cotton Shirt", "Peter England", "mens-shirts", 899, 1799, "👔"),
    ("Men's Checked Casual Shirt", "Roadster", "mens-shirts", 649, 1499, "👕"),
    ("Men's Round Neck T-Shirt (Pack of 3)", "Jockey", "mens-shirts", 799, 1599, "👕"),
    ("Men's Slim Fit Denim Jeans", "Levi's", "mens-shirts", 1599, 3299, "👖"),
    ("Women's Floral Summer Dress", "Zara", "womens-dresses", 1499, 2999, "👗"),
    ("Women's Printed Kurta Set", "Biba", "womens-dresses", 1199, 2499, "👗"),
    ("Women's Cotton Top", "Vero Moda", "tops", 499, 999, "👚"),
    ("Women's Hoodie Sweatshirt", "H&M", "tops", 999, 1999, "🧥"),
    ("Kids Cotton Party Frock", "Hopscotch", "kids-wear", 699, 1399, "👧"),
    ("Kids Printed T-Shirt & Shorts Set", "Max", "kids-wear", 449, 899, "👦"),
    # Footwear
    ("Men's Running Shoes", "Nike", "sports-shoes", 3299, 5495, "👟"),
    ("Men's Lightweight Sports Shoes", "Puma", "sports-shoes", 2199, 4299, "👟"),
    ("Men's Leather Formal Shoes", "Bata", "mens-shoes", 1799, 2999, "👞"),
    ("Men's Casual Sneakers", "Skechers", "mens-shoes", 2499, 4499, "👟"),
    ("Women's Block Heel Sandals", "Metro", "womens-shoes", 1299, 2499, "👠"),
    ("Women's Ballet Flats", "Catwalk", "womens-shoes", 799, 1599, "🥿"),
    ("Unisex Flip Flops", "Crocs", "mens-shoes", 599, 999, "🩴"),
    # Fruits
    ("Fresh Apples (1 kg)", "Kashmir Orchards", "fruits", 179, 220, "🍎"),
    ("Robusta Bananas (1 dozen)", "FarmFresh", "fruits", 59, 75, "🍌"),
    ("Alphonso Mangoes (1 kg)", "Ratnagiri Farms", "fruits", 349, 450, "🥭"),
    ("Juicy Oranges (1 kg)", "Nagpur Fresh", "fruits", 99, 130, "🍊"),
    ("Seedless Green Grapes (500 g)", "FarmFresh", "fruits", 89, 120, "🍇"),
    ("Strawberries (250 g)", "Mahabaleshwar Fresh", "fruits", 119, 150, "🍓"),
    ("Watermelon (approx. 3 kg)", "FarmFresh", "fruits", 129, 180, "🍉"),
    # Vegetables
    ("Fresh Tomatoes (1 kg)", "FarmFresh", "vegetables", 39, 55, "🍅"),
    ("Onions (2 kg)", "Nashik Farms", "vegetables", 69, 90, "🧅"),
    ("Potatoes (2 kg)", "Punjab Farms", "vegetables", 59, 80, "🥔"),
    ("Carrots (500 g)", "FarmFresh", "vegetables", 35, 50, "🥕"),
    ("Broccoli (1 piece)", "Organic India", "vegetables", 49, 70, "🥦"),
    ("Green Capsicum (500 g)", "FarmFresh", "vegetables", 45, 60, "🫑"),
    ("Fresh Spinach (250 g)", "Organic India", "vegetables", 25, 35, "🥬"),
    # Makeup & beauty
    ("Matte Liquid Lipstick", "Maybelline", "makeup", 399, 699, "💄"),
    ("Volume Lash Mascara", "Lakmé", "makeup", 349, 599, "👁️"),
    ("12-Shade Eyeshadow Palette", "Nykaa", "makeup", 699, 1299, "🎨"),
    ("Full Coverage Foundation", "L'Oréal", "makeup", 549, 899, "🧴"),
    ("Gel Nail Polish Set (6 pcs)", "Colorbar", "makeup", 449, 799, "💅"),
    ("Vitamin C Face Serum", "Minimalist", "skin-care", 549, 699, "🧴"),
    ("Sunscreen SPF 50", "Neutrogena", "skin-care", 449, 599, "🧴"),
    ("Eau de Parfum 100 ml", "Davidoff", "fragrances", 2499, 3999, "🌸"),
    # Electronics
    ("Galaxy Nova 5G (128 GB)", "Samsung", "smartphones", 24999, 32999, "📱"),
    ("Pixel Lite 8a", "Google", "smartphones", 38999, 45999, "📱"),
    ("UltraBook Air 14", "Asus", "laptops", 58990, 74990, "💻"),
    ("Wireless Noise-Cancelling Headphones", "Sony", "mobile-accessories", 8990, 14990, "🎧"),
    ("Fast Charger 65W", "Anker", "mobile-accessories", 1299, 2499, "🔌"),
    ("Analog Chronograph Watch", "Fossil", "mens-watches", 5495, 9995, "⌚"),
    # Home
    ("Ergonomic Office Chair", "Green Soul", "furniture", 7499, 12999, "🪑"),
    ("Table Lamp with Wooden Base", "Philips", "lighting", 799, 1499, "💡"),
    ("Organic Basmati Rice 5 kg", "India Gate", "groceries", 649, 799, "🍚"),
]

ART_COLORS = {"fruits": ("#fff3e0", "#ffcc80"), "vegetables": ("#e8f5e9", "#a5d6a7"), "makeup": ("#fce4ec", "#f48fb1"),
              "skin-care": ("#fce4ec", "#f8bbd0"), "fragrances": ("#f3e5f5", "#ce93d8"), "mens-shoes": ("#e3f2fd", "#90caf9"),
              "sports-shoes": ("#e3f2fd", "#90caf9"), "womens-shoes": ("#fce4ec", "#f8bbd0")}


def art_url(title, emoji, category):
    c1, c2 = ART_COLORS.get(category, ("#e8f0fe", "#b3cdfb"))
    return f"/art/{quote(emoji)}.svg?t={quote(title[:30])}&a={quote(c1)}&b={quote(c2)}"


def _reviews_for(product, rng, n=3):
    for _ in range(n):
        db.session.add(Review(product_id=product.id, user_name=rng.choice(REVIEWERS),
                              rating=rng.randint(3, 5), comment=rng.choice(COMMENTS)))


def _remap_category(title, cat):
    t = title.lower()
    if cat == "beauty":
        return "makeup"
    if cat == "groceries":
        if any(w in t for w in FRUIT_WORDS):
            return "fruits"
        if any(w in t for w in VEG_WORDS):
            return "vegetables"
    return cat


def _from_dummyjson():
    resp = requests.get("https://dummyjson.com/products?limit=100", timeout=10)
    resp.raise_for_status()
    out = []
    for p in resp.json()["products"]:
        cat = _remap_category(p["title"], p["category"])
        price = max(9, round(p["price"] * USD_TO_INR / 10) * 10 - 1)
        disc = min(p.get("discountPercentage") or 10, 80)
        dim = p.get("dimensions") or {}
        specs = {
            "Brand": p.get("brand") or "Generic", "Category": cat.replace("-", " ").title(),
            "SKU": p.get("sku", "-"), "Weight": f'{p.get("weight", "-")} g',
            "Dimensions (W x H x D)": " x ".join(str(dim.get(k, "-")) for k in ("width", "height", "depth")) + " cm",
            "Warranty": p.get("warrantyInformation", "-"), "Shipping": p.get("shippingInformation", "-"),
            "Return policy": p.get("returnPolicy", "-"),
        }
        out.append(dict(
            title=p["title"], description=p.get("description", ""), brand=p.get("brand") or "Generic",
            category=cat, price=price, mrp=round(price / (1 - disc / 100)),
            rating=p.get("rating", 4.0), stock=p.get("stock", 20), thumbnail=p["thumbnail"],
            images=p.get("images") or [p["thumbnail"]], specs=specs, reviews=p.get("reviews", [])))
    return out


def _from_fallback(only_missing=None):
    out = []
    for i, (title, brand, cat, price, mrp, emoji) in enumerate(FALLBACK):
        if only_missing is not None and cat in only_missing:
            continue
        img = art_url(title, emoji, cat)
        out.append(dict(
            title=title, description=f"{title} by {brand}. Quality assured, fast delivery and easy returns.",
            brand=brand, category=cat, price=price, mrp=mrp, rating=round(3.8 + (i % 12) / 10, 1),
            stock=25 + i, thumbnail=img, images=[img],
            specs={"Brand": brand, "Category": cat.replace("-", " ").title(), "Delivery": "Free above ₹499",
                   "Return policy": "7 days return"}, reviews=[]))
    return out


def seed_products():
    count = Product.query.count()
    if count >= FULL_CATALOG_MIN:
        return
    try:
        items = _from_dummyjson()
        have = {i["category"] for i in items}
        items += _from_fallback(only_missing=have)  # add categories DummyJSON lacks (clothing, footwear, fruits...)
        print(f"[seed] Using DummyJSON catalog + built-in extras ({len(items)} products).")
    except Exception as exc:
        if count >= len(FALLBACK):
            return  # catalog already usable; retry DummyJSON on a later start
        print(f"[seed] DummyJSON unavailable ({exc}); using built-in catalog.")
        items = _from_fallback()
    if count:  # replace the old small catalog (orders keep their own snapshots)
        CartItem.query.delete(); Review.query.delete(); Product.query.delete(); db.session.commit()
    rng = random.Random(42)
    for it in items:
        reviews = it.pop("reviews")
        product = Product(images=json.dumps(it.pop("images")), specs=json.dumps(it.pop("specs")),
                          rating_count=rng.randint(40, 3500), **it)
        db.session.add(product)
        db.session.flush()
        if reviews:
            for r in reviews:
                db.session.add(Review(product_id=product.id, user_name=r.get("reviewerName", "Customer"),
                                      rating=r.get("rating", 4), comment=r.get("comment", "")))
        else:
            _reviews_for(product, rng)
    db.session.commit()
    print(f"[seed] Inserted {len(items)} products.")
