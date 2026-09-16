import { useState } from 'react';
import { getWorkerUrl, setWorkerUrl } from '../lib/storage';

export default function Settings() {
  const [url, setUrl] = useState(getWorkerUrl());
  const [saved, setSaved] = useState(false);

  function save() {
    setWorkerUrl(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div>
      <h1>Settings</h1>
      <section className="panel">
        <h3>Cloudflare Worker URL</h3>
        <p className="muted">
          Needed for cross-device sync and AI trade suggestions. Without it, everything still works
          on this device using local storage, but trade suggestions and multi-device sync are disabled.
        </p>
        <div className="form-row">
          <input
            style={{ flex: 1 }}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://fantasy-manager-worker.your-subdomain.workers.dev"
          />
          <button className="btn-primary" onClick={save}>Save</button>
        </div>
        {saved && <p className="muted">Saved.</p>}
      </section>
    </div>
  );
}
