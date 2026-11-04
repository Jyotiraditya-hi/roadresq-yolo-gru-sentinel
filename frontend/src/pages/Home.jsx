import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { API, errMsg } from '../api';
import Icon from '../Icon.jsx';

const fmtDist = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
const R = 74;
const CIRC = 2 * Math.PI * R;

export default function Home() {
  const [tripId, setTripId] = useState(null);
  const [pos, setPos] = useState(null);
  const [geoErr, setGeoErr] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [inc, setInc] = useState(null);
  const [left, setLeft] = useState(0);
  const watchId = useRef(null);
  const tripRef = useRef(null);
  const lastSent = useRef(0);

  // ---- trip: send the phone's location every ~8 seconds ----
  function onPosition(p) {
    const here = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
    setPos(here);
    if (tripRef.current && Date.now() - lastSent.current > 8000) {
      lastSent.current = Date.now();
      api.post(`/api/trips/${tripRef.current}/location`, here).catch(() => {});
    }
  }

  function startTrip() {
    setGeoErr('');
    if (!navigator.geolocation) return setGeoErr('This browser cannot share location.');
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          const { latitude: lat, longitude: lng } = p.coords;
          const { data } = await api.post('/api/trips/start', { lat, lng });
          tripRef.current = data._id;
          setTripId(data._id);
          setPos({ lat, lng });
          watchId.current = navigator.geolocation.watchPosition(onPosition, () => {}, { enableHighAccuracy: true });
        } catch (x) {
          setGeoErr(errMsg(x));
        }
      },
      () => setGeoErr('Location is blocked. Allow location for this site, then try again.'),
      { enableHighAccuracy: true }
    );
  }

  async function endTrip() {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    try { await api.post(`/api/trips/${tripRef.current}/end`); } catch { /* already closed */ }
    tripRef.current = null;
    setTripId(null);
  }

  useEffect(() => () => watchId.current != null && navigator.geolocation.clearWatch(watchId.current), []);

  // ---- upload a video for analysis ----
  async function analyze(e) {
    e.preventDefault();
    if (!file) return;
    setErr('');
    setInc(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('video', file);
      if (pos) { fd.append('lat', pos.lat); fd.append('lng', pos.lng); }
      const { data } = await api.post('/api/analyze', fd, { timeout: 5 * 60 * 1000 });
      setInc(data);
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  }

  // ---- countdown, then follow the alert status ----
  useEffect(() => {
    if (!inc || inc.status !== 'countdown') return;
    const tick = setInterval(async () => {
      const secs = Math.ceil((new Date(inc.alertAt) - Date.now()) / 1000);
      setLeft(Math.max(secs, 0));
      if (secs <= 0) {
        try { const { data } = await api.get(`/api/incidents/${inc._id}`); setInc(data); } catch { /* retry next tick */ }
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [inc]);

  async function cancel() {
    try { const { data } = await api.post(`/api/incidents/${inc._id}/cancel`); setInc(data); }
    catch (x) { setErr(errMsg(x)); }
  }

  const r = inc?.alertResult;
  const noPolice = r && !r.smsSent;
  const dist = r?.authorityDistanceKm != null ? ` · ${fmtDist(r.authorityDistanceKm)} away` : '';
  const total = inc?.cancelWithinSeconds || 30;
  const shown = left || inc?.cancelWithinSeconds || 0;
  const progress = Math.min(Math.max(shown / total, 0), 1);

  return (
    <>
      {/* Crash countdown is the most important thing: show it first */}
      {inc?.status === 'countdown' && (
        <section className="card alarm" role="alert" aria-live="assertive">
          <span className="tag"><Icon n="alert" />Crash detected</span>
          <h2>Alerting your family and the police</h2>
          <div className="ring">
            <svg viewBox="0 0 168 168" aria-hidden="true">
              <circle className="track" cx="84" cy="84" r={R} />
              <circle className="bar" cx="84" cy="84" r={R} strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progress)} />
            </svg>
            <div className="num"><span>{shown}</span><small>seconds</small></div>
          </div>
          <p className="muted">If you are safe, cancel now. Otherwise help is on the way.</p>
          <div className="btn-row">
            <button className="btn safe block" onClick={cancel}><Icon n="check" />I’m safe, cancel the alert</button>
            <a className="btn danger block" href="tel:112"><Icon n="phone" />Call 112 now</a>
          </div>
        </section>
      )}

      <div className="grid-2">
        {/* 1. Trip */}
        <section className="card">
          <div className="card-head">
            <span className="step"><Icon n="pin" /></span>
            <h2>1. Your trip</h2>
          </div>
          <div className={`status ${tripId ? 'live' : ''}`}>
            <span className="pulse" />
            <div>
              <strong>{tripId ? 'Sharing your location' : 'Trip not started'}</strong>
              <span className="sub">{tripId && pos ? `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}` : 'Start a trip so family and police can find you.'}</span>
            </div>
          </div>
          {!tripId
            ? <button className="btn primary block" onClick={startTrip}><Icon n="route" />Start trip</button>
            : <button className="btn block" onClick={endTrip}><Icon n="x" />End trip</button>}
          {geoErr && <p className="msg bad" role="alert"><Icon n="alert" />{geoErr}</p>}
        </section>

        {/* 2. Video */}
        <section className="card">
          <div className="card-head">
            <span className="step"><Icon n="video" /></span>
            <h2>2. Check a video</h2>
          </div>
          <form onSubmit={analyze} style={{ display: 'grid', gap: '1rem' }}>
            <label className={`drop ${file ? 'has' : ''}`}>
              <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files[0])} />
              <Icon n="upload" />
              <strong>{file ? file.name : 'Choose a dashcam video'}</strong>
              <span>{file ? 'Tap to choose a different file' : 'MP4 or any video file'}</span>
            </label>
            <button className="btn primary block" disabled={!file || busy}>
              {busy ? 'Checking video…' : 'Check for a crash'}
            </button>
          </form>
          {busy && <><div className="progress" aria-hidden /><p className="muted small">This can take up to a minute. Keep this page open.</p></>}
          {err && <p className="msg bad" role="alert"><Icon n="alert" />{err}</p>}
          {!tripId && !inc && !busy && <p className="msg info small"><Icon n="info" />No trip running. The alert will use the location you allow on this page, if any.</p>}
        </section>
      </div>

      {inc && !inc.collisionDetected && (
        <section className="card result ok">
          <span className="result-ico"><Icon n="check" /></span>
          <div>
            <h2>No crash found</h2>
            <p>The video looks normal (crash score {Math.round((inc.confidence || 0) * 100)}%). Nobody was alerted.</p>
          </div>
        </section>
      )}

      {inc?.status === 'cancelled' && (
        <section className="card result ok">
          <span className="result-ico"><Icon n="check" /></span>
          <div><h2>Alert cancelled</h2><p>Nobody was contacted. Drive safe.</p></div>
        </section>
      )}

      {inc?.status === 'notified' && (
        <section className="card result sent">
          <span className="result-ico"><Icon n="bell" /></span>
          <div style={{ display: 'grid', gap: '1rem', flex: 1 }}>
            <div>
              <h2>Alert sent</h2>
              <ul className="checks">
                <li className={r?.familyNotified ? '' : 'off'}>
                  <Icon n={r?.familyNotified ? 'check' : 'x'} />
                  {r?.familyNotified ? `${r.familyNotified} family contact(s) texted` : 'No family contact was texted'}
                </li>
                <li className={r?.smsSent ? '' : 'off'}>
                  <Icon n={r?.smsSent ? 'check' : 'x'} />
                  {r?.smsSent ? `Alerted: ${r.authorityName}${dist}` : r?.authorityName ? `Nearest: ${r.authorityName}${dist} (not texted)` : 'No police station or authority could be reached'}
                </li>
              </ul>
            </div>
            <div className="btn-row two">
              {noPolice && <a className="btn danger" href="tel:1033"><Icon n="phone" />NHAI helpline 1033</a>}
              {noPolice && <a className="btn danger" href="tel:112"><Icon n="phone" />Call 112 now</a>}
              <Link className="btn" to={`/track/${inc.trackingToken}`}><Icon n="pin" />Open live tracking</Link>
            </div>
          </div>
        </section>
      )}

      {inc?.snapshotUrl && (
        <section className="card">
          <div className="card-head"><span className="step"><Icon n="video" /></span><h2>What the camera saw</h2></div>
          <img className="snap" src={`${API}${inc.snapshotUrl}`} alt="Frame from the video where the crash was detected" />
        </section>
      )}
    </>
  );
}
