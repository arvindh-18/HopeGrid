// S02 Report — works fully offline (AR-25): no map tiles, no network calls on this page.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MIN_REPORT_TEXT, PHONE_MAX_DIGITS, PHONE_MIN_DIGITS } from '../../shared/constants';
import { NEEDS, type Need, type ReportSubmission } from '../../shared/types';
import { IconCamera, IconPin, IconTrash } from '../components/Icons';
import { Layout } from '../components/Layout';
import { Button, Field, Spinner, useToast } from '../components/ui';
import { VoiceRecorder, type VoiceNote } from '../components/VoiceRecorder';
import { useLiveDictation } from '../hooks/useLiveDictation';
import { newPin, newReportCode, newUuid } from '../lib/codes';
import { getPosition, type Position } from '../lib/geo';
import { NEED_LABEL, PEOPLE_CHOICES } from '../lib/labels';
import { compressImage, toDataUrl } from '../lib/media';
import { getDeviceId } from '../offline/deviceId';
import * as outbox from '../offline/outbox';

type Loc = { state: 'locating' } | { state: 'ok'; pos: Position } | { state: 'error'; message: string };
// BR-03: digits with optional leading +. Spaces typed by the user are removed before checking and sending.
const PHONE_RE = new RegExp(`^\\+?\\d{${PHONE_MIN_DIGITS},${PHONE_MAX_DIGITS}}$`);
const cleanPhone = (raw: string) => raw.replace(/\s+/g, '');

export default function Report() {
  const navigate = useNavigate();
  const toast = useToast();
  const [text, setText] = useState('');
  const [voice, setVoice] = useState<VoiceNote | null>(null);
  const [loc, setLoc] = useState<Loc>({ state: 'locating' });
  const [locationText, setLocationText] = useState('');
  const [people, setPeople] = useState<{ label: string; value: number | null } | null>(null);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dictation = useLiveDictation((t) => setText((prev) => (prev ? `${prev} ${t}` : t)));
  const [liveText, setLiveText] = useState(false);

  function locate() {
    setLoc({ state: 'locating' });
    getPosition().then((pos) => setLoc({ state: 'ok', pos })).catch((e: Error) => setLoc({ state: 'error', message: e.message }));
  }
  useEffect(locate, []);

  // BR-03 — what is still missing before we can send.
  const hasContent = text.trim().length >= MIN_REPORT_TEXT || !!voice || needs.length > 0;
  const hasLocation = loc.state === 'ok' || locationText.trim().length > 0 || !!voice;
  const phoneOk = !phone.trim() || PHONE_RE.test(cleanPhone(phone));
  const missing = [
    !hasContent && 'describe what happened, record your voice, or choose the help you need',
    !hasLocation && 'add where you are',
    !phoneOk && 'check the phone number',
  ].filter(Boolean) as string[];

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      setPhoto(await compressImage(file));
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Could not use this photo.');
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTriedSubmit(true);
    if (missing.length) return;
    setSubmitting(true);
    try {
      const sub: ReportSubmission = {
        id: newUuid(),
        code: newReportCode(),
        pin: newPin(),
        deviceId: await getDeviceId(),
        text: text.trim(),
        lat: loc.state === 'ok' ? loc.pos.lat : null,
        lng: loc.state === 'ok' ? loc.pos.lng : null,
        locationText: locationText.trim() || null,
        people: people?.value ?? null,
        needs,
        phone: cleanPhone(phone) || null,
        photoBase64: photo,
        audioBase64: voice?.base64 ?? null,
        audioMime: voice?.mime ?? null,
        audioSeconds: voice?.seconds ?? null,
        createdAt: new Date().toISOString(),
      };
      await outbox.enqueue(sub); // always queued first — never waits for the network
      navigate(`/report/sent/${sub.id}`);
    } catch {
      toast('Could not save the report on this phone. Try again.', 'error');
      setSubmitting(false);
    }
  }

  return (
    <Layout emergency>
      <form onSubmit={submit} className="mx-auto flex max-w-xl flex-col gap-5" noValidate>
        <header>
          <h1 className="t-title-lg">Report an emergency</h1>
          <p className="mt-2 text-muted">Tell us what's happening. Everything except the description is optional.</p>
        </header>

        <section className="card card-pad flex flex-col gap-3" aria-labelledby="q-what">
          <label id="q-what" htmlFor="what" className="t-title-sm">What happened?</label>
          <textarea
            id="what" className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000}
            placeholder="What happened? You can type or use the mic" aria-invalid={triedSubmit && !hasContent}
          />
          <VoiceRecorder
            value={voice}
            onChange={setVoice}
            onRecordingChange={(rec) => { if (liveText) { if (rec) dictation.start(); else dictation.stop(); } }}
          />
          {dictation.supported && (
            <div className="flex flex-wrap items-center gap-3 t-caption">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={liveText} onChange={(e) => setLiveText(e.target.checked)} className="h-4 w-4 accent-black" />
                Also write my words into the box while I speak
              </label>
              {liveText && (
                <select aria-label="Language" className="rounded border border-hairline bg-white px-2 py-1" value={dictation.lang} onChange={(e) => dictation.setLang(e.target.value as 'en-IN' | 'ta-IN')}>
                  <option value="en-IN">English</option>
                  <option value="ta-IN">தமிழ்</option>
                </select>
              )}
            </div>
          )}
        </section>

        <section className="card card-pad flex flex-col gap-3" aria-labelledby="q-where">
          <h2 id="q-where" className="t-title-sm">Where are you?</h2>
          <div className="flex items-center gap-3 rounded-[12px] bg-canvas px-4 py-3 text-[14px]" role="status">
            {loc.state === 'locating' && <><Spinner size={16} /> Finding your location…</>}
            {loc.state === 'ok' && <><IconPin size={18} className="text-success" /> <span>Location captured <span className="text-muted">(±{loc.pos.accuracy} m)</span></span></>}
            {loc.state === 'error' && (
              <>
                <IconPin size={18} className="text-muted" />
                <span className="flex-1">Location not available. {loc.message}</span>
                <button type="button" className="text-ink underline" onClick={locate}>Try again</button>
              </>
            )}
          </div>
          <Field label="Describe the location" htmlFor="loctext" optional={loc.state === 'ok'} hint="Street, landmark, building or floor.">
            <input id="loctext" className="input" value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="e.g. Central Street, near the temple, 2nd floor" aria-invalid={triedSubmit && !hasLocation} />
          </Field>
        </section>

        <section className="card card-pad flex flex-col gap-3" aria-labelledby="q-people">
          <h2 id="q-people" className="t-title-sm">How many people need help?</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="q-people">
            {PEOPLE_CHOICES.map((c) => (
              <button key={c.label} type="button" className="chip" aria-pressed={people?.label === c.label} onClick={() => setPeople(people?.label === c.label ? null : c)}>{c.label}</button>
            ))}
          </div>
        </section>

        <section className="card card-pad flex flex-col gap-3" aria-labelledby="q-needs">
          <h2 id="q-needs" className="t-title-sm">What help do you need?</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="q-needs">
            {NEEDS.map((n) => (
              <button key={n} type="button" className="chip" aria-pressed={needs.includes(n)} onClick={() => setNeeds(needs.includes(n) ? needs.filter((x) => x !== n) : [...needs, n])}>
                {NEED_LABEL[n]}
              </button>
            ))}
          </div>
        </section>

        <section className="card card-pad flex flex-col gap-3" aria-labelledby="q-photo">
          <h2 id="q-photo" className="t-title-sm">Photo <span className="font-sans text-[15px] font-normal text-muted">(optional)</span></h2>
          {photo ? (
            <div className="relative overflow-hidden rounded-[12px]">
              <img src={toDataUrl(photo, 'image/jpeg')} alt="Your photo" className="max-h-72 w-full object-cover" />
              <button type="button" onClick={() => setPhoto(null)} className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] shadow">
                <IconTrash size={14} /> Remove
              </button>
            </div>
          ) : (
            <>
              <input ref={fileRef} id="photo" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
              <label htmlFor="photo" className="btn btn-outline cursor-pointer self-start">
                {photoBusy ? <Spinner size={16} /> : <IconCamera size={18} />} Take or choose a photo
              </label>
            </>
          )}
          {photoError && <p className="text-[13px] text-danger" role="alert">{photoError}</p>}
        </section>

        <section className="card card-pad">
          <Field label="Phone number" htmlFor="phone" optional hint="Only the coordination team sees it. Volunteers never do." error={triedSubmit && !phoneOk ? `Phone number should be ${PHONE_MIN_DIGITS}–${PHONE_MAX_DIGITS} digits.` : null}>
            <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98400 00000" aria-invalid={triedSubmit && !phoneOk} />
          </Field>
        </section>

        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 bg-canvas/95 px-4 pb-4 pt-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:p-0">
          {missing.length > 0 && (
            <p className={`t-body-sm ${triedSubmit ? 'text-danger' : 'text-muted'}`} role={triedSubmit ? 'alert' : undefined}>
              To send, {missing.join(' and ')}.
            </p>
          )}
          <Button type="submit" variant="danger" size="lg" block busy={submitting} aria-disabled={missing.length > 0}>
            Send report
          </Button>
        </div>
      </form>
    </Layout>
  );
}
