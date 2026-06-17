// =====================================================================
// app.js — Main Vue Application
// =====================================================================

const { createApp } = Vue

function defaultFormData() {
  return {
    createdBy: '',
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
      version: 'v0.7.1',
      buildDate: '2026-06-16',

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
      imageGenMode: 'all',  // 'all' | 'first-two' | 'skip'
      showInspect: false,

      useFallbackChars: {},
      copyrightModal: null,
      warningModal: null,

      // Swipe state
      touchStartX: null,
      touchStartY: null,

      // Created By suggestions
      createdBySuggestions: [],
      showCreatedBySuggestions: false,

      // Bumped whenever MRU changes so the MRU-sorted computeds recompute
      // (localStorage isn't reactive, so we need an explicit trigger).
      mruVersion: 0,

      // Cropper state
      showCropper: false,
      cropperInstance: null,
      cropperSrc: null,

      // Thumbnail generation state — IDs of characters whose thumbnail is
      // currently generating (in the background, so save/close don't wait)
      thumbnailGeneratingIds: [],
      // Guard against double-tap saving a character (caused disappearing chars)
      savingCharacter: false,

      // Reactive map of imageId -> object URL. Backs getImageURL so images
      // appear the instant they're ready (no more "flip a page to see the cover").
      imageUrls: {},

      // One-time cloud backup (migration) state
      migrating: false,
      migrateProgress: '',

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

      genresRaw: [
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
        { value: 'underwater',    emoji: '🌊', label: 'Underwater' },
        { value: 'western',       emoji: '🤠', label: 'Western' },
      ],
      artStylesRaw: [
        { value: 'surprise-me',      emoji: '🎲', label: 'Surprise me' },
        { value: 'watercolor',       emoji: '🎨', label: 'Watercolor' },
        { value: 'pencil',           emoji: '✏️', label: 'Pencil Sketch (B&W)' },
        { value: 'crayon',           emoji: '🖍️', label: 'Crayon' },
        { value: 'comic-book',       emoji: '📚', label: 'Comic Book' },
        { value: 'anime',            emoji: '🌸', label: 'Anime / Manga' },
        { value: 'pixel-art',        emoji: '👾', label: 'Retro Video Game' },
        { value: '3d-animation',     emoji: '🎬', label: '3D Animation' },
        { value: 'claymation',       emoji: '🏺', label: 'Claymation' },
        { value: 'building-blocks',  emoji: '🧱', label: 'Lego' },
        { value: 'stuffies',         emoji: '🐻', label: 'Stuffies' },
        { value: 'paper-cutouts',    emoji: '✂️', label: 'Paper Cutouts' },
        { value: 'chalkboard',       emoji: '📋', label: 'Chalkboard' },
      ],
      ingredientsRaw: [
        { value: 'funny',          emoji: '😄', label: 'Funny Moments' },
        { value: 'surprise',       emoji: '🎁', label: 'Surprise Twist' },
        { value: 'heartfelt',      emoji: '💝', label: 'Heartfelt' },
        { value: 'action-packed',  emoji: '⚡', label: 'Action-Packed' },
        { value: 'bedtime',        emoji: '🌙', label: 'Bedtime' },
        { value: 'puzzle',         emoji: '🧩', label: 'Clever Puzzle' },
        { value: 'magical-object', emoji: '🪄', label: 'Magical Object' },
        { value: 'battle',         emoji: '⚔️', label: 'Battle' },
        { value: 'race',           emoji: '🏎️', label: 'Race' },
        { value: 'save-the-day',   emoji: '🌟', label: 'Save the Day' },
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
      // Reflect image gen mode in estimate
      const fd = this.formData;
      const lengthInfo = LENGTH_PRESETS[fd.length] || LENGTH_PRESETS.regular;
      let imageCount = 1 + lengthInfo.total_pages;
      if (this.imageGenMode === 'first-two') imageCount = 2;
      else if (this.imageGenMode === 'skip') imageCount = 0;
      const q = this.nextStoryQuality || 'medium';
      const perImage = (PRICING.image['1024x1024'][q] || PRICING.image['1024x1024'].medium);
      const imageCost = imageCount * perImage;
      const textCost = 0.030;
      const enrichmentCost = imageCount * 0.0003;
      return textCost + imageCost + enrichmentCost;
    },
    estimatedStoryCostFormatted() {
      return formatCostFriendly(this.estimatedStoryCostNumber);
    },
    // MRU-sorted lists. Touch mruVersion so they recompute after touchMRU().
    genres() {
      this.mruVersion;
      return sortByMRU(this.genresRaw, STORAGE_KEYS.GENRE_MRU, 'surprise-me');
    },
    artStyles() {
      this.mruVersion;
      return sortByMRU(this.artStylesRaw, STORAGE_KEYS.ARTSTYLE_MRU, 'surprise-me');
    },
    ingredients() {
      this.mruVersion;
      return sortByMRU(this.ingredientsRaw, STORAGE_KEYS.INGREDIENT_MRU, null);
    },
    // Filtered By suggestions
    filteredCreatedBySuggestions() {
      const q = (this.formData.createdBy || '').toLowerCase().trim();
      if (!q) return this.createdBySuggestions;
      return this.createdBySuggestions.filter(s =>
        s.toLowerCase().includes(q) && s.toLowerCase() !== q
      );
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
    this.createdBySuggestions = getCreatedBySuggestions();

    window.matchMedia('(orientation: portrait)').addEventListener('change', (e) => {
      this.isPortrait = e.matches;
      this.$nextTick(() => window.scrollTo(0, 0));
    });

    // Desktop keyboard navigation for the reading view (arrow keys).
    // On-screen arrows were removed — touch uses swipe, desktop uses keys.
    this._keyHandler = (e) => {
      if (this.view !== 'story' || !this.currentStory) return;
      // Don't hijack keys while typing in a field
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      // Don't navigate while a modal is open over the story
      if (this.showSettings || this.showQuiz || this.inspectingImage ||
          this.copyrightModal || this.warningModal || this.showCharactersModal) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); this.nextPage(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); this.prevPage(); }
    };
    window.addEventListener('keydown', this._keyHandler);
  },

  beforeUnmount() {
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
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
      else this.handleCloseCharForm();
    },
    // Clicking the dark overlay: in list mode close the modal; in edit mode
    // auto-save & return to list (so accidental taps never lose generated work).
    handleCharOverlayClick() {
      if (this.charModalMode === 'list') this.closeCharactersModal();
      else this.handleCloseCharForm();
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
        photo_description: char.photo_description || '',
        visual_description: char.visual_description || '',
        safe_fallback_name: char.safe_fallback_name || '',
        safe_fallback_visual_description: char.safe_fallback_visual_description || '',
        always_use_fallback: !!char.always_use_fallback,
        confirmed_safe: !!char.confirmed_safe,
        photo_id: char.photo_id || null,
        thumbnail_id: char.thumbnail_id || null,
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
        // Combine main description + photo description for input to enhance
        let combined = (this.charForm.user_description || '').trim();
        if (this.charForm.photo_description && this.charForm.photo_description.trim()) {
          combined = combined
            ? combined + '\n\nFrom photo: ' + this.charForm.photo_description.trim()
            : this.charForm.photo_description.trim();
        }

        const result = await enhanceCharacterDescription(
          this.charForm.name.trim(),
          combined,
          this.password,
        );
        this.charForm.tagline = result.tagline;
        this.charForm.visual_description = result.visual_description;
        this.charForm.safe_fallback_name = result.safe_fallback_name || '';
        this.charForm.safe_fallback_visual_description = result.safe_fallback_visual_description || '';

        // Auto-(re)generate the avatar thumbnail every time Bring to Life runs.
        // Runs in the BACKGROUND so the user can keep editing / close right away.
        if (!this.charForm.id) this.charForm.id = 'char_' + Date.now();
        this.generateThumbnailInBackground(this.charForm.id, this.charForm.visual_description);
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

        // Random characters come with a full description — auto-make a thumbnail too.
        if (!this.charForm.id) this.charForm.id = 'char_' + Date.now();
        this.generateThumbnailInBackground(this.charForm.id, this.charForm.visual_description);
      } catch (err) {
        console.error('Random character failed:', err);
        this.error = err.message || 'Could not generate a random character. Try again.';
      } finally {
        this.generatingRandom = false;
      }
    },

    // Persist the current charForm to storage. Does NOT wait for the
    // thumbnail (that runs in the background). Returns true on success.
    saveCharacterRecord() {
      if (!this.charFormCanSave) return false;
      const now = new Date().toISOString();
      if (!this.charForm.id) this.charForm.id = 'char_' + Date.now();

      const record = {
        id: this.charForm.id,
        name: this.charForm.name.trim(),
        tagline: (this.charForm.tagline || '').trim(),
        user_description: this.charForm.user_description.trim(),
        photo_description: (this.charForm.photo_description || '').trim(),
        visual_description: this.charForm.visual_description.trim(),
        safe_fallback_name: (this.charForm.safe_fallback_name || '').trim(),
        safe_fallback_visual_description: (this.charForm.safe_fallback_visual_description || '').trim(),
        always_use_fallback: !!this.charForm.always_use_fallback,
        confirmed_safe: !!this.charForm.confirmed_safe,
        photo_id: this.charForm.photo_id || null,
        thumbnail_id: this.charForm.thumbnail_id || null,
        fallback_success_count: this.charForm.fallback_success_count || 0,
        fallback_fail_count: this.charForm.fallback_fail_count || 0,
        created_at: this.charForm.created_at || now,
        last_used_at: this.charForm.last_used_at || null,
      };
      try {
        saveCharacter(record);
      } catch (err) {
        if (err.isQuota) { this.error = err.message; return false; }
        throw err;
      }
      this.characters = getStoredCharacters();
      // Cloud sync — fire-and-forget
      syncPushCharacter(record).catch(e => console.warn('Cloud sync (character) failed:', e));
      return true;
    },

    // Single bottom button (Option B): saves if there's saveable content,
    // otherwise just discards, then returns to the list. The old top ✕ is gone.
    handleCloseCharForm() {
      if (this.savingCharacter) return;   // guard against double-tap
      this.savingCharacter = true;
      try {
        if (this.charFormCanSave) {
          const ok = this.saveCharacterRecord();
          if (!ok && this.error) return;  // quota error — stay on form so user sees it
        }
        this.charForm = emptyCharForm();
        this.isRandomNew = false;
        this.charModalMode = 'list';
      } finally {
        this.savingCharacter = false;
      }
    },

    async handleDeleteCharacter(char) {
      if (!confirm(`Delete "${char.name}"? This cannot be undone.`)) return;
      // Remove from the cloud too (best-effort)
      syncDeleteCharacter(char).catch(e => console.warn('Cloud delete (character) failed:', e));
      // Clean up photo + thumbnail blobs
      if (char.photo_id) {
        try { await deleteImageBlob(char.photo_id); } catch (e) {}
        this.releaseImageURL(char.photo_id);
      }
      if (char.thumbnail_id) {
        try { await deleteImageBlob(char.thumbnail_id); } catch (e) {}
        this.releaseImageURL(char.thumbnail_id);
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

      // Track MRU + Created By
      touchMRU(STORAGE_KEYS.GENRE_MRU, this.formData.genre);
      touchMRU(STORAGE_KEYS.ARTSTYLE_MRU, this.formData.artStyle);
      (this.formData.ingredients || []).forEach(i => touchMRU(STORAGE_KEYS.INGREDIENT_MRU, i));
      this.mruVersion++;  // trigger MRU-sorted computeds to refresh
      if (this.formData.createdBy && this.formData.createdBy.trim()) {
        addCreatedBySuggestion(this.formData.createdBy.trim());
        this.createdBySuggestions = getCreatedBySuggestions();
      }

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
          created_by: (this.formData.createdBy || '').trim(),
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
        this.applyStoryFontSize(storyData);

        const mode = this.imageGenMode || 'all';

        if (mode === 'skip') {
          // No images — mark everything skipped and open the book right away
          storyData.cover.image_status = 'skipped';
          storyData.pages.forEach(p => { if (p.image_status === 'pending') p.image_status = 'skipped'; });
          this.loading = false;
          this.view = 'story';
          window.scrollTo(0, 0);
          this.persistStory(storyData);
        } else {
          // Draw the COVER first and keep the loading screen up until it's ready,
          // so the book opens with its title page fully drawn.
          this.loadingMessage = 'Drawing the cover…';
          await this.generateOneImage('cover', storyData);

          // Cover is ready (or failed) — open the book now
          this.loading = false;
          this.view = 'story';
          window.scrollTo(0, 0);

          // Draw the remaining pages in the BACKGROUND, several at a time,
          // so they stream in while you start reading.
          await this.generateRemainingImages(storyData, mode);
        }

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

        // Reset quality + image gen overrides
        this.nextStoryQuality = 'medium';
        this.imageGenMode = 'all';
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

    // Save a story locally, then push it to the cloud (best-effort).
    persistStory(storyData) {
      try {
        saveStoryToStorage(storyData);
      } catch (err) {
        if (err.isQuota) { this.error = err.message; alert(err.message); }
        else throw err;
      }
      this.refreshStorageSize();
      this.refreshImageStats();
      // Cloud sync — fire-and-forget; local save already succeeded
      syncPushStory(storyData).catch(e => console.warn('Cloud sync (story) failed:', e));
    },

    // Draw the page images (the cover is drawn separately, before this).
    // Uses a small concurrency pool so several images render at once — roughly
    // halves the wait — without tripping the image API's rate limits. Image
    // quality is unaffected: each image is an independent API call.
    async generateRemainingImages(storyData, mode) {
      let pageIndices;
      if (mode === 'first-two') {
        pageIndices = storyData.pages.length > 0 ? [0] : [];
        // Mark the rest skipped so the UI shows a clean placeholder
        storyData.pages.forEach((p, i) => {
          if (i !== 0 && p.image_status === 'pending') p.image_status = 'skipped';
        });
      } else {
        pageIndices = storyData.pages.map((_, i) => i);
      }

      const CONCURRENCY = 3;
      let cursor = 0;
      const worker = async () => {
        while (cursor < pageIndices.length) {
          const pageIdx = pageIndices[cursor++];
          await this.generateOneImage(pageIdx, storyData);
        }
      };
      const pool = [];
      for (let i = 0; i < Math.min(CONCURRENCY, pageIndices.length); i++) pool.push(worker());
      await Promise.all(pool);

      this.persistStory(storyData);
      this.loadingProgress = '';
    },

    // ============================================================
    // Dynamic font size based on words per page
    // ============================================================
    applyStoryFontSize(storyData) {
      if (!storyData || !storyData.pages || !storyData.pages.length) return;
      const totalWords = storyData.pages.reduce(
        (sum, p) => sum + ((p.text || '').split(/\s+/).filter(Boolean).length), 0
      );
      const avg = totalWords / storyData.pages.length;
      let size;
      if (avg < 40)       size = '1.3rem';
      else if (avg < 60)  size = '1.2rem';
      else if (avg < 80)  size = '1.1rem';
      else if (avg < 100) size = '1.0rem';
      else                size = '0.95rem';
      document.documentElement.style.setProperty('--story-text-size', size);
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
        // Compress PNG → JPEG (~80-90% smaller, visually identical for art)
        // before caching locally and uploading to the cloud.
        const pngBlob = base64ToBlob(result.b64, 'image/png');
        const blob = await compressToJpeg(pngBlob);
        const imageId = `img_${storyData.id}_${target === 'cover' ? 'cover' : 'p' + target}_${Date.now()}`;
        await saveImageBlob(imageId, blob);

        // Publish the object URL reactively so the image appears immediately
        // (we already have the blob in memory — no round-trip to IndexedDB).
        this.imageUrls[imageId] = URL.createObjectURL(blob);

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

    // Returns a promise that resolves once the user decides (confirm/cancel).
    // Blocking so that with parallel generation the fallback choice is applied
    // before more images are drawn. Only ONE modal at a time — if one is already
    // open, other concurrent failures resolve immediately (their images stay
    // "failed" with a Try Again button, and any not-yet-drawn pages will use the
    // fallback once it's confirmed).
    handleCopyrightFailure(target, storyData) {
      const chars = storyData.selected_characters || [];
      const problematic = chars.filter(c =>
        !this.useFallbackChars[c.id] &&
        c.safe_fallback_visual_description &&
        (isPossiblyProblematic(c.name) || isPossiblyProblematic(c.user_description))
      );
      const candidates = problematic.length > 0
        ? problematic
        : chars.filter(c => !this.useFallbackChars[c.id] && c.safe_fallback_visual_description);

      if (candidates.length === 0) return Promise.resolve();
      if (this.copyrightModal) return Promise.resolve();  // already handling one

      return new Promise((resolve) => {
        this.copyrightModal = {
          problematicChars: candidates,
          target,
          _resolve: resolve,
        };
      });
    },

    async confirmCopyrightFallback() {
      if (!this.copyrightModal) return;
      const { problematicChars, target, _resolve } = this.copyrightModal;
      problematicChars.forEach(c => {
        this.useFallbackChars[c.id] = true;
        setCharacterAlwaysUseFallback(c.id, true);
      });
      this.characters = getStoredCharacters();
      this.copyrightModal = null;
      await this.generateOneImage(target, this.currentStory);
      this.persistStory(this.currentStory);
      if (_resolve) _resolve();
    },

    cancelCopyrightFallback() {
      const resolve = this.copyrightModal && this.copyrightModal._resolve;
      this.copyrightModal = null;
      if (resolve) resolve();
    },

    async regenerateOneImage(target) {
      if (!this.currentStory) return;
      this.inspectingImage = null;
      await this.generateOneImage(target, this.currentStory);
      this.persistStory(this.currentStory);
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

    // Swipe gestures — orientation-aware
    // Portrait: vertical swipe (up = next, down = prev)
    // Landscape: horizontal swipe (left = next, right = prev)
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
      const TH = 60;
      if (this.isPortrait) {
        if (Math.abs(dy) > TH && Math.abs(dx) < TH) {
          if (dy < 0) this.nextPage();
          else this.prevPage();
        }
      } else {
        if (Math.abs(dx) > TH && Math.abs(dy) < TH) {
          if (dx > 0) this.prevPage();
          else this.nextPage();
        }
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
      // Reactive: once imageUrls[imageId] is set, Vue re-renders and the
      // image shows immediately — no manual $forceUpdate, no missed first paint.
      if (this.imageUrls[imageId]) return this.imageUrls[imageId];
      // Kick off the blob load exactly once per id
      if (!this._loadingUrls) this._loadingUrls = {};
      if (!this._loadingUrls[imageId]) {
        this._loadingUrls[imageId] = true;
        getImageBlob(imageId).then((blob) => {
          if (blob) this.imageUrls[imageId] = URL.createObjectURL(blob);
        }).finally(() => { this._loadingUrls[imageId] = false; });
      }
      return null;
    },
    // Free an object URL and drop it from the reactive map
    releaseImageURL(imageId) {
      if (!imageId) return;
      const url = this.imageUrls[imageId];
      if (url) { try { URL.revokeObjectURL(url); } catch (e) {} }
      delete this.imageUrls[imageId];
    },

    setRating(stars) {
      if (!this.currentStory) return;
      this.currentStory.rating = stars;
      if (this.currentStoryRecord) {
        this.currentStoryRecord.rating = stars;
        try { saveStoryToStorage(this.currentStoryRecord); } catch (e) { if (!e.isQuota) throw e; }
        // Sync the rating up (images already uploaded, so this is just metadata)
        syncPushStory(this.currentStoryRecord).catch(e => console.warn('Cloud sync (rating) failed:', e));
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
    setImageGenMode(m) {
      this.imageGenMode = m;
      // Mirror to skipImages flag for backward compat in any old code paths
      this.skipImages = (m === 'skip');
    },
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

    // One-time backup of all existing on-device data to the cloud
    async handleMigrateToCloud() {
      if (this.migrating) return;
      if (!confirm('Back up all your current characters and books to the cloud? This may take a few minutes depending on how many you have.')) return;
      this.migrating = true;
      this.migrateProgress = 'Starting…';
      try {
        const s = await syncMigrateAll((p) => { this.migrateProgress = p; });
        const failed = s.charsFail + s.storiesFail;
        this.migrateProgress =
          `Done! Characters ${s.charsOk}/${s.charsTotal}, Books ${s.storiesOk}/${s.storiesTotal}.` +
          (failed > 0 ? ` ${failed} failed — tap again to retry those.` : ' 🎉');
      } catch (e) {
        this.migrateProgress = 'Backup failed: ' + (e.message || 'unknown error');
      } finally {
        this.migrating = false;
      }
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
    // Single "Add Photo" button — the OS picker already offers
    // Camera / Photo Library / Choose File, so one input covers all cases.
    triggerAddPhoto() {
      const el = this.$refs.addPhotoInput;
      if (el) el.click();
    },
    async handlePhotoSelect(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      e.target.value = '';

      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.onerror = () => reject(new Error('Could not read file'));
          reader.readAsDataURL(file);
        });
        // Open cropper modal
        this.cropperSrc = dataUrl;
        this.showCropper = true;
        this.$nextTick(() => this.initCropper());
      } catch (err) {
        console.error('Photo read failed:', err);
        this.error = err.message || 'Could not read photo';
      }
    },
    initCropper() {
      const imgEl = this.$refs.cropperImg;
      if (!imgEl) return;
      // window.Cropper from cropperjs CDN
      if (typeof Cropper === 'undefined') {
        // No cropper available — bypass and use full image
        this.confirmCrop();
        return;
      }
      if (this.cropperInstance) {
        this.cropperInstance.destroy();
        this.cropperInstance = null;
      }
      this.cropperInstance = new Cropper(imgEl, {
        viewMode: 1,
        autoCropArea: 0.9,
        background: false,
        responsive: true,
        movable: true,
        zoomable: true,
        // 'none' = dragging the canvas does NOT spawn a new crop box.
        // The box is moved by dragging it and resized via the corner handles,
        // so all four corners behave the same (no accidental box restart).
        dragMode: 'none',
        toggleDragModeOnDblclick: false,
      });
    },
    cancelCrop() {
      if (this.cropperInstance) {
        this.cropperInstance.destroy();
        this.cropperInstance = null;
      }
      this.cropperSrc = null;
      this.showCropper = false;
    },
    async confirmCrop() {
      let croppedDataUrl = this.cropperSrc;
      if (this.cropperInstance) {
        try {
          const canvas = this.cropperInstance.getCroppedCanvas({ maxWidth: 1024, maxHeight: 1024 });
          if (canvas) croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
        } catch (e) {
          console.warn('Crop failed, using original', e);
        }
        this.cropperInstance.destroy();
        this.cropperInstance = null;
      }
      this.showCropper = false;
      this.cropperSrc = null;
      await this.processPhotoForCharacter(croppedDataUrl);
    },
    async processPhotoForCharacter(dataUrl) {
      this.analyzingPhoto = true;
      this.error = '';
      try {
        // Save photo blob (delete previous if any)
        if (this.charForm.photo_id) {
          try { await deleteImageBlob(this.charForm.photo_id); } catch (e) {}
          this.releaseImageURL(this.charForm.photo_id);
        }
        const photoId = `photo_${this.charForm.id || 'new'}_${Date.now()}`;
        const blob = await (await fetch(dataUrl)).blob();
        await saveImageBlob(photoId, blob);
        this.charForm.photo_id = photoId;

        // Call Vision API
        const result = await analyzeCharacterPhoto(dataUrl, this.password);
        this.charForm.photo_description = result.description;
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
      try { await deleteImageBlob(this.charForm.photo_id); } catch (e) {}
      this.releaseImageURL(this.charForm.photo_id);
      this.charForm.photo_id = null;
      this.charForm.photo_description = '';
      this.refreshImageStats();
    },

    // ============================================================
    // CHARACTER THUMBNAIL generation
    // ============================================================
    // True if a thumbnail is currently generating for the character being edited.
    isThumbGenerating() {
      return !!this.charForm.id && this.thumbnailGeneratingIds.includes(this.charForm.id);
    },

    // Generate a thumbnail WITHOUT blocking. Updates the live form (if still
    // open on this character) and the saved record (if already saved) when done.
    // Failures are silently ignored — the character keeps the default avatar.
    async generateThumbnailInBackground(charId, visualDescription) {
      if (!charId || !visualDescription) return;
      if (this.thumbnailGeneratingIds.includes(charId)) return;  // already running
      this.thumbnailGeneratingIds.push(charId);

      // Snapshot the old thumbnail id to clean up after success
      const oldThumbId = (this.charForm && this.charForm.id === charId)
        ? this.charForm.thumbnail_id
        : ((getStoredCharacters().find(c => c.id === charId) || {}).thumbnail_id);

      try {
        const result = await generateCharacterThumbnail(visualDescription, this.password);
        const blob = base64ToBlob(result.b64, 'image/png');
        const thumbId = `thumb_${charId}_${Date.now()}`;
        await saveImageBlob(thumbId, blob);

        if (oldThumbId && oldThumbId !== thumbId) {
          try { await deleteImageBlob(oldThumbId); } catch (e) {}
          this.releaseImageURL(oldThumbId);
        }

        // Update the live form if the user is still on this character
        if (this.charForm && this.charForm.id === charId) {
          this.charForm.thumbnail_id = thumbId;
        }
        // Update the saved record if it already exists in storage
        setCharacterThumbnailId(charId, thumbId);
        this.characters = getStoredCharacters();
        this.refreshImageStats();
        // If this character is already saved, push the new thumbnail to the cloud.
        // (Brand-new unsaved characters get pushed when the user taps Save & Close.)
        const storedChar = this.characters.find(c => c.id === charId);
        if (storedChar) {
          syncPushCharacter(storedChar).catch(e => console.warn('Cloud sync (thumbnail) failed:', e));
        }
      } catch (err) {
        // Silently ignore (per design) — keep the placeholder avatar
        console.warn('Background thumbnail generation failed (ignored):', err);
      } finally {
        const i = this.thumbnailGeneratingIds.indexOf(charId);
        if (i !== -1) this.thumbnailGeneratingIds.splice(i, 1);
      }
    },

    handleGenerateThumbnail() {
      if (!this.charForm.visual_description) return;
      if (!this.charForm.id) this.charForm.id = 'char_' + Date.now();
      this.generateThumbnailInBackground(this.charForm.id, this.charForm.visual_description);
    },

    // ============================================================
    // CREATED BY suggestions
    // ============================================================
    selectCreatedBy(name) {
      this.formData.createdBy = name;
      this.showCreatedBySuggestions = false;
    },
    removeCreatedBy(name) {
      removeCreatedBySuggestion(name);
      this.createdBySuggestions = getCreatedBySuggestions();
    },
    onCreatedByFocus() { this.showCreatedBySuggestions = true; },
    onCreatedByBlur() {
      // Delay so click on suggestion can register
      setTimeout(() => { this.showCreatedBySuggestions = false; }, 200);
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
    photo_description: '',
    visual_description: '',
    safe_fallback_name: '',
    safe_fallback_visual_description: '',
    always_use_fallback: false,
    confirmed_safe: false,
    photo_id: null,
    thumbnail_id: null,
    fallback_success_count: 0,
    fallback_fail_count: 0,
    created_at: null,
    last_used_at: null,
  };
}
