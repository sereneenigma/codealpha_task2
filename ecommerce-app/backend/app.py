"""Application factory + entry point. Serves the REST API and the static frontend."""
import os

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory
from markupsafe import escape
from flask_cors import CORS

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

from models import db  # noqa: E402  (after load_dotenv so env vars are available)
from routes import api  # noqa: E402
from seed import seed_products  # noqa: E402

FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))


def create_app():
    app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")

    db_url = os.environ.get("DATABASE_URL", "sqlite:///" + os.path.join(BASE_DIR, "shopkart.db"))
    if db_url.startswith("postgres://"):  # Heroku/Render style URL -> SQLAlchemy dialect
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    app.config.update(
        SQLALCHEMY_DATABASE_URI=db_url,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-only-change-me"),
    )
    if app.config["SECRET_KEY"] == "dev-only-change-me" and os.environ.get("FLASK_ENV") == "production":
        raise RuntimeError("Set a strong SECRET_KEY environment variable in production.")

    # Allow a separately hosted frontend (e.g. Vercel) via CORS_ORIGINS="https://a.com,https://b.com"
    origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",")]
    CORS(app, resources={r"/api/*": {"origins": origins}})

    db.init_app(app)
    app.register_blueprint(api)

    with app.app_context():
        db.create_all()      # creates tables on first run (no manual migration needed)
        seed_products()

    @app.get("/")
    def index():
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.get("/art/<key>.svg")
    def art(key):
        """Generated product artwork (emoji on a soft gradient) — works offline."""
        a = request.args.get("a", "#e8f0fe")[:9]; b = request.args.get("b", "#b3cdfb")[:9]
        title = escape(request.args.get("t", "")[:30])
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
               f'<stop offset="0" stop-color="{escape(a)}"/><stop offset="1" stop-color="{escape(b)}"/></linearGradient></defs>'
               f'<rect width="600" height="600" fill="url(#g)"/><text x="300" y="350" font-size="250" text-anchor="middle">{escape(key)}</text>'
               f'<text x="300" y="550" font-size="32" font-family="Arial,sans-serif" font-weight="700" fill="#263238" text-anchor="middle">{title}</text></svg>')
        return Response(svg, mimetype="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})

    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"error": "Not found."}), 404

    @app.errorhandler(500)
    def server_error(_):
        db.session.rollback()
        return jsonify({"error": "Unexpected server error. Please try again."}), 500

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=os.environ.get("FLASK_DEBUG") == "1")
