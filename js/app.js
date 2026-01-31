/**
 * ScoutLog App - Route Planner Edition
 * Vector Drawing Engine with Haversine Distance Calculation
 */

import { Route } from './models/Route.js';
import { Spot } from './models/Spot.js';

class App {
  // Map state
  #map;
  #mapZoomLevel = 14;

  // Mode state
  #mode = 'none'; // 'none' | 'route' | 'spot'
  #isDrawing = false;

  // Drawing state
  #routePoints = [];
  #currentPolyline = null;
  #vertexMarkers = [];
  #currentDistance = 0;

  // Data
  #logs = [];
  #drawnLayers = new Map(); // log.id -> Leaflet layer
  #activeAnimations = new Map(); // log.id -> animation frame ID
  #animationLayers = new Map(); // log.id -> animation overlay layer
  #selectedRouteId = null; // Currently selected/clicked route

  // DOM elements
  #drawRouteBtn;
  #markSpotBtn;
  #routePanel;
  #distanceDisplay;
  #distanceTooltip;
  #logListItems;
  #logCount;
  #emptyState;
  #form;
  #formTypeBadge;
  #logList;
  #logListHeader;

  // Form fields
  #titleInput;
  #distanceInput;
  #durationInput;
  #paceOutput;
  #notesInput;
  #distanceField;
  #durationField;
  #paceField;

  // Delete dialog
  #deleteDialog;
  #deleteMessage;
  #deleteCancelBtn;
  #deleteConfirmBtn;
  #pendingDeleteId = null;

  // Location overlay
  #locationOverlay;
  #requestLocationBtn;
  #useDefaultBtn;

  constructor() {
    this.#cacheDOM();
    this.#getPosition();
    this.#loadFromLocalStorage();
    this.#bindEvents();
    this.#updateLogCount();
  }

  /**
   * Cache DOM elements
   */
  #cacheDOM() {
    this.#drawRouteBtn = document.getElementById('draw-route-btn');
    this.#markSpotBtn = document.getElementById('mark-spot-btn');
    this.#routePanel = document.getElementById('route-panel');
    this.#distanceDisplay = document.getElementById('current-distance');
    this.#distanceTooltip = document.getElementById('distance-tooltip');
    this.#logListItems = document.getElementById('log-list-items');
    this.#logCount = document.getElementById('log-count');
    this.#emptyState = document.getElementById('empty-state');
    this.#form = document.getElementById('log-form');
    this.#formTypeBadge = document.getElementById('form-type-badge');

    this.#titleInput = document.getElementById('log-title');
    this.#distanceInput = document.getElementById('log-distance');
    this.#durationInput = document.getElementById('log-duration');
    this.#paceOutput = document.getElementById('pace-output');
    this.#notesInput = document.getElementById('log-notes');
    this.#distanceField = document.getElementById('distance-field');
    this.#durationField = document.getElementById('duration-field');
    this.#paceField = document.getElementById('pace-field');

    // Delete dialog
    this.#deleteDialog = document.getElementById('delete-dialog');
    this.#deleteMessage = document.getElementById('delete-message');
    this.#deleteCancelBtn = document.getElementById('delete-cancel-btn');
    this.#deleteConfirmBtn = document.getElementById('delete-confirm-btn');

    // Location overlay
    this.#locationOverlay = document.getElementById('location-overlay');
    this.#requestLocationBtn = document.getElementById('request-location-btn');
    this.#useDefaultBtn = document.getElementById('use-default-btn');

    // Simple selectors for log list
    this.#logList = document.querySelector('.log-list');
    this.#logListHeader = document.querySelector('.log-list__header');
  }

  /**
   * Get user position via Geolocation API
   */
  #getPosition() {
    if (!navigator.geolocation) {
      this.#showLocationOverlay();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => this.#loadMap([pos.coords.latitude, pos.coords.longitude]),
      () => this.#showLocationOverlay(),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  /**
   * Show location permission overlay
   */
  #showLocationOverlay() {
    this.#locationOverlay.classList.add('location-overlay--visible');
    this.#bindLocationOverlayEvents();
  }

  /**
   * Hide location overlay
   */
  #hideLocationOverlay() {
    this.#locationOverlay.classList.remove('location-overlay--visible');
  }

  /**
   * Bind location overlay button events
   */
  #bindLocationOverlayEvents() {
    this.#requestLocationBtn.addEventListener('click', () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.#hideLocationOverlay();
          this.#loadMap([pos.coords.latitude, pos.coords.longitude]);
        },
        () => {
          // If denied, just use default location
          this.#hideLocationOverlay();
          this.#loadMap([28.6139, 77.209]);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });

    this.#useDefaultBtn.addEventListener('click', () => {
      this.#hideLocationOverlay();
      this.#loadMap([28.6139, 77.209]);
    });
  }

  /**
   * Initialize Leaflet map with CartoDB Positron tiles
   */
  #loadMap(coords) {
    this.#map = L.map('map', {
      center: coords,
      zoom: this.#mapZoomLevel,
      zoomControl: true,
      zoomControlPos: 'topright',
    });

    // Move zoom control to bottom right if needed, but keeping default for now
    // Actually Leaflet defaults to top-left. Let's force it to bottom-right or keep it.
    // User didn't ask for zoom control move.

    // CartoDB Positron (Black & White desaturated)
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      },
    ).addTo(this.#map);

    // User location marker
    L.circleMarker(coords, {
      radius: 8,
      fillColor: '#0f172a',
      fillOpacity: 0.8,
      color: '#ffffff',
      weight: 2,
    }).addTo(this.#map);

    // Map event listeners
    this.#map.on('click', this.#handleMapClick.bind(this));
    this.#map.on('dblclick', this.#handleDoubleClick.bind(this));
    this.#map.on('mousemove', this.#handleMouseMove.bind(this));

    // Click on map to deselect route
    this.#map.getContainer().addEventListener('click', (e) => {
      // Only if clicking directly on map (not on a control or marker)
      if (
        e.target.classList.contains('leaflet-container') ||
        e.target.closest('.leaflet-pane')
      ) {
        this.#deselectRoute();
      }
    });

    // Render existing logs
    this.#logs.forEach((log) => {
      this.#renderLogOnMap(log);
      this.#renderLogCard(log);
    });

    this.#updateEmptyState();
  }

  /**
   * Bind event listeners
   */
  #bindEvents() {
    // Mode buttons
    this.#drawRouteBtn.addEventListener('click', () => this.#setMode('route'));
    this.#markSpotBtn.addEventListener('click', () => this.#setMode('spot'));

    // Keyboard shortcuts
    document.addEventListener('keydown', this.#handleKeydown.bind(this));

    // Form events
    document
      .getElementById('log-entry-form')
      .addEventListener('submit', this.#handleFormSubmit.bind(this));
    document
      .getElementById('form-close-btn')
      .addEventListener('click', () => this.#closeForm());
    document
      .getElementById('form-cancel-btn')
      .addEventListener('click', () => this.#closeForm());

    // Toggle log list bottom sheet on mobile (Click)
    this.#logListHeader.addEventListener('click', () => {
      this.#logList.classList.toggle('is-expanded');
    });

    // Swipe gestures for bottom sheet
    let startY = 0;
    this.#logListHeader.addEventListener(
      'touchstart',
      (e) => {
        startY = e.touches[0].clientY;
      },
      { passive: true },
    );

    this.#logListHeader.addEventListener(
      'touchend',
      (e) => {
        const endY = e.changedTouches[0].clientY;
        const diff = startY - endY;

        // If swipe is significant (more than 30px)
        if (Math.abs(diff) > 30) {
          if (diff > 0) {
            // Swipe Up -> Expand
            this.#logList.classList.add('is-expanded');
          } else {
            // Swipe Down -> Collapse
            this.#logList.classList.remove('is-expanded');
          }
        }
      },
      { passive: true },
    );

    // Pace calculation
    this.#durationInput.addEventListener('input', this.#updatePace.bind(this));

    // Log list delegation
    this.#logListItems.addEventListener(
      'click',
      this.#handleLogClick.bind(this),
    );
    this.#logListItems.addEventListener(
      'mouseenter',
      this.#handleLogHover.bind(this),
      true,
    );
    this.#logListItems.addEventListener(
      'mouseleave',
      this.#handleLogLeave.bind(this),
      true,
    );

    // Delete dialog
    this.#deleteConfirmBtn.addEventListener('click', () =>
      this.#confirmDelete(),
    );
    this.#deleteCancelBtn.addEventListener('click', () => this.#cancelDelete());
  }

  /**
   * Set drawing mode
   */
  #setMode(mode) {
    if (this.#mode === mode) {
      // Toggle off
      this.#mode = 'none';
      this.#isDrawing = false;
      this.#clearDrawingState();
    } else {
      this.#mode = mode;
      this.#isDrawing = true;
    }

    this.#updateModeUI();
  }

  /**
   * Update UI based on current mode
   */
  #updateModeUI() {
    const mapEl = document.getElementById('map');

    // Reset buttons
    this.#drawRouteBtn.classList.remove('control-dock__btn--active');
    this.#markSpotBtn.classList.remove('control-dock__btn--active');
    this.#drawRouteBtn.setAttribute('aria-pressed', 'false');
    this.#markSpotBtn.setAttribute('aria-pressed', 'false');

    // Reset cursor
    mapEl.classList.remove('map--drawing');

    if (this.#mode === 'route') {
      this.#drawRouteBtn.classList.add('control-dock__btn--active');
      this.#drawRouteBtn.setAttribute('aria-pressed', 'true');
      mapEl.classList.add('map--drawing');
    } else if (this.#mode === 'spot') {
      this.#markSpotBtn.classList.add('control-dock__btn--active');
      this.#markSpotBtn.setAttribute('aria-pressed', 'true');
      mapEl.classList.add('map--drawing');
    }

    // Show/hide route panel
    this.#routePanel.classList.toggle(
      'route-panel--visible',
      this.#mode === 'route' && this.#routePoints.length > 0,
    );
  }

  /**
   * Handle map click
   */
  #handleMapClick(e) {
    if (!this.#isDrawing) return;

    const { lat, lng } = e.latlng;
    const point = [lat, lng];

    if (this.#mode === 'route') {
      // Check for loop closing - if clicking near start point
      if (this.#routePoints.length >= 2) {
        const startPoint = this.#routePoints[0];
        const distanceToStart = this.#haversineDistance(point, startPoint);

        // If within 50 meters of start, close the loop
        if (distanceToStart < 0.05) {
          // 0.05 km = 50 meters
          this.#closeLoop();
          return;
        }
      }

      this.#addRoutePoint(point);
    } else if (this.#mode === 'spot') {
      this.#addSpot(point);
    }
  }

  /**
   * Close the route as a loop
   */
  #closeLoop() {
    // Add the starting point again to close the loop
    const startPoint = [...this.#routePoints[0]];
    this.#routePoints.push(startPoint);

    // Update polyline
    this.#currentPolyline.setLatLngs(this.#routePoints);

    // Recalculate distance
    this.#currentDistance = this.#calculateTotalDistance(this.#routePoints);
    this.#updateDistanceDisplay();

    // Finish the route
    this.#finishRoute();
  }

  /**
   * Handle double click to finish route
   */
  #handleDoubleClick(e) {
    if (this.#mode === 'route' && this.#routePoints.length >= 2) {
      L.DomEvent.stopPropagation(e);
      this.#finishRoute();
    }
  }

  /**
   * Handle keyboard events
   */
  #handleKeydown(e) {
    if (
      e.key === 'Enter' &&
      this.#mode === 'route' &&
      this.#routePoints.length >= 2
    ) {
      this.#finishRoute();
    }

    if (e.key === 'Escape') {
      if (this.#form.open) {
        this.#closeForm();
      } else if (this.#isDrawing) {
        this.#cancelDrawing();
      }
    }
  }

  /**
   * Handle mouse move for distance tooltip
   */
  #handleMouseMove(e) {
    if (this.#mode !== 'route' || this.#routePoints.length === 0) {
      this.#distanceTooltip.classList.remove('distance-tooltip--visible');
      return;
    }

    // Calculate distance to potential next point
    const lastPoint = this.#routePoints[this.#routePoints.length - 1];
    const potentialDistance = this.#haversineDistance(lastPoint, [
      e.latlng.lat,
      e.latlng.lng,
    ]);
    const totalDistance = this.#currentDistance + potentialDistance;

    // Position tooltip
    this.#distanceTooltip.style.left = `${e.containerPoint.x + 15}px`;
    this.#distanceTooltip.style.top = `${e.containerPoint.y - 10}px`;
    this.#distanceTooltip.textContent = `${totalDistance.toFixed(2)} km`;
    this.#distanceTooltip.classList.add('distance-tooltip--visible');
  }

  /**
   * Add a point to the current route
   */
  #addRoutePoint(point) {
    this.#routePoints.push(point);

    // Add vertex marker
    const marker = L.circleMarker(point, {
      radius: 5,
      fillColor: '#000000',
      fillOpacity: 1,
      color: '#ffffff',
      weight: 2,
    }).addTo(this.#map);
    this.#vertexMarkers.push(marker);

    // Update or create polyline
    if (this.#routePoints.length >= 2) {
      if (this.#currentPolyline) {
        this.#currentPolyline.setLatLngs(this.#routePoints);
      } else {
        this.#currentPolyline = L.polyline(this.#routePoints, {
          color: '#000000',
          weight: 3,
          dashArray: '8, 8',
        }).addTo(this.#map);
      }

      // Calculate distance
      this.#currentDistance = this.#calculateTotalDistance(this.#routePoints);
    }

    this.#updateDistanceDisplay();
    this.#updateModeUI();
  }

  /**
   * Add a spot marker
   */
  #addSpot(point) {
    // Immediately open form for spot
    this.#mode = 'none';
    this.#isDrawing = false;
    this.#updateModeUI();

    // Store point temporarily
    this.#routePoints = [point];
    this.#openForm('spot');
  }

  /**
   * Finish drawing the route
   */
  #finishRoute() {
    if (this.#routePoints.length < 2) return;

    // Disable drawing mode
    this.#isDrawing = false;
    this.#mode = 'none';
    this.#updateModeUI();

    // Open the form
    this.#openForm('route');
  }

  /**
   * Cancel current drawing
   */
  #cancelDrawing() {
    this.#clearDrawingState();
    this.#mode = 'none';
    this.#isDrawing = false;
    this.#updateModeUI();
  }

  /**
   * Clear drawing state
   */
  #clearDrawingState() {
    // Remove temporary polyline
    if (this.#currentPolyline) {
      this.#map.removeLayer(this.#currentPolyline);
      this.#currentPolyline = null;
    }

    // Remove vertex markers
    this.#vertexMarkers.forEach((m) => this.#map.removeLayer(m));
    this.#vertexMarkers = [];

    // Reset state
    this.#routePoints = [];
    this.#currentDistance = 0;
    this.#distanceTooltip.classList.remove('distance-tooltip--visible');
    this.#updateDistanceDisplay();
  }

  /**
   * Update distance display
   */
  #updateDistanceDisplay() {
    this.#distanceDisplay.textContent = this.#currentDistance.toFixed(2);
  }

  /**
   * Calculate total distance of route using Haversine formula
   */
  #calculateTotalDistance(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += this.#haversineDistance(points[i - 1], points[i]);
    }
    return total;
  }

  /**
   * Haversine formula for distance between two coordinates
   * @returns {number} Distance in kilometers
   */
  #haversineDistance(coord1, coord2) {
    const R = 6371; // Earth's radius in km
    const dLat = ((coord2[0] - coord1[0]) * Math.PI) / 180;
    const dLon = ((coord2[1] - coord1[1]) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((coord1[0] * Math.PI) / 180) *
        Math.cos((coord2[0] * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Open log form
   */
  #openForm(type) {
    // Update form for type
    const isRoute = type === 'route';

    this.#formTypeBadge.innerHTML = isRoute
      ? '<i class="ph ph-path" aria-hidden="true"></i><span>Route</span>'
      : '<i class="ph ph-map-pin" aria-hidden="true"></i><span>Spot</span>';

    // Show/hide route-specific fields
    this.#distanceField.style.display = isRoute ? 'block' : 'none';
    this.#durationField.style.display = isRoute ? 'block' : 'none';
    this.#paceField.style.display = isRoute ? 'block' : 'none';

    if (isRoute) {
      this.#distanceInput.value = this.#currentDistance.toFixed(2);
    }

    // Reset form
    this.#titleInput.value = '';
    this.#durationInput.value = '';
    this.#notesInput.value = '';
    this.#paceOutput.textContent = '-- min/km';

    this.#form.showModal();

    setTimeout(() => this.#titleInput.focus(), 100);
  }

  /**
   * Close form and cleanup
   */
  #closeForm() {
    this.#form.close();
    this.#clearDrawingState();
  }

  /**
   * Update pace calculation
   */
  #updatePace() {
    const duration = parseFloat(this.#durationInput.value) || 0;
    const distance = this.#currentDistance;

    if (duration > 0 && distance > 0) {
      const pace = duration / distance;
      this.#paceOutput.textContent = `${pace.toFixed(1)} min/km`;
    } else {
      this.#paceOutput.textContent = '-- min/km';
    }
  }

  /**
   * Handle form submission
   */
  #handleFormSubmit(e) {
    e.preventDefault();

    const title = this.#titleInput.value.trim() || 'Untitled';
    const notes = this.#notesInput.value.trim();

    let log;

    if (this.#distanceField.style.display !== 'none') {
      // Route
      const duration = parseInt(this.#durationInput.value) || 0;
      log = new Route(
        [...this.#routePoints],
        this.#currentDistance,
        title,
        duration,
        notes,
      );
    } else {
      // Spot
      log = new Spot(this.#routePoints[0], title, notes);
    }

    // Add to logs
    this.#logs.push(log);

    // Render on map
    this.#renderLogOnMap(log);
    this.#renderLogCard(log);

    // Save to LocalStorage
    this.#saveToLocalStorage();

    // Update UI
    this.#updateLogCount();
    this.#updateEmptyState();

    // Close form
    this.#closeForm();

    // Pan to log
    if (log.type === 'route') {
      this.#map.fitBounds(L.latLngBounds(log.coords));
    } else {
      this.#map.panTo(log.coords);
    }
  }

  /**
   * Render log on map
   */
  #renderLogOnMap(log) {
    let layer;

    if (log.type === 'route') {
      // Create polyline for route - default dark gray
      layer = L.polyline(log.coords, {
        color: '#9ca3af',
        weight: 3,
        opacity: 0.6,
      }).addTo(this.#map);

      // Add start/end markers
      const startIcon = L.divIcon({
        html: '<div style="width:12px;height:12px;background:#000;border:2px solid #fff;border-radius:50%;"></div>',
        className: 'route-marker',
        iconSize: [12, 12],
      });

      L.marker(log.coords[0], { icon: startIcon }).addTo(this.#map);
      L.marker(log.coords[log.coords.length - 1], { icon: startIcon }).addTo(
        this.#map,
      );
    } else {
      // Create marker for spot
      const spotIcon = L.divIcon({
        html: '<i class="ph ph-map-pin" style="font-size:24px;color:#0f172a;"></i>',
        className: 'spot-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 24],
      });

      layer = L.marker(log.coords, { icon: spotIcon }).addTo(this.#map);
    }

    // Bind popup
    layer.bindPopup(`
      <div style="font-family: var(--font-primary);">
        <strong>${log.title}</strong>
        ${log.type === 'route' ? `<br><span style="font-family: monospace;">${log.formattedDistance}</span>` : ''}
        ${log.notes ? `<br><small>${log.notes}</small>` : ''}
      </div>
    `);

    this.#drawnLayers.set(log.id, layer);
  }

  /**
   * Render log card in list
   */
  #renderLogCard(log) {
    const isRoute = log.type === 'route';

    const html = `
      <li 
        class="log-card log-card--${log.type}" 
        data-id="${log.id}"
        tabindex="0"
        role="button"
        aria-label="${log.title}. ${isRoute ? log.formattedDistance : 'Spot'}. ${log.formattedDate}"
      >
        <div class="log-card__header">
          <div class="log-card__icon-wrapper">
            <i class="ph ${isRoute ? 'ph-path' : 'ph-map-pin'} log-card__icon" aria-hidden="true"></i>
          </div>
          <div class="log-card__content">
            <div class="log-card__title">${log.title}</div>
            <div class="log-card__date">${log.formattedDate} · ${log.formattedTime}</div>
          </div>
          <button 
            type="button" 
            class="log-card__delete" 
            data-id="${log.id}"
            aria-label="Delete ${log.title}"
            title="Delete"
          >
            <i class="ph ph-trash" aria-hidden="true"></i>
          </button>
        </div>
        ${
          isRoute
            ? `
        <div class="log-card__footer">
          <div class="log-card__stat">
            <i class="ph ph-ruler log-card__stat-icon" aria-hidden="true"></i>
            <span class="log-card__stat-value">${log.distance.toFixed(2)}</span>
            <span class="log-card__stat-unit">km</span>
          </div>
          ${
            log.duration > 0
              ? `
          <div class="log-card__stat">
            <i class="ph ph-timer log-card__stat-icon" aria-hidden="true"></i>
            <span class="log-card__stat-value">${log.duration}</span>
            <span class="log-card__stat-unit">min</span>
          </div>
          `
              : ''
          }
          ${
            log.pace > 0
              ? `
          <div class="log-card__stat">
            <i class="ph ph-gauge log-card__stat-icon" aria-hidden="true"></i>
            <span class="log-card__stat-value">${log.pace.toFixed(1)}</span>
            <span class="log-card__stat-unit">min/km</span>
          </div>
          `
              : ''
          }
        </div>
        `
            : ''
        }
      </li>
    `;

    this.#emptyState.insertAdjacentHTML('beforebegin', html);
  }

  /**
   * Handle log card click - select route and persist animation
   */
  #handleLogClick(e) {
    // Check if delete button was clicked
    const deleteBtn = e.target.closest('.log-card__delete');
    if (deleteBtn) {
      e.stopPropagation();
      const logId = deleteBtn.dataset.id;
      this.#deleteLog(logId);
      return;
    }

    const card = e.target.closest('.log-card');
    if (!card) return;

    const log = this.#logs.find((l) => l.id === card.dataset.id);
    if (!log) return;

    // Deselect previous route if different
    if (this.#selectedRouteId && this.#selectedRouteId !== log.id) {
      this.#stopRouteAnimation(this.#selectedRouteId);
      const prevLayer = this.#drawnLayers.get(this.#selectedRouteId);
      if (prevLayer && prevLayer.setStyle) {
        prevLayer.setStyle({ color: '#9ca3af', weight: 3, opacity: 0.6 });
      }
    }

    if (log.type === 'route') {
      this.#map.fitBounds(L.latLngBounds(log.coords), { padding: [50, 50] });
      // Select and animate
      this.#selectedRouteId = log.id;
      this.#animateRoute(log.id, log.coords);
    } else {
      this.#map.setView(log.coords, 16);
      this.#selectedRouteId = null;
    }

    // Open popup
    const layer = this.#drawnLayers.get(log.id);
    if (layer) layer.openPopup();
  }

  /**
   * Delete a log entry - show confirmation dialog
   */
  #deleteLog(logId) {
    const log = this.#logs.find((l) => l.id === logId);
    if (!log) return;

    // Store pending delete and show dialog
    this.#pendingDeleteId = logId;
    this.#deleteMessage.textContent = `"${log.title}" will be permanently deleted.`;
    this.#deleteDialog.showModal();
  }

  /**
   * Confirm deletion from dialog
   */
  #confirmDelete() {
    const logId = this.#pendingDeleteId;
    if (!logId) return;

    // Stop any animation
    if (this.#selectedRouteId === logId) {
      this.#deselectRoute();
    }
    this.#stopRouteAnimation(logId);

    // Remove from map
    const layer = this.#drawnLayers.get(logId);
    if (layer) {
      this.#map.removeLayer(layer);
      this.#drawnLayers.delete(logId);
    }

    // Remove from logs array
    this.#logs = this.#logs.filter((l) => l.id !== logId);

    // Remove from DOM
    const card = document.querySelector(`.log-card[data-id="${logId}"]`);
    if (card) card.remove();

    // Save to LocalStorage
    this.#saveToLocalStorage();

    // Update count
    this.#updateLogCount();
    this.#updateEmptyState();

    // Close dialog
    this.#pendingDeleteId = null;
    this.#deleteDialog.close();
  }

  /**
   * Cancel deletion
   */
  #cancelDelete() {
    this.#pendingDeleteId = null;
    this.#deleteDialog.close();
  }

  /**
   * Handle log card hover - only animate if not already selected
   */
  #handleLogHover(e) {
    const card = e.target.closest('.log-card');
    if (!card) return;

    const logId = card.dataset.id;

    // Don't hover-animate if this route is already selected
    if (this.#selectedRouteId === logId) return;

    const log = this.#logs.find((l) => l.id === logId);
    if (!log || log.type !== 'route') return;

    this.#animateRoute(logId, log.coords);
  }

  /**
   * Handle log card leave - only stop if not selected
   */
  #handleLogLeave(e) {
    const card = e.target.closest('.log-card');
    if (!card) return;

    const logId = card.dataset.id;

    // Don't stop animation if this route is selected (clicked)
    if (this.#selectedRouteId === logId) return;

    this.#stopRouteAnimation(logId);

    // Reset to default gray style
    const layer = this.#drawnLayers.get(logId);
    if (layer && layer.setStyle) {
      layer.setStyle({ color: '#9ca3af', weight: 3, opacity: 0.6 });
    }
  }

  /**
   * Animate route with progress then stripes
   */
  #animateRoute(logId, coords) {
    // Stop any existing animation
    this.#stopRouteAnimation(logId);

    const baseLayer = this.#drawnLayers.get(logId);
    if (!baseLayer) return;

    // Set base layer to light gray during animation
    baseLayer.setStyle({ color: '#d1d5db', weight: 4, opacity: 0.4 });

    // Create animation overlay layer
    const animLayer = L.polyline([], {
      color: '#000000',
      weight: 4,
      opacity: 1,
    }).addTo(this.#map);

    this.#animationLayers.set(logId, animLayer);

    // Calculate total path length for timing
    const totalDistance = this.#calculateTotalDistance(coords);
    const animationDuration = Math.min(
      Math.max(totalDistance * 200, 500),
      2000,
    ); // 500ms - 2s based on distance

    let startTime = null;
    let phase = 'progress'; // 'progress' or 'stripes'

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      if (phase === 'progress') {
        // Progress animation - draw line from start to end
        const progress = Math.min(elapsed / animationDuration, 1);
        const pointsToShow = Math.ceil(progress * coords.length);
        animLayer.setLatLngs(coords.slice(0, pointsToShow));

        if (progress >= 1) {
          // Switch to stripe phase
          phase = 'stripes';
          startTime = timestamp;
          animLayer.setStyle({
            dashArray: '8, 8',
            dashOffset: 0,
          });
        }
      } else {
        // Stripe animation - continuous moving stripes
        const stripeOffset = (elapsed / 50) % 16; // Speed of stripe movement
        animLayer.setStyle({
          dashOffset: -stripeOffset,
        });
      }

      const frameId = requestAnimationFrame(animate);
      this.#activeAnimations.set(logId, frameId);
    };

    const frameId = requestAnimationFrame(animate);
    this.#activeAnimations.set(logId, frameId);
  }

  /**
   * Stop route animation
   */
  #stopRouteAnimation(logId) {
    // Cancel animation frame
    const frameId = this.#activeAnimations.get(logId);
    if (frameId) {
      cancelAnimationFrame(frameId);
      this.#activeAnimations.delete(logId);
    }

    // Remove animation layer
    const animLayer = this.#animationLayers.get(logId);
    if (animLayer) {
      this.#map.removeLayer(animLayer);
      this.#animationLayers.delete(logId);
    }
  }

  /**
   * Deselect current route and stop its animation
   */
  #deselectRoute() {
    if (!this.#selectedRouteId) return;

    const logId = this.#selectedRouteId;
    this.#selectedRouteId = null;

    this.#stopRouteAnimation(logId);

    // Reset to default gray style
    const layer = this.#drawnLayers.get(logId);
    if (layer && layer.setStyle) {
      layer.setStyle({ color: '#9ca3af', weight: 3, opacity: 0.6 });
    }
  }

  /**
   * Update log count display
   */
  #updateLogCount() {
    const count = this.#logs.length;
    this.#logCount.textContent = `${count} ${count === 1 ? 'entry' : 'entries'}`;
  }

  /**
   * Update empty state visibility
   */
  #updateEmptyState() {
    this.#emptyState.style.display = this.#logs.length === 0 ? 'flex' : 'none';
  }

  /**
   * Save logs to LocalStorage
   */
  #saveToLocalStorage() {
    const data = this.#logs.map((log) => log.toJSON());
    localStorage.setItem('scoutlog-logs', JSON.stringify(data));
  }

  /**
   * Load logs from LocalStorage
   */
  #loadFromLocalStorage() {
    const data = localStorage.getItem('scoutlog-logs');
    if (!data) return;

    try {
      const logsData = JSON.parse(data);
      this.#logs = logsData
        .map((obj) => {
          if (obj.type === 'route') {
            return Route.fromJSON(obj);
          } else if (obj.type === 'spot') {
            return Spot.fromJSON(obj);
          }
          return null;
        })
        .filter(Boolean);
    } catch (e) {
      console.error('Error loading logs:', e);
      this.#logs = [];
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
