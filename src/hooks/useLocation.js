// hooks/useLocation.js
import { useRef, useCallback } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../App';

export const useLocation = (currentUser) => {
  const watchIdRef = useRef(null);
  const currentUserLocationRef = useRef(null);
  const lastHeadingRef = useRef(0); // Per trackear la direcció

  const updateUserLocation = useCallback(async (lat, lng, heading = null) => {
    if (!currentUser) return;
    
    try {
      console.log('📍 Actualitzant ubicació:', lat, lng, heading ? `Direcció: ${heading}°` : '');
      
      // Actualitzar ubicació a Firebase
      const userLocationRef = doc(db, 'userLocations', currentUser.uid);
      const locationData = {
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.email || 'Usuari Anònim',
        latitude: lat,
        longitude: lng,
        timestamp: serverTimestamp()
      };
      
      // Afegir heading si està disponible
      if (heading !== null && !isNaN(heading)) {
        locationData.heading = heading;
        lastHeadingRef.current = heading;
      }
      
      await setDoc(userLocationRef, locationData, { merge: true });
      
      // Actualitzar ubicació local
      currentUserLocationRef.current = {
        lat: lat,
        lng: lng,
        heading: heading || lastHeadingRef.current
      };
      
    } catch (error) {
      console.error('❌ Error actualitzant ubicació:', error);
    }
  }, [currentUser]);

  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation || !currentUser) return;

    console.log('📍 Iniciant seguiment de localització millorat...');
    
    const options = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 10000 // Reduït per més actualitzacions freqüents
    };

    const success = (position) => {
      const { latitude, longitude, heading } = position.coords;
      
      // Calcular heading si no està disponible directament
      let calculatedHeading = heading;
      if (!heading && currentUserLocationRef.current) {
        const prevLat = currentUserLocationRef.current.lat;
        const prevLng = currentUserLocationRef.current.lng;
        
        // Calcular direcció basada en moviment
        const deltaLng = longitude - prevLng;
        const deltaLat = latitude - prevLat;
        
        if (Math.abs(deltaLng) > 0.00001 || Math.abs(deltaLat) > 0.00001) {
          calculatedHeading = Math.atan2(deltaLng, deltaLat) * (180 / Math.PI);
          if (calculatedHeading < 0) calculatedHeading += 360;
        }
      }
      
      updateUserLocation(latitude, longitude, calculatedHeading);
    };

    const error = (err) => {
      console.error('❌ Error geolocalització:', err);
    };

    // Obtenir ubicació inicial
    navigator.geolocation.getCurrentPosition(success, error, options);
    
    // Iniciar seguiment continu més freqüent
    watchIdRef.current = navigator.geolocation.watchPosition(success, error, {
      ...options,
      maximumAge: 5000 // Encara més freqüent
    });

    // Cleanup function
    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [currentUser, updateUserLocation]);

  return {
    startLocationTracking,
    updateUserLocation,
    currentUserLocationRef
  };
};