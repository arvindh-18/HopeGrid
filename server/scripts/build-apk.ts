// server/scripts/build-apk.ts — `npm run app:apk`: builds the website, copies it into the Android project
// (Capacitor sync) and builds an installable debug APK at ./HopeGrid.apk.
// Uses Android Studio's bundled Java (Gradle does not run on very new Java versions) and the default SDK folder.
// The server address is built in from PUBLIC_SERVER_URL in .env (or VITE_SERVER_URL=https://… npm run app:apk);
// it can still be changed in the app under Menu → Server. SOS push notifications (F28) are switched on when the
// Firebase config android/app/google-services.json exists.
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const STUDIO_JAVA = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
const env = { ...process.env };
if (!env.JAVA_HOME && existsSync(STUDIO_JAVA)) env.JAVA_HOME = STUDIO_JAVA;
if (!env.ANDROID_HOME) env.ANDROID_HOME = join(homedir(), 'Library/Android/sdk');
const publicUrl = env.PUBLIC_SERVER_URL?.trim();
if (!env.VITE_SERVER_URL && publicUrl && !publicUrl.includes('your-domain')) env.VITE_SERVER_URL = publicUrl;
const firebaseConfig = existsSync(resolve('android/app/google-services.json'));
env.VITE_PUSH_ENABLED = firebaseConfig ? '1' : '';
if (!env.JAVA_HOME) {
  console.error('Java for Android not found. Install Android Studio, or set JAVA_HOME to a JDK 17 or 21.');
  process.exit(1);
}

const run = (cmd: string, cwd = '.') => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd, env });
};

run('npx vite build');
run('npx cap sync android');
run(process.platform === 'win32' ? 'gradlew.bat assembleDebug' : './gradlew assembleDebug', 'android');

const apk = resolve('android/app/build/outputs/apk/debug/app-debug.apk');
copyFileSync(apk, resolve('HopeGrid.apk'));
console.log(`\nDone: ${resolve('HopeGrid.apk')}`);
console.log(env.VITE_SERVER_URL ? `Server address built in: ${env.VITE_SERVER_URL}` : 'No server address built in: the app asks for it on first start.');
console.log(firebaseConfig
  ? 'SOS push notifications: on (android/app/google-services.json found).'
  : 'SOS push notifications: off. Add android/app/google-services.json from Firebase to turn them on (volunteers still get the SOS by SMS and in the app).');
