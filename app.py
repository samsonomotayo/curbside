import sqlite3
from pathlib import Path
from flask import Flask, render_template, jsonify

app = Flask(__name__)

DB_PATH = Path(__file__).parent / "curbside.db"


def init_db():
    """Create the spots table if it doesn't already exist."""
    db = sqlite3.connect(DB_PATH)
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS spots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            urgency TEXT NOT NULL
        )
        """
    )
    db.commit()
    db.close()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/spots")
def list_spots():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    rows = db.execute("SELECT * FROM spots").fetchall()
    db.close()

    spots = [{"lat": r["lat"], "lng": r["lng"], "urgency": r["urgency"]} for r in rows]
    return jsonify(spots)


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
