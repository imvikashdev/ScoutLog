/**
 * Log Base Class
 * Parent class for Route and Spot
 */

export class Log {
  #date;
  #id;
  #coords;

  /**
   * @param {Array} coords - Coordinates (single [lat,lng] or array of points)
   */
  constructor(coords) {
    this.#date = new Date();
    this.#id = (Date.now() + '').slice(-10);
    this.#coords = coords;
  }

  // Getters
  get date() {
    return this.#date;
  }

  get id() {
    return this.#id;
  }

  get coords() {
    return this.#coords;
  }

  /**
   * Formats date for display
   */
  get formattedDate() {
    return this.#date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Formats time for display
   */
  get formattedTime() {
    return this.#date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Serializes to JSON for LocalStorage
   */
  toJSON() {
    return {
      id: this.#id,
      date: this.#date.toISOString(),
      coords: this.#coords,
    };
  }

  /**
   * Restores from JSON data
   */
  _restoreFromJSON(data) {
    this.#id = data.id;
    this.#date = new Date(data.date);
    this.#coords = data.coords;
  }
}
