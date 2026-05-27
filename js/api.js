// =====================================================================
// api.js — Talking to OpenAI via the Cloudflare Worker proxy
// =====================================================================

const WORKER_URL = 'https://storytime-api.brwilliams88.workers.dev';

// ----- Length presets -----
// total_pages = how many pages in the book (each gets its own illustration now)
// words_per_page = soft target so each page fits a phone screen
const LENGTH_PRESETS = {
  short:        { total_pages: 3,  words_per_page: 85,  total_words: 255,  minutes: 2 },
  regular:      { total_pages: 6,  words_per_page: 100, total_words: 600,  minutes: 5 },
  long:         { total_pages: 8,  words_per_page: 125, total_words: 1000, minutes: 8 },
  'extra-long': { total_pages: 12, words_per_page: 125, total_words: 1500, minutes: 12 },
};

// ----- Pricing -----
const PRICING = {
  inputPer1M: 2.50,
  outputPer1M: 10.00,
  image: {
    '1024x1024': { low: 0.011, medium: 0.042, high: 0.167 },
    '1024x1536': { low: 0.016, medium: 0.063, high: 0.25 },
    '1536x1024': { low: 0.016, medium: 0.063, high: 0.25 },
  },
};

const GENRE_GUIDANCE = {
  'surprise-me':  'pick the genre that best fits the reader\'s other inputs',
  'adventure':    'an exciting journey with thrills and wonder',
  'fairy-tale':   'classic fairy-tale feel — magic, archetypes, satisfying resolution',
  'fantasy':      'a rich imaginative world with magical elements',
  'sci-fi':       'imaginative science-fiction — space, robots, gadgets, future worlds',
  'pirates':      'high seas adventure — ships, treasure, salty crews',
  'superhero':    'heroes with special abilities solving problems with bravery and heart',
  'mystery':      'a gentle puzzle to discover and solve',
  'spooky':       'playfully spooky — friendly ghosts, harmless surprises, no real fear',
  'animal-tales': 'animals are the main focus — their world, their feelings, their adventures',
};

const INGREDIENT_GUIDANCE = {
  'funny':         'sprinkle in light humor and silly moments',
  'surprise':      'include a small unexpected twist that delights',
  'heartwarming':  'aim for moments of warmth and connection',
  'action-packed': 'keep momentum brisk with vivid scenes and motion',
  'bedtime':       'soft, calming, sleepy — pace slows toward the end like a lullaby. End with the characters falling asleep or in a peaceful resolution.',
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

  const isBedtime = (formData.ingredients || []).includes('bedtime');
  const hasStoryDetails = formData.storyDetails && formData.storyDetails.trim();

  // Age-scaled intensity guidance
  const ageNum = parseInt(formData.age, 10) || 5;
  let intensityNote;
  if (ageNum <= 5) {
    intensityNote = `For this young reader (age ${ageNum}), keep stakes gentle. Conflict can exist but resolution should be quick and reassuring. No real fear or peril.`;
  } else if (ageNum <= 7) {
    intensityNote = `For this reader (age ${ageNum}), moderate stakes are appropriate. Tension is welcome but always rooted in eventual safety and resolution.`;
  } else {
    intensityNote = `For this older reader (age ${ageNum}), stakes can feel real. Characters may face genuine fear, conflict, or loss. Don't water down challenges — make them feel earned. Avoid graphic content, but don't soften the emotional truth of the story.`;
  }

  const lines = [];

  lines.push(
    `You are a master children's storyteller AND art director. Tell a great story AND describe vivid illustrations.`,
    ``
  );

  lines.push(
    `STORY CRAFT REQUIREMENTS:`,
    `- Tell ONE cohesive story with a clear arc: setup, rising action, a moment of change or discovery, and a resolved conclusion.`,
    `- Characters introduced on page 1 stay consistent throughout — same names, personalities, voices. Do NOT introduce new important characters in the final page.`,
    `- Use varied sentence rhythm and beautiful read-aloud language.`,
    `- Write at vocabulary, sentence length, and conceptual level appropriate for a ${ageNum}-year-old.`,
    `- ${intensityNote}`,
  );

  if (isBedtime) {
    lines.push(`- BEDTIME story: pace slows toward the end like a lullaby; finish with peace and stillness.`);
  } else {
    lines.push(`- Ending should be SATISFYING and RESOLVED, not necessarily calm. Match the energy of the genre.`);
  }

  if (ingredientNotes.length > 0) {
    lines.push(`- Story ingredients to weave in: ${ingredientNotes.join('; ')}.`);
  }
  if (formData.theme && formData.theme.trim()) {
    lines.push(`- Gently weave in this theme: ${formData.theme.trim()}. Do not be preachy or didactic.`);
  }

  lines.push(``);

  lines.push(
    `PAGE STRUCTURE:`,
    `- The book has exactly ${lengthInfo.total_pages} pages.`,
    `- Each page's text should be approximately ${lengthInfo.words_per_page} words (range: ${Math.round(lengthInfo.words_per_page * 0.7)}–${Math.round(lengthInfo.words_per_page * 1.2)}). Keep close to the target — pages must fit on a phone screen without scrolling.`,
    ``
  );

  lines.push(
    `ILLUSTRATION REQUIREMENTS:`,
    `- Each page gets its OWN unique illustration.`,
    `- Choose ONE consistent illustration style for the whole story (e.g. "warm watercolor", "pixel art", "soft pastel cartoon"). Output it as "style_anchor".`,
    `- Plus a separate "cover_image_prompt" for the book cover.`,
    `- For each page, decide image_quality: "medium" for KEY scenes (character introductions, climaxes, dramatic moments, emotional beats) or "low" for simpler/transition scenes (atmosphere, simple settings, fewer characters, less complex action).`,
    `- Pages with "low" quality should be visually simpler — fewer characters, simpler props/composition.`,
    `- VARIETY IS GOOD. Not every image needs to show every character. Some scenes show only atmosphere or setting. Some show one character. Some show multiple. Match the visual emphasis to what the page text is really about.`,
    `- Image prompts must be vivid, specific, concrete. Mention named characters BY EXACT NAME (do not modify or prefix them — if character is "Kai", do NOT call them "RedKai" or similar).`,
    `- Image prompts should describe what THE PAGE TEXT depicts — image must match what's being read aloud.`,
    ``
  );

  if (selectedCharacters && selectedCharacters.length > 0) {
    lines.push(`CHARACTERS IN THIS STORY:`);
    lines.push(`Use these EXACT names. Do not modify, prefix, or combine them.`);
    selectedCharacters.forEach(c => {
      const rolePart = c.role && c.role !== 'none' ? ` (Role: ${c.role === 'good-guy' ? 'Good Guy / hero' : 'Bad Guy / villain'})` : '';
      lines.push(`- ${c.name}${rolePart}`);
      lines.push(`  Visual: ${c.visual_description}`);
      if (c.user_description && c.user_description.trim()) {
        lines.push(`  Notes: ${c.user_description.trim()}`);
      }
    });
    lines.push(``);
  }

  if (hasStoryDetails) {
    lines.push(
      `STORY DETAILS (HIGHEST PRIORITY — reader's specific direct requests):`,
      formData.storyDetails.trim(),
      ``,
      `If these conflict with other parameters, prioritize the story details.`,
      ``
    );
  }

  lines.push(`OTHER PARAMETERS:`);
  lines.push(`- Target reader age: ${ageNum} years old`);
  lines.push(`- Total length: ~${lengthInfo.total_words} words, ~${lengthInfo.minutes} min read aloud`);
  lines.push(`- Genre: ${genreLabel} — ${genreNote}`);

  if (!selectedCharacters || selectedCharacters.length === 0) {
    lines.push(`- Main characters: invent original, memorable characters specifically suited to the genre and age. Give them names and personality.`);
  }

  lines.push(``);

  lines.push(
    `OUTPUT FORMAT:`,
    `Return ONLY valid JSON. No markdown, no commentary.`,
    `Exact structure:`,
    `{`,
    `  "title": "short evocative story title",`,
    `  "style_anchor": "the consistent illustration style for this entire story (a descriptive phrase)",`,
    `  "cover_image_prompt": "vivid scene for the book cover",`,
    `  "pages": [`,
    `    { "page_number": 1, "text": "...", "image_prompt": "scene description", "image_quality": "medium" },`,
    `    { "page_number": 2, "text": "...", "image_prompt": "scene description", "image_quality": "low" }`,
    `  ]`,
    `}`
  );

  return lines.join('\n');
}


// =====================================================================
// GENERATE STORY (text + image prompts)
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
// CHARACTER: Enhance Description (now returns tagline + visual description)
// =====================================================================
async function enhanceCharacterDescription(name, userDescription, password) {
  const prompt = `You are helping create a stable character profile for use across multiple children's book stories and illustrations.

Given the rough input below, create:
1. A short "tagline" — 3 to 6 words that identify this character at a glance (e.g. "8-year-old curious boy", "magical purple unicorn", "yellow electric mouse-creature", "grumpy mountain dwarf")
2. A richly detailed "visual_description" — ~100–150 words an illustrator could use to draw this character consistently every time, and a storyteller could use to write them in character.

Be specific and concrete, not generic. Include: hair, eyes, skin, build, distinctive features, signature outfit or look, posture, energy, personality, voice/mannerisms. Preserve all user inputs faithfully — do not contradict them.

Character name: ${name}
User-provided description: ${userDescription || '(none — infer thoughtfully from name and create a delightful original)'}

Return ONLY valid JSON with this exact structure (no other text):
{
  "tagline": "short 3-6 word identifier",
  "visual_description": "the rich 100-150 word description"
}`;

  const requestBody = {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  };

  const result = await callOpenAIChat(requestBody, password, prompt);
  return {
    tagline: result.parsed.tagline,
    visual_description: result.parsed.visual_description,
    cost: result.cost,
    tokens: result.tokens,
  };
}


// =====================================================================
// CHARACTER: Generate Random (also includes tagline)
// =====================================================================
async function generateRandomCharacter(password) {
  const prompt = `Invent a delightful, original character for a children's bedtime story.

Return ONLY valid JSON with this exact structure (no other text):
{
  "name": "the character's name",
  "tagline": "3-6 word identifier (e.g. 'magical purple unicorn', '8-year-old brave girl')",
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
// IMAGE GENERATION (gpt-image-1)
// =====================================================================
function buildImagePrompt(styleAnchor, scenePrompt, characters) {
  const parts = [];

  if (styleAnchor) {
    parts.push(`Illustration style: ${styleAnchor}. Maintain this exact style across all images in this story.`);
  }

  parts.push(`Scene: ${scenePrompt}`);

  if (characters && characters.length > 0) {
    parts.push(`Character references (use these EXACT names and appearances if mentioned in the scene):`);
    characters.forEach(c => {
      parts.push(`- ${c.name}: ${c.visual_description}`);
    });
  }

  parts.push(`Children's storybook illustration. No text or words in the image.`);

  return parts.join('\n\n');
}

async function generateImage(fullPrompt, password, options = {}) {
  const quality = options.quality || 'medium';
  const size = options.size || '1024x1024';

  const requestBody = {
    model: 'gpt-image-1',
    prompt: fullPrompt,
    size,
    quality,
    n: 1,
  };

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${WORKER_URL}/v1/images/generations`, {
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
      if (response.status >= 500 && attempt === 0) {
        lastError = new Error(`Image API error (HTTP ${response.status}) — retrying`);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Image generation failed (HTTP ${response.status}): ${errText}`);
      }

      const data = await response.json();
      const b64 = data.data && data.data[0] && data.data[0].b64_json;
      if (!b64) {
        throw new Error('No image data in response');
      }

      const cost = costForImage(quality, size);
      return { b64, cost, rawResponse: data, prompt: fullPrompt };
    } catch (err) {
      lastError = err;
      if (attempt === 0 && /5\d\d/.test(err.message)) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function costForImage(quality, size) {
  const sizePricing = PRICING.image[size] || PRICING.image['1024x1024'];
  return sizePricing[quality] || sizePricing.medium;
}


// =====================================================================
// FAKE STORY (debug)
// =====================================================================
function generateFakeStory(formData) {
  return {
    story: {
      title: 'The Sleepy Forest and the Glowing Acorn',
      style_anchor: 'warm watercolor children\'s book illustration, soft amber and cream tones',
      cover_image_prompt: 'A small amber fox standing on a mossy log under a moonlit forest canopy, glowing acorn in the foreground.',
      pages: [
        { page_number: 1, text: 'Once upon a time, in a quiet forest where the trees whispered lullabies, lived a small fox named Pip. Pip had soft amber fur and big curious eyes.', image_prompt: 'A small amber fox in a quiet moonlit forest, big curious eyes, soft watercolor.', image_quality: 'medium' },
        { page_number: 2, text: 'One evening, Pip discovered a glowing acorn beneath the oldest oak tree. It shimmered like a tiny captured star.', image_prompt: 'Close-up of a glowing acorn at the base of an enormous oak, magical light.', image_quality: 'medium' },
        { page_number: 3, text: 'When Pip picked it up, the forest hummed with magic. All the sleepy creatures opened their eyes just a little, smiling.', image_prompt: 'Forest at night, hint of magical glow, peaceful.', image_quality: 'low' },
        { page_number: 4, text: 'Pip placed the acorn back where it belonged. The forest let out a contented sigh, and Pip curled up and drifted to sleep.', image_prompt: 'Fox curled up sleeping next to the glowing acorn, peaceful watercolor.', image_quality: 'medium' },
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
    short:        '~45 seconds',
    regular:      '~90 seconds',
    long:         '~120 seconds',
    'extra-long': '~180 seconds',
  };
  return map[lengthKey] || '~90 seconds';
}


function costToCoins(costInDollars) {
  // For totals under 1¢, return a single partial penny.
  // Otherwise, round to nearest cent and return whole-coin counts (no partial pennies).
  if (costInDollars < 0.01) {
    if (costInDollars <= 0) return [];
    return [{ type: 'penny', count: 1, partial: costInDollars / 0.01 }];
  }

  // Round to nearest cent
  let remaining = Math.round(costInDollars * 100) / 100;
  const result = [];
  const denominations = [
    { type: 'quarter', value: 0.25 },
    { type: 'dime',    value: 0.10 },
    { type: 'nickel',  value: 0.05 },
    { type: 'penny',   value: 0.01 },
  ];
  for (const d of denominations) {
    const count = Math.round((remaining + 1e-9) / d.value | 0);  // floor
    const c = Math.floor(remaining / d.value + 1e-9);
    if (c > 0) {
      result.push({ type: d.type, count: c, partial: 1 });
      remaining -= c * d.value;
      remaining = Math.round(remaining * 100) / 100;
    }
  }
  return result;
}

// User-friendly cost formatting (kid-friendly):
// - >= $1.00 → "$X.XX"
// - 1¢..99¢ → "Xc" (using cents symbol)
// - < 1¢ → "<1¢"
function formatCostFriendly(cost) {
  if (cost <= 0) return '0¢';
  if (cost < 0.01) return '<1¢';
  if (cost < 1.00) {
    const cents = Math.round(cost * 100);
    return `${cents}¢`;
  }
  return `$${cost.toFixed(2)}`;
}
