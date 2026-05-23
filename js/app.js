// =====================================================================
// app.js — Main Vue Application
// =====================================================================
// This is the brain of the StoryTime app. It manages:
//   - Splash screen on launch
//   - Password prompt (first launch only)
//   - The story-creation form
//   - Story generation (calls api.js)
//   - Story display
//   - Debug panel
//   - Saving stories to localStorage (via storage.js)
// =====================================================================

const { createApp } = Vue

createApp({
  // -------- App state --------
  data() {
    return {
      // Version
      appName: 'StoryTime',
      version: 'v0.3',

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

      // Current story being displayed
      currentStory: null,           // parsed { title, pages: [...] }
      currentStoryCost: 0,

      // Last generation context (for debug + regenerate)
      lastFormData: null,
      lastPrompt: '',
      lastRawResponse: null,
      lastTokens: null,

      // Form data
      formData: {
        age: 5,
        length: 'regular',
        genre: 'adventure',
        characterType: 'animals',
        setting: '',
        specialTouches: '',
        lesson: '',
        artStyle: 'watercolor',     // visible but not yet wired to images
      },

      // Dropdown options shown in the UI
      genres: [
        { value: 'adventure',       label: 'Adventure' },
        { value: 'fairy-tale',      label: 'Fairy Tale' },
        { value: 'fantasy',         label: 'Fantasy' },
        { value: 'bedtime-calming', label: 'Bedtime / Calming' },
        { value: 'funny',           label: 'Funny' },
        { value: 'mystery',         label: 'Mystery' },
        { value: 'friendship',      label: 'Friendship' },
      ],
      characterTypes: [
        { value: 'animals',           label: 'Animals' },
        { value: 'humans',            label: 'Humans' },
        { value: 'monsters',          label: 'Friendly Monsters' },
        { value: 'robots',            label: 'Robots' },
        { value: 'magical-creatures', label: 'Magical Creatures' },
      ],
      lengths: [
        { value: 'short',       label: 'Short',      subtitle: '~3 min' },
        { value: 'regular',     label: 'Regular',    subtitle: '~6 min' },
        { value: 'long',        label: 'Long',       subtitle: '~10 min' },
        { value: 'extra-long',  label: 'Extra-Long', subtitle: '~15 min' },
      ],
      artStyles: [
        { value: 'watercolor', label: 'Warm Watercolor' },
        { value: 'pixel',      label: 'Pixel Art' },
        { value: 'anime',      label: 'Anime' },
        { value: 'pencil',     label: 'Pencil Sketch' },
        { value: 'claymation', label: 'Claymation' },
        { value: 'comic',      label: 'Comic Book' },
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

  // -------- Lifecycle: runs once when app first loads --------
  mounted() {
    console.log(`${this.appName} ${this.version} loaded ✓`);

    // Splash auto-dismiss after 1.5s (also dismissable on click)
    setTimeout(() => {
      this.dismissSplash();
    }, 1500);

    // Check for stored password
    const stored = getStoredPassword();
    if (stored) {
      this.password = stored;
    }

    // Restore debug mode preference
    this.showDebug = getDebugMode();
  },

  // -------- Methods --------
  methods: {

    // Splash
    dismissSplash() {
      if (!this.showSplash) return;
      this.showSplash = false;

      // After splash, prompt for password if we don't have one yet
      if (!this.password) {
        this.showPasswordPrompt = true;
      }
    },

    // Password
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

    // Story generation
    async handleGenerate() {
      this.error = '';
      this.loading = true;
      this.loadingMessage = 'Writing your story…';

      // Rotating loading messages keep things lively while waiting
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
      this.lastFormData = { ...this.formData };
      this.lastPrompt = result.prompt;
      this.lastRawResponse = result.rawResponse;
      this.lastTokens = result.tokens;

      // Save to localStorage (for the future library)
      const storyRecord = {
        id: 'story_' + Date.now(),
        title: result.story.title,
        pages: result.story.pages,
        formData: { ...this.formData },
        cost: result.cost,
        tokens: result.tokens,
        createdAt: new Date().toISOString(),
      };
      saveStoryToStorage(storyRecord);

      this.view = 'story';
    },

    handleRegenerate() {
      if (this.lastFormData) {
        // Restore the exact inputs and regenerate
        this.formData = { ...this.lastFormData };
      }
      this.handleGenerate();
    },

    handleNewStory() {
      this.currentStory = null;
      this.view = 'create';
    },

    // Debug
    toggleDebug() {
      this.showDebug = !this.showDebug;
      setDebugMode(this.showDebug);
    },

    // Copy to clipboard (used in debug panel)
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
