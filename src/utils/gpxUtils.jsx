// utils/gpxUtils.js
export const parseGPX = (gpxText) => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'text/xml');
    
    // Buscar punts de ruta
    const trkpts = xmlDoc.querySelectorAll('trkpt');
    const waypoints = xmlDoc.querySelectorAll('wpt');
    
    let coordinates = [];
    
    // Primer trackar punts de track
    trkpts.forEach(point => {
      const lat = parseFloat(point.getAttribute('lat'));
      const lon = parseFloat(point.getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lon)) {
        coordinates.push({
          lat: lat,
          lng: lon
        });
      }
    });
    
    // Si no hi ha track points, usar waypoints
    if (coordinates.length === 0) {
      waypoints.forEach(point => {
        const lat = parseFloat(point.getAttribute('lat'));
        const lon = parseFloat(point.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lon)) {
          coordinates.push({
            lat: lat,
            lng: lon
          });
        }
      });
    }
    
    return coordinates;
  } catch (error) {
    console.error('Error parsing GPX:', error);
    throw new Error('Format GPX no vàlid');
  }
};