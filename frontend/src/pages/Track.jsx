import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { API, errMsg } from '../api';
import Icon from '../Icon.jsx';

// Public page opened from the SMS link. No login needed.
export default function Track() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let stop = false;
    const load = () =>
      api.get(`/api/track/${token}`).then((r) => !stop && (setD(r.data), setErr(''))).catch((x) => !stop && setErr(errMsg(x)));
    load();
    const t = setInterval(load, 5000); // refresh every 5 seconds
    return () => { stop = true; clearInterval(t); };
  }, [token]);

  const loc = d?.location;
  const map = loc && `https://www.openstreetmap.org/export/embed.html?bbox=${loc.lng - 0.01},${loc.lat - 0.006},${loc.lng + 0.01},${loc.lat + 0.006}&layer=mapnik&marker=${loc.lat},${loc.lng}`;

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <span className="brand">
            <span className="brand-mark"><Icon n="shield" /></span>
            <span>Road<b>ResQ</b></span>
          </span>
          <span className="topbar-note"><span className="pulse" style={{ background: 'var(--green)' }} />Live tracking</span>
        </div>
      </header>

      <main className="page" style={{ maxWidth: 720 }}>
        {err && <p className="msg bad" role="alert"><Icon n="alert" />{err}</p>}
        {!d && !err && <div className="list" aria-busy="true"><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 220 }} /></div>}

        {d && (
          <>
            <section className="banner" role="alert">
              <span className="tag"><Icon n="alert" />Emergency · possible crash</span>
              <h1>{d.carNo} may have been in a crash</h1>
              <p>Try calling the driver first. If there is no answer, contact emergency services (112).</p>
              <div className="btn-row two" style={{ marginTop: '.5rem' }}>
                <a className="btn block" href={`tel:${d.driverPhone}`}><Icon n="phone" />Call the driver</a>
                <a className="btn block" href="tel:112"><Icon n="phone" />Call 112</a>
              </div>
            </section>

            <section className="card">
              <h2>Details</h2>
              <dl className="facts">
                <div><dt><Icon n="car" />Car number</dt><dd>{d.carNo}</dd></div>
                <div><dt><Icon n="phone" />Driver phone</dt><dd><a href={`tel:${d.driverPhone}`}>{d.driverPhone}</a></dd></div>
                <div><dt><Icon n="clock" />Detected</dt><dd>{new Date(d.detectedAt).toLocaleString()}</dd></div>
              </dl>
            </section>

            {loc ? (
              <section className="card">
                <div className="card-head">
                  <span className="step"><Icon n="pin" /></span>
                  <h2>Last known location</h2>
                </div>
                <span className="updated"><Icon n="clock" />Updated {loc.ageSeconds != null ? `${loc.ageSeconds} seconds ago` : 'recently'} · refreshes every 5 seconds</span>
                <iframe className="map" title="Map of the last known location" src={map} loading="lazy" />
                <a className="btn primary block" href={`https://maps.google.com/?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer"><Icon n="ext" />Open in Google Maps</a>
              </section>
            ) : (
              <p className="msg bad"><Icon n="alert" />No location was shared for this crash.</p>
            )}

            {d.snapshotUrl && (
              <section className="card">
                <h2>Frame from the video</h2>
                <img className="snap" src={`${API}${d.snapshotUrl}`} alt="Frame where the crash was detected" />
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
