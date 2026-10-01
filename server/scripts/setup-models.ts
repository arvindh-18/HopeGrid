// server/scripts/setup-models.ts — `npm run setup-ai`: downloads the local AI model (~2 GB) and the speech models
// (Whisper ~470 MB, Parakeet English ~420 MB, IndicConformer Tamil ~140 MB and Hindi ~200 MB) into models/. Run it only on the laptop that
// hosts the server; other machines work without them (keyword fallback, voice notes left for staff to listen to).
// Safe to re-run: existing files are kept.
async function main(): Promise<void> {
  console.log('HopeGrid: installing the local AI models into models/ (first time: about 3.3 GB)…');
  const { ensureIndicModelFiles, ensureParakeetModelFile, ensureWhisperModelFile } = await import('../transcribe');
  await ensureWhisperModelFile(true);
  console.log('  speech model (Whisper) ready');
  await ensureParakeetModelFile(true);
  console.log('  English speech model (Parakeet) ready');
  await ensureIndicModelFiles('ta', true);
  console.log('  Tamil speech model (IndicConformer) ready');
  await ensureIndicModelFiles('hi', true);
  console.log('  Hindi speech model (IndicConformer) ready');
  const { ensureAiModelFile } = await import('../ai');
  await ensureAiModelFile(true);
  console.log('  AI model ready — restart the server to use them.');
}

main().then(() => process.exit(0), (e) => {
  console.error(`HopeGrid: model download failed (${e instanceof Error ? e.message : e}). Run \`npm run setup-ai\` again to resume.`);
  process.exit(1);
});
