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
    resolveIncident,
    refreshData // Afegim funció per refrescar dades
  } = useFirebaseListeners(currentUser, isAdmin, isSuperAdmin, mapInstanceRef);

  // UI state
  const [authTab, setAuthTab] = useState('login');
  const [notification, setNotification] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [followUser, setFollowUser] = useState(true);
  const [rotateMap, setRotateMap] = useState(true);
  const [mapControlsExpanded, setMapControlsExpanded] = useState(false);
  const [debugInfo, setDebugInfo] = useState({}); // Per debug

  // Debug: Actualitza info de debug
  useEffect(() => {
    setDebugInfo({
      routesCount: routes?.length || 0,
      activeUsersCount: users?.length || 0,
      incidentsCount: incidents?.length || 0,
      allUsersCount: allUsers?.length || 0,
      currentUserLocation: userLocation,
      isTracking,
      currentRoute: currentRoute?.name || 'Cap'
    });
  }, [routes, users, incidents, allUsers, userLocation, isTracking, currentRoute]);

  // Initialize location tracking when user logs in
  useEffect(() => {
    if (currentUser && !isTracking) {
      console.log('📍 Iniciant seguiment ubicació...');
      startLocationTracking();
    }
  }, [currentUser, isTracking, startLocationTracking]);

  // Refrescar dades periòdicament per assegurar sincronització
  useEffect(() => {
    if (currentUser) {
      const interval = setInterval(() => {
        console.log('🔄 Refrescant dades...');
        if (refreshData) refreshData();
      }, 30000); // Cada 30 segons

      return () => clearInterval(interval);
    }
  }, [currentUser, refreshData]);

  // Route creation handler amb millor gestió d'errors
  const handleCreateRoute = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const name = formData.get('routeName')?.trim();
    const description = formData.get('routeDescription')?.trim();
    const gpxFile = formData.get('gpxFile');
    
    // Validacions millorades
    if (!name) {
      showNotification('El nom de la ruta és obligatori', 'error', setNotification);
      return;
    }
    
    if (!gpxFile) {
      showNotification('Selecciona un arxiu GPX', 'error', setNotification);
      return;
    }

    // Validar tipus d'arxiu
    if (!gpxFile.name.toLowerCase().endsWith('.gpx')) {
      showNotification('L\'arxiu ha de ser un fitxer GPX', 'error', setNotification);
      return;
    }

    try {
      console.log('📤 Iniciant creació de ruta:', name);
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
        name: name,
        description: description || 'Sense descripció',
        coordinates: coordinates,
        createdBy: currentUser.uid,
        createdByName: currentUser.displayName || currentUser.email || 'Usuari',
        gpxFileName: gpxFile.name,
        pointsCount: coordinates.length,
        deleted: false,
        active: true, // Assegurem que la ruta està activa
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
      
      // Refrescar dades per mostrar la nova ruta
      if (refreshData) {
        setTimeout(() => refreshData(), 1000);
      }

      setTimeout(() => {
        setShowUploadProgress(false);
        setUploadProgress(0);
      }, 2000);

    } catch (error) {
      setShowUploadProgress(false);
      setUploadProgress(0);
      console.error('❌ Error creating route:', error);
      showNotification('Error creant ruta: ' + error.message, 'error', setNotification);
    }
  };

  // Incident reporting amb millor gestió
  const reportIncident = async () => {
    const message = prompt('Descriu la incidència (opcional):');
    
    try {
      console.log('🚨 Reportant incidència...');
      
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
        location: location,
        timestamp: serverTimestamp(),
        resolved: false,
        reportedBy: currentUser.uid,
        type: 'user_report' // Tipus d'incidència
      };
      
      console.log('💾 Guardant incidència:', incidentData);
      const docRef = await addDoc(collection(db, 'incidents'), incidentData);
      console.log('✅ Incidència guardada amb ID:', docRef.id);
      
      showNotification('🚨 Incidència reportada! Els administradors han estat notificats.', 'success', setNotification);
      
      // Refrescar dades per mostrar la nova incidència
      if (refreshData) {
        setTimeout(() => refreshData(), 1000);
      }
      
    } catch (error) {
      console.error('❌ Error reporting incident:', error);
      showNotification('❌ Error reportant incidència: ' + error.message, 'error', setNotification);
    }
  };

  // Loading screen millorat
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{background: '#f0f0f3'}}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-yellow-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-gray-700">Inicialitzant BikeGPS...</p>
          <p className="text-sm text-gray-500 mt-2">Connectant amb Firebase...</p>
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

  // Debug panel per desenvolupament (només per admins)
  const DebugPanel = () => {
    if (!isAdmin) return null;
    
    return (
      <div className="fixed bottom-4 right-4 bg-black bg-opacity-80 text-white p-3 rounded text-xs max-w-xs z-50">
        <div className="font-bold mb-2">🐛 Debug Info</div>
        <div>Rutes: {debugInfo.routesCount}</div>
        <div>Usuaris actius: {debugInfo.activeUsersCount}</div>
        <div>Tots els usuaris: {debugInfo.allUsersCount}</div>
        <div>Incidències: {debugInfo.incidentsCount}</div>
        <div>Ruta actual: {debugInfo.currentRoute}</div>
        <div>Seguiment: {debugInfo.isTracking ? '✅' : '❌'}</div>
        <div>Ubicació: {debugInfo.currentUserLocation ? '📍' : '❌'}</div>
      </div>
    );
  };

  // Admin dashboard
  if (isAdmin) {
    return (
      <>
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
        refreshData={refreshData}
      />
      <DebugPanel />
    </>
  );
};

export default BikeGPSApp;
