# sqlite3 is Python's built-in library for talking to SQLite database files.
import sqlite3
# Path makes it easy to build file paths that work on any operating system.
from pathlib import Path
# Flask pieces we use:
#   Flask           - the web app itself
#   render_template - turns an HTML file in templates/ into a web page
#   jsonify         - turns Python lists/dicts into JSON the browser can read
#   request         - gives us access to data the browser sent us (e.g. JSON body)
from flask import Flask, render_template, jsonify, request

# Create the Flask app. __name__ tells Flask where to look for templates/static files.
app = Flask(__name__)

# The database file lives right next to this app.py file.
DB_PATH = Path(__file__).parent / "curbside.db"

# The only urgency values the frontend is allowed to send us.
VALID_URGENCIES = {"now", "soon"}


def init_db():
    """Create the spots table if it doesn't already exist."""
    # Open (or create) the database file.
    db = sqlite3.connect(DB_PATH)
    # Make the table. "IF NOT EXISTS" means this is safe to run every startup.
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS spots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,  -- unique number, auto-assigned
            lat REAL NOT NULL,                     -- latitude of the spot
            lng REAL NOT NULL,                     -- longitude of the spot
            urgency TEXT NOT NULL                  -- "now" or "soon"
        )
        """
    )
    # Save the change and close the connection.
    db.commit()
    db.close()


# When someone visits the home page ("/"), send them the map page.
@app.route("/")
def index():
    return render_template("index.html")


# GET /api/spots - the browser calls this every few seconds to get all spots.
@app.route("/api/spots")
def list_spots():
    # Open the database.
    db = sqlite3.connect(DB_PATH)
    # Row factory lets us read columns by name, like r["lat"], instead of r[1].
    db.row_factory = sqlite3.Row
    # Grab every spot in the table.
    rows = db.execute("SELECT * FROM spots").fetchall()
    db.close()

    # Turn each database row into a plain dict the browser can understand.
    # The id is sent as a string because the JavaScript keeps track of map
    # pins using string keys - a number would never match and pins would flicker.
    spots = [
        {"id": str(r["id"]), "lat": r["lat"], "lng": r["lng"], "urgency": r["urgency"]}
        for r in rows
    ]
    # Send the list back as JSON.
    return jsonify(spots)


# POST /api/spots - the browser calls this when someone taps "I'm leaving".
@app.route("/api/spots", methods=["POST"])
def create_spot():
    # Read the JSON the browser sent. silent=True returns None instead of
    # crashing if the body isn't valid JSON.
    data = request.get_json(silent=True)
    # If there was no JSON at all, tell the browser its request was bad (400).
    if data is None:
        return jsonify({"error": "Expected a JSON body"}), 400

    # Pull out the three fields we need. .get() returns None if one is missing.
    lat = data.get("lat")
    lng = data.get("lng")
    urgency = data.get("urgency")

    # Make sure lat and lng are actual numbers (not missing, not text).
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return jsonify({"error": "lat and lng must be numbers"}), 400
    # Make sure urgency is one of the values we expect.
    if urgency not in VALID_URGENCIES:
        return jsonify({"error": "urgency must be 'now' or 'soon'"}), 400

    # Save the new spot. The ? placeholders let sqlite3 safely insert the values,
    # which protects against SQL injection (never build SQL with f-strings!).
    db = sqlite3.connect(DB_PATH)
    cur = db.execute(
        "INSERT INTO spots (lat, lng, urgency) VALUES (?, ?, ?)",
        (lat, lng, urgency),
    )
    db.commit()
    # lastrowid is the id SQLite just assigned to the new row.
    new_id = cur.lastrowid
    db.close()

    # Send back the new spot. 201 means "Created".
    return jsonify({"id": str(new_id), "lat": lat, "lng": lng, "urgency": urgency}), 201


# This only runs when you start the app with "python app.py".
if __name__ == "__main__":
    # Make sure the database table exists before we start serving requests.
    init_db()
    # Start the development server. debug=True auto-reloads when you edit code.
    app.run(debug=True)
