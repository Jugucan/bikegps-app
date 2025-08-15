import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../App';

export const useLocation = (currentUser) => {
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const currentUserLocationRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastUpdateRef = useRef(0);
  const previousLocationRef = useRef(null);

  // Calcular direcció basada en moviment
  const calculateHeading = useCallback((currentPos, previousPos) => {
    if (!previousPos) return null;
    
    const deltaLat = currentPos.latitude - previousPos.latitude;
    const deltaLng = currentPos.longitude - previousPos.longitude;
    
    // Només calcular si s'ha mogut significativament (més de 2 metres)
    const distance = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng) * 111000; // Aproximació en metres
    if (distance < 2) return previousPos.heading || null;
    
    // Calcular bearing en graus
    const radians = Math.atan2(deltaLng, deltaLat);
    const degrees = (radians * 180 / Math.PI + 360) % 360;
    
    return degrees;
  }, []);

  // Actualitzar ubicació d'usuari a Firebase
  const updateUserLocation = useCallback(async (locationData) => {
    if (!currentUser || !locationData) return;
    
    try {
      const userDoc = doc(db, 'users', currentUser.uid);
      await updateDoc(userDoc, {
        currentLocation: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy,
          heading: locationData.heading,
          speed: locationData.speed,
          timestamp: serverTimestamp()
        },
        lastSeen: serverTimestamp()
      });
      
      console.log('📍 Ubicació actualitzada a Firebase');
    } catch (error) {
      console.error('❌ Error actualitzant ubicació:', error);
    }
  }, [currentUser]);

  // Gestionar actualització de posició
  const handleLocationUpdate = useCallback((position) => {
    const now = Date.now();
    
    // Throttling per evitar massa actualitzacions
    if (now - lastUpdateRef.current < 2000) return; // Màxim cada 2 segons
    lastUpdateRef.current = now;
    
    const currentPos = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      timestamp: now
    };
    
    // Calcular direcció basada en moviment
    const heading = calculateHeading(currentPos, previousLocationRef.current);
    if (heading !== null) {
      currentPos.heading = heading;
    } else if (previousLocationRef.current?.heading) {
      currentPos.heading = previousLocationRef.current.heading;
    }
    
    // Utilitzar compassos si està disponible i no tenim moviment
    if (position.coords.heading && position.coords.heading >= 0) {
      currentPos.heading = position.coords.heading;
    }
    
    setUserLocation(currentPos);
    currentUserLocationRef.current = currentPos;
    setLocationError(null);
    
    // Actualitzar Firebase (amb throttling)
    updateUserLocation(currentPos);
    
    // Guardar per calcular direcció en la propera actualització
    previousLocationRef.current = currentPos;
    
    console.log(`📍 Ubicació: ${currentPos.latitude.toFixed(6)}, ${currentPos.longitude.toFixed(6)} (±${Math.round(currentPos.accuracy)}m)${currentPos.heading ? ` →${Math.round(currentPos.heading)}°` : ''}`);
  }, [calculateHeading, updateUserLocation]);

  // Gestionar errors de geolocalització
  const handleLocationError = useCallback((error) => {
    console.error('❌ Error geolocalització:', error);
    
    let errorMessage = 'Error desconegut de geolocalització';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = 'Permisos de geolocalització denegats';
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = 'Ubicació no disponible';
        break;
      case error.TIMEOUT:
        errorMessage = 'Timeout obtenint ubicació';
        break;
    }
    
    setLocationError(errorMessage);
  }, []);

  // Iniciar seguiment d'ubicació
  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocalització no suportada pel navegador');
      return;
    }
    
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    
    console.log('🚀 Iniciant seguiment d\'ubicació...');
    setIsTracking(true);
    
    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000 // Acceptar ubicació de fins a 5 segons enrere
    };
    
    // Obtenir ubicació inicial immediatament
    navigator.geolocation.getCurrentPosition(
      handleLocationUpdate,
      handleLocationError,
      options
    );
    
    // Iniciar seguiment continu
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleLocationUpdate,
      handleLocationError,
      options
    );
    
  }, [handleLocationUpdate, handleLocationError]);

  // Aturar seguiment d'ubicació
  const stopLocationTracking = useCallback(() => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    
    setIsTracking(false);
    console.log('🛑 Seguiment d\'ubicació aturat');
  }, []);

  // Obtenir ubicació única
  const getCurrentLocation = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalització no suportada'));
        return;
      }
      
      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      };
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const locationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            heading: position.coords.heading
          };
          resolve(locationData);
        },
        reject,
        options
      );
    });
  }, []);

  // Cleanup quan es desmunta
  useEffect(() => {
    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Aturar tracking quan l'usuari es desloggeja
  useEffect(() => {
    if (!currentUser && isTracking) {
      stopLocationTracking();
    }
  }, [currentUser, isTracking, stopLocationTracking]);

  return {
    userLocation,
    locationError,
    isTracking,
    currentUserLocationRef,
    startLocationTracking,
    stopLocationTracking,
    getCurrentLocation,
    updateUserLocation
  };
};
