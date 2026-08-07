import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

const SYSTEM_PROMPT = `You are the Family Context Bot, a helpful assistant for a family/school group.
Answer questions using ONLY the context documents provided below (WhatsApp exports, forwarded
emails, flyers, notes, etc).

Rules:
- Base your answer only on the provided context — do not make things up.
- If the answer isn't in the context, say clearly that you don't have that information yet,
  rather than guessing.
- When useful, mention which document (by title) the answer came from.
- Be concise, warm, and practical — like a helpful family friend, not a formal assistant.`;

export async function askClaude(question: string, contextText: string): Promise<string> {
  const system = `${SYSTEM_PROMPT}

--- CONTEXT DOCUMENTS START ---
${contextText || '(no documents have been uploaded yet)'}
--- CONTEXT DOCUMENTS END ---`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: question }],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  return textBlock?.text ?? "Sorry, I couldn't generate a response just now.";
}
