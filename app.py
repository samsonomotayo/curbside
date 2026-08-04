from flask import Flask, render_template, jsonify

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/spots")
def list_spots():
    fake_spots = [
        {"lat": 40.7128, "lng": -74.006, "urgency": "now"},
        {"lat": 40.7148, "lng": -74.008, "urgency": "soon"},
    ]
    return jsonify(fake_spots)

app.run(debug=True)
