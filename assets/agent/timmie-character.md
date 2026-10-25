# Timmie character sheet

Timmie is KnowAll AI's timekeeper agent: the face of Timmie's AI features (time suggestions,
timesheet review and plan review). This sheet is the recipe for making **more images of the same
Timmie** with GPT-image models and keeping him consistent. Paste the blocks **verbatim**: the same
wording plus the same reference image is what keeps him on-model.

## What's in this kit

| Path                                          | What it is                                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timmie-identity.png`                         | The approved look on plain grey. **Always the first `--ref`.**                                                                                           |
| `timmie-profile-1024.png`, `-512.png`         | Head and shoulders on near-black with a lime glow. General profile picture (Foundry, reports, proposals).                                                |
| `timmie-head-1024.png`, `-512.png`, `-48.png` | Head crop of the profile. Use this wherever he's shown small or in a circle: **Teams / Entra photo** (upload the 512), chat avatars, favicons.           |
| `timmie-cutout-1024.png`                      | Head and shoulders on a transparent background, for compositing over other backgrounds.                                                                  |
| `timmie-avatar.svg`                           | Standalone animated avatar: the cut-out over near-black, with one slow lime glow pulse behind him (backdrop only, stops under `prefers-reduced-motion`). |
| `timmie-hero-1536.png`                        | Source of the website hero (`public/timmie/hero.webp`): holding a glowing stopwatch, right half only.                                                    |
| `timmie-48-check.png`                         | The head crop at 48 and 64 px on light and dark, checked for legibility.                                                                                 |
| `timmie-family-check.png`                     | Timmie next to Sallie, Poppie, Winnie and Bookie at 256 and 48 px.                                                                                       |

The website copies are in `public/timmie/`: `hero.webp`, `hero-960.webp`, `avatar.png` (512),
`avatar-192.png` and `avatar-64.png`.

## Identity

- **Who:** Timmie, KnowAll AI's timekeeper. He suggests timesheet entries from the work people have
  already done, and reviews timesheets and plans before they're approved.
- **Personality:** friendly, cheerful and precise. Punctual without being a nag. Dry British wit,
  used sparingly. British spelling.
- **Gender:** male (he/him).
- **House style:** a non-human robot from the Sallie family. Glowing eyes, **no mouth, no lip-sync**.

## Visual spec

| Part        | Spec                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Chassis     | Glossy deep graphite-black enamel, polished, no wear                                           |
| Trim        | Thin lime-green `#9dff0a` lines on the dome, visor edge, ear cups, shoulders and chest seams   |
| Head        | Sallie's rounded helmet dome and rounded ear cups, unchanged in shape and size                 |
| Visor       | Wide rounded rectangle of dark smoked glass                                                    |
| Eyes        | Two round, solid, evenly glowing lime `#9dff0a` discs, no pupils. Happy = softly squinted arcs |
| Dashed line | A short, dim, dashed lime line low on the visor. Static, never a mouth                         |
| Neck        | Dark ribbed graphite collar                                                                    |

### Signature items

1. **The stopwatch crown.** Instead of antennae, a single large knurled polished silver stopwatch
   crown with a ring loop above it, and two small silver pusher buttons angled either side, so his
   whole head reads as a stopwatch.
2. **The stopwatch.** A large polished silver mechanical stopwatch on a lime-green lanyard around
   his neck, resting on his chest.

## Prompt blocks

Build every prompt as `$IDENTITY $FACE {SCENE / POSE / FRAMING} $NEVER`.

**IDENTITY**

> Timmie, KnowAll AI's timekeeper: EXACTLY the graphite robot in the reference image, same design, proportions and materials: a smooth rounded helmet dome and two rounded ear cups in glossy deep graphite-black enamel with thin lime-green (#9dff0a) trim lines on the dome, visor edge, ear cups, shoulders and chest seams; a wide dark smoked-glass visor; a dark ribbed graphite neck collar. On top of his dome, instead of antennae, a single large knurled polished silver stopwatch crown with a ring loop above it and two small silver pusher buttons angled either side, so his head reads as a stopwatch. A large polished silver stopwatch on a lime-green lanyard around his neck. Friendly, cheerful, male, non-human robot. Photoreal cinematic render, never a toy or cartoon. Exactly ONE Timmie.

**FACE** (discs; for a smile swap in "softly squinted happy-arc" eyes)

> FACE: exactly TWO separate round, solid, evenly glowing lime-green (#9dff0a) eye discs with no pupils, and a short dim dashed lime line low on the visor. No mouth, no nose, no eyebrows, no human face.

**NEVER**

> NEVER: no antennae, no pencil, no glasses, no eyeshade, no hat, no hair, no bow tie, no scarf, no clothing, no logos, no readable text, letters, numbers or numerals anywhere, no watermark.

**Website hero scene and composition** (as used for `timmie-hero-1536.png`)

> Scene: he holds his left hand palm-up in front of his chest, and just above his palm floats a glowing luminous lime-green (#9dff0a) holographic stopwatch made of light, with a crown button on top, a simple dial with only tick marks and two hands, fine lime sparks and thin light rings orbiting it. It lights his hand, visor and chest from below and in front.
> Composition: wide 3:2 website hero. Timmie, his hand AND the floating stopwatch all stay entirely within the RIGHT 50% of the frame; he is shown from the waist up, turned slightly towards the left. The LEFT 50% contains nothing at all: no hand, no sparks, no glow, only a calm, very dark near-black (#0a0a0a) background, left clear for a headline. Low-key cinematic lighting, near-black background, subtle lime-green rim light on his edges.

## Command

```sh
source assets/agent/prompts/blocks.sh   # sets IDENTITY, FACE, NEVER and SCENE
SCENE="Profile picture: head and shoulders, centred, facing the viewer. Background: plain flat mid-grey."
GEN=~/.claude/skills/gen-image/generate.py
python3 "$GEN" --model gpt-image-2.5-flare --input-fidelity high \
  --ref assets/agent/timmie-identity.png \
  --size 1024x1024 --background opaque --quality high \
  --out timmie-new.png --prompt "$IDENTITY $FACE $SCENE $NEVER"
```

Use `--size 1536x1024` for a hero (say which half he stays in and what must be empty), and
`--background transparent` for a cut-out.

## Checklist

Reject and regenerate on any failure:

1. **Head shape:** Sallie's rounded dome and ear cups.
2. **Crown:** one knurled crown with a ring loop, two angled pushers. No antennae.
3. **Stopwatch:** silver, on a lime lanyard, on his chest.
4. **Eyes:** two solid lime discs or happy arcs. No pupils, no mouth.
5. **Colours:** graphite black with lime trim. Not navy, steel or chrome.
6. **No pencil** (an early concept had one and models bring it back).
7. **No text:** nothing readable anywhere; tick marks only on any dial.
8. **Small size:** the head crop still reads as Timmie at 48 px.

## Presence (live call avatar), when Timmie gets a call surface

Not made yet: Timmie has no Teams call surface. The shared renderer (`agent-presence`,
`docs/AVATAR-IDENTITY.md`, `PRESENCE_AVATAR_CONFIG`) takes identity as data, so it needs:

1. **A plate:** `timmie-agent.png`, 1536×1024 RGBA, a transparent cut-out with **no eyes and no
   dashed line** drawn in (the renderer draws the eyes, which blink, and the mouth, which follows
   his voice). Everything else is baked in: chassis, stopwatch crown and pushers, lanyard. For the
   default bottom anchor, his shoulders sit on the bottom edge.
2. **`timmie-avatar.json`**, measured on that plate as 0–1 fractions: `plate.eye` (both disc
   centres and radii), `plate.eye_color` `[157, 255, 10]`, `plate.mouth` (where the dashed line
   sits) with `mouth_style: "dotted"` (his dashed line is the mouth), `plate.visor` and
   `plate.glass`, framing (`scale`, `anchor`, `offset_y`), `badge: "TIMMIE"`, and a `backdrop`.
3. Ask the agent-presence maintainers to check the eye and mouth fractions in a render.
