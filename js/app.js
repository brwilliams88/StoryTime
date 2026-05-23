// =============================================
// StoryTime — Vue App Entry Point
// =============================================
// Vue.js is a JavaScript framework that makes it easy to build
// interactive UIs. It "takes over" the #app element in index.html
// and lets us build the UI with reactive data — meaning when data
// changes, the screen updates automatically without page reloads.
// =============================================

const { createApp } = Vue

createApp({
  // "data" is where we store the app's state — things that can change
  // and that the UI should react to.
  data() {
    return {
      appName: 'StoryTime',
      version: 'v0.1'
    }
  },

  // "mounted" runs once when the app first loads.
  // Good place for startup tasks.
  mounted() {
    console.log(`${this.appName} ${this.version} loaded ✓`)
  }

}).mount('#app')  // This connects the Vue app to the <div id="app"> in index.html
