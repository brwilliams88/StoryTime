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
      version: 'v0.9.20',
      buildDate: '2026-06-25',

      showSplash: true,

      password: '',
      passwordInput: '',
      showPasswordPrompt: false,

      view: 'library',   // Library is home

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

      coverShift: false,   // true = closed book slid into its hinge-side half (for the open/close turn)

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

      // Library (My Books) — cloud-backed list
      libraryBooks: [],          // metadata rows from the cloud
      libraryLoading: false,
      refreshingLibrary: false,
      pullDistance: 0,           // pull-to-refresh
      pullRefreshing: false,
      cloudUsage: { count: 0, bytes: 0, loaded: false },   // Supabase image bucket usage
      spend: null,               // API-spend summary (populated when Settings opens)
      readerUiShow: true,        // floating reader controls visible (auto-fade while reading)
      librarySearch: '',         // full-text search (server-side over story body)
      searchResults: [],         // server search results when a query is active
      searchLoading: false,
      showFilters: false,
      openFilter: null,          // which filter accordion section is expanded
      sortBy: 'created',
      filterGenres: [], filterArts: [], filterAges: [], filterCreators: [],
      coverUrls: {},             // cover_image_id -> signed URL (for thumbnails)
      isOffline: false,          // greys out non-cached books when offline
      bookDetail: null,          // the book (meta) whose detail popup is open
      bookDetailStory: null,     // its full story (loaded for reading time + instant Read)
      MAX_CACHED_BOOKS: 25,      // keep this many full books on-device for offline

      // Manage / delete books — a select mode ON the bookshelf (entered from Settings)
      manageMode: false,
      booksToDelete: [],
      managingDelete: false,

      // One-time "update summaries" pass
      summaryUpdating: false,
      summaryProgress: '',

      // Edit "Created By" from the last page
      editingCreatedBy: false,
      editCreatedByValue: '',

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
    // Estimated read-aloud minutes for the book in the detail popup
    bookDetailReadingTime() {
      const s = this.bookDetailStory;
      if (!s) return null;
      const len = s.formData && s.formData.length;
      if (typeof LENGTH_PRESETS !== 'undefined' && LENGTH_PRESETS[len]) return LENGTH_PRESETS[len].minutes;
      const words = (s.pages || []).reduce((a, p) => a + (p.text || '').split(/\s+/).filter(Boolean).length, 0);
      return words ? Math.max(1, Math.round(words / 130)) : null;
    },
    bookDetailAgeLabel() {
      const ar = this.bookDetail && this.bookDetail.age_range;
      return ar ? `Ages ${ar}` : '';
    },

    // Filter + sort (chips, client-side) over the base list (full library, or
    // server full-text search results when there's a query).
    anyFilterActive() {
      return this.filterGenres.length > 0 || this.filterArts.length > 0 ||
             this.filterAges.length > 0 || this.filterCreators.length > 0;
    },
    activeFilterCount() {
      return [this.filterGenres, this.filterArts, this.filterAges, this.filterCreators]
        .filter(a => a.length).length;
    },
    cloudUsagePercent() {
      const gb = 1073741824; // 1 GB free-tier storage
      return Math.min(100, Math.round((this.cloudUsage.bytes / gb) * 100));
    },
    distinctCreators() { return this._distinct('created_by'); },
    _genreCounts() { return this._countField('genre'); },
    _artCounts() { return this._countField('art_style'); },
    _creatorCounts() { return this._countField('created_by'); },
    // Filter options ordered by most-used first (Age stays in natural age order)
    filterGenreOptions() {
      const c = this._genreCounts;
      return this.genresRaw.filter(g => g.value !== 'surprise-me')
        .slice().sort((a, b) => (c[b.value] || 0) - (c[a.value] || 0) || a.label.localeCompare(b.label));
    },
    filterArtOptions() {
      const c = this._artCounts;
      return this.artStylesRaw.filter(s => s.value !== 'surprise-me')
        .slice().sort((a, b) => (c[b.value] || 0) - (c[a.value] || 0) || a.label.localeCompare(b.label));
    },
    orderedCreators() {
      const c = this._creatorCounts;
      return this.distinctCreators.slice().sort((a, b) => (c[b] || 0) - (c[a] || 0) || a.localeCompare(b));
    },
    displayedBooks() {
      const base = this.librarySearch.trim() ? this.searchResults : this.libraryBooks;
      let list = base.filter(b => {
        if (this.filterGenres.length && !this.filterGenres.includes(b.genre)) return false;
        if (this.filterArts.length && !this.filterArts.includes(b.art_style)) return false;
        if (this.filterAges.length && !this.filterAges.includes(b.age_range)) return false;
        if (this.filterCreators.length && !this.filterCreators.includes(b.created_by)) return false;
        return true;
      });
      const arr = list.slice();
      const created = b => b.created_at || b.createdAt || '';
      if (this.sortBy === 'last_read') arr.sort((a, b) => (b.last_read_at || '').localeCompare(a.last_read_at || ''));
      else if (this.sortBy === 'rating') arr.sort((a, b) => (b.rating || 0) - (a.rating || 0) || created(b).localeCompare(created(a)));
      else if (this.sortBy === 'title') arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      else arr.sort((a, b) => created(b).localeCompare(created(a)));
      return arr;
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
    // Short form for the floating indicator, e.g. "2/9"
    pageShortLabel() {
      if (!this.currentStory || !this.currentStoryPage) return '';
      return `${this.currentPageIndex}/${this.totalStoryPages}`;
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

    // Wire the finger-following page-curl to the reader (snapshots + nav).
    if (typeof window.PageCurl !== 'undefined') {
      const self = this;
      window.PageCurl.init({
        index: () => self.currentPageIndex,
        setIndex: (i) => {
          // Turning back to the cover (1→0) = closing the book: render the cover
          // already slid into its half so the turn reveals it book-in-half.
          if (i === 0 && self.currentPageIndex === 1) self.coverShift = true;
          self.currentPageIndex = i;
        },
        canNext: () => self.canGoNext(),
        canPrev: () => self.canGoPrev(),
        goNext: () => self.nextPage(),
        goPrev: () => self.prevPage(),
        isPortrait: () => self.isPortrait,
        onTap: () => self.pokeReaderUi(),
        afterRender: (fn) => self.$nextTick(fn),
        // After any turn settles, drop coverShift. On a close (landed on the
        // cover) that slides the book home to centre; otherwise it's a no-op.
        afterTurn: () => { self.coverShift = false; self._coverAnim = false; },
      });
    }

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
      this.$nextTick(() => { window.scrollTo(0, 0); this.recomputeStoryFontSize(); });
    });

    // Re-fit the story text whenever the window resizes (e.g. dragging a laptop
    // browser window) so the auto-fit stays correct. Debounced.
    this._resizeHandler = () => {
      clearTimeout(this._resizeT);
      this._resizeT = setTimeout(() => this.recomputeStoryFontSize(), 150);
    };
    window.addEventListener('resize', this._resizeHandler);

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
      // Arrow keys play the same turn animation (fall back to instant nav).
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.isOnCover) { this.openCover(); return; }   // open the book
        if (window.PageCurl && window.PageCurl.animate) window.PageCurl.animate(true); else this.nextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        // page 1 → cover close is handled by the curl's setIndex/afterTurn hooks
        if (window.PageCurl && window.PageCurl.animate) window.PageCurl.animate(false); else this.prevPage();
      }
    };
    window.addEventListener('keydown', this._keyHandler);

    // Track online/offline so the Library can grey out non-cached books
    this.isOffline = !navigator.onLine;
    this._onlineHandler = () => { this.isOffline = false; };
    this._offlineHandler = () => { this.isOffline = true; };
    window.addEventListener('online', this._onlineHandler);
    window.addEventListener('offline', this._offlineHandler);

    // If we already have a password, sync with the cloud on open
    if (this.password) this.initCloudData();
  },

  beforeUnmount() {
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    if (this._onlineHandler) window.removeEventListener('online', this._onlineHandler);
    if (this._offlineHandler) window.removeEventListener('offline', this._offlineHandler);
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
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
      this.initCloudData();
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
      this.error = '';
      this.charForm = emptyCharForm();
      this.isRandomNew = false;
      this.showCharFallbackFields = false;
      this.charModalMode = 'create';
    },
    startEditCharacter(char) {
      this.error = '';
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
        recordSpend('characters', result.cost);   // Bring to Life counts as Character creation

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
        recordSpend('characters', result.cost);   // counts as Character creation
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
        this.error = '';   // clear any photo/analysis error so it doesn't linger on the list
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
      // Story Details + Created By are now required
      if (!this.formData.storyDetails || !this.formData.storyDetails.trim()) {
        this.error = 'Please fill in Story Details before generating.'; return;
      }
      if (!this.formData.createdBy || !this.formData.createdBy.trim()) {
        this.error = 'Please fill in "Created By" before generating.'; return;
      }
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
        // Sync the updated last_used_at up to the cloud (was previously local-only)
        selected.forEach(c => {
          const stored = this.characters.find(x => x.id === c.id);
          if (stored) syncPushCharacter(stored).catch(() => {});
        });

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
          // The actual artwork style: the picked one, or what the AI chose for "surprise me"
          art_style: (this.formData.artStyle && this.formData.artStyle !== 'surprise-me')
            ? this.formData.artStyle
            : (story.chosen_art_style || 'surprise-me'),
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
        recordSpend('text', textResult.cost);
        setLastStorySpend(textResult.cost, 0);
        this.currentPageIndex = 0;

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
          // Draw the COVER + PAGE 1 together, keeping the loading screen up
          // until both are ready, so the book opens with its first spreads drawn.
          this.loadingMessage = 'Drawing the first pages…';
          const firstBatch = [this.generateOneImage('cover', storyData)];
          if (storyData.pages.length > 0) firstBatch.push(this.generateOneImage(0, storyData));
          await Promise.all(firstBatch);

          // Open the book now
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

        // Add to the in-memory Library list so it shows up immediately,
        // then trim the on-device cache to the last N books.
        this.addToLibraryIndex(storyData);
        this.evictOldCachedBooks();
      } catch (err) {
        console.error('Generation failed:', err);
        this.error = err.message || 'Something went wrong. Please try again.';
        this.loading = false;
      }
    },

    // Prepend/replace a just-saved story in the in-memory Library list
    addToLibraryIndex(story) {
      const meta = {
        id: story.id,
        title: story.title || '',
        created_by: story.created_by || '',
        genre: (story.formData && story.formData.genre) || '',
        age_range: (story.formData && story.formData.ageRange) || '',
        art_style: story.art_style || (story.formData && story.formData.artStyle !== 'surprise-me' ? story.formData.artStyle : ''),
        theme: (story.formData && story.formData.theme) || '',
        summary: story.summary || '',
        character_names: (story.selected_characters || []).map(c => c.name).filter(Boolean).join(' '),
        rating: story.rating || 0,
        cover_image_id: (story.cover && story.cover.image_id) || null,
        created_at: story.createdAt || new Date().toISOString(),
        last_read_at: story.last_read_at || null,
      };
      this.libraryBooks = [meta, ...this.libraryBooks.filter(b => b.id !== meta.id)];
      setLibraryIndex(this.libraryBooks);
      // The cover blob is already local, so the thumbnail shows without signing
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
        // Page 1 was already drawn with the cover; mark the rest skipped
        storyData.pages.forEach((p, i) => {
          if (i !== 0 && p.image_status === 'pending') p.image_status = 'skipped';
        });
        pageIndices = [];
      } else {
        // Everything still 'pending' (cover + page 1 are already done)
        pageIndices = storyData.pages
          .map((_, i) => i)
          .filter(i => storyData.pages[i].image_status === 'pending');
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
    // Dynamic story text size — AUTO-FIT to the live page.
    //
    // Goal: one font size for the WHOLE book (consistent like a printed
    // book), as large as possible while the page with the MOST text still
    // leaves at least ~2 blank rows of margin above and below its text. So
    // when pages are sparse the text grows to fill the whitespace; when a
    // page is dense it shrinks just enough that nothing overflows. Because
    // it measures the real reading-view box, it re-fits per device and on
    // every resize / orientation change (phone vs iPad vs laptop window).
    // ============================================================
    recomputeStoryFontSize(attempt) {
      if (this.view !== 'story') return;
      const story = this.currentStory;
      if (!story || !story.pages || !story.pages.length) return;
      // NB: this is a multi-root component, so this.$el is a comment node, not an
      // element — query the document for the (unique) reading view instead.
      const rv = document.querySelector('.reading-view');
      const vw = rv ? rv.clientWidth : 0, vh = rv ? rv.clientHeight : 0;
      if (!rv || !vw || !vh) {
        // DOM not laid out yet (just switched into the reader) — retry briefly.
        if ((attempt || 0) < 5) setTimeout(() => this.recomputeStoryFontSize((attempt || 0) + 1), 60);
        return;
      }

      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const portrait = this.isPortrait;
      // Text column box, mirroring the .spread-text CSS for each orientation:
      //   landscape → right half, full height, padding L/R 1.9+2.0rem, T/B 1+1.4rem
      //   portrait  → bottom half, full width, padding L/R 1.3+1.3rem,  T/B 1+1.3rem
      const colW = portrait ? vw : vw * 0.5;
      const colH = portrait ? vh * 0.5 : vh;
      const padH = (portrait ? 2.6 : 3.9) * rootPx;   // left + right padding
      const padV = (portrait ? 2.3 : 2.4) * rootPx;   // top + bottom padding
      const Wt = Math.max(40, colW - padH);           // usable text width
      const Ht = Math.max(40, colH - padV);           // usable text height

      const LH = 1.6;                                 // matches .spread-text p line-height
      const meas = this._fontMeasureEl || (this._fontMeasureEl = this._makeFontMeasureEl());
      meas.style.width = Wt + 'px';
      meas.style.lineHeight = String(LH);

      // "One size, snug long pages": pick the largest single size where MOST
      // pages keep a full ~2-row margin top & bottom, allowing the few longest
      // pages to run tighter (but never off-screen). Sizing to the absolute
      // longest page made the shared size too small, so short pages looked
      // empty; this lets a long outlier be snug while the book gets bigger.
      const N = story.pages.length;
      const lastIdx = N - 1;
      const COMFORT_ROWS = 4;     // 2 rows clear top + 2 bottom on a "comfortable" page
      const SNUG_ROWS = 1.5;      // longest pages: keep ~0.75 row each side (never clip)
      const allowedSnug = Math.max(1, Math.floor(0.2 * N));   // up to ~20% of pages may be snug
      const requiredComfort = N - allowedSnug;

      const pageHeight = (i, fs) => {
        meas.textContent = (story.pages[i].text || '') || ' ';
        let h = meas.offsetHeight;
        if (i === lastIdx) h += 3 * fs * LH;          // room for the "The End" flourish
        return h;
      };
      const fits = (fs) => {
        meas.style.fontSize = fs + 'px';
        const comfortMax = Ht - COMFORT_ROWS * fs * LH;
        const snugMax = Ht - SNUG_ROWS * fs * LH;     // hard ceiling — no page may exceed this
        if (comfortMax <= fs * LH) return false;      // not even one line fits comfortably
        let comfortable = 0;
        for (let i = 0; i < N; i++) {
          const h = pageHeight(i, fs);
          if (h > snugMax) return false;              // would clip / overflow → too big
          if (h <= comfortMax) comfortable++;
        }
        return comfortable >= requiredComfort;
      };

      // Largest integer px in [14, 44] that fits; fall back to 14 otherwise.
      let lo = 14, hi = 44, best = 14;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (fits(mid)) { best = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      // Device testing showed the comfortable fit reads a few sizes small, so
      // nudge it up by BONUS. Cap it so even the tallest page keeps at least
      // MIN_ROWS of clear margin (text always fits with a little air). MIN_ROWS
      // is BELOW the fit's snug ceiling (1.5) so the boost actually has room to
      // grow — using 1.5 here is what made the previous +4 a no-op. The cap is
      // never below `best`, so we never end up smaller than the fit.
      const BONUS = 6;
      const MIN_ROWS = 0.8;   // boosted size floor: >=0.4 row clear top & bottom
      const fitsBoost = (fs) => {
        meas.style.fontSize = fs + 'px';
        const maxBlock = Ht - MIN_ROWS * fs * LH;
        if (maxBlock <= fs * LH) return false;
        for (let i = 0; i < N; i++) if (pageHeight(i, fs) > maxBlock) return false;
        return true;
      };
      let boostCap = best;
      for (let fs = best + 1; fs <= 44; fs++) { if (fitsBoost(fs)) boostCap = fs; else break; }

      const finalPx = Math.min(best + BONUS, boostCap, 44);
      document.documentElement.style.setProperty('--story-text-size', finalPx + 'px');
    },

    // Hidden offscreen element used to measure how tall a block of text renders
    // at a given width + font size (without disturbing the visible page).
    _makeFontMeasureEl() {
      const el = document.createElement('div');
      const cs = getComputedStyle(document.body);
      el.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;' +
        'box-sizing:border-box;white-space:normal;word-break:normal;overflow-wrap:break-word;' +
        'margin:0;padding:0;pointer-events:none;';
      el.style.fontFamily = cs.fontFamily;
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      return el;
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
          recordSpend('pictures', enrich.cost);
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
        recordSpend('pictures', result.cost);
        setLastStorySpend(this.currentTextCost, this.currentImagesCost);

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

    // Finger-following page-turn (delegated to js/pageCurl.js, bound on .page-area).
    // Only the COVER (index 0) is special — a swipe there opens the book. Every
    // other turn (including page 1 → 2 forward, and page 1 → cover close) goes
    // straight to the finger-following curl, which is zone-aware (grab the right
    // page to go forward, the left/top page to go back) and triggers the
    // close-book slide via the setIndex / afterTurn hooks above.
    curlStart(e) {
      if (this.isOnCover) { this._coverDown(e); return; }
      if (window.PageCurl) window.PageCurl.start(e, e.currentTarget);
    },
    curlMove(e) {
      if (this._cg) { this._coverMoveGesture(e); return; }
      if (window.PageCurl) window.PageCurl.move(e);
    },
    curlEnd(e) {
      if (this._cg) { this._coverUpGesture(e); return; }
      if (window.PageCurl) window.PageCurl.end(e);
    },

    // ---- Cover (closed book) gesture → open animation ----
    _coverPoint(e) {
      const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
    },
    _coverDown(e) {
      if (e.target.closest && e.target.closest('button, a, .inspect-btn')) return;
      const p = this._coverPoint(e);
      this._cg = { x0: p.x, y0: p.y, axis: this.isPortrait ? 'y' : 'x', primary: 0 };
      if (e.type === 'mousedown') {
        this._cg.mm = (ev) => this._coverMoveGesture(ev);
        this._cg.mu = (ev) => this._coverUpGesture(ev);
        document.addEventListener('mousemove', this._cg.mm);
        document.addEventListener('mouseup', this._cg.mu);
      }
    },
    _coverMoveGesture(e) {
      if (!this._cg) return;
      const p = this._coverPoint(e);
      this._cg.primary = this._cg.axis === 'x' ? p.x - this._cg.x0 : p.y - this._cg.y0;
      if (Math.abs(this._cg.primary) > 8 && e.cancelable) e.preventDefault();
    },
    _coverUpGesture() {
      const g = this._cg; if (!g) return;
      if (g.mm) { document.removeEventListener('mousemove', g.mm); document.removeEventListener('mouseup', g.mu); }
      this._cg = null;
      if (Math.abs(g.primary || 0) < 40) { this.pokeReaderUi(); return; }   // tap → just reveal controls
      if (g.primary < 0) this.openCover();   // forward swipe on the cover → open the book
    },

    // Open the book (cover → first spread). First SLIDE the closed book into the
    // half it will hinge from (down in portrait, right in landscape) via the
    // .cover-book CSS transition — during which only the book + dark stage show
    // (no spread peeking through). THEN hand off to the normal page-turn, which
    // lifts the cover like a page and lays the first spread's half down on the
    // other side — exactly like a regular turn. afterTurn() clears coverShift.
    // (The reverse — close — is just a normal back-turn to the cover; see the
    // setIndex / afterTurn hooks in mounted.) Falls back to an instant jump.
    openCover() {
      if (this._coverAnim || !this.isOnCover) return;
      const curl = window.PageCurl;
      if (!curl || !curl.animate) { this.currentPageIndex = 1; this.pokeReaderUi(); return; }
      this._coverAnim = true;
      this.coverShift = true;                       // slide the book into its hinge-side half
      const SLIDE = 540;                            // keep >= the .cover-book CSS transition (0.5s)
      setTimeout(() => {
        curl.animate(true);                         // then turn the cover like a page
        setTimeout(() => { this._coverAnim = false; }, 2000);   // backstop if the turn bailed
      }, SLIDE);
    },
    // Show the floating reader controls, then auto-fade after a few seconds.
    pokeReaderUi() {
      this.readerUiShow = true;
      clearTimeout(this._readerUiT);
      this._readerUiT = setTimeout(() => { this.readerUiShow = false; }, 3200);
    },
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
    // The ready image id for a reading index (0=cover, 1..N=pages, N+1=toolbox)
    imageIdForIndex(idx) {
      if (!this.currentStory) return null;
      if (idx === 0) {
        const c = this.currentStory.cover;
        return c && c.image_status === 'ready' ? c.image_id : null;
      }
      const p = this.currentStory.pages[idx - 1];
      return p && p.image_status === 'ready' ? p.image_id : null;
    },
    // Preload neighbouring page images (create the object URL + decode) so the
    // page-turn animation always has the next image ready to show.
    preloadAdjacentImages() {
      if (!this.currentStory) return;
      const targets = [this.currentPageIndex + 1, this.currentPageIndex + 2, this.currentPageIndex - 1];
      for (const i of targets) {
        if (i < 0 || i > this.totalReadingPages - 1) continue;
        const id = this.imageIdForIndex(i);
        if (!id || this.imageUrls[id]) continue;
        if (!this._loadingUrls) this._loadingUrls = {};
        if (this._loadingUrls[id]) continue;
        this._loadingUrls[id] = true;
        getImageBlob(id).then((blob) => {
          if (blob && !this.imageUrls[id]) {
            const url = URL.createObjectURL(blob);
            this.imageUrls[id] = url;                 // reactive
            const im = new Image(); im.src = url; if (im.decode) im.decode().catch(() => {});
          }
        }).finally(() => { this._loadingUrls[id] = false; });
      }
    },
    // Free an object URL and drop it from the reactive map
    releaseImageURL(imageId) {
      if (!imageId) return;
      const url = this.imageUrls[imageId];
      if (url) { try { URL.revokeObjectURL(url); } catch (e) {} }
      delete this.imageUrls[imageId];
    },

    startEditCreatedBy() {
      this.editCreatedByValue = (this.currentStory && this.currentStory.created_by) || '';
      this.editingCreatedBy = true;
    },
    saveCreatedBy() {
      if (!this.currentStory) return;
      const v = (this.editCreatedByValue || '').trim();
      this.currentStory.created_by = v;
      if (this.currentStoryRecord) {
        this.currentStoryRecord.created_by = v;
        try { saveStoryToStorage(this.currentStoryRecord); } catch (e) { if (!e.isQuota) throw e; }
        syncPushStory(this.currentStoryRecord).catch(e => console.warn('Cloud sync (created_by) failed:', e));
      }
      const m = this.libraryBooks.find(b => b.id === this.currentStory.id);
      if (m) m.created_by = v;
      if (v) { addCreatedBySuggestion(v); this.createdBySuggestions = getCreatedBySuggestions(); }
      this.editingCreatedBy = false;
    },

    setRating(stars) {
      if (!this.currentStory) return;
      // tapping the current rating again clears it back to no stars
      if (Number(this.currentStory.rating) === Number(stars)) stars = 0;
      this.currentStory.rating = stars;
      if (this.currentStoryRecord) {
        this.currentStoryRecord.rating = stars;
        try { saveStoryToStorage(this.currentStoryRecord); } catch (e) { if (!e.isQuota) throw e; }
        // Sync the rating up (images already uploaded, so this is just metadata)
        syncPushStory(this.currentStoryRecord).catch(e => console.warn('Cloud sync (rating) failed:', e));
      }
      // Keep the in-memory library entry in sync so the popup/sort reflect it now
      const m = this.libraryBooks.find(b => b.id === this.currentStory.id);
      if (m) m.rating = stars;
    },

    // ============================================================
    // SETTINGS
    // ============================================================
    openSettings() {
      this.showSettings = true;
      this.refreshStorageSize();
      this.refreshImageStats();
      this.fetchCloudUsage();
      this.spend = getSpendSummary();            // instant local paint
      this.flushSpendUp().then(() => this.pullSpendDown());   // then sync with cloud
    },
    // Push any locally-recorded spend events that haven't reached the cloud yet.
    async flushSpendUp() {
      try {
        const unsynced = getUnsyncedSpend();
        if (!unsynced.length) return;
        const events = unsynced.map(e => ({ ts: e.ts, category: e.cat, amount: e.amt }));
        await spendAddCloud(events, getStoredPassword());
        markSpendSynced();
      } catch (e) { /* leave unsynced; we retry next time */ }
    },
    // Pull the full cross-device ledger and recompute the panel (offline → local).
    async pullSpendDown() {
      try {
        const r = await spendListCloud(getStoredPassword());
        this.spend = summarizeSpend((r && r.events) || [], getLastStorySpend());
      } catch (e) {
        this.spend = getSpendSummary();
      }
    },
    // Format a dollar amount for the Spend panel ($1.23, <$0.01 for tiny, $0 for nothing).
    fmtUsd(n) {
      const v = Number(n) || 0;
      if (v <= 0) return '$0';
      if (v < 0.01) return '<$0.01';
      return '$' + v.toFixed(2);
    },
    // Width % for a breakdown bar, relative to the largest category.
    spendBarPct(amount) {
      if (!this.spend) return 0;
      const max = Math.max(this.spend.pictures, this.spend.text, this.spend.characters, 0.0001);
      return Math.round((amount / max) * 100);
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

    // ============================================================
    // CLOUD SYNC + LIBRARY (My Books)
    // ============================================================
    // Run on app open (and right after entering the password). Pulls the
    // cloud copy of characters + the book list, then prefetches recent books
    // in the background. The list fetch also doubles as the "wake-up ping"
    // that keeps the free-tier Supabase project from sleeping.
    async initCloudData() {
      this.libraryLoading = true;
      this.flushSpendUp();   // push any spend recorded offline / on this device
      try {
        this.characters = await pullCharacters();
        // Download character avatars/photos not yet on this device (cross-device)
        ensureCharacterImagesLocal(this.characters)
          .then(() => { this.characters = getStoredCharacters(); })
          .catch(e => console.warn('Character image sync failed:', e));
      }
      catch (e) { console.warn('Character pull failed:', e); }

      try {
        const res = await fetchLibraryIndex({ sort: 'created', limit: 200 });
        this.libraryBooks = res.rows || [];
        setLibraryIndex(this.libraryBooks);
        const covers = await signCoverUrls(this.libraryBooks.map(b => b.cover_image_id));
        this.coverUrls = { ...this.coverUrls, ...covers };
      } catch (e) {
        this.libraryBooks = getLibraryIndex();   // offline fallback
        console.warn('Library index fetch failed; using cached:', e);
      } finally {
        this.libraryLoading = false;
      }

      // Background: pull recent books + their images onto the device for offline
      this.prefetchRecentBooks().catch(e => console.warn('Prefetch failed:', e));
    },

    // ---- Navigation between the 3 areas ----
    goLibrary() { this.view = 'library'; window.scrollTo(0, 0); },
    goCreate()  { this.view = 'create';  window.scrollTo(0, 0); },

    // Re-sync the shelf from the cloud (covers the "made on another device" case)
    async refreshLibrary() {
      if (this.refreshingLibrary) return;
      this.refreshingLibrary = true;
      try {
        const res = await fetchLibraryIndex({ sort: 'created', limit: 200 });
        this.libraryBooks = res.rows || [];
        setLibraryIndex(this.libraryBooks);
        const covers = await signCoverUrls(this.libraryBooks.map(b => b.cover_image_id));
        this.coverUrls = { ...this.coverUrls, ...covers };
        if (this.librarySearch.trim()) this.runLibrarySearch();
      } catch (e) { console.warn('Refresh failed:', e); }
      finally { this.refreshingLibrary = false; }
    },

    fmtBytes(bytes) { return formatStorageSize(bytes || 0); },
    // Pull-down-to-refresh on the Library (when scrolled to the top)
    handlePullStart(e) {
      this._pullStartY = (window.scrollY <= 0 && !this.manageMode) ? e.touches[0].clientY : null;
      this.pullDistance = 0;
    },
    handlePullMove(e) {
      if (this._pullStartY == null || this.pullRefreshing) return;
      if (window.scrollY > 0) { this._pullStartY = null; this.pullDistance = 0; return; }
      const dy = e.touches[0].clientY - this._pullStartY;
      this.pullDistance = dy > 0 ? Math.min(dy * 0.4, 75) : 0;
    },
    async handlePullEnd() {
      if (this._pullStartY == null) return;
      const triggered = this.pullDistance > 55;
      this._pullStartY = null;
      if (triggered) {
        this.pullRefreshing = true;
        this.pullDistance = 42;
        try { await this.refreshLibrary(); } finally {
          this.pullRefreshing = false;
          this.pullDistance = 0;
        }
      } else {
        this.pullDistance = 0;
      }
    },

    // Cloud image-bucket usage (for the Settings storage bar)
    async fetchCloudUsage() {
      try {
        const r = await imgUsage(getStoredPassword());
        this.cloudUsage = { count: r.count || 0, bytes: r.bytes || 0, loaded: true };
      } catch (e) { console.warn('Usage fetch failed:', e); }
    },

    // ---- Library filter/sort helpers ----
    _distinct(field) {
      const set = new Set();
      this.libraryBooks.forEach(b => { if (b[field]) set.add(b[field]); });
      return [...set].sort();
    },
    _countField(field) {
      const m = {};
      this.libraryBooks.forEach(b => { const v = b[field]; if (v) m[v] = (m[v] || 0) + 1; });
      return m;
    },
    toggleArrayFilter(arr, val) {
      const list = this[arr];
      const i = list.indexOf(val);
      if (i === -1) list.push(val); else list.splice(i, 1);
    },
    isFilterOn(arr, val) { return this[arr].includes(val); },
    toggleFilterOpen(key) { this.openFilter = this.openFilter === key ? null : key; },
    // Summary text shown on a collapsed accordion bar
    filterSummaryText(arrName, options) {
      const vals = this[arrName];
      if (!vals.length) return 'All';
      if (vals.length > 2) return vals.length + ' selected';
      return vals.map(v => {
        if (!options) return v;
        const o = options.find(x => (x.value !== undefined ? x.value : x) === v);
        return o ? (o.label || o) : v;
      }).join(', ');
    },
    // "Reset" clears all filters AND returns sort to Newest created
    clearFilters() {
      this.filterGenres = []; this.filterArts = []; this.filterAges = [];
      this.filterCreators = []; this.sortBy = 'created';
    },
    // Full-text search runs on the server (over story body text), debounced
    runLibrarySearch() {
      clearTimeout(this._searchTimer);
      const q = this.librarySearch.trim();
      if (!q) { this.searchResults = []; this.searchLoading = false; return; }
      this.searchLoading = true;
      this._searchTimer = setTimeout(async () => {
        try {
          const res = await fetchLibraryIndex({ sort: this.sortBy === 'last_read' ? 'last_read' : 'created', limit: 200, search: q });
          if (this.librarySearch.trim() === q) this.searchResults = res.rows || [];
        } catch (e) {
          console.warn('Search failed:', e);
          this.searchResults = [];
        } finally {
          this.searchLoading = false;
        }
      }, 300);
    },
    // A book is openable offline only if its full data is cached on this device
    isBookCachedLocal(id) { return getStoredStories().some(s => s.id === id); },

    // ---- Book detail popup ----
    async openBookDetail(meta, ev) {
      // Remember the tapped book's on-screen position so the "inner cover" can
      // zoom + swing open out of it (GSAP).
      this._bookOpenRect = null;
      if (ev && ev.currentTarget) {
        const srcEl = ev.currentTarget.querySelector('.book-cover') || ev.currentTarget;
        this._bookOpenRect = srcEl.getBoundingClientRect();
      }
      this.bookDetail = meta;
      this.bookDetailStory = null;
      this.$nextTick(() => this.animateBookOpen());
      // Load the full story (cache or cloud) for the reading-time estimate and
      // so tapping Read is instant. Guard against the popup being closed/changed.
      try {
        const story = getStoredStories().find(s => s.id === meta.id) || await fetchFullStory(meta.id);
        if (this.bookDetail && this.bookDetail.id === meta.id) this.bookDetailStory = story || null;
      } catch (e) { /* reading time just won't show */ }
    },
    // Zoom + swing the inner-cover open out of the tapped book.
    animateBookOpen() {
      const el = this.$refs.innerCover, overlay = this.$refs.bookDetailOverlay;
      if (!el || typeof gsap === 'undefined') return;
      const src = this._bookOpenRect;
      gsap.killTweensOf(el);
      if (overlay) gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.28, ease: 'power1.out' });
      if (src) {
        const t = el.getBoundingClientRect();
        const scale = Math.max(0.12, Math.min(1, src.width / t.width));
        const dx = (src.left + src.width / 2) - (t.left + t.width / 2);
        const dy = (src.top + src.height / 2) - (t.top + t.height / 2);
        el.style.transformOrigin = 'center center';
        gsap.fromTo(el,
          { x: dx, y: dy, scale, rotationY: 38, opacity: 0.5, transformPerspective: 1000 },
          { x: 0, y: 0, scale: 1, rotationY: 0, opacity: 1, duration: 0.52, ease: 'power3.out',
            clearProps: 'transform,opacity,transformPerspective,transformOrigin' });
      } else {
        gsap.fromTo(el, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.32, ease: 'power2.out', clearProps: 'transform,opacity' });
      }
    },
    closeBookDetail() {
      const el = this.$refs.innerCover, overlay = this.$refs.bookDetailOverlay;
      const done = () => { this.bookDetail = null; this.bookDetailStory = null; this._bookOpenRect = null; };
      if (!el || typeof gsap === 'undefined') { done(); return; }
      const src = this._bookOpenRect;
      gsap.killTweensOf(el);
      if (overlay) gsap.to(overlay, { opacity: 0, duration: 0.3, ease: 'power1.in' });
      if (src) {
        const t = el.getBoundingClientRect();
        const scale = Math.max(0.12, Math.min(1, src.width / t.width));
        const dx = (src.left + src.width / 2) - (t.left + t.width / 2);
        const dy = (src.top + src.height / 2) - (t.top + t.height / 2);
        el.style.transformOrigin = 'center center';
        gsap.to(el, { x: dx, y: dy, scale, rotationY: 32, opacity: 0, transformPerspective: 1000, duration: 0.36, ease: 'power3.in', onComplete: done });
      } else {
        gsap.to(el, { scale: 0.85, opacity: 0, duration: 0.26, ease: 'power2.in', onComplete: done });
      }
    },
    readFromDetail() {
      const m = this.bookDetail;
      const s = this.bookDetailStory;
      this.bookDetail = null;
      this.bookDetailStory = null;
      if (m) this.openBook(m, s);
    },
    // NEW = you haven't opened it yet AND it was made in the last 3 days
    isBookNew(meta) {
      if (!meta || meta.last_read_at) return false;
      const created = meta.created_at || meta.createdAt;
      if (!created) return false;
      return (Date.now() - new Date(created).getTime()) < 3 * 24 * 60 * 60 * 1000;
    },

    // Open a book from the Library — use the local cache if present, else
    // fetch it from the cloud and pull its images down for offline reading.
    async openBook(meta, preloadedStory) {
      this.error = '';
      this.loading = true;
      this.loadingMessage = 'Opening book…';
      this.loadingHint = 'just a moment';
      try {
        let story = preloadedStory || getStoredStories().find(s => s.id === meta.id);
        if (!story) {
          story = await fetchFullStory(meta.id);
          if (!story) throw new Error('Could not load this book.');
        }
        await ensureStoryImagesLocal(story);

        // Stamp last-read (local + cloud) — this also clears the "NEW" badge
        story.last_read_at = new Date().toISOString();
        try { saveStoryToStorage(story); } catch (e) { if (!e.isQuota) throw e; }
        syncStampLastRead(story).catch(() => {});
        // reflect last_read in the in-memory list so the badge updates live
        const m = this.libraryBooks.find(b => b.id === meta.id);
        if (m) m.last_read_at = story.last_read_at;

        this.currentStory = story;
        this.currentStoryRecord = story;
        this.currentStoryCost = story.cost || 0;
        this.currentTextCost = story.text_cost || 0;
        this.currentImagesCost = story.images_cost || 0;
        this.currentPageIndex = 0;
        this.loading = false;
        this.view = 'story';
        window.scrollTo(0, 0);

        await this.evictOldCachedBooks();
      } catch (e) {
        this.loading = false;
        this.error = e.message || 'Could not open book.';
        alert(this.error);
      }
    },

    // Delete a book everywhere: cloud row + cloud images + local cache + shelf
    // Delete ONE book everywhere (cloud row + images + local cache + shelf). No confirm.
    async deleteBookById(id) {
      let full = getStoredStories().find(s => s.id === id);
      if (!full) { try { full = await fetchFullStory(id); } catch (e) {} }
      if (full) {
        const ids = [full.cover && full.cover.image_id, ...((full.pages || []).map(p => p.image_id))].filter(Boolean);
        for (const im of ids) { try { await deleteImageBlob(im); } catch (e) {} this.releaseImageURL(im); }
      }
      deleteStoryFromStorage(id);
      syncDeleteStory(full || { id, cover: {}, pages: [] }).catch(e => console.warn('Cloud delete failed:', e));
      this.libraryBooks = this.libraryBooks.filter(b => b.id !== id);
      setLibraryIndex(this.libraryBooks);
    },

    // ---- Manage / delete books — select mode on the bookshelf ----
    openManageBooks() {
      this.booksToDelete = [];
      this.showSettings = false;
      this.librarySearch = '';
      this.manageMode = true;
      this.view = 'library';
      window.scrollTo(0, 0);
    },
    exitManageMode() { this.manageMode = false; this.booksToDelete = []; },
    isBookSelectedForDelete(id) { return this.booksToDelete.includes(id); },
    toggleBookForDelete(id) {
      const i = this.booksToDelete.indexOf(id);
      if (i === -1) this.booksToDelete.push(id);
      else this.booksToDelete.splice(i, 1);
    },
    async confirmDeleteSelected() {
      const ids = [...this.booksToDelete];
      if (!ids.length || this.managingDelete) return;
      if (!confirm(`Delete ${ids.length} book${ids.length > 1 ? 's' : ''}? This removes them from all your devices and can't be undone.`)) return;
      this.managingDelete = true;
      for (const id of ids) { await this.deleteBookById(id); }
      this.booksToDelete = [];
      this.managingDelete = false;
      this.refreshStorageSize();
      this.refreshImageStats();
      this.exitManageMode();
    },

    // ---- One-time pass: refresh every book's summary (longer + fill missing) ----
    async handleUpdateSummaries() {
      if (this.summaryUpdating) return;
      if (!confirm('Refresh the summary for every book (and add any missing ones)? This may take a minute.')) return;
      this.summaryUpdating = true;
      this.summaryProgress = 'Starting…';
      let ok = 0, fail = 0;
      const books = [...this.libraryBooks];
      for (let i = 0; i < books.length; i++) {
        this.summaryProgress = `Updating summaries… ${i + 1}/${books.length}`;
        try {
          let story = getStoredStories().find(s => s.id === books[i].id) || await fetchFullStory(books[i].id);
          if (!story) { fail++; continue; }
          const { summary } = await generateStorySummary(story, this.password);
          if (summary) {
            story.summary = summary;
            try { saveStoryToStorage(story); } catch (e) { if (!e.isQuota) throw e; }
            syncPushStory(story).catch(() => {});
            const m = this.libraryBooks.find(b => b.id === books[i].id);
            if (m) m.summary = summary;
            ok++;
          } else { fail++; }
        } catch (e) { console.warn('Summary update failed:', books[i].id, e); fail++; }
      }
      setLibraryIndex(this.libraryBooks);
      this.summaryProgress = `Done! Updated ${ok}${fail ? `, ${fail} failed` : ''}.`;
      this.summaryUpdating = false;
    },

    // Keep only the most-recently-read N books fully on-device; older ones
    // stay in the cloud and re-download on demand. Frees local space.
    // SAFETY: only ever evict a book we've CONFIRMED is in the cloud index —
    // never delete the only copy of something that hasn't synced.
    async evictOldCachedBooks() {
      const stories = getStoredStories();
      if (stories.length <= this.MAX_CACHED_BOOKS) return;
      const cloudIds = new Set((this.libraryBooks || []).map(b => b.id));
      const sorted = [...stories].sort((a, b) => {
        const ax = a.last_read_at || a.createdAt || '';
        const bx = b.last_read_at || b.createdAt || '';
        return bx.localeCompare(ax);
      });
      const overflow = sorted.slice(this.MAX_CACHED_BOOKS);
      for (const s of overflow) {
        if (!cloudIds.has(s.id)) continue;   // not confirmed in cloud → keep it local
        const ids = [s.cover && s.cover.image_id, ...((s.pages || []).map(p => p.image_id))].filter(Boolean);
        for (const id of ids) {
          try { await deleteImageBlob(id); } catch (e) {}
          this.releaseImageURL(id);
        }
        deleteStoryFromStorage(s.id);
      }
      this.refreshStorageSize();
      this.refreshImageStats();
    },

    // Background: ensure the most recent books are fully cached for offline
    async prefetchRecentBooks() {
      const recent = (this.libraryBooks || []).slice(0, this.MAX_CACHED_BOOKS);
      for (const meta of recent) {
        try {
          let story = getStoredStories().find(s => s.id === meta.id);
          if (!story) {
            story = await fetchFullStory(meta.id);
            if (story) { try { saveStoryToStorage(story); } catch (e) { if (!e.isQuota) throw e; } }
          }
          if (story) await ensureStoryImagesLocal(story);
        } catch (e) {
          console.warn('Prefetch book failed:', meta.id, e);
        }
      }
      await this.evictOldCachedBooks();
    },

    // Cover thumbnail for the Library: local cached blob first, then signed URL
    libraryCover(meta) {
      if (!meta || !meta.cover_image_id) return null;
      return this.getImageURL(meta.cover_image_id) || this.coverUrls[meta.cover_image_id] || null;
    },
    libraryDate(meta) {
      const iso = (meta && (meta.created_at || meta.createdAt)) || '';
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d)) return '';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },
    handleClearStories() {
      if (!confirm('Clear all saved stories? This cannot be undone.')) return;
      clearAllStories();
      this.refreshStorageSize();
    },
    async handleClearImages() {
      if (!confirm('Clear the on-device image cache? Your books stay safe in the cloud and re-download when you open them.')) return;
      await clearAllImages();
      if (this._loadingUrls) this._loadingUrls = {};
      this.imageUrls = {};
      this.refreshImageStats();
    },
    // Remove leftover/orphaned images not referenced by any cached book or character
    async handleCleanupImages() {
      const referenced = new Set();
      for (const s of getStoredStories()) {
        if (s.cover && s.cover.image_id) referenced.add(s.cover.image_id);
        (s.pages || []).forEach(p => { if (p.image_id) referenced.add(p.image_id); });
      }
      for (const c of getStoredCharacters()) {
        if (c.thumbnail_id) referenced.add(c.thumbnail_id);
        if (c.photo_id) referenced.add(c.photo_id);
      }
      let removed = 0;
      try {
        const all = await getAllImageIds();
        for (const id of all) {
          if (!referenced.has(id)) {
            try { await deleteImageBlob(id); this.releaseImageURL(id); removed++; } catch (e) {}
          }
        }
      } catch (e) { console.warn('Cleanup failed', e); }
      await this.refreshImageStats();
      alert(`Removed ${removed} unused image${removed !== 1 ? 's' : ''} from this device.`);
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

        // Call Vision API (auto-retries on the occasional refusal)
        const result = await analyzeCharacterPhotoWithRetry(dataUrl, this.password);
        recordSpend('characters', result.cost);   // photo vision counts as Character creation
        if (result.refused) {
          // Keep the photo (so they can re-analyze) but don't store the refusal text
          this.error = 'The photo reader declined to describe this one. Tap "🔄 Re-analyze photo" to try again, or use a clearer/different photo.';
        } else {
          this.charForm.photo_description = result.description;
        }
        this.refreshImageStats();
      } catch (err) {
        console.error('Photo analysis failed:', err);
        this.error = err.message || 'Could not analyze photo. Try again.';
      } finally {
        this.analyzingPhoto = false;
      }
    },

    // Re-run photo analysis on the already-uploaded photo (no re-upload needed)
    async handleReanalyzePhoto() {
      if (!this.charForm.photo_id || this.analyzingPhoto) return;
      this.analyzingPhoto = true;
      this.error = '';
      try {
        const blob = await getImageBlob(this.charForm.photo_id);
        if (!blob) throw new Error('Photo not found on this device.');
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = () => rej(new Error('Could not read photo'));
          r.readAsDataURL(blob);
        });
        const result = await analyzeCharacterPhotoWithRetry(dataUrl, this.password);
        recordSpend('characters', result.cost);   // photo vision counts as Character creation
        if (result.refused) {
          this.error = 'Still couldn\'t read the photo. Try a different one — a clear, well-lit, front-facing photo works best.';
        } else {
          this.charForm.photo_description = result.description;
        }
      } catch (err) {
        this.error = err.message || 'Could not re-analyze photo.';
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
        recordSpend('characters', result.cost);
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
      const s = this.quizScore();
      if (s.total && s.correct === s.total) this.fireConfetti(true);   // only celebrate a perfect score
    },
    tryQuizAgain() { this.quizAnswers = {}; this.quizRevealed = false; },
    quizResultMessage() {
      const s = this.quizScore();
      if (!s.total) return '';
      if (s.correct === s.total) return 'Perfect! 🌟 You got them all!';
      if (s.correct >= Math.ceil(s.total * 0.6)) return 'So close! 💪 Give it another try?';
      return 'Good effort! 📚 Want to try again?';
    },
    fireConfetti(big) {
      if (typeof confetti !== 'function') return;
      const burst = (opts) => confetti(Object.assign({ origin: { y: 0.6 }, zIndex: 99999 }, opts));
      if (big) {
        burst({ particleCount: 140, spread: 80, startVelocity: 45 });
        setTimeout(() => burst({ particleCount: 80, spread: 100, angle: 60, origin: { x: 0, y: 0.7 } }), 150);
        setTimeout(() => burst({ particleCount: 80, spread: 100, angle: 120, origin: { x: 1, y: 0.7 } }), 250);
      } else {
        burst({ particleCount: 70, spread: 60 });
      }
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
        this.showQuiz || this.bookDetail;
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
    bookDetail() { this.updateBodyScroll(); },
    librarySearch() { this.runLibrarySearch(); },
    view(v) {
      if (v === 'story') {
        this.pokeReaderUi();
        this.preloadAdjacentImages();
        this.$nextTick(() => this.recomputeStoryFontSize());
      }
    },
    // Preload neighbouring images after a page settles (NOT a UI poke — the
    // controls only appear on an intentional tap, never during turning).
    currentPageIndex() {
      if (this.view !== 'story') return;
      clearTimeout(this._preloadT);
      this._preloadT = setTimeout(() => this.preloadAdjacentImages(), 120);
    },
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
