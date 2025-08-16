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
    resolveIncident
  } = useFirebaseListeners(currentUser, isAdmin, isSuperAdmin, mapInstanceRef);

  // UI state
  const [authTab, setAuthTab] = useState('login');
  const [notification, setNotification] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [followUser, setFollowUser] = useState(true);
  const [rotateMap, setRotateMap] = useState(true);
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
  );
};

export default BikeGPSApp;
