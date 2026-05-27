// =====================================================================
// app.js — Main Vue Application
// =====================================================================

const { createApp } = Vue

function defaultFormData() {
  return {
    storyDetails: '',
    age: 5,
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
      // Version
      appName: 'StoryTime',
      version: 'v0.6',
      buildDate: '2026-05-26',

      // Splash
      showSplash: true,

      // Password
      password: '',
      passwordInput: '',
      showPasswordPrompt: false,

      // View: 'create' | 'story'
      view: 'create',

      // Loading
      loading: false,
      loadingMessage: '',
      loadingHint: '',
      loadingProgress: '',   // e.g. "Image 3 of 7" while images generate

      // Current story
      currentStory: null,             // full story object (with pages, cover, images)
      currentStoryCost: 0,
      currentStoryRecord: null,
      currentTextCost: 0,
      currentImagesCost: 0,
      currentPageIndex: 0,            // 0 = cover, 1..N = story pages, N+1 = end credits

      // Last gen context (debug)
      lastFormData: null,
      lastPrompt: '',
      lastRawResponse: null,
      lastTokens: null,

      // Long-press image inspection
      pressTimer: null,
      inspectingImage: null,          // { page_number, image_prompt, full_prompt, cost, regenerating }

      // Orientation
      isPortrait: window.matchMedia('(orientation: portrait)').matches,

      // Form data
      formData: defaultFormData(),

      // ---- Characters state ----
      characters: [],
      showCharactersModal: false,
      charModalMode: 'list',
      charForm: emptyCharForm(),
      enhancing: false,
      generatingRandom: false,
      isRandomNew: false,
      expandedCharIds: [],

      // ---- Selector options ----
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

      // Debug
      showDebug: false,
      storageSize: 0,
      imageStats: { count: 0, bytes: 0 },
      skipImages: false,    // debug flag — generate text only, use placeholders

      error: '',
    }
  },

  computed: {
    formattedCost() {
      return this.currentStoryCost > 0
        ? `$${this.currentStoryCost.toFixed(3)}`
        : '$0.000';
    },
    coinBreakdown() {
      return costToCoins(this.currentStoryCost);
    },
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
        if (!a.last_used_at && !b.last_used_at) return (b.created_at || '').localeCompare(a.created_at || '');
        if (!a.last_used_at) return 1;
        if (!b.last_used_at) return -1;
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

    // ---- Reading view derived state ----
    totalReadingPages() {
      // cover + story pages + end credits
      return this.currentStory ? this.currentStory.pages.length + 2 : 0;
    },
    isOnCover() { return this.currentPageIndex === 0; },
    isOnEndCredits() {
      return this.currentStory && this.currentPageIndex === this.currentStory.pages.length + 1;
    },
    currentStoryPage() {
      // returns the story page object for the current spread, or null for cover / end
      if (!this.currentStory || this.isOnCover || this.isOnEndCredits) return null;
      return this.currentStory.pages[this.currentPageIndex - 1];
    },
    currentDisplayPageNumber() {
      return this.currentPageIndex + 1;
    },
  },

  mounted() {
    console.log(`${this.appName} ${this.version} loaded ✓`);

    setTimeout(() => this.dismissSplash(), 1500);

    const stored = getStoredPassword();
    if (stored) this.password = stored;

    this.showDebug = getDebugMode();
    this.characters = getStoredCharacters();

    const sticky = getStickyPrefs();
    if (sticky) {
      if (sticky.age) this.formData.age = sticky.age;
      if (sticky.length) this.formData.length = sticky.length;
    }

    this.refreshStorageSize();
    this.refreshImageStats();

    // Listen for orientation changes
    window.matchMedia('(orientation: portrait)').addEventListener('change', (e) => {
      this.isPortrait = e.matches;
    });
  },

  methods: {

    // ---- Splash ----
    dismissSplash() {
      if (!this.showSplash) return;
      this.showSplash = false;
      if (!this.password) this.showPasswordPrompt = true;
    },

    // ---- Password ----
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
    },

    // ---- Form Ingredients ----
    toggleIngredient(value) {
      const idx = this.formData.ingredients.indexOf(value);
      if (idx !== -1) this.formData.ingredients.splice(idx, 1);
      else if (this.ingredientCount < MAX_INGREDIENTS) this.formData.ingredients.push(value);
    },
    isIngredientActive(v) { return this.formData.ingredients.includes(v); },
    isIngredientDisabled(v) { return this.ingredientsAtMax && !this.isIngredientActive(v); },

    selectThemePreset(t) {
      this.formData.theme = this.formData.theme === t ? '' : t;
    },

    handleResetForm() { this.formData = defaultFormData(); },

    // ============================================================
    // CHARACTERS modal
    // ============================================================
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
        user_description: char.user_description || '',
        visual_description: char.visual_description || '',
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
        this.charForm.visual_description = result.visual_description;
      } catch (err) {
        console.error('Enhance failed:', err);
        this.error = err.message || 'Could not enhance description. Try again.';
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
          user_description: result.character.user_description,
          visual_description: result.character.visual_description,
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
        user_description: this.charForm.user_description.trim(),
        visual_description: this.charForm.visual_description.trim(),
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

    // ============================================================
    // STORY GENERATION (text + images)
    // ============================================================

    async handleGenerate() {
      this.error = '';
      this.loading = true;
      this.loadingMessage = 'Writing your story…';
      this.loadingHint = loadingHintForLength(this.formData.length);
      this.loadingProgress = '';
      setStickyPrefs(this.formData);

      const selected = this.selectedCharacters.map(c => ({
        ...c,
        role: this.getCharacterRole(c.id),
      }));

      try {
        // STEP 1: Generate story text + image prompts
        const textResult = await generateStory(this.formData, selected, this.password);

        // Mark characters as used
        selected.forEach(c => touchCharacterLastUsed(c.id));
        this.characters = getStoredCharacters();

        // Build the in-memory story object with image placeholder slots
        const storyId = 'story_' + Date.now();
        const story = textResult.story;
        const pages = story.pages.map((p) => ({
          page_number: p.page_number,
          text: p.text,
          image_prompt: p.image_prompt,
          new_image: p.new_image,
          image_id: null,            // set after image is saved to IndexedDB
          image_status: 'pending',   // pending | loading | ready | failed
          image_cost: 0,
          full_prompt: '',           // the prompt actually sent
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
          },
          pages,
          selected_characters: selected,  // snapshot of characters at gen time
          formData: JSON.parse(JSON.stringify(this.formData)),
          character_ids: [...this.formData.selectedCharacterIds],
          character_roles: { ...this.formData.characterRoles },
          text_cost: textResult.cost,
          images_cost: 0,
          cost: textResult.cost,
          createdAt: new Date().toISOString(),
        };

        // Save debug context
        this.lastFormData = JSON.parse(JSON.stringify(this.formData));
        this.lastPrompt = textResult.prompt;
        this.lastRawResponse = textResult.rawResponse;
        this.lastTokens = textResult.tokens;

        // Set as current story; switch to reading view immediately (placeholders for images)
        this.currentStory = storyData;
        this.currentStoryRecord = storyData;
        this.currentTextCost = textResult.cost;
        this.currentImagesCost = 0;
        this.currentStoryCost = textResult.cost;
        this.currentPageIndex = 0;
        this.loading = false;
        this.view = 'story';

        // STEP 2: Generate images sequentially (cover first, then pages)
        await this.generateAllImages(storyData);

      } catch (err) {
        console.error('Generation failed:', err);
        this.error = err.message || 'Something went wrong. Please try again.';
        this.loading = false;
      }
    },

    // Sequentially generate cover + all page images, updating state as each completes
    async generateAllImages(storyData) {
      // Count how many images we'll do
      const newImagePages = storyData.pages.filter(p => p.new_image);
      const totalImages = 1 + newImagePages.length; // cover + per-page
      let doneCount = 0;

      // Cover
      this.loadingProgress = `Creating cover illustration (1 of ${totalImages})…`;
      await this.generateOneImage('cover', storyData);
      doneCount++;

      // Page images (only for new_image: true)
      for (let i = 0; i < storyData.pages.length; i++) {
        const page = storyData.pages[i];
        if (!page.new_image) {
          // Inherit previous page's image_id
          const prev = i > 0 ? storyData.pages[i - 1] : null;
          if (prev) {
            page.image_id = prev.image_id;
            page.image_status = prev.image_status;
            page.full_prompt = prev.full_prompt;
          }
          continue;
        }
        doneCount++;
        this.loadingProgress = `Creating illustration ${doneCount} of ${totalImages}…`;
        await this.generateOneImage(i, storyData);
      }

      // Save final story to localStorage
      saveStoryToStorage(storyData);
      this.refreshStorageSize();
      this.refreshImageStats();
      this.loadingProgress = '';
    },

    async generateOneImage(target, storyData) {
      // target: 'cover' or a page index (number)
      const slot = target === 'cover' ? storyData.cover : storyData.pages[target];
      slot.image_status = 'loading';

      const fullPrompt = buildImagePrompt(
        storyData.style_anchor,
        target === 'cover'
          ? `Book cover for "${storyData.title}". ${slot.image_prompt}`
          : slot.image_prompt,
        storyData.selected_characters,
      );
      slot.full_prompt = fullPrompt;

      // Debug: skip-images mode
      if (this.skipImages) {
        slot.image_status = 'skipped';
        slot.image_cost = 0;
        return;
      }

      try {
        const result = await generateImage(fullPrompt, this.password, { quality: 'medium', size: '1024x1024' });
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

        // Propagate image_id to pages that share this one
        if (typeof target === 'number') {
          for (let j = target + 1; j < storyData.pages.length; j++) {
            if (storyData.pages[j].new_image) break;
            storyData.pages[j].image_id = imageId;
            storyData.pages[j].image_status = 'ready';
            storyData.pages[j].full_prompt = fullPrompt;
          }
        }
      } catch (err) {
        console.error(`Image generation failed (${target}):`, err);
        slot.image_status = 'failed';
        slot.image_error = err.message;
      }
    },

    // Per-image regenerate (called from long-press inspection)
    async regenerateOneImage(target) {
      if (!this.currentStory) return;
      this.inspectingImage = null;
      await this.generateOneImage(target, this.currentStory);
      // Re-save story with updated image
      saveStoryToStorage(this.currentStory);
      this.refreshImageStats();
    },

    // Fake story for debug
    handleFakeStory() {
      this.error = '';
      const result = generateFakeStory(this.formData);
      // Build story data with placeholder image slots
      const storyId = 'story_' + Date.now();
      const story = result.story;
      const pages = story.pages.map((p) => ({
        page_number: p.page_number,
        text: p.text,
        image_prompt: p.image_prompt,
        new_image: p.new_image,
        image_id: null,
        image_status: 'skipped',
        image_cost: 0,
        full_prompt: p.image_prompt || '',
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
        },
        pages,
        selected_characters: [],
        formData: JSON.parse(JSON.stringify(this.formData)),
        character_ids: [],
        character_roles: {},
        text_cost: 0,
        images_cost: 0,
        cost: result.cost,
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
    },

    // ============================================================
    // READING VIEW NAV
    // ============================================================
    nextPage() {
      if (!this.currentStory) return;
      if (this.currentPageIndex < this.totalReadingPages - 1) {
        this.currentPageIndex++;
      }
    },
    prevPage() {
      if (this.currentPageIndex > 0) this.currentPageIndex--;
    },
    canGoNext() {
      return this.currentStory && this.currentPageIndex < this.totalReadingPages - 1;
    },
    canGoPrev() {
      return this.currentPageIndex > 0;
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
    editSettings() { this.view = 'create'; },
    backToStory() { this.view = 'story'; },

    handleContinueStory() {
      alert('Continue Story is coming soon! This will let you make a Part 2 using the same characters and setting.');
    },

    // ============================================================
    // IMAGE INSPECTION (long-press)
    // ============================================================
    handleImageMouseDown(target) {
      this.cancelPressTimer();
      this.pressTimer = setTimeout(() => {
        this.openImageInspection(target);
      }, 550);
    },
    handleImageMouseUp() {
      this.cancelPressTimer();
    },
    handleImageContextMenu(e, target) {
      // Right-click on desktop also opens inspection
      e.preventDefault();
      this.openImageInspection(target);
    },
    cancelPressTimer() {
      if (this.pressTimer) {
        clearTimeout(this.pressTimer);
        this.pressTimer = null;
      }
    },
    openImageInspection(target) {
      if (!this.currentStory) return;
      const slot = target === 'cover' ? this.currentStory.cover : this.currentStory.pages[target];
      this.inspectingImage = {
        target,
        full_prompt: slot.full_prompt || slot.image_prompt || '',
        image_prompt: slot.image_prompt,
        cost: slot.image_cost,
        status: slot.image_status,
      };
    },
    closeImageInspection() {
      this.inspectingImage = null;
    },

    // ============================================================
    // IMAGE DISPLAY HELPERS
    // ============================================================
    // Returns an object URL for an image_id, or null
    getImageURL(imageId) {
      if (!imageId) return null;
      // Cache object URLs on the slot itself
      if (this._urlCache && this._urlCache[imageId]) return this._urlCache[imageId];
      if (!this._urlCache) this._urlCache = {};
      // Async fetch — we set on cache and trigger an update via $forceUpdate
      getImageBlob(imageId).then((blob) => {
        if (blob) {
          this._urlCache[imageId] = URL.createObjectURL(blob);
          this.$forceUpdate();
        }
      });
      return null;
    },

    // ============================================================
    // DEBUG
    // ============================================================
    toggleDebug() {
      this.showDebug = !this.showDebug;
      setDebugMode(this.showDebug);
      this.refreshStorageSize();
      this.refreshImageStats();
    },
    refreshStorageSize() { this.storageSize = getStorageSizeBytes(); },
    async refreshImageStats() {
      try {
        this.imageStats = await getImageDBStats();
      } catch (e) {
        this.imageStats = { count: 0, bytes: 0 };
      }
    },
    handleClearStories() {
      if (!confirm('Clear all saved stories from this device? This cannot be undone.')) return;
      clearAllStories();
      this.refreshStorageSize();
    },
    async handleClearImages() {
      if (!confirm('Clear all stored images from this device? This cannot be undone.')) return;
      await clearAllImages();
      this.refreshImageStats();
    },
    toggleSkipImages() {
      this.skipImages = !this.skipImages;
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
  },

}).mount('#app')


function emptyCharForm() {
  return {
    id: null,
    name: '',
    user_description: '',
    visual_description: '',
    created_at: null,
    last_used_at: null,
  };
}
