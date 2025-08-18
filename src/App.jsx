import React, { useState, useEffect, useCallback, useMemo } from 'react';

// Firebase imports
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';

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

  // Location tracking - només inicialitzar quan tenim usuari
  const {
    userLocation,
    locationError,
    isTracking,
    startLocationTracking,
    getCurrentLocation
  } = useLocation(currentUser);

  // Firebase listeners - CORRECCIÓ: Simplificar i assegurar que funciona
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
  } = useFirebaseListeners(currentUser, isAdmin, isSuperAdmin);

  // UI state
  const [authTab, setAuthTab] = useState('login');
  const [notification, setNotification] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [initializationComplete, setInitializationComplete] = useState(false);

  // CORRECCIÓ: Assegurar que l'usuari es registra correctament a Firestore
  const ensureUserRegistered = useCallback(async (user) => {
    if (!user) return;
    
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0] || 'Usuari',
        lastSeen: serverTimestamp(),
        isOnline: true,
        createdAt: serverTimestamp()
      }, { merge: true });
      
      console.log('✅ Usuari registrat/actualitzat a Firestore:', user.email);
      
      // CORRECCIÓ: També actualitzar userLocations per ser visible en el mapa
      if (userLocation) {
        const locationRef = doc(db, 'userLocations', user.uid);
        await setDoc(locationRef, {
          userId: user.uid,
          userName: user.displayName || user.email?.split('@')[0] || 'Usuari',
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          timestamp: serverTimestamp()
        }, { merge: true });
      }
    } catch (error) {
      console.error('❌ Error registrant usuari a Firestore:', error);
    }
  }, [userLocation]);

  // CORRECCIÓ: Registrar usuari quan es connecta
  useEffect(() => {
    if (currentUser && !authLoading) {
      ensureUserRegistered(currentUser);
    }
  }, [currentUser, authLoading, ensureUserRegistered]);

  // Memoitzar les funcions per evitar re-renders
  const handleCreateRoute = useCallback(async (e) => {
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
      
      // CORRECCIÓ: Assegurar format consistent de coordenades
      const coordinateObjects = coordinates.map(coord => {
        if (Array.isArray(coord)) {
          return { lat: coord[0], lng: coord[1] };
        }
        return coord; // ja està en format {lat, lng}
      });
      
      const routeData = {
        name,
        description: description || 'Sense descripció',
        coordinates: coordinateObjects,
        createdBy: currentUser.uid,
        createdByName: currentUser.displayName || currentUser.email || 'Usuari',
        gpxFileName: gpxFile.name,
        pointsCount: coordinateObjects.length,
        deleted: false,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      console.log('💾 Guardant ruta amb dades:', routeData);
      const docRef = await addDoc(collection(db, 'routes'), routeData);
      console.log('✅ Ruta guardada amb ID:', docRef.id);

      setUploadProgress(100);
      showNotification(`✅ Ruta "${name}" creada correctament amb ${coordinateObjects.length} punts!`, 'success', setNotification);

      // Reset form
      e.target.reset();
      
      // Refresh data després d'un petit delay
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
  }, [currentUser, refreshData]);

  // Incident reporting
  const reportIncident = useCallback(async () => {
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
        userId: currentUser.uid,
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
  }, [currentUser, getCurrentLocation, userLocation, refreshData]);

  // Debug info memoitzat
  const debugInfo = useMemo(() => ({
    // Estat d'autenticació
    user: currentUser?.email || 'No autenticat',
    isAdmin: isAdmin ? '✅' : '❌',
    isSuperAdmin: isSuperAdmin ? '✅' : '❌',
    
    // Estats de càrrega
    authLoading: authLoading ? '⏳' : '✅',
    dataLoading: dataLoading ? '⏳' : '✅',
    
    // Dades - CORRECCIÓ: Verificar si són arrays vàlids
    routes: (routes && Array.isArray(routes)) ? routes.length : 0,
    activeUsers: (users && Array.isArray(users)) ? users.length : 0,
    allUsers: (allUsers && Array.isArray(allUsers)) ? allUsers.length : 0,
    incidents: (incidents && Array.isArray(incidents)) ? incidents.length : 0,
    
    // Ubicació
    userLocation: userLocation ? '📍' : '❌',
    isTracking: isTracking ? '✅' : '❌',
    locationError: locationError || 'Cap',
    
    // Ruta actual
    currentRoute: currentRoute?.name || 'Cap',
    
    // Errors
    authError: authError || 'Cap',
    dataError: dataError || 'Cap'
  }), [currentUser, isAdmin, isSuperAdmin, authLoading, dataLoading, routes, users, allUsers, incidents, userLocation, isTracking, locationError, currentRoute, authError, dataError]);

  // Log dels estats només quan canvien significativament
  useEffect(() => {
    console.log('📊 Estats actualitzats:', {
      currentUser: currentUser?.email,
      isAdmin,
      isSuperAdmin,
      authLoading,
      dataLoading,
      routesCount: (routes && Array.isArray(routes)) ? routes.length : 0,
      usersCount: (users && Array.isArray(users)) ? users.length : 0,
      incidentsCount: (incidents && Array.isArray(incidents)) ? incidents.length : 0,
      authError,
      dataError
    });
  }, [currentUser?.uid, isAdmin, isSuperAdmin, authLoading, dataLoading, routes?.length, users?.length, incidents?.length]);

  // Initialize location tracking quan l'usuari es connecta
  useEffect(() => {
    if (currentUser && !isTracking && !authLoading) {
      console.log('📍 Iniciant seguiment ubicació per:', currentUser.email);
      startLocationTracking();
    }
  }, [currentUser?.uid, authLoading, isTracking, startLocationTracking]);

  // CORRECCIÓ: Millor gestió del cicle d'inicialització
  useEffect(() => {
    if (currentUser && !authLoading && !dataLoading) {
      if (!initializationComplete) {
        console.log('🎯 Inicialització completa');
        setInitializationComplete(true);
      }
    }
  }, [currentUser, authLoading, dataLoading, initializationComplete]);

  // Refresh automàtic OPTIMITZAT
  useEffect(() => {
    if (!initializationComplete || !refreshData) return;

    console.log('⏰ Configurant refresc automàtic de dades');
    const interval = setInterval(() => {
      console.log('🔄 Refrescant dades automàticament...');
      refreshData();
    }, 30000); // Every 30 seconds

    return () => {
      console.log('🛑 Desactivant refresc automàtic');
      clearInterval(interval);
    };
  }, [initializationComplete, refreshData]);

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

  // Debug panel component memoitzat
  const DebugPanel = useMemo(() => {
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
          <div><span className="text-green-300">Inicialitzat:</span> {initializationComplete ? '✅' : '❌'}</div>
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
          className="bg-blue-600 px-2 py-1 rounded text-xs hover:bg-blue-700 mr-2"
        >
          🔄 Refresh Data
        </button>
        <button 
          onClick={() => setInitializationComplete(false)}
          className="bg-orange-600 px-2 py-1 rounded text-xs hover:bg-orange-700"
        >
          🔄 Reinit
        </button>
      </div>
    );
  }, [debugInfo, isAdmin, refreshData, initializationComplete]);

  // Loading screen inicial
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
        {DebugPanel}
      </>
    );
  }

  // Data loading screen (after auth) - CORRECCIÓ: Reduir temps d'espera
  if (dataLoading && !initializationComplete && routes === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background: '#f0f0f3'}}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-300 border-t-blue-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xl text-gray-700 mb-2">Carregant dades...</p>
          <p className="text-sm text-gray-500">Sincronitzant amb Firebase...</p>
          <p className="text-xs text-gray-400 mt-2">Usuari: {currentUser.email}</p>
          <div className="mt-4 text-xs text-gray-500">
            <div>Rutes: {(routes && Array.isArray(routes)) ? routes.length : '⏳'}</div>
            <div>Usuaris: {(users && Array.isArray(users)) ? users.length : '⏳'}</div>
            <div>Incidències: {(incidents && Array.isArray(incidents)) ? incidents.length : '⏳'}</div>
          </div>
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
        {DebugPanel}
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
      {DebugPanel}
    </>
  );
};

export default BikeGPSApp;
