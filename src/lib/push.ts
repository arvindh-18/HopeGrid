// src/lib/push.ts — push notifications in the Android app (F28, BR-167), so a new request or an SOS reaches a volunteer
// whose app is closed. Only in app builds made with a Firebase config: `npm run app:apk` sets VITE_PUSH_ENABLED when
// android/app/google-services.json exists. The website never registers (volunteers there get the SOS by SMS).
import { PushNotifications } from '@capacitor/push-notifications';
import { PUSH_CHANNEL } from '../../shared/constants';
import { isNativeApp } from './serverUrl';

export const pushAvailable = (): boolean => isNativeApp() && import.meta.env.VITE_PUSH_ENABLED === '1';

/** ON: notifications reach this phone. OFF: Android notification permission is refused. UNAVAILABLE: not the app build. */
export type PushState = 'ON' | 'OFF' | 'UNAVAILABLE';

/**
 * Asks for notification permission, creates the high-importance "Help requests" channel (so alerts pop up with sound),
 * registers with Firebase and hands the device's token to `save`. `onOpen` gets the screen to open when a notification
 * is tapped; `onReceive` is called when one arrives while the app is open (Android shows nothing then).
 */
export async function startPush(
  save: (token: string) => void,
  onOpen: (path: string) => void,
  onReceive: (title: string, body: string) => void,
): Promise<{ state: PushState; stop: () => void }> {
  const none = () => {};
  if (!pushAvailable()) return { state: 'UNAVAILABLE', stop: none };
  await PushNotifications.createChannel({
    id: PUSH_CHANNEL, name: 'Help requests', description: 'New requests and SOS alerts for volunteers',
    importance: 5, visibility: 1, vibration: true,
  }).catch(() => {});
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return { state: 'OFF', stop: none };
  const listeners = await Promise.all([
    PushNotifications.addListener('registration', (t) => save(t.value)),
    PushNotifications.addListener('registrationError', (e) => console.warn('Push registration failed:', e.error)),
    PushNotifications.addListener('pushNotificationReceived', (n) => onReceive(n.title ?? 'HopeGrid', n.body ?? '')),
    PushNotifications.addListener('pushNotificationActionPerformed', (a) => onOpen(String(a.notification.data?.path ?? '/volunteer'))),
  ]);
  await PushNotifications.register();
  return { state: 'ON', stop: () => listeners.forEach((l) => void l.remove()) };
}
