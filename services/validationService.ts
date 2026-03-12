/**
 * Calculates the distance between two geographical points using the Haversine formula.
 *
 * @param lat1 Latitude of the first point.
 * @param lng1 Longitude of the first point.
 * @param lat2 Latitude of the second point.
 * @param lng2 Longitude of the second point.
 * @returns The distance in meters.
 */
export function calculateHaversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) {
        return Infinity;
    }

    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
}
