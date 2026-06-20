// =====================================================================
// api.js — Talking to OpenAI via the Cloudflare Worker proxy
// =====================================================================

const WORKER_URL = 'https://storytime-api.brwilliams88.workers.dev';

// ----- Length presets -----
// More pages (not more words per page) to hit accurate reading times
// while keeping each page short enough to fit a phone screen.
const LENGTH_PRESETS = {
  short:   { total_pages: 4, words_per_page: 75, total_words: 300, minutes: 3 },
  regular: { total_pages: 6, words_per_page: 95, total_words: 570, minutes: 5 },
  long:    { total_pages: 9, words_per_page: 95, total_words: 855, minutes: 8 },
};

const PRICING = {
  inputPer1M: 2.50,
  outputPer1M: 10.00,
  miniInputPer1M:  0.15,
  miniOutputPer1M: 0.60,
  image: {
    '1024x1024': { low: 0.011, medium: 0.042, high: 0.167 },
    '1024x1536': { low: 0.016, medium: 0.063, high: 0.25 },
    '1536x1024': { low: 0.016, medium: 0.063, high: 0.25 },
  },
};

const GENRE_GUIDANCE = {
  'surprise-me':    'pick the genre that best fits the reader\'s other inputs',
  'adventure':      'an exciting journey with thrills and wonder',
  'fairy-tale':     'classic fairy-tale feel — magic, archetypes, satisfying resolution',
  'fantasy':        'a rich imaginative world with magical elements',
  'sci-fi':         'imaginative science-fiction — space, robots, gadgets, future worlds',
  'pirates':        'high seas adventure — ships, treasure, salty crews',
  'superhero':      'heroes with special abilities solving problems with bravery and heart',
  'mystery':        'a gentle puzzle to discover and solve',
  'spooky':         'playfully spooky — friendly ghosts, harmless surprises, no real fear',
  'animal-tales':   'animals are the main focus — their world, their feelings, their adventures',
  'dinosaurs':      'set in a world of dinosaurs — prehistoric jungles, roars, big footprints',
  'underwater':     'underwater adventure — deep sea, sea creatures, coral reefs, sunken treasures',
  'western':        'old west adventure — cowboys, frontier towns, dusty trails, horseback rides',
};

const INGREDIENT_GUIDANCE = {
  'funny':         'sprinkle in light humor and silly moments',
  'surprise':      'include a small unexpected twist that delights',
  'heartfelt':     'emotional warmth and meaningful connection — could be friendship, family love, romantic affection, parental love, or other meaningful bonds',
  'action-packed': 'keep momentum brisk with vivid scenes and motion',
  'bedtime':       'soft, calming, sleepy — pace slows toward the end like a lullaby. End with the characters falling asleep or in a peaceful resolution.',
  'puzzle':        'work in a clever puzzle or riddle that gets solved',
  'magical-object':'feature a magical object that matters to the plot',
  'battle':        'include a meaningful battle, duel, or competition. Intensity and weapon use should match the reader age (see age guidance).',
  'race':          'feature a race or time-pressured competition — could be cars, rockets, spaceships, animals, runners, or a desperate dash against a deadline',
  'save-the-day':  'one or more characters must save the day — protect their community, neighborhood, or world from danger, solve a major problem, or do something that helps many people',
};

// ----- Artwork style guidance -----
const ARTWORK_STYLE_GUIDANCE = {
  'surprise-me':    null,  // null = let GPT-4o choose based on story context
  'watercolor':     'warm watercolor children\'s book illustration, soft painterly brushstrokes, gentle textures, hand-painted feel',
  'pencil':         'HAND-DRAWN black-and-white pencil sketch with VISIBLE LOOSE SKETCH LINES, varied line weight, eraser marks and ghosting visible, cross-hatching for shading, paper grain texture. STRICTLY MONOCHROME — only black, white, and grayscale. NO color whatsoever. Imperfect organic strokes like a real artist\'s sketchbook page',
  'crayon':         'CHUNKY childlike crayon drawing, visible waxy strokes, paper texture peeking through, slightly imperfect coloring like a real kid drew it',
  'comic-book':     'classic American comic book illustration, bold black ink outlines, halftone dot shading, vibrant pop-art primary color palette, dynamic action poses',
  'anime':          'vibrant anime style with EXAGGERATED large expressive eyes, dynamic dramatic facial expressions, action-packed compositions, clean cel-shading',
  'pixel-art':      'Retro 16-bit video game aesthetic, distinctly PIXELATED rendering with VISIBLE BLOCKY PIXELS, limited classic console color palette. Background elements feel like vintage SNES/Genesis-era game environments — tiled grass, platforming sprites, classic game UI feel. Action poses, dynamic compositions, nostalgic gaming vibe',
  '3d-animation':   '3D Pixar-style CGI animation, expressive characters, soft volumetric lighting, glossy materials',
  'claymation':     'DEEPLY TEXTURED claymation stop-motion style, visible fingerprint marks and lumpy clay surfaces, slightly imperfect handmade modeling clay feel',
  'building-blocks':'scene built entirely from interlocking plastic toy bricks, blocky stud-topped pieces, primary colors, glossy plastic finish, toy-construction aesthetic',
  'stuffies':       'EVERY character rendered as a REAL, PHYSICAL stuffed animal / plush toy — photographic realism of the plush itself. Realistic soft fabric with visible fuzz, fluff, and fibers; yarn or felt details; stitched seams and visible thread stitching; button or glossy plastic safety eyes; slightly lumpy hand-sewn shape. Small authentic touches: a sewn-on fabric tag, a loose thread, or a tiny bit of stuffing peeking from a seam. NOT cartoon, NOT sketched, NOT flat illustration — they look like actual plush toys you could pick up. IMPORTANT: the SETTING and scenery follow the story (forest, ocean, space, castle, etc.) — do NOT default to a bedroom or toy shelf unless the story actually calls for it. Plush characters exist within the real story world',
  'paper-cutouts':  'Layered collage artwork made from CONSTRUCTION PAPER as if assembled by a child for an art project. Pieces are cut out with VISIBLY IMPERFECT scissor lines, some edges torn or ripped, occasional crinkled or slightly wrinkled paper. Pieces are stacked and overlapped, sometimes with visible glue spots. Backgrounds incorporate CARDBOARD with visible corrugated edges in places. Color palette is bright but limited like a kid\'s craft box. Recognizable characters and scenes, but with the charming imperfection of a kid\'s hands-on art project — enthusiastic and heartfelt rather than polished',
  'chalkboard':     'A SIMPLE, AMATEUR chalk drawing on a dark chalkboard — as if doodled by a child or an untrained hand, NOT by a professional artist. CRUDE and BASIC: wobbly uneven lines, rough simple shapes, stick-figure-level simplicity. STRICTLY LIMITED palette of just white chalk plus 2-3 other chalk colors. NO realistic shading, NO blending, NO gradients, NO fine detail — fills are flat, scratchy, and often left incomplete (just outlines, partially colored in). Lines are scratchy and broken with visible chalk dust and the occasional smudge or half-erased mark. The whole image should obviously read as basic chalkboard scribbles — flat, childlike, and unpolished. Avoid anything that looks skilled or detailed',
};


// =====================================================================
// STORY PROMPT BUILDER
// =====================================================================
function buildStoryPrompt(formData, selectedCharacters) {
  const lengthInfo = LENGTH_PRESETS[formData.length] || LENGTH_PRESETS.regular;
  const genreLabel = (formData.genre || 'surprise-me').replace('-', ' ');
  const genreNote = GENRE_GUIDANCE[formData.genre] || GENRE_GUIDANCE['surprise-me'];
  const ingredientNotes = (formData.ingredients || []).map(i => INGREDIENT_GUIDANCE[i]).filter(Boolean);
  const isBedtime = (formData.ingredients || []).includes('bedtime');
  const hasStoryDetails = formData.storyDetails && formData.storyDetails.trim();

  // Age-scaled intensity + violence guidance
  const ageRange = formData.ageRange || '6-7';
  const [ageMin, ageMax] = ageRange.split('-').map(n => parseInt(n, 10));
  const midAge = Math.round((ageMin + ageMax) / 2);
  let intensityNote;
  let vocabNote;
  if (ageMax <= 3) {
    intensityNote = `For young readers (ages ${ageRange}), keep stakes gentle. Conflict is symbolic — chases, gentle disagreements, helping each other. NO weapons or fighting violence. Resolution quick and reassuring.`;
    vocabNote = `VOCABULARY: Use simple, familiar everyday words a toddler hears in daily life. Short, clear sentences. Playful and repeated words are great. Avoid abstract, literary, or rare words entirely.`;
  } else if (ageMax <= 5) {
    intensityNote = `For young readers (ages ${ageRange}), keep stakes gentle. Conflict is symbolic — chases, gentle disagreements, helping each other. NO weapons or fighting violence. Resolution quick and reassuring.`;
    vocabNote = `VOCABULARY: Use clear, simple words and short sentences. You may introduce an occasional fun new word ONLY if its meaning is obvious from the surrounding sentence. Avoid advanced or literary vocabulary.`;
  } else if (ageMax <= 7) {
    intensityNote = `For these readers (ages ${ageRange}), stakes can feel real. Mild action is welcome: swords, magic spells, chases, captures, escapes. NO real violence or graphic detail. Battles end with resolution, not harm. Some character growth.`;
    vocabNote = `VOCABULARY: Use common, grade-appropriate words for a 6-7 year old. A few slightly richer words are fine if the sentence makes their meaning clear. Avoid advanced or literary words.`;
  } else {
    intensityNote = `For these older readers (ages ${ageRange}), don't water down challenges. Real action allowed: weapons, tactical battles, genuine peril, even mild violence is appropriate (a hero dodges a strike, lands a clean hit, etc). NO gore, NO graphic harm to good characters. Make stakes feel earned. Avoid soft endings unless the genre calls for it.`;
    vocabNote = `VOCABULARY: Keep words accessible for ages 8-10 and natural to read aloud. You may use varied, descriptive language, but AVOID advanced/literary words that would send a child to a dictionary — e.g. NOT "macabre", "embodiment", "malice", "bellowed", "perseverance". Prefer plain synonyms ("spooky", "spirit", "meanness", "shouted", "keep trying").`;
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
    `- ${intensityNote}`,
    `- ${vocabNote}`,
  );

  if (isBedtime) {
    lines.push(`- BEDTIME story: pace slows toward the end like a lullaby; finish with peace and stillness.`);
  } else {
    lines.push(`- Ending should be SATISFYING and RESOLVED, not necessarily calm. Match the energy of the genre.`);
  }

  if (ingredientNotes.length > 0) lines.push(`- Story ingredients to weave in: ${ingredientNotes.join('; ')}.`);
  if (formData.theme && formData.theme.trim()) {
    lines.push(`- Gently weave in this theme: ${formData.theme.trim()}. Do not be preachy or didactic.`);
  }

  lines.push(``);

  lines.push(
    `PAGE STRUCTURE:`,
    `- The book has exactly ${lengthInfo.total_pages} pages.`,
    `- Each page's text MUST be at most ${Math.round(lengthInfo.words_per_page * 1.1)} words (target: ~${lengthInfo.words_per_page}). HARD CONSTRAINT — pages MUST fit on a phone screen without scrolling. Brevity is better than overrun. NEVER exceed the cap.`,
    ``
  );

  // Style anchor — either user-selected or AI-chosen
  const styleAnchorOverride = ARTWORK_STYLE_GUIDANCE[formData.artStyle];

  lines.push(
    `ILLUSTRATION REQUIREMENTS:`,
    `- Each page gets its OWN unique illustration.`,
  );

  if (styleAnchorOverride) {
    lines.push(`- Use this EXACT illustration style for "style_anchor": "${styleAnchorOverride}". Do not deviate or rephrase — output it verbatim.`);
  } else {
    lines.push(`- Choose ONE consistent illustration style for the whole story that fits the genre and mood (e.g. "warm watercolor", "pixel art", "soft pastel cartoon"). Output as "style_anchor".`);
  }

  lines.push(
    `- Plus a separate "cover_image_prompt" for the book cover — describe the SCENE only. Do NOT mention "book cover" or include the story title in the image_prompt. The title is shown separately above the image.`,
    `- Each image_prompt MUST include a specific ACTION VERB — show what characters are DOING, not just standing. Specify the moment.`,
    `- Vary CAMERA ANGLE / COMPOSITION across the story: close-ups, wide shots, over-the-shoulder, top-down, etc. Don't repeat the same framing.`,
    `- Use exact character names as provided.`,
    `- VARIETY in who appears: not every image needs all characters. Some scenes show one character. Some show several. Some show only scenery or an important object (when that's the visual heart of the page). Match what the page text is really about.`,
    `- Images should depict EXACTLY what the page text describes — no inventing scenes not in the text.`,
    `- The app will enrich your image prompts further before sending to the image model — your job is to nail the SCENE accurately.`,
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
  lines.push(`- Target reader age range: ${ageRange} years old (write for the middle of this range, ~age ${midAge}).`);
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
    `  "summary": "a brief 2-sentence summary (~30-45 words) of the story — inviting, no spoilers",`,
    `  "style_anchor": "the consistent illustration style for this entire story (a descriptive phrase)",`,
    `  "cover_image_prompt": "vivid scene for the cover — describe characters and setting only, no mention of 'book cover' or text",`,
    `  "pages": [`,
    `    { "page_number": 1, "text": "...", "image_prompt": "scene description with action verb and composition" },`,
    `    { "page_number": 2, "text": "...", "image_prompt": "..." }`,
    `  ],`,
    `  "quiz": {`,
    `    "comprehension": [`,
    `      { "question": "...", "options": ["A","B","C","D"], "correct": 0 },`,
    `      { "question": "...", "options": ["A","B","C","D"], "correct": 2 },`,
    `      { "question": "...", "options": ["A","B","C","D"], "correct": 1 }`,
    `    ],`,
    `    "reflection": [`,
    `      "open-ended reflection question 1",`,
    `      "open-ended reflection question 2"`,
    `    ]`,
    `  }`,
    `}`,
    ``,
    `Quiz rules:`,
    `- 3 comprehension multiple-choice questions about specific story details. Options must all be plausible. "correct" is the index (0-3) of the right answer.`,
    `- 2 reflection questions that connect the story to the reader's own life — age-appropriate.`,
    `- Quiz language matches the age range of the reader.`
  );

  return lines.join('\n');
}


// =====================================================================
// GENERATE STORY
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

async function callOpenAIChat(requestBody, password, promptForReturn) {
  const response = await fetch(`${WORKER_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Password': password },
    body: JSON.stringify(requestBody),
  });

  if (response.status === 401) throw new Error('Wrong password. Open Settings to reset.');
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
  const isMini = requestBody.model && requestBody.model.includes('mini');
  const inputRate = isMini ? PRICING.miniInputPer1M : PRICING.inputPer1M;
  const outputRate = isMini ? PRICING.miniOutputPer1M : PRICING.outputPer1M;
  const cost = (usage.prompt_tokens * inputRate / 1e6) + (usage.completion_tokens * outputRate / 1e6);

  return {
    story: parsed,
    prompt: promptForReturn,
    rawResponse: data,
    tokens: usage,
    cost,
    parsed,
  };
}


// =====================================================================
// CHARACTER: Enhance — now returns tagline + visual_description + safe_fallback
// =====================================================================
async function enhanceCharacterDescription(name, userDescription, password) {
  const prompt = `You are helping create a stable character profile for use across multiple children's book stories and illustrations.

Given the rough input below, return JSON with FOUR things:

1. "tagline" — 3 to 6 words that identify this character at a glance (e.g. "8-year-old curious boy", "magical purple unicorn", "yellow electric mouse-creature", "grumpy mountain dwarf").

2. "visual_description" — a richly detailed ~100–150 word visual + personality description. Include: hair, eyes, skin, build, distinctive features, signature outfit or look, posture, energy, personality, voice/mannerisms. Preserve all user inputs faithfully. CRITICAL: if the input describes someone's appearance (especially from a photo), keep their visual details EXACTLY — skin tone, hair color and texture, eye color, glasses, and facial hair. Never lighten skin, change hair or eye color, or remove glasses or facial hair. These details are what make the character resemble the real person.

3. "safe_fallback_name" — a generic alternate name for image generation if the original name is copyright-blocked. For copyrighted characters this MUST be clearly different (e.g. "Darth Vader" → "Lord Vorath", "Pikachu" → "Sparkpaw", "Elsa" → "Frosthild"). For original characters, this can be the same as the original name.

4. "safe_fallback_visual_description" — the SAME character, visually recognizable (preserve hair color, signature outfit colors, powers, archetype), but rephrased to avoid triggering image-AI copyright filters. KEY TECHNIQUES:
   - Replace franchise-specific phrases with descriptive equivalents:
     "ice powers" → "frost magic that crystallizes the air"
     "her tiara from coronation" → "a delicate silver crown"
     "iconic angular helmet" → "a sleek angular black helmet"
     "lightsaber" → "a glowing energy sword"
   - Avoid named items from the source franchise.
   - Avoid the franchise name (don't say "her Frozen-style dress" — say "a flowing pale blue gown with crystalline details").
   - Use natural, descriptive English instead of franchise terminology.
   - PRESERVE: hair color, outfit colors, build, signature powers, archetype, accessories. Don't change the character into someone different.

Character name: ${name}
User-provided description: ${userDescription || '(none — invent a delightful original from the name)'}

Return ONLY valid JSON (no other text):
{
  "tagline": "...",
  "visual_description": "...",
  "safe_fallback_name": "...",
  "safe_fallback_visual_description": "..."
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
    safe_fallback_name: result.parsed.safe_fallback_name,
    safe_fallback_visual_description: result.parsed.safe_fallback_visual_description,
    cost: result.cost,
    tokens: result.tokens,
  };
}


// =====================================================================
// CHARACTER: Generate Random
// =====================================================================
async function generateRandomCharacter(password) {
  const prompt = `Invent a delightful, original character for a children's bedtime story.

Return ONLY valid JSON:
{
  "name": "the character's name",
  "tagline": "3-6 word identifier",
  "user_description": "1–2 sentences a parent might write",
  "visual_description": "100–150 word richly detailed visual + personality description",
  "safe_fallback_name": "alternate name for fallback (for original characters, can be the same or similar)",
  "safe_fallback_visual_description": "same character described generically (no copyrighted terms)"
}

Make the character memorable, specific, charming. Avoid generic archetypes.`;

  const requestBody = {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 1.0,
  };

  const result = await callOpenAIChat(requestBody, password, prompt);
  return { character: result.parsed, cost: result.cost, tokens: result.tokens };
}


// =====================================================================
// IMAGE PROMPT ENRICHMENT (two-stage)
// Cheap call to gpt-4o-mini that turns a basic scene prompt into a
// detail-rich one matching ChatGPT-style background expansion.
// =====================================================================
async function enrichImagePrompt(styleAnchor, basicPrompt, pageText, characters, password) {
  const charBlock = (characters && characters.length > 0)
    ? characters.map(c => `- ${c.name}: ${c.visual_description}`).join('\n')
    : '(none — generic scene)';

  const prompt = `Take this basic illustration brief and turn it into a vivid, detail-rich prompt for an AI image model.

ADD these enrichments:
- Specific composition / camera angle (close-up, wide shot, over-the-shoulder, top-down, etc)
- Lighting and mood (warm afternoon sun, dim candlelight, moonlight, etc)
- Active verbs — show what's happening, not static description
- Sensory details (textures, colors, atmosphere)
- Keep the SAME scene, characters, and key visual elements — don't change the content
- Stay in the specified illustration style

OUTPUT: a single paragraph prompt for the image model. No JSON, no commentary, just the prompt.

Illustration style: ${styleAnchor}

Basic prompt: ${basicPrompt}

Page text being illustrated (image should match this exactly):
"${pageText}"

Characters that may appear:
${charBlock}

Output the enriched image prompt now:`;

  const requestBody = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  };

  const result = await callOpenAIChatRaw(requestBody, password);
  return { enriched: result.text.trim(), cost: result.cost, tokens: result.tokens };
}

// Variant that returns raw text (not JSON-parsed)
async function callOpenAIChatRaw(requestBody, password) {
  const response = await fetch(`${WORKER_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Password': password },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API call failed (HTTP ${response.status}): ${errText}`);
  }
  const data = await response.json();
  const text = data.choices[0].message.content;
  const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0 };
  const isMini = requestBody.model && requestBody.model.includes('mini');
  const inputRate = isMini ? PRICING.miniInputPer1M : PRICING.inputPer1M;
  const outputRate = isMini ? PRICING.miniOutputPer1M : PRICING.outputPer1M;
  const cost = (usage.prompt_tokens * inputRate / 1e6) + (usage.completion_tokens * outputRate / 1e6);
  return { text, cost, tokens: usage };
}


// =====================================================================
// IMAGE GENERATION (gpt-image-1)
// =====================================================================
function buildImagePrompt(styleAnchor, scenePrompt, characters, useFallback) {
  const parts = [];
  if (styleAnchor) {
    parts.push(`Illustration style: ${styleAnchor}. Maintain this exact style consistently across all images in this story.`);
  }
  parts.push(`Scene: ${scenePrompt}`);
  if (characters && characters.length > 0) {
    parts.push(`Character references (use these exact names and appearances when mentioned in the scene):`);
    characters.forEach(c => {
      parts.push(`- ${c.name}: ${c.visual_description}`);
    });
  }
  if (useFallback) {
    parts.push(`The characters in this image are ORIGINAL CREATIONS for this story. Do not interpret them as references to any existing copyrighted or trademarked characters from films, games, or shows. Render them based solely on the descriptions provided.`);
  }
  parts.push(`TEXT RULES: Do NOT add ANY text overlays, captions, narration, titles, or speech/thought bubbles. No words floating on the image, no "The End", no dialogue or caption bubbles of any kind. The ONLY text allowed is incidental text that naturally belongs to an object in the scene itself — e.g. on a sign, a book cover, a label, or clothing. Never add text that describes, narrates, or quotes the scene.`);
  if (styleAnchor) {
    parts.push(`Reminder: render in this exact style: ${styleAnchor}.`);
  }
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
        headers: { 'Content-Type': 'application/json', 'X-App-Password': password },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 401) throw new Error('Wrong password. Open Settings to reset.');
      if (response.status >= 500 && attempt === 0) {
        lastError = new Error(`Image API error (HTTP ${response.status}) — retrying`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      if (!response.ok) {
        const errText = await response.text();
        // Detect content policy violations
        const err = new Error(`Image generation failed (HTTP ${response.status}): ${errText}`);
        if (response.status === 400 && /content_policy|policy_violation|safety/i.test(errText)) {
          err.isContentPolicy = true;
        }
        throw err;
      }

      const data = await response.json();
      const b64 = data.data && data.data[0] && data.data[0].b64_json;
      if (!b64) throw new Error('No image data in response');

      const cost = costForImage(quality, size);
      return { b64, cost, rawResponse: data, prompt: fullPrompt };
    } catch (err) {
      lastError = err;
      if (attempt === 0 && /5\d\d/.test(err.message)) {
        await new Promise(r => setTimeout(r, 1000));
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
        { page_number: 1, text: 'Once upon a time, in a quiet forest where the trees whispered lullabies, lived a small fox named Pip. Pip had soft amber fur and big curious eyes.', image_prompt: 'A small amber fox sneaking through ferns in a quiet moonlit forest, curious eyes wide.' },
        { page_number: 2, text: 'One evening, Pip discovered a glowing acorn beneath the oldest oak tree. It shimmered like a tiny captured star.', image_prompt: 'Close-up of Pip the fox crouched at the base of an enormous oak, paw touching a glowing acorn.' },
        { page_number: 3, text: 'When Pip picked it up, the forest hummed with magic. All the sleepy creatures opened their eyes just a little, smiling.', image_prompt: 'Wide shot of a forest at night with subtle magical glow, small animals peeking from burrows.' },
        { page_number: 4, text: 'Pip placed the acorn back where it belonged. The forest let out a contented sigh, and Pip curled up and drifted to sleep.', image_prompt: 'Pip curled up sleeping next to the glowing acorn, peaceful starlit watercolor.' },
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
  if (costInDollars < 0.01) {
    if (costInDollars <= 0) return [];
    return [{ type: 'penny', count: 1, partial: costInDollars / 0.01 }];
  }
  let remaining = Math.round(costInDollars * 100) / 100;
  const result = [];
  const denominations = [
    { type: 'quarter', value: 0.25 },
    { type: 'dime',    value: 0.10 },
    { type: 'nickel',  value: 0.05 },
    { type: 'penny',   value: 0.01 },
  ];
  for (const d of denominations) {
    const c = Math.floor(remaining / d.value + 1e-9);
    if (c > 0) {
      result.push({ type: d.type, count: c, partial: 1 });
      remaining -= c * d.value;
      remaining = Math.round(remaining * 100) / 100;
    }
  }
  return result;
}

function formatCostFriendly(cost) {
  if (cost <= 0) return '0¢';
  if (cost < 0.01) return '<1¢';
  if (cost < 1.00) return `${Math.round(cost * 100)}¢`;
  return `$${cost.toFixed(2)}`;
}


// =====================================================================
// COST ESTIMATE (before generation)
// =====================================================================
function estimateStoryCost(formData, quality) {
  const lengthInfo = LENGTH_PRESETS[formData.length] || LENGTH_PRESETS.regular;
  const numImages = 1 + lengthInfo.total_pages;
  const q = quality || 'medium';
  const perImage = (PRICING.image['1024x1024'][q] || PRICING.image['1024x1024'].medium);
  const imageCost = numImages * perImage;
  const textCost = 0.030;             // ~estimate for GPT-4o story generation
  const enrichmentCost = numImages * 0.0003;
  return textCost + imageCost + enrichmentCost;
}


// =====================================================================
// VISION: analyze a character photo — focus ONLY on the main subject
// =====================================================================
async function analyzeCharacterPhoto(base64DataUrl, password) {
  const prompt = `You are helping an artist design an ORIGINAL, fictional cartoon character inspired by a reference photo. Describe the visual appearance of the MAIN SUBJECT so the artist can capture a good resemblance in an original cartoon illustration. Do NOT identify, name, or guess who the person is — simply describe the visual features you can see, the way an artist would note them.

FOCUS:
- Describe ONLY the main subject (person / drawing / toy). IGNORE the background, surroundings, surfaces, other people, furniture, and decor entirely.
- If a person is centered with stuff around them, describe only the person.
- For a drawing or toy, describe only the drawing/toy itself (not the desk, hand, bed, etc).

For a person, capture these appearance details accurately so the cartoon resembles them (describe what you actually see, don't default to generic features):
- Skin tone
- Hair: color, texture, and style
- Eye color and shape
- Eyeglasses (and frame shape/style) if worn; facial hair (beard / mustache / stubble) if present
- Approximate age range
- Face shape and distinctive features (freckles, dimples, expression)
- Build / posture / energy
- Clothing and accessories actually worn (specific colors and style)

For drawings/toys: art style, materials, and colors of the subject itself.

Write a single descriptive paragraph (~100–150 words) of the subject's appearance. Be specific and concrete so the cartoon looks like them. No commentary or preamble — just the description.`;

  const requestBody = {
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: base64DataUrl } }
      ]
    }],
    temperature: 0.6,
  };

  const result = await callOpenAIChatRaw(requestBody, password);
  return { description: result.text.trim(), cost: result.cost, tokens: result.tokens };
}

// Detect when the vision model refused instead of describing (privacy guardrail).
function isVisionRefusal(text) {
  if (!text) return true;
  const t = text.toLowerCase();
  const refusalish = /(i'?m sorry|i can'?t|i cannot|i am unable|i'?m unable|can'?t help|cannot help|can'?t assist|won'?t be able|not able to (?:help|identify|describe))/;
  // A refusal is short and matches; a real description is long
  return refusalish.test(t) && text.trim().length < 240;
}


// =====================================================================
// STORY SUMMARY — (re)generate a short summary from the story text
// (used by the one-time "Update Summaries" pass)
// =====================================================================
async function generateStorySummary(story, password) {
  const text = (story.pages || []).map(p => p.text || '').join('\n\n');
  const prompt = `Write a brief, inviting 2-sentence summary (about 30-45 words) of this children's story. No spoilers about the ending. Return ONLY the summary text, nothing else.

Title: ${story.title || '(untitled)'}

Story:
${text}`;

  const requestBody = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  };
  const result = await callOpenAIChatRaw(requestBody, password);
  return { summary: result.text.trim(), cost: result.cost };
}


// =====================================================================
// CHARACTER THUMBNAIL — cartoon portrait headshot (low quality, cheap)
// =====================================================================
async function generateCharacterThumbnail(visualDescription, password) {
  const prompt = `Portrait avatar of this character:

${visualDescription}

COMPOSITION RULES (must follow):
- Avatar headshot framing — show the character CENTERED with breathing room on all sides so it crops nicely as a circular avatar.
- ANATOMY: Show ONLY what the description actually includes. If the character has no neck, no body, no torso, or no shoulders (e.g. a floating head, a disembodied face, an orb, a creature without a body), do NOT invent or add a neck, shoulders, or body. Render exactly the form described — nothing more.
- Character is the ONLY thing in the image — no scene, no background scenery, no other objects, no text.
- Plain transparent background (or solid simple color if transparency isn't possible).

STYLE:
- Friendly children's book character icon style
- Clean simple outlines
- Flat simple colors
- Warm, inviting expression`;

  const requestBody = {
    model: 'gpt-image-1',
    prompt,
    size: '1024x1024',
    quality: 'low',
    n: 1,
  };

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${WORKER_URL}/v1/images/generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-App-Password': password },
        body: JSON.stringify(requestBody),
      });
      if (response.status >= 500 && attempt === 0) {
        lastError = new Error(`Thumbnail server error (HTTP ${response.status}) — retrying`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Thumbnail generation failed (HTTP ${response.status}): ${errText}`);
      }
      const data = await response.json();
      const b64 = data.data && data.data[0] && data.data[0].b64_json;
      if (!b64) throw new Error('No thumbnail data in response');
      return { b64, cost: PRICING.image['1024x1024'].low, rawResponse: data };
    } catch (err) {
      lastError = err;
      if (attempt === 0 && /HTTP 5\d\d/.test(err.message)) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}


// =====================================================================
// SUPABASE (via the Cloudflare Worker)
// Thin wrappers around the Worker's /db/* and /img/* endpoints. The
// browser never holds the Supabase Secret Key — the Worker does.
// =====================================================================
async function workerPost(path, body, password) {
  const response = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Password': password },
    body: JSON.stringify(body || {}),
  });
  if (response.status === 401) throw new Error('Wrong password. Open Settings to reset.');
  let data = {};
  try { data = await response.json(); } catch (e) {}
  if (!response.ok || data.error) {
    throw new Error(data.error || `Worker error (HTTP ${response.status})`);
  }
  return data;
}

// ---- Database: stories ----
function dbUpsertStory(row, pw)   { return workerPost('/db/stories/upsert', row, pw); }
function dbDeleteStory(id, pw)    { return workerPost('/db/stories/delete', { id }, pw); }
function dbGetStory(id, pw)       { return workerPost('/db/stories/get', { id }, pw); }
function dbListStories(opts, pw)  { return workerPost('/db/stories/list', opts || {}, pw); }

// ---- Database: characters ----
function dbUpsertCharacter(row, pw) { return workerPost('/db/characters/upsert', row, pw); }
function dbDeleteCharacter(id, pw)  { return workerPost('/db/characters/delete', { id }, pw); }
function dbListCharacters(pw)       { return workerPost('/db/characters/list', {}, pw); }

// ---- Image storage ----
function imgUploadToCloud(id, b64, contentType, pw) {
  return workerPost('/img/upload', { id, b64, contentType }, pw);
}
function imgSignUrls(ids, pw)   { return workerPost('/img/sign', { ids }, pw); }
function imgDeleteCloud(ids, pw) { return workerPost('/img/delete', { ids }, pw); }
