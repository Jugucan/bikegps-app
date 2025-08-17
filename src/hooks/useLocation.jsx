import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../App';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export const useLocation = (currentUser) => {
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [heading, setHeading] = useState(null);
  const watchId = useRef(null);
  const lastUpdateRef = useRef(0); // Per controlar freqüència d'actualitzacions

  // Obtenir ubicació actual una sola vegada - MEMOITZAT
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
          maximumAge: 5000 // Cache per 5 segons
        }
      );
    });
  }, []);

  // Actualitzar ubicació a Firebase - OPTIMITZAT per evitar bucles
  const updateLocationInFirebase = useCallback(async (location) => {
    if (!currentUser) return;

    // Control de freqüència per evitar massa actualitzacions
    const now = Date.now();
    if (now - lastUpdateRef.current < 5000) { // Mínim 5 segons entre actualitzacions
      return;
    }

    try {
      const userLocationData = {
        uid: currentUser.uid,
        displayName: currentUser.displayName || currentUser.email || 'Usuari Anònim',
        email: currentUser.email || '',
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
      lastUpdateRef.current = now;
      console.log('📍 Ubicació actualitzada a Firebase');
    } catch (error) {
      console.error('Error actualitzant ubicació a Firebase:', error);
    }
  }, [currentUser?.uid, heading]); // NOMÉS aquestes dependències

  // Iniciar seguiment d'ubicació - MEMOITZAT
  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation || isTracking) {
      console.warn('⚠️ Geolocation no disponible o ja està seguint');
      return;
    }

    console.log('🎯 Iniciant seguiment d\'ubicació...');
    setIsTracking(true);
    setLocationError(null);

    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 2000 // Cache per 2 segons
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

        // Actualitzar a Firebase amb control de freqüència
        updateLocationInFirebase(location);
      },
      (error) => {
        console.error('Error de geolocalització:', error);
        
        let errorMessage;
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Accés a la ubicació denegat';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Ubicació no disponible';
            break;
          case error.TIMEOUT:
            errorMessage = 'Timeout obtenint ubicació';
            break;
          default:
            errorMessage = 'Error desconegut de geolocalització';
        }
        
        setLocationError(errorMessage);
      },
      options
    );
  }, [isTracking, updateLocationInFirebase]); // Dependències mínimes

  // Aturar seguiment d'ubicació - MEMOITZAT
  const stopLocationTracking = useCallback(() => {
    if (watchId.current) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsTracking(false);
    console.log('⏹️ Seguiment d\'ubicació aturat');
  }, []);

  // Marcar usuari com offline - MEMOITZAT
  const markOffline = useCallback(async () => {
    if (currentUser) {
      try {
        await setDoc(doc(db, 'userLocations', currentUser.uid), {
          isOnline: false,
          lastUpdated: serverTimestamp()
        }, { merge: true });
        console.log('📴 Usuari marcat com offline');
      } catch (error) {
        console.error('Error marcant usuari com offline:', error);
      }
    }
  }, [currentUser?.uid]);

  // Efecte per gestionar esdeveniments de finestra - OPTIMITZAT
  useEffect(() => {
    // Marcar com offline quan es tanca la pàgina
    window.addEventListener('beforeunload', markOffline);
    window.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        markOffline();
      }
    });
    
    return () => {
      window.removeEventListener('beforeunload', markOffline);
      window.removeEventListener('visibilitychange', markOffline);
      stopLocationTracking();
      markOffline();
    };
  }, [markOffline, stopLocationTracking]);

  // Neteja quan l'usuari canvia - OPTIMITZAT
  useEffect(() => {
    if (!currentUser && isTracking) {
      stopLocationTracking();
    }
  }, [currentUser?.uid, isTracking, stopLocationTracking]);

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
