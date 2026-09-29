// server/scripts/setup-models.ts — `npm run setup-ai`: downloads the local AI model (~2 GB) and the speech model
// (~470 MB) into models/. Run it only on the laptop that hosts the server; other machines work without them
// (keyword fallback, voice notes left for staff to listen to). Safe to re-run: existing files are kept.
async function main(): Promise<void> {
  console.log('HopeGrid: installing the local AI models into models/ (first time: about 2.5 GB)…');
  const { ensureWhisperModelFile } = await import('../transcribe');
  await ensureWhisperModelFile(true);
  console.log('  speech model ready');
  const { ensureAiModelFile } = await import('../ai');
  await ensureAiModelFile(true);
  console.log('  AI model ready — restart the server to use them.');
}

main().then(() => process.exit(0), (e) => {
  console.error(`HopeGrid: model download failed (${e instanceof Error ? e.message : e}). Run \`npm run setup-ai\` again to resume.`);
  process.exit(1);
});
