/** EVENT-BUS.JS | Purpose: * A lightweight pub/sub system to decouple modules. */

class EventBus {
  constructor() {
    this.listeners = {};
    this.debug = false;
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name (e.g., 'file:open')
   * @param {function} handler - Function to call when event is emitted
   */
  on(event, handler) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
    if (this.debug) {
        console.log(`[EventBus] Subscriber added for ${event}. Total: ${this.listeners[event].length}`, handler.toString().substring(0, 100));
    }
    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {function} handler - Original handler function
   */
  off(event, handler) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(h => h !== handler);
  }

  /**
   * Emit an event to all subscribers
   * @param {string} event - Event name
   * @param {any} data - Data to pass to handlers
   * @returns {Array} - Results from all handlers
   */
  emit(event, data) {
    if (this.debug) {
      console.log(`[EventBus] emit: ${event}`, data, `(subscribers: ${this.listeners[event]?.length || 0})`);
    }
    
    if (!this.listeners[event]) return [];
    
    // Use a copy of the array to allow handlers to unsubscribe during emission
    const handlers = [...this.listeners[event]];
    return handlers.map(handler => {
      try {
        const result = handler(data);
        if (this.debug && result instanceof Promise) {
            console.log(`   -> handler for ${event} returned a Promise`);
        }
        return result;
      } catch (error) {
        console.error(`[EventBus] Error in handler for ${event}:`, error);
        return null;
      }
    });
  }

  /**
   * Toggle debug logging
   * @param {boolean} enabled 
   */
  setDebug(enabled) {
    this.debug = !!enabled;
  }
}

export const eventBus = new EventBus();
