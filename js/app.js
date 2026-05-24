// =====================================================================
// app.js — Main Vue Application
// =====================================================================
// Manages: splash, password prompt, story-creation form, generation
// loading state, story display, debug panel, localStorage persistence.
// =====================================================================

const { createApp } = Vue

createApp({
  // -------- App state --------
  data() {
    return {
      // Version
      appName: 'StoryTime',
      version: 'v0.4.1',
      buildDate: '2026-05-23',

      // Splash screen
      showSplash: true,

      // Password
      password: '',
      passwordInput: '',
      showPasswordPrompt: false,

      // View navigation: 'create' | 'story'
      view: 'create',

      // Loading state
      loading: false,
      loadingMessage: '',
      loadingHint: '',

      // Current story being displayed
      currentStory: null,
      currentStoryCost: 0,

      // Last generation context (for debug + regenerate)
      lastFormData: null,
      lastPrompt: '',
      lastRawResponse: null,
      lastTokens: null,

      // Form data
      formData: {
        characters: '',
        anythingElse: '',
        age: 5,
        length: 'regular',
        genre: 'adventure',
        mood: [],           // multi-select array
        theme: '',          // single-select OR custom text
      },

      // Selector options
      genres: [
        { value: 'adventure',  emoji: '🗺️', label: 'Adventure' },
        { value: 'fairy-tale', emoji: '🧚', label: 'Fairy Tale' },
        { value: 'fantasy',    emoji: '✨', label: 'Fantasy' },
        { value: 'sci-fi',     emoji: '🚀', label: 'Sci-Fi' },
        { value: 'pirates',    emoji: '🏴‍☠️', label: 'Pirates' },
        { value: 'superhero',  emoji: '🦸', label: 'Superhero' },
        { value: 'mystery',    emoji: '🔍', label: 'Mystery' },
        { value: 'spooky',     emoji: '👻', label: 'Spooky' },
      ],
      moods: [
        { value: 'funny',         emoji: '😄', label: 'Funny' },
        { value: 'surprise',      emoji: '🎁', label: 'Surprise twist' },
        { value: 'heartwarming',  emoji: '💝', label: 'Heartwarming' },
        { value: 'action-packed', emoji: '⚡', label: 'Action-packed' },
        { value: 'dreamy',        emoji: '🌙', label: 'Dreamy' },
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

      // Debug panel
      showDebug: false,

      // Error display
      error: '',
    }
  },

  // -------- Computed properties --------
  computed: {
    isReady() {
      return !this.showSplash && !this.showPasswordPrompt;
    },
    formattedCost() {
      return this.currentStoryCost > 0
        ? `$${this.currentStoryCost.toFixed(4)}`
        : '$0.00';
    },
  },

  // -------- Lifecycle --------
  mounted() {
    console.log(`${this.appName} ${this.version} loaded ✓`);

    // Splash auto-dismiss after 1.5s
    setTimeout(() => this.dismissSplash(), 1500);

    // Check for stored password
    const stored = getStoredPassword();
    if (stored) this.password = stored;

    // Restore debug mode preference
    this.showDebug = getDebugMode();
  },

  // -------- Methods --------
  methods: {

    // ---- Splash ----
    dismissSplash() {
      if (!this.showSplash) return;
      this.showSplash = false;
      if (!this.password) {
        this.showPasswordPrompt = true;
      }
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

    // ---- Mood multi-select ----
    toggleMood(value) {
      const idx = this.formData.mood.indexOf(value);
      if (idx === -1) this.formData.mood.push(value);
      else this.formData.mood.splice(idx, 1);
    },

    isMoodActive(value) {
      return this.formData.mood.includes(value);
    },

    // ---- Theme preset ----
    selectThemePreset(theme) {
      // Toggle: tap selected one to clear
      this.formData.theme = this.formData.theme === theme ? '' : theme;
    },

    // ---- Generation ----
    async handleGenerate() {
      this.error = '';
      this.loading = true;
      this.loadingMessage = 'Writing your story…';
      this.loadingHint = loadingHintForLength(this.formData.length);

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
        title: result.story.title,
        pages: result.story.pages,
        formData: JSON.parse(JSON.stringify(this.formData)),
        cost: result.cost,
        tokens: result.tokens,
        createdAt: new Date().toISOString(),
      };
      saveStoryToStorage(storyRecord);

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
      this.view = 'create';
    },

    // ---- Debug ----
    toggleDebug() {
      this.showDebug = !this.showDebug;
      setDebugMode(this.showDebug);
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
