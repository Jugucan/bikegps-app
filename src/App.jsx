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
  const incidentMarkersRef = useRef({});  // ✅ Nou ref per incidències
  const routePolylinesRef = useRef([]);
  const hasSetInitialLocationRef = useRef(false);
  const listenersRef = useRef({ users: null, incidents: null });

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
  }, []);

  // Debug auth - només quan canvia currentUser
  useEffect(() => {
    if (currentUser) {
      console.log('✅ Usuari connectat:', currentUser.email);
    } else {
      console.log('❌ Cap usuari connectat');
    }
  }, [currentUser]);
  
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

    return () => unsubscribe();
  }, []);

  // ✅ LISTENERS SEPARATS - S'inicien quan tenim usuari, independentment del mapa
  useEffect(() => {
    if (!currentUser) {
      console.log('❌ No hi ha usuari, no iniciar listeners');
      
      // Netejar listeners existents
      if (listenersRef.current.users) {
        listenersRef.current.users();
        listenersRef.current.users = null;
      }
      if (listenersRef.current.incidents) {
        listenersRef.current.incidents();
        listenersRef.current.incidents = null;
      }
      
      return;
    }

    console.log('🎯 Iniciant listeners per usuari connectat...');
    
    // Iniciar listener d'usuaris sempre
    if (!listenersRef.current.users) {
      console.log('👂 Iniciant listener usuaris...');
      listenersRef.current.users = listenToUsers();
    }
    
    // Iniciar listener d'incidències sempre (tant per admin com per usuaris)
    if (!listenersRef.current.incidents) {
      console.log('🚨 Iniciant listener incidències...');
      listenersRef.current.incidents = listenToIncidents();
    }

    return () => {
      console.log('🧹 Netejant listeners...');
      if (listenersRef.current.users) {
        listenersRef.current.users();
        listenersRef.current.users = null;
      }
      if (listenersRef.current.incidents) {
        listenersRef.current.incidents();
        listenersRef.current.incidents = null;
      }
    };
  }, [currentUser]); // ✅ Només depèn d'usuari

  // ✅ MAPA - Separat dels listeners
  useEffect(() => {
    if (!currentUser) {
      console.log('❌ No hi ha usuari connectat, no crear mapa');
      return;
    }

    console.log('🗺️ Usuari connectat, intentant crear mapa...');
    
    const timer = setTimeout(() => {
      console.log('🗺️ Intentant crear mapa amb delay...');
      
      if (mapInstanceRef.current) {
        console.log('🗺️ Mapa ja creat, sortint...');
        return;
      }
      
      if (!mapRef.current) {
        console.log('❌ Contenidor encara no disponible');
        return;
      }
      
      try {
        console.log('🗺️ Creant mapa ara...');
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
        console.log('🎨 Creant icones personalitzades...');
        createCustomIcons();
        
      } catch (error) {
        console.error('❌ Error initializing map:', error);
        showNotification('Error carregant mapa', 'error');
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [currentUser]);

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

  // ✅ CÀRREGA DE DADES - Separat
  useEffect(() => {
    if (currentUser) {
      console.log('📚 Carregant rutes per usuari connectat...');
      loadRoutes();
      
      // Només inicia el seguiment si no està ja actiu
      if (!watchIdRef.current) {
        console.log('📍 Iniciant seguiment ubicació...');
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
  }, [currentUser]);
  
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

  // ✅ ICONES MILLORADES AMB SVG SIMPLE
  const createCustomIcons = () => {
    console.log('🎨 CREANT ICONES PERSONALITZADES...');
    
    try {
      // ✅ USER ICON (groc) - SVG més simple
      const userIconSVG = `<svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
        <path fill="#ffd02e" stroke="#fff" stroke-width="2" d="M12.5 0C5.607 0 0 5.607 0 12.5c0 10.5 12.5 28.5 12.5 28.5s12.5-18 12.5-28.5C25 5.607 19.393 0 12.5 0z"/>
        <circle fill="#1a1a1a" cx="12.5" cy="12.5" r="6"/>
        <circle fill="#fff" cx="12.5" cy="12.5" r="3"/>
      </svg>`;
      
      window.userIcon = new L.Icon({
        iconUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(userIconSVG),
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34]
      });
      
      // ✅ CURRENT USER ICON (verd) - SVG més simple
      const currentUserIconSVG = `<svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
        <path fill="#2ed573" stroke="#fff" stroke-width="2" d="M12.5 0C5.607 0 0 5.607 0 12.5c0 10.5 12.5 28.5 12.5 28.5s12.5-18 12.5-28.5C25 5.607 19.393 0 12.5 0z"/>
        <circle fill="#fff" cx="12.5" cy="12.5" r="6"/>
        <circle fill="#2ed573" cx="12.5" cy="12.5" r="3"/>
      </svg>`;
      
      window.currentUserIcon = new L.Icon({
        iconUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(currentUserIconSVG),
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34]
      });
      
      // ✅ ADMIN ICON (blau) - Nova icona diferenciada
      const adminIconSVG = `<svg width="30" height="46" viewBox="0 0 30 46" xmlns="http://www.w3.org/2000/svg">
        <path fill="#3742fa" stroke="#fff" stroke-width="3" d="M15 0C7.268 0 1 6.268 1 14c0 12.25 14 31 14 31s14-18.75 14-31C29 6.268 22.732 0 15 0z"/>
        <circle fill="#fff" cx="15" cy="14" r="8"/>
        <polygon fill="#3742fa" points="15,8 17,12 21,12 18,15 19,19 15,17 11,19 12,15 9,12 13,12" stroke="#fff" stroke-width="1"/>
      </svg>`;
      
      window.adminIcon = new L.Icon({
        iconUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(adminIconSVG),
        iconSize: [30, 46],
        iconAnchor: [15, 46],
        popupAnchor: [1, -40]
      });
      
      // ✅ INCIDENT ICON (vermell) - SVG més simple
      const incidentIconSVG = `<svg width="30" height="46" viewBox="0 0 30 46" xmlns="http://www.w3.org/2000/svg">
        <path fill="#ff4757" stroke="#fff" stroke-width="3" d="M15 0C7.268 0 1 6.268 1 14c0 12.25 14 31 14 31s14-18.75 14-31C29 6.268 22.732 0 15 0z"/>
        <circle fill="#fff" cx="15" cy="14" r="8"/>
        <polygon fill="#ff4757" points="15,6 17,12 13,12"/>
        <circle fill="#ff4757" cx="15" cy="17" r="1.5"/>
      </svg>`;
      
      window.incidentIcon = new L.Icon({
        iconUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(incidentIconSVG),
        iconSize: [30, 46],
        iconAnchor: [15, 46],
        popupAnchor: [1, -40]
      });
      
      console.log('✅ ICONES CREADES CORRECTAMENT:', {
        userIcon: !!window.userIcon,
        currentUserIcon: !!window.currentUserIcon,
        adminIcon: !!window.adminIcon,
        incidentIcon: !!window.incidentIcon
      });
      
    } catch (error) {
      console.error('❌ ERROR creant icones:', error);
      
      // ✅ FALLBACK: Usar icones per defecte de Leaflet si falla
      console.log('🔄 Usant icones per defecte...');
      window.userIcon = new L.Icon.Default();
      window.currentUserIcon = new L.Icon.Default();
      window.adminIcon = new L.Icon.Default();
      window.incidentIcon = new L.Icon.Default();
    }
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

  // ✅ LISTENER USUARIS MILLORAT AMB ICONA ADMIN
  const listenToUsers = () => {
    console.log('👂 INICIANT LISTENER PER USUARIS...');
    
    const unsubscribe = onSnapshot(collection(db, 'userLocations'), async (snapshot) => {
      console.log(`🔥 FIREBASE: Rebudes ${snapshot.size} ubicacions d'usuaris`);
      
      if (snapshot.empty) {
        console.log('⚠️ Cap ubicació trobada a Firebase');
        return;
      }
      
      const usersData = [];
      
      for (const docSnapshot of snapshot.docs) {
        const location = docSnapshot.data();
        const userId = docSnapshot.id;
        const isCurrentUser = userId === currentUser?.uid;
        
        // ✅ OBTENIR INFORMACIÓ D'ADMIN DE CADA USUARI
        let userIsAdmin = false;
        let userIsSuperAdmin = false;
        try {
          const userDoc = await getDoc(doc(db, 'users', userId));
          const userData = userDoc.data();
          if (userData) {
            userIsAdmin = userData.isAdmin === true;
            userIsSuperAdmin = userData.isSuperAdmin === true;
          }
        } catch (error) {
          console.log('⚠️ No es pot obtenir info admin per', userId);
        }
        
        console.log(`📍 USUARI: ${location.userName} (${isCurrentUser ? 'TU' : 'ALTRE'}${userIsAdmin ? ' - ADMIN' : ''}${userIsSuperAdmin ? ' - SUPER' : ''})`, {
          lat: location.latitude,
          lng: location.longitude,
          timestamp: location.timestamp?.toDate?.()?.toLocaleTimeString() || 'No timestamp'
        });

        // ✅ ESPERAR QUE EL MAPA ESTIGUI LLEST
        const addMarkerWhenReady = () => {
          if (!mapInstanceRef.current) {
            console.log(`⏳ Mapa no llest, reintentant en 500ms per ${location.userName}...`);
            setTimeout(addMarkerWhenReady, 500);
            return;
          }

          // Eliminar marker anterior si existeix
          if (userMarkersRef.current[userId]) {
            console.log(`🗑️ Eliminant marker anterior per ${location.userName}`);
            if (mapInstanceRef.current.hasLayer(userMarkersRef.current[userId])) {
              mapInstanceRef.current.removeLayer(userMarkersRef.current[userId]);
            }
            delete userMarkersRef.current[userId];
          }

          // Crear icones si no existeixen
          if (!window.userIcon || !window.currentUserIcon || !window.adminIcon) {
            console.log('🎨 Creant icones perquè no existeixen...');
            createCustomIcons();
          }
          
          // ✅ SELECCIONAR ICONA SEGONS EL TIPUS D'USUARI
          let icon;
          if (isCurrentUser) {
            icon = userIsAdmin ? window.adminIcon : window.currentUserIcon;
          } else {
            icon = userIsAdmin ? window.adminIcon : window.userIcon;
          }
          
          console.log(`🎯 Creant marker per ${location.userName} amb icona:`, icon ? 'OK' : 'ERROR', userIsAdmin ? '(ADMIN)' : '(USER)');
          
          try {
            const marker = L.marker([location.latitude, location.longitude], {
              icon: icon
            }).addTo(mapInstanceRef.current);
            
            userMarkersRef.current[userId] = marker;

            // ✅ POPUP AMB INFORMACIÓ MILLORADA
            const userTypeLabel = isCurrentUser 
              ? (userIsAdmin ? '👑 Tu (Admin)' : '📍 Tu') 
              : (userIsAdmin ? '👑 ' + location.userName + ' (Admin)' : '👤 ' + location.userName);
            
            const userTypeColor = isCurrentUser 
              ? (userIsAdmin ? '#3742fa' : '#2ed573')
              : (userIsAdmin ? '#3742fa' : '#ffd02e');

            marker.bindPopup(`
              <div style="text-align: center; padding: 0.5rem;">
                <strong style="color: ${userTypeColor};">
                  ${userTypeLabel}
                </strong><br>
                ${userIsAdmin ? '<small style="color: #3742fa; font-weight: bold;">ADMINISTRADOR</small><br>' : ''}
                <small style="color: #666;">
                  Última actualització:<br>
                  ${location.timestamp ? new Date(location.timestamp.toDate()).toLocaleTimeString() : 'Ara'}
                </small>
              </div>
            `);
            
            console.log(`✅ MARKER CREAT CORRECTAMENT per ${location.userName} ${userIsAdmin ? '(ADMIN)' : '(USER)'}`);
            
          } catch (error) {
            console.error(`❌ ERROR creant marker per ${location.userName}:`, error);
          }
        };

        // Iniciar el procés d'afegir marker
        addMarkerWhenReady();

        // Guardar per la llista d'admin
        if (isAdmin) {
          usersData.push({
            ...location,
            id: userId,
            isCurrentUser,
            isAdmin: userIsAdmin,
            isSuperAdmin: userIsSuperAdmin,
            online: isUserOnline(location.timestamp)
          });
        }
      }

      // Actualitzar llista si som admin
      if (isAdmin) {
        setUsers(usersData);
        console.log(`👑 ADMIN: Llista usuaris actualitzada amb ${usersData.length} usuaris`);
      }
      
    }, (error) => {
      console.error('❌ ERROR escoltant usuaris:', error);
      showNotification('Error carregant ubicacions d\'usuaris', 'error');
    });

    return unsubscribe;
  };

  // ✅ LISTENER INCIDÈNCIES COMPLETAMENT REESCRIT I MILLORAT
  const listenToIncidents = () => {
    console.log('🚨 INICIANT LISTENER PER INCIDÈNCIES...');
    
    const q = query(collection(db, 'incidents'), where('resolved', '==', false));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`🚨 FIREBASE: Rebudes ${snapshot.size} incidències actives`);
      
      const incidentsData = [];
      
      // ✅ NETEJAR TOTS ELS MARKERS D'INCIDÈNCIES EXISTENTS
      console.log('🧹 Netejant markers d\'incidències existents...');
      Object.keys(incidentMarkersRef.current).forEach(incidentId => {
        const marker = incidentMarkersRef.current[incidentId];
        if (mapInstanceRef.current && marker && mapInstanceRef.current.hasLayer(marker)) {
          mapInstanceRef.current.removeLayer(marker);
          console.log(`🗑️ Marker d'incidència ${incidentId} eliminat`);
        }
        delete incidentMarkersRef.current[incidentId];
      });

      // ✅ PROCESSAR CADA INCIDÈNCIA I CREAR MARKERS
      snapshot.forEach((doc) => {
        const incident = { id: doc.id, ...doc.data() };
        incidentsData.push(incident);

        console.log(`🚨 PROCESSANT INCIDÈNCIA: ${incident.userName} a [${incident.location?.latitude}, ${incident.location?.longitude}]`);

        // ✅ AFEGIR MARKER QUAN EL MAPA ESTIGUI LLEST
        const addIncidentMarkerWhenReady = () => {
          if (!mapInstanceRef.current) {
            console.log(`⏳ Mapa no llest per incidència ${incident.id}, reintentant en 500ms...`);
            setTimeout(addIncidentMarkerWhenReady, 500);
            return;
          }

          if (!incident.location || !incident.location.latitude || !incident.location.longitude) {
            console.log(`⚠️ Incidència ${incident.id} sense ubicació vàlida:`, incident.location);
            return;
          }

          // Crear icona si no existeix
          if (!window.incidentIcon) {
            console.log('🎨 Creant icona incidència...');
            createCustomIcons();
            
            // Esperar una mica perquè es creï la icona
            setTimeout(addIncidentMarkerWhenReady, 100);
            return;
          }

          try {
            console.log(`🚨 CREANT MARKER per incidència ${incident.id} a [${incident.location.latitude}, ${incident.location.longitude}]`);
            
            const marker = L.marker([incident.location.latitude, incident.location.longitude], {
              icon: window.incidentIcon,
              zIndexOffset: 1000 // ✅ Posar les incidències per damunt
            }).addTo(mapInstanceRef.current);

            // ✅ GUARDAR REFERÈNCIA AL MARKER
            incidentMarkersRef.current[incident.id] = marker;

            // ✅ POPUP AMB INFORMACIÓ DETALLADA
            const popupContent = `
              <div style="text-align: center; padding: 0.5rem; min-width: 200px;">
                <strong style="color: #ff4757; font-size: 16px;">🚨 INCIDÈNCIA</strong><br><br>
                <strong>Usuari:</strong> ${incident.userName}<br>
                <strong>Missatge:</strong><br>
                <em style="color: #333;">${incident.message || 'Incidència reportada sense missatge'}</em><br><br>
                <small style="color: #666;">
                  <strong>Reportada:</strong><br>
                  ${incident.timestamp ? new Date(incident.timestamp.toDate()).toLocaleString() : 'Data desconeguda'}
                </small>
                ${isAdmin ? `<br><br><button onclick="window.resolveIncidentFromMap('${incident.id}')" style="background: #2ed573; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">✅ Resoldre</button>` : ''}
              </div>
            `;

            marker.bindPopup(popupContent, {
              maxWidth: 250,
              className: 'incident-popup'
            });

            console.log(`✅ MARKER D'INCIDÈNCIA ${incident.id} CREAT CORRECTAMENT per ${incident.userName}`);
            
          } catch (error) {
            console.error(`❌ ERROR creant marker d'incidència ${incident.id}:`, error);
          }
        };

        // Iniciar procés de creació de marker
        addIncidentMarkerWhenReady();
      });

      // ✅ ACTUALITZAR ESTAT D'INCIDÈNCIES
      setIncidents(incidentsData);
      console.log(`🚨 ${incidentsData.length} incidències carregades al state i ${Object.keys(incidentMarkersRef.current).length} markers creats`);
      
      // ✅ DEBUG FINAL
      setTimeout(() => {
        if (mapInstanceRef.current) {
          let totalIncidentMarkers = 0;
          mapInstanceRef.current.eachLayer(layer => {
            if (layer.options && layer.options.icon === window.incidentIcon) {
              totalIncidentMarkers++;
            }
          });
          console.log(`📊 VERIFICACIÓ FINAL: ${totalIncidentMarkers} markers d'incidències visibles al mapa`);
        }
      }, 1000);
      
    }, (error) => {
      console.error('❌ ERROR escoltant incidències:', error);
      showNotification('Error carregant incidències', 'error');
    });

    return unsubscribe;
  };

  // ✅ FUNCIÓ GLOBAL PER RESOLDRE INCIDÈNCIES DES DEL POPUP
  useEffect(() => {
    window.resolveIncidentFromMap = async (incidentId) => {
      console.log('🎯 Resolent incidència des del mapa:', incidentId);
      await resolveIncident(incidentId);
    };
    
    return () => {
      delete window.resolveIncidentFromMap;
    };
  }, []);

  const isUserOnline = (timestamp) => {
    if (!timestamp) return false;
    const now = new Date();
    const lastUpdate = timestamp.toDate();
    return (now - lastUpdate) < 300000;
  };

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

          <div className="flex mb-6 rounded-2xl overflow-hidden bg-gray-100">
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
                        <strong className="text-gray-800">
                          {user.isAdmin ? '👑 ' : ''}{user.userName} 
                          {user.isCurrentUser && ' (Tu)'}
                          {user.isAdmin && ' (Admin)'}
                        </strong>
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
                Incidències Actives ({incidents.length})
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
                      {incident.location && (
                        <p className="text-gray-500 text-xs mt-1">
                          📍 {incident.location.latitude.toFixed(6)}, {incident.location.longitude.toFixed(6)}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
            <div 
              id="map"
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
          <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-24 mb-6">
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

          {/* Incidents Panel for Users - Shows active incidents */}
          {incidents.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-96">
              <h3 className="text-lg font-bold mb-4 border-b-2 border-red-500 pb-2">
                🚨 Incidències Actives ({incidents.length})
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {incidents.map((incident) => (
                  <div key={incident.id} className="bg-red-50 p-3 rounded-lg border-l-4 border-red-500">
                    <div className="flex items-center justify-between mb-1">
                      <strong className="text-red-600 text-sm">🚨 {incident.userName}</strong>
                      <span className="text-xs text-gray-500">
                        {incident.timestamp ? new Date(incident.timestamp.toDate()).toLocaleTimeString() : 'Ara'}
                      </span>
                    </div>
                    <p className="text-gray-700 text-xs">{incident.message || 'Incidència reportada'}</p>
                    {incident.location && (
                      <p className="text-gray-500 text-xs mt-1">
                        📍 Veure al mapa
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="relative">
              <div 
                id="map"
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

              {/* Incidents Counter */}
              {incidents.length > 0 && (
                <div className="absolute top-4 right-4 bg-red-500 bg-opacity-95 px-4 py-2 rounded-xl shadow-lg">
                  <span className="text-white text-sm font-bold">
                    🚨 {incidents.length} Incidència{incidents.length !== 1 ? 's' : ''} activa{incidents.length !== 1 ? 's' : ''}
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
