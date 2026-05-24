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

// ----- Length targets -----
// Aim ~125 wpm reading-aloud rate; rounded for cleaner targets.
const LENGTH_PRESETS = {
  short:        { words: 250,  pages: 3,  minutes: 2 },
  regular:      { words: 625,  pages: 6,  minutes: 5 },
  long:         { words: 1000, pages: 8,  minutes: 8 },
  'extra-long': { words: 1500, pages: 12, minutes: 12 },
};

// ----- OpenAI GPT-4o pricing (as of this build) -----
const PRICING = {
  inputPer1M: 2.50,
  outputPer1M: 10.00,
};

// ----- Genre guidance for the prompt -----
const GENRE_GUIDANCE = {
  'adventure':   'an exciting journey with gentle thrills and wonder',
  'fairy-tale':  'classic fairy-tale feel — magic, archetypes, satisfying resolution',
  'fantasy':     'a rich imaginative world with magical elements',
  'sci-fi':      'imaginative science-fiction — space, robots, gadgets, future worlds',
  'pirates':     'high seas adventure — ships, treasure, salty crews',
  'superhero':   'heroes with special abilities solving problems with bravery and heart',
  'mystery':     'a gentle puzzle to discover and solve — curiosity, never danger',
  'spooky':      'playfully spooky — friendly ghosts, harmless surprises, no real fear',
};

const MOOD_GUIDANCE = {
  'funny':         'sprinkle in light humor and silly moments',
  'surprise':      'include a small unexpected twist that delights',
  'heartwarming':  'aim for moments of warmth and connection',
  'action-packed': 'keep momentum brisk with vivid scenes and motion',
  'dreamy':        'lean into soft, imaginative, dreamlike imagery',
};


// =====================================================================
// PROMPT BUILDER
// Quality directives first, structure second.
// =====================================================================
function buildStoryPrompt(formData) {
  const lengthInfo = LENGTH_PRESETS[formData.length] || LENGTH_PRESETS.regular;
  const genreLabel = formData.genre.replace('-', ' ');
  const genreNote = GENRE_GUIDANCE[formData.genre] || '';

  // Compose mood guidance from selected tags
  const moodNotes = (formData.mood || [])
    .map(m => MOOD_GUIDANCE[m])
    .filter(Boolean);

  const lines = [];

  // ---- PERSONA ----
  lines.push(
    `You are a master children's bedtime storyteller. Craft a story that is wonderful first, well-organized second.`,
    ``
  );

  // ---- CRAFT REQUIREMENTS (quality first) ----
  lines.push(
    `CRAFT REQUIREMENTS (these matter most):`,
    `- Tell ONE cohesive story with a clear arc: setup, rising action, a moment of change or discovery, and a calming satisfying conclusion.`,
    `- Characters introduced on page 1 stay consistent throughout — same names, personalities, voices. Do NOT introduce new important characters in the final page.`,
    `- Each page flows naturally from the previous — no jarring jumps in tone, location, or time without intentional transition.`,
    `- Use varied sentence rhythm and beautiful read-aloud language. Avoid mechanical repetition.`,
    `- End peaceful and warm — appropriate for the moment before sleep.`,
    `- Write at a vocabulary, sentence length, and conceptual level appropriate for a ${formData.age}-year-old.`,
  );

  if (moodNotes.length > 0) {
    lines.push(`- Mood: ${moodNotes.join('; ')}.`);
  }

  if (formData.theme && formData.theme.trim()) {
    lines.push(`- Gently weave in this theme: ${formData.theme.trim()}. Do not be preachy or didactic; let it emerge through the story.`);
  }

  lines.push(``);

  // ---- STORY PARAMETERS ----
  lines.push(`STORY PARAMETERS:`);
  lines.push(`- Target reader age: ${formData.age} years old`);
  lines.push(`- Length: ~${lengthInfo.words} words across about ${lengthInfo.pages} pages (~${lengthInfo.minutes} min read aloud)`);
  lines.push(`- Genre: ${genreLabel} — ${genreNote}`);

  if (formData.characters && formData.characters.trim()) {
    lines.push(`- Main characters: ${formData.characters.trim()}`);
  } else {
    lines.push(`- Main characters: invent them yourself, suited to the genre and age`);
  }

  if (formData.anythingElse && formData.anythingElse.trim()) {
    lines.push(`- Additional details from the reader: ${formData.anythingElse.trim()}`);
  }

  lines.push(``);

  // ---- OUTPUT FORMAT ----
  lines.push(
    `OUTPUT FORMAT:`,
    `Return ONLY valid JSON. No markdown, no commentary, no text outside the JSON.`,
    `Exact structure:`,
    `{`,
    `  "title": "short evocative story title",`,
    `  "pages": [`,
    `    { "page_number": 1, "text": "...", "image_prompt": "..." },`,
    `    { "page_number": 2, "text": "...", "image_prompt": "..." }`,
    `  ]`,
    `}`,
    `For each page, "image_prompt" is a vivid visual description of that scene for an illustrator (setting, characters, mood, action). Image style will be added separately.`
  );

  return lines.join('\n');
}


// =====================================================================
// STORY GENERATION
// Calls GPT-4o through our Worker proxy. Auto-retries once on a
// malformed-JSON response. Returns parsed story + metadata.
// =====================================================================
async function generateStory(formData, password) {
  const prompt = buildStoryPrompt(formData);
  const requestBody = {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.9,
  };

  // Try up to twice — second attempt only on JSON parse failure.
  let lastError = null;
  let attempt = 0;
  while (attempt < 2) {
    attempt++;
    try {
      return await callOpenAI(requestBody, password, prompt);
    } catch (err) {
      lastError = err;
      // Only retry on JSON parse errors — not auth, network, or quota issues
      if (!err.isJsonParseError) break;
    }
  }
  throw lastError;
}

async function callOpenAI(requestBody, password, prompt) {
  const response = await fetch(`${WORKER_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Password': password,
    },
    body: JSON.stringify(requestBody),
  });

  if (response.status === 401) {
    throw new Error('Wrong password. Open the debug panel to reset.');
  }
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Story generation failed (HTTP ${response.status}): ${errText}`);
  }

  const data = await response.json();

  let story;
  try {
    story = JSON.parse(data.choices[0].message.content);
  } catch (e) {
    const err = new Error('The AI returned content I could not parse as JSON.');
    err.isJsonParseError = true;
    throw err;
  }

  const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };
  const cost =
    (usage.prompt_tokens     * PRICING.inputPer1M  / 1_000_000) +
    (usage.completion_tokens * PRICING.outputPer1M / 1_000_000);

  return {
    story,
    prompt,
    rawResponse: data,
    tokens: usage,
    cost,
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


// =====================================================================
// LOADING HINT
// Roughly how long generation should take, based on story length.
// =====================================================================
function loadingHintForLength(lengthKey) {
  const map = {
    short:        '~10 seconds',
    regular:      '~15 seconds',
    long:         '~20 seconds',
    'extra-long': '~25 seconds',
  };
  return map[lengthKey] || '~15 seconds';
}
