# Curbside

A crowdsourced parking app: when you're leaving a spot, you pin it on the map
so nearby drivers get notified in real time.

## What's here (v0 prototype)

- **`app.py`** — Flask backend. Stores spots in a local SQLite file
  (`curbside.db`, created automatically on first run). Handles creating,
  listing, and claiming spots, and auto-expires them after 5 minutes.
- **`templates/index.html`** — the single page of the app.
- **`static/js/app.js`** — map rendering (Leaflet + OpenStreetMap, no API key
  needed), geolocation, polling the backend every 4 seconds, and the
  "I'm leaving" flow.
- **`static/css/style.css`** — the visual design (dark asphalt theme, amber
  "live" pins with a radar-ping animation).

## Running it locally

```bash
cd curbside
pip install -r requirements.txt
python app.py
```

Then open **http://localhost:5000** in your browser. Your browser will ask
for location permission — allow it, since the app centers the map on you.

To test the "notify nearby people" flow with just one computer: open the app
in two browser tabs (or your phone + laptop on the same wifi network, using
your computer's local IP instead of `localhost`). Drop a spot in one tab and
watch it appear in the other within a few seconds.

## How the pieces fit together

1. You tap **"I'm leaving my spot"** → choose how soon → the browser sends
   your GPS coordinates to `POST /api/spots`.
2. Every device polls `GET /api/spots` every 4 seconds. Any new spot shows up
   as a pulsing pin, and triggers a browser notification if you've granted
   permission.
3. Whoever taps **"Claim this spot"** first sends `POST /api/spots/<id>/claim`.
   The backend only lets the *first* claim through — everyone else gets a
   "someone beat you to it" message, and the pin disappears for both.
4. Spots nobody claims quietly expire after 5 minutes so the map doesn't fill
   with stale pins.

## Next steps, roughly in order of "worth doing next"

1. **Test it with a friend** — have someone else on your wifi pin a spot and
   watch it show up on your screen. This proves the core loop works before
   you invest more time.
2. **Real-time instead of polling** — swap the 4-second polling loop for
   WebSockets (Flask-SocketIO is the easiest add-on) so spots feel instant.
3. **User accounts** — right now anyone can claim anything anonymously. Even
   a lightweight login (email + password, or "sign in with Google") adds
   accountability and lets you rate-limit spam pins.
4. **Deploy it somewhere real** — Render or Railway both have free tiers and
   work well with Flask + SQLite (or upgrade to their free Postgres).
5. **Turn it into an installable app (PWA)** — add a `manifest.json` and a
   service worker so people can "Add to Home Screen" and it behaves like a
   native app icon, with offline caching for the map shell.
6. **When you outgrow the web app** — wrap this same Flask backend with a
   Flutter or React Native front end for true native GPS/push notification
   quality. You won't need to rewrite the backend, just the UI layer.

## Known limitations (fine for a prototype, worth fixing before real users)

- No auth — anyone can create or claim spots.
- No protection against someone spamming fake pins.
- SQLite isn't great for multiple simultaneous writers at scale — fine for
  testing with a handful of users, not for a citywide launch.
