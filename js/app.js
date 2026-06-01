// =====================================================================
// app.js — Main Vue Application
// =====================================================================

const { createApp } = Vue

function defaultFormData() {
  return {
    storyDetails: '',
    ageRange: '5-6',
    length: 'regular',
    genre: 'surprise-me',
    ingredients: [],
    theme: '',
    selectedCharacterIds: [],
    characterRoles: {},
  };
}

const MAX_INGREDIENTS = 3;
const MAX_SELECTED_CHARACTERS = 5;

createApp({
  data() {
    return {
      appName: 'StoryTime',
      version: 'v0.6.2',
      buildDate: '2026-05-28',

      showSplash: true,

      password: '',
      passwordInput: '',
      showPasswordPrompt: false,

      view: 'create',

      loading: false,
      loadingMessage: '',
      loadingHint: '',
      loadingProgress: '',

      currentStory: null,
      currentStoryCost: 0,
      currentStoryRecord: null,
      currentTextCost: 0,
      currentImagesCost: 0,
      currentPageIndex: 0,

      lastFormData: null,
      lastPrompt: '',
      lastRawResponse: null,
      lastTokens: null,

      inspectingImage: null,

      // Orientation
      isPortrait: window.matchMedia('(orientation: portrait)').matches,

      // Settings menu
      showSettings: false,

      // Picture quality override — resets to 'medium' after each generation
      nextStoryQuality: 'medium',

      // Show inspect (ⓘ) button on images — parent toggle
      showInspect: false,

      // Copyright fallback runtime state (per story)
      useFallbackChars: {},  // { charId: true } — for current story
      copyrightModal: null,  // { problematicChars, target, retry }

      formData: defaultFormData(),

      characters: [],
      showCharactersModal: false,
      charModalMode: 'list',
      charForm: emptyCharForm(),
      enhancing: false,
      generatingRandom: false,
      isRandomNew: false,
      expandedCharIds: [],

      genres: [
        { value: 'surprise-me', emoji: '🎲', label: 'Surprise me' },
        { value: 'adventure',   emoji: '🗺️', label: 'Adventure' },
        { value: 'fairy-tale',  emoji: '🧚', label: 'Fairy Tale' },
        { value: 'fantasy',     emoji: '✨', label: 'Fantasy' },
        { value: 'sci-fi',      emoji: '🚀', label: 'Sci-Fi' },
        { value: 'pirates',     emoji: '🏴‍☠️', label: 'Pirates' },
        { value: 'superhero',   emoji: '🦸', label: 'Superhero' },
        { value: 'mystery',     emoji: '🔍', label: 'Mystery' },
        { value: 'spooky',      emoji: '👻', label: 'Spooky' },
        { value: 'animal-tales', emoji: '🦊', label: 'Animal Tales' },
      ],
      ingredients: [
        { value: 'funny',          emoji: '😄', label: 'Funny moments' },
        { value: 'surprise',       emoji: '🎁', label: 'Surprise twist' },
        { value: 'heartwarming',   emoji: '💝', label: 'Heartwarming' },
        { value: 'action-packed',  emoji: '⚡', label: 'Action-packed' },
        { value: 'bedtime',        emoji: '🌙', label: 'Bedtime' },
        { value: 'love-story',     emoji: '💌', label: 'Love story' },
        { value: 'puzzle',         emoji: '🧩', label: 'A clever puzzle' },
        { value: 'magical-object', emoji: '🪄', label: 'A magical object' },
        { value: 'sidekick',       emoji: '🐾', label: 'A funny sidekick' },
        { value: 'song',           emoji: '🎵', label: 'A song or rhyme' },
        { value: 'challenge',      emoji: '🏔️', label: 'A challenge' },
        { value: 'cliffhanger',    emoji: '📖', label: 'Cliffhanger' },
      ],
      themes: [
        'Family', 'Sharing', 'Bravery', 'Friendship', 'Kindness',
        'Honesty', 'Keep trying', 'Being curious', 'Helping others', 'Being yourself',
      ],
      lengths: [
        { value: 'short',       label: 'Short',      subtitle: '~2 min' },
        { value: 'regular',     label: 'Regular',    subtitle: '~5 min' },
        { value: 'long',        label: 'Long',       subtitle: '~8 min' },
        { value: 'extra-long',  label: 'Extra-Long', subtitle: '~12 min' },
      ],
      ageStages: [
        { value: '1-2',  label: 'Toddler',       range: '1-2' },
        { value: '3-4',  label: 'Preschool',     range: '3-4' },
        { value: '5-6',  label: 'Early Reader',  range: '5-6' },
        { value: '7-8',  label: 'Mid Reader',    range: '7-8' },
        { value: '9-10', label: 'Older Kid',     range: '9-10' },
      ],

      storageSize: 0,
      imageStats: { count: 0, bytes: 0 },
      skipImages: false,

      error: '',
    }
  },

  computed: {
    formattedCost() { return formatCostFriendly(this.currentStoryCost); },
    coinBreakdown() { return costToCoins(this.currentStoryCost); },
    ingredientCount() { return this.formData.ingredients.length; },
    ingredientsAtMax() { return this.ingredientCount >= MAX_INGREDIENTS; },
    formattedStorageSize() { return formatStorageSize(this.storageSize); },
    formattedImageStorageSize() { return formatStorageSize(this.imageStats.bytes); },

    selectedCharacters() {
      return this.formData.selectedCharacterIds
        .map(id => this.characters.find(c => c.id === id))
        .filter(Boolean);
    },
    selectedCharCount() { return this.formData.selectedCharacterIds.length; },
    charactersAtMax() { return this.selectedCharCount >= MAX_SELECTED_CHARACTERS; },

    sortedCharacters() {
      return [...this.characters].sort((a, b) => {
        const aNew = !a.last_used_at;
        const bNew = !b.last_used_at;
        if (aNew && !bNew) return -1;
        if (!aNew && bNew) return 1;
        if (aNew && bNew) return (b.created_at || '').localeCompare(a.created_at || '');
        return b.last_used_at.localeCompare(a.last_used_at);
      });
    },
    charFormCanSave() {
      return this.charForm.name.trim().length > 0
        && (this.charForm.visual_description || '').trim().length > 0;
    },
    charFormCanEnhance() {
      return this.charForm.name.trim().length > 0 && !this.enhancing;
    },

    totalStoryPages() { return this.currentStory ? this.currentStory.pages.length : 0; },
    totalReadingPages() { return this.currentStory ? this.totalStoryPages + 2 : 0; },
    isOnCover() { return this.currentPageIndex === 0; },
    isOnStoryToolbox() {
      return this.currentStory && this.currentPageIndex === this.totalStoryPages + 1;
    },
    currentStoryPage() {
      if (!this.currentStory || this.isOnCover || this.isOnStoryToolbox) return null;
      return this.currentStory.pages[this.currentPageIndex - 1];
    },
    isOnLastTextPage() {
      if (!this.currentStory) return false;
      return this.currentPageIndex === this.totalStoryPages;
    },

    pageCounterLabel() {
      if (!this.currentStory) return '';
      if (this.isOnCover) return 'Cover';
      if (this.isOnStoryToolbox) return 'End';
      return `Page ${this.currentPageIndex} of ${this.totalStoryPages}`;
    },

    formattedCreatedAt() {
      if (!this.currentStory || !this.currentStory.createdAt) return '';
      const d = new Date(this.currentStory.createdAt);
      return d.toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
    },
  },

  mounted() {
    console.log(`${this.appName} ${this.version} loaded ✓`);

    setTimeout(() => this.dismissSplash(), 1500);

    const stored = getStoredPassword();
    if (stored) this.password = stored;

    this.showInspect = getShowInspect();
    this.characters = getStoredCharacters();

    const sticky = getStickyPrefs();
    if (sticky) {
      if (sticky.ageRange) this.formData.ageRange = sticky.ageRange;
      if (sticky.length) this.formData.length = sticky.length;
    }

    this.refreshStorageSize();
    this.refreshImageStats();

    window.matchMedia('(orientation: portrait)').addEventListener('change', (e) => {
      this.isPortrait = e.matches;
      this.$nextTick(() => window.scrollTo(0, 0));
    });
  },

  methods: {

    dismissSplash() {
      if (!this.showSplash) return;
      this.showSplash = false;
      if (!this.password) this.showPasswordPrompt = true;
    },

    submitPassword() {
      if (!this.passwordInput.trim()) { this.error = 'Please enter a password.'; return; }
      this.password = this.passwordInput.trim();
      setStoredPassword(this.password);
      this.passwordInput = '';
      this.showPasswordPrompt = false;
      this.error = '';
    },
    resetPassword() {
      clearStoredPassword();
      this.password = '';
      this.showPasswordPrompt = true;
      this.showSettings = false;
    },

    toggleIngredient(value) {
      const idx = this.formData.ingredients.indexOf(value);
      if (idx !== -1) this.formData.ingredients.splice(idx, 1);
      else if (this.ingredientCount < MAX_INGREDIENTS) this.formData.ingredients.push(value);
    },
    isIngredientActive(v) { return this.formData.ingredients.includes(v); },
    isIngredientDisabled(v) { return this.ingredientsAtMax && !this.isIngredientActive(v); },
    selectThemePreset(t) { this.formData.theme = this.formData.theme === t ? '' : t; },
    handleResetForm() { this.formData = defaultFormData(); },

    // ---- Characters modal ----
    openCharactersModal() {
      this.charModalMode = 'list';
      this.charForm = emptyCharForm();
      this.isRandomNew = false;
      this.expandedCharIds = [];
      this.showCharactersModal = true;
    },
    closeCharactersModal() {
      this.showCharactersModal = false;
      this.charForm = emptyCharForm();
      this.isRandomNew = false;
    },
    handleModalX() {
      if (this.charModalMode === 'list') this.closeCharactersModal();
      else this.cancelCharForm();
    },
    toggleCharacterSelected(charId) {
      const idx = this.formData.selectedCharacterIds.indexOf(charId);
      if (idx === -1) {
        if (this.charactersAtMax) return;
        this.formData.selectedCharacterIds.push(charId);
        if (!this.formData.characterRoles[charId]) this.formData.characterRoles[charId] = 'none';
      } else {
        this.formData.selectedCharacterIds.splice(idx, 1);
        delete this.formData.characterRoles[charId];
      }
    },
    canAddCharacter(charId) { return this.isCharacterSelected(charId) || !this.charactersAtMax; },
    isCharacterSelected(charId) { return this.formData.selectedCharacterIds.includes(charId); },
    setCharacterRole(charId, role) { this.formData.characterRoles[charId] = role; },
    getCharacterRole(charId) { return this.formData.characterRoles[charId] || 'none'; },
    roleLabel(role) {
      if (role === 'good-guy') return 'Good Guy';
      if (role === 'bad-guy') return 'Bad Guy';
      return '';
    },
    formatRelative(iso) { return formatRelativeTime(iso); },
    isCharacterNew(char) { return !char.last_used_at; },
    charIsPossiblyProblematic(char) {
      return isPossiblyProblematic(char.name) || isPossiblyProblematic(char.user_description);
    },
    toggleCharProfileExpanded(charId) {
      const idx = this.expandedCharIds.indexOf(charId);
      if (idx === -1) this.expandedCharIds.push(charId);
      else this.expandedCharIds.splice(idx, 1);
    },
    isCharProfileExpanded(charId) { return this.expandedCharIds.includes(charId); },

    startCreateCharacter() {
      this.charForm = emptyCharForm();
      this.isRandomNew = false;
      this.charModalMode = 'create';
    },
    startEditCharacter(char) {
      this.charForm = {
        id: char.id,
        name: char.name,
        tagline: char.tagline || '',
        user_description: char.user_description || '',
        visual_description: char.visual_description || '',
        safe_fallback_visual_description: char.safe_fallback_visual_description || '',
        always_use_fallback: !!char.always_use_fallback,
        created_at: char.created_at,
        last_used_at: char.last_used_at,
      };
      this.isRandomNew = false;
      this.charModalMode = 'edit';
    },
    cancelCharForm() {
      this.charForm = emptyCharForm();
      this.isRandomNew = false;
      this.charModalMode = 'list';
    },

    async handleEnhance() {
      if (!this.charFormCanEnhance) return;
      this.enhancing = true;
      this.error = '';
      try {
        const result = await enhanceCharacterDescription(
          this.charForm.name.trim(),
          this.charForm.user_description.trim(),
          this.password,
        );
        this.charForm.tagline = result.tagline;
        this.charForm.visual_description = result.visual_description;
        this.charForm.safe_fallback_visual_description = result.safe_fallback_visual_description || '';
      } catch (err) {
        console.error('Enhance failed:', err);
        this.error = err.message || 'Could not bring character to life. Try again.';
      } finally {
        this.enhancing = false;
      }
    },

    async handleGenerateRandom() {
      this.generatingRandom = true;
      this.error = '';
      try {
        const result = await generateRandomCharacter(this.password);
        this.charForm = {
          id: null,
          name: result.character.name,
          tagline: result.character.tagline,
          user_description: result.character.user_description,
          visual_description: result.character.visual_description,
          safe_fallback_visual_description: result.character.safe_fallback_visual_description || '',
          always_use_fallback: false,
          created_at: null,
          last_used_at: null,
        };
        this.isRandomNew = true;
        this.charModalMode = 'create';
      } catch (err) {
        console.error('Random character failed:', err);
        this.error = err.message || 'Could not generate a random character. Try again.';
      } finally {
        this.generatingRandom = false;
      }
    },

    handleSaveCharacter() {
      if (!this.charFormCanSave) return;
      const now = new Date().toISOString();
      const record = {
        id: this.charForm.id || ('char_' + Date.now()),
        name: this.charForm.name.trim(),
        tagline: (this.charForm.tagline || '').trim(),
        user_description: this.charForm.user_description.trim(),
        visual_description: this.charForm.visual_description.trim(),
        safe_fallback_visual_description: (this.charForm.safe_fallback_visual_description || '').trim(),
        always_use_fallback: !!this.charForm.always_use_fallback,
        created_at: this.charForm.created_at || now,
        last_used_at: this.charForm.last_used_at || null,
      };
      saveCharacter(record);
      this.characters = getStoredCharacters();
      this.charForm = emptyCharForm();
      this.isRandomNew = false;
      this.charModalMode = 'list';
    },

    handleDeleteCharacter(char) {
      if (!confirm(`Delete "${char.name}"? This cannot be undone.`)) return;
      deleteCharacter(char.id);
      this.characters = getStoredCharacters();
      const idx = this.formData.selectedCharacterIds.indexOf(char.id);
      if (idx !== -1) this.formData.selectedCharacterIds.splice(idx, 1);
      delete this.formData.characterRoles[char.id];
    },

    toggleAlwaysUseFallback() {
      this.charForm.always_use_fallback = !this.charForm.always_use_fallback;
    },

    // ============================================================
    // STORY GENERATION
    // ============================================================
    async handleGenerate() {
      this.error = '';
      this.loading = true;
      this.loadingMessage = 'Writing your story…';
      this.loadingHint = loadingHintForLength(this.formData.length);
      this.loadingProgress = '';
      this.useFallbackChars = {};
      setStickyPrefs(this.formData);

      const selected = this.selectedCharacters.map(c => ({
        ...c,
        role: this.getCharacterRole(c.id),
      }));

      // Apply persistent always_use_fallback flag from character profiles
      selected.forEach(c => {
        if (c.always_use_fallback) this.useFallbackChars[c.id] = true;
      });

      try {
        const textResult = await generateStory(this.formData, this.selectedCharsForPrompt(selected), this.password);

        selected.forEach(c => touchCharacterLastUsed(c.id));
        this.characters = getStoredCharacters();

        const storyId = 'story_' + Date.now();
        const story = textResult.story;
        const pages = story.pages.map((p) => ({
          page_number: p.page_number,
          text: p.text,
          image_prompt: p.image_prompt,
          image_id: null,
          image_status: 'pending',
          image_cost: 0,
          full_prompt: '',
          enriched_prompt: '',
        }));

        const storyData = {
          id: storyId,
          parent_story_id: null,
          story_series_id: null,
          title: story.title,
          style_anchor: story.style_anchor || 'consistent children\'s storybook illustration style',
          cover: {
            image_prompt: story.cover_image_prompt,
            image_id: null,
            image_status: 'pending',
            image_cost: 0,
            full_prompt: '',
            enriched_prompt: '',
          },
          pages,
          selected_characters: selected,
          formData: JSON.parse(JSON.stringify(this.formData)),
          character_ids: [...this.formData.selectedCharacterIds],
          character_roles: { ...this.formData.characterRoles },
          quality_used: this.nextStoryQuality,
          text_cost: textResult.cost,
          images_cost: 0,
          cost: textResult.cost,
          rating: 0,
          createdAt: new Date().toISOString(),
        };

        this.lastFormData = JSON.parse(JSON.stringify(this.formData));
        this.lastPrompt = textResult.prompt;
        this.lastRawResponse = textResult.rawResponse;
        this.lastTokens = textResult.tokens;

        this.currentStory = storyData;
        this.currentStoryRecord = storyData;
        this.currentTextCost = textResult.cost;
        this.currentImagesCost = 0;
        this.currentStoryCost = textResult.cost;
        this.currentPageIndex = 0;
        this.loading = false;
        this.view = 'story';
        window.scrollTo(0, 0);

        await this.generateAllImages(storyData);

        // Reset quality override after generation
        this.nextStoryQuality = 'medium';
      } catch (err) {
        console.error('Generation failed:', err);
        this.error = err.message || 'Something went wrong. Please try again.';
        this.loading = false;
      }
    },

    // Returns characters with fallback descriptions applied where flagged
    selectedCharsForPrompt(selected) {
      return selected.map(c => {
        if (this.useFallbackChars[c.id] && c.safe_fallback_visual_description) {
          return { ...c, visual_description: c.safe_fallback_visual_description };
        }
        return c;
      });
    },

    async generateAllImages(storyData) {
      const totalImages = 1 + storyData.pages.length;
      let doneCount = 0;

      this.loadingProgress = `Drawing cover (1 of ${totalImages})…`;
      await this.generateOneImage('cover', storyData);
      doneCount++;

      for (let i = 0; i < storyData.pages.length; i++) {
        doneCount++;
        this.loadingProgress = `Drawing page ${i + 1} (${doneCount} of ${totalImages})…`;
        await this.generateOneImage(i, storyData);
      }

      saveStoryToStorage(storyData);
      this.refreshStorageSize();
      this.refreshImageStats();
      this.loadingProgress = '';
    },

    async generateOneImage(target, storyData) {
      const slot = target === 'cover' ? storyData.cover : storyData.pages[target];
      slot.image_status = 'loading';

      const quality = storyData.quality_used || 'medium';
      const charsForPrompt = this.selectedCharsForPrompt(storyData.selected_characters || []);
      const pageText = target === 'cover' ? '' : slot.text;

      // Step 1: Enrich the basic image prompt with gpt-4o-mini
      let enrichedScene = slot.image_prompt;
      try {
        if (slot.image_prompt) {
          const enrich = await enrichImagePrompt(
            storyData.style_anchor,
            slot.image_prompt,
            pageText,
            charsForPrompt,
            this.password
          );
          enrichedScene = enrich.enriched;
          slot.enriched_prompt = enrichedScene;
          // Track tiny enrichment cost
          this.currentImagesCost += enrich.cost;
          this.currentStoryCost = this.currentTextCost + this.currentImagesCost;
          storyData.images_cost = this.currentImagesCost;
          storyData.cost = this.currentStoryCost;
        }
      } catch (err) {
        console.warn('Enrichment failed; using basic prompt', err);
      }

      const fullPrompt = buildImagePrompt(storyData.style_anchor, enrichedScene, charsForPrompt);
      slot.full_prompt = fullPrompt;

      if (this.skipImages) {
        slot.image_status = 'skipped';
        slot.image_cost = 0;
        return;
      }

      try {
        const result = await generateImage(fullPrompt, this.password, { quality, size: '1024x1024' });
        const blob = base64ToBlob(result.b64, 'image/png');
        const imageId = `img_${storyData.id}_${target === 'cover' ? 'cover' : 'p' + target}_${Date.now()}`;
        await saveImageBlob(imageId, blob);

        slot.image_id = imageId;
        slot.image_status = 'ready';
        slot.image_cost = result.cost;

        this.currentImagesCost += result.cost;
        this.currentStoryCost = this.currentTextCost + this.currentImagesCost;
        storyData.images_cost = this.currentImagesCost;
        storyData.cost = this.currentStoryCost;
      } catch (err) {
        console.error(`Image generation failed (${target}):`, err);
        slot.image_status = 'failed';
        slot.image_error = err.message;

        // Copyright fallback flow
        if (err.isContentPolicy) {
          await this.handleCopyrightFailure(target, storyData);
        }
      }
    },

    // Show modal asking user to retry with fallback descriptions
    async handleCopyrightFailure(target, storyData) {
      const chars = storyData.selected_characters || [];
      const problematic = chars.filter(c =>
        !this.useFallbackChars[c.id] &&
        c.safe_fallback_visual_description &&
        (isPossiblyProblematic(c.name) || isPossiblyProblematic(c.user_description))
      );

      // If we can't identify a specific problematic char but the call failed,
      // still offer fallback for all selected characters with safe fallbacks available
      const candidates = problematic.length > 0
        ? problematic
        : chars.filter(c => !this.useFallbackChars[c.id] && c.safe_fallback_visual_description);

      if (candidates.length === 0) return; // nothing to fall back to

      this.copyrightModal = {
        problematicChars: candidates,
        target,
      };
    },

    async confirmCopyrightFallback() {
      if (!this.copyrightModal) return;
      const { problematicChars, target } = this.copyrightModal;

      // Mark these characters for fallback in this story
      problematicChars.forEach(c => {
        this.useFallbackChars[c.id] = true;
        // Persist preference on the character so future stories with this char default to fallback
        setCharacterAlwaysUseFallback(c.id, true);
      });
      this.characters = getStoredCharacters();

      // Update the selected_characters in storyData so debug + future regens use fallback
      this.currentStory.selected_characters = this.currentStory.selected_characters.map(c => {
        if (this.useFallbackChars[c.id] && c.safe_fallback_visual_description) {
          return { ...c, always_use_fallback: true };
        }
        return c;
      });

      this.copyrightModal = null;

      // Retry the failed image
      await this.generateOneImage(target, this.currentStory);
      saveStoryToStorage(this.currentStory);
      this.refreshImageStats();
    },

    cancelCopyrightFallback() {
      this.copyrightModal = null;
    },

    async regenerateOneImage(target) {
      if (!this.currentStory) return;
      this.inspectingImage = null;
      await this.generateOneImage(target, this.currentStory);
      saveStoryToStorage(this.currentStory);
      this.refreshImageStats();
    },

    handleFakeStory() {
      this.error = '';
      const result = generateFakeStory(this.formData);
      const storyId = 'story_' + Date.now();
      const story = result.story;
      const pages = story.pages.map((p) => ({
        page_number: p.page_number,
        text: p.text,
        image_prompt: p.image_prompt,
        image_id: null,
        image_status: 'skipped',
        image_cost: 0,
        full_prompt: p.image_prompt || '',
        enriched_prompt: '',
      }));
      const storyData = {
        id: storyId,
        parent_story_id: null,
        story_series_id: null,
        title: story.title,
        style_anchor: story.style_anchor,
        cover: {
          image_prompt: story.cover_image_prompt,
          image_id: null,
          image_status: 'skipped',
          image_cost: 0,
          full_prompt: story.cover_image_prompt,
          enriched_prompt: '',
        },
        pages,
        selected_characters: [],
        formData: JSON.parse(JSON.stringify(this.formData)),
        character_ids: [],
        character_roles: {},
        quality_used: 'medium',
        text_cost: 0,
        images_cost: 0,
        cost: result.cost,
        rating: 0,
        createdAt: new Date().toISOString(),
      };
      this.currentStory = storyData;
      this.currentStoryRecord = storyData;
      this.currentStoryCost = result.cost;
      this.currentTextCost = 0;
      this.currentImagesCost = 0;
      this.lastFormData = JSON.parse(JSON.stringify(this.formData));
      this.lastPrompt = result.prompt;
      this.lastRawResponse = result.rawResponse;
      this.lastTokens = result.tokens;
      this.currentPageIndex = 0;
      this.view = 'story';
      this.loadingProgress = '';
      window.scrollTo(0, 0);
    },

    // ============================================================
    // READING VIEW
    // ============================================================
    nextPage() {
      if (!this.currentStory) return;
      if (this.currentPageIndex < this.totalReadingPages - 1) {
        this.currentPageIndex++;
        window.scrollTo(0, 0);
      }
    },
    prevPage() {
      if (this.currentPageIndex > 0) {
        this.currentPageIndex--;
        window.scrollTo(0, 0);
      }
    },
    canGoNext() { return this.currentStory && this.currentPageIndex < this.totalReadingPages - 1; },
    canGoPrev() { return this.currentPageIndex > 0; },
    readAgain() {
      this.currentPageIndex = 0;
      window.scrollTo(0, 0);
    },

    handleRegenerate() {
      if (this.lastFormData) this.formData = JSON.parse(JSON.stringify(this.lastFormData));
      this.handleGenerate();
    },
    handleNewStory() {
      this.currentStory = null;
      this.currentStoryRecord = null;
      this.currentPageIndex = 0;
      this.view = 'create';
    },
    editSettingsForm() { this.view = 'create'; },
    backToStory() { this.view = 'story'; },

    handleContinueStory() {
      alert('Continue Story is coming soon! This will let you make a Part 2 using the same characters and setting.');
    },

    // ============================================================
    // IMAGE INSPECTION (via ⓘ button when Settings toggle is on)
    // ============================================================
    openImageInspection(target) {
      if (!this.currentStory) return;
      const slot = target === 'cover' ? this.currentStory.cover : this.currentStory.pages[target];
      this.inspectingImage = {
        target,
        full_prompt: slot.full_prompt || slot.image_prompt || '',
        image_prompt: slot.image_prompt,
        enriched_prompt: slot.enriched_prompt || '',
        image_id: slot.image_id,
        cost: slot.image_cost,
        status: slot.image_status,
      };
    },
    closeImageInspection() { this.inspectingImage = null; },

    getImageURL(imageId) {
      if (!imageId) return null;
      if (this._urlCache && this._urlCache[imageId]) return this._urlCache[imageId];
      if (!this._urlCache) this._urlCache = {};
      getImageBlob(imageId).then((blob) => {
        if (blob) {
          this._urlCache[imageId] = URL.createObjectURL(blob);
          this.$forceUpdate();
        }
      });
      return null;
    },

    // ============================================================
    // RATING
    // ============================================================
    setRating(stars) {
      if (!this.currentStory) return;
      this.currentStory.rating = stars;
      if (this.currentStoryRecord) {
        this.currentStoryRecord.rating = stars;
        saveStoryToStorage(this.currentStoryRecord);
      }
    },

    // ============================================================
    // SETTINGS
    // ============================================================
    openSettings() {
      this.showSettings = true;
      this.refreshStorageSize();
      this.refreshImageStats();
    },
    closeSettings() { this.showSettings = false; },
    setNextStoryQuality(q) { this.nextStoryQuality = q; },
    toggleShowInspect() {
      this.showInspect = !this.showInspect;
      setShowInspect(this.showInspect);
    },
    toggleSkipImages() { this.skipImages = !this.skipImages; },

    refreshStorageSize() { this.storageSize = getStorageSizeBytes(); },
    async refreshImageStats() {
      try { this.imageStats = await getImageDBStats(); }
      catch (e) { this.imageStats = { count: 0, bytes: 0 }; }
    },
    handleClearStories() {
      if (!confirm('Clear all saved stories? This cannot be undone.')) return;
      clearAllStories();
      this.refreshStorageSize();
    },
    async handleClearImages() {
      if (!confirm('Clear all stored images? This cannot be undone.')) return;
      await clearAllImages();
      this.refreshImageStats();
    },
    async copyToClipboard(text) {
      try { await navigator.clipboard.writeText(text); alert('Copied to clipboard'); }
      catch (e) { console.error('Clipboard write failed', e); }
    },

    async handleForceUpdate() {
      if (!confirm('Force update: clears all cached files and reloads. Continue?')) return;
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch (err) {
        console.error('Force update cleanup failed:', err);
      }
      window.location.href = window.location.pathname + '?_t=' + Date.now();
    },

    // Cost formatting wrapper for templates
    formatCostFriendly(cost) { return formatCostFriendly(cost); },
  },

}).mount('#app')


function emptyCharForm() {
  return {
    id: null,
    name: '',
    tagline: '',
    user_description: '',
    visual_description: '',
    safe_fallback_visual_description: '',
    always_use_fallback: false,
    created_at: null,
    last_used_at: null,
  };
}
