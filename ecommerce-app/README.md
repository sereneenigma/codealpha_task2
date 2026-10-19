# ShopKart — Flipkart/Amazon-style e-commerce app

Flask + SQLAlchemy backend (SQLite by default, PostgreSQL supported) and a vanilla HTML/CSS/JS frontend.
Flask serves both the REST API (`/api/*`) and the static frontend, so one process runs everything.

## Features
- Register / login with signed, expiring bearer tokens (protects cart, checkout, orders, reviews)
- Marketplace homepage: sticky header, mega-menu, hero carousel, category strip, deals carousel, search, filters (category, price, rating), sorting, "load more"
- Product page: image gallery with hover zoom, price/discount, stock state, quantity, Add to Cart / Buy Now, specs, reviews (post your own), similar products
- Cart: increment/decrement/remove, empty state, price breakdown, free delivery over ₹499
- Checkout: address validation, payment choice (demo only), stock re-check, unique Order ID (`OD` + 12 digits), saved to the database, order history page

## Project structure
```
ecommerce-app/
├── backend/   app.py · models.py · routes.py · seed.py · requirements.txt · .env.example
├── frontend/  index.html · product.html · cart.html · login.html · orders.html · css/style.css · js/main.js
├── Procfile · render.yaml · runtime.txt
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
