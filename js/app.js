// =====================================================================
// app.js — Main Vue Application
// =====================================================================

const { createApp } = Vue

function defaultFormData() {
  return {
    storyDetails: '',
    ageRange: '6-7',
    length: 'regular',
    genre: 'surprise-me',
    artStyle: 'surprise-me',
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
      version: 'v0.6.5',
      buildDate: '2026-06-01',

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

      isPortrait: window.matchMedia('(orientation: portrait)').matches,

      showSettings: false,
      nextStoryQuality: 'medium',
      showInspect: false,

      useFallbackChars: {},
      copyrightModal: null,
      warningModal: null,  // Shows why a character is flagged

      // Swipe state
      touchStartX: null,
      touchStartY: null,

      formData: defaultFormData(),

      characters: [],
      showCharactersModal: false,
      charModalMode: 'list',
      charForm: emptyCharForm(),
      enhancing: false,
      generatingRandom: false,
      isRandomNew: false,
      expandedCharIds: [],
      showCharFallbackFields: false,
      charSearch: '',
      analyzingPhoto: false,

      // Quiz
      showQuiz: false,
      quizAnswers: {},
      quizRevealed: false,

      // Loading toast dismissal
      toastDismissed: false,

      // Per-story fallback tracking (counts per char)
      fallbackStats: {},  // { charId: { success: 0, fail: 0 } }

      genres: [
        { value: 'surprise-me',   emoji: '🎲', label: 'Surprise me' },
        { value: 'adventure',     emoji: '🗺️', label: 'Adventure' },
        { value: 'fairy-tale',    emoji: '🧚', label: 'Fairy Tale' },
        { value: 'fantasy',       emoji: '✨', label: 'Fantasy' },
        { value: 'sci-fi',        emoji: '🚀', label: 'Sci-Fi' },
        { value: 'pirates',       emoji: '🏴‍☠️', label: 'Pirates' },
        { value: 'superhero',     emoji: '🦸', label: 'Superhero' },
        { value: 'mystery',       emoji: '🔍', label: 'Mystery' },
        { value: 'spooky',        emoji: '👻', label: 'Spooky' },
        { value: 'animal-tales',  emoji: '🦊', label: 'Animal Tales' },
        { value: 'dinosaurs',     emoji: '🦖', label: 'Dinosaurs' },
        { value: 'slice-of-life', emoji: '🍰', label: 'Slice of Life' },
        { value: 'underwater',    emoji: '🌊', label: 'Underwater' },
        { value: 'western',       emoji: '🤠', label: 'Western' },
      ],
      artStyles: [
        { value: 'surprise-me',      emoji: '🎲', label: 'Surprise me' },
        { value: 'watercolor',       emoji: '🎨', label: 'Watercolor' },
        { value: 'pencil',           emoji: '✏️', label: 'Pencil Sketch (B&W)' },
        { value: 'colored-pencil',   emoji: '🌈', label: 'Colored Pencil' },
        { value: 'crayon',           emoji: '🖍️', label: 'Crayon' },
        { value: 'comic-book',       emoji: '📚', label: 'Comic Book' },
        { value: 'anime',            emoji: '🌸', label: 'Anime / Manga' },
        { value: 'pixel-art',        emoji: '👾', label: 'Pixel / Video Game' },
        { value: '3d-animation',     emoji: '🎬', label: '3D Animation' },
        { value: 'claymation',       emoji: '🏺', label: 'Claymation' },
        { value: 'building-blocks',  emoji: '🧱', label: 'Lego' },
        { value: 'stuffies',         emoji: '🐻', label: 'Stuffies' },
        { value: 'paper-cutouts',    emoji: '✂️', label: 'Paper Cutouts' },
        { value: 'storybook-ink',    emoji: '📜', label: 'Storybook Ink' },
      ],
      ingredients: [
        { value: 'funny',          emoji: '😄', label: 'Funny Moments' },
        { value: 'surprise',       emoji: '🎁', label: 'Surprise Twist' },
        { value: 'heartfelt',      emoji: '💝', label: 'Heartfelt' },
        { value: 'action-packed',  emoji: '⚡', label: 'Action-Packed' },
        { value: 'bedtime',        emoji: '🌙', label: 'Bedtime' },
        { value: 'puzzle',         emoji: '🧩', label: 'Clever Puzzle' },
        { value: 'magical-object', emoji: '🪄', label: 'Magical Object' },
        { value: 'battle',         emoji: '⚔️', label: 'Battle' },
      ],
      lengths: [
        { value: 'short',    label: 'Short',   subtitle: '~3 min' },
        { value: 'regular',  label: 'Regular', subtitle: '~5 min' },
        { value: 'long',     label: 'Long',    subtitle: '~8 min' },
      ],
      ageStages: [
        { value: '1-3',  label: 'Toddler',      emoji: '👶', range: '1-3' },
        { value: '4-5',  label: 'Preschool',    emoji: '🧒', range: '4-5' },
        { value: '6-7',  label: 'Early Reader', emoji: '📚', range: '6-7' },
        { value: '8-10', label: 'Older Kid',    emoji: '🎒', range: '8-10' },
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
    filteredCharacters() {
      const q = (this.charSearch || '').toLowerCase().trim();
      if (!q) return this.sortedCharacters;
      return this.sortedCharacters.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.tagline || '').toLowerCase().includes(q) ||
        (c.user_description || '').toLowerCase().includes(q)
      );
    },
    estimatedStoryCostNumber() {
      return estimateStoryCost(this.formData, this.nextStoryQuality);
    },
    estimatedStoryCostFormatted() {
      return formatCostFriendly(this.estimatedStoryCostNumber);
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
    handleResetForm() { this.formData = defaultFormData(); },

    // ---- Characters modal ----
    openCharactersModal() {
      this.charModalMode = 'list';
      this.charForm = emptyCharForm();
      this.isRandomNew = false;
      this.expandedCharIds = [];
      this.showCharFallbackFields = false;
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
      // Don't flag confirmed-safe or always-fallback or both-failed characters
      // (those have their own badges)
      if (char.confirmed_safe || char.always_use_fallback || char.image_gen_failed_both) return false;
      return isPossiblyProblematic(char.name) || isPossiblyProblematic(char.user_description);
    },
    // Smart badge logic using success/fail counts
    charStateBadge(char) {
      const successCount = char.fallback_success_count || 0;
      const failCount = char.fallback_fail_count || 0;
      // Only show X if always-fallback AND has failed AND never succeeded
      if (char.always_use_fallback && failCount > 0 && successCount === 0) {
        return { symbol: '❌', label: 'Failed', kind: 'failed', title: 'Images consistently fail even with generic backup — needs manual fix' };
      }
      if (char.always_use_fallback) {
        return { symbol: '🔁', label: 'Generic', kind: 'generic', title: 'Original was blocked; uses generic backup for images' };
      }
      if (this.charIsPossiblyProblematic(char)) {
        return { symbol: '⚠️', label: 'Untested', kind: 'warn', title: 'Name matches a known copyrighted character — may need backup if images fail' };
      }
      return null;
    },
    showCharBadgeExplanation(char) {
      const badge = this.charStateBadge(char);
      if (!badge) return;
      if (badge.kind === 'warn') {
        this.showCharacterWarning(char);
      } else if (badge.kind === 'generic') {
        const success = char.fallback_success_count || 0;
        const fail = char.fallback_fail_count || 0;
        alert(`"${char.name}" had its original description blocked by the image AI. We now use the generic backup description ("${char.safe_fallback_name}") for images.\n\nSuccess rate so far: ${success} succeeded / ${fail} failed.\n\nYou can adjust the generic description in the Edit screen.`);
      } else if (badge.kind === 'failed') {
        alert(`"${char.name}" could not be generated even with the generic backup. ${char.fallback_fail_count || 0} attempts failed, 0 succeeded.\n\nYou may need to edit the Generic Description (in Edit) to be more visually distinct from the copyrighted character, or pick a different character.`);
      }
    },
    showCharacterWarning(char) {
      const matches = [
        ...getProblematicMatches(char.name),
        ...getProblematicMatches(char.user_description),
      ];
      const unique = [...new Set(matches)];
      this.warningModal = {
        char,
        matches: unique,
      };
    },
    closeWarningModal() { this.warningModal = null; },
    markCharacterSafe() {
      if (!this.warningModal) return;
      setCharacterConfirmedSafe(this.warningModal.char.id, true);
      this.characters = getStoredCharacters();
      this.warningModal = null;
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
      this.showCharFallbackFields = false;
      this.charModalMode = 'create';
    },
    startEditCharacter(char) {
      this.charForm = {
        id: char.id,
        name: char.name,
        tagline: char.tagline || '',
        user_description: char.user_description || '',
        visual_description: char.visual_description || '',
        safe_fallback_name: char.safe_fallback_name || '',
        safe_fallback_visual_description: char.safe_fallback_visual_description || '',
        always_use_fallback: !!char.always_use_fallback,
        confirmed_safe: !!char.confirmed_safe,
        photo_id: char.photo_id || null,
        fallback_success_count: char.fallback_success_count || 0,
        fallback_fail_count: char.fallback_fail_count || 0,
        created_at: char.created_at,
        last_used_at: char.last_used_at,
      };
      this.isRandomNew = false;
      this.showCharFallbackFields = false;
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
        this.charForm.safe_fallback_name = result.safe_fallback_name || '';
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
          safe_fallback_name: result.character.safe_fallback_name || '',
          safe_fallback_visual_description: result.character.safe_fallback_visual_description || '',
          always_use_fallback: false,
          confirmed_safe: false,
          created_at: null,
          last_used_at: null,
        };
        this.isRandomNew = true;
        this.showCharFallbackFields = false;
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
        safe_fallback_name: (this.charForm.safe_fallback_name || '').trim(),
        safe_fallback_visual_description: (this.charForm.safe_fallback_visual_description || '').trim(),
        always_use_fallback: !!this.charForm.always_use_fallback,
        confirmed_safe: !!this.charForm.confirmed_safe,
        photo_id: this.charForm.photo_id || null,
        fallback_success_count: this.charForm.fallback_success_count || 0,
        fallback_fail_count: this.charForm.fallback_fail_count || 0,
        created_at: this.charForm.created_at || now,
        last_used_at: this.charForm.last_used_at || null,
      };
      saveCharacter(record);
      this.characters = getStoredCharacters();
      this.charForm = emptyCharForm();
      this.isRandomNew = false;
      this.charModalMode = 'list';
    },

    async handleDeleteCharacter(char) {
      if (!confirm(`Delete "${char.name}"? This cannot be undone.`)) return;
      // Clean up photo blob
      if (char.photo_id) {
        try { await deleteImageBlob(char.photo_id); } catch (e) {}
        if (this._urlCache) delete this._urlCache[char.photo_id];
      }
      deleteCharacter(char.id);
      this.characters = getStoredCharacters();
      const idx = this.formData.selectedCharacterIds.indexOf(char.id);
      if (idx !== -1) this.formData.selectedCharacterIds.splice(idx, 1);
      delete this.formData.characterRoles[char.id];
      this.refreshImageStats();
    },

    toggleAlwaysUseFallback() {
      this.charForm.always_use_fallback = !this.charForm.always_use_fallback;
    },
    toggleShowCharFallback() {
      this.showCharFallbackFields = !this.showCharFallbackFields;
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
      this.toastDismissed = false;
      setStickyPrefs(this.formData);

      const selected = this.selectedCharacters.map(c => ({
        ...c,
        role: this.getCharacterRole(c.id),
      }));

      selected.forEach(c => {
        if (c.always_use_fallback) this.useFallbackChars[c.id] = true;
      });

      try {
        // Story text always uses REAL character names
        const textResult = await generateStory(this.formData, selected, this.password);

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
          summary: story.summary || '',
          quiz: story.quiz || null,
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

        // After all images: mark characters confirmed_safe if no fallback was triggered
        if (Object.keys(this.useFallbackChars).length === 0) {
          storyData.selected_characters.forEach(c => {
            if (!c.confirmed_safe && !c.always_use_fallback) {
              c.confirmed_safe = true;
              setCharacterConfirmedSafe(c.id, true);
            }
          });
          this.characters = getStoredCharacters();
        }

        // Reset quality override
        this.nextStoryQuality = 'medium';
      } catch (err) {
        console.error('Generation failed:', err);
        this.error = err.message || 'Something went wrong. Please try again.';
        this.loading = false;
      }
    },

    // Returns characters with fallback name + description applied where flagged
    selectedCharsForPrompt(selected) {
      return selected.map(c => {
        if (this.useFallbackChars[c.id] && c.safe_fallback_visual_description) {
          return {
            ...c,
            name: c.safe_fallback_name || c.name,
            original_name: c.name,
            visual_description: c.safe_fallback_visual_description,
            use_fallback: true,
          };
        }
        return c;
      });
    },

    // Replace original character names in a prompt string with fallback names
    applyNameFallback(prompt, chars) {
      if (!prompt) return prompt;
      let result = prompt;
      chars.forEach(c => {
        if (c.use_fallback && c.original_name && c.name && c.original_name !== c.name) {
          const escaped = c.original_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp(escaped, 'gi');
          result = result.replace(re, c.name);
        }
      });
      return result;
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

      // Apply name fallback to the BASIC scene prompt before enrichment
      let basicScene = this.applyNameFallback(slot.image_prompt, charsForPrompt);
      let enrichedScene = basicScene;

      try {
        if (basicScene) {
          // For page text used in enrichment context, also apply name fallback
          const safePageText = this.applyNameFallback(pageText, charsForPrompt);
          const enrich = await enrichImagePrompt(
            storyData.style_anchor,
            basicScene,
            safePageText,
            charsForPrompt,
            this.password
          );
          enrichedScene = enrich.enriched;
          slot.enriched_prompt = enrichedScene;
          this.currentImagesCost += enrich.cost;
          this.currentStoryCost = this.currentTextCost + this.currentImagesCost;
          storyData.images_cost = this.currentImagesCost;
          storyData.cost = this.currentStoryCost;
        }
      } catch (err) {
        console.warn('Enrichment failed; using basic prompt', err);
      }

      // Detect if any character in this image is using fallback
      const anyFallback = charsForPrompt.some(c => c.use_fallback);
      const fullPrompt = buildImagePrompt(storyData.style_anchor, enrichedScene, charsForPrompt, anyFallback);
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

        // If any character was using fallback, this is a success for them
        if (anyFallback) this.trackFallbackSuccess(charsForPrompt);
      } catch (err) {
        console.error(`Image generation failed (${target}):`, err);
        slot.image_status = 'failed';
        slot.image_error = err.message;
        if (err.isContentPolicy) {
          // If we were already using fallback and still failed, track stats per char
          if (anyFallback) {
            charsForPrompt.forEach(c => {
              if (c.use_fallback) {
                incrementCharacterFallbackCount(c.id, false);
              }
            });
            this.characters = getStoredCharacters();
          } else {
            // First failure — offer fallback
            await this.handleCopyrightFailure(target, storyData);
          }
        }
      }
    },

    // Track fallback success when an image with a fallback char generates successfully
    trackFallbackSuccess(charsForPrompt) {
      charsForPrompt.forEach(c => {
        if (c.use_fallback) {
          incrementCharacterFallbackCount(c.id, true);
        }
      });
      this.characters = getStoredCharacters();
    },

    async handleCopyrightFailure(target, storyData) {
      const chars = storyData.selected_characters || [];
      const problematic = chars.filter(c =>
        !this.useFallbackChars[c.id] &&
        c.safe_fallback_visual_description &&
        (isPossiblyProblematic(c.name) || isPossiblyProblematic(c.user_description))
      );
      const candidates = problematic.length > 0
        ? problematic
        : chars.filter(c => !this.useFallbackChars[c.id] && c.safe_fallback_visual_description);

      if (candidates.length === 0) return;

      this.copyrightModal = {
        problematicChars: candidates,
        target,
      };
    },

    async confirmCopyrightFallback() {
      if (!this.copyrightModal) return;
      const { problematicChars, target } = this.copyrightModal;
      problematicChars.forEach(c => {
        this.useFallbackChars[c.id] = true;
        setCharacterAlwaysUseFallback(c.id, true);
      });
      this.characters = getStoredCharacters();
      this.copyrightModal = null;
      await this.generateOneImage(target, this.currentStory);
      saveStoryToStorage(this.currentStory);
      this.refreshImageStats();
    },

    cancelCopyrightFallback() { this.copyrightModal = null; },

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
        cover: { image_prompt: story.cover_image_prompt, image_id: null, image_status: 'skipped', image_cost: 0, full_prompt: story.cover_image_prompt, enriched_prompt: '' },
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

    // Swipe gestures for page navigation
    handleTouchStart(e) {
      if (e.touches && e.touches.length === 1) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
      }
    },
    handleTouchEnd(e) {
      if (this.touchStartX === null) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - this.touchStartX;
      const dy = touch.clientY - this.touchStartY;
      // Horizontal swipe: threshold 60px, vertical movement under 50px
      if (Math.abs(dx) > 60 && Math.abs(dy) < 50) {
        if (dx > 0) this.prevPage();
        else this.nextPage();
      }
      this.touchStartX = null;
      this.touchStartY = null;
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

    formatCostFriendly(cost) { return formatCostFriendly(cost); },

    // ============================================================
    // PHOTO CAPTURE for character creation
    // ============================================================
    triggerPhotoInput() {
      const el = this.$refs.photoInput;
      if (el) el.click();
    },
    async handlePhotoSelect(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      e.target.value = ''; // reset so same file can be re-picked

      this.analyzingPhoto = true;
      this.error = '';

      try {
        // Read as data URL
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.onerror = () => reject(new Error('Could not read file'));
          reader.readAsDataURL(file);
        });

        // Save photo blob to IndexedDB
        const photoId = `photo_${this.charForm.id || 'new'}_${Date.now()}`;
        // Delete previous photo if any
        if (this.charForm.photo_id) {
          try { await deleteImageBlob(this.charForm.photo_id); } catch (e) {}
          if (this._urlCache) delete this._urlCache[this.charForm.photo_id];
        }
        // Save as blob
        const blob = await (await fetch(dataUrl)).blob();
        await saveImageBlob(photoId, blob);
        this.charForm.photo_id = photoId;

        // Call vision API to analyze
        const result = await analyzeCharacterPhoto(dataUrl, this.password);
        const photoDesc = result.description;

        // Merge with existing user_description
        if (this.charForm.user_description && this.charForm.user_description.trim()) {
          this.charForm.user_description += '\n\nFrom photo: ' + photoDesc;
        } else {
          this.charForm.user_description = photoDesc;
        }

        this.refreshImageStats();
      } catch (err) {
        console.error('Photo analysis failed:', err);
        this.error = err.message || 'Could not analyze photo. Try again.';
      } finally {
        this.analyzingPhoto = false;
      }
    },
    async handleRemovePhoto() {
      if (!this.charForm.photo_id) return;
      if (!confirm('Remove this photo?')) return;
      try { await deleteImageBlob(this.charForm.photo_id); } catch (e) {}
      if (this._urlCache) delete this._urlCache[this.charForm.photo_id];
      this.charForm.photo_id = null;
      this.refreshImageStats();
    },

    // ============================================================
    // QUIZ
    // ============================================================
    openQuiz() {
      if (!this.currentStory || !this.currentStory.quiz) return;
      this.showQuiz = true;
      this.quizAnswers = {};
      this.quizRevealed = false;
    },
    closeQuiz() {
      this.showQuiz = false;
    },
    setQuizAnswer(qIdx, optIdx) {
      if (this.quizRevealed) return;
      this.quizAnswers = { ...this.quizAnswers, [qIdx]: optIdx };
    },
    revealQuizAnswers() {
      this.quizRevealed = true;
    },
    quizScore() {
      if (!this.currentStory || !this.currentStory.quiz) return { correct: 0, total: 0 };
      const qs = this.currentStory.quiz.comprehension || [];
      let correct = 0;
      qs.forEach((q, i) => { if (this.quizAnswers[i] === q.correct) correct++; });
      return { correct, total: qs.length };
    },
    quizAllAnswered() {
      if (!this.currentStory || !this.currentStory.quiz) return false;
      const qs = this.currentStory.quiz.comprehension || [];
      return qs.every((_, i) => this.quizAnswers[i] !== undefined);
    },

    // ============================================================
    // BODY SCROLL LOCK when any modal is open
    // ============================================================
    updateBodyScroll() {
      const anyOpen = this.showSettings || this.showCharactersModal ||
        this.copyrightModal || this.warningModal || this.inspectingImage ||
        this.showQuiz;
      document.body.style.overflow = anyOpen ? 'hidden' : '';
    },

    // ============================================================
    // LOADING TOAST
    // ============================================================
    loadingProgressPercentage() {
      // Parse "Drawing page X of N" or "Drawing cover (1 of N)…"
      const m = (this.loadingProgress || '').match(/(\d+)\s*(?:of|\/)\s*(\d+)/);
      if (m) {
        const done = parseInt(m[1], 10);
        const total = parseInt(m[2], 10);
        if (total > 0) return done / total;
      }
      return 0;
    },
    dismissToast() { this.toastDismissed = true; },
  },

  watch: {
    showSettings() { this.updateBodyScroll(); },
    showCharactersModal() { this.updateBodyScroll(); },
    copyrightModal() { this.updateBodyScroll(); },
    warningModal() { this.updateBodyScroll(); },
    inspectingImage() { this.updateBodyScroll(); },
    showQuiz() { this.updateBodyScroll(); },
  },

}).mount('#app')


function emptyCharForm() {
  return {
    id: null,
    name: '',
    tagline: '',
    user_description: '',
    visual_description: '',
    safe_fallback_name: '',
    safe_fallback_visual_description: '',
    always_use_fallback: false,
    confirmed_safe: false,
    photo_id: null,
    fallback_success_count: 0,
    fallback_fail_count: 0,
    created_at: null,
    last_used_at: null,
  };
}
