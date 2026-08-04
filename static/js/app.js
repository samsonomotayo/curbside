// Curbside frontend logic.
// Talks to the Flask API at /api/spots and renders everything on a Leaflet map.

const POLL_INTERVAL_MS = 4000;
const DEFAULT_CENTER = [40.7128, -74.006]; // New York City, used if geolocation fails

let map;
let userLat = null;
let userLng = null;
let markers = {}; // spot id -> Leaflet marker
let knownSpotIds = new Set(); // used to detect *new* spots for notifications

init();

async function init() {
  map = L.map("map", { zoomControl: false }).setView(DEFAULT_CENTER, 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  locateUser();
  wireUpUI();
  requestNotificationPermission();

  refreshSpots();
  setInterval(refreshSpots, POLL_INTERVAL_MS);
}

function locateUser() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      map.setView([userLat, userLng], 16);
      L.circleMarker([userLat, userLng], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 1,
      }).addTo(map).bindTooltip("You");
    },
    () => showToast("Couldn't get your location — showing NYC by default"),
    { enableHighAccuracy: true }
  );
}

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    // Ask lazily, not on page load in a real app — but fine for a prototype.
    Notification.requestPermission();
  }
}

// ---------------------------------------------------------------------------
// Fetching + rendering spots
// ---------------------------------------------------------------------------

async function refreshSpots() {
  const params = new URLSearchParams();
  if (userLat !== null) {
    params.set("lat", userLat);
    params.set("lng", userLng);
  }

  let spots;
  try {
    const res = await fetch(`/api/spots?${params.toString()}`);
    spots = await res.json();
  } catch (err) {
    console.error("Failed to fetch spots", err);
    return;
  }

  renderSpots(spots);
  updateLiveCount(spots.length);
  notifyAboutNewSpots(spots);
}

function renderSpots(spots) {
  const currentIds = new Set(spots.map((s) => s.id));

  // Remove markers for spots that vanished (claimed / expired)
  for (const id of Object.keys(markers)) {
    if (!currentIds.has(id)) {
      map.removeLayer(markers[id]);
      delete markers[id];
    }
  }

  // Add or update markers
  for (const spot of spots) {
    if (markers[spot.id]) {
      markers[spot.id].setPopupContent(popupHtml(spot));
      continue;
    }
    const icon = L.divIcon({
      className: "",
      html: `<div class="spot-pin ${spot.urgency}"><div class="ring"></div><div class="core"></div></div>`,
      iconSize: [26, 26],
    });
    const marker = L.marker([spot.lat, spot.lng], { icon }).addTo(map);
    marker.bindPopup(popupHtml(spot));
    marker.on("popupopen", () => wireClaimButton(spot.id));
    markers[spot.id] = marker;
  }
}

function popupHtml(spot) {
  const mins = Math.floor(spot.seconds_left / 60);
  const secs = spot.seconds_left % 60;
  const timeStr = `${mins}:${String(secs).padStart(2, "0")} left`;
  const distanceStr = spot.distance_m != null ? ` · ${spot.distance_m}m away` : "";
  const label = spot.urgency === "now" ? "Leaving right now" : "Leaving in a few minutes";

  return `
    <div class="popup-title">${label}</div>
    <div class="popup-timer">${timeStr}${distanceStr}</div>
    <button class="claim-btn" data-spot-id="${spot.id}">Claim this spot</button>
  `;
}

function wireClaimButton(spotId) {
  // Popup content is re-created each time, so re-attach the handler.
  document.querySelectorAll(`[data-spot-id="${spotId}"]`).forEach((btn) => {
    btn.onclick = () => claimSpot(spotId);
  });
}

async function claimSpot(spotId) {
  try {
    const res = await fetch(`/api/spots/${spotId}/claim`, { method: "POST" });
    if (res.ok) {
      showToast("Spot claimed — head over now!");
      if (markers[spotId]) {
        map.removeLayer(markers[spotId]);
        delete markers[spotId];
      }
    } else {
      const data = await res.json();
      showToast(data.error || "Someone beat you to it");
    }
  } catch (err) {
    showToast("Network error — try again");
  }
}

function updateLiveCount(count) {
  const el = document.getElementById("live-count-text");
  el.textContent = `${count} spot${count === 1 ? "" : "s"} nearby`;
}

function notifyAboutNewSpots(spots) {
  const newOnes = spots.filter((s) => !knownSpotIds.has(s.id));
  knownSpotIds = new Set(spots.map((s) => s.id));

  // Skip notifying on the very first load (everything looks "new" then)
  if (newOnes.length === 0 || !window.hasLoadedOnce) {
    window.hasLoadedOnce = true;
    return;
  }

  if ("Notification" in window && Notification.permission === "granted") {
    for (const spot of newOnes) {
      new Notification("Spot opening up nearby", {
        body: spot.urgency === "now" ? "Someone is leaving right now" : "Someone is leaving soon",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// "I'm leaving" flow
// ---------------------------------------------------------------------------

function wireUpUI() {
  const leavingBtn = document.getElementById("leaving-btn");
  const panel = document.getElementById("urgency-panel");
  const cancelBtn = document.getElementById("cancel-btn");

  leavingBtn.addEventListener("click", () => {
    leavingBtn.hidden = true;
    panel.hidden = false;
  });

  cancelBtn.addEventListener("click", () => {
    panel.hidden = true;
    leavingBtn.hidden = false;
  });

  document.querySelectorAll(".urgency-btn").forEach((btn) => {
    btn.addEventListener("click", () => submitSpot(btn.dataset.urgency));
  });
}

async function submitSpot(urgency) {
  if (userLat === null) {
    showToast("Waiting for your location — try again in a moment");
    return;
  }

  try {
    const res = await fetch("/api/spots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: userLat, lng: userLng, urgency }),
    });
    if (res.ok) {
      showToast("Pinned! Nearby drivers have been notified.");
    } else {
      showToast("Something went wrong pinning your spot");
    }
  } catch (err) {
    showToast("Network error — try again");
  }

  document.getElementById("urgency-panel").hidden = true;
  document.getElementById("leaving-btn").hidden = false;
  refreshSpots();
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastTimeout;
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 3000);
}
