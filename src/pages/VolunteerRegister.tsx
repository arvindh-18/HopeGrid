// Volunteer registration (features.md F26): anyone can apply with their details, skills, equipment and a photo of an
// ID proof. A coordinator checks the application; only then can the person log in as a volunteer.
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MIN_PASSWORD_LENGTH, PHONE_MAX_DIGITS, PHONE_MIN_DIGITS } from '../../shared/constants';
import { ApiError, EQUIPMENT, SKILLS, VEHICLES, type Equipment, type Skill, type Vehicle } from '../../shared/types';
import { IconCamera, IconCheck, IconPin, IconTrash } from '../components/Icons';
import { Layout } from '../components/Layout';
import { Button, Field, Spinner } from '../components/ui';
import { api } from '../data';
import { getPosition, type Position } from '../lib/geo';
import { EQUIPMENT_LABEL, SKILL_LABEL, VEHICLE_LABEL } from '../lib/labels';
import { compressImage, toDataUrl } from '../lib/media';

const PHONE_RE = new RegExp(`^\\+?\\d{${PHONE_MIN_DIGITS},${PHONE_MAX_DIGITS}}$`);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

export default function VolunteerRegister() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle>('NONE');
  const [locationText, setLocationText] = useState('');
  const [pos, setPos] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [proof, setProof] = useState<string | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const problems = [
    name.trim().length < 2 && 'your full name',
    !EMAIL_RE.test(email.trim()) && 'a valid email',
    !PHONE_RE.test(phone.replace(/\s+/g, '')) && 'a phone number',
    password.length < MIN_PASSWORD_LENGTH && `a password of at least ${MIN_PASSWORD_LENGTH} characters`,
    skills.length === 0 && 'at least one skill',
    !proof && 'a photo of your ID proof',
    !consent && 'your agreement below',
  ].filter(Boolean) as string[];

  function locate() {
    setLocating(true);
    getPosition().then(setPos).catch(() => setPos(null)).finally(() => setLocating(false));
  }

  async function onProof(file: File | undefined) {
    if (!file) return;
    setProofBusy(true);
    setError(null);
    try {
      setProof(await compressImage(file)); // resized JPEG; also strips hidden location data
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use this photo.');
    } finally {
      setProofBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (problems.length) return;
    setBusy(true);
    setError(null);
    try {
      await api.applyAsVolunteer({
        name: name.trim(), email: email.trim(), phone: phone.replace(/\s+/g, ''), password, skills, equipment, vehicle,
        lat: pos?.lat ?? null, lng: pos?.lng ?? null, locationText: locationText.trim() || null, proofBase64: proof!,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your application. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Layout>
        <div className="mx-auto flex max-w-xl flex-col gap-5">
          <div className="card card-pad flex flex-col gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-lime text-ink"><IconCheck /></span>
            <h1 className="t-title-lg">Application received</h1>
            <p className="text-body">Thank you, {name.trim().split(' ')[0]}. A coordinator will check your details and ID proof. Once you're approved you can log in with <b>{email.trim()}</b> and the password you chose.</p>
            <p className="t-caption">Until then, logging in shows "waiting for approval". Your ID proof is only seen by coordinators.</p>
            <Link to="/" className="btn btn-outline self-start">Back to home</Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <form onSubmit={submit} className="mx-auto flex max-w-xl flex-col gap-5" noValidate>
        <header>
          <h1 className="t-title-lg">Register as a volunteer</h1>
          <p className="mt-2 text-muted">Tell us who you are and how you can help. A coordinator checks every application before you can log in and receive assignments.</p>
        </header>

        <section className="card card-pad flex flex-col gap-4" aria-labelledby="v-about">
          <h2 id="v-about" className="t-title-sm">About you</h2>
          <Field label="Full name" htmlFor="v-name"><input id="v-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
          <Field label="Phone number" htmlFor="v-phone" hint="Coordinators use it to reach you, e.g. on WhatsApp. Never shown to people who report."><input id="v-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98400 00000" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Email (your login)" htmlFor="v-email"><input id="v-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password" htmlFor="v-pass" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}><input id="v-pass" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        </section>

        <section className="card card-pad flex flex-col gap-3" aria-labelledby="v-skills">
          <h2 id="v-skills" className="t-title-sm">Skills</h2>
          <div className="flex flex-wrap gap-2">{SKILLS.map((s) => <button key={s} type="button" className="chip" aria-pressed={skills.includes(s)} onClick={() => setSkills(toggle(skills, s))}>{SKILL_LABEL[s]}</button>)}</div>
          <h2 className="t-title-sm mt-2">Equipment you have</h2>
          <div className="flex flex-wrap gap-2">{EQUIPMENT.map((q) => <button key={q} type="button" className="chip" aria-pressed={equipment.includes(q)} onClick={() => setEquipment(toggle(equipment, q))}>{EQUIPMENT_LABEL[q]}</button>)}</div>
          <Field label="Vehicle" htmlFor="v-vehicle">
            <select id="v-vehicle" className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value as Vehicle)}>
              {VEHICLES.map((v) => <option key={v} value={v}>{VEHICLE_LABEL[v]}</option>)}
            </select>
          </Field>
          <p className="t-caption">You can change skills and equipment later from your volunteer page.</p>
        </section>

        <section className="card card-pad flex flex-col gap-3" aria-labelledby="v-where">
          <h2 id="v-where" className="t-title-sm">Where you usually are <span className="font-sans text-[15px] font-normal text-muted">(optional)</span></h2>
          <p className="t-caption">Helps match you with incidents nearby.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-outline btn-sm" onClick={locate} disabled={locating}>
              {locating ? <Spinner size={14} /> : <IconPin size={16} />} {pos ? 'Location captured' : 'Use my current location'}
            </button>
          </div>
          <Field label="Area" htmlFor="v-area"><input id="v-area" className="input" placeholder="e.g. Anna Nagar" value={locationText} onChange={(e) => setLocationText(e.target.value)} maxLength={200} /></Field>
        </section>

        <section className="card card-pad flex flex-col gap-3" aria-labelledby="v-proof">
          <h2 id="v-proof" className="t-title-sm">ID proof</h2>
          <p className="t-caption">A clear photo of a government ID (e.g. Aadhaar, voter ID, driving licence) or a volunteer/NGO card. Only coordinators can see it.</p>
          {proof ? (
            <div className="relative overflow-hidden rounded-[12px]">
              <img src={toDataUrl(proof, 'image/jpeg')} alt="Your ID proof" className="max-h-60 w-full object-contain bg-canvas" />
              <button type="button" onClick={() => setProof(null)} className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] shadow"><IconTrash size={14} /> Remove</button>
            </div>
          ) : (
            <>
              <input ref={fileRef} id="v-proof-file" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onProof(e.target.files?.[0])} />
              <label htmlFor="v-proof-file" className="btn btn-outline cursor-pointer self-start">
                {proofBusy ? <Spinner size={16} /> : <IconCamera size={18} />} Take or choose a photo
              </label>
            </>
          )}
          <label className="mt-2 flex items-start gap-2 t-body-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-black" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I agree that coordinators may check my ID proof and contact me about assignments.
          </label>
        </section>

        {error && <p className="text-[14px] text-danger" role="alert">{error}</p>}
        {problems.length > 0 && (
          <p className={`t-body-sm ${tried ? 'text-danger' : 'text-muted'}`} role={tried ? 'alert' : undefined}>To send, add {problems.join(', ')}.</p>
        )}
        <Button type="submit" size="lg" block busy={busy} aria-disabled={problems.length > 0}>Send application</Button>
        <p className="t-caption">Already approved? <Link to="/login" className="text-ink">Log in</Link></p>
      </form>
    </Layout>
  );
}
