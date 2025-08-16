import React, { useState, useEffect } from 'react';
import 'leaflet/dist/leaflet.css';

// Firebase imports
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

// Components
import AuthScreen from './components/AuthScreen';
import BikeMap from './components/BikeMap';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';

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
    allUsers,
    loadAllUsers,
    makeUserAdmin,
    deleteRoute,
    resolveIncident
  } = useFirebaseListeners(currentUser, isAdmin, isSuperAdmin, mapInstanceRef);

  // UI state
  const [authTab, setAuthTab] = useState('login');
  const [notification, setNotification] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [followUser, setFollowUser] = useState(true);
  const [rotateMap, setRotateMap] = useState(true); // Nova opció
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

  // Admin dashboard
  if (isAdmin) {
    return (
      <AdminDashboard
        currentUser={currentUser}
        isSuperAdmin={isSuperAdmin}
        routes={routes}
        users={users}
        incidents={incidents}
        allUsers={allUsers}
        currentRoute={currentRoute}
        showUploadProgress={showUploadProgress}
        uploadProgress={uploadProgress}
        handleCreateRoute={handleCreateRoute}
        selectRoute={selectRoute}
        deleteRoute={deleteRoute}
        resolveIncident={resolveIncident}
        loadAllUsers={loadAllUsers}
        makeUserAdmin={makeUserAdmin}
        handleLogout={handleLogout}
        mapInstanceRef={mapInstanceRef}
        userLocation={userLocation}
        notification={notification}
      />
    );
  }

  // User dashboard
  return (
    <UserDashboard
      currentUser={currentUser}
      routes={routes}
      users={users}
      incidents={incidents}
      currentRoute={currentRoute}
      routeProgress={routeProgress}
      isReturning={isReturning}
      selectRoute={selectRoute}
      reportIncident={reportIncident}
      handleLogout={handleLogout}
      mapInstanceRef={mapInstanceRef}
      userLocation={userLocation}
      notification={notification}
    />
  );route.description}</p>
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
