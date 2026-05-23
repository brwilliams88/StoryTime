// =====================================================================
// api.js — Talking to OpenAI via the Cloudflare Worker proxy
// =====================================================================
// All API calls go through OUR Cloudflare Worker, which adds the
// real OpenAI API key on the server side (where the browser can't
// see it). We only need to send the password and the request body.
// =====================================================================

// The public URL of our Cloudflare Worker.
// Not a secret — just an address. Anyone who knows it still needs
// the password to actually get a response.
const WORKER_URL = 'https://storytime-api.brwilliams88.workers.dev';

// ----- Length targets (rough) -----
// Words per minute for parent-to-kid reading aloud: ~120–150.
// We aim slightly lower (~100 wpm) since the kids ask questions
// and pause to look at pictures.
const LENGTH_PRESETS = {
  short:      { words: 300,  pages: 4,  minutes: 3 },
  regular:    { words: 700,  pages: 6,  minutes: 6 },
  long:       { words: 1200, pages: 9,  minutes: 10 },
  'extra-long': { words: 1800, pages: 13, minutes: 15 },
};

// ----- OpenAI GPT-4o pricing (as of this build) -----
// $2.50 per 1M input tokens, $10.00 per 1M output tokens.
const PRICING = {
  inputPer1M: 2.50,
  outputPer1M: 10.00,
};


// =====================================================================
// PROMPT BUILDER
// Takes the form data the user filled out and turns it into the
// actual text prompt we send to GPT-4o.
// =====================================================================
function buildStoryPrompt(formData) {
  const lengthInfo = LENGTH_PRESETS[formData.length] || LENGTH_PRESETS.regular;

  // Genre-specific tone guidance
  const genreGuidance = {
    'adventure':       'An exciting journey with a sense of wonder — gentle thrills, never frightening.',
    'fairy-tale':      'A classic fairy-tale feel — magic, archetypes, a satisfying happy ending.',
    'fantasy':         'A rich imaginative world with magical elements and a hopeful tone.',
    'bedtime-calming': 'Soothing, peaceful, dreamlike. The pace should slow toward the end as the character drifts to sleep.',
    'funny':           'Playful, silly, lots of light humor. Should make a child giggle.',
    'mystery':         'A gentle puzzle to solve. No real danger — more curiosity and discovery.',
    'friendship':      'Warm, heartfelt, about connection and kindness between characters.',
  };

  const characterGuidance = {
    'animals':           'The main characters should be animals (the child can imagine which ones, but pick interesting ones).',
    'humans':            'The main characters should be human children or families.',
    'monsters':          'The main characters should be friendly, lovable monsters (never scary).',
    'robots':            'The main characters should be robots — could be cute, clever, or both.',
    'magical-creatures': 'The main characters should be magical creatures — dragons, unicorns, fairies, sprites, etc.',
  };

  // Build the prompt piece by piece for clarity
  const lines = [
    `You are a warm, imaginative children's bedtime storyteller.`,
    ``,
    `Create a bedtime story with these parameters:`,
    `- Target reader age: ${formData.age} years old`,
    `- Approximate length: ~${lengthInfo.words} words across about ${lengthInfo.pages} pages (~${lengthInfo.minutes} min reading time)`,
    `- Genre: ${formData.genre} — ${genreGuidance[formData.genre] || ''}`,
    `- Main character type: ${formData.characterType} — ${characterGuidance[formData.characterType] || ''}`,
  ];

  if (formData.setting && formData.setting.trim()) {
    lines.push(`- Setting: ${formData.setting.trim()}`);
  }
  if (formData.specialTouches && formData.specialTouches.trim()) {
    lines.push(`- Special touches the reader requested: ${formData.specialTouches.trim()}`);
  }
  if (formData.lesson && formData.lesson.trim()) {
    lines.push(`- Lesson or theme to convey: ${formData.lesson.trim()}`);
  }

  lines.push(
    ``,
    `Writing guidelines:`,
    `- Vocabulary, sentence length, and concepts must match a ${formData.age}-year-old.`,
    `- Always end on a calm, positive, bedtime-appropriate note — no cliffhangers, no fear.`,
    `- Each "page" should be one discrete scene that an illustrator could draw.`,
    `- Vary sentence rhythm. Read aloud well.`,
    `- For each page, also write an "image_prompt": a vivid visual description of that scene that an illustrator could use. Describe characters, setting, mood, and any specific actions. Image style will be added separately.`,
    ``,
    `Return ONLY valid JSON. No markdown, no explanation, no text outside the JSON.`,
    `Exact structure:`,
    `{`,
    `  "title": "short evocative story title",`,
    `  "pages": [`,
    `    { "page_number": 1, "text": "...", "image_prompt": "..." },`,
    `    { "page_number": 2, "text": "...", "image_prompt": "..." }`,
    `  ]`,
    `}`
  );

  return lines.join('\n');
}


// =====================================================================
// STORY GENERATION
// Calls GPT-4o through our Worker proxy. Returns a parsed story object
// plus metadata (cost, token counts, raw response).
// =====================================================================
async function generateStory(formData, password) {
  const prompt = buildStoryPrompt(formData);

  const requestBody = {
    model: 'gpt-4o',
    messages: [
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.9, // a bit of creativity
  };

  const response = await fetch(`${WORKER_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Password': password,
    },
    body: JSON.stringify(requestBody),
  });

  if (response.status === 401) {
    throw new Error('Wrong password. Tap the corner debug icon to reset.');
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Story generation failed (HTTP ${response.status}): ${errText}`);
  }

  const data = await response.json();

  // Parse the JSON the model gave us inside the response message
  let story;
  try {
    story = JSON.parse(data.choices[0].message.content);
  } catch (e) {
    throw new Error('The AI returned content I could not parse as JSON. Try regenerating.');
  }

  // Compute cost from usage tokens
  const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };
  const cost =
    (usage.prompt_tokens     * PRICING.inputPer1M  / 1_000_000) +
    (usage.completion_tokens * PRICING.outputPer1M / 1_000_000);

  return {
    story,                       // parsed { title, pages: [...] }
    prompt,                      // the full prompt we sent (for debug)
    rawResponse: data,           // the full OpenAI response (for debug)
    tokens: usage,               // { prompt_tokens, completion_tokens, total_tokens }
    cost,                        // number, in USD
  };
}


// =====================================================================
// FAKE STORY (for debug / UI testing without paying for API calls)
// =====================================================================
function generateFakeStory(formData) {
  return {
    story: {
      title: 'The Sleepy Forest and the Glowing Acorn',
      pages: [
        { page_number: 1, text: 'Once upon a time, in a quiet forest where the trees whispered lullabies, lived a small fox named Pip. Pip had soft amber fur and big curious eyes.', image_prompt: 'A small fox in a moonlit forest, warm watercolor.' },
        { page_number: 2, text: 'One evening, Pip discovered a glowing acorn beneath the oldest oak tree. It shimmered like a tiny captured star.', image_prompt: 'Close-up of a glowing acorn at the base of an enormous oak.' },
        { page_number: 3, text: 'When Pip picked it up, the forest hummed with magic. All the sleepy creatures opened their eyes just a little, smiling.', image_prompt: 'Forest animals peeking from burrows, gentle magical glow.' },
        { page_number: 4, text: 'Pip placed the acorn back where it belonged. The forest let out a contented sigh, and Pip curled up and drifted to sleep.', image_prompt: 'Fox curled up sleeping next to the glowing acorn, peaceful watercolor.' },
      ],
    },
    prompt: '[FAKE STORY — no API call was made]',
    rawResponse: { fake: true },
    tokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    cost: 0,
  };
}
