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
    selectedCharacterIds: [],     // ids of saved characters chosen for this story
    characterRoles: {},           // { characterId: 'good-guy' | 'bad-guy' | 'none' }
  };
}

const MAX_INGREDIENTS = 3;

createApp({
  data() {
    return {
      // Version
      appName: 'StoryTime',
      version: 'v0.5',
      buildDate: '2026-05-25',

      // Splash
      showSplash: true,

      // Password
      password: '',
      passwordInput: '',
      showPasswordPrompt: false,

      // View
      view: 'create',

      // Loading
      loading: false,
      loadingMessage: '',
      loadingHint: '',

      // Current story
      currentStory: null,
      currentStoryCost: 0,
      currentStoryRecord: null,

      // Last gen context
      lastFormData: null,
      lastPrompt: '',
      lastRawResponse: null,
      lastTokens: null,

      // Form data
      formData: defaultFormData(),

      // ---- Characters state ----
      characters: [],                // all saved characters (loaded from localStorage)
      showCharactersModal: false,
      charModalMode: 'list',         // 'list' | 'create' | 'edit'
      charForm: emptyCharForm(),     // create/edit form state
      enhancing: false,              // loading state for Enhance Description
      generatingRandom: false,       // loading state for Generate Random Character

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
    ingredientCount() {
      return this.formData.ingredients.length;
    },
    ingredientsAtMax() {
      return this.ingredientCount >= MAX_INGREDIENTS;
    },
    formattedStorageSize() {
      return formatStorageSize(this.storageSize);
    },
    selectedCharacters() {
      // Returns full character objects for selected IDs (preserves order of selection)
      return this.formData.selectedCharacterIds
        .map(id => this.characters.find(c => c.id === id))
        .filter(Boolean);
    },
    sortedCharacters() {
      // Sort by last_used_at desc, never-used at the bottom (by created_at desc)
      return [...this.characters].sort((a, b) => {
        if (!a.last_used_at && !b.last_used_at) {
          return (b.created_at || '').localeCompare(a.created_at || '');
        }
        if (!a.last_used_at) return 1;
        if (!b.last_used_at) return -1;
        return b.last_used_at.localeCompare(a.last_used_at);
      });
    },
    charFormCanSave() {
      // Save only available once the visual_description has been generated
      return this.charForm.name.trim().length > 0
        && (this.charForm.visual_description || '').trim().length > 0;
    },
    charFormCanEnhance() {
      return this.charForm.name.trim().length > 0 && !this.enhancing;
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
      if (!this.passwordInput.trim()) {
        this.error = 'Please enter a password.';
        return;
      }
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
      if (idx !== -1) {
        this.formData.ingredients.splice(idx, 1);
      } else if (this.ingredientCount < MAX_INGREDIENTS) {
        this.formData.ingredients.push(value);
      }
    },
    isIngredientActive(v) { return this.formData.ingredients.includes(v); },
    isIngredientDisabled(v) { return this.ingredientsAtMax && !this.isIngredientActive(v); },

    // ---- Theme ----
    selectThemePreset(t) {
      this.formData.theme = this.formData.theme === t ? '' : t;
    },

    // ---- Reset ----
    handleResetForm() {
      this.formData = defaultFormData();
    },

    // =========================================================
    // CHARACTERS — modal, selection, create/edit
    // =========================================================

    openCharactersModal() {
      this.charModalMode = 'list';
      this.charForm = emptyCharForm();
      this.showCharactersModal = true;
    },
    closeCharactersModal() {
      this.showCharactersModal = false;
      this.charForm = emptyCharForm();
    },

    // Selecting characters for the story
    toggleCharacterSelected(charId) {
      const idx = this.formData.selectedCharacterIds.indexOf(charId);
      if (idx === -1) {
        this.formData.selectedCharacterIds.push(charId);
        if (!this.formData.characterRoles[charId]) {
          this.formData.characterRoles[charId] = 'none';
        }
      } else {
        this.formData.selectedCharacterIds.splice(idx, 1);
        delete this.formData.characterRoles[charId];
      }
    },
    isCharacterSelected(charId) {
      return this.formData.selectedCharacterIds.includes(charId);
    },
    setCharacterRole(charId, role) {
      this.formData.characterRoles[charId] = role;
    },
    getCharacterRole(charId) {
      return this.formData.characterRoles[charId] || 'none';
    },
    roleLabel(role) {
      if (role === 'good-guy') return 'Good Guy';
      if (role === 'bad-guy') return 'Bad Guy';
      return '';
    },
    formatRelative(iso) {
      return formatRelativeTime(iso);
    },

    // Create / Edit
    startCreateCharacter() {
      this.charForm = emptyCharForm();
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
      this.charModalMode = 'edit';
    },
    cancelCharForm() {
      this.charForm = emptyCharForm();
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
      this.charModalMode = 'list';
    },

    handleDeleteCharacter(char) {
      if (!confirm(`Delete "${char.name}"? This cannot be undone.`)) return;
      deleteCharacter(char.id);
      this.characters = getStoredCharacters();
      // Also remove from current selection
      const idx = this.formData.selectedCharacterIds.indexOf(char.id);
      if (idx !== -1) this.formData.selectedCharacterIds.splice(idx, 1);
      delete this.formData.characterRoles[char.id];
    },

    // =========================================================
    // GENERATE STORY
    // =========================================================

    async handleGenerate() {
      this.error = '';
      this.loading = true;
      this.loadingMessage = 'Writing your story…';
      this.loadingHint = loadingHintForLength(this.formData.length);
      setStickyPrefs(this.formData);

      // Build the selected characters list with roles for the prompt
      const selected = this.selectedCharacters.map(c => ({
        ...c,
        role: this.getCharacterRole(c.id),
      }));

      const messages = [
        'Writing your story…',
        'Choosing the right words…',
        'Polishing the pages…',
        'Almost there…',
      ];
      let i = 0;
      const interval = setInterval(() => {
        i = (i + 1) % messages.length;
        this.loadingMessage = messages[i];
      }, 2500);

      try {
        const result = await generateStory(this.formData, selected, this.password);
        // Update last_used_at for each selected character
        selected.forEach(c => touchCharacterLastUsed(c.id));
        this.characters = getStoredCharacters();
        this.displayStoryResult(result);
      } catch (err) {
        console.error('Generation failed:', err);
        this.error = err.message || 'Something went wrong. Please try again.';
      } finally {
        clearInterval(interval);
        this.loading = false;
      }
    },

    handleFakeStory() {
      this.error = '';
      const result = generateFakeStory(this.formData);
      this.displayStoryResult(result);
    },

    displayStoryResult(result) {
      this.currentStory = result.story;
      this.currentStoryCost = result.cost;
      this.lastFormData = JSON.parse(JSON.stringify(this.formData));
      this.lastPrompt = result.prompt;
      this.lastRawResponse = result.rawResponse;
      this.lastTokens = result.tokens;

      const storyRecord = {
        id: 'story_' + Date.now(),
        parent_story_id: null,
        story_series_id: null,
        title: result.story.title,
        pages: result.story.pages,
        formData: JSON.parse(JSON.stringify(this.formData)),
        character_ids: [...this.formData.selectedCharacterIds],
        character_roles: { ...this.formData.characterRoles },
        cost: result.cost,
        tokens: result.tokens,
        createdAt: new Date().toISOString(),
      };
      this.currentStoryRecord = storyRecord;
      saveStoryToStorage(storyRecord);

      this.refreshStorageSize();
      this.view = 'story';
    },

    handleRegenerate() {
      if (this.lastFormData) {
        this.formData = JSON.parse(JSON.stringify(this.lastFormData));
      }
      this.handleGenerate();
    },

    handleNewStory() {
      this.currentStory = null;
      this.currentStoryRecord = null;
      this.view = 'create';
    },

    editSettings() { this.view = 'create'; },
    backToStory() { this.view = 'story'; },

    handleContinueStory() {
      alert('Continue Story is coming soon! This will let you make a Part 2 using the same characters and setting.');
    },

    // ---- Debug ----
    toggleDebug() {
      this.showDebug = !this.showDebug;
      setDebugMode(this.showDebug);
      this.refreshStorageSize();
    },
    refreshStorageSize() {
      this.storageSize = getStorageSizeBytes();
    },
    handleClearStories() {
      if (!confirm('Clear all saved stories from this device? This cannot be undone.')) return;
      clearAllStories();
      this.refreshStorageSize();
    },
    async copyToClipboard(text) {
      try { await navigator.clipboard.writeText(text); alert('Copied to clipboard'); }
      catch (e) { console.error('Clipboard write failed', e); }
    },
  },

}).mount('#app')


// Helper: blank character form
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
