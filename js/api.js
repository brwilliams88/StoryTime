// =====================================================================
// api.js — Talking to OpenAI via the Cloudflare Worker proxy
// =====================================================================

const WORKER_URL = 'https://storytime-api.brwilliams88.workers.dev';

// ----- Length targets -----
const LENGTH_PRESETS = {
  short:        { words: 250,  pages: 3,  minutes: 2 },
  regular:      { words: 625,  pages: 6,  minutes: 5 },
  long:         { words: 1000, pages: 8,  minutes: 8 },
  'extra-long': { words: 1500, pages: 12, minutes: 12 },
};

const PRICING = {
  inputPer1M: 2.50,
  outputPer1M: 10.00,
};

const GENRE_GUIDANCE = {
  'surprise-me':  'pick the genre that best fits the reader\'s other inputs',
  'adventure':    'an exciting journey with gentle thrills and wonder',
  'fairy-tale':   'classic fairy-tale feel — magic, archetypes, satisfying resolution',
  'fantasy':      'a rich imaginative world with magical elements',
  'sci-fi':       'imaginative science-fiction — space, robots, gadgets, future worlds',
  'pirates':      'high seas adventure — ships, treasure, salty crews',
  'superhero':    'heroes with special abilities solving problems with bravery and heart',
  'mystery':      'a gentle puzzle to discover and solve — curiosity, never danger',
  'spooky':       'playfully spooky — friendly ghosts, harmless surprises, no real fear',
  'animal-tales': 'animals are the main focus — their world, their feelings, their adventures',
};

const INGREDIENT_GUIDANCE = {
  'funny':         'sprinkle in light humor and silly moments',
  'surprise':      'include a small unexpected twist that delights',
  'heartwarming':  'aim for moments of warmth and connection',
  'action-packed': 'keep momentum brisk with vivid scenes and motion',
  'bedtime':       'soft, calming, sleepy — pace slows toward the end like a lullaby',
  'love-story':    'a sweet age-appropriate love or affection thread between characters',
  'puzzle':        'work in a clever puzzle or riddle that gets solved',
  'magical-object':'feature a magical object that matters to the plot',
  'sidekick':      'include a funny sidekick who adds humor and heart',
  'song':          'include a short song, rhyme, or repeated catchphrase',
  'challenge':     'include a real challenge the characters must overcome',
  'cliffhanger':   'end on a satisfying-but-open note that invites a sequel (do not fully resolve the biggest question)',
};


// =====================================================================
// PROMPT BUILDER
// =====================================================================
function buildStoryPrompt(formData, selectedCharacters) {
  const lengthInfo = LENGTH_PRESETS[formData.length] || LENGTH_PRESETS.regular;
  const genreLabel = (formData.genre || 'surprise-me').replace('-', ' ');
  const genreNote = GENRE_GUIDANCE[formData.genre] || GENRE_GUIDANCE['surprise-me'];

  const ingredientNotes = (formData.ingredients || [])
    .map(i => INGREDIENT_GUIDANCE[i])
    .filter(Boolean);

  const hasStoryDetails = formData.storyDetails && formData.storyDetails.trim();

  const lines = [];

  lines.push(
    `You are a master children's storyteller. Your job is to tell a great story.`,
    ``
  );

  lines.push(
    `CRAFT REQUIREMENTS:`,
    `- Tell ONE cohesive story with a clear arc: setup, rising action, a moment of change or discovery, and a resolved conclusion.`,
    `- Characters introduced on page 1 stay consistent throughout — same names, personalities, voices. Do NOT introduce new important characters in the final page.`,
    `- Use varied sentence rhythm and beautiful read-aloud language. Avoid mechanical repetition.`,
    `- Write at vocabulary, sentence length, and conceptual level appropriate for a ${formData.age}-year-old.`,
    `- End with a satisfying, resolved conclusion. If a calm, peaceful ending fits the story, lean that way (many stories are read at bedtime).`,
  );

  if (ingredientNotes.length > 0) {
    lines.push(`- Story ingredients to weave in: ${ingredientNotes.join('; ')}.`);
  }
  if (formData.theme && formData.theme.trim()) {
    lines.push(`- Gently weave in this theme: ${formData.theme.trim()}. Do not be preachy or didactic; let it emerge through the story.`);
  }
  lines.push(``);

  // ---- SELECTED SAVED CHARACTERS ----
  if (selectedCharacters && selectedCharacters.length > 0) {
    lines.push(`CHARACTERS IN THIS STORY:`);
    selectedCharacters.forEach(c => {
      const rolePart = c.role && c.role !== 'none' ? ` (Role: ${c.role === 'good-guy' ? 'Good Guy / hero' : 'Bad Guy / villain'})` : '';
      lines.push(`- ${c.name}${rolePart}`);
      lines.push(`  Visual description: ${c.visual_description}`);
      if (c.user_description && c.user_description.trim()) {
        lines.push(`  Personality notes from creator: ${c.user_description.trim()}`);
      }
    });
    lines.push(``);
  }

  // ---- STORY DETAILS — HIGHEST PRIORITY ----
  if (hasStoryDetails) {
    lines.push(
      `STORY DETAILS (HIGHEST PRIORITY — these are the reader's specific direct requests):`,
      `${formData.storyDetails.trim()}`,
      ``,
      `If these story details conflict with or override other parameters below (genre, characters, etc.), prioritize the story details. Treat the other fields as defaults that the story details can override.`,
      ``
    );
  }

  // ---- OTHER PARAMETERS ----
  lines.push(`OTHER PARAMETERS:`);
  lines.push(`- Target reader age: ${formData.age} years old`);
  lines.push(`- Length: ~${lengthInfo.words} words across about ${lengthInfo.pages} pages (~${lengthInfo.minutes} min read aloud)`);
  lines.push(`- Genre: ${genreLabel} — ${genreNote}`);

  if (!selectedCharacters || selectedCharacters.length === 0) {
    lines.push(`- Main characters: invent original, memorable characters specifically suited to the genre, age, and reader's wishes. Give them names and personality. Avoid bland archetypes.`);
  }

  lines.push(``);

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
    `For each page, "image_prompt" is a vivid visual description of that scene for an illustrator. Image style will be added separately.`
  );

  return lines.join('\n');
}


// =====================================================================
// STORY GENERATION
// =====================================================================
async function generateStory(formData, selectedCharacters, password) {
  const prompt = buildStoryPrompt(formData, selectedCharacters);
  const requestBody = {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.9,
  };

  let lastError = null;
  let attempt = 0;
  while (attempt < 2) {
    attempt++;
    try {
      return await callOpenAIChat(requestBody, password, prompt);
    } catch (err) {
      lastError = err;
      if (!err.isJsonParseError) break;
    }
  }
  throw lastError;
}

async function callOpenAIChat(requestBody, password, prompt) {
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
    throw new Error(`API call failed (HTTP ${response.status}): ${errText}`);
  }

  const data = await response.json();

  let parsed;
  try {
    parsed = JSON.parse(data.choices[0].message.content);
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
    story: parsed,
    prompt,
    rawResponse: data,
    tokens: usage,
    cost,
    parsed,
  };
}


// =====================================================================
// CHARACTER: Enhance Description
// =====================================================================
async function enhanceCharacterDescription(name, userDescription, password) {
  const prompt = `You are helping create a stable character profile for use across multiple children's book stories and illustrations.

Given the rough input below, write a richly detailed visual + personality description (~100–150 words) that an illustrator could use to draw this character consistently every time, and that a storyteller could use to write them in character.

Be specific and concrete, not generic. Include: hair, eyes, skin, build, distinctive features, signature outfit or look, posture, energy, personality, voice/mannerisms. Preserve all user inputs faithfully — do not contradict them.

Character name: ${name}
User-provided description: ${userDescription || '(none provided — infer thoughtfully from name and create a delightful original)'}

Return ONLY valid JSON with this exact structure (no other text):
{ "visual_description": "the rich description here" }`;

  const requestBody = {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  };

  const result = await callOpenAIChat(requestBody, password, prompt);
  return {
    visual_description: result.parsed.visual_description,
    cost: result.cost,
    tokens: result.tokens,
  };
}


// =====================================================================
// CHARACTER: Generate Random
// =====================================================================
async function generateRandomCharacter(password) {
  const prompt = `Invent a delightful, original character for a children's bedtime story.

Return ONLY valid JSON with this exact structure (no other text):
{
  "name": "the character's name",
  "user_description": "1–2 sentences a parent might write describing this character",
  "visual_description": "a richly detailed visual + personality description (100–150 words) for illustrators and storytellers — include hair, eyes, skin, build, distinctive features, signature look, posture, energy, personality"
}

Make the character memorable, specific, charming. Avoid generic archetypes.`;

  const requestBody = {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 1.0,
  };

  const result = await callOpenAIChat(requestBody, password, prompt);
  return {
    character: result.parsed,
    cost: result.cost,
    tokens: result.tokens,
  };
}


// =====================================================================
// FAKE STORY
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
    cost: 0.0237,
  };
}


function loadingHintForLength(lengthKey) {
  const map = {
    short:        '~10 seconds',
    regular:      '~15 seconds',
    long:         '~20 seconds',
    'extra-long': '~25 seconds',
  };
  return map[lengthKey] || '~15 seconds';
}


function costToCoins(costInDollars) {
  let remaining = Math.round(costInDollars * 1000) / 1000;
  const result = [];
  const denominations = [
    { type: 'quarter', value: 0.25 },
    { type: 'dime',    value: 0.10 },
    { type: 'nickel',  value: 0.05 },
    { type: 'penny',   value: 0.01 },
  ];
  for (const d of denominations) {
    const count = Math.floor(remaining / d.value + 1e-9);
    if (count > 0) {
      result.push({ type: d.type, count, partial: 1 });
      remaining -= count * d.value;
      remaining = Math.round(remaining * 1000) / 1000;
    }
  }
  if (remaining > 0 && remaining < 0.01) {
    const partial = remaining / 0.01;
    result.push({ type: 'penny', count: 1, partial });
  }
  return result;
}
