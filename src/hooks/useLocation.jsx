import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../App';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export const useLocation = (currentUser) => {
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [heading, setHeading] = useState(null);
  const watchId = useRef(null);

  // Obtenir ubicació actual una sola vegada
  const getCurrentLocation = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation no està suportat'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date()
          };
          resolve(location);
        },
        (error) => {
          console.error('Error obtenint ubicació:', error);
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  }, []);

  // Actualitzar ubicació a Firebase
  const updateLocationInFirebase = useCallback(async (location) => {
    if (!currentUser) return;

    try {
      const userLocationData = {
        uid: currentUser.uid,
        displayName: currentUser.displayName || currentUser.email || 'Usuari Anònim',
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          heading: heading
        },
        lastUpdated: serverTimestamp(),
        isOnline: true
      };

      await setDoc(doc(db, 'userLocations', currentUser.uid), userLocationData, { merge: true });
      console.log('📍 Ubicació actualitzada a Firebase');
    } catch (error) {
      console.error('Error actualitzant ubicació a Firebase:', error);
    }
  }, [currentUser, heading]);

  // Iniciar seguiment d'ubicació
  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation || isTracking) return;

    console.log('🎯 Iniciant seguiment d\'ubicació...');
    setIsTracking(true);
    setLocationError(null);

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 1000 // Cache per 1 segon
    };

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date()
        };

        setUserLocation(location);
        setLocationError(null);
        
        // Actualitzar heading si està disponible
        if (position.coords.heading !== null && position.coords.heading !== undefined) {
          setHeading(position.coords.heading);
        }

        // Actualitzar a Firebase cada 5 segons aproximadament
        if (!userLocation || 
            Date.now() - userLocation.timestamp.getTime() > 5000) {
          updateLocationInFirebase(location);
        }
      },
      (error) => {
        console.error('Error de geolocalització:', error);
        setLocationError(error.message);
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Accés a la ubicació denegat');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Ubicació no disponible');
            break;
          case error.TIMEOUT:
            setLocationError('Timeout obtenint ubicació');
            break;
          default:
            setLocationError('Error desconegut de geolocalització');
        }
      },
      options
    );
  }, [isTracking, updateLocationInFirebase, userLocation]);

  // Aturar seguiment d'ubicació
  const stopLocationTracking = useCallback(() => {
    if (watchId.current) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsTracking(false);
    console.log('⏹️ Seguiment d\'ubicació aturat');
  }, []);

  // Marcar usuari com offline quan es desconnecta
  useEffect(() => {
    const markOffline = async () => {
      if (currentUser) {
        try {
          await setDoc(doc(db, 'userLocations', currentUser.uid), {
            isOnline: false,
            lastUpdated: serverTimestamp()
          }, { merge: true });
        } catch (error) {
          console.error('Error marcant usuari com offline:', error);
        }
      }
    };

    // Marcar com offline quan es tanca la pàgina
    window.addEventListener('beforeunload', markOffline);
    
    return () => {
      window.removeEventListener('beforeunload', markOffline);
      stopLocationTracking();
      markOffline();
    };
  }, [currentUser, stopLocationTracking]);

  // Neteja quan l'usuari canvia
  useEffect(() => {
    if (!currentUser && isTracking) {
      stopLocationTracking();
    }
  }, [currentUser, isTracking, stopLocationTracking]);

  return {
    userLocation,
    locationError,
    isTracking,
    heading,
    startLocationTracking,
    stopLocationTracking,
    getCurrentLocation
  };
};
