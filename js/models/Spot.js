/**
 * Spot Class
 * Represents a single marked location
 */

import { Log } from './Log.js';

export class Spot extends Log {
  type = 'spot';

  #title;
  #description;

  /**
   * @param {[number, number]} coords - Single [lat, lng] point
   * @param {string} title - Spot title
   * @param {string} description - Optional description
   */
  constructor(coords, title = 'Untitled Spot', description = '') {
    super(coords);
    this.#title = title;
    this.#description = description;
  }

  // Getters
  get title() {
    return this.#title;
  }

  get description() {
    return this.#description;
  }

  /**
   * Serializes to JSON
   */
  toJSON() {
    return {
      ...super.toJSON(),
      type: this.type,
      title: this.#title,
      description: this.#description,
    };
  }

  /**
   * Creates Spot instance from JSON
   */
  static fromJSON(data) {
    const spot = new Spot(data.coords, data.title, data.description);
    spot._restoreFromJSON(data);
    return spot;
  }
}
