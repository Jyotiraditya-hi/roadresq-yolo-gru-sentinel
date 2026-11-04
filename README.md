# ROADRESQ SENTINEL: YOLO + GRU Accident Detection and Emergency Alert System

**Research and college prototype:** an end-to-end pipeline that:

* Detects vehicles in an uploaded video with YOLO,
* Judges the sequence of frames with a GRU to decide whether a collision happened,
* Starts a cancel countdown so false alarms can be stopped,
* Alerts the driver's family and the nearest police station by SMS with the live location,
* Stores every incident for later review.

This repository provides a Node.js backend and a Python inference service that work together. The Python service runs the YOLO + GRU model, and the backend handles users, trips, incidents and alerts.

## Key Ideas and Innovation

* ✅ **Temporal crash detection:** YOLO finds the vehicles in each frame, and a GRU reads the sequence of frame features so a crash is judged over time, not from a single frame.
* ✅ **Impact frame and snapshot:** the service returns the frame where the impact happened, the vehicles involved and a confidence score.
* ✅ **Cancel countdown:** a detected crash does not alert anyone immediately. The driver gets a short window to cancel a false alarm.
* ✅ **Family alert first:** the driver's additional phone and every saved family contact receive an SMS with the car number, driver phone, Google Maps link and a live tracking link.
* ✅ **Nearest authority lookup:** the nearest police or highway police station is found through the Overpass API (OpenStreetMap), searching in widening radii of 10, 25 and 50 km.
* ✅ **Resilient alerting:** several Overpass mirror servers are queried at once, each step has its own error handling, and a fallback authority number is used if the lookup fails.
* ✅ **Live trip tracking:** the newest location from the user's active trip is attached to the incident, with a tracking token for a shareable live-track page.
* ✅ **Restart-safe countdowns:** pending alerts are re-scheduled when the server restarts.
* ✅ **Incident logging:** each incident stores the detection result, location, status and the outcome of the alert (`smsSent`, `familyNotified`, `error`).

## How It Works

```
Client (app / Postman)
   |  POST /api/analyze   (multipart/form-data, field "video")
   v
Node.js + Express backend (port 5000)
   |  saves the video temporarily and forwards it
   v
Python FastAPI service (port 8000)
   |  YOLO detects vehicles -> GRU classifies the sequence
   |  returns collision_detected, confidence, impact_frame, vehicles_involved, snapshot_url
   v
Node backend
   |  saves the incident in MongoDB Atlas
   |  starts the cancel countdown
   |  after the countdown: SMS to family + nearest police station
   v
Family and authority receive the alert with the location
```

## Tech Stack

| Part | Technology |
|---|---|
| Backend API | Node.js, Express, Mongoose, JWT, bcrypt, multer |
| Database | MongoDB Atlas |
| Detection service | Python, FastAPI, Uvicorn, Ultralytics YOLO, PyTorch (GRU), OpenCV |
| Authority lookup | Overpass API on OpenStreetMap data |

## Repository Structure

A minimal layout for this project:

```
.
├── backend/
│   ├── src/
│   │   ├── db/                  # MongoDB connection
│   │   ├── middlewares/         # JWT auth middleware
│   │   ├── models/              # User, Trip, Incident
│   │   ├── routes/              # auth, trips, analyze, incidents, track
│   │   ├── utils/
│   │   │   ├── notify.js              # countdown + alert logic
│   │   │   ├── findNearestAuthority.js # Overpass lookup
│   │   │   ├── sendSms.js             # SMS provider
│   │   │   └── alertMessage.js        # alert text
│   │   ├── app.js
│   │   ├── constants.js
│   │   └── index.js
│   ├── uploads/                 # temporary videos (only .gitkeep is tracked)
│   └── package.json
├── interference-service/
│   ├── server.py                # FastAPI app, POST /analyze
│   ├── detector.py              # YOLO detection
│   ├── roadresq_core.py         # GRU collision logic
│   ├── config.json
│   ├── requirements.txt
│   ├── models/                  # YOLO and GRU weights (not tracked)
│   └── snapshots/               # impact frame images saved at runtime (images not tracked)
├── .gitignore
└── README.md
```
