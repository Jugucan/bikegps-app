import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { auth, db } from './firebase-config';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp 
} from 'firebase/firestore';
const SUPER_ADMIN_UID = 's1UefGdgQphElib4KWmDsQj1uor2';

const BikeGPSApp = () => {
  // State management
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [users, setUsers] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [authTab, setAuthTab] = useState('login');
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [routeProgress, setRouteProgress] = useState(0);
  const [isReturning, setIsReturning] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadProgress, setShowUploadProgress] = useState(false);

  // Refs
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const watchIdRef = useRef(null);
  const userMarkersRef = useRef({});
  const routePolylinesRef = useRef([]);
  const hasSetInitialLocationRef = useRef(false);

// SUBSTITUEIX els useEffect de debug (línies 53-104) per aquests:

// Debug inicial - només un cop
useEffect(() => {
  console.log('🔧 App.jsx Debug:');
  console.log('- auth object:', auth);
  console.log('- db object:', db);
  console.log('- Variables env:', {
    api: import.meta.env.VITE_FIREBASE_API_KEY ? 'OK' : 'MISSING',
    domain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ? 'OK' : 'MISSING'
  });
  
  // Test geolocalització
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('📍 Localització obtinguda:', {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        console.error('❌ Error geolocalització:', error.message);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }
  
  // Test Leaflet
  console.log('📚 Leaflet disponible:', typeof L);
  console.log('- L.map function:', typeof L.map);
  console.log('- L.tileLayer function:', typeof L.tileLayer);
}, []); // ✅ Només un cop

// Debug auth - només quan canvia currentUser
useEffect(() => {
  if (currentUser) {
    console.log('✅ Usuari connectat:', currentUser.email);
  } else {
    console.log('❌ Cap usuari connectat');
  }
}, [currentUser]); // ✅ Només quan canvia currentUser
  
  // Initialize auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        await checkAdminStatus(user);
      } else {
        setCurrentUser(null);
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setLoading(false);
      }
    });

    return () => 
unsubscribe();
  }, []);

// SUBSTITUEIX el useEffect del mapa per aquest:
useEffect(() => {
  console.log('🗺️ Intentant crear mapa...');
  console.log('- mapRef.current:', mapRef.current);
  console.log('- mapInstanceRef.current:', mapInstanceRef.current);
  
  // Si ja tenim el mapa creat, no fer res
  if (mapInstanceRef.current) {
    console.log('🗺️ Mapa ja creat, sortint...');
    return;
  }
  
  // Si no tenim el contenidor, programar un retry
  if (!mapRef.current) {
    console.log('⏳ Contenidor no disponible encara, reintentant...');
    const timer = setTimeout(() => {
      // Forçar un re-render per tornar a intentar
      setLoading(prev => prev); // Trigger re-render sense canviar l'estat
    }, 100);
    return () => clearTimeout(timer);
  }
  
  try {
    console.log('🗺️ Creant mapa...');
    const map = L.map(mapRef.current).setView([41.6722, 2.4540], 13);
    
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
      crossOrigin: true
    });
    
    tileLayer.addTo(map);
    console.log('✅ Mapa carregat correctament');
    
    mapInstanceRef.current = map;
    
    // Crear les icones personalitzades
    createCustomIcons();
    
  } catch (error) {
    console.error('❌ Error initializing map:', error);
    showNotification('Error carregant mapa', 'error');
  }

}, [currentUser]); // Executar quan canvia currentUser (quan es logueja)

// Neteja del mapa quan es desmunta el component
useEffect(() => {
  return () => {
    if (mapInstanceRef.current) {
      console.log('🧹 Netejant mapa...');
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
  };
}, []);
  
// SUBSTITUEIX el useEffect que carrega dades (línia 175) per aquest:
useEffect(() => {
  if (currentUser) {
    loadRoutes();
    if (isAdmin) {
      listenToUsers();
      listenToIncidents();
    }
    
    // Només inicia el seguiment si no està ja actiu
    if (!watchIdRef.current) {
      startLocationTracking();
    }
  }
  
  return () => {
    // Neteja el seguiment d'ubicació quan l'usuari canvia o es desmunta
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };
}, [currentUser, isAdmin]); // Dependències correctes
  const checkAdminStatus = async (user) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.data();
      
      const isSuperAdminUser = user.uid === SUPER_ADMIN_UID;
      if (isSuperAdminUser) {
        setIsAdmin(true);
        setIsSuperAdmin(true);
        if (!userData) {
          await setDoc(doc(db, 'users', user.uid), {
            name: user.displayName || user.email,
            email: user.email,
            isAdmin: true,
            isSuperAdmin: true,
            createdAt: serverTimestamp()
          });
        } else if (!userData.isAdmin || !userData.isSuperAdmin) {
          await updateDoc(doc(db, 'users', user.uid), {
            isAdmin: true,
            isSuperAdmin: true
          });
        }
      } else if (userData) {
        setIsAdmin(userData.isAdmin === true);
        setIsSuperAdmin(userData.isSuperAdmin === true);
      } else {
        await setDoc(doc(db, 'users', user.uid), {
          name: user.displayName || user.email,
          email: user.email,
          isAdmin: false,
          isSuperAdmin: false,
          createdAt: serverTimestamp()
        });
        setIsAdmin(false);
        setIsSuperAdmin(false);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error checking admin status:', error);
      showNotification('Error carregant aplicació: ' + error.message, 'error');
      setLoading(false);
    }
  };
  // SUBSTITUEIX la funció createCustomIcons (al voltant de la línia 224):

const createCustomIcons = () => {
  console.log('🎨 Creant icones personalitzades...');
  // User icon
  window.userIcon = L.divIcon({
    className: 'custom-user-marker',
    html: '<div style="background: linear-gradient(145deg, #ffd02e, #ffcc00); border: 3px solid #fff; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(255,208,46,0.5);"><span style="font-size: 12px; color: #1a1a1a;">👤</span></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
  // Current user icon
  window.currentUserIcon = L.divIcon({
    className: 'custom-current-user-marker',
    html: '<div style="background: linear-gradient(145deg, #2ed573, #26d0ce); border: 3px solid #fff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(46,213,115,0.6);"><span style="font-size: 14px; color: white;">📍</span></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
  // Incident icon
  window.incidentIcon = L.divIcon({
    className: 'custom-incident-marker',
    html: '<div style="background: linear-gradient(145deg, #ff4757, #ff3838); border: 3px solid #fff; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(255, 71, 87, 0.5); animation: pulse 2s infinite;"><span style="color: white; font-size: 16px;">🚨</span></div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
  console.log('✅ Icones creades correctament');
};

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      showNotification('Login correcte!', 'success');
    } catch (error) {
      console.error('Error login:', error);
      showNotification('Error: ' + error.message, 'error');
    }
  };
  const handleRegister = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const name = formData.get('name');
    const email = formData.get('email');
    const password = formData.get('password');

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        name: name,
        email: email,
        isAdmin: false,
        createdAt: serverTimestamp()
      });
      showNotification('Usuari registrat correctament!', 'success');
    } catch (error) {
      console.error('Error register:', error);
      showNotification('Error: ' + error.message, 'error');
    }
  };

  const handleCreateRoute = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const name = formData.get('routeName');
    const description = formData.get('routeDescription');
    const gpxFile = formData.get('gpxFile');
    if (!gpxFile) {
      showNotification('Selecciona un arxiu GPX', 'error');
      return;
    }

    try {
      setShowUploadProgress(true);
      setUploadProgress(20);

      const gpxText = await readFileAsText(gpxFile);
      setUploadProgress(50);
      const coordinates = parseGPX(gpxText);
      setUploadProgress(80);

      const coordinateObjects = coordinates.map(coord => ({
        lat: coord[0],
        lng: coord[1]
      }));
      const routeData = {
        name: name,
        description: description,
        coordinates: coordinateObjects,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        gpxFileName: gpxFile.name,
        pointsCount: coordinateObjects.length
      };
      await addDoc(collection(db, 'routes'), routeData);

      setUploadProgress(100);
      showNotification('✅ Ruta creada correctament des de GPX!', 'success');

      e.target.reset();
      setTimeout(() => {
        setShowUploadProgress(false);
        setUploadProgress(0);
      }, 1000);
      loadRoutes();

    } catch (error) {
      setShowUploadProgress(false);
      setUploadProgress(0);
      console.error('Error creating route:', error);
      showNotification('Error creant ruta: ' + error.message, 'error');
    }
  };
  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Error llegint arxiu'));
      reader.readAsText(file);
    });
  };

  const parseGPX = (gpxText) => {
    try {
      const parser = new DOMParser();
      const gpxDoc = parser.parseFromString(gpxText, 'text/xml');
      
      const parserError = gpxDoc.querySelector('parsererror');
      if (parserError) {
        throw new Error('Arxiu GPX no vàlid');
      }
      
      const coordinates = [];
      
      const trackPoints = gpxDoc.querySelectorAll('trkpt');
      if (trackPoints.length > 0) {
        trackPoints.forEach(point => {
          const lat = parseFloat(point.getAttribute('lat'));
          const lon = parseFloat(point.getAttribute('lon'));
          if (!isNaN(lat) && !isNaN(lon)) {
            coordinates.push([lat, lon]);
          }
        });
      }
      
      if (coordinates.length === 0) {
        const routePoints = gpxDoc.querySelectorAll('rtept');
        routePoints.forEach(point => {
          const lat = parseFloat(point.getAttribute('lat'));
          const lon = parseFloat(point.getAttribute('lon'));
          if (!isNaN(lat) && !isNaN(lon)) {
            coordinates.push([lat, lon]);
          }
        });
      }
      
      if (coordinates.length === 0) {
        const waypoints = gpxDoc.querySelectorAll('wpt');
        waypoints.forEach(point => {
          const lat = parseFloat(point.getAttribute('lat'));
          const lon = parseFloat(point.getAttribute('lon'));
          if (!isNaN(lat) && !isNaN(lon)) {
            coordinates.push([lat, lon]);
          }
        });
      }
      
      if (coordinates.length === 0) {
        throw new Error('No s\'han trobat coordenades vàlides a l\'arxiu GPX');
      }
      
      console.log('✅ Coordenades processades:', coordinates.length, 'punts');
      return coordinates;
    } catch (error) {
      throw new Error('Error processant arxiu GPX: ' + error.message);
    }
  };

  const loadRoutes = async () => {
    try {
      const routesSnapshot = await getDocs(collection(db, 'routes'));
      const routesData = [];
      routesSnapshot.forEach((doc) => {
        routesData.push({ id: doc.id, ...doc.data() });
      });
      setRoutes(routesData);
    } catch (error) {
      console.error('Error loading routes:', error);
      showNotification('Error carregant rutes', 'error');
    }
  };

  const selectRoute = (routeId, routeData) => {
    setCurrentRoute({ id: routeId, ...routeData });
    setRouteProgress(0);
    setIsReturning(false);
    if (mapInstanceRef.current && routeData.coordinates) {
      clearRoutePolylines();

      let leafletCoords;
      if (Array.isArray(routeData.coordinates[0])) {
        leafletCoords = routeData.coordinates;
      } else {
        leafletCoords = routeData.coordinates.map(coord => [coord.lat, coord.lng]);
      }
      
      const pendingRoute = L.polyline(leafletCoords, {
        color: '#81C784',
        weight: 12,
        opacity: 0.8,
        dashArray: '20, 15'
      }).addTo(mapInstanceRef.current);
      routePolylinesRef.current.push(pendingRoute);
      mapInstanceRef.current.fitBounds(pendingRoute.getBounds());
    }

    showNotification('Ruta seleccionada: ' + routeData.name, 'success');
  };
  const clearRoutePolylines = () => {
    routePolylinesRef.current.forEach(polyline => {
      if (mapInstanceRef.current && mapInstanceRef.current.hasLayer(polyline)) {
        mapInstanceRef.current.removeLayer(polyline);
      }
    });
    routePolylinesRef.current = [];
  };

  const deleteRoute = async (routeId) => {
    if (window.confirm('Segur que vols eliminar aquesta ruta?')) {
      try {
        await deleteDoc(doc(db, 'routes', routeId));
        showNotification('Ruta eliminada correctament', 'success');
        loadRoutes();
        
        if (currentRoute?.id === routeId) {
          setCurrentRoute(null);
          clearRoutePolylines();
        }
      } catch (error) {
        console.error('Error deleting route:', error);
        showNotification('Error eliminant ruta', 'error');
      }
    }
  };
  const listenToUsers = () => {
    const unsubscribe = onSnapshot(collection(db, 'userLocations'), (snapshot) => {
      const usersData = [];
      
      snapshot.forEach((doc) => {
        const location = doc.data();
        const userId = doc.id;
        const isCurrentUser = userId === currentUser?.uid;

        if (userMarkersRef.current[userId]) {
          mapInstanceRef.current?.removeLayer(userMarkersRef.current[userId]);
      
        }

        if (mapInstanceRef.current && location.latitude && location.longitude) {
          const icon = isCurrentUser ? window.currentUserIcon : window.userIcon;
          userMarkersRef.current[userId] = L.marker([location.latitude, location.longitude], {
            icon: icon
          }).addTo(mapInstanceRef.current);

          userMarkersRef.current[userId].bindPopup(`
            <div style="text-align: center; padding: 0.5rem;">
              <strong style="color: ${isCurrentUser ? '#2ed573' : '#ffd02e'};">${isCurrentUser ? '📍 Tu' : '👤 ' + location.userName}</strong><br>
              <small style="color: #666;">Última actualització:<br>${location.timestamp ? new Date(location.timestamp.toDate()).toLocaleTimeString() : 'Ara'}</small>
            </div>
          `);
        }

        if (isAdmin) {
          usersData.push({
            ...location,
            id: userId,
            isCurrentUser,
            online: isUserOnline(location.timestamp)
          });
        }
      });

      if (isAdmin) {
        setUsers(usersData);
      }
    });

    return unsubscribe;
  };

  const listenToIncidents = () => {
    const q = query(collection(db, 'incidents'), where('resolved', '==', false));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const incidentsData = [];
      
      if (mapInstanceRef.current) {
        mapInstanceRef.current.eachLayer(layer => {
          if (layer.options && layer.options.className === 'incident-marker') {
            mapInstanceRef.current.removeLayer(layer);
          }
        });
      }

      snapshot.forEach((doc) => {
        const incident = { id: doc.id, ...doc.data() };
        incidentsData.push(incident);

        if (mapInstanceRef.current && incident.location) {
          const marker = L.marker([incident.location.latitude, incident.location.longitude], {
            icon: window.incidentIcon,
            className: 'incident-marker'
          }).addTo(mapInstanceRef.current);

          marker.bindPopup(`
            <div style="text-align: center; padding: 0.5rem;">
              <strong style="color: #ff4757;">🚨 INCIDÈNCIA</strong><br>
              <strong>Usuari:</strong> ${incident.userName}<br>
              <strong>Missatge:</strong> ${incident.message || 'Incidència reportada'}<br>
              <small style="color: #666;">
                ${incident.timestamp ? new Date(incident.timestamp.toDate()).toLocaleString() : 'Ara'}
              </small>
            </div>
          `);
        }
      });

      setIncidents(incidentsData);
    });

    return unsubscribe;
  };
  const isUserOnline = (timestamp) => {
    if (!timestamp) return false;
    const now = new Date();
    const lastUpdate = timestamp.toDate();
    return (now - lastUpdate) < 300000;
  };

  // SUBSTITUEIX la funció startLocationTracking (al voltant de la línia 603):
  const startLocationTracking = () => {
    if (!navigator.geolocation) {
      console.log('❌ Geolocalització no disponible');
      showNotification('Geolocalització no disponible en aquest dispositiu', 'error');
      return;
    }
  
    console.log('📍 Iniciant seguiment de localització...');
    
    // Primer intenta obtenir una posició
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('✅ Posició inicial obtinguda:', {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        
        // Actualitza la posició inicial
        updateUserLocation(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        console.error('❌ Error posició inicial:', error.message);
        let errorMessage = 'Error obtenint ubicació GPS: ';
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage += 'Permisos denegats. Activa la geolocalització al navegador.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage += 'Ubicació no disponible.';
            break;
          case error.TIMEOUT:
            errorMessage += 'Temps d\'espera esgotat.';
            break;
          default:
            errorMessage += error.message;
            break;
        }
        
        showNotification(errorMessage, 'error');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
    
    // Després inicia el seguiment continu
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        console.log('📍 Nova posició:', {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date().toLocaleTimeString()
        });
        
        const { latitude, longitude } = position.coords;
        updateUserLocation(latitude, longitude);
        
        // Update route progress if route selected
        if (currentRoute) {
          updateRouteProgress(latitude, longitude);
        }
      },
      (error) => {
        console.error('❌ Error seguiment ubicació:', error.message);
        // No mostrem notificació per cada error del watchPosition
        // només loggem per debug
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000
      }
    );
  };
  const updateUserLocation = async (lat, lng) => {
    if (!currentUser) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      const userData = userDoc.data();
      await setDoc(doc(db, 'userLocations', currentUser.uid), {
        userId: currentUser.uid,
        userName: userData ? userData.name : 'Usuari',
        latitude: lat,
        longitude: lng,
        timestamp: serverTimestamp()
      });
      if (!hasSetInitialLocationRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.setView([lat, lng], 15);
        hasSetInitialLocationRef.current = true;
      }
    } catch (error) {
      console.error('❌ Error actualitzant ubicació:', error);
    }
  };

  const updateRouteProgress = (currentLat, currentLng) => {
    if (!currentRoute || !currentRoute.coordinates) return;
    const coordinates = currentRoute.coordinates;
    let leafletCoords;
    
    if (Array.isArray(coordinates[0])) {
      leafletCoords = coordinates;
    } else {
      leafletCoords = coordinates.map(coord => [coord.lat, coord.lng]);
    }

    let closestIndex = 0;
    let minDistance = Infinity;
    leafletCoords.forEach((coord, index) => {
      const distance = calculateDistance(currentLat, currentLng, coord[0], coord[1]);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = index;
      }
    });
    const progress = closestIndex / (leafletCoords.length - 1);
    
    if (progress > 0.8 && !isReturning) {
      setIsReturning(true);
    }

    setRouteProgress(progress);
    updateRouteVisualization(leafletCoords, closestIndex);
  };

  const updateRouteVisualization = (leafletCoords, currentIndex) => {
    clearRoutePolylines();
    if (mapInstanceRef.current) {
      if (currentIndex > 0) {
        const completedRoute = L.polyline(leafletCoords.slice(0, currentIndex + 1), {
          color: '#1565C0',
          weight: 14,
          opacity: 1.0
        }).addTo(mapInstanceRef.current);
        routePolylinesRef.current.push(completedRoute);
      }

      if (currentIndex < leafletCoords.length - 1) {
        const pendingRoute = L.polyline(leafletCoords.slice(currentIndex), {
          color: '#81C784',
          weight: 12,
          opacity: 0.8,
          dashArray: '20, 15'
        }).addTo(mapInstanceRef.current);
        routePolylinesRef.current.push(pendingRoute);
      }
    }
  };

  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lng2-lng1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };
  const reportIncident = async () => {
    const message = prompt('Descriu la incidència (opcional):');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          const userData = userDoc.data();

          await addDoc(collection(db, 'incidents'), {
            userId: currentUser.uid,
            userName: userData ? userData.name : 'Usuari',
            message: message || '',
            location: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            },
            timestamp: serverTimestamp(),
            resolved: false
          });

          showNotification('🚨 Incidència reportada! Els administradors han estat notificats.', 'success');
        } catch (error) {
          console.error('Error reporting incident:', error);
          showNotification('Error reportant incidència', 'error');
        }
      }, (error) => {
        showNotification('Error obtenint ubicació per la incidència', 'error');
      });
    } else {
      showNotification('No es pot obtenir la ubicació', 'error');
    }
  };
  const resolveIncident = async (incidentId) => {
    try {
      await updateDoc(doc(db, 'incidents', incidentId), {
        resolved: true,
        resolvedAt: serverTimestamp(),
        resolvedBy: currentUser.uid
      });
      showNotification('✅ Incidència resolta correctament', 'success');
    } catch (error) {
      console.error('Error resolving incident:', error);
      showNotification('Error resolent incidència', 'error');
    }
  };

  const handleLogout = async () => {
    try {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      
      if (mapInstanceRef.current) {
        clearRoutePolylines();
      }
      
      setCurrentRoute(null);
      setRouteProgress(0);
      setIsReturning(false);
      
      await signOut(auth);
      showNotification('Sessió tancada correctament', 'success');
    } catch (error) {
      console.error('Error signing out:', error);
      showNotification('Error tancant sessió', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-4"></div>
          <p className="text-lg">Inicialitzant BikeGPS...</p>
        </div>
      </div>
    );
  }

  // Auth screen
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
          <h2 className="text-3xl font-bold text-center mb-8">
            <span className="text-yellow-500">Bike</span>
            <span className="text-gray-800">GPS</span>
          </h2>

          <div 
className="flex mb-6 rounded-2xl overflow-hidden bg-gray-100">
            <button
              className={`flex-1 p-3 font-semibold transition-all ${
                authTab === 'login' 
                  ? 'bg-yellow-500 text-gray-800' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
              onClick={() => setAuthTab('login')}
            >
              Login
            </button>
            <button
              className={`flex-1 p-3 font-semibold transition-all ${
                authTab === 'register' 
                  ? 'bg-yellow-500 text-gray-800' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
              onClick={() => setAuthTab('register')}
            >
              Registre
            </button>
          </div>

          {authTab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email:
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contrasenya:
                </label>
                <input
                  type="password"
                  name="password"
                  required
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-yellow-500 text-gray-800 font-semibold py-3 px-4 rounded-xl hover:bg-yellow-400 transition-colors"
              >
                Entrar
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom:
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email:
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contrasenya:
                </label>
                <input
                  type="password"
                  name="password"
                  required
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-yellow-500 text-gray-800 font-semibold py-3 px-4 rounded-xl hover:bg-yellow-400 transition-colors"
              >
                Registrar-se
              </button>
            </form>
          )}
        </div>

        {/* Notification */}
        {notification && (
          <div className={`fixed top-4 right-4 p-4 rounded-xl shadow-lg z-50 max-w-sm ${
            notification.type === 'error' ? 'bg-red-500 text-white' : 
            notification.type === 'success' ? 'bg-green-500 text-white' : 
            'bg-blue-500 text-white'
          }`}>
            {notification.message}
          </div>
        )}
      </div>
    );
  }

  // Admin Dashboard
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <header className="bg-white shadow-lg sticky top-0 z-50">
          <div className="px-6 py-4 flex justify-between items-center">
            <h1 className="text-2xl font-bold">
              <span className="text-yellow-500">BikeGPS</span>
              <span className="text-gray-800"> Admin</span>
              {isSuperAdmin && <span className="text-yellow-500 ml-2">👑</span>}
            </h1>
            <div className="flex items-center gap-4">
              <span className="text-gray-700">
                Hola, {currentUser.displayName || currentUser.email} {isSuperAdmin && '(Super Admin)'}
              </span>
              <button
                onClick={handleLogout}
                className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Sortir
              </button>
            </div>
          </div>
        </header>

        <div className="p-6">
          {/* Route Creation */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Crear Nova Ruta (GPX)</h2>
            <form onSubmit={handleCreateRoute} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom de la Ruta:
                  </label>
                  <input
                    type="text"
                    name="routeName"
                    required
                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Arxiu GPX:
                  </label>
                  <input
                    type="file"
                    name="gpxFile"
                    accept=".gpx"
                    required
                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripció:
                </label>
                <textarea
                  name="routeDescription"
                  rows="3"
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
              </div>
              
              {showUploadProgress && (
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-yellow-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              )}
              
              <button
                type="submit"
                disabled={showUploadProgress}
                className="bg-yellow-500 text-gray-800 font-semibold py-3 px-6 rounded-xl hover:bg-yellow-400 transition-colors disabled:opacity-50"
              >
                {showUploadProgress ? 'Creant Ruta...' : 'Crear Ruta'}
              </button>
            </form>
          </div>

          {/* Admin Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            {/* Routes List */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold mb-4 border-b-2 border-yellow-500 pb-2">
                Rutes Disponibles
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {routes.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No hi ha rutes creades</p>
                ) : (
                  routes.map((route) => (
                    <div key={route.id} className="bg-gray-50 p-4 rounded-lg border-l-4 border-yellow-500">
                      <h4 className="font-semibold mb-1">{route.name}</h4>
                      <p className="text-gray-600 text-sm mb-2">{route.description || 'Sense descripció'}</p>
                      {route.gpxFileName && (
                        <p className="text-gray-500 text-xs italic mb-2">📁 {route.gpxFileName}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-400 transition-colors"
                          onClick={() => selectRoute(route.id, route)}
                        >
                          📍 Seleccionar
                        </button>
                        <button
                          className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-400 transition-colors"
                          onClick={() => deleteRoute(route.id)}
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Users List */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold mb-4 border-b-2 border-yellow-500 pb-2">
                Participants Actius
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {users.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Carregant participants...</p>
                ) : (
                  users.map((user) => (
                    <div key={user.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                      <div>
                        <strong className="text-gray-800">{user.userName} {user.isCurrentUser && '(Tu)'}</strong>
                        <div className="text-gray-500 text-xs">
                          {user.timestamp ? new Date(user.timestamp.toDate()).toLocaleTimeString() : 'Ara'}
                        </div>
                      </div>
                      <div className={`w-3 h-3 rounded-full ${user.online ? 'bg-green-500' : 'bg-red-500'} shadow-lg`}></div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Incidents List */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold mb-4 border-b-2 border-red-500 pb-2">
                Incidències Actives
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {incidents.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No hi ha incidències actives</p>
                ) : (
                  incidents.map((incident) => (
                    <div key={incident.id} className="bg-red-50 p-4 rounded-lg border-l-4 border-red-500">
                      <div className="flex justify-between items-start mb-2">
                        <strong className="text-red-600">🚨 {incident.userName}</strong>
                        <button
                          className="bg-green-500 text-white px-2 py-1 rounded text-xs hover:bg-green-400 transition-colors"
                          onClick={() => resolveIncident(incident.id)}
                        >
                          ✅ Resoldre
                        </button>
                      </div>
                      <p className="text-gray-700 text-sm mb-1">{incident.message || 'Incidència reportada'}</p>
                      <p className="text-gray-500 text-xs">
                        {incident.timestamp ? new Date(incident.timestamp.toDate()).toLocaleString() : 'Ara'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
            <div 
              ref={mapRef} 
              className="w-full"
              style={{ height: '500px' }}
            ></div>
          </div>
        </div>
        
        {/* Notification */}
        {notification && (
          <div className={`fixed top-20 right-4 p-4 rounded-xl shadow-lg z-50 max-w-sm ${
            notification.type === 'error' ? 'bg-red-500 text-white' : 
            notification.type === 'success' ? 'bg-green-500 text-white' : 
            'bg-blue-500 text-white'
          }`}>
            {notification.message}
          </div>
        )}
      </div>
    );
  }

  // User Dashboard
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-lg sticky top-0 z-50">
        <div className="px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">
            <span className="text-yellow-500">Bike</span>
            <span className="text-gray-800">GPS</span>
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-700">
              Hola, {currentUser.displayName || currentUser.email}
            </span>
            <button
              onClick={handleLogout}
              className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Sortir
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 p-6">
        {/* Sidebar - Routes */}
        <div className="lg:col-span-1">
          <div className="bg-white 
rounded-2xl shadow-lg p-6 sticky top-24">
            <h3 className="text-lg font-bold mb-4 border-b-2 border-yellow-500 pb-2">
              Rutes Disponibles
            </h3>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {routes.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Carregant rutes...</p>
              ) : (
                routes.map((route) => (
                  <div 
                    key={route.id} 
                    className={`p-4 rounded-lg border-l-4 cursor-pointer transition-all hover:shadow-md ${
                      currentRoute?.id === route.id 
                        ? 'bg-yellow-100 border-yellow-500 shadow-md' 
                        : 'bg-gray-50 border-yellow-300 hover:bg-gray-100'
                    }`}
                    onClick={() => selectRoute(route.id, route)}
                  >
                    <h4 className="font-semibold mb-1">{route.name}</h4>
                    <p className="text-gray-600 text-sm">{route.description || 'Sense descripció'}</p>
                    {route.gpxFileName && (
                      <p className="text-gray-500 text-xs italic mt-1">📁 {route.gpxFileName}</p>
                    )}
                    {route.pointsCount && (
                      <p className="text-gray-500 text-xs mt-1">📍 {route.pointsCount} punts</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="relative">
              <div 
                ref={mapRef} 
                className="w-full"
                style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}
              ></div>
              
              {/* Route Progress Indicator */}
              {currentRoute && (
                <div className="absolute top-4 left-4 bg-white bg-opacity-95 px-4 py-2 rounded-xl shadow-lg">
                  <span className="text-sm font-medium">
                    <span className="block font-bold text-gray-800">{currentRoute.name}</span>
                    <span className="text-gray-600">
                      {isReturning ? 'Tornant' : 'Anant'} - {Math.round(routeProgress * 100)}% completat
                    </span>
                  </span>
                </div>
              )}

              {/* Emergency Button */}
              <button
                onClick={reportIncident}
                className="fixed bottom-8 right-8 bg-red-500 text-white p-4 rounded-full shadow-lg hover:bg-red-400 transition-all transform hover:scale-105 animate-pulse z-50"
              >
                <div className="text-center">
                  <span className="text-2xl block">🚨</span>
                  <div className="text-xs font-bold mt-1">INCIDÈNCIA</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`fixed top-20 right-4 p-4 rounded-xl shadow-lg z-50 max-w-sm transition-all ${
          notification.type === 'error' ? 'bg-red-500 text-white' : 
          notification.type === 'success' ? 'bg-green-500 text-white' : 
          'bg-blue-500 text-white'
        }`}>
          {notification.message}
        </div>
      )}
    </div>
  );
};

export default BikeGPSApp;




