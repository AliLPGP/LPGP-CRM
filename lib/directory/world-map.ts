import "server-only";
import { geoCentroid, geoEqualEarth, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature, merge, mesh } from "topojson-client";
import type { GeometryCollection, MultiPolygon, Polygon, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { ALL_COUNTRIES } from "./geo";

// The basemap behind Discover's "where they are" panel, projected once on the
// server: land as one path, borders as another, and an anchor point per
// directory country for its proportional circle. Counts are drawn as circles,
// not a filled choropleth — a big country with three firms shouldn't outshout
// Luxembourg with forty. Natural Earth 1:110m, via the world-atlas package.

export type WorldGeometry = {
  width: number;
  height: number;
  land: string;
  borders: string;
  /** Directory country name → [x, y] in the same viewBox. */
  anchors: Record<string, [number, number]>;
};

export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 470;

/** Directory names that the atlas spells differently. */
const ATLAS_NAME: Record<string, string> = {
  "United States": "United States of America",
  "Czech Republic": "Czechia",
  "Dominican Republic": "Dominican Rep.",
  "Bosnia and Herzegovina": "Bosnia and Herz.",
  "North Macedonia": "Macedonia",
  "Democratic Republic of the Congo": "Dem. Rep. Congo",
  "Ivory Coast": "Côte d'Ivoire",
  Eswatini: "eSwatini",
};

/** Where a multi-part country's circle belongs (its overseas parts would pull
 *  a centroid out to sea), and the financial centres too small for 1:110m. */
const LONLAT: Record<string, [number, number]> = {
  "United States": [-98.5, 39.5],
  Canada: [-100, 56],
  France: [2.4, 46.6],
  Norway: [9.5, 61.5],
  Russia: [60, 57],
  Netherlands: [5.3, 52.2],
  Denmark: [9.3, 56.1],
  Chile: [-71, -33],
  Singapore: [103.82, 1.35],
  "Hong Kong": [114.17, 22.32],
  Macau: [113.54, 22.2],
  "Cayman Islands": [-81.25, 19.31],
  Bermuda: [-64.75, 32.3],
  Bahamas: [-77.4, 25.03],
  "British Virgin Islands": [-64.62, 18.42],
  Barbados: [-59.54, 13.19],
  Jersey: [-2.13, 49.21],
  Guernsey: [-2.58, 49.45],
  "Isle of Man": [-4.55, 54.24],
  Gibraltar: [-5.35, 36.14],
  Monaco: [7.42, 43.74],
  Liechtenstein: [9.55, 47.16],
  Andorra: [1.52, 42.51],
  Malta: [14.51, 35.9],
  Bahrain: [50.56, 26.07],
  Mauritius: [57.55, -20.35],
  Luxembourg: [6.13, 49.61],
};

let memo: WorldGeometry | null = null;

export function worldGeometry(): WorldGeometry {
  if (memo) return memo;
  const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const countries = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>;
  const withoutAntarctica: FeatureCollection<Geometry, { name: string }> = {
    type: "FeatureCollection",
    features: countries.features.filter((f) => f.properties?.name !== "Antarctica"),
  };
  const projection = geoEqualEarth().fitExtent(
    [
      [4, 4],
      [MAP_WIDTH - 4, MAP_HEIGHT - 4],
    ],
    withoutAntarctica,
  );
  // Whole pixels are plenty at this scale, and one merged outline draws each
  // coastline once instead of twice.
  const path = geoPath(projection).digits(0);
  const land =
    path(
      merge(
        topo,
        topo.objects.countries.geometries.filter(
          (g): g is Polygon<{ name: string }> | MultiPolygon<{ name: string }> =>
            (g.type === "Polygon" || g.type === "MultiPolygon") && g.properties?.name !== "Antarctica",
        ),
      ),
    ) ?? "";
  const borders =
    path(mesh(topo, topo.objects.countries, (a, b) => a !== b && (a.properties as { name?: string } | undefined)?.name !== "Antarctica")) ?? "";

  const byName = new Map<string, Feature<Geometry, { name: string }>>(
    countries.features.map((f) => [f.properties.name, f]),
  );
  const anchors: Record<string, [number, number]> = {};
  for (const name of ALL_COUNTRIES) {
    const lonlat = LONLAT[name] ?? (() => {
      const f = byName.get(ATLAS_NAME[name] ?? name);
      return f ? (geoCentroid(f) as [number, number]) : null;
    })();
    if (!lonlat) continue;
    const xy = projection(lonlat);
    if (xy) anchors[name] = [Math.round(xy[0] * 10) / 10, Math.round(xy[1] * 10) / 10];
  }
  memo = { width: MAP_WIDTH, height: MAP_HEIGHT, land, borders, anchors };
  return memo;
}
