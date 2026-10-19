# ShopKart — Professional Flipkart & Amazon-Style E-Commerce Platform
**CodeAlpha Internship — Task 2: E-Commerce Web Application**

A full-stack e-commerce web application featuring a Flask + SQLAlchemy REST API backend and a responsive, high-converting vanilla ES6+ frontend inspired by Flipkart and Amazon India.

Flask serves both the REST API (`/api/*`) and the static frontend, so one lightweight process runs the entire platform.

## Key Features & Marketplace Enhancements

### 🛒 Flipkart / Amazon Look & Feel
- **Top Utility & Announcement Bar**: Highlights ongoing seasonal sales, free delivery thresholds, and quick links to Deals, Wishlist, and Order Tracking.
- **Brand Identity & Flipkart Plus**: Iconic italic branding with "Explore Plus ✦" badge.
- **Instant Search Suggestions Dropdown**: Real-time debounced auto-complete showing matched categories and instant product previews (thumbnail, title, brand, and price) as you type.
- **Flipkart "⚡ Assured" Badges**: Highlighted on qualifying products with high customer ratings.
- **Deals of the Day Strip**: Live ticking countdown timer (`HH:MM:SS Left`) driving conversion urgency.
- **Trust & Assurance Strip**: 4-point value proposition (Free Delivery ₹499+, 7 Days Replacement, 100% Genuine, Secure UPI/Card/COD Payments).

### 📱 Product Experience & PDP
- **Image Gallery with Hover Zoom**: High-resolution zoom on mouse hover and click-to-switch thumbnails.
- **Bank Offers & Discounts Card**: Real bank discount breakdown (10% HDFC/SBI Instant Discount, 5% Axis Cashback, Flat ₹100 First Order, and 15% coupon codes).
- **Interactive Pincode Delivery Estimator**: Input any 6-digit pincode to get dynamic delivery date estimates and free delivery confirmation, automatically saved to localStorage.
- **Trust Badges Matrix**: 7-Day Replacement, Free Delivery, 1-Year Brand Warranty, and Top Brand Guarantee.
- **Wishlist Integration**: One-click heart toggle on both product cards and PDP with real-time counter badge and localStorage persistence.
- **Interactive Ratings & Reviews**: User reviews with star rating breakdown and review submission form.

### 💳 Cart, Checkout & Order Tracking
- **Coupon & Promo Code Engine**: Validates discount codes (`CODEALPHA` for 15% off, `WELCOME100` for ₹100 off, `SUPERDEAL` for ₹250 off, `FREEDEL` for free shipping) with live discount updates.
- **Interactive Payment Options**:
  - **Cash on Delivery (COD)**: Doorstep cash/UPI payment.
  - **UPI**: Virtual Payment Address (VPA) input with format validation and quick app selector (Google Pay, PhonePe, Paytm, BHIM).
  - **Credit / Debit / ATM Card**: Interactive 16-digit card input with auto-formatting, Expiry, CVV.
- **Multi-Step Visual Delivery Tracker**: Amazon/Flipkart-style progress bar (`Order Confirmed` ➔ `Shipped` ➔ `Out for Delivery` ➔ `Delivered`).
- **Invoice Generation**: One-click printable invoices on order confirmation and order history.
- **Dedicated Wishlist Page (`wishlist.html`)**: Manage saved items and move them directly to the cart.

## Project Structure
```
ecommerce-app/
├── backend/
│   ├── app.py              # Application factory, static hosting, SVG artwork generator
│   ├── models.py           # SQLAlchemy models: User, Product, Review, CartItem, Order, OrderItem
│   ├── routes.py           # REST API: auth, catalog, search, reviews, cart, orders
│   ├── seed.py             # Product catalog seed loader (DummyJSON API + offline fallback)
│   ├── requirements.txt    # Python dependencies
│   └── .env.example        # Environment variables template
├── frontend/
│   ├── index.html          # Homepage with hero, trust strip, deals timer, filters, catalog
│   ├── product.html        # PDP with gallery, bank offers, pincode checker, trust matrix
│   ├── cart.html           # Cart and checkout with coupon engine & payment selectors
│   ├── wishlist.html       # Wishlist management page with move-to-cart action
│   ├── orders.html         # Order history with multi-step delivery status trackers
│   ├── login.html          # Authentication page (Login & Registration)
│   ├── css/style.css       # Complete responsive styling (Flipkart/Amazon marketplace UI)
│   └── js/main.js          # SPA controller, Wishlist engine, live search, coupons, checkout
├── Procfile                # Heroku deployment
├── render.yaml             # Render blueprint deployment
├── runtime.txt             # Python runtime specification
└── README.md
```

## Run locally
Requires Python 3.10+.

```bash
cd ecommerce-app/backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # then set SECRET_KEY (Windows: copy .env.example .env)
python app.py
```
Open http://localhost:5000.

**"Migrations":** tables are created automatically on startup (`db.create_all()`), and the catalog is seeded once
(~100 products from the DummyJSON API; if offline, a built-in 16-product catalog with Picsum images is used).
To reset the data, stop the server and delete `backend/shopkart.db`.

## Environment variables
| Variable | Purpose | Default |
|---|---|---|
| `SECRET_KEY` | Signs auth tokens. **Required in production.** | dev-only value |
| `DATABASE_URL` | PostgreSQL URL (`postgres://` is auto-converted) | SQLite file `backend/shopkart.db` |
| `CORS_ORIGINS` | Comma-separated allowed origins if the frontend is hosted separately | `*` |
| `PORT` | Server port | `5000` |
| `FLASK_DEBUG` | `1` enables debug/reload locally | off |

Generate a key: `python -c "import secrets; print(secrets.token_hex(32))"`

### Using PostgreSQL
```bash
createdb shopkart
# in backend/.env
DATABASE_URL=postgresql://user:password@localhost:5432/shopkart
```
Restart the app; tables and seed data are created on first start.

## API summary
| Method & path | Auth | Description |
|---|---|---|
| `POST /api/auth/register`, `POST /api/auth/login` | – | Returns `{token, user}` |
| `GET /api/auth/me` | ✔ | Current user |
| `GET /api/categories` | – | Categories with counts |
| `GET /api/products?q=&category=a,b&min_price=&max_price=&min_rating=&sort=&page=&per_page=` | – | `sort`: `relevance, price_asc, price_desc, rating, discount` |
| `GET /api/products/<id>` | – | Detail incl. specs, images, reviews |
| `POST /api/products/<id>/reviews` | ✔ | `{rating, comment}` |
| `GET/POST /api/cart`, `PUT/DELETE /api/cart/<product_id>` | ✔ | Cart + totals |
| `POST /api/orders`, `GET /api/orders`, `GET /api/orders/<order_number>` | ✔ | Place and view orders |

Send the token as `Authorization: Bearer <token>`.

## Deploy
**Render (recommended):** push to GitHub → New → Blueprint (uses `render.yaml`), or create a Web Service with
build `pip install -r backend/requirements.txt` and start `gunicorn --chdir backend app:app --workers 2 --preload --bind 0.0.0.0:$PORT`.
Set `SECRET_KEY` and `FLASK_ENV=production`. Add a Render PostgreSQL database and set `DATABASE_URL`
(without it SQLite is used, and Render's disk is ephemeral, so data resets on redeploy).

**Heroku:** `heroku create && heroku addons:create heroku-postgresql:essential-0 && heroku config:set SECRET_KEY=... FLASK_ENV=production && git push heroku main` (uses `Procfile`).

**Frontend on Vercel/Netlify (optional):** deploy the `frontend/` folder as a static site, uncomment the
`<meta name="api-base">` tag in each HTML file with your backend URL, and set `CORS_ORIGINS` on the backend.

## Notes
- Payments are simulated; no card or UPI data is collected or processed.
- Prices are shown in INR (DummyJSON USD prices converted at 83).
- To package: `zip -r ecommerce-app.zip ecommerce-app -x "*/__pycache__/*" "*.db" "*/.venv/*"`
