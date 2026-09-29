// S06 Staff login — seeded admin and volunteer accounts (features.md F11).
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD, DEMO_VOLUNTEER_EMAIL } from '../../shared/constants';
import { ApiError } from '../../shared/types';
import { Layout } from '../components/Layout';
import { Button, Field } from '../components/ui';
import { homeFor, useAuth } from '../hooks/useAuth';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user)} replace />;

  function fill(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const u = await login(email, password);
      const target = from && from.startsWith(u.role === 'ADMIN' ? '/admin' : '/volunteer') ? from : homeFor(u);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in.');
      setBusy(false);
    }
  }

  return (
    <Layout>
      <div className="mx-auto grid max-w-4xl gap-10 py-4 md:grid-cols-[1fr_420px] md:items-start md:py-10">
        <div>
          <h1 className="t-display max-w-[12ch]">Coordinators and volunteers</h1>
          <p className="mt-4 max-w-[40ch] text-[17px] text-body">Log in to review incoming reports, assign help and update your response.</p>
          <p className="mt-6 t-caption">Reporting an emergency never needs an account.</p>
        </div>
        <form onSubmit={submit} className="card card-pad flex flex-col gap-4" noValidate>
          <h2 className="t-title-md">Log in</h2>
          <Field label="Email" htmlFor="email">
            <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} />
          </Field>
          <Field label="Password" htmlFor="password">
            <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} />
          </Field>
          {error && <p className="text-[14px] text-danger" role="alert">{error}</p>}
          <Button type="submit" size="lg" busy={busy}>Log in</Button>
          {import.meta.env.DEV && (
            <div className="flex flex-wrap gap-2 border-t border-hairline pt-4">
              <button type="button" className="chip" onClick={() => fill(DEMO_ADMIN_EMAIL)}>Demo: Admin</button>
              <button type="button" className="chip" onClick={() => fill(DEMO_VOLUNTEER_EMAIL)}>Demo: Volunteer (Ravi)</button>
            </div>
          )}
        </form>
      </div>
    </Layout>
  );
}
