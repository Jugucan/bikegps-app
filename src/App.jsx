import React, { useState, useEffect } from 'react';
import 'leaflet/dist/leaflet.css';

// Firebase imports
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

// Components
import AuthScreen from './components/AuthScreen';
import BikeMap from './components/BikeMap';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useMap } from './hooks/useMap';
import { useLocation } from './hooks/useLocation';
import { useFirebaseListeners } from './hooks/useFirebaseListeners';

// Utils
import { showNotification } from './utils/mapUtils';
import { parseGPX } from './utils/gpxUtils';

// Firebase Configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const SUPER_ADMIN_UID = 's1UefGdgQphElib4KWmDsQj1uor2';

const BikeGPSApp = () => {
  // Auth state
  const {
    currentUser,
    isAdmin,
    isSuperAdmin,
    loading,
    handleLogin,
    handleRegister,
    handleLogout
  } = useAuth(SUPER_ADMIN_UID);

  // Map state
  const {
    mapInstanceRef,
    currentRoute,
    selectRoute,
    routeProgress,
    isReturning
  } = useMap();

  // Location tracking
  const {
    userLocation,
    locationError,
    isTracking,
    startLocationTracking,
    getCurrentLocation
  } = useLocation(currentUser);

  // Firebase listeners
  const {
    routes,
    users,
    incidents,
    deleteRoute,
    resolveIncident
  } = useFirebaseListeners(currentUser, isAdmin, isSuperAdmin, mapInstanceRef);

  // UI state
  const [authTab, setAuthTab] = useState('login');
  const [notification, setNotification] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [followUser, setFollowUser] = useState(true);
  const [mapControlsExpanded, setMapControlsExpanded] = useState(false);

  // Initialize location tracking when user logs in
  useEffect(() => {
    if (currentUser && !isTracking) {
      console.log('📍 Iniciant seguiment ubicació...');
      startLocationTracking();
    }
  }, [currentUser, isTracking, startLocationTracking]);

  // Route creation handler
  const handleCreateRoute = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const name = formData.get('routeName');
    const description = formData.get('routeDescription');
    const gpxFile = formData.get('gpxFile');
    
    if (!gpxFile) {
      showNotification('Selecciona un arxiu GPX', 'error', setNotification);
      return;
    }

    try {
      setShowUploadProgress(true);
      setUploadProgress(20);

      const gpxText = await gpxFile.text();
      setUploadProgress(50);
      
      const coordinates = parseGPX(gpxText);
      setUploadProgress(80);
      
      if (coordinates.length === 0) {
        throw new Error('No s\'han trobat coordenades vàlides al GPX');
      }
      
      const routeData = {
        name: name,
        description: description,
        coordinates: coordinates,
        createdBy: currentUser.uid,
        gpxFileName: gpxFile.name,
        pointsCount: coordinates.length,
        deleted: false,
        createdAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, 'routes'), routeData);
      console.log('✅ Ruta guardada amb ID:', docRef.id);

      setUploadProgress(100);
      showNotification(`✅ Ruta "${name}" creada correctament amb ${coordinates.length} punts!`, 'success', setNotification);

      e.target.reset();
      setTimeout(() => {
        setShowUploadProgress(false);
        setUploadProgress(0);
      }, 1000);

    } catch (error) {
      setShowUploadProgress(false);
      setUploadProgress(0);
      console.error('Error creating route:', error);
      showNotification('Error creant ruta: ' + error.message, 'error', setNotification);
    }
  };

  // Incident reporting
  const reportIncident = async () => {
    const message = prompt('Descriu la incidència (opcional):');
    
    try {
      console.log('🚨 Reportant incidència...');
      
      const location = await getCurrentLocation();
      
      const incidentData = {
        userName: currentUser.displayName || currentUser.email || 'Usuari Anònim',
        message: message || 'Incidència reportada sense missatge',
        location: location,
        timestamp: serverTimestamp(),
        resolved: false,
        reportedBy: currentUser.uid
      };
      
      await addDoc(collection(db, 'incidents'), incidentData);
      showNotification('🚨 Incidència reportada! Els administradors han estat notificats.', 'success', setNotification);
      
    } catch (error) {
      console.error('Error reporting incident:', error);
      
      // Fallback amb ubicació actual coneguda
      const fallbackLocation = userLocation || {
        latitude: 41.6722,
        longitude: 2.4540
      };
      
      const incidentData = {
        userName: currentUser.displayName || currentUser.email || 'Usuari Anònim',
        message: (message || 'Incidència reportada sense missatge') + ' (ubicació aproximada)',
        location: fallbackLocation,
        timestamp: serverTimestamp(),
        resolved: false,
        reportedBy: currentUser.uid
      };
      
      try {
        await addDoc(collection(db, 'incidents'), incidentData);
        showNotification('🚨 Incidència reportada amb ubicació aproximada!', 'success', setNotification);
      } catch (fallbackError) {
        showNotification('❌ Error reportant incidència', 'error', setNotification);
      }
    }
  };

  // Loading screen
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background: '#f0f0f3'}}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-yellow-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-gray-700">Inicialitzant BikeGPS...</p>
        </div>
      </div>
    );
  }

  // Auth screen
  if (!currentUser) {
    return (
      <AuthScreen
        authTab={authTab}
        setAuthTab={setAuthTab}
        handleLogin={handleLogin}
        handleRegister={handleRegister}
        notification={notification}
      />
    );
  }

  // Main app interface (versió temporal millorada)
  return (
    <div className="min-h-screen" style={{background: '#f0f0f3'}}>
      <div className="container mx-auto px-4 py-4 max-w-4xl">
        
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl md:text-2xl font-bold">
              <span style={{color: '#ffd02e'}}>Bike</span>
              <span style={{color: '#1a1a1a'}}>GPS</span>
            </h1>
            
            <div className="flex items-center gap-2">
              {/* Status de tracking */}
              <div className={`w-3 h-3 rounded-full ${isTracking ? 'bg-green-400' : 'bg-gray-400'}`} 
                   title={isTracking ? 'GPS actiu' : 'GPS inactiu'}>
              </div>
              
              <button
                onClick={handleLogout}
                className="px-3 py-1 md:px-4 md:py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
              >
                Sortir
              </button>
            </div>
          </div>
          
          {/* User info */}
          <div className="mt-2 text-sm text-gray-600">
            Benvingut/da, {currentUser.email} 
            {isAdmin && <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">Admin</span>}
            {locationError && <span className="ml-2 text-red-500">⚠ {locationError}</span>}
          </div>
        </div>

        {/* Map Container */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Mapa BikeGPS</h2>
            
            {/* Map controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFollowUser(!followUser)}
                className={`p-2 rounded-lg text-sm transition-colors ${
                  followUser 
                    ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                    : 'bg-gray-100 text-gray-600 border border-gray-300'
                }`}
                title={followUser ? 'Desactivar seguiment' : 'Activar seguiment'}
              >
                {followUser ? '📍' : '📍'}
              </button>
              
              <button
                onClick={() => setMapControlsExpanded(!mapControlsExpanded)}
                className="p-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors"
              >
                ⚙️
              </button>
            </div>
          </div>
          
          {/* Expanded map controls */}
          {mapControlsExpanded && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <div>
                  <strong>Ubicació:</strong><br/>
                  {userLocation ? (
                    <>
                      {userLocation.latitude.toFixed(6)}, {userLocation.longitude.toFixed(6)}<br/>
                      <span className="text-gray-500">±{Math.round(userLocation.accuracy)}m</span>
                      {userLocation.heading && (
                        <span className="text-blue-600"> →{Math.round(userLocation.heading)}°</span>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400">Cercant...</span>
                  )}
                </div>
                
                <div>
                  <strong>Ruta activa:</strong><br/>
                  {currentRoute ? (
                    <>
                      {currentRoute.name}<br/>
                      <span className="text-gray-500">{currentRoute.coordinates?.length || 0} punts</span>
                    </>
                  ) : (
                    <span className="text-gray-400">Cap ruta seleccionada</span>
                  )}
                </div>
                
                <div>
                  <strong>Estat:</strong><br/>
                  <span className={isTracking ? 'text-green-600' : 'text-red-600'}>
                    GPS {isTracking ? 'actiu' : 'inactiu'}
                  </span><br/>
                  <span className={followUser ? 'text-blue-600' : 'text-gray-500'}>
                    Seguiment {followUser ? 'activat' : 'desactivat'}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* BikeMap Component */}
          <BikeMap
            mapInstanceRef={mapInstanceRef}
            currentRoute={currentRoute}
            userLocation={userLocation}
            followUser={followUser}
            showUserDirection={true}
            mapHeight="400px"
          />
        </div>

        {/* Routes section */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <h2 className="text-lg font-semibold mb-3">Rutes disponibles</h2>
          
          {routes.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No hi ha rutes disponibles</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {routes.map((route) => (
                <div key={route.id} className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors">
                  <h3 className="font-medium mb-1">{route.name}</h3>
                  <p className="text-sm text-gray-600 mb-2 line-clamp-2">{route.description}</p>
                  <div className="text-xs text-gray-500 mb-3">
                    {route.pointsCount} punts • {route.gpxFileName}
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => selectRoute(route)}
                      className={`flex-1 py-1 px-2 text-sm rounded transition-colors ${
                        currentRoute?.id === route.id
                          ? 'bg-blue-500 text-white'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      }`}
                    >
                      {currentRoute?.id === route.id ? 'Seleccionada' : 'Seleccionar'}
                    </button>
                    
                    {isAdmin && (
                      <button
                        onClick={() => {
                          if (confirm(`Eliminar la ruta "${route.name}"?`)) {
                            deleteRoute(route.id);
                          }
                        }}
                        className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"
                        title="Eliminar ruta"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin section - Route creation */}
        {isAdmin && (
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <h2 className="text-lg font-semibold mb-3">Crear nova ruta</h2>
            
            <form onSubmit={handleCreateRoute} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom de la ruta
                </label>
                <input
                  type="text"
                  name="routeName"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ex: Ruta Costa Brava"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripció
                </label>
                <textarea
                  name="routeDescription"
                  rows="2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Descripció de la ruta..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Arxiu GPX
                </label>
                <input
                  type="file"
                  name="gpxFile"
                  accept=".gpx"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <button
                type="submit"
                disabled={showUploadProgress}
                className="w-full py-2 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {showUploadProgress ? `Pujant... ${uploadProgress}%` : 'Crear Ruta'}
              </button>
              
              {showUploadProgress && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </form>
          </div>
        )}

        {/* Incident reporting section */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <h2 className="text-lg font-semibold mb-3">Reportar incidència</h2>
          <p className="text-sm text-gray-600 mb-3">
            Reporta qualsevol problema o incidència durant la ruta.
          </p>
          
          <button
            onClick={reportIncident}
            className="w-full py-2 px-4 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            🚨 Reportar Incidència
          </button>
        </div>

        {/* Admin incidents section */}
        {isAdmin && incidents.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <h2 className="text-lg font-semibold mb-3">
              Incidències reportades ({incidents.filter(i => !i.resolved).length} pendents)
            </h2>
            
            <div className="space-y-3">
              {incidents.map((incident) => (
                <div 
                  key={incident.id} 
                  className={`border rounded-lg p-3 ${
                    incident.resolved ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <strong className="text-sm">{incident.userName}</strong>
                      <span className="text-xs text-gray-500 ml-2">
                        {incident.timestamp?.toDate?.()?.toLocaleString() || 'Data no disponible'}
                      </span>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${
                      incident.resolved 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                      {incident.resolved ? 'Resolta' : 'Pendent'}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-700 mb-2">{incident.message}</p>
                  
                  {incident.location && (
                    <p className="text-xs text-gray-500 mb-2">
                      📍 {incident.location.latitude?.toFixed(6)}, {incident.location.longitude?.toFixed(6)}
                    </p>
                  )}
                  
                  {!incident.resolved && (
                    <button
                      onClick={() => resolveIncident(incident.id)}
                      className="text-sm px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                    >
                      Marcar com resolta
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats section */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-lg font-semibold mb-3">Estadístiques</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{routes.length}</div>
              <div className="text-sm text-gray-600">Rutes</div>
            </div>
            
            <div>
              <div className="text-2xl font-bold text-green-600">{users.length}</div>
              <div className="text-sm text-gray-600">Usuaris connectats</div>
            </div>
            
            <div>
              <div className="text-2xl font-bold text-orange-600">
                {incidents.filter(i => !i.resolved).length}
              </div>
              <div className="text-sm text-gray-600">Incidències</div>
            </div>
            
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {userLocation?.accuracy ? `±${Math.round(userLocation.accuracy)}m` : '--'}
              </div>
              <div className="text-sm text-gray-600">Precisió GPS</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Notification system */}
      {notification && (
        <div className={`fixed top-4 right-4 p-4 rounded-lg text-white z-50 max-w-sm ${
          notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          <div className="flex justify-between items-start">
            <div className="flex-1 mr-2">{notification.message}</div>
            <button
              onClick={() => setNotification(null)}
              className="text-white hover:text-gray-200 font-bold text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BikeGPSApp;
