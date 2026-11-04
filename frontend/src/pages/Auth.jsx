import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api';
import Icon from '../Icon.jsx';

const empty = { name: '', phoneNumber: '', additionalPhone: '', carNo: '', password: '', consentToShare: false };

export default function Auth() {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState(empty);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const nav = useNavigate();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const signup = mode === 'signup';

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const body = signup ? f : { phoneNumber: f.phoneNumber, password: f.password };
      const { data } = await api.post(`/api/auth/${mode}`, body);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      nav('/');
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-side">
        <a className="brand" href="/login">
          <span className="brand-mark"><Icon n="shield" /></span>
          <span>Road<b>ResQ</b></span>
        </a>
        <div className="auth-copy">
          <h1>If you crash, someone knows within a minute.</h1>
          <p>RoadResQ checks your dashcam video for a collision, then alerts your family and the nearest police station.</p>
          <ul className="feats">
            <li><span className="fi"><Icon n="video" /></span><div><b>Automatic crash detection</b><span>Upload dashcam footage and get a result in about a minute.</span></div></li>
            <li><span className="fi"><Icon n="bell" /></span><div><b>Instant alerts</b><span>Family and the nearest authority get an SMS with a live link.</span></div></li>
            <li><span className="fi"><Icon n="pin" /></span><div><b>Live location</b><span>Responders see your last known position on a map.</span></div></li>
          </ul>
        </div>
        <span className="small" style={{ opacity: .7 }}>Built for safer roads in India · Emergency number 112</span>
      </aside>

      <section className="auth-main">
        <form className="auth-form" onSubmit={submit}>
          <div className="head">
            <h2 style={{ fontSize: '1.6rem' }}>{signup ? 'Create your account' : 'Welcome back'}</h2>
            <p>{signup ? 'It takes less than a minute.' : 'Log in to start a trip or check a video.'}</p>
          </div>

          {signup && (
            <div className="field">
              <label htmlFor="name">Full name</label>
              <input id="name" className="input" value={f.name} onChange={set('name')} required autoComplete="name" />
            </div>
          )}

          <div className="field">
            <label htmlFor="phone">Phone number</label>
            <input id="phone" className="input" type="tel" inputMode="numeric" placeholder="10-digit mobile" value={f.phoneNumber} onChange={set('phoneNumber')} required autoComplete="tel" />
          </div>

          {signup && (
            <div className="two-col">
              <div className="field">
                <label htmlFor="fam">Family phone number</label>
                <input id="fam" className="input" type="tel" inputMode="numeric" placeholder="Gets the alert SMS" value={f.additionalPhone} onChange={set('additionalPhone')} />
              </div>
              <div className="field">
                <label htmlFor="car">Car number</label>
                <input id="car" className="input" placeholder="MH12AB1234" value={f.carNo} onChange={set('carNo')} required />
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="pw">Password</label>
            <div className="pw">
              <input id="pw" className="input" type={show ? 'text' : 'password'} minLength={6} value={f.password} onChange={set('password')} required autoComplete={signup ? 'new-password' : 'current-password'} />
              <button type="button" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
            </div>
            {signup && <span className="hint">At least 6 characters.</span>}
          </div>

          {signup && (
            <label className="consent">
              <input type="checkbox" checked={f.consentToShare} onChange={set('consentToShare')} />
              <span>I agree that my phone number, car number and location are shared with my family and the police if a crash is detected.</span>
            </label>
          )}

          {err && <p className="msg bad" role="alert"><Icon n="alert" />{err}</p>}

          <button className="btn primary block" disabled={busy || (signup && !f.consentToShare)}>
            {busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
          </button>

          <p className="switch">
            {signup ? 'Already have an account?' : 'New to RoadResQ?'}{' '}
            <button type="button" className="link-btn" onClick={() => { setMode(signup ? 'login' : 'signup'); setErr(''); }}>
              {signup ? 'Log in' : 'Create an account'}
            </button>
          </p>
        </form>
      </section>
    </div>
  );
}
