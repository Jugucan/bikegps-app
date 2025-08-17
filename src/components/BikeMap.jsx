import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapMarkers.css'; // Importem els estils dels marcadors

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
  
  // Inicialitzacio del mapa
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    try {
      console.log('🗺️ Inicialitzant BikeMap amb rotacio...');
      
      // Crear mapa amb configuracio optimitzada per rotacio
      const map = L.map(mapContainerRef.current, {
        center: [41.6722, 2.4540], // Calella per defecte
        zoom: 18, // Zoom proper per navegacio
        zoomControl: false, // El movem despres
        attributionControl: false,
        
        // Configuracio per rotacio suau
        preferCanvas: true,
        updateWhenZooming: false,
        updateWhenIdle: false,
        
        // Navegacio suau
        inertia: false,
        fadeAnimation: false,
        zoomAnimation: false,
        markerZoomAnimation: false,
        
        // Evitar desplaçaments accidentals
        touchZoom: true,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        dragging: false,
        keyboard: false,
        
        // Configuracio especifica per rotacio
        transform3DLimit: 2^23,
        worldCopyJump: false
      });
      
      // Afegir controls en posicio personalitzada
      L.control.zoom({
        position: 'bottomright'
      }).addTo(map);
      
      // Capa de teules optimitzada
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
        updateWhenIdle: false,
        updateWhenZooming: false,
        keepBuffer: 4,
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
      
      console.log('✅ BikeMap amb rotacio inicialitzat correctament');
      
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

  // Funcio per rotar el mapa suaument
  const rotateMap = (targetBearing) => {
    if (!mapInstanceRef.current) return;
    
    const map = mapInstanceRef.current;
    const mapPane = map.getPanes().mapPane;
    
    // Normalitzar l'angle
    const normalizedBearing = ((targetBearing % 360) + 360) % 360;
    const currentBearing = smoothBearingRef.current;
    
    // Calcular la diferencia mes curta entre angles
    let diff = normalizedBearing - currentBearing;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    
    // Interpolacio suau
    const newBearing = currentBearing + diff * 0.15;
    smoothBearingRef.current = newBearing;
    
    // Aplicar rotacio al mapPane
    mapPane.style.transform = `rotate(${-newBearing}deg)`;
    
    // També rotar els controls per mantenir-los llegibles
    const controls = mapContainerRef.current.querySelectorAll('.leaflet-control');
    controls.forEach(control => {
      control.style.transform = `rotate(${newBearing}deg)`;
    });
  };

  // Gestio de la ubicacio de l'usuari amb centrat i rotacio
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !userLocation) return;
    
    const now = Date.now();
    // Throttling mes frequent per rotacio suau
    if (now - lastUpdateRef.current < 500) return;
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
        // Actualitzar posicio
        userMarkerRef.current.setLatLng([latitude, longitude]);
      }
      
      // SEMPRE centrar el mapa a la posicio de l'usuari
      if (followUser) {
        map.setView([latitude, longitude], map.getZoom(), {
          animate: false
        });
      }
      
      // Rotar el mapa basant-se en la direccio de l'usuari
      if (showUserDirection && heading !== undefined && heading !== null) {
        currentBearingRef.current = heading;
        rotateMap(heading);
      }
      
    } catch (error) {
      console.error('❌ Error actualitzant ubicacio usuari:', error);
    }
  }, [mapReady, userLocation, followUser, showUserDirection]);

  // Gestio de la ruta actual (amb rotacio)
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
        
        // Si no tenim ubicacio d'usuari, centrar a la ruta
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

  // Forçar resize i configuracio inicial quan el component es munta
  useEffect(() => {
    if (mapReady && mapInstanceRef.current) {
      const timer = setTimeout(() => {
        mapInstanceRef.current.invalidateSize();
        
        // Configurar transformOrigin despres de la inicialitzacio
        const mapContainer = mapContainerRef.current;
        const mapPane = mapInstanceRef.current.getPanes().mapPane;
        
        mapContainer.style.overflow = 'hidden';
        mapPane.style.transformOrigin = 'center center';
        
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [mapReady]);

  // Bucle d'animacio per rotacio suau continua
  useEffect(() => {
    if (!mapReady) return;
    
    let animationFrame;
    
    const animate = () => {
      if (showUserDirection && currentBearingRef.current !== smoothBearingRef.current) {
        const diff = Math.abs(currentBearingRef.current - smoothBearingRef.current);
        if (diff > 0.1) {
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

  // Funcion per recentrar el mapa manualment
  const recenterMap = () => {
    if (mapInstanceRef.current && userLocation) {
      mapInstanceRef.current.setView([userLocation.latitude, userLocation.longitude], 18, {
        animate: true
      });
    }
  };

  // Funcion per alternar seguiment
  const toggleFollowUser = () => {
    // Aquesta funció es pot usar des del component pare
    return !followUser;
  };

  return (
    <>
      {/* Contenidor del mapa amb rotacio */}
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
        
        {/* Indicador de carrega */}
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2"></div>
              <p className="text-sm text-gray-600">Carregant mapa GPS...</p>
            </div>
          </div>
        )}
        
        {/* Controls personalitzats */}
        {mapReady && (
          <>
            {/* Compassos fix (sempre apunta al nord) */}
            <div 
              className="absolute top-3 left-3 w-12 h-12 bg-white bg-opacity-90 rounded-full shadow-lg flex items-center justify-content center cursor-pointer hover:bg-opacity-100 transition-all"
              style={{
                transform: `rotate(${smoothBearingRef.current}deg)`,
                transition: 'transform 0.3s ease-out'
              }}
              title={`Nord: ${Math.round(smoothBearingRef.current)}°`}
              onClick={() => {
                // Reset rotacio
                currentBearingRef.current = 0;
                smoothBearingRef.current = 0;
                rotateMap(0);
              }}
            >
              <div className="text-red-600 font-bold text-lg">N</div>
            </div>

            {/* Boto per recentrar */}
            {userLocation && (
              <button
                onClick={recenterMap}
                className="absolute top-3 right-3 w-10 h-10 bg-white bg-opacity-90 rounded-full shadow-lg flex items-center justify-center hover:bg-opacity-100 transition-all text-blue-600"
                title="Recentrar al meu ubicació"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
              </button>
            )}
          </>
        )}
        
        {/* Informacio de velocitat i direccio */}
        {userLocation && (
          <div className="absolute bottom-3 left-3 bg-black bg-opacity-70 text-white text-xs px-3 py-2 rounded-lg">
            <div className="text-center space-y-1">
              <div className="flex items-center space-x-1">
                <span>📍</span>
                <span>{userLocation.latitude.toFixed(5)}, {userLocation.longitude.toFixed(5)}</span>
              </div>
              {userLocation.speed !== null && userLocation.speed >= 0 && (
                <div className="flex items-center space-x-1">
                  <span>🚴</span>
                  <span>{Math.round(userLocation.speed * 3.6)} km/h</span>
                </div>
              )}
              {userLocation.heading !== null && (
                <div className="flex items-center space-x-1">
                  <span>🧭</span>
                  <span>{Math.round(userLocation.heading)}°</span>
                </div>
              )}
              <div className="flex items-center space-x-1">
                <span className="text-green-400">📡</span>
                <span className="text-green-400">±{Math.round(userLocation.accuracy)}m</span>
              </div>
            </div>
          </div>
        )}

        {/* Status de seguiment */}
        <div className="absolute bottom-3 right-3 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
          {followUser ? (
            <span className="text-green-400">🎯 Seguint</span>
          ) : (
            <span className="text-yellow-400">👁️ Lliure</span>
          )}
        </div>
        
        {/* Punt central fix (per debug) */}
        {process.env.NODE_ENV === 'development' && (
          <div 
            className="absolute top-1/2 left-1/2 w-1 h-1 bg-red-500 rounded-full z-50 pointer-events-none"
            style={{ transform: 'translate(-50%, -50%)' }}
            title="Centre del mapa"
          />
        )}
      </div>
      
      {/* Estils CSS especifics per mapa rotatiu */}
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
          transition: background-color 0.2s ease;
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

        /* Animacions suaus per controls */
        .absolute button, .absolute div {
          transition: all 0.2s ease;
        }

        .absolute button:hover {
          transform: scale(1.05);
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          .absolute.bottom-3.left-3 {
            font-size: 10px;
            padding: 6px 8px;
          }
          
          .absolute.top-3.left-3,
          .absolute.top-3.right-3 {
            width: 40px;
            height: 40px;
          }
        }
      `}</style>
    </>
  );
};

export default BikeMap;
