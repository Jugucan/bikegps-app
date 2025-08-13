// hooks/useMap.js
import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { createCustomIcons } from '../utils/mapUtils';

export const useMap = () => {
  const [currentRoute, setCurrentRoute] = useState(null);
  const [routeProgress, setRouteProgress] = useState(0);
  const [isReturning, setIsReturning] = useState(false);
  
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routePolylinesRef = useRef([]);

  // Initialize map
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapInstanceRef.current || !mapRef.current) return;
      
      try {
        const map = L.map(mapRef.current, {
          zoomControl: false, // Disable default zoom control
          attributionControl: false // Clean interface
        }).setView([41.6722, 2.4540], 15);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
          crossOrigin: true
        }).addTo(map);
        
        // Add custom zoom control in bottom right
        L.control.zoom({
          position: 'bottomright'
        }).addTo(map);
        
        mapInstanceRef.current = map;
        createCustomIcons();
        
        console.log('✅ Mapa carregat correctament');
      } catch (error) {
        console.error('❌ Error initializing map:', error);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  // Cleanup map
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const clearRoutePolylines = () => {
    routePolylinesRef.current.forEach(polyline => {
      if (mapInstanceRef.current && mapInstanceRef.current.hasLayer(polyline)) {
        mapInstanceRef.current.removeLayer(polyline);
      }
    });
    routePolylinesRef.current = [];
  };

  const selectRoute = (routeId, routeData) => {
    setCurrentRoute({ id: routeId, ...routeData });
    setRouteProgress(0);
    setIsReturning(false);
    
    if (mapInstanceRef.current && routeData.coordinates) {
      clearRoutePolylines();

      let leafletCoords;
      if (routeData.coordinates[0] && typeof routeData.coordinates[0] === 'object' && 'lat' in routeData.coordinates[0]) {
        leafletCoords = routeData.coordinates.map(coord => [coord.lat, coord.lng]);
      } else if (Array.isArray(routeData.coordinates[0])) {
        leafletCoords = routeData.coordinates;
      } else {
        console.error('Format de coordenades no reconegut:', routeData.coordinates[0]);
        return;
      }
      
      const pendingRoute = L.polyline(leafletCoords, {
        color: '#81C784',
        weight: 12,
        opacity: 0.8,
        dashArray: '20, 15'
      }).addTo(mapInstanceRef.current);
      
      routePolylinesRef.current.push(pendingRoute);
      
      const bounds = pendingRoute.getBounds();
      mapInstanceRef.current.fitBounds(bounds);
    }
  };

  return {
    mapRef,
    mapInstanceRef,
    currentRoute,
    setCurrentRoute,
    routeProgress,
    isReturning,
    selectRoute,
    clearRoutePolylines
  };
};