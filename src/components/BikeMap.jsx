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
  const currentBearingRef = useRef(0);
  const smoothBearingRef = useRef(0);
  
  // Inicialització del mapa
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    try {
      console.log('🗺️ Inicialitzant BikeMap amb rotació...');
      
      // Crear mapa amb configuració optimitzada per rotació
      const map = L.map(mapContainerRef.current, {
        center: [41.6722, 2.4540], // Calella per defecte
        zoom: 18, // Zoom proper per navegació
        zoomControl: false, // El movem després
        attributionControl: false,
        
        // Configuració per rotació suau
        preferCanvas: true,
        updateWhenZooming: false,
        updateWhenIdle: false, // Canviat per permetre rotació contínua
        
        // Navegació suau
        inertia: false, // Desactivem per control total
        fadeAnimation: false,
        zoomAnimation: false,
        markerZoomAnimation: false,
        
        // Evitar desplaçaments accidentals
        touchZoom: true,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        dragging: false, // Desactivem arrossegament perquè seguim l'usuari
        keyboard: false,
        
        // Configuració específica per rotació
        transform3DLimit: 2^23, // Límit alt per transformacions
        worldCopyJump: false
      });
      
      // Afegir controls en posició personalitzada
      L.control.zoom({
        position: 'bottomright'
      }).addTo(map);
      
      // Capa de teules optimitzada
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
        
        // Optimitzacions per rotació
        updateWhenIdle: false,
        updateWhenZooming: false,
        keepBuffer: 4, // Més buffer per rotacions
        
        // Càrrega més agressiva
        crossOrigin: true,
        opacity: 1
      });
      
      tileLayer.addTo(map);
      
      // Forçar que el contenidor del mapa tingui transformOrigin centrat
      const mapPane = map.getPanes().mapPane;
      mapPane.style.transformOrigin = '50% 50%';
      mapPane.style.transition = 'transform 0.3s ease-out';
      
      mapInstanceRef.current = map;
      setMapReady(true);
      
      console.log('✅ BikeMap amb rotació inicialitzat correctament');
      
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

  // Funció per rotar el mapa suaument
  const rotateMap = (targetBearing) => {
    if (!mapInstanceRef.current) return;
    
    const map = mapInstanceRef.current;
    const mapPane = map.getPanes().mapPane;
    
    // Normalitzar l'angle
    const normalizedBearing = ((targetBearing % 360) + 360) % 360;
    const currentBearing = smoothBearingRef.current;
    
    // Calcular la diferència més curta entre angles
    let diff = normalizedBearing - currentBearing;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    
    // Interpolació suau
    const newBearing = currentBearing + diff * 0.15; // Suavitzat més agressiu
    smoothBearingRef.current = newBearing;
    
    // Aplicar rotació al mapPane
    mapPane.style.transform = `rotate(${-newBearing}deg)`;
    
    // També rotar els controls per mantenir-los llegibles
    const controls = mapContainerRef.current.querySelectorAll('.leaflet-control');
    controls.forEach(control => {
      control.style.transform = `rotate(${newBearing}deg)`;
    });
  };

  // Gestió de la ubicació de l'usuari amb centrat i rotació
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !userLocation) return;
    
    const now = Date.now();
    // Throttling més freqüent per rotació suau
    if (now - lastUpdateRef.current < 500) return; // Cada 0.5 segons
    lastUpdateRef.current = now;
    
    const map = mapInstanceRef.current;
    const { latitude, longitude, heading } = userLocation;
    
    try {
      // Crear o actualitzar marcador d'usuari (sempre centrat)
      if (!userMarkerRef.current) {
        // Icona fixe que sempre apunta amunt (el mapa rota per sota)
        const userIcon = L.divIcon({
          className: 'user-location-marker-fixed',
          html: `
            <div class="user-marker-container-fixed">
              <div class="user-marker-dot-fixed"></div>
              <div class="user-marker-arrow-fixed"></div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
        
        userMarkerRef.current = L.marker([latitude, longitude], {
          icon: userIcon,
          zIndexOffset: 1000
        }).addTo(map);
        
        console.log('📍 Marcador d\'usuari fix creat');
      } else {
        // Actualitzar posició
        userMarkerRef.current.setLatLng([latitude, longitude]);
      }
      
      // SEMPRE centrar el mapa a la posició de l'usuari
      if (followUser) {
        map.setView([latitude, longitude], map.getZoom(), {
          animate: false // Sense animació per evitar conflictes amb la rotació
        });
      }
      
      // Rotar el mapa basant-se en la direcció de l'usuari
      if (showUserDirection && heading !== undefined && heading !== null) {
        currentBearingRef.current = heading;
        rotateMap(heading);
      }
      
    } catch (error) {
      console.error('❌ Error actualitzant ubicació usuari:', error);
    }
  }, [mapReady, userLocation, followUser, showUserDirection]);

  // Gestió de la ruta actual (amb rotació)
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
          weight: 5,
          opacity: 0.8,
          smoothFactor: 1
        }).addTo(map);
        
        console.log(`✅ Ruta "${currentRoute.name}" carregada amb ${coordinates.length} punts`);
        
        // Si no tenim ubicació d'usuari, centrar a la ruta
        if (!userLocation) {
          const group = new L.featureGroup([routePolylineRef.current]);
          map.fitBounds(group.getBounds(), { 
            padding: [20, 20],
            maxZoom: 16 
          });
        }
        
      } catch (error) {
        console.error('❌ Error carregant ruta:', error);
      }
    }
  }, [mapReady, currentRoute]);

  // Forçar resize i configuració inicial quan el component es munta
  useEffect(() => {
    if (mapReady && mapInstanceRef.current) {
      const timer = setTimeout(() => {
        mapInstanceRef.current.invalidateSize();
        
        // Configurar transformOrigin després de la inicialització
        const mapContainer = mapContainerRef.current;
        const mapPane = mapInstanceRef.current.getPanes().mapPane;
        
        mapContainer.style.overflow = 'hidden';
        mapPane.style.transformOrigin = 'center center';
        
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [mapReady]);

  // Bucle d'animació per rotació suau contínua
  useEffect(() => {
    if (!mapReady) return;
    
    let animationFrame;
    
    const animate = () => {
      if (showUserDirection && currentBearingRef.current !== smoothBearingRef.current) {
        const diff = Math.abs(currentBearingRef.current - smoothBearingRef.current);
        if (diff > 0.1) { // Només animar si hi ha diferència significativa
          rotateMap(currentBearingRef.current);
        }
      }
      animationFrame = requestAnimationFrame(animate);
    };
    
    animationFrame = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [mapReady, showUserDirection]);

  return (
    <>
      {/* Contenidor del mapa amb rotació */}
      <div 
        className="bike-map-container-rotating"
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
            height: '100%',
            borderRadius: '0.5rem'
          }}
        />
        
        {/* Indicador de càrrega */}
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2"></div>
              <p className="text-sm text-gray-600">Carregant mapa GPS...</p>
            </div>
          </div>
        )}
        
        {/* Compassos fix (sempre apunta al nord) */}
        {mapReady && (
          <div 
            className="absolute top-3 left-3 w-12 h-12 bg-white bg-opacity-90 rounded-full shadow-lg flex items-center justify-center"
            style={{
              transform: `rotate(${smoothBearingRef.current}deg)`,
              transition: 'transform 0.3s ease-out'
            }}
            title={`Nord: ${Math.round(smoothBearingRef.current)}°`}
          >
            <div className="text-red-600 font-bold text-lg">N</div>
          </div>
        )}
        
        {/* Velocitat i direcció info */}
        {userLocation && (
          <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-xs px-3 py-2 rounded-lg">
            <div className="text-center">
              <div>📍 {userLocation.latitude.toFixed(5)}</div>
              <div>📍 {userLocation.longitude.toFixed(5)}</div>
              {userLocation.speed !== null && userLocation.speed >= 0 && (
                <div>🚴 {Math.round(userLocation.speed * 3.6)} km/h</div>
              )}
              {userLocation.heading !== null && (
                <div>🧭 {Math.round(userLocation.heading)}°</div>
              )}
              <div className="text-green-400">±{Math.round(userLocation.accuracy)}m</div>
            </div>
          </div>
        )}
        
        {/* Punt central fix (opcional, per debug) */}
        {process.env.NODE_ENV === 'development' && (
          <div 
            className="absolute top-1/2 left-1/2 w-1 h-1 bg-red-500 rounded-full z-50"
            style={{ transform: 'translate(-50%, -50%)' }}
            title="Centre del mapa"
          />
        )}
      </div>
      
      {/* Estils CSS específics per mapa rotatiu */}
      <style jsx>{`
        .user-location-marker-fixed {
          background: none;
          border: none;
        }
        
        .user-marker-container-fixed {
          position: relative;
          width: 24px;
          height: 24px;
        }
        
        .user-marker-dot-fixed {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 14px;
          height: 14px;
          background: #4285f4;
          border: 3px solid white;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          box-shadow: 0 3px 8px rgba(0,0,0,0.4);
        }
        
        .user-marker-arrow-fixed {
          position: absolute;
          top: -3px;
          left: 50%;
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-bottom: 16px solid #4285f4;
          transform: translateX(-50%);
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        }
        
        /* Millorar els controls quan roten */
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 3px 12px rgba(0,0,0,0.2) !important;
          border-radius: 8px !important;
          overflow: hidden;
        }
        
        .leaflet-control-zoom a {
          background-color: white !important;
          border: none !important;
          color: #333 !important;
          width: 36px !important;
          height: 36px !important;
          line-height: 34px !important;
          font-size: 18px !important;
          font-weight: bold !important;
        }
        
        .leaflet-control-zoom a:hover {
          background-color: #f0f0f0 !important;
        }
        
        /* Assegurar que el mapa no es desborda */
        .leaflet-container {
          background-color: #e5e7eb;
          font-family: inherit;
        }
        
        .leaflet-pane {
          z-index: auto;
        }
        
        .leaflet-map-pane {
          will-change: transform;
        }
        
        /* Evitar que elements surtin del contenidor */
        .bike-map-container-rotating {
          contain: layout style paint;
        }
      `}</style>
    </>
  );
};

export default BikeMap;
