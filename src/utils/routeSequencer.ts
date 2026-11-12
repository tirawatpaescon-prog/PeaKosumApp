import { StreetlightTransformer } from '../data/streetlightSurveyData';

export type RouteSortMode =
  | 'nearest_from_user' // จัดลำดับจากใกล้ ➔ ไกล (วัดตรงจากจุดที่ผู้ใช้อยู่ปัจจุบัน)
  | 'nearest_chain';    // จัดตามเส้นทางแวะต่อเนื่อง (เริ่มจากจุดปัจจุบัน ➔ แวะจุดใกล้สุดต่อกันไป)

export interface TransformerCoord {
  lat: number;
  lng: number;
}

export interface RouteStop {
  transformer: StreetlightTransformer;
  coords: TransformerCoord | null;
  stopNumber: number;
  distanceFromPrevMeters: number | null;
  distanceFromUserMeters: number | null;
  cumulativeDistanceMeters: number;
}

export interface RoutePlan {
  stops: RouteStop[];
  totalDistanceMeters: number;
  validStopsCount: number;
  missingCoordsCount: number;
  googleMapsUrl: string | null;
  closestDistanceMeters: number | null;
  farthestDistanceMeters: number | null;
}

/**
 * Extracts and validates geographic coordinates from a StreetlightTransformer
 */
export function getTransformerCoords(item: StreetlightTransformer): TransformerCoord | null {
  if (
    typeof item.latitude === 'number' &&
    typeof item.longitude === 'number' &&
    !isNaN(item.latitude) &&
    !isNaN(item.longitude) &&
    (item.latitude !== 0 || item.longitude !== 0)
  ) {
    return { lat: item.latitude, lng: item.longitude };
  }

  if (item.latlong) {
    const parts = item.latlong.split(',').map((p) => parseFloat(p.trim()));
    if (
      parts.length >= 2 &&
      !isNaN(parts[0]) &&
      !isNaN(parts[1]) &&
      (parts[0] !== 0 || parts[1] !== 0)
    ) {
      return { lat: parts[0], lng: parts[1] };
    }
  }

  return null;
}

/**
 * Calculates straight-line distance in meters between two coordinates using Haversine formula
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Format distance in meters into human-readable Thai string
 */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || isNaN(meters)) return '-';
  if (meters < 1000) {
    return `${meters.toLocaleString()} ม.`;
  }
  return `${(meters / 1000).toFixed(2)} กม.`;
}

/**
 * Sequences a list of in-progress transformers based strictly on current user location (Nearest to Farthest)
 */
export function sequenceRoute(
  items: StreetlightTransformer[],
  sortMode: RouteSortMode = 'nearest_from_user',
  userLocation: TransformerCoord | null
): RoutePlan {
  if (!items || items.length === 0) {
    return {
      stops: [],
      totalDistanceMeters: 0,
      validStopsCount: 0,
      missingCoordsCount: 0,
      googleMapsUrl: null,
      closestDistanceMeters: null,
      farthestDistanceMeters: null
    };
  }

  // Separate items with valid coordinates from items without
  const withCoords: {
    item: StreetlightTransformer;
    coords: TransformerCoord;
    distanceFromUser: number | null;
  }[] = [];
  const withoutCoords: StreetlightTransformer[] = [];

  for (const item of items) {
    const coords = getTransformerCoords(item);
    if (coords) {
      const distFromUser = userLocation
        ? calculateHaversineDistanceMeters(
            userLocation.lat,
            userLocation.lng,
            coords.lat,
            coords.lng
          )
        : null;
      withCoords.push({ item, coords, distanceFromUser: distFromUser });
    } else {
      withoutCoords.push(item);
    }
  }

  let orderedWithCoords: {
    item: StreetlightTransformer;
    coords: TransformerCoord;
    distanceFromUser: number | null;
  }[] = [];

  if (sortMode === 'nearest_chain') {
    // Continuous Nearest-Neighbor chain starting from user's current location
    const unvisited = [...withCoords];
    orderedWithCoords = [];

    let currentPoint: TransformerCoord | null = userLocation;

    // If no user location, start with the first item
    if (!currentPoint && unvisited.length > 0) {
      const first = unvisited.shift()!;
      orderedWithCoords.push(first);
      currentPoint = first.coords;
    }

    while (unvisited.length > 0 && currentPoint) {
      let nearestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const dist = calculateHaversineDistanceMeters(
          currentPoint.lat,
          currentPoint.lng,
          unvisited[i].coords.lat,
          unvisited[i].coords.lng
        );
        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        }
      }

      const next = unvisited.splice(nearestIdx, 1)[0];
      orderedWithCoords.push(next);
      currentPoint = next.coords;
    }
  } else {
    // Default: 'nearest_from_user' - จัดลำดับจากใกล้ไปไกลจากจุดที่ผู้ใช้อยู่ปัจจุบัน
    if (userLocation) {
      orderedWithCoords = [...withCoords].sort((a, b) => {
        return (a.distanceFromUser ?? Infinity) - (b.distanceFromUser ?? Infinity);
      });
    } else {
      // If GPS not yet acquired, maintain initial order until GPS is granted
      orderedWithCoords = [...withCoords];
    }
  }

  // Build RouteStops with distance calculations
  const stops: RouteStop[] = [];
  let cumulativeDistance = 0;

  for (let i = 0; i < orderedWithCoords.length; i++) {
    const { item, coords, distanceFromUser } = orderedWithCoords[i];
    const stopNumber = i + 1;

    let distanceFromPrev: number | null = null;

    if (i === 0) {
      distanceFromPrev = distanceFromUser;
      cumulativeDistance += distanceFromUser || 0;
    } else {
      const prevCoords = orderedWithCoords[i - 1].coords;
      distanceFromPrev = calculateHaversineDistanceMeters(
        prevCoords.lat,
        prevCoords.lng,
        coords.lat,
        coords.lng
      );
      cumulativeDistance += distanceFromPrev;
    }

    stops.push({
      transformer: item,
      coords,
      stopNumber,
      distanceFromPrevMeters: distanceFromPrev,
      distanceFromUserMeters: distanceFromUser,
      cumulativeDistanceMeters: cumulativeDistance
    });
  }

  // Append items without coords at the end
  for (let j = 0; j < withoutCoords.length; j++) {
    stops.push({
      transformer: withoutCoords[j],
      coords: null,
      stopNumber: stops.length + 1,
      distanceFromPrevMeters: null,
      distanceFromUserMeters: null,
      cumulativeDistanceMeters: cumulativeDistance
    });
  }

  // Calculate closest & farthest distances from user
  const validDistances = stops
    .map((s) => s.distanceFromUserMeters)
    .filter((d): d is number => d !== null && !isNaN(d));

  const closestDistance = validDistances.length > 0 ? Math.min(...validDistances) : null;
  const farthestDistance = validDistances.length > 0 ? Math.max(...validDistances) : null;

  // Generate Google Maps Multi-stop directions URL
  let googleMapsUrl: string | null = null;
  const validStops = stops.filter((s) => s.coords !== null);

  if (validStops.length > 0) {
    if (validStops.length === 1) {
      const single = validStops[0].coords!;
      googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${single.lat},${single.lng}&travelmode=driving`;
    } else {
      let originStr = '';
      if (userLocation) {
        originStr = `${userLocation.lat},${userLocation.lng}`;
      } else {
        const first = validStops[0].coords!;
        originStr = `${first.lat},${first.lng}`;
      }

      const last = validStops[validStops.length - 1].coords!;
      const destStr = `${last.lat},${last.lng}`;

      // Waypoints are in-between stops
      const startIdx = userLocation ? 0 : 1;
      const endIdx = validStops.length - 1;
      const waypointsSlice = validStops.slice(startIdx, endIdx);

      googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&travelmode=driving`;

      if (waypointsSlice.length > 0) {
        // Google Maps supports up to 9 waypoints in URL parameter
        const waypointsParam = waypointsSlice
          .slice(0, 9)
          .map((s) => `${s.coords!.lat},${s.coords!.lng}`)
          .join('|');
        googleMapsUrl += `&waypoints=${encodeURIComponent(waypointsParam)}`;
      }
    }
  }

  return {
    stops,
    totalDistanceMeters: cumulativeDistance,
    validStopsCount: withCoords.length,
    missingCoordsCount: withoutCoords.length,
    googleMapsUrl,
    closestDistanceMeters: closestDistance,
    farthestDistanceMeters: farthestDistance
  };
}

/**
 * Generates a formatted text summary for sharing in LINE or field chats
 */
export function generateRouteSummaryText(
  plan: RoutePlan,
  villageName: string,
  sortMode: RouteSortMode = 'nearest_from_user'
): string {
  const modeNames: Record<RouteSortMode, string> = {
    nearest_from_user: 'เรียงจากจุดที่คุณอยู่ (ใกล้ ➔ ไกล)',
    nearest_chain: 'เส้นทางแวะต่อเนื่อง (แวะจุดใกล้สุดต่อกันไป)'
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  let text = `⚡ ลำดับสำรวจโคมไฟ (จัดเรียงจากจุดที่อยู่ปัจจุบัน: ใกล้ ➔ ไกล) ⚡\n`;
  text += `📅 วันที่: ${dateStr}\n`;
  if (villageName && villageName !== 'all') {
    text += `🏘️ หมู่บ้าน: ${villageName}\n`;
  }
  text += `🧭 ลำดับ: ${modeNames[sortMode]}\n`;
  text += `🔢 รวมหม้อแปลง: ${plan.stops.length} เครื่อง`;
  if (plan.closestDistanceMeters !== null) {
    text += `\n📍 ใกล้ที่สุด: ${formatDistance(plan.closestDistanceMeters)}`;
  }
  if (plan.farthestDistanceMeters !== null) {
    text += ` | ไกลที่สุด: ${formatDistance(plan.farthestDistanceMeters)}`;
  }
  text += `\n─────────────────────\n`;

  plan.stops.forEach((stop) => {
    const tr = stop.transformer;
    const isFirst = stop.stopNumber === 1;
    const prefix = isFirst ? '🚩 จุดที่ 1 (ใกล้สุด)' : `➡️ จุดที่ ${stop.stopNumber}`;

    text += `${prefix}: ${tr.peano} (${tr.kva} kVA)\n`;
    text += `   📍 ${tr.location}\n`;
    if (stop.distanceFromUserMeters !== null) {
      text += `   📏 ห่างจากจุดคุณ: ${formatDistance(stop.distanceFromUserMeters)}\n`;
    } else if (stop.distanceFromPrevMeters !== null) {
      text += `   📏 ระยะห่าง: ${formatDistance(stop.distanceFromPrevMeters)}\n`;
    }
    if (stop.coords) {
      text += `   🗺️ พิกัด: ${stop.coords.lat.toFixed(6)}, ${stop.coords.lng.toFixed(6)}\n`;
    }
    text += `\n`;
  });

  if (plan.googleMapsUrl) {
    text += `─────────────────────\n`;
    text += `🗺️ นำทางด้วย Google Maps:\n${plan.googleMapsUrl}`;
  }

  return text;
}

/**
 * Generates a formatted text summary specifically for Recloser Work field teams
 */
export function generateRecloserWorkSummaryText(
  plan: RoutePlan,
  villageName: string,
  sortMode: RouteSortMode = 'nearest_from_user'
): string {
  const modeNames: Record<RouteSortMode, string> = {
    nearest_from_user: 'เรียงตามระยะห่างจริงจากจุดคุณ (ใกล้ ➔ ไกล)',
    nearest_chain: 'เส้นทางคุ้มค่าที่สุด (แวะจุดใกล้สุดต่อกันไป)'
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  let text = `⚡ แผนปฏิบัติงาน Patrol Work (จัดลำดับจากจุดที่อยู่ปัจจุบัน: ใกล้ ➔ ไกล) ⚡\n`;
  text += `📅 วันที่: ${dateStr}\n`;
  if (villageName && villageName !== 'all') {
    text += `🏘️ หมู่บ้าน: ${villageName}\n`;
  }
  text += `🧭 รูปแบบเส้นทาง: ${modeNames[sortMode]}\n`;
  text += `🔢 จำนวนหม้อแปลงที่กำลังดำเนินการ: ${plan.stops.length} เครื่อง`;
  if (plan.closestDistanceMeters !== null) {
    text += `\n📍 ใกล้ที่สุด: ${formatDistance(plan.closestDistanceMeters)}`;
  }
  if (plan.farthestDistanceMeters !== null) {
    text += ` | ไกลที่สุด: ${formatDistance(plan.farthestDistanceMeters)}`;
  }
  text += `\n🛣️ ระยะทางรวมทั้งเส้น: ${formatDistance(plan.totalDistanceMeters)}`;
  text += `\n─────────────────────\n`;

  plan.stops.forEach((stop) => {
    const tr = stop.transformer;
    const isFirst = stop.stopNumber === 1;
    const prefix = isFirst ? '🚩 จุดที่ 1 (ใกล้คุณที่สุด)' : `➡️ จุดที่ ${stop.stopNumber}`;

    text += `${prefix}: PEA ${tr.peano} (${tr.kva} kVA)\n`;
    text += `   📍 ${tr.location}\n`;
    if (stop.distanceFromUserMeters !== null) {
      text += `   📏 ห่างจากคุณ: ${formatDistance(stop.distanceFromUserMeters)}\n`;
    }
    if (stop.distanceFromPrevMeters !== null && !isFirst) {
      text += `   🚗 ห่างจากจุดก่อนหน้า: ${formatDistance(stop.distanceFromPrevMeters)}\n`;
    }
    if (stop.coords) {
      text += `   🗺️ พิกัด: ${stop.coords.lat.toFixed(6)}, ${stop.coords.lng.toFixed(6)}\n`;
    }
    text += `\n`;
  });

  if (plan.googleMapsUrl) {
    text += `─────────────────────\n`;
    text += `🗺️ เปิดแผนที่นำทางทั้งเส้น (Google Maps):\n${plan.googleMapsUrl}`;
  }

  return text;
}

