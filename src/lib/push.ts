// src/lib/push.ts — SOS push notifications in the Android app (F28), so an auto-dispatched request reaches a volunteer
// whose app is closed. Only in app builds made with a Firebase config: `npm run app:apk` sets VITE_PUSH_ENABLED when
// android/app/google-services.json exists. The website never registers (volunteers there get the SOS by SMS).
import { PushNotifications } from '@capacitor/push-notifications';
import { isNativeApp } from './serverUrl';

export const pushAvailable = (): boolean => isNativeApp() && import.meta.env.VITE_PUSH_ENABLED === '1';

/**
 * Asks for notification permission, registers with Firebase and hands the device's token to `save`. `onOpen` gets the
 * screen to open when a notification is tapped. Returns a function that removes the listeners.
 */
export async function startPush(save: (token: string) => void, onOpen: (path: string) => void): Promise<() => void> {
  if (!pushAvailable()) return () => {};
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return () => {};
  const listeners = await Promise.all([
    PushNotifications.addListener('registration', (t) => save(t.value)),
    PushNotifications.addListener('registrationError', (e) => console.warn('Push registration failed:', e.error)),
    PushNotifications.addListener('pushNotificationActionPerformed', (a) => onOpen(String(a.notification.data?.path ?? '/volunteer'))),
  ]);
  await PushNotifications.register();
  return () => listeners.forEach((l) => void l.remove());
}
