// Supabase Edge Function: reads a body composition scan photo with Claude.
//
// Deploy:   supabase functions deploy read-body-scan
// Secret:   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Called by the app with { image: <base64>, mediaType: 'image/jpeg' } from a
// signed-in athlete (Supabase verifies the JWT before this code runs).
import Anthropic from 'npm:@anthropic-ai/sdk';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reading = {
  type: 'object',
  properties: {
    kg: { type: ['number', 'null'] },
    pct: { type: ['number', 'null'], description: '% of ideal printed under the kg value' },
    evaluation: { type: ['string', 'null'], enum: ['Under', 'Normal', 'Over', null] },
  },
  required: ['kg', 'pct', 'evaluation'],
  additionalProperties: false,
};
const segments = {
  type: 'object',
  properties: { leftArm: reading, rightArm: reading, trunk: reading, leftLeg: reading, rightLeg: reading },
  required: ['leftArm', 'rightArm', 'trunk', 'leftLeg', 'rightLeg'],
  additionalProperties: false,
};
const schema = {
  type: 'object',
  properties: {
    weightKg: { type: ['number', 'null'] },
    skeletalMuscleKg: { type: ['number', 'null'] },
    bodyFatKg: { type: ['number', 'null'] },
    bodyFatPct: { type: ['number', 'null'] },
    lean: segments,
    fat: segments,
  },
  required: ['weightKg', 'skeletalMuscleKg', 'bodyFatKg', 'bodyFatPct', 'lean', 'fat'],
  additionalProperties: false,
};

const PROMPT = `This is a photo or screenshot of a body composition scan (for example an InBody result sheet).
Read the values exactly as printed:
- weightKg, skeletalMuscleKg (Skeletal Muscle Mass), bodyFatKg (Body Fat Mass), bodyFatPct (Percent Body Fat / PBF).
- lean: the "Segmental Lean Analysis" panel. fat: the "Segmental Fat Analysis" panel.
  Each segment has a kg value, a % below it and an evaluation (Under / Normal / Over).
  Left / right are as labelled on the sheet ("Left" / "Right"), not as seen in the picture.
Use null for anything not shown or not legible. Do not estimate missing values.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const { image, mediaType } = await req.json();
    if (typeof image !== 'string' || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)) return json({ error: 'Send a JPEG, PNG, WebP or GIF image.' }, 400);
    if (image.length > 7_000_000) return json({ error: 'Image too large.' }, 413);

    const client = new Anthropic(); // reads ANTHROPIC_API_KEY
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: { type: 'json_schema', schema } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    } as never);

    if (response.stop_reason === 'refusal') return json({ error: 'The scan could not be read.' }, 422);
    if (response.stop_reason === 'max_tokens') return json({ error: 'The reading was cut off.' }, 502);
    const text = response.content.find((b: { type: string }) => b.type === 'text') as { text: string } | undefined;
    if (!text) return json({ error: 'No reading returned.' }, 502);
    return json(JSON.parse(text.text));
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Reading failed.' }, 500);
  }
});
