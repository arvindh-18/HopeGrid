// Android app only: where the HopeGrid server is (src/lib/serverUrl.ts). Shown on first start when the app was built
// without VITE_SERVER_URL, and from the menu ("Server") to change it, e.g. after a new tunnel address.
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconCheck } from '../components/Icons';
import { Layout } from '../components/Layout';
import { Button, Field } from '../components/ui';
import { TUNNEL_HEADERS, normalizeServerUrl, serverUrl, setServerUrl } from '../lib/serverUrl';

type Check = { state: 'idle' } | { state: 'busy' } | { state: 'ok'; url: string } | { state: 'fail'; message: string };

export default function ServerSetup({ firstRun = false }: { firstRun?: boolean }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(serverUrl());
  const [check, setCheck] = useState<Check>({ state: 'idle' });

  async function save(e: FormEvent) {
    e.preventDefault();
    const url = normalizeServerUrl(value);
    if (!url) {
      setCheck({ state: 'fail', message: 'Enter the https address of the server, e.g. https://your-name.ngrok-free.dev' });
      return;
    }
    setCheck({ state: 'busy' });
    try {
      const res = await fetch(`${url}/api/public/incidents`, { headers: TUNNEL_HEADERS, signal: AbortSignal.timeout(15_000) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(body?.incidents)) throw new Error(`The address answered, but not like a HopeGrid server (${res.status}).`);
      setServerUrl(url);
      setCheck({ state: 'ok', url });
    } catch (err) {
      setCheck({ state: 'fail', message: err instanceof Error && err.message.startsWith('The address') ? err.message : "Can't reach a HopeGrid server at this address. Check it, and that the server and tunnel are running." });
    }
  }

  return (
    <Layout>
      <form onSubmit={save} className="mx-auto flex max-w-xl flex-col gap-5" noValidate>
        <header>
          <h1 className="t-title-lg">{firstRun ? 'Connect to your HopeGrid server' : 'Server'}</h1>
          <p className="mt-2 text-muted">
            The app talks to the laptop or computer that runs HopeGrid (<code>npm start</code>). Enter its https address, for example your ngrok address (<code>npm run tunnel:ngrok</code>).
          </p>
        </header>
        <section className="card card-pad flex flex-col gap-4">
          <Field label="Server address" htmlFor="server-url" hint="Only the start of the link is needed; anything after the domain is ignored.">
            <input id="server-url" className="input" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder="https://your-name.ngrok-free.dev" value={value} onChange={(e) => { setValue(e.target.value); setCheck({ state: 'idle' }); }} />
          </Field>
          <Button type="submit" busy={check.state === 'busy'}>Check and save</Button>
          {check.state === 'fail' && <p className="text-[14px] text-danger" role="alert">{check.message}</p>}
          {check.state === 'ok' && (
            <div className="flex flex-col gap-3" role="status">
              <p className="flex items-center gap-2 text-[15px] text-ink"><IconCheck size={18} /> Connected to {check.url}</p>
              <Button type="button" variant="outline" onClick={() => navigate('/', { replace: true })}>Continue</Button>
            </div>
          )}
        </section>
        {!firstRun && serverUrl() && <p className="t-caption">In use now: {serverUrl()}</p>}
      </form>
    </Layout>
  );
}
