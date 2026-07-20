import assert from 'node:assert/strict';
import type { RoutePoint } from '../types';
import { buildRouteVisualization } from '../utils/routeSplits';

const LATITUDE_DEGREES_PER_KM = 180 / (Math.PI * 6371);

function point(distanceKm: number, timestamp: number, seg = false): RoutePoint {
  const routePoint: RoutePoint = {
    lat: distanceKm * LATITUDE_DEGREES_PER_KM,
    lng: 139,
    timestamp,
  };
  if (seg) routePoint.seg = true;
  return routePoint;
}

const markerRoute = buildRouteVisualization([
  point(0, 0),
  point(0.6, 180_000),
  point(1.2, 360_000),
]);
assert.equal(markerRoute.kmMarkers.length, 1);
assert.equal(markerRoute.kmMarkers[0].km, 1);
assert.ok(Math.abs(markerRoute.kmMarkers[0].latitude - LATITUDE_DEGREES_PER_KM) < 1e-10);

const pausedRoute = buildRouteVisualization([
  point(0, 0),
  point(0.4, 120_000),
  point(1.4, 240_000, true),
  point(1.8, 360_000),
]);
assert.equal(pausedRoute.segments.length, 2);
assert.equal(pausedRoute.kmMarkers.length, 0);
assert.ok(pausedRoute.segments.every((segment) => {
  const latitudes = segment.coordinates.map((coordinate) => coordinate.latitude);
  return !(latitudes.includes(0.4 * LATITUDE_DEGREES_PER_KM)
    && latitudes.includes(1.4 * LATITUDE_DEGREES_PER_KM));
}));

const threePaces = buildRouteVisualization([
  point(0, 0),
  point(1, 300_000),
  point(2, 660_000),
  point(3, 1_080_000),
]);
assert.deepEqual(
  new Set(threePaces.segments.map((segment) => segment.band)),
  new Set(['fast', 'steady', 'slow']),
);
assert.deepEqual(threePaces.kmMarkers.map((marker) => marker.km), [1, 2, 3]);

assert.deepEqual(buildRouteVisualization([]), { segments: [], kmMarkers: [] });

console.log('route split tests passed');
