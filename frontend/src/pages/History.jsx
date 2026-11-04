import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api';
import Icon from '../Icon.jsx';

const LABEL = { pending: 'No crash', countdown: 'Counting down', notified: 'Alert sent', cancelled: 'Cancelled', reviewed: 'Reviewed', dismissed: 'Dismissed' };
const TONE = { notified: 'red', countdown: 'amber', cancelled: 'grey', reviewed: 'grey', dismissed: 'grey', pending: 'green' };

export default function History() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/api/incidents').then((r) => setItems(r.data.items)).catch((x) => setErr(errMsg(x)));
  }, []);

  if (err) return <p className="msg bad" role="alert"><Icon n="alert" />{err}</p>;

  if (!items) {
    return (
      <div className="list" aria-busy="true">
        <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <section className="card empty">
        <span className="step"><Icon n="video" /></span>
        <h2>No videos checked yet</h2>
        <p className="muted">Checked videos and alerts will show up here.</p>
        <Link className="btn primary" to="/">Check a video</Link>
      </section>
    );
  }

  const crashes = items.filter((i) => i.collisionDetected).length;
  const alerts = items.filter((i) => i.status === 'notified').length;

  return (
    <>
      <div className="page-head">
        <h1>History</h1>
        <p>Every video you have checked and what happened.</p>
      </div>

      <div className="stats">
        <div className="stat"><b>{items.length}</b><span>Videos checked</span></div>
        <div className="stat"><b>{crashes}</b><span>Crashes found</span></div>
        <div className="stat"><b>{alerts}</b><span>Alerts sent</span></div>
      </div>

      <div className="list">
        {items.map((i) => {
          const tone = i.collisionDetected ? TONE[i.status] || 'grey' : 'green';
          return (
            <article key={i._id} className="item">
              <span className={`item-ico ${tone === 'red' ? 'red' : tone === 'green' ? '' : 'grey'}`}>
                <Icon n={i.collisionDetected ? 'alert' : 'check'} />
              </span>
              <div className="item-body">
                <strong>{i.originalName || 'Video'}</strong>
                <p className="muted small">{new Date(i.createdAt).toLocaleString()} · crash score {Math.round((i.confidence || 0) * 100)}%</p>
              </div>
              <div className="item-end">
                <span className={`chip ${tone}`}>{i.collisionDetected ? LABEL[i.status] : 'No crash'}</span>
                {i.trackingToken && <Link className="small" to={`/track/${i.trackingToken}`}>View tracking</Link>}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
