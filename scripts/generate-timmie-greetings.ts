/**
 * Records Timmie's greeting clips once, with Azure OpenAI text-to-speech
 * (gpt-4o-mini-tts on Timmie's own public resource), into
 * public/timmie/greetings/<id>.mp3 (small mono MP3s), and lists them in
 * src/services/public-timmie/greeting-clips.ts. Until it has been run the greetings show
 * as text only. Run again when the greetings in src/services/public-timmie/greetings.ts
 * change.
 *
 *   PUBLIC_AZURE_OPENAI_ENDPOINT=https://<public-resource>.openai.azure.com \
 *   PUBLIC_TIMMIE_TTS_DEPLOYMENT=gpt-4o-mini-tts \
 *   bun scripts/generate-timmie-greetings.ts [--voice fable] [--only <id>]
 *
 * Credentials: PUBLIC_AZURE_OPENAI_API_KEY if set, else an Entra token from the Azure CLI
 * (`az login` with Cognitive Services OpenAI User on the resource). Neither is ever
 * printed or written anywhere. Only Azure OpenAI hosts are accepted (never the OpenAI
 * API). Needs ffmpeg and ffprobe.
 *
 * The voice: GPT-Live's `vesper` (Timmie's call voice) is not a text-to-speech voice, so
 * the clips use the closest one, `fable`, with British (RP) delivery instructions.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GREETINGS } from '../src/services/public-timmie/greetings';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const voice = flag('--voice') ?? 'fable';
const only = flag('--only');

function azureEndpoint(): string {
  const raw = process.env.PUBLIC_AZURE_OPENAI_ENDPOINT?.trim();
  if (!raw) throw new Error('Set PUBLIC_AZURE_OPENAI_ENDPOINT to the public resource.');
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    !/\.(openai\.azure\.com|cognitiveservices\.azure\.com|services\.ai\.azure\.com)$/.test(
      url.hostname
    )
  ) {
    throw new Error('PUBLIC_AZURE_OPENAI_ENDPOINT must be an Azure OpenAI endpoint.');
  }
  return url.origin;
}

function authHeaders(): Record<string, string> {
  const key = process.env.PUBLIC_AZURE_OPENAI_API_KEY?.trim();
  if (key) return { 'api-key': key };
  const token = execFileSync(
    'az',
    [
      'account',
      'get-access-token',
      '--resource',
      'https://cognitiveservices.azure.com',
      '--query',
      'accessToken',
      '-o',
      'tsv',
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  )
    .toString()
    .trim();
  if (!token) throw new Error('No API key and no Azure CLI token.');
  return { Authorization: `Bearer ${token}` };
}

const INSTRUCTIONS =
  'Voice: a friendly, precise British man in his thirties with a standard southern English ' +
  '(RP) accent, a timekeeper. Warm and unhurried, with a light, dry smile in the voice. ' +
  'Natural conversational pace, clear diction, a gentle rise on the closing question.';

async function main() {
  const endpoint = azureEndpoint();
  const deployment = process.env.PUBLIC_TIMMIE_TTS_DEPLOYMENT?.trim();
  if (!deployment) throw new Error('Set PUBLIC_TIMMIE_TTS_DEPLOYMENT (e.g. gpt-4o-mini-tts).');
  const headers = authHeaders();
  const root = path.resolve(__dirname, '..');
  const outDir = path.join(root, 'public/timmie/greetings');
  mkdirSync(outDir, { recursive: true });
  const made: string[] = [];
  for (const greeting of GREETINGS) {
    if (only && greeting.id !== only) continue;
    const res = await fetch(`${endpoint}/openai/v1/audio/speech`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: deployment,
        voice,
        input: greeting.text,
        instructions: INSTRUCTIONS,
        response_format: 'wav',
      }),
    });
    if (!res.ok) {
      // Azure's error body, which never contains the key.
      throw new Error(`TTS failed for ${greeting.id}: ${res.status} ${await res.text()}`);
    }
    const wav = path.join(tmpdir(), `timmie-greeting-${greeting.id}.wav`);
    writeFileSync(wav, Buffer.from(await res.arrayBuffer()));
    const mp3 = path.join(outDir, `${greeting.id}.mp3`);
    // Mono, 24 kHz, 48 kbit/s: clear speech in a few tens of kilobytes.
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-i',
      wav,
      '-ac',
      '1',
      '-ar',
      '24000',
      '-b:a',
      '48k',
      mp3,
    ]);
    rmSync(wav);
    const seconds = Number(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        mp3,
      ])
        .toString()
        .trim()
    );
    console.log(
      `${greeting.id}: ${seconds.toFixed(1)}s, ${Math.round(statSync(mp3).size / 1024)} KB${seconds > 10 ? '  (over 10 s: shorten the text)' : ''}`
    );
    made.push(greeting.id);
  }

  // List every greeting that now has a clip.
  const all = GREETINGS.map((g) => g.id).filter((id) => {
    try {
      return statSync(path.join(outDir, `${id}.mp3`)).size > 0;
    } catch {
      return false;
    }
  });
  writeFileSync(
    path.join(root, 'src/services/public-timmie/greeting-clips.ts'),
    `/**
 * The greetings that have a recorded clip in public/timmie/greetings/<id>.mp3.
 *
 * Written by scripts/generate-timmie-greetings.ts (Azure OpenAI text-to-speech on
 * Timmie's own resource). A greeting not listed here shows as text only, with no audio
 * and no "tap to hear".
 */
export const GREETING_CLIPS: readonly string[] = ${JSON.stringify(all)};
`
  );
  console.log(`Recorded ${made.length}; ${all.length} greetings now have clips.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
