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
const ROTATE_HINT_DISMISSED_KEY = 'storytime_rotate_hint_dismissed';

createApp({
  data() {
    return {
      appName: 'StoryTime',
      version: 'v0.6.1',
      buildDate: '2026-05-27',

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

      // Double-tap inspection
      lastTapTime: 0,
      lastTapTarget: null,
      inspectingImage: null,

      // Orientation
      isPortrait: window.matchMedia('(orientation: portrait)').matches,
      rotateHintDismissed: localStorage.getItem(ROTATE_HINT_DISMISSED_KEY) === 'true',

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

      showDebug: false,
      storageSize: 0,
      imageStats: { count: 0, bytes: 0 },
      skipImages: false,

      error: '',
    }
  },

  computed: {
    formattedCost() {
      return formatCostFriendly(this.currentStoryCost);
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
      // Newly created (no last_used_at) sort to the top, then by last_used_at desc
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

    totalReadingPages() {
      // cover + story pages + story complete page
      return this.currentStory ? this.currentStory.pages.length + 2 : 0;
    },
    isOnCover() { return this.currentPageIndex === 0; },
    isOnStoryComplete() {
      return this.currentStory && this.currentPageIndex === this.currentStory.pages.length + 1;
    },
    currentStoryPage() {
      if (!this.currentStory || this.isOnCover || this.isOnStoryComplete) return null;
      return this.currentStory.pages[this.currentPageIndex - 1];
    },
    isOnLastTextPage() {
      if (!this.currentStory) return false;
      return this.currentPageIndex === this.currentStory.pages.length;
    },
    currentDisplayPageNumber() {
      return this.currentPageIndex + 1;
    },
    formattedCreatedAt() {
      if (!this.currentStory || !this.currentStory.createdAt) return '';
      const d = new Date(this.currentStory.createdAt);
      return d.toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
    },
    showRotateHint() {
      return this.isPortrait && !this.rotateHintDismissed;
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

    // ---- Form ----
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
        const textResult = await generateStory(this.formData, selected, this.password);

        selected.forEach(c => touchCharacterLastUsed(c.id));
        this.characters = getStoredCharacters();

        const storyId = 'story_' + Date.now();
        const story = textResult.story;
        const pages = story.pages.map((p) => ({
          page_number: p.page_number,
          text: p.text,
          image_prompt: p.image_prompt,
          image_quality: p.image_quality || 'medium',
          image_id: null,
          image_status: 'pending',
          image_cost: 0,
          full_prompt: '',
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
          selected_characters: selected,
          formData: JSON.parse(JSON.stringify(this.formData)),
          character_ids: [...this.formData.selectedCharacterIds],
          character_roles: { ...this.formData.characterRoles },
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

        // Scroll reading view to top
        window.scrollTo(0, 0);

        // Generate images
        await this.generateAllImages(storyData);

      } catch (err) {
        console.error('Generation failed:', err);
        this.error = err.message || 'Something went wrong. Please try again.';
        this.loading = false;
      }
    },

    async generateAllImages(storyData) {
      const totalImages = 1 + storyData.pages.length;
      let doneCount = 0;

      // Cover (medium quality)
      this.loadingProgress = `Drawing cover (1 of ${totalImages})…`;
      await this.generateOneImage('cover', storyData);
      doneCount++;

      // Each page (quality per page from GPT-4o)
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

      const quality = target === 'cover' ? 'medium' : (slot.image_quality || 'medium');

      const fullPrompt = buildImagePrompt(
        storyData.style_anchor,
        target === 'cover'
          ? `Book cover for "${storyData.title}". ${slot.image_prompt}`
          : slot.image_prompt,
        storyData.selected_characters,
      );
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
      }
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
        image_quality: p.image_quality || 'medium',
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
    canGoNext() {
      return this.currentStory && this.currentPageIndex < this.totalReadingPages - 1;
    },
    canGoPrev() {
      return this.currentPageIndex > 0;
    },
    readAgain() {
      this.currentPageIndex = 0;
      window.scrollTo(0, 0);
    },

    dismissRotateHint() {
      this.rotateHintDismissed = true;
      localStorage.setItem(ROTATE_HINT_DISMISSED_KEY, 'true');
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
    // IMAGE INSPECTION (double-tap / double-click)
    // ============================================================
    handleImageTap(target) {
      const now = Date.now();
      const DOUBLE_TAP_MS = 350;
      if (now - this.lastTapTime < DOUBLE_TAP_MS && this.lastTapTarget === target) {
        // Double tap detected
        this.openImageInspection(target);
        this.lastTapTime = 0;
        this.lastTapTarget = null;
      } else {
        this.lastTapTime = now;
        this.lastTapTarget = target;
      }
    },
    openImageInspection(target) {
      if (!this.currentStory) return;
      const slot = target === 'cover' ? this.currentStory.cover : this.currentStory.pages[target];
      this.inspectingImage = {
        target,
        full_prompt: slot.full_prompt || slot.image_prompt || '',
        image_prompt: slot.image_prompt,
        image_id: slot.image_id,
        cost: slot.image_cost,
        status: slot.image_status,
        quality: slot.image_quality || 'medium',
      };
    },
    closeImageInspection() {
      this.inspectingImage = null;
    },

    // ============================================================
    // IMAGE DISPLAY
    // ============================================================
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
    toggleSkipImages() { this.skipImages = !this.skipImages; },

    async copyToClipboard(text) {
      try { await navigator.clipboard.writeText(text); alert('Copied to clipboard'); }
      catch (e) { console.error('Clipboard write failed', e); }
    },

    // Template helper: format any cost with kid-friendly units (¢ vs $)
    formatCostFriendly(cost) {
      return formatCostFriendly(cost);
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
    tagline: '',
    user_description: '',
    visual_description: '',
    created_at: null,
    last_used_at: null,
  };
}
