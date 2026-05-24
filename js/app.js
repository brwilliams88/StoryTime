// =====================================================================
// app.js — Main Vue Application
// =====================================================================

const { createApp } = Vue

// Default form values (used for init AND for Reset Form)
function defaultFormData() {
  return {
    characters: '',
    storyDetails: '',
    age: 5,
    length: 'regular',
    genre: 'surprise-me',
    ingredients: [],     // multi-select, max 3
    theme: '',
  };
}

const MAX_INGREDIENTS = 3;

createApp({
  data() {
    return {
      // Version
      appName: 'StoryTime',
      version: 'v0.4.2',
      buildDate: '2026-05-23',

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

      // Current story
      currentStory: null,
      currentStoryCost: 0,
      currentStoryRecord: null,    // includes parent_story_id, series id, etc.

      // Last generation context (for debug + regenerate)
      lastFormData: null,
      lastPrompt: '',
      lastRawResponse: null,
      lastTokens: null,

      // Form data
      formData: defaultFormData(),

      // Selector options
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
        'Honesty', 'Perseverance', 'Curiosity', 'Helping others', 'Being yourself',
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

      // Error
      error: '',
    }
  },

  computed: {
    isReady() {
      return !this.showSplash && !this.showPasswordPrompt;
    },
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
  },

  mounted() {
    console.log(`${this.appName} ${this.version} loaded ✓`);

    setTimeout(() => this.dismissSplash(), 1500);

    const stored = getStoredPassword();
    if (stored) this.password = stored;

    this.showDebug = getDebugMode();

    // Restore sticky preferences (age, length only)
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

    // ---- Story Ingredients (multi-select, max 3) ----
    toggleIngredient(value) {
      const idx = this.formData.ingredients.indexOf(value);
      if (idx !== -1) {
        this.formData.ingredients.splice(idx, 1);
      } else if (this.ingredientCount < MAX_INGREDIENTS) {
        this.formData.ingredients.push(value);
      }
    },

    isIngredientActive(value) {
      return this.formData.ingredients.includes(value);
    },

    isIngredientDisabled(value) {
      return this.ingredientsAtMax && !this.isIngredientActive(value);
    },

    // ---- Theme preset ----
    selectThemePreset(theme) {
      this.formData.theme = this.formData.theme === theme ? '' : theme;
    },

    // ---- Form: Reset ----
    handleResetForm() {
      this.formData = defaultFormData();
    },

    // ---- Generation ----
    async handleGenerate() {
      this.error = '';
      this.loading = true;
      this.loadingMessage = 'Writing your story…';
      this.loadingHint = loadingHintForLength(this.formData.length);

      // Persist sticky preferences (age + length)
      setStickyPrefs(this.formData);

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
        const result = await generateStory(this.formData, this.password);
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
        parent_story_id: null,      // future-proofing for sequels
        story_series_id: null,      // future-proofing for chapter groups
        title: result.story.title,
        pages: result.story.pages,
        formData: JSON.parse(JSON.stringify(this.formData)),
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

    // ---- Nav between story and form (keeping the story) ----
    editSettings() {
      // Go to form but keep currentStory in memory
      this.view = 'create';
    },

    backToStory() {
      this.view = 'story';
    },

    // ---- Continue Story (future feature, disabled for now) ----
    handleContinueStory() {
      // Placeholder — feature coming with chapter/sequel support
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
      try {
        await navigator.clipboard.writeText(text);
        alert('Copied to clipboard');
      } catch (e) {
        console.error('Clipboard write failed', e);
      }
    },
  },

}).mount('#app')
