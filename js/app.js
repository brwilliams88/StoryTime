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
      version: 'v0.12.7',
      buildDate: '2026-07-10',

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

      coverShift: false,   // true = closed book slid into its hinge-side half (for the close turn)
      pageTurning: false,  // true during a page-curl turn — keeps the centre crease visible even when the destination page has none (e.g. last page → toolbox)

      // DIAGNOSTICS mode (dev). A master switch (Settings) that surfaces in-app
      // tuning tools — currently the cover-edge panel; reused for future builds.
      diagMode: false,
      showCoverDiag: false,
      coverDiag: {
        // DIALED-IN edge look (fixed — no longer user-tunable):
        edgeStyle: 'paper',     // paper page-stack treatment
        outline: true,          // subtle dark-brown line where the band meets cover / inner page
        shadow: true,           // soft shadow around the lifted edge
        edgeBase: 12,           // px = true board thickness T at the iPhone baseline short-side
        edgeRef: 390,           // baseline short-side (iPhone logical px)
        edgeScale: 1.2,         // thickness multiplier
        // EDGE-FOLLOWING page-turn shadow (js/pageShadow.js) — the ONLY page-turn
        // shadow now (receiver + gutter layers removed v0.9.55). A thin page-edge
        // line + a soft one-sided shadow that trails the moving edge onto the page
        // beneath, flipping sides at 90°. Same on interior turns + cover + toolbox.
        // LOCKED-IN POR (v0.9.56). Controls kept in 🧪 for future tuning.
        pageShadow: true,       // MASTER on/off
        shadowDebug: false,     // tint the shadow orange to check it's working
        shadowCurve: 'linear',  // ramp flat→90°: 'linear' | 'x2' | 'x2.5' | 'x3' (linear is the POR)
        edgeDarkness: 0.5,      // 0..2 shadow darkness/opacity (slider goes to 200%) — dialed down (POR: closer to the cover look) v0.9.69
        edgeReach: 0.10,        // 0..1 how far the shadow reaches past the edge (∝ page size) — dialed down
        edgeSoft: 0.25,         // 0..1 softness (blur) of the shadow
        closeShowShelf: true,   // FIXED ON (POR): book-close shows the real bookshelf under the closing cover
      },

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
      cloudUsage: { count: 0, bytes: 0, r2Count: 0, sbCount: 0, unmigrated: 0, loaded: false },   // image storage usage (R2 + Supabase)
      // ---- Share a story ----
      shareMode: false,          // true when this page is a read-only shared link
      shareLoadError: false,     // shared story genuinely not found (bad/removed link → 404)
      shareNetworkError: false,  // couldn't reach the server (flaky signal/offline → offer retry)
      shareCopied: false,        // brief "Link copied" confirmation (desktop share fallback)
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
      charSort: 'recent',            // recent | used | name | newest
      showCharSortMenu: false,
      charStoriesFor: null,          // character whose "used in stories" popup is open
      openCharMenu: null,            // character id whose ⋯ (Edit/Delete) menu is open
      openPicker: null,              // 'genre' | 'artStyle' — which sheet picker is open
      showIngredients: false,        // Story Ingredients section hidden (kept in code for a future re-add — Kai liked it)
      createBurst: false,            // sparkle-burst overlay when opening the New Story form
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
        { value: 'anime',            emoji: '🌸', label: 'Anime' },
        { value: 'pixel-art',        emoji: '👾', label: 'Retro Video Game' },
        { value: '3d-animation',     emoji: '🎬', label: '3D Animation' },
        { value: 'claymation',       emoji: '🏺', label: 'Claymation' },
        { value: 'building-blocks',  emoji: '🧱', label: 'Lego' },
        { value: 'stuffies',         emoji: '🐻', label: 'Stuffies' },
        { value: 'paper-cutouts',    emoji: '✂️', label: 'Paper Cutouts' },
        { value: 'chalkboard',       emoji: '📋', label: 'Chalkboard' },
        { value: '3d-printed',       emoji: '🖨️', label: '3D Printed' },
        { value: 'photorealistic',   emoji: '📷', label: 'Photorealistic' },
        { value: 'stained-glass',    emoji: '🪟', label: 'Stained Glass' },
        { value: 'colored-pencil',   emoji: '🌈', label: 'Colored Pencil' },
        { value: 'oil-painting',     emoji: '🖼️', label: 'Oil Painting' },
        { value: 'ukiyo-e',          emoji: '🌊', label: 'Ukiyo-e' },
        { value: 'origami',          emoji: '🦢', label: 'Origami' },
        { value: 'candy-world',      emoji: '🍬', label: 'Candy World' },
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
      const list = [...this.characters];
      if (this.charSort === 'name') {
        return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      }
      if (this.charSort === 'newest') {
        return list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      }
      if (this.charSort === 'used') {
        return list.sort((a, b) =>
          this.characterStoryCount(b) - this.characterStoryCount(a) ||
          (b.last_used_at || '').localeCompare(a.last_used_at || ''));
      }
      // 'recent' (default): brand-new first, then most-recently-used
      return list.sort((a, b) => {
        const aNew = !a.last_used_at;
        const bNew = !b.last_used_at;
        if (aNew && !bNew) return -1;
        if (!aNew && bNew) return 1;
        if (aNew && bNew) return (b.created_at || '').localeCompare(a.created_at || '');
        return b.last_used_at.localeCompare(a.last_used_at);
      });
    },
    charSortLabel() {
      return { recent: 'Recently used', used: 'Most used', name: 'Name A–Z', newest: 'Newest' }[this.charSort] || 'Recently used';
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
      const cap = 10 * 1073741824; // 10 GB R2 free-tier storage
      return Math.min(100, Math.round((this.cloudUsage.bytes / cap) * 100));
    },
    distinctCreators() { return this._distinct('created_by'); },
    _genreCounts() { return this._countField('genre'); },
    _artCounts() { return this._countField('art_style'); },
    _creatorCounts() { return this._countField('created_by'); },
    // Story-breakdown bar rows (Settings), sorted by count desc
    genreBreakdown() { return this._breakdownRows(this._genreCounts, this.genresRaw); },
    artBreakdown()   { return this._breakdownRows(this._artCounts, this.artStylesRaw); },
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
    // Normal: cover + N pages + toolbox/about spread (= N + 2).
    // Share mode: no toolbox/about spread — reading ends on the last text page.
    totalReadingPages() {
      if (!this.currentStory) return 0;
      return this.totalStoryPages + (this.shareMode ? 1 : 2);
    },
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
      if (this.isOnStoryToolbox) return 'About';
      return `Page ${this.currentPageIndex} of ${this.totalStoryPages}`;
    },
    // Short form for the floating indicator, e.g. "2/9"
    pageShortLabel() {
      if (!this.currentStory) return '';
      if (this.isOnStoryToolbox) return 'About';
      if (!this.currentStoryPage) return '';
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
    // End-spread info labels (map the saved story's params → human labels).
    _storyFormData() { return (this.currentStory && this.currentStory.formData) || {}; },
    storyGenreLabel() {
      const v = this._storyFormData.genre;
      if (!v || v === 'surprise-me') return '';
      const g = this.genresRaw.find(x => x.value === v);
      return g ? (g.emoji ? g.emoji + ' ' : '') + g.label : '';
    },
    storyArtStyleLabel() {
      const v = this.currentStory && (this.currentStory.art_style || this._storyFormData.artStyle);
      if (!v || v === 'surprise-me') return '';
      const a = this.artStylesRaw.find(x => x.value === v);
      return a ? (a.emoji ? a.emoji + ' ' : '') + a.label : '';
    },
    // "Long (~8 min)" — matches the creation form (label + reading-time subtitle).
    storyLengthFull() {
      const v = this._storyFormData.length;
      const l = this.lengths.find(x => x.value === v);
      return l ? `${l.label} (${l.subtitle})` : '';
    },
    // e.g. "Created by Kai on June 29 at 9:01pm"
    createdByLine() {
      const s = this.currentStory; if (!s) return '';
      const who = s.created_by ? `Created by ${s.created_by}` : 'Created';
      if (!s.createdAt) return who;
      const d = new Date(s.createdAt);
      const date = d.toLocaleString('en-US', { month: 'long', day: 'numeric' });
      const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
      return `${who} on ${date} at ${time}`;
    },
  },

  mounted() {
    console.log(`${this.appName} ${this.version} loaded ✓`);
    setTimeout(() => this.dismissSplash(), 1500);

    // Wire the finger-following page-curl to the reader (snapshots + nav).
    if (typeof window.PageCurl !== 'undefined') {
      const self = this;
      window.PageCurl.init({
        // moving cast shadow config (shared with the cover-open animation)
        pageShadow: () => self._shadowOpts(),
        index: () => self.currentPageIndex,
        setIndex: (i) => {
          // A turn landing on the cover = closing the book: render the cover
          // already slid into its half so the turn reveals it book-in-half.
          // (Turns only reach index 0 via a close, so this is safe.)
          if (i === 0) self.coverShift = true;
          self.pageTurning = true;   // keep the centre crease through the turn even if dest has none
          self.currentPageIndex = i;
        },
        canNext: () => self.canGoNext(),
        canPrev: () => self.canGoPrev(),
        goNext: () => self.nextPage(),
        goPrev: () => self.prevPage(),
        isPortrait: () => self.isPortrait,
        onTap: () => self.pokeReaderUi(),
        afterRender: (fn) => self.$nextTick(fn),
        // Veto finger-following the CLOSE (page 1 → cover). Finger-following it
        // swaps the spread for the cover mid-touch, which freezes iOS (touch
        // events stop once the touched element is removed). Instead play the
        // close as a triggered animation — safe, since it's not driven by the
        // live touch — on the next tick (after the curl has cleaned up).
        beforeTurn: (forward) => {
          // Backward from page 1 = close the book → play the custom reverse open.
          if (!forward && self.currentPageIndex === 1) {
            setTimeout(() => self.coverClose(true), 0);
            return false;
          }
          return true;
        },
        // After a turn settles. For the back-arrow exit (landed on the cover),
        // we KEEP the book in its book-in-half pose and hand straight to the
        // shelf morph, which does the travel-to-centre itself (so the dark can
        // melt during that travel). For a normal close, settle to centre here.
        afterTurn: (landed) => {
          self._coverAnim = false;
          self.pageTurning = false;
          if (landed === 0 && self._closingToLibrary != null) {
            const id = self._closingToLibrary; self._closingToLibrary = null;
            self.$nextTick(() => self._bookToShelf(id));
          } else {
            self.coverShift = false;
          }
        },
      });
    }

    const stored = getStoredPassword();
    if (stored) this.password = stored;

    this.showInspect = getShowInspect();
    try { this.diagMode = localStorage.getItem('storytime_diag_mode') === '1'; } catch (e) {}
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

    // Mobile browsers show/hide their URL bar as you read, changing the usable
    // height. visualViewport fires even when window 'resize' doesn't, so we track
    // it into a --vvh CSS var and re-fit the text. Matters most for shared links
    // (opened in a plain browser tab, not an installed full-screen PWA).
    if (window.visualViewport) {
      this._vvHandler = () => {
        document.documentElement.style.setProperty('--vvh', window.visualViewport.height + 'px');
        clearTimeout(this._resizeT);
        this._resizeT = setTimeout(() => this.recomputeStoryFontSize(), 120);
      };
      window.visualViewport.addEventListener('resize', this._vvHandler);
      this._vvHandler();
    }

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
        if (this.isOnCover) { this.coverOpen(); return; }   // custom book-open animation
        if (window.PageCurl && window.PageCurl.animate) window.PageCurl.animate(true); else this.nextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.currentPageIndex === 1) { this.coverClose(true); return; }   // close the book (reverse open)
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

    // A shared link (window.__SHARE__ injected by the Worker) boots straight
    // into a read-only, password-free view of one story — no library, no gate.
    if (window.__SHARE__) {
      this.enterShareMode();
    } else if (this.password) {
      // If we already have a password, sync with the cloud on open
      this.initCloudData();
    }
  },

  beforeUnmount() {
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    if (this._onlineHandler) window.removeEventListener('online', this._onlineHandler);
    if (this._offlineHandler) window.removeEventListener('offline', this._offlineHandler);
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    if (this._vvHandler && window.visualViewport) window.visualViewport.removeEventListener('resize', this._vvHandler);
  },

  methods: {

    dismissSplash() {
      if (!this.showSplash) return;
      this.showSplash = false;
      // Shared links never ask for a password — they're public by design.
      if (!this.password && !this.shareMode && !window.__SHARE__) this.showPasswordPrompt = true;
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
      if (role === 'good-guy') return 'Hero';
      if (role === 'bad-guy') return 'Villain';
      return '';
    },
    // A character is the villain when explicitly tagged; otherwise treated as a hero.
    isVillain(charId) { return this.getCharacterRole(charId) === 'bad-guy'; },
    toggleVillain(charId) { this.setCharacterRole(charId, this.isVillain(charId) ? 'none' : 'bad-guy'); },
    formatRelative(iso) { return formatRelativeTime(iso); },
    // ----- Character avatar placeholder + story-usage -----
    avatarInitial(char) {
      const n = (char && char.name || '').trim();
      return n ? n.charAt(0).toUpperCase() : '?';
    },
    characterStoryTitles(char) {
      if (!char || !char.id) return [];
      const name = (char.name || '').toLowerCase().trim();
      return (this.libraryBooks || [])
        .filter(b => {
          // Prefer an exact character-id match (distinguishes two characters with the
          // same name); fall back to name for older stories that predate character_ids.
          if (Array.isArray(b.character_ids)) return b.character_ids.includes(char.id);
          return name && (b.character_names || '').toLowerCase().includes(name);
        })
        .map(b => ({ id: b.id, title: b.title || 'Untitled', cover: this.libraryCover(b) }));
    },
    characterStoryCount(char) { return this.characterStoryTitles(char).length; },
    openCharStories(char) { this.charStoriesFor = char; },
    closeCharStories() { this.charStoriesFor = null; },
    openCharStory(id) { this.charStoriesFor = null; const b = (this.libraryBooks || []).find(x => x.id === id); if (b) { this.closeCharactersModal(); this.openBookMorph(b, null); } },
    setCharSort(mode) { this.charSort = mode; this.showCharSortMenu = false; },
    // ----- Genre / Art Style pop-up sheet picker -----
    pickerOptions() { return this.openPicker === 'artStyle' ? this.artStyles : this.genres; },
    pickerTitle() { return this.openPicker === 'artStyle' ? 'Artwork style' : 'Genre'; },
    pickerCurrent() { return this.openPicker === 'artStyle' ? this.formData.artStyle : this.formData.genre; },
    pickerLabel(which) {
      const list = which === 'artStyle' ? this.artStyles : this.genres;
      const val = which === 'artStyle' ? this.formData.artStyle : this.formData.genre;
      const opt = list.find(o => o.value === val);
      return opt ? { emoji: opt.emoji, label: opt.label } : { emoji: '📖', label: 'Choose…' };
    },
    openPickerSheet(which) { this.openPicker = which; document.body.classList.add('sheet-scroll-lock'); },
    selectPickerOption(value) {
      if (this.openPicker === 'artStyle') this.formData.artStyle = value;
      else this.formData.genre = value;
      this.closePicker();
    },
    closePicker() { this.openPicker = null; document.body.classList.remove('sheet-scroll-lock'); },
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
      // Characters, Story Details + Created By are all required
      if (!this.selectedCharCount) {
        this.error = 'Choose at least one character before generating.'; return;
      }
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

      // Build the "story so far" (earlier pages) so the enrichment can carry
      // persistent items forward and drop characters who have left the story.
      let storySoFar = '';
      if (target !== 'cover' && storyData.pages) {
        storySoFar = storyData.pages.slice(0, target)
          .map((p, i) => `Page ${i + 1}: ${this.applyNameFallback(p.text || '', charsForPrompt)}`)
          .join('\n');
      }

      try {
        if (basicScene) {
          // For page text used in enrichment context, also apply name fallback
          const safePageText = this.applyNameFallback(pageText, charsForPrompt);
          const enrich = await enrichImagePrompt(
            storyData.style_anchor,
            basicScene,
            safePageText,
            charsForPrompt,
            this.password,
            storySoFar
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

    // The COVER (index 0) and PAGE 1 are special and use the custom, FINGER-
    // FOLLOWING book animation: on the cover a forward drag OPENS; on page 1 a
    // backward drag CLOSES (reverse). A forward drag on page 1 (turn to page 2)
    // is handed off to the page-curl engine once we know the direction. Every
    // other page goes straight to the page-curl engine.
    curlStart(e) {
      if (this.isOnCover || this.currentPageIndex === 1) { this._coverDown(e); return; }
      // Every other page — INCLUDING the last text page and the toolbox end-spread
      // — uses the same finger-following page-curl engine. (The toolbox is now a
      // real 2-page .book-page spread, so it clones/splits like any other page and
      // no longer needs the old robust-flick special case.)
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
    _coverPoint(e) {
      const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
    },
    _coverDown(e) {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      const p = this._coverPoint(e);
      const area = (e.currentTarget && e.currentTarget.classList && e.currentTarget.classList.contains('page-area'))
        ? e.currentTarget : (e.target.closest && e.target.closest('.page-area'));
      this._cg = { x0: p.x, y0: p.y, axis: this.isPortrait ? 'y' : 'x', primary: 0, started: false,
                   mode: this.isOnCover ? 'open' : 'close', startEvt: e, area, dir: null,
                   pointerId: (e.pointerId != null ? e.pointerId : null) };
    },
    _coverMoveGesture(e) {
      const g = this._cg; if (!g) return;
      const p = this._coverPoint(e);
      const primary = g.axis === 'x' ? p.x - g.x0 : p.y - g.y0;
      const now = Date.now();
      g.speed = (Math.abs(primary) - (g.last || 0)) / Math.max(1, now - (g.lastT || now));
      g.last = Math.abs(primary); g.lastT = now; g.primary = primary;
      if (Math.abs(primary) > 8 && e.cancelable) e.preventDefault();
      if (!g.started) {
        if (Math.abs(primary) < 8) return;
        // Capture the pointer so a finger-driven cover open/close survives any DOM
        // swap under the finger (same fix as the page-curl).
        if (g.pointerId != null && g.area && g.area.setPointerCapture) { try { g.area.setPointerCapture(g.pointerId); } catch (_) {} }
        if (g.mode === 'open') {
          if (primary >= 0) return;          // need a forward (open) drag
          g.started = true; g.dir = 'cover';
          this.coverOpenStart(false);        // build at p=0, finger-driven
        } else {                              // on page 1
          g.started = true;
          if (primary > 0) {                  // backward = CLOSE the book (finger-driven reverse)
            g.dir = 'cover';
            this.coverClose(false);           // build at p=1, finger-driven (no auto-play)
          } else {                            // forward = turn to page 2 → hand to the curl engine
            g.dir = 'curl';
            if (g.pointerId != null && g.area && g.area.releasePointerCapture) { try { g.area.releasePointerCapture(g.pointerId); } catch (_) {} }
            this._cg = null;
            if (window.PageCurl) { window.PageCurl.start(g.startEvt, g.area); window.PageCurl.move(e); }
            return;
          }
        }
      }
      if (g.dir === 'cover' && this._coverFx) {
        const range = (this.isPortrait ? window.innerHeight : window.innerWidth) * 0.55;
        const drag = Math.min(1, Math.max(0, Math.abs(primary) / range));
        const prog = g.mode === 'open' ? drag : (1 - drag);   // close runs p from 1→0
        this._coverFx.p = prog;
        this._coverFx.apply(prog);
      }
    },
    _coverUpGesture() {
      const g = this._cg; if (!g) return;
      if (g.pointerId != null && g.area && g.area.releasePointerCapture) { try { g.area.releasePointerCapture(g.pointerId); } catch (_) {} }
      this._cg = null;
      if (!g.started) { this.pokeReaderUi(); return; }       // tap → reveal controls
      if (g.dir !== 'cover' || !this._coverFx) { this._coverAnim = false; return; }
      const fast = (g.speed || 0) > 0.4;
      if (g.mode === 'open') {
        this._coverAnimateTo(this._coverFx.p > 0.3 || fast ? 1 : 0);   // commit open
      } else {
        this._coverAnimateTo(this._coverFx.p < 0.7 || fast ? 0 : 1);   // commit close
      }
    },

    // Arrow key / programmatic open: play it through.
    coverOpen() { this.coverOpenStart(true); },

    // DEV diagnostic: jump to the cover, play the open, then auto-close — so the
    // whole open→close cycle can be watched hands-free while tuning edge options.
    diagReplay() {
      if (this._coverAnim) return;
      this.currentPageIndex = 0;
      this.$nextTick(() => {
        this.coverOpen();
        setTimeout(() => { if (this.currentPageIndex === 1 && !this._coverAnim) this.coverClose(true); }, 1200);
      });
    },

    // Build the book-open overlay (NOT the page-turn engine), as a progress
    // controller this._coverFx with apply(p): p=0 closed cover, p=1 open spread.
    // Over a dark stage (nothing peeks early): the front cover slides to centre
    // and swings UP/outward around its hinge (gone by 90°); the inner TEXT page
    // slides into the bottom/right half; past 90° the IMAGE page lays down onto
    // the top/left half. A SINGLE "thickness" bar (the book edge) grows
    // 0→12px by 90° then shrinks back to 0 as the page lays, and TRACKS the free
    // (fore) edge of the turning leaf — at screen centre only at exactly 90°.
    // Built ENTIRELY from story DATA (cover + spread), so it works whether or
    // not the live cover is in the DOM (needed for the close, which fires from
    // the page-1 spread). Returns fx, or null if it can't build.
    // Single source of truth for the shared cast-shadow diagnostics, passed to
    // BOTH the page-curl engine and the cover-open/close animation so they ramp,
    // project, soften, and debug-colour identically (js/pageShadow.js).
    _shadowOpts() {
      const d = this.coverDiag;
      return {
        on: d.pageShadow, debug: !!d.shadowDebug, curve: d.shadowCurve,
        darkness: d.edgeDarkness != null ? d.edgeDarkness : 0.5,
        reach: d.edgeReach != null ? d.edgeReach : 0.3,
        soft: d.edgeSoft != null ? d.edgeSoft : 0.35,
      };
    },
    _coverFxBuild() {
      const area = document.querySelector('.page-area');
      const story = this.currentStory;
      if (!area || !story) return null;

      const r = area.getBoundingClientRect();
      const portrait = this.isPortrait;
      const W = r.width, H = r.height;
      const axisLen = portrait ? H : W;
      const half = axisLen / 2;
      const cClosed = axisLen / 2 - half / 2;
      const center = axisLen / 2;
      const dark = (getComputedStyle(document.documentElement).getPropertyValue('--bg-deep') || '').trim() || '#1a1208';
      const PERSP = 1500;   // must match the wrap's CSS perspective below
      const minSide = Math.min(W, H);   // edge thickness scales off this (12px @ ~390px baseline)
      let closing = false;  // set via fx.setClosing — flips the cast-shadow to the opposite page on close

      // Sample the average colour of the cover + page-1 images (1×1 canvas) for the
      // 'bleed' edge treatment — async, used by apply() once ready.
      const fxColors = { cover: null, page: null };
      const sampleColor = (url, key) => {
        if (!url) return;
        const im = new Image();
        im.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 1, 1); const px = x.getImageData(0, 0, 1, 1).data; fxColors[key] = 'rgb(' + px[0] + ',' + px[1] + ',' + px[2] + ')'; } catch (e) {} };
        im.src = url;
      };

      const pg = (story.pages && story.pages[0]) || {};
      const imgUrl = this.getImageURL(pg.image_id);
      const buildSpread = () => {
        const sp = document.createElement('div');
        sp.className = 'book-page story-spread' + (portrait ? ' portrait' : '');
        Object.assign(sp.style, { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', margin: '0' });
        const si = document.createElement('div'); si.className = 'spread-image';
        if (imgUrl) {
          const blur = document.createElement('div'); blur.className = 'image-blur'; blur.style.backgroundImage = 'url("' + imgUrl + '")';
          const frame = document.createElement('div'); frame.className = 'image-frame';
          const img = document.createElement('img'); img.className = 'page-image'; img.src = imgUrl; img.draggable = false;
          frame.appendChild(img); si.appendChild(blur); si.appendChild(frame);
        }
        const st = document.createElement('div'); st.className = 'spread-text';
        const para = document.createElement('p'); para.textContent = pg.text || '';
        st.appendChild(para);
        sp.appendChild(si); sp.appendChild(st);
        return sp;
      };

      // Static VISUAL replica of the About/end spread (js/template .toolbox-spread),
      // used when the ⓘ button opens the cover STRAIGHT to the back of the book:
      // the swinging pages show the real About content (colophon | rating panel)
      // instead of page 1. It's inert (the overlay is pointer-events:none) and is
      // swapped for the live, interactive toolbox the instant the open completes,
      // so it only needs to LOOK right — the final frame must match the real spread.
      const buildToolboxSpread = () => {
        const s = story;
        const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const cImg = (s.cover && s.cover.image_id) ? this.getImageURL(s.cover.image_id) : '';
        const rating = s.rating || 0;
        const stars = [1, 2, 3, 4, 5].map((n) => '<button class="rating-star' + (rating >= n ? ' filled' : '') + '">★</button>').join('');
        const facts = [];
        if (this.storyGenreLabel) facts.push('<div><dt>Genre</dt><dd>' + esc(this.storyGenreLabel) + '</dd></div>');
        if (this.storyArtStyleLabel) facts.push('<div><dt>Artwork style</dt><dd>' + esc(this.storyArtStyleLabel) + '</dd></div>');
        if (this.storyLengthFull) facts.push('<div><dt>Length</dt><dd>' + esc(this.storyLengthFull) + '</dd></div>');
        const sv = (paths) => '<svg class="tb-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
        const ic = {
          read: sv('<path d="M3 2v6h6"/><path d="M3.51 9a9 9 0 1 0 2.13-3.36L3 8"/>'),
          quiz: sv('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
          share: sv('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
          cont: sv('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'),
          exp: sv('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
          close: sv('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
        };
        const sp = document.createElement('div');
        sp.className = 'book-page toolbox-spread' + (portrait ? ' portrait' : '');
        Object.assign(sp.style, { position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', margin: '0' });
        sp.innerHTML =
          '<div class="tb-info">' +
            '<div class="tb-head">' +
              (cImg ? '<div class="tb-thumb"><img src="' + esc(cImg) + '" alt="Cover"/></div>' : '') +
              '<div class="tb-headtext">' +
                '<h2 class="tb-title">' + esc(s.title) + '</h2>' +
                '<div class="tb-byline">' + esc(this.createdByLine) + '</div>' +
              '</div>' +
            '</div>' +
            (s.summary ? '<div class="tb-summary">"' + esc(s.summary) + '"</div>' : '') +
            '<dl class="tb-facts">' + facts.join('') + '</dl>' +
          '</div>' +
          '<div class="tb-panel">' +
            '<div class="tb-rate">' +
              '<div class="rating-label">How would you rate this story?</div>' +
              '<div class="rating-stars">' + stars + '</div>' +
            '</div>' +
            '<div class="tb-actions">' +
              '<button class="btn-secondary tb-full">' + ic.read + 'Read Again</button>' +
              (s.quiz ? '<button class="btn-secondary">' + ic.quiz + 'Quiz Me</button>' : '') +
              '<button class="btn-secondary" disabled>' + ic.share + 'Share</button>' +
              '<button class="btn-secondary" disabled>' + ic.cont + 'Continue</button>' +
              '<button class="btn-secondary" disabled>' + ic.exp + 'Export</button>' +
              '<button class="btn-secondary tb-full">' + ic.close + 'Close Book</button>' +
            '</div>' +
          '</div>';
        return sp;
      };
      // ⓘ open-to-back → reveal the About spread; normal open → reveal page 1.
      const toBack = this._openToBack;   // ⓘ open-to-back → reveal the About spread AND suppress the page-turn shadow on it
      const makeSpread = () => (toBack ? buildToolboxSpread() : buildSpread());

      // Build the closed-cover book FROM DATA (mirrors the template markup), so
      // the close animation works even when the live .cover-book isn't rendered.
      const buildCoverFace = () => {
        const cover = story.cover || {};
        const cImg = cover.image_status === 'ready' ? this.getImageURL(cover.image_id) : null;
        const cb = document.createElement('div'); cb.className = 'cover-book' + (portrait ? ' portrait' : '');
        const cf = document.createElement('div'); cf.className = 'cover-front';
        const art = document.createElement('div'); art.className = 'cover-art';
        if (cImg) { const blur = document.createElement('div'); blur.className = 'image-blur'; blur.style.backgroundImage = 'url("' + cImg + '")'; art.appendChild(blur); }
        const frame = document.createElement('div'); frame.className = 'image-frame';
        if (cImg) { const img = document.createElement('img'); img.className = 'page-image'; img.src = cImg; img.draggable = false; frame.appendChild(img); }
        art.appendChild(frame);
        const plate = document.createElement('div'); plate.className = 'cover-plate';
        const pt = document.createElement('span'); pt.className = 'cover-plate-text'; pt.textContent = story.title || '';
        plate.appendChild(pt);
        cf.appendChild(art); cf.appendChild(plate);
        cb.appendChild(cf);
        return cb;
      };

      // Gutter/crease shading on a half's CENTRE-facing edge. Present from the
      // moment the half is visible and tilts with it, so the crease never "pops"
      // in/out. The two halves together (~30px each) reproduce the real fixed
      // .book-crease (60px) for a seamless hand-off when the overlay is removed.
      const creaseStrip = (which) => {
        const s = document.createElement('div');
        Object.assign(s.style, { position: 'absolute', pointerEvents: 'none', zIndex: '6' });
        const STRIP = 30, dir = portrait ? 'to bottom' : 'to right';
        if (which === 'image') {   // inner edge = right (landscape) / bottom (portrait), dark TOWARD centre
          // Stops chosen so the two 30px halves reproduce the real .book-crease (60px)
          // EXACTLY (this half = its 0–50%), so the gutter line doesn't change width at
          // the hand-off from the overlay to the live crease when the turn settles.
          s.style.background = 'linear-gradient(' + dir + ', rgba(74,54,24,0) 0%, rgba(74,54,24,0.17) 60%, rgba(40,28,12,0.21) 90%, rgba(23,15,6,0.53) 100%)';
          if (portrait) Object.assign(s.style, { left: '0', right: '0', bottom: '0', height: STRIP + 'px' });
          else Object.assign(s.style, { top: '0', bottom: '0', right: '0', width: STRIP + 'px' });
        } else {                   // text half inner edge = left/top, dark AT centre fading out (= book-crease 50–100%)
          s.style.background = 'linear-gradient(' + dir + ', rgba(23,15,6,0.53) 0%, rgba(40,28,12,0.21) 10%, rgba(74,54,24,0.17) 40%, rgba(74,54,24,0) 100%)';
          if (portrait) Object.assign(s.style, { left: '0', right: '0', top: '0', height: STRIP + 'px' });
          else Object.assign(s.style, { top: '0', bottom: '0', left: '0', width: STRIP + 'px' });
        }
        return s;
      };

      sampleColor(this.getImageURL((story.cover || {}).image_id), 'cover');
      sampleColor(imgUrl, 'page');

      // Full-face dark overlay for the moving cast shadow. opacity driven live in
      // apply() (0 when off). Gradient goes to near-black so the intensity slider
      // has real range.
      const wrap = document.createElement('div');
      wrap.className = 'cover-open-temp';
      Object.assign(wrap.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: W + 'px', height: H + 'px', zIndex: '60', pointerEvents: 'none', overflow: 'hidden', perspective: PERSP + 'px' });
      const stage = document.createElement('div');
      Object.assign(stage.style, { position: 'absolute', inset: '0', background: dark });
      wrap.appendChild(stage);

      const textPage = document.createElement('div');
      Object.assign(textPage.style, { position: 'absolute', overflow: 'hidden', zIndex: '1' });
      if (portrait) Object.assign(textPage.style, { left: '0', top: center + 'px', width: W + 'px', height: half + 'px' });
      else Object.assign(textPage.style, { left: center + 'px', top: '0', width: half + 'px', height: H + 'px' });
      const tcs = makeSpread();
      Object.assign(tcs.style, { left: (portrait ? 0 : -center) + 'px', top: (portrait ? -center : 0) + 'px' });
      textPage.appendChild(tcs);
      textPage.appendChild(creaseStrip('text'));
      wrap.appendChild(textPage);

      const imageFace = document.createElement('div');
      Object.assign(imageFace.style, { position: 'absolute', overflow: 'hidden', zIndex: '2', backfaceVisibility: 'hidden', opacity: '0' });
      if (portrait) Object.assign(imageFace.style, { left: '0', top: '0', width: W + 'px', height: half + 'px', transformOrigin: '50% 100%' });
      else Object.assign(imageFace.style, { left: '0', top: '0', width: half + 'px', height: H + 'px', transformOrigin: '100% 50%' });
      imageFace.appendChild(makeSpread());
      imageFace.appendChild(creaseStrip('image'));
      wrap.appendChild(imageFace);

      const coverFace = document.createElement('div');
      Object.assign(coverFace.style, { position: 'absolute', zIndex: '3', backfaceVisibility: 'hidden' });
      if (portrait) Object.assign(coverFace.style, { left: '0', top: cClosed + 'px', width: W + 'px', height: half + 'px', transformOrigin: '50% 0%' });
      else Object.assign(coverFace.style, { left: cClosed + 'px', top: '0', width: half + 'px', height: H + 'px', transformOrigin: '0% 50%' });
      const cbc = buildCoverFace();
      // The overlay cover's big CSS drop-shadow (.cover-front) is faded out in
      // apply() as the cover lifts: at rest it matches the real cover (no pop at
      // hand-off), but mid-turn it's a black blob that isn't part of the edge-
      // shadow model and polluted the look around the edge line.
      const coverFrontEl = cbc.querySelector('.cover-front');
      Object.assign(cbc.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', margin: '0' });
      coverFace.appendChild(cbc);
      wrap.appendChild(coverFace);

      // single thickness bar = the book edge seen at the fore edge of the leaf.
      // Sits ABOVE everything; appearance is set live in apply() from coverDiag.
      const spineEdge = document.createElement('div');
      Object.assign(spineEdge.style, { position: 'absolute', zIndex: '7', pointerEvents: 'none', borderRadius: '1px' });
      if (portrait) Object.assign(spineEdge.style, { left: '0', width: '100%' });
      else Object.assign(spineEdge.style, { top: '0', height: '100%' });
      wrap.appendChild(spineEdge);

      // EDGE-FOLLOWING shadow + page-edge line — SAME model as interior turns.
      // Shadow trails the moving edge onto the page beneath (z8, on the exposed
      // side only); the thin dark line marks the edge (z9). Styled live in apply().
      const coverEdgeShadow = document.createElement('div');
      Object.assign(coverEdgeShadow.style, { position: 'absolute', zIndex: '8', pointerEvents: 'none', opacity: '0' });
      wrap.appendChild(coverEdgeShadow);
      const coverEdgeLine = document.createElement('div');
      Object.assign(coverEdgeLine.style, { position: 'absolute', zIndex: '9', pointerEvents: 'none', opacity: '0', background: 'rgba(110,110,110,0.55)' });
      wrap.appendChild(coverEdgeLine);

      document.body.appendChild(wrap);

      const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      const easeO = (t) => 1 - Math.pow(1 - t, 2);
      const apply = (p) => {
        p = Math.max(0, Math.min(1, p));
        const d = this.coverDiag;
        const DEG = Math.PI / 180;
        const s1 = Math.min(1, p / 0.5), e1 = easeIO(s1);
        const s2 = Math.max(0, (p - 0.5) / 0.5), e2 = easeO(s2);
        // cover: slide to centre + swing up/out; gone BY 90°
        coverFace.style.transform = portrait
          ? 'translateY(' + ((center - cClosed) * e1) + 'px) rotateX(' + (90 * e1) + 'deg)'
          : 'translateX(' + ((center - cClosed) * e1) + 'px) rotateY(' + (-90 * e1) + 'deg)';
        coverFace.style.opacity = p < 0.5 ? '1' : '0';   // fully opaque until 90° (no see-through), then gone
        // Fade the resting cover's ambient drop-shadow out over the lift: exact CSS
        // values at p=0 (seamless hand-off with the real cover), gone by 90° so the
        // only shadow near the moving edge is the shared PageShadow band.
        if (coverFrontEl) coverFrontEl.style.boxShadow = p <= 0.5
          ? '0 16px 38px rgba(0,0,0,' + (0.5 * (1 - e1)).toFixed(3) + '), 0 4px 10px rgba(0,0,0,' + (0.4 * (1 - e1)).toFixed(3) + ')'
          : 'none';
        // text slides into the bottom/right half
        const ts = -(center - cClosed) * (1 - e1);
        textPage.style.transform = portrait ? 'translateY(' + ts + 'px)' : 'translateX(' + ts + 'px)';
        // image lays from 90°→0° toward the viewer; appears only AFTER 90°
        const ang2 = 90 * (1 - e2);
        imageFace.style.transform = portrait ? 'rotateX(' + (-ang2) + 'deg)' : 'rotateY(' + ang2 + 'deg)';
        imageFace.style.opacity = p <= 0.5 ? '0' : '1';   // fully opaque the instant it passes 90° (no fade-in)
        // Near fully-closed, hide the underlying text page so its SHARP corners
        // don't peek past the cover's ROUNDED corners in the final moment of the
        // close (it's about to be fully covered anyway) — only the rounded cover
        // shows as the book finishes shutting. Invisible during open (the closed
        // cover already covers it below this threshold).
        textPage.style.opacity = p < 0.06 ? '0' : '1';
        // free (fore) edge of the visible leaf: cover's outer edge up to 90°, then
        // the image page's outer edge as it lays down. ang = the leaf's tilt angle.
        let edgePos, ang;
        if (p <= 0.5) {                          // cover phase: hinge slides in, edge swings from outer→centre
          const hinge = cClosed + (center - cClosed) * e1;
          ang = 90 * e1;
          edgePos = hinge + half * Math.cos(ang * DEG);
        } else {                                 // image phase: edge swings centre→far side as the page lays flat
          ang = ang2;
          edgePos = center - half * Math.cos(ang * DEG);
        }
        // The faces render through CSS perspective, which pushes the tilted edge
        // OUTWARD (toward the viewer) vs. a flat projection. Project edgePos the
        // same way so the bar sits exactly on the rendered edge (z = depth of the
        // free edge as it lifts; centre is the perspective origin on this axis).
        const z = half * Math.sin(ang * DEG);
        edgePos = center + (edgePos - center) * PERSP / (PERSP - z);
        // GEOMETRY: apparent edge thickness = true board thickness T · sin(tilt).
        // T = edgeBase, scaled by screen size (12px @ ~390px short side) so it stays
        // proportional on a big laptop window; live-tunable via coverDiag.
        const EDGE = (d.edgeBase || 12) * (minSide / (d.edgeRef || 390)) * (d.edgeScale || 1);
        const th = EDGE * Math.max(0, Math.sin(ang * DEG));
        const across = portrait ? 'to bottom' : 'to right';
        let bg;
        switch (d.edgeStyle) {
          case 'paper':     bg = 'repeating-linear-gradient(' + across + ', #fdfaf0 0px, #fdfaf0 1.4px, #d9cca7 1.4px, #d9cca7 2.8px)'; break;
          case 'cardboard': bg = 'linear-gradient(' + across + ', #5e421f, #c79a5d 50%, #5e421f)'; break;
          case 'darkcore':  bg = 'linear-gradient(' + across + ', #efe3c6, #2a1d0e 50%, #efe3c6)'; break;
          case 'bleed':     bg = 'linear-gradient(' + across + ', ' + (fxColors.cover || '#c8a86c') + ', #f3ead3 48%, ' + (fxColors.page || '#8a673a') + ')'; break;
          default:          bg = 'linear-gradient(' + across + ', #c8a86c, #f3ead3 45%, #8a673a)';
        }
        spineEdge.style.background = bg;
        const shadows = [];
        // subtle dark-brown outline (not pure black) where the band meets the faces
        if (d.outline) shadows.push(portrait ? 'inset 0 1px 0 rgba(40,28,14,0.42), inset 0 -1px 0 rgba(40,28,14,0.42)' : 'inset 1px 0 0 rgba(40,28,14,0.42), inset -1px 0 0 rgba(40,28,14,0.42)');
        // one-sided: the board-edge glow falls OUTWARD (below/right of the edge line)
        // only — an omnidirectional glow bloomed ABOVE the line onto the cover plate.
        if (d.shadow) {
          const outw = edgePos >= center ? 1 : -1;
          shadows.push((portrait ? '0 ' + (outw * 3) + 'px ' : (outw * 3) + 'px 0 ') + (4 + th * 0.5) + 'px rgba(0,0,0,0.5)');
        }
        spineEdge.style.boxShadow = shadows.join(', ');
        if (portrait) { spineEdge.style.height = th + 'px'; spineEdge.style.top = (edgePos - th / 2) + 'px'; }
        else { spineEdge.style.width = th + 'px'; spineEdge.style.left = (edgePos - th / 2) + 'px'; }
        spineEdge.style.opacity = th > 0.4 ? '1' : '0';

        // ==== EDGE-FOLLOWING shadow — SAME model as interior turns ==========
        // A thin page-edge line + a soft one-sided shadow trailing it onto the
        // page beneath. edgeAngle 0..180: cover swing = ang (0→90), image lay =
        // 180-ang (90→180). edgePos is the perspective-projected edge position.
        const PS = window.PageShadow, o = this._shadowOpts();
        const edgeAngle = p <= 0.5 ? ang : (180 - ang);
        // PHYSICS (final model — see CHANGELOG v0.9.67):
        // • Phase 1 (cover lifting, p<=0.5): the shadow peeks OUTWARD past the free
        //   edge onto the text page beneath. The text page's inner edge always meets
        //   the hinge (that's the binding), so the paper available past the edge is
        //   (hinge+half) − edgePos = (center+ts+half) − edgePos — ALGEBRAICALLY THE
        //   SAME strip an interior turn clamps to (|outerPos − pos|). Same formulas,
        //   same opts ⇒ the cover shadow matches an interior turn at the same tilt,
        //   by construction. Early in the open the cover still overhangs the text
        //   page, so there's genuinely almost no paper to catch it — that's real.
        //   (Trailing it toward the spine instead painted the band ON the dark cover
        //   face — near-invisible black-on-brown = the "weak" cover shadow.)
        // • Phase 2 (page-1 laying down, p>0.5): the leaf lays onto the EMPTY half —
        //   there is no page beneath to catch a shadow, so it casts NONE. (Drawing
        //   one toward the spine put a dark band ON the laying image page right
        //   before it settled — the late-turn artifact.)
        const outSign = edgePos >= center ? 1 : -1;      // outward, past the free edge
        let reach = 0, shOp = 0;
        if (p <= 0.5 && !toBack) {
          const textOuter = center + ts + half;          // text page's outer boundary (= hinge + half)
          reach = Math.max(0, Math.min(PS.shadowReachPx(edgeAngle, o, half), (textOuter - edgePos) * outSign));
          shOp = PS.shadowOpacity(edgeAngle, o);
        }
        const soft = PS.softPx(o);
        if (portrait) {
          coverEdgeShadow.style.left = '0'; coverEdgeShadow.style.width = W + 'px';
          coverEdgeShadow.style.top = (outSign > 0 ? edgePos : edgePos - reach) + 'px';
          coverEdgeShadow.style.height = reach + 'px';
        } else {
          coverEdgeShadow.style.top = '0'; coverEdgeShadow.style.height = H + 'px';
          coverEdgeShadow.style.left = (outSign > 0 ? edgePos : edgePos - reach) + 'px';
          coverEdgeShadow.style.width = reach + 'px';
        }
        coverEdgeShadow.style.background = PS.shadowGradient(
          portrait ? (outSign > 0 ? 'to bottom' : 'to top') : (outSign > 0 ? 'to right' : 'to left'), o);
        coverEdgeShadow.style.opacity = String(shOp);   // 0 in phase 2 and for the ⓘ→About open
        coverEdgeShadow.style.filter = soft ? 'blur(' + soft + 'px)' : '';
        // CLIP the shadow to the visible PAGE beneath (text half always; image half
        // once it lays) so it NEVER spills onto the dark/blue background. The shadow
        // now trails toward that page, so this only ever backstops the edges.
        {
          const wr = wrap.getBoundingClientRect();
          const rects = [textPage.getBoundingClientRect()];
          if (p > 0.5) rects.push(imageFace.getBoundingClientRect());
          let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
          rects.forEach(b => { L = Math.min(L, b.left); T = Math.min(T, b.top); R = Math.max(R, b.right); B = Math.max(B, b.bottom); });
          coverEdgeShadow.style.clipPath = 'inset(' + Math.max(0, T - wr.top) + 'px ' + Math.max(0, wr.right - R) + 'px ' + Math.max(0, wr.bottom - B) + 'px ' + Math.max(0, L - wr.left) + 'px)';
        }
        const lw = 1.6;
        if (portrait) { coverEdgeLine.style.left = '0'; coverEdgeLine.style.width = W + 'px'; coverEdgeLine.style.top = (edgePos - lw / 2) + 'px'; coverEdgeLine.style.height = lw + 'px'; }
        else { coverEdgeLine.style.top = '0'; coverEdgeLine.style.height = H + 'px'; coverEdgeLine.style.left = (edgePos - lw / 2) + 'px'; coverEdgeLine.style.width = lw + 'px'; }
        coverEdgeLine.style.opacity = String(toBack ? 0 : PS.lineOpacity(edgeAngle, o));
      };

      const fx = { p: 0, apply, raf: null, wrap, stage, setClosing: (v) => { closing = v; } };
      this._coverFx = fx;
      return fx;
    },
    coverOpenStart(autoPlay) {
      if (this._coverAnim || !this.isOnCover) return;
      const fx = this._coverFxBuild();
      if (!fx) { this.currentPageIndex = 1; this.pokeReaderUi(); return; }
      this._coverAnim = true;
      fx.p = 0; fx.apply(0);
      if (autoPlay) this._coverAnimateTo(1);
    },
    // The reverse: close the open book back to the cover (triggered).
    coverClose(autoPlay) {
      if (this._coverAnim || this.currentPageIndex !== 1) return;
      const fx = this._coverFxBuild();
      if (!fx) { this.currentPageIndex = 0; this.pokeReaderUi(); return; }
      this._coverAnim = true;
      fx.setClosing(true);
      fx.p = 1; fx.apply(1);   // start fully open (matches the real spread behind it)
      if (autoPlay !== false) this._coverAnimateTo(0);
    },
    // Animate the open controller from its current progress to target (1 = open,
    // 0 = closed), set the matching page index, then remove the overlay.
    _coverAnimateTo(target, onDone) {
      const fx = this._coverFx; if (!fx) return;
      const from = fx.p, t0 = performance.now();
      const dur = 820 * Math.max(0.18, Math.abs(target - from));
      const ce = (t) => 1 - Math.pow(1 - t, 3);
      const finish = () => {
        // Normally an open lands on page 1; the cover ⓘ opens straight to the back
        // (toolbox/end spread) instead.
        this.currentPageIndex = target >= 1 ? (this._openToBack ? (this.totalStoryPages + 1) : 1) : 0;
        this._openToBack = false;
        this._coverAnim = false; this._coverFx = null;
        this.$nextTick(() => {
          if (onDone) { onDone(fx.wrap); }   // hand off (e.g. close → shelf morph); onDone owns the overlay
          else { if (fx.wrap.parentNode) fx.wrap.remove(); this.pokeReaderUi(); }
        });
      };
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        fx.p = from + (target - from) * ce(k);
        fx.apply(fx.p);
        if (k < 1) { fx.raf = requestAnimationFrame(step); return; }
        finish();
      };
      fx.raf = requestAnimationFrame(step);
    },
    // Show the floating reader controls, then auto-fade after a few seconds.
    pokeReaderUi() {
      this.readerUiShow = true;
      clearTimeout(this._readerUiT);
      this._readerUiT = setTimeout(() => { this.readerUiShow = false; }, 3200);
    },
    // Read Again = play the book-CLOSE animation back to the (centred) cover and
    // stop there, ready to re-open — the same rest state as opening from the
    // library. (Like the back arrow, but it does NOT continue to the shelf.)
    readAgain() {
      if (this._coverAnim) return;
      window.scrollTo(0, 0);
      if (this.isOnCover) { this.pokeReaderUi(); return; }
      const fx = this._coverFxBuild();
      if (!fx) { this.coverShift = false; this.currentPageIndex = 0; this.pokeReaderUi(); return; }
      this._coverAnim = true;
      this.coverShift = false;      // land on the full centred cover, not the book-in-half pose
      fx.setClosing(true);
      fx.p = 1; fx.apply(1);
      this._coverAnimateTo(0);      // animate closed → currentPageIndex 0, overlay removed
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
    // ================= SHARE A STORY =================

    // Boot a public shared link: fetch the one story (password-free) and drop
    // straight into the reader with the shelf / about / toolbox all removed.
    async enterShareMode() {
      this.shareMode = true;
      this.showPasswordPrompt = false;
      this.shareLoadError = false;
      this.shareNetworkError = false;
      this.loading = true;                 // keeps the book-loader up if the splash auto-dismisses first
      this.loadingMessage = 'Opening story…';
      this.loadingHint = 'just a moment';
      try { document.body.classList.add('share-page'); } catch (e) {}
      const info = window.__SHARE__ || {};
      const api = info.api || getWorkerUrl();

      let res;
      try {
        res = await fetch(`${api}/share-data/${encodeURIComponent(info.token || '')}`);
      } catch (e) {
        // Couldn't even reach the server (flaky signal, offline) — offer a retry
        // rather than the misleading "story not found".
        console.warn('Share fetch failed (network):', e);
        this.loading = false; this.showSplash = false; this.shareNetworkError = true;
        return;
      }
      const data = await res.json().catch(() => null);
      if (res.status === 404 || (data && data.ok === false)) {
        this.loading = false; this.showSplash = false; this.shareLoadError = true;
        return;
      }
      if (!res.ok || !data || !data.story) {
        this.loading = false; this.showSplash = false; this.shareNetworkError = true;
        return;
      }

      // Pre-seed the reactive URL map with the Worker-signed image URLs so the
      // reader shows images directly — it never calls the password-gated signer.
      this.imageUrls = data.images || {};
      this.currentStory = data.story;
      this.currentStoryRecord = data.story;
      this.currentPageIndex = 0;
      document.title = (data.story.title ? data.story.title + ' — ' : '') + 'StoryTime';

      // The normal app pre-downloads every image before showing a book; share
      // mode must do the same or pages flash in black. Decode the cover + page 1
      // BEFORE revealing (so the first turn is clean), then warm the rest in the
      // background while the reader looks at the cover.
      const ids = [data.story.cover && data.story.cover.image_id,
                   ...((data.story.pages || []).map(p => p.image_id))].filter(Boolean);
      await this._preloadImages(ids.slice(0, 2), 4000);   // cover + first page (with a timeout so a slow net can't hang the loader)

      this.loading = false;
      this.view = 'story';
      this.showSplash = false;
      this.$nextTick(() => { window.scrollTo(0, 0); this.recomputeStoryFontSize(); });

      this._preloadImages(ids.slice(2)).catch(() => {});   // rest, in the background
    },
    // Retry after a network failure on a shared link.
    retryShare() {
      this.shareNetworkError = false;
      this.enterShareMode();
    },
    // Fetch + decode a set of images (by id, via the seeded signed URLs) so the
    // browser has them cached and decoded before the page is shown. Best-effort.
    _preloadImages(ids, timeoutMs) {
      const urls = (ids || []).map(id => this.imageUrls[id]).filter(Boolean);
      const loadOne = (u) => new Promise((resolve) => {
        const img = new Image();
        const done = () => resolve();
        img.onload = () => { if (img.decode) img.decode().then(done, done); else done(); };
        img.onerror = done;
        img.src = u;
      });
      const all = Promise.all(urls.map(loadOne));
      if (!timeoutMs) return all;
      return Promise.race([all, new Promise(r => setTimeout(r, timeoutMs))]);
    },

    // Build the stable, unguessable share URL for a story (client-side, no
    // network). token = HMAC(appPassword, storyId) — the exact value the Worker
    // re-derives to resolve the link. See worker.js share routes.
    async computeShareToken(storyId) {
      const pw = getStoredPassword() || this.password || '';
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(pw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(storyId));
      const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
      return hex.slice(0, 12);
    },
    shareSlug(title) {
      const s = (title || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
      return s || 'story';
    },
    async buildShareUrl(story) {
      const token = await this.computeShareToken(story.id);
      return `${getWorkerUrl()}/share/${this.shareSlug(story.title)}-${token}`;
    },

    // The "Share" button on the toolbox/back-of-book spread. Goes STRAIGHT to the
    // native OS share sheet (which already offers Messages/Mail/Copy/etc.) with
    // just the link — no in-app menu, no pre-written message. Title is passed as
    // metadata only (used as the subject line by Mail etc.), not as body text.
    async handleShareStory() {
      if (this._sharing || !this.currentStory) return;
      this._sharing = true;
      try {
        const url = await this.buildShareUrl(this.currentStory);
        const title = `${this.currentStory.title || 'A story'} — StoryTime`;
        if (navigator.share) {
          try { await navigator.share({ title, url }); }
          catch (e) { /* user cancelled the sheet — nothing to do */ }
        } else {
          // Desktop / no Web Share: copy the link and confirm briefly.
          try { await navigator.clipboard.writeText(url); this._flashShareCopied(); }
          catch (e) { window.prompt('Copy this link:', url); }
        }
      } catch (e) {
        console.warn('Could not build share link:', e);
        alert('Sorry — could not create a share link just now. Please try again.');
      } finally {
        this._sharing = false;
      }
    },
    _flashShareCopied() {
      this.shareCopied = true;
      clearTimeout(this._shareCopiedT);
      this._shareCopiedT = setTimeout(() => { this.shareCopied = false; }, 1800);
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
    toggleDiagMode() {
      this.diagMode = !this.diagMode;
      try { localStorage.setItem('storytime_diag_mode', this.diagMode ? '1' : '0'); } catch (e) {}
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
    goCreate(ev) {
      window.scrollTo(0, 0);
      const gsap = window.gsap;
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const bookEl = ev && ev.currentTarget;
      if (!gsap || !bookEl || reduce) { this.view = 'create'; return; }
      this._spellbookOpen(bookEl);
    },
    // Fly the tapped New Story book from its shelf slot up to centre (like a book
    // coming off the shelf to be read), swing its cover open in 3D over a parchment
    // spread, then cross-fade the flyer out as the create form appears beneath.
    _spellbookOpen(bookEl) {
      const gsap = window.gsap;
      const er = bookEl.getBoundingClientRect();
      document.querySelectorAll('.sb-fly-temp').forEach(el => el.remove());
      // navy backdrop that fades in as the book grows (mirror of the reading open)
      const dark = document.createElement('div'); dark.className = 'sb-fly-temp';
      Object.assign(dark.style, { position: 'fixed', inset: '0', background: 'var(--bg-deep, #1b1b3a)', zIndex: '2050', opacity: '0', pointerEvents: 'none' });
      document.body.appendChild(dark);
      // the flyer is a clone of the New Story book, pinned at its shelf rect
      const flyer = bookEl.cloneNode(true);
      flyer.classList.add('sb-fly-temp');
      flyer.classList.remove('create-book');   // drop the bob animation (it fights the GSAP transform)
      Object.assign(flyer.style, { position: 'fixed', left: er.left + 'px', top: er.top + 'px', width: er.width + 'px', height: er.height + 'px', margin: '0', zIndex: '2100', pointerEvents: 'none', transformOrigin: '0 0', perspective: '900px' });
      const cover = flyer.querySelector('.book-cover');
      if (cover) {
        const pages = document.createElement('div'); pages.className = 'sb-fly-pages';
        flyer.insertBefore(pages, flyer.firstChild);         // parchment revealed behind the cover
        cover.style.position = 'relative'; cover.style.zIndex = '2';
        cover.style.transformOrigin = 'left center'; cover.style.backfaceVisibility = 'hidden';
      }
      document.body.appendChild(flyer);
      const target = Math.min(window.innerWidth * 0.62, 300);
      const scale = target / er.width;
      const x = (window.innerWidth - er.width * scale) / 2 - er.left;
      const y = (window.innerHeight - er.height * scale) / 2 - er.top;
      const cleanup = () => document.querySelectorAll('.sb-fly-temp').forEach(el => el.remove());
      const tl = gsap.timeline({ onComplete: cleanup });
      tl.to(dark, { opacity: 1, duration: 0.42, ease: 'power1.out' }, 0);
      tl.to(flyer, { x, y, scale, duration: 0.5, ease: 'power2.inOut' }, 0);
      if (cover) tl.to(cover, { rotationY: -158, duration: 0.4, ease: 'power1.in', transformPerspective: 900 }, 0.52);
      tl.add(() => { this.view = 'create'; }, 0.78);          // mount the form behind the flyer
      tl.to([flyer, dark], { opacity: 0, duration: 0.36, ease: 'power1.out' }, 0.92);
      setTimeout(() => { if (this.view !== 'create') this.view = 'create'; cleanup(); }, 1700);   // backstop
    },

    // Reader back arrow: close the book with the same turn used for page 1 →
    // cover, but driven STRAIGHT from whatever page you're on to the cover (the
    // current page is the turning leaf), so you never flash past page 1. Then
    // fade across to the library, scrolled so this book sits as centred on the
    // shelf as the limits allow. Already on the cover → skip the close, just fade.
    closeBook() {
      if (this._coverAnim) return;
      // Invalidate any in-flight open (its deferred snapshot/flyer will now bail) and
      // clear stray overlays before we start closing.
      this._morphGen = (this._morphGen || 0) + 1;
      this._sweepMorphTemps();
      const story = this.currentStory;
      const targetId = story && story.id;
      if (this.isOnCover) { this._bookToShelf(targetId, { coverClose: true }); return; }   // already closed → straight to the shelf morph (navy fades out over the shelf)
      // Part 1: the SAME simultaneous close as a regular book-close (book slides +
      // cover swings shut together), built from data so it runs from any page.
      // Part 2 (unchanged): hand to _bookToShelf for the shrink-onto-shelf morph.
      const area = document.querySelector('.page-area');
      const pa = area ? area.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const fx = this._coverFxBuild();
      if (!fx) { this._exitToLibrary(targetId); return; }
      this._coverAnim = true;
      fx.setClosing(true);
      // Render the REAL library behind the fixed, self-contained close overlay so
      // the area outside the closing cover shows the shelf (toggle: transparent
      // stage = real shelf; off = the old dark background).
      const showShelf = !!this.coverDiag.closeShowShelf;
      this.view = 'library';
      this.currentPageIndex = 0;
      if (fx.stage) fx.stage.style.background = showShelf ? 'transparent' : 'var(--bg-deep, #1a1208)';
      // Scroll the shelf to the target slot NOW (while it's hidden behind the closing
      // overlay) so it's already in place — no "jump" when the book flies to it — AND
      // hide that slot immediately, so you never see the book sitting on the shelf
      // while the big book is still closing/centring (Part 2 re-hides + restores it).
      this.$nextTick(() => {
        this._scrollShelfTo(targetId);
        try {
          const sel = '[data-book-id="' + (window.CSS && CSS.escape ? CSS.escape(targetId) : targetId) + '"]';
          const slot = document.querySelector(sel);
          const bookEl = (slot && slot.querySelector('.book')) || slot;
          if (bookEl) bookEl.style.visibility = 'hidden';
        } catch (e) { /* ignore */ }
      });
      fx.p = 1; fx.apply(1);
      // When the cover finishes closing at centre, fly it straight to the shelf
      // slot (no pause/dark-melt) — the overlay's cover is the morph source.
      this._coverAnimateTo(0, (wrap) => this._bookToShelf(targetId, {
        srcCover: wrap && wrap.querySelector('.cover-book'), pa, skipTravel: true, cleanupEl: wrap,
      }));
    },

    // The "put the book back on the shelf" transition, IMAGE-ANCHORED so the
    // cover picture never translates between the two book formats. Two phases:
    //  A) the closed book travels from its book-in-half pose to screen centre
    //     while the dark stage melts away (so by centre you see the shelf);
    //  B) it flies into its (empty) slot. The flight is driven by the cover
    //     IMAGE rect (centre → the shelf cover square): both the big clone and
    //     the shelf clone are transformed each frame so their cover image lands
    //     exactly on that moving rect. The big format's overlaid title fades out
    //     and the shelf's cream plate fades in AROUND the fixed image, so the
    //     picture stays put and only the chrome changes. Hands off to the real
    //     shelf book on landing.
    _bookToShelf(targetId, opts) {
      opts = opts || {};
      const gen = this._morphGen;   // abandon if a newer morph starts before/while we fly
      const gsap = window.gsap;
      const area = document.querySelector('.page-area');
      // Source cover can be the live reading-view cover OR the close overlay's cover
      // (when called from the simultaneous-close path, where page-area is gone).
      const coverBook = opts.srcCover || (area && area.querySelector('.cover-book'));
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const cleanupEl = () => { if (opts.cleanupEl && opts.cleanupEl.parentNode) opts.cleanupEl.remove(); };
      if (!gsap || !coverBook || !targetId || reduce) { cleanupEl(); this.coverShift = false; this._exitToLibrary(targetId); return; }

      document.querySelectorAll('.book-fly-temp').forEach(el => el.remove());   // sweep strays

      const half = coverBook.getBoundingClientRect();                 // current pose (book-in-half, or centred)
      const skip = !!opts.skipTravel || !!opts.coverClose;            // book is already at centre (post-close / on the cover) → fly straight to slot
      const pa = area ? area.getBoundingClientRect() : (opts.pa || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
      const cen = skip ? { left: half.left, top: half.top, width: half.width, height: half.height }
                       : { left: pa.left + (pa.width - half.width) / 2, top: pa.top + (pa.height - half.height) / 2, width: half.width, height: half.height };

      const showShelf = !!this.coverDiag.closeShowShelf || skip;     // skip the dark melt → shelf visible immediately
      const dark = document.createElement('div');
      dark.className = 'book-fly-temp';
      Object.assign(dark.style, { position: 'fixed', inset: '0', background: 'var(--bg-deep, #1a1a2e)', zIndex: '2050', opacity: (showShelf && !opts.coverClose) ? '0' : '1', pointerEvents: 'none' });
      // big clone is pinned at the CENTRE box; phase A just translates it from the half pose
      const big = coverBook.cloneNode(true);
      big.classList.add('book-fly-temp');
      Object.assign(big.style, { position: 'fixed', left: cen.left + 'px', top: cen.top + 'px', width: cen.width + 'px', height: cen.height + 'px', margin: '0', zIndex: '2100', pointerEvents: 'none', transformOrigin: '0 0', transition: 'none' });
      big.style.transform = 'translate(' + (half.left - cen.left) + 'px,' + (half.top - cen.top) + 'px)';
      document.body.appendChild(dark);
      document.body.appendChild(big);
      cleanupEl();   // big is cloned — drop the close overlay so it doesn't double-show

      this.view = 'library';
      this.currentPageIndex = 0;
      this.coverShift = false;
      this.$nextTick(() => {
        if (gen !== this._morphGen) return;   // a newer morph took over
        const cleanup = () => { document.querySelectorAll('.book-fly-temp').forEach(el => el.remove()); };
        let slot = null;
        try {
          const sel = '[data-book-id="' + (window.CSS && CSS.escape ? CSS.escape(targetId) : targetId) + '"]';
          slot = document.querySelector(sel);
        } catch (e) { /* ignore */ }
        const bookEl = (slot && slot.querySelector('.book')) || slot;
        if (!bookEl) { gsap.to(dark, { opacity: 0, duration: 0.3, onComplete: cleanup }); return; }

        // Centre the target slot on screen before measuring it, so the book lands
        // where you can see it. skipTravel already scrolled the shelf pre-close;
        // coverClose (cover→shelf) did NOT, so it must scroll here too.
        if ((!skip || opts.coverClose) && bookEl.scrollIntoView) bookEl.scrollIntoView({ block: 'center', inline: 'nearest' });
        requestAnimationFrame(() => {
          if (gen !== this._morphGen) { cleanup(); return; }   // superseded → don't build the flyer
          const er = bookEl.getBoundingClientRect();                       // the shelf slot (whole book)
          const coverEl = bookEl.querySelector('.book-cover');
          const cr = coverEl ? coverEl.getBoundingClientRect()             // the shelf COVER square (= image)
                             : { left: er.left, top: er.top, width: er.width, height: er.width };
          bookEl.style.visibility = 'hidden';                              // leave the gap

          const shelf = document.createElement('div');
          shelf.className = 'book-fly-temp';
          Object.assign(shelf.style, { position: 'fixed', left: er.left + 'px', top: er.top + 'px', width: er.width + 'px', height: er.height + 'px', margin: '0', zIndex: '2099', pointerEvents: 'none', transformOrigin: '0 0', opacity: '0' });
          // The shelf-book sizes (--book-w, --plate-h) live on .shelf-grid; the
          // clone moves out to <body>, so without these the cloned plate has no
          // fixed height (collapses to one line) and the book "grows" on landing.
          // Copy them so the flying clone matches the real book exactly.
          const csBook = getComputedStyle(bookEl);
          shelf.style.setProperty('--book-w', csBook.getPropertyValue('--book-w'));
          shelf.style.setProperty('--plate-h', csBook.getPropertyValue('--plate-h'));
          const bookClone = bookEl.cloneNode(true);
          bookClone.style.visibility = 'visible';
          bookClone.style.margin = '0';
          shelf.appendChild(bookClone);
          document.body.appendChild(shelf);

          // Measure the CLONE's own cover rect (after it's in the DOM). The book
          // is tilted, so its rendered cover doesn't sit where the untransformed
          // box math would predict — using the real measured position is what
          // makes the clone land EXACTLY on the real book (no snap at the end).
          const ccEl = shelf.querySelector('.book-cover');
          const ccr = ccEl ? ccEl.getBoundingClientRect() : { left: er.left, top: er.top, width: er.width, height: er.width };

          // each clone's cover-image sub-rect within its own (untransformed) box
          const bigSub = { lx: 0, ly: 0, w: cen.width, h: cen.height };    // big image fills its box
          const shelfSub = { lx: ccr.left - er.left, ly: ccr.top - er.top, w: ccr.width, h: ccr.height };
          // transform a clone so its sub-rect maps onto target rect t (transform-origin 0 0)
          const mapSub = (el, home, sub, t) => {
            const sx = t.width / sub.w, sy = t.height / sub.h;
            const tx = t.left - home.left - sub.lx * sx, ty = t.top - home.top - sub.ly * sy;
            el.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + sx + ',' + sy + ')';
          };
          const lerp = (a, b, t) => a + (b - a) * t;
          const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

          const A = skip ? 0 : 0.34, B = 0.62, total = A + B, pA = A / total;   // skip the travel/melt when the close already centred the book
          // Always un-hide the real book (never leave a gap); only sweep temps if we
          // still own this morph (else a newer morph's elements would be nuked).
          const done = () => { bookEl.style.visibility = ''; if (gen !== this._morphGen) return; cleanup(); };
          setTimeout(done, total * 1000 + 800);   // backstop
          const st = { p: 0 };
          gsap.to(st, {
            p: 1, duration: total, ease: 'none', onComplete: done,
            onUpdate: () => {
              if (gen !== this._morphGen) return;   // superseded mid-flight
              const p = st.p;
              if (p <= pA) {
                // Phase A — travel to centre, dark melts (image rides with the big clone)
                const a = easeIO(p / pA);
                big.style.transform = 'translate(' + ((half.left - cen.left) * (1 - a)) + 'px,' + ((half.top - cen.top) * (1 - a)) + 'px)';
                dark.style.opacity = opts.coverClose ? '1' : (showShelf ? '0' : String(1 - p / pA));
              } else {
                // Phase B — image-anchored fly to the slot
                const b = (p - pA) / (1 - pA), eb = easeIO(b);
                // cover-close: navy fades OUT linearly over the shrink (the exact
                // reverse of the open); other closes have no navy here (shelf shown).
                dark.style.opacity = opts.coverClose ? String(1 - b) : '0';
                const fImg = { left: lerp(cen.left, cr.left, eb), top: lerp(cen.top, cr.top, eb), width: lerp(cen.width, cr.width, eb), height: lerp(cen.height, cr.height, eb) };
                mapSub(big, cen, bigSub, fImg);
                mapSub(shelf, er, shelfSub, fImg);
                const bf = Math.min(1, b / 0.5), sf = Math.min(1, b / 0.42);
                big.style.opacity = String(1 - bf);        // gone by half-way
                shelf.style.opacity = String(sf);          // in by ~42%
                // soft blur over the cross-fade to mask the format swap
                big.style.filter = 'blur(' + (bf * 2.5) + 'px)';
                shelf.style.filter = 'blur(' + ((1 - sf) * 2.5) + 'px)';
              }
            },
          });
        });
      });
    },
    _exitToLibrary(targetId) {
      this.view = 'library';
      this.currentPageIndex = 0;
      this.$nextTick(() => this._scrollShelfTo(targetId));
    },
    _scrollShelfTo(targetId) {
      if (!targetId) { window.scrollTo(0, 0); return; }
      let el = null;
      try {
        const sel = '[data-book-id="' + (window.CSS && CSS.escape ? CSS.escape(targetId) : targetId) + '"]';
        el = document.querySelector(sel);
      } catch (e) { /* ignore */ }
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' });
      else window.scrollTo(0, 0);
    },

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
        const r2 = (r.r2Count != null ? r.r2Count : r.count) || 0;
        this.cloudUsage = {
          count: r2, bytes: r.bytes || 0,
          r2Count: r2,
          sbCount: r.sbCount || 0,
          unmigrated: r.unmigrated || 0,
          loaded: true,
        };
      } catch (e) { console.warn('Usage fetch failed:', e); }
    },

    // ---- Library filter/sort helpers ----
    _distinct(field) {
      const set = new Set();
      this.libraryBooks.forEach(b => { if (b[field]) set.add(b[field]); });
      return [...set].sort();
    },
    _breakdownRows(counts, options) {
      const entries = Object.entries(counts || {});
      if (!entries.length) return [];
      const max = Math.max(...entries.map(([, n]) => n));
      return entries.map(([value, count]) => {
        const opt = (options || []).find(o => o.value === value);
        return { value, count, pct: Math.round((count / max) * 100), emoji: opt ? opt.emoji : '📖', label: opt ? opt.label : value };
      }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
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
    // Tapping the cover's ⓘ: open the book but land straight on the back
    // (toolbox/end spread) instead of page 1.
    openToBack() {
      if (this._coverAnim || !this.isOnCover) return;
      this._openToBack = true;
      this.coverOpen();
    },
    // Tap a shelf book → go straight into the reading view (cover), morphing the
    // book UP from its shelf slot to screen centre — the reverse of the close-to-
    // shelf animation. Loads the story quietly first (no full-screen spinner).
    // Wipe any leftover morph overlays and un-hide any book/cover that a previous
    // (possibly interrupted) morph left hidden — so a duplicate can never persist.
    _sweepMorphTemps() {
      document.querySelectorAll('.book-fly-temp').forEach(el => el.remove());
      document.querySelectorAll('.book, .cover-book, [data-book-id]').forEach(el => { if (el.style.visibility === 'hidden') el.style.visibility = ''; });
    },
    async openBookMorph(meta, ev) {
      if (this._coverAnim) return;
      // Each morph gets a generation number; deferred work (nextTick/rAF/tween) checks
      // it and bails if a newer morph has started, so a rapid open→close can't leave a
      // half-built shelf snapshot or a stray flyer behind (the "duplicate on the shelf").
      const gen = this._morphGen = (this._morphGen || 0) + 1;
      this._sweepMorphTemps();
      // Capture the shelf source NOW — clone the book + measure its rects while the
      // library is still on screen (we're about to switch views, which unmounts it).
      let src = null;
      const gsap = window.gsap;
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const bookEl = ev && ev.currentTarget;
      if (bookEl && gsap && !reduce) {
        const coverEl = bookEl.querySelector('.book-cover');
        const er = bookEl.getBoundingClientRect();
        const cr = coverEl ? coverEl.getBoundingClientRect() : { left: er.left, top: er.top, width: er.width, height: er.width };
        const cs = getComputedStyle(bookEl);
        // Snapshot the whole library view too, so the open can fade the navy IN over
        // the real bookshelf (the mirror of close fading navy OUT to reveal it) —
        // the live library unmounts the instant we switch to the reading view.
        const libEl = document.querySelector('.library-view');
        src = {
          er, cr, clone: bookEl.cloneNode(true), bookW: cs.getPropertyValue('--book-w'), plateH: cs.getPropertyValue('--plate-h'),
          bookId: meta.id,
          libClone: libEl ? libEl.cloneNode(true) : null,
          libRect: libEl ? libEl.getBoundingClientRect() : null,
        };
      }
      let story;
      try {
        story = getStoredStories().find(s => s.id === meta.id);
        if (!story) story = await fetchFullStory(meta.id);
        if (!story) throw new Error('Could not load this book.');
        await ensureStoryImagesLocal(story);
      } catch (e) { this.error = e.message || 'Could not open book.'; alert(this.error); return; }
      story.last_read_at = new Date().toISOString();
      try { saveStoryToStorage(story); } catch (e) { if (!e.isQuota) throw e; }
      syncStampLastRead(story).catch(() => {});
      const m = this.libraryBooks.find(b => b.id === meta.id); if (m) m.last_read_at = story.last_read_at;
      this.currentStory = story; this.currentStoryRecord = story;
      this.currentStoryCost = story.cost || 0;
      this.currentTextCost = story.text_cost || 0; this.currentImagesCost = story.images_cost || 0;
      this.currentPageIndex = 0;
      if (gen !== this._morphGen) return;   // superseded during the async load (e.g. tapped again / closed)
      this._shelfToBook(src, gen);
      this.evictOldCachedBooks();
    },
    // The reverse of _bookToShelf: fly the book from its shelf slot up to screen
    // centre, crossfading shelf format → square book, dark bg fading in, landing
    // on the (centred) reading cover. Image-anchored so the picture never jumps.
    // `src` (captured in openBookMorph, before the view switch) has the shelf
    // clone + rects; the shelf itself is already unmounted by now.
    _shelfToBook(src, gen) {
      if (gen == null) gen = this._morphGen;
      this.view = 'story'; this.currentPageIndex = 0; this.coverShift = false;
      const gsap = window.gsap;
      if (!gsap || !src) { this.$nextTick(() => this.pokeReaderUi()); return; }
      this.$nextTick(() => {
        if (gen !== this._morphGen) return;   // a newer morph took over
        const area = document.querySelector('.page-area');
        const coverBook = area && area.querySelector('.cover-book');
        if (!coverBook) { this.pokeReaderUi(); return; }
        coverBook.style.visibility = 'hidden';   // hide the live cover this frame (no pop)
        requestAnimationFrame(() => {
          if (gen !== this._morphGen) { coverBook.style.visibility = ''; return; }   // superseded → don't build the snapshot/flyer
          document.querySelectorAll('.book-fly-temp').forEach(el => el.remove());
          const cen = coverBook.getBoundingClientRect();               // destination (centred) cover box
          // Real-bookshelf backdrop that HIDES the (already-mounted) navy reading
          // view, so the navy fades IN over the actual shelf + books as the book
          // grows (the exact mirror of close). It's a snapshot of the library taken
          // on tap; brown fill behind it in case the snapshot is missing/partial.
          const shelfBg = document.createElement('div'); shelfBg.className = 'book-fly-temp';
          Object.assign(shelfBg.style, { position: 'fixed', inset: '0', background: '#8f6526', zIndex: '2040', overflow: 'hidden', pointerEvents: 'none' });
          if (src.libClone && src.libRect) {
            const lc = src.libClone; lc.style.margin = '0';
            Object.assign(lc.style, { position: 'absolute', left: src.libRect.left + 'px', top: src.libRect.top + 'px', width: src.libRect.width + 'px', height: src.libRect.height + 'px' });
            // hide the tapped book in the snapshot so it doesn't show under the flyer
            try { const sel = '[data-book-id="' + (window.CSS && CSS.escape ? CSS.escape(src.bookId) : src.bookId) + '"]'; const slot = lc.querySelector(sel); if (slot) slot.style.visibility = 'hidden'; } catch (e) { /* ignore */ }
            shelfBg.appendChild(lc);
          }
          document.body.appendChild(shelfBg);
          const dark = document.createElement('div'); dark.className = 'book-fly-temp';
          Object.assign(dark.style, { position: 'fixed', inset: '0', background: 'var(--bg-deep, #1a1a2e)', zIndex: '2050', opacity: '0', pointerEvents: 'none' });
          document.body.appendChild(dark);
          const big = coverBook.cloneNode(true); big.classList.add('book-fly-temp'); big.style.visibility = 'visible';
          Object.assign(big.style, { position: 'fixed', left: cen.left + 'px', top: cen.top + 'px', width: cen.width + 'px', height: cen.height + 'px', margin: '0', zIndex: '2100', pointerEvents: 'none', transformOrigin: '0 0', transition: 'none', opacity: '0' });
          document.body.appendChild(big);

          const er = src.er, cr = src.cr;
          const shelf = document.createElement('div'); shelf.className = 'book-fly-temp';
          Object.assign(shelf.style, { position: 'fixed', left: er.left + 'px', top: er.top + 'px', width: er.width + 'px', height: er.height + 'px', margin: '0', zIndex: '2099', pointerEvents: 'none', transformOrigin: '0 0', opacity: '1' });
          shelf.style.setProperty('--book-w', src.bookW); shelf.style.setProperty('--plate-h', src.plateH);
          const bookClone = src.clone; bookClone.style.visibility = 'visible'; bookClone.style.margin = '0'; shelf.appendChild(bookClone);
          document.body.appendChild(shelf);
          const ccEl = shelf.querySelector('.book-cover');
          const ccr = ccEl ? ccEl.getBoundingClientRect() : cr;

          const bigSub = { lx: 0, ly: 0, w: cen.width, h: cen.height };
          const shelfSub = { lx: ccr.left - er.left, ly: ccr.top - er.top, w: ccr.width, h: ccr.height };
          const mapSub = (el, home, sub, t) => { const sx = t.width / sub.w, sy = t.height / sub.h; el.style.transform = 'translate(' + (t.left - home.left - sub.lx * sx) + 'px,' + (t.top - home.top - sub.ly * sy) + 'px) scale(' + sx + ',' + sy + ')'; };
          const lerp = (a, b, t) => a + (b - a) * t;
          const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
          const cleanup = () => { document.querySelectorAll('.book-fly-temp').forEach(el => el.remove()); if (coverBook) coverBook.style.visibility = ''; };
          // If superseded, a newer morph already swept these temps — don't clean again
          // (that would nuke the newer morph's elements). Just stop.
          const done = () => { if (gen !== this._morphGen) return; cleanup(); this.pokeReaderUi(); };
          setTimeout(done, 1300);   // backstop
          const st = { p: 0 };
          gsap.to(st, { p: 1, duration: 0.62, ease: 'none', onComplete: done, onUpdate: () => {
            if (gen !== this._morphGen) return;   // superseded mid-flight
            const p = st.p, e = easeIO(p);
            dark.style.opacity = String(p);   // navy fades in linearly, full exactly as the book lands centred
            const fImg = { left: lerp(cr.left, cen.left, e), top: lerp(cr.top, cen.top, e), width: lerp(cr.width, cen.width, e), height: lerp(cr.height, cen.height, e) };
            mapSub(big, cen, bigSub, fImg);
            mapSub(shelf, er, shelfSub, fImg);
            const sf = Math.min(1, p / 0.55), bf = Math.min(1, Math.max(0, (p - 0.28) / 0.5));
            shelf.style.opacity = String(1 - sf); shelf.style.filter = 'blur(' + (sf * 2.5) + 'px)';
            big.style.opacity = String(bf); big.style.filter = 'blur(' + ((1 - bf) * 2.5) + 'px)';
          } });
        });
      });
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
      const id = meta.cover_image_id;
      // Prefer: local full blob (already cached → zero egress) → the small cloud
      // THUMBNAIL → the full cloud cover (old books with no thumbnail yet).
      return this.getImageURL(id) || this.coverUrls[id + '_t'] || this.coverUrls[id] || null;
    },
    // If a thumbnail URL 404s (edge case), fall back to the full cover once.
    onCoverImgError(e, meta) {
      const img = e && e.target;
      if (!img || img.dataset.coverFallback || !meta) return;
      img.dataset.coverFallback = '1';
      const full = this.getImageURL(meta.cover_image_id) || this.coverUrls[meta.cover_image_id] || '';
      if (full && img.getAttribute('src') !== full) img.src = full;
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
    // Tap-vs-scroll guard: a finger dragging across an option while scrolling must
    // NOT select it — only a deliberate tap does.
    quizTouchStart(e) { this._quizMoved = false; this._quizTouchY = (e.touches && e.touches[0]) ? e.touches[0].clientY : 0; },
    quizTouchMove(e) { if (e.touches && e.touches[0] && Math.abs(e.touches[0].clientY - (this._quizTouchY || 0)) > 8) this._quizMoved = true; },
    setQuizAnswer(qIdx, optIdx) {
      if (this._quizMoved) { this._quizMoved = false; return; }   // was a scroll, not a tap
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
