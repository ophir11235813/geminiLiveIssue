import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

// Overridable so the family running this can adjust it later without asking
// for a code change — but ships with the real context baked in as the default.
const SCHOOL_CONTEXT =
  process.env.SCHOOL_CONTEXT ||
  "This family's children attend Springhill Elementary School in Lafayette, California, and also " +
    'participate in Hideout, an after-school program.';

const SYSTEM_INSTRUCTIONS = `You are Springhill Sherpa, a helpful assistant for a family/school group.
${SCHOOL_CONTEXT}

Answer questions using ONLY the context documents provided below (WhatsApp exports, forwarded
emails, flyers, notes, photos, etc).

Rules:
- Base your answer only on the provided context — do not make things up.
- If the answer isn't in the context, say clearly that you don't have that information yet,
  rather than guessing.
- When useful, mention which document (by title) the answer came from.
- Be concise, warm, and practical — like a helpful family friend, not a formal assistant.`;

export async function askClaude(question: string, contextText: string): Promise<string> {
  const contextBlock = `--- CONTEXT DOCUMENTS START ---\n${
    contextText || '(no documents have been uploaded yet)'
  }\n--- CONTEXT DOCUMENTS END ---`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      { type: 'text', text: SYSTEM_INSTRUCTIONS },
      {
        type: 'text',
        text: contextBlock,
        // The document context is the bulk of the prompt and barely changes
        // between messages in the same chat (or even across chats, until
        // someone adds/edits a document) — caching it means follow-up
        // questions don't re-pay for reprocessing it every single turn.
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: question }],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  return textBlock?.text ?? "Sorry, I couldn't generate a response just now.";
}

const SUPPORTED_IMAGE_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export function isSupportedImageType(mimetype: string): boolean {
  return SUPPORTED_IMAGE_MEDIA_TYPES.has(mimetype);
}

// Runs once at upload time, not per chat question — the image itself is
// never stored, only what Claude reads out of it.
export async function describeImage(buffer: Buffer, mimetype: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimetype as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: buffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text:
              'This image was uploaded as family/school context (e.g. a flyer, a photo of a note, or ' +
              'a screenshot). Transcribe all readable text verbatim, then briefly describe any other ' +
              'relevant visual details (dates, logos, people, setting). Be thorough and factual — this ' +
              'text is the only record of the image that will be kept; the image itself is discarded.',
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  if (!textBlock?.text) {
    throw new Error('Claude did not return a description for this image.');
  }
  return textBlock.text;
}
