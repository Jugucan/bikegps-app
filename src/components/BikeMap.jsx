import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const BikeMap = ({ 
  mapInstanceRef, 
  currentRoute, 
  userLocation, 
  followUser = true,
  showUserDirection = true,
  mapHeight = '400px' 
}) => {
  const mapContainerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const routePolylineRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const lastUpdateRef = useRef(0);
  const userDirectionRef = useRef(0);
  
  // Inicialització del mapa
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    try {
      console.log('🗺️ Inicialitzant BikeMap...');
      
      // Crear mapa amb configuració optimitzada per ciclisme
      const map = L.map(mapContainerRef.current, {
        center: [41.6722, 2.4540], // Calella per defecte
        zoom: 17,
        zoomControl: false, // El movem a una posició millor
        attributionControl: false, // Simplificar interfície
        
        // Configuració de rendiment
        preferCanvas: true, // Millor rendiment en mòbil
        updateWhenZooming: false, // Reduir parpelleig
        updateWhenIdle: true,
        
        // Configuració de navegació suau
        inertia: true,
        inertiaDeceleration: 2000,
        inertiaMaxSpeed: 500,
        
        // Evitar rotacions accidentals
        touchZoom: true,
        doubleClickZoom: false,
        scrollWheelZoom: false, // Evitar zooms accidentals
        dragging: true
      });
      
      // Afegir controls personalitzats
      L.control.zoom({
        position: 'topright'
      }).addTo(map);
      
      // Capa de teules optimitzada
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
        
        // Optimitzacions de càrrega
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 2,
        
        // Configuració de crossOrigin per evitar problemes
        crossOrigin: true
      }).addTo(map);
      
      mapInstanceRef.current = map;
      setMapReady(true);
      
      console.log('✅ BikeMap inicialitzat correctament');
      
      // Cleanup
      return () => {
        if (map) {
          map.remove();
          mapInstanceRef.current = null;
        }
      };
      
    } catch (error) {
      console.error('❌ Error inicialitzant BikeMap:', error);
    }
  }, []);

  // Gestió de la ubicació de l'usuari amb direcció
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !userLocation) return;
    
    const now = Date.now();
    // Throttling per evitar parpelleig (màxim 1 actualització per segon)
    if (now - lastUpdateRef.current < 1000) return;
    lastUpdateRef.current = now;
    
    const map = mapInstanceRef.current;
    const { latitude, longitude, heading } = userLocation;
    
    try {
      // Crear o actualitzar marcador d'usuari amb direcció
      if (!userMarkerRef.current) {
        // Icona personalitzada amb fletxa direccional
        const userIcon = L.divIcon({
          className: 'user-location-marker',
          html: `
            <div class="user-marker-container">
              <div class="user-marker-dot"></div>
              ${showUserDirection ? '<div class="user-marker-arrow"></div>' : ''}
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        
        userMarkerRef.current = L.marker([latitude, longitude], {
          icon: userIcon,
          zIndexOffset: 1000 // Assegurar que estigui per sobre
        }).addTo(map);
        
        console.log('📍 Marcador d\'usuari creat');
      } else {
        // Actualitzar posició suaument
        userMarkerRef.current.setLatLng([latitude, longitude]);
      }
      
      // Actualitzar direcció si està disponible
      if (showUserDirection && heading !== undefined && heading !== null) {
        const marker = userMarkerRef.current;
        const element = marker.getElement();
        if (element) {
          const arrow = element.querySelector('.user-marker-arrow');
          if (arrow) {
            // Smoothing de la direcció per evitar salts bruscs
            const currentHeading = userDirectionRef.current;
            let targetHeading = heading;
            
            // Gestionar el salt 0°-360°
            if (Math.abs(targetHeading - currentHeading) > 180) {
              if (targetHeading > currentHeading) {
                targetHeading -= 360;
              } else {
                targetHeading += 360;
              }
            }
            
            // Interpolació suau
            const smoothHeading = currentHeading + (targetHeading - currentHeading) * 0.3;
            userDirectionRef.current = smoothHeading % 360;
            
            arrow.style.transform = `rotate(${userDirectionRef.current}deg)`;
          }
        }
      }
      
      // Seguir usuari si està activat
      if (followUser) {
        // Centrar el mapa suaument a la posició de l'usuari
        const currentCenter = map.getCenter();
        const distance = currentCenter.distanceTo([latitude, longitude]);
        
        // Només moure el mapa si l'usuari s'ha mogut significativament
        if (distance > 10) { // 10 metres
          map.panTo([latitude, longitude], {
            animate: true,
            duration: 1,
            easeLinearity: 0.1
          });
        }
      }
      
    } catch (error) {
      console.error('❌ Error actualitzant ubicació usuari:', error);
    }
  }, [mapReady, userLocation, followUser, showUserDirection]);

  // Gestió de la ruta actual
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    
    const map = mapInstanceRef.current;
    
    // Eliminar ruta anterior
    if (routePolylineRef.current) {
      map.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }
    
    // Afegir nova ruta
    if (currentRoute && currentRoute.coordinates && currentRoute.coordinates.length > 0) {
      try {
        const coordinates = currentRoute.coordinates.map(coord => [coord.latitude, coord.longitude]);
        
        routePolylineRef.current = L.polyline(coordinates, {
          color: '#ff6b35',
          weight: 4,
          opacity: 0.8,
          smoothFactor: 1
        }).addTo(map);
        
        // Ajustar vista per mostrar tota la ruta
        const group = new L.featureGroup([routePolylineRef.current]);
        map.fitBounds(group.getBounds(), { 
          padding: [20, 20],
          maxZoom: 16 
        });
        
        console.log(`✅ Ruta "${currentRoute.name}" carregada amb ${coordinates.length} punts`);
        
      } catch (error) {
        console.error('❌ Error carregant ruta:', error);
      }
    }
  }, [mapReady, currentRoute]);

  // Forçar resize quan el component es munta
  useEffect(() => {
    if (mapReady && mapInstanceRef.current) {
      const timer = setTimeout(() => {
        mapInstanceRef.current.invalidateSize();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [mapReady]);

  return (
    <>
      {/* Contenidor del mapa */}
      <div 
        className="bike-map-container"
        style={{
          width: '100%',
          height: mapHeight,
          position: 'relative',
          borderRadius: '0.5rem',
          overflow: 'hidden',
          backgroundColor: '#e5e7eb'
        }}
      >
        <div 
          ref={mapContainerRef}
          style={{
            width: '100%',
            height: '100%'
          }}
        />
        
        {/* Indicador de càrrega */}
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2"></div>
              <p className="text-sm text-gray-600">Carregant mapa...</p>
            </div>
          </div>
        )}
        
        {/* Info overlay */}
        {mapReady && (
          <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
            {userLocation ? (
              <div>
                📍 {userLocation.latitude.toFixed(6)}, {userLocation.longitude.toFixed(6)}
                {userLocation.accuracy && (
                  <div>±{Math.round(userLocation.accuracy)}m</div>
                )}
              </div>
            ) : (
              <div>🔍 Cercant ubicació...</div>
            )}
          </div>
        )}
      </div>
      
      {/* Estils CSS per als marcadors */}
      <style jsx>{`
        .user-location-marker {
          background: none;
          border: none;
        }
        
        .user-marker-container {
          position: relative;
          width: 24px;
          height: 24px;
        }
        
        .user-marker-dot {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 12px;
          height: 12px;
          background: #4285f4;
          border: 2px solid white;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        
        .user-marker-arrow {
          position: absolute;
          top: -2px;
          left: 50%;
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-bottom: 12px solid #4285f4;
          transform: translateX(-50%);
          transform-origin: 6px 12px;
          transition: transform 0.3s ease;
        }
        
        .leaflet-container {
          font-family: inherit;
        }
        
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1) !important;
        }
        
        .leaflet-control-zoom a {
          background-color: white !important;
          border: 1px solid #ccc !important;
          color: #333 !important;
        }
        
        .leaflet-control-zoom a:hover {
          background-color: #f0f0f0 !important;
        }
      `}</style>
    </>
  );
};

export default BikeMap;
