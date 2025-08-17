import React, { useState, useEffect } from 'react';

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
  console.log('🚀 BikeGPSApp renderitzant...');

  // Auth state
  const {
    currentUser,
    isAdmin,
    isSuperAdmin,
    loading: authLoading,
    error: authError,
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
    loading: dataLoading,
    error: dataError,
    loadAllUsers,
    makeUserAdmin,
    deleteRoute,
    resolveIncident,
    refreshData
  } = useFirebaseListeners(currentUser, isAdmin, isSuperAdmin, mapInstanceRef);

  // UI state
  const [authTab, setAuthTab] = useState('login');
  const [notification, setNotification] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [followUser, setFollowUser] = useState(true);
  const [rotateMap, setRotateMap] = useState(true);
  const [mapControlsExpanded, setMapControlsExpanded] = useState(false);
  const [debugInfo, setDebugInfo] = useState({});

  // Debug: Log dels estats
  useEffect(() => {
    console.log('📊 Estats actualitzats:', {
      currentUser: currentUser?.email,
      isAdmin,
      isSuperAdmin,
      authLoading,
      dataLoading,
      routesCount: routes?.length,
      usersCount: users?.length,
      incidentsCount: incidents?.length,
      authError,
      dataError
    });
  }, [currentUser, isAdmin, isSuperAdmin, authLoading, dataLoading, routes, users, incidents, authError, dataError]);

  // Debug info actualitzada
  useEffect(() => {
    const info = {
      // Estat d'autenticació
      user: currentUser?.email || 'No autenticat',
      isAdmin: isAdmin ? '✅' : '❌',
      isSuperAdmin: isSuperAdmin ? '✅' : '❌',
      
      // Estats de càrrega
      authLoading: authLoading ? '⏳' : '✅',
      dataLoading: dataLoading ? '⏳' : '✅',
      
      // Dades
      routes: routes?.length || 0,
      activeUsers: users?.length || 0,
      allUsers: allUsers?.length || 0,
      incidents: incidents?.length || 0,
      
      // Ubicació
      userLocation: userLocation ? '📍' : '❌',
      isTracking: isTracking ? '✅' : '❌',
      locationError: locationError || 'Cap',
      
      // Ruta actual
      currentRoute: currentRoute?.name || 'Cap',
      
      // Errors
      authError: authError || 'Cap',
      dataError: dataError || 'Cap'
    };
    
    setDebugInfo(info);
  }, [
    currentUser, isAdmin, isSuperAdmin, authLoading, dataLoading,
    routes, users, allUsers, incidents, userLocation, isTracking,
    locationError, currentRoute, authError, dataError
  ]);

  // Initialize location tracking when user logs in
  useEffect(() => {
    if (currentUser && !isTracking) {
      console.log('📍 Iniciant seguiment ubicació per:', currentUser.email);
      startLocationTracking();
    }
  }, [currentUser, isTracking, startLocationTracking]);

  // Refresh data periodically
  useEffect(() => {
    if (currentUser && refreshData) {
      console.log('⏰ Configurant refresc automàtic de dades');
      const interval = setInterval(() => {
        console.log('🔄 Refrescant dades automàticament...');
        refreshData();
      }, 30000); // Every 30 seconds

      return () => {
        console.log('🛑 Desactivant refresc automàtic');
        clearInterval(interval);
      };
    }
  }, [currentUser, refreshData]);

  // Show authentication errors
  useEffect(() => {
    if (authError) {
      console.error('❌ Error d\'autenticació:', authError);
      showNotification(`Error d'autenticació: ${authError}`, 'error', setNotification);
    }
  }, [authError]);

  // Show data errors
  useEffect(() => {
    if (dataError) {
      console.error('❌ Error de dades:', dataError);
      showNotification(`Error carregant dades: ${dataError}`, 'error', setNotification);
    }
  }, [dataError]);

  // Route creation handler
  const handleCreateRoute = async (e) => {
    e.preventDefault();
    console.log('📤 Iniciant creació de ruta...');
    
    const formData = new FormData(e.target);
    const name = formData.get('routeName')?.trim();
    const description = formData.get('routeDescription')?.trim();
    const gpxFile = formData.get('gpxFile');
    
    // Validations
    if (!name) {
      showNotification('El nom de la ruta és obligatori', 'error', setNotification);
      return;
    }
    
    if (!gpxFile) {
      showNotification('Selecciona un arxiu GPX', 'error', setNotification);
      return;
    }

    if (!gpxFile.name.toLowerCase().endsWith('.gpx')) {
      showNotification('L\'arxiu ha de ser un fitxer GPX', 'error', setNotification);
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

      if (coordinates.length < 2) {
        throw new Error('El GPX ha de contenir almenys 2 punts per formar una ruta');
      }
      
      const routeData = {
        name,
        description: description || 'Sense descripció',
        coordinates,
        createdBy: currentUser.uid,
        createdByName: currentUser.displayName || currentUser.email || 'Usuari',
        gpxFileName: gpxFile.name,
        pointsCount: coordinates.length,
        deleted: false,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      console.log('💾 Guardant ruta amb dades:', routeData);
      const docRef = await addDoc(collection(db, 'routes'), routeData);
      console.log('✅ Ruta guardada amb ID:', docRef.id);

      setUploadProgress(100);
      showNotification(`✅ Ruta "${name}" creada correctament amb ${coordinates.length} punts!`, 'success', setNotification);

      // Reset form
      e.target.reset();
      
      // Refresh data
      if (refreshData) {
        setTimeout(() => {
          console.log('🔄 Refrescant dades després de crear ruta...');
          refreshData();
        }, 1000);
      }

      setTimeout(() => {
        setShowUploadProgress(false);
        setUploadProgress(0);
      }, 2000);

    } catch (error) {
      setShowUploadProgress(false);
      setUploadProgress(0);
      console.error('❌ Error creant ruta:', error);
      showNotification('Error creant ruta: ' + error.message, 'error', setNotification);
    }
  };

  // Incident reporting
  const reportIncident = async () => {
    console.log('🚨 Iniciant report d\'incidència...');
    const message = prompt('Descriu la incidència (opcional):');
    
    try {
      let location;
      
      try {
        location = await getCurrentLocation();
        console.log('📍 Ubicació obtinguda per incidència:', location);
      } catch (locationError) {
        console.warn('⚠️ No s\'ha pogut obtenir ubicació actual, usant ubicació coneguda');
        location = userLocation || {
          latitude: 41.6722,
          longitude: 2.4540
        };
      }
      
      const incidentData = {
        userName: currentUser.displayName || currentUser.email || 'Usuari Anònim',
        userEmail: currentUser.email || '',
        message: message || 'Incidència reportada sense missatge',
        location,
        timestamp: serverTimestamp(),
        resolved: false,
        reportedBy: currentUser.uid,
        type: 'user_report'
      };
      
      console.log('💾 Guardant incidència:', incidentData);
      const docRef = await addDoc(collection(db, 'incidents'), incidentData);
      console.log('✅ Incidència guardada amb ID:', docRef.id);
      
      showNotification('🚨 Incidència reportada! Els administradors han estat notificats.', 'success', setNotification);
      
      // Refresh data
      if (refreshData) {
        setTimeout(() => {
          console.log('🔄 Refrescant dades després de reportar incidència...');
          refreshData();
        }, 1000);
      }
      
    } catch (error) {
      console.error('❌ Error reportant incidència:', error);
      showNotification('❌ Error reportant incidència: ' + error.message, 'error', setNotification);
    }
  };

  // Enhanced debug panel
  const DebugPanel = () => {
    if (!isAdmin && !import.meta.env.DEV) return null;
    
    return (
      <div className="fixed bottom-4 left-4 bg-black bg-opacity-90 text-white p-4 rounded-lg text-xs max-w-sm z-50 font-mono">
        <div className="font-bold mb-3 text-yellow-400">🐛 Debug Panel</div>
        
        <div className="space-y-1">
          <div><span className="text-blue-300">Usuari:</span> {debugInfo.user}</div>
          <div><span className="text-blue-300">Admin:</span> {debugInfo.isAdmin}</div>
          <div><span className="text-blue-300">Super Admin:</span> {debugInfo.isSuperAdmin}</div>
        </div>

        <div className="border-t border-gray-600 my-2"></div>
        
        <div className="space-y-1">
          <div><span className="text-green-300">Auth Loading:</span> {debugInfo.authLoading}</div>
          <div><span className="text-green-300">Data Loading:</span> {debugInfo.dataLoading}</div>
        </div>

        <div className="border-t border-gray-600 my-2"></div>
        
        <div className="space-y-1">
          <div><span className="text-purple-300">Rutes:</span> {debugInfo.routes}</div>
          <div><span className="text-purple-300">Usuaris Actius:</span> {debugInfo.activeUsers}</div>
          <div><span className="text-purple-300">Tots Usuaris:</span> {debugInfo.allUsers}</div>
          <div><span className="text-purple-300">Incidències:</span> {debugInfo.incidents}</div>
        </div>

        <div className="border-t border-gray-600 my-2"></div>
        
        <div className="space-y-1">
          <div><span className="text-orange-300">Ubicació:</span> {debugInfo.userLocation}</div>
          <div><span className="text-orange-300">Seguiment:</span> {debugInfo.isTracking}</div>
          <div><span className="text-orange-300">Ruta:</span> {debugInfo.currentRoute}</div>
        </div>

        {(debugInfo.authError !== 'Cap' || debugInfo.dataError !== 'Cap') && (
          <>
            <div className="border-t border-gray-600 my-2"></div>
            <div className="space-y-1 text-red-300">
              {debugInfo.authError !== 'Cap' && <div>Auth Error: {debugInfo.authError}</div>}
              {debugInfo.dataError !== 'Cap' && <div>Data Error: {debugInfo.dataError}</div>}
            </div>
          </>
        )}

        <div className="border-t border-gray-600 my-2"></div>
        <button 
          onClick={() => refreshData && refreshData()}
          className="bg-blue-600 px-2 py-1 rounded text-xs hover:bg-blue-700"
        >
          🔄 Refresh Data
        </button>
      </div>
    );
  };

  // Loading screen
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background: '#f0f0f3'}}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-300 border-t-yellow-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xl text-gray-700 mb-2">Inicialitzant BikeGPS...</p>
          <p className="text-sm text-gray-500">Connectant amb Firebase...</p>
          {authError && (
            <p className="text-red-500 text-sm mt-2">Error: {authError}</p>
          )}
        </div>
      </div>
    );
  }

  // Auth screen
  if (!currentUser) {
    return (
      <>
        <AuthScreen
          authTab={authTab}
          setAuthTab={setAuthTab}
          handleLogin={handleLogin}
          handleRegister={handleRegister}
          notification={notification}
        />
        <DebugPanel />
      </>
    );
  }

  // Data loading screen (after auth)
  if (dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background: '#f0f0f3'}}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-300 border-t-blue-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xl text-gray-700 mb-2">Carregant dades...</p>
          <p className="text-sm text-gray-500">Sincronitzant amb Firebase...</p>
          <p className="text-xs text-gray-400 mt-2">Usuari: {currentUser.email}</p>
        </div>
      </div>
    );
  }

  // Admin dashboard
  if (isAdmin) {
    return (
      <>
        <AdminDashboard
          currentUser={currentUser}
          isSuperAdmin={isSuperAdmin}
          routes={routes || []}
          users={users || []}
          incidents={incidents || []}
          allUsers={allUsers || []}
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
          refreshData={refreshData}
        />
        <DebugPanel />
      </>
    );
  }

  // User dashboard
  return (
    <>
      <UserDashboard
        currentUser={currentUser}
        routes={routes || []}
        users={users || []}
        incidents={incidents || []}
        currentRoute={currentRoute}
        routeProgress={routeProgress}
        isReturning={isReturning}
        selectRoute={selectRoute}
        reportIncident={reportIncident}
        handleLogout={handleLogout}
        mapInstanceRef={mapInstanceRef}
        userLocation={userLocation}
        notification={notification}
        refreshData={refreshData}
      />
      <DebugPanel />
    </>
  );
};

export default BikeGPSApp;
