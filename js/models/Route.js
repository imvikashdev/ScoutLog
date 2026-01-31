/**
 * Route Class
 * Represents a drawn route with multiple points
 */

import { Log } from './Log.js';

export class Route extends Log {
  type = 'route';

  #title;
  #distance; // Auto-calculated in km
  #duration; // User input in minutes
  #pace; // Calculated min/km
  #notes;

  /**
   * @param {Array<[number, number]>} coordsArray - Array of [lat, lng] points
   * @param {number} distance - Pre-calculated distance in km
   * @param {string} title - Route title
   * @param {number} duration - Duration in minutes
   * @param {string} notes - Optional notes
   */
  constructor(
    coordsArray,
    distance,
    title = 'Untitled Route',
    duration = 0,
    notes = '',
  ) {
    super(coordsArray);
    this.#title = title;
    this.#distance = distance;
    this.#duration = duration;
    this.#pace = this.#calcPace();
    this.#notes = notes;
  }

  /**
   * Calculates pace (min/km)
   */
  #calcPace() {
    if (this.#distance === 0 || this.#duration === 0) return 0;
    return this.#duration / this.#distance;
  }

  // Getters
  get title() {
    return this.#title;
  }

  get distance() {
    return this.#distance;
  }

  get duration() {
    return this.#duration;
  }

  get pace() {
    return this.#pace;
  }

  get notes() {
    return this.#notes;
  }

  /**
   * Formatted distance string
   */
  get formattedDistance() {
    return `${this.#distance.toFixed(2)} km`;
  }

  /**
   * Formatted pace string
   */
  get formattedPace() {
    if (this.#pace === 0) return '--';
    return `${this.#pace.toFixed(1)} min/km`;
  }

  /**
   * Serializes to JSON
   */
  toJSON() {
    return {
      ...super.toJSON(),
      type: this.type,
      title: this.#title,
      distance: this.#distance,
      duration: this.#duration,
      notes: this.#notes,
    };
  }

  /**
   * Creates Route instance from JSON
   */
  static fromJSON(data) {
    const route = new Route(
      data.coords,
      data.distance,
      data.title,
      data.duration,
      data.notes,
    );
    route._restoreFromJSON(data);
    return route;
  }
}
