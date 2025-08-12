import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';

// Firebase REAL imports (descomenta't)
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';

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
const auth = getAuth(app);
const db = getFirestore(app);

const SUPER_ADMIN_UID = 's1UefGdgQphElib4KWmDsQj1uor2'; // El teu UID real

const BikeGPSApp = () => {
  // State management
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [users, setUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [authTab, setAuthTab] = useState('login');
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [routeProgress, setRouteProgress] = useState(0);
  const [isReturning, setIsReturning] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [showAdminManagement, setShowAdminManagement] = useState(false);

  // Refs
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const watchIdRef = useRef(null);
  const userMarkersRef = useRef({});
  const incidentMarkersRef = useRef({});
  const routePolylinesRef = useRef([]);
  const hasSetInitialLocationRef = useRef(false);
  const listenersRef = useRef({ users: null, incidents: null });

  // Initialize auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('🔐 AUTH STATE CHANGED:', user ? `Usuari connectat: ${user.uid}` : 'Usuari desconnectat');
      
      if (user) {
        setCurrentUser(user);
        await checkAdminStatus(user);
      } else {
        // LOGOUT REAL - netejar tot
        console.log('🚪 NETEJANT ESTAT PER LOGOUT...');
        setCurrentUser(null);
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setCurrentRoute(null);
        setRoutes([]);
        setUsers([]);
        setAllUsers([]);
        setIncidents([]);
        setRouteProgress(0);
        setIsReturning(false);
        setLoading(false);
        
        // Netejar mapa
        if (mapInstanceRef.current) {
          clearRoutePolylines();
          Object.values(userMarkersRef.current).forEach(marker => {
            if (mapInstanceRef.current.hasLayer(marker)) {
              mapInstanceRef.current.removeLayer(marker);
            }
          });
          Object.values(incidentMarkersRef.current).forEach(marker => {
            if (mapInstanceRef.current.hasLayer(marker)) {
              mapInstanceRef.current.removeLayer(marker);
            }
          });
          userMarkersRef.current = {};
          incidentMarkersRef.current = {};
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Listeners separats per usuaris i incidències
  useEffect(() => {
    if (!currentUser) {
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
    
    if (!listenersRef.current.users) {
      console.log('👂 Iniciant listener usuaris...');
      listenersRef.current.users = listenToUsers();
    }
    
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
  }, [currentUser]);

  // Mapa
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
        
        console.log('🎨 Creant icones personalitzades...');
        createCustomIcons();
        
      } catch (error) {
        console.error('❌ Error initializing map:', error);
        showNotification('Error carregant mapa', 'error');
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [currentUser]);

  // Neteja del mapa
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        console.log('🧹 Netejant mapa...');
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Càrrega de dades
  useEffect(() => {
    if (currentUser) {
      console.log('📚 Carregant rutes per usuari connectat...');
      loadRoutes();
      
      if (isSuperAdmin) {
        loadAllUsers();
      }
      
      if (!watchIdRef.current) {
        console.log('📍 Iniciant seguiment ubicació...');
        startLocationTracking();
      }
    }
    
    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [currentUser, isSuperAdmin]);
  
  const checkAdminStatus = async (user) => {
    try {
      console.log('👑 Verificant estat admin per:', user.uid);
      
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      const userData = userDoc.exists() ? userDoc.data() : null;
      
      const isSuperAdminUser = user.uid === SUPER_ADMIN_UID;
      console.log('🔍 Es SuperAdmin?', isSuperAdminUser, 'UID:', user.uid);
      
      if (isSuperAdminUser) {
        setIsAdmin(true);
        setIsSuperAdmin(true);
        if (!userData) {
          await setDoc(userDocRef, {
            name: user.displayName || user.email,
            email: user.email,
            isAdmin: true,
            isSuperAdmin: true
          });
        }
        console.log('👑 SuperAdmin configurat correctament');
      } else if (userData) {
        setIsAdmin(userData.isAdmin === true);
        setIsSuperAdmin(userData.isSuperAdmin === true);
        console.log('👤 Usuari existent:', userData.isAdmin ? 'Admin' : 'User');
      } else {
        await setDoc(userDocRef, {
          name: user.displayName || user.email,
          email: user.email,
          isAdmin: false,
          isSuperAdmin: false
        });
        setIsAdmin(false);
        setIsSuperAdmin(false);
        console.log('👤 Nou usuari regular creat');
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error checking admin status:', error);
      showNotification('Error carregant aplicació: ' + error.message, 'error');
      setLoading(false);
    }
  };

  // Carregar tots els usuaris (només SuperAdmin)
  const loadAllUsers = async () => {
    if (!isSuperAdmin) return;
    
    try {
      console.log('👥 Carregant tots els usuaris...');
      const usersQuery = query(collection(db, 'users'), where('isAdmin', '>=', false));
      const usersSnapshot = await getDocs(usersQuery);
      const usersData = [];
      usersSnapshot.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() });
      });
      setAllUsers(usersData);
      console.log('👥 Usuaris carregats:', usersData.length);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  // Fer admin a un usuari (només SuperAdmin)
  const makeUserAdmin = async (userId, makeAdmin = true) => {
    if (!isSuperAdmin) {
      showNotification('Només el SuperAdmin pot fer això', 'error');
      return;
    }
    
    try {
      const userDocRef = doc(db, 'users', userId);
      await updateDoc(userDocRef, {
        isAdmin: makeAdmin
      });
      
      showNotification(`Usuari ${makeAdmin ? 'promogut a' : 'degradat de'} administrador`, 'success');
      loadAllUsers(); // Recarregar llista
    } catch (error) {
      console.error('Error updating user admin status:', error);
      showNotification('Error actualitzant usuari', 'error');
    }
  };

  // Icones personalitzades
  const createCustomIcons = () => {
    console.log('🎨 CREANT ICONES PERSONALITZADES...');
    
    try {
      window.userIcon = L.divIcon({
        className: 'custom-user-marker',
        html: '<div style="background: linear-gradient(145deg, #ffd02e, #ffcc00); border: 3px solid #fff; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(255,208,46,0.5);"><span style="font-size: 12px; color: #1a1a1a;">👤</span></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      window.currentUserIcon = L.divIcon({
        className: 'custom-current-user-marker',
        html: '<div style="background: linear-gradient(145deg, #2ed573, #26d0ce); border: 3px solid #fff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(46,213,115,0.6);"><span style="font-size: 14px; color: white;">📍</span></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      window.incidentIcon = L.divIcon({
        className: 'custom-incident-marker',
        html: '<div style="background: linear-gradient(145deg, #ff4757, #ff3838); border: 3px solid #fff; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(255, 71, 87, 0.5); animation: pulse 2s infinite;"><span style="color: white; font-size: 16px;">🚨</span></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      
      console.log('✅ ICONES CREADES CORRECTAMENT');
      
    } catch (error) {
      console.error('❌ ERROR creant icones:', error);
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
      const userDocRef = doc(db, 'users', userCredential.user.uid);
      await setDoc(userDocRef, {
        name: name,
        email: email,
        isAdmin: false
      });
      showNotification('Usuari registrat correctament!', 'success');
    } catch (error) {
      console.error('Error register:', error);
      showNotification('Error: ' + error.message, 'error');
    }
  };

  // Processament GPX real
  const parseGPX = (gpxText) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(gpxText, 'text/xml');
      
      // Buscar punts de ruta
      const trkpts = xmlDoc.querySelectorAll('trkpt');
      const waypoints = xmlDoc.querySelectorAll('wpt');
      
      let coordinates = [];
      
      // Primer trackar punts de track
      trkpts.forEach(point => {
        const lat = parseFloat(point.getAttribute('lat'));
        const lon = parseFloat(point.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lon)) {
          coordinates.push([lat, lon]);
        }
      });
      
      // Si no hi ha track points, usar waypoints
      if (coordinates.length === 0) {
        waypoints.forEach(point => {
          const lat = parseFloat(point.getAttribute('lat'));
          const lon = parseFloat(point.getAttribute('lon'));
          if (!isNaN(lat) && !isNaN(lon)) {
            coordinates.push([lat, lon]);
          }
        });
      }
      
      return coordinates;
    } catch (error) {
      console.error('Error parsing GPX:', error);
      throw new Error('Format GPX no vàlid');
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

      // Llegir arxiu GPX REAL
      const gpxText = await gpxFile.text();
      setUploadProgress(50);
      
      // Processar GPX REAL
      const coordinates = parseGPX(gpxText);
      setUploadProgress(80);
      
      if (coordinates.length === 0) {
        throw new Error('No s\'han trobat coordenades vàlides al GPX');
      }
      
      console.log('📍 Coordenades extretes del GPX:', coordinates.length, 'punts');
      
      const routeData = {
        name: name,
        description: description,
        coordinates: coordinates,
        createdBy: currentUser.uid,
        gpxFileName: gpxFile.name,
        pointsCount: coordinates.length,
        createdAt: serverTimestamp()
      };
      
      // Guardar ruta REAL a Firebase
      const docRef = await addDoc(collection(db, 'routes'), routeData);
      console.log('✅ Ruta guardada amb ID:', docRef.id);

      setUploadProgress(100);
      showNotification(`✅ Ruta "${name}" creada correctament amb ${coordinates.length} punts!`, 'success');

      e.target.reset();
      setTimeout(() => {
        setShowUploadProgress(false);
        setUploadProgress(0);
        loadRoutes(); // Recarregar rutes
      }, 1000);

    } catch (error) {
      setShowUploadProgress(false);
      setUploadProgress(0);
      console.error('Error creating route:', error);
      showNotification('Error creant ruta: ' + error.message, 'error');
    }
  };

  const loadRoutes = async () => {
    try {
      console.log('📚 Carregant totes les rutes...');
      const routesSnapshot = await getDocs(collection(db, 'routes'));
      const routesData = [];
      routesSnapshot.forEach((doc) => {
        routesData.push({ id: doc.id, ...doc.data() });
      });
      console.log('📚 Rutes carregades:', routesData.length);
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
        console.log('🗑️ Eliminant ruta:', routeId);
        
        // Aquest cop eliminem de Firebase real
        const routeDocRef = doc(db, 'routes', routeId);
        await updateDoc(routeDocRef, {
          deleted: true,
          deletedAt: serverTimestamp()
        });
        
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

  // Listener usuaris millorat amb Firebase real
  const listenToUsers = () => {
    console.log('👂 INICIANT LISTENER PER USUARIS...');
    
    const unsubscribe = onSnapshot(collection(db, 'userLocations'), async (snapshot) => {
      console.log(`🔥 FIREBASE: Rebudes ubicacions d'usuaris`);
      
      const usersData = [];
      
      snapshot.forEach(async (docSnapshot) => {
        const location = docSnapshot.data();
        const userId = docSnapshot.id;
        const isCurrentUser = userId === currentUser?.uid;
        
        // Comprovar si és admin
        const userIsAdmin = userId === 'admin1' || userId === currentUser?.uid;
        
        console.log(`📍 USUARI: ${location.userName} (${isCurrentUser ? 'TU' : 'ALTRE'}${userIsAdmin ? ' - ADMIN' : ''})`, {
          lat: location.latitude,
          lng: location.longitude,
          timestamp: location.timestamp?.toDate?.()?.toLocaleTimeString() || 'No timestamp'
        });

        const addMarkerWhenReady = () => {
          if (!mapInstanceRef.current) {
            console.log(`⏳ Mapa no llest, reintentant en 500ms per ${location.userName}...`);
            setTimeout(addMarkerWhenReady, 500);
            return;
          }

          if (userMarkersRef.current[userId]) {
            console.log(`🗑️ Eliminant marker anterior per ${location.userName}`);
            if (mapInstanceRef.current.hasLayer(userMarkersRef.current[userId])) {
              mapInstanceRef.current.removeLayer(userMarkersRef.current[userId]);
            }
            delete userMarkersRef.current[userId];
          }

          if (!window.userIcon || !window.currentUserIcon) {
            console.log('🎨 Creant icones perquè no existeixen...');
            createCustomIcons();
          }
          
          const icon = isCurrentUser ? window.currentUserIcon : window.userIcon;
          
          console.log(`🎯 Creant marker per ${location.userName} amb icona:`, icon ? 'OK' : 'ERROR', userIsAdmin ? '(ADMIN)' : '(USER)');
          
          try {
            const marker = L.marker([location.latitude, location.longitude], {
              icon: icon
            }).addTo(mapInstanceRef.current);
            
            userMarkersRef.current[userId] = marker;

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

        addMarkerWhenReady();

        if (isAdmin) {
          usersData.push({
            ...location,
            id: userId,
            isCurrentUser,
            isAdmin: userIsAdmin,
            online: isUserOnline(location.timestamp)
          });
        }
      });

      if (isAdmin) {
        setUsers(usersData);
        console.log(`👑 ADMIN: Llista usuaris actualitzada amb ${usersData.length} usuaris`);
      }
      
    });

    return unsubscribe;
  };

  // Listener incidències millorat amb Firebase real
  const listenToIncidents = () => {
    console.log('🚨 INICIANT LISTENER PER INCIDÈNCIES...');
    
    const incidentsQuery = query(collection(db, 'incidents'), where('resolved', '==', false));
    const unsubscribe = onSnapshot(incidentsQuery, (snapshot) => {
      console.log(`🚨 FIREBASE: Rebudes incidències actives`);
      
      const incidentsData = [];
      
      console.log('🧹 Netejant markers d\'incidències existents...');
      Object.keys(incidentMarkersRef.current).forEach(incidentId => {
        const marker = incidentMarkersRef.current[incidentId];
        if (mapInstanceRef.current && marker && mapInstanceRef.current.hasLayer(marker)) {
          mapInstanceRef.current.removeLayer(marker);
          console.log(`🗑️ Marker d'incidència ${incidentId} eliminat`);
        }
        delete incidentMarkersRef.current[incidentId];
      });

      snapshot.forEach((doc) => {
        const incident = { id: doc.id, ...doc.data() };
        
        incidentsData.push(incident);

        console.log(`🚨 PROCESSANT INCIDÈNCIA ACTIVA: ${incident.userName} a [${incident.location?.latitude}, ${incident.location?.longitude}]`);

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

          if (!window.incidentIcon) {
            console.log('🎨 Creant icona incidència...');
            createCustomIcons();
            
            setTimeout(addIncidentMarkerWhenReady, 100);
            return;
          }

          try {
            console.log(`🚨 CREANT MARKER per incidència ${incident.id} a [${incident.location.latitude}, ${incident.location.longitude}]`);
            
            const marker = L.marker([incident.location.latitude, incident.location.longitude], {
              icon: window.incidentIcon,
              zIndexOffset: 1000
            }).addTo(mapInstanceRef.current);

            incidentMarkersRef.current[incident.id] = marker;

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

        addIncidentMarkerWhenReady();
      });

      setIncidents(incidentsData);
      console.log(`🚨 ${incidentsData.length} incidències NO RESOLTES carregades al state`);
      
    });

    return unsubscribe;
  };

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
    
    const options = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    };

    const success = (position) => {
      const { latitude, longitude } = position.coords;
      console.log('📍 Nova posició rebuda:', latitude, longitude);
      updateUserLocation(latitude, longitude);
    };

    const error = (err) => {
      console.error('❌ Error geolocalització:', err);
      // Fallback a posició simulada
      updateUserLocation(41.6722, 2.4540);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(success, error, options);
  };

  const updateUserLocation = async (lat, lng) => {
    if (!currentUser) return;
    try {
      console.log('📍 Actualitzant ubicació a Firebase:', lat, lng);
      
      // Actualitzar ubicació a Firebase
      const userLocationRef = doc(db, 'userLocations', currentUser.uid);
      await setDoc(userLocationRef, {
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.email || 'Usuari Anònim',
        latitude: lat,
        longitude: lng,
        timestamp: serverTimestamp()
      }, { merge: true });
      
      if (!hasSetInitialLocationRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.setView([lat, lng], 15);
        hasSetInitialLocationRef.current = true;
      }
    } catch (error) {
      console.error('❌ Error actualitzant ubicació:', error);
    }
  };

  const reportIncident = async () => {
    const message = prompt('Descriu la incidència (opcional):');
    
    try {
      console.log('🚨 Reportant incidència...');
      
      // Obtenir ubicació actual real
      navigator.geolocation.getCurrentPosition(async (position) => {
        const currentLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        
        const incidentData = {
          userName: currentUser.displayName || currentUser.email || 'Usuari Anònim',
          message: message || 'Incidència reportada sense missatge',
          location: currentLocation,
          timestamp: serverTimestamp(),
          resolved: false,
          reportedBy: currentUser.uid
        };
        
        // Guardar incidència REAL a Firebase
        await addDoc(collection(db, 'incidents'), incidentData);
        
        showNotification('🚨 Incidència reportada! Els administradors han estat notificats.', 'success');
      }, (error) => {
        console.error('Error obtenint ubicació per incidència:', error);
        // Fallback amb ubicació simulada
        const fallbackLocation = {
          latitude: 41.6722 + (Math.random() - 0.5) * 0.01,
          longitude: 2.4540 + (Math.random() - 0.5) * 0.01
        };
        
        const incidentData = {
          userName: currentUser.displayName || currentUser.email || 'Usuari Anònim',
          message: message || 'Incidència reportada sense missatge',
          location: fallbackLocation,
          timestamp: serverTimestamp(),
          resolved: false,
          reportedBy: currentUser.uid
        };
        
        addDoc(collection(db, 'incidents'), incidentData);
        showNotification('🚨 Incidència reportada! Els administradors han estat notificats.', 'success');
      });
    } catch (error) {
      console.error('Error reporting incident:', error);
      showNotification('Error reportant incidència', 'error');
    }
  };

  const resolveIncident = async (incidentId) => {
    if (!isAdmin) {
      showNotification('Només els administradors poden resoldre incidències', 'error');
      return;
    }
    
    try {
      console.log('✅ Resolent incidència:', incidentId);
      
      // Marcar com a resolta a Firebase
      const incidentDocRef = doc(db, 'incidents', incidentId);
      await updateDoc(incidentDocRef, {
        resolved: true,
        resolvedBy: currentUser.uid,
        resolvedAt: serverTimestamp()
      });
      
      // Eliminar marker del mapa immediatament
      if (incidentMarkersRef.current[incidentId]) {
        const marker = incidentMarkersRef.current[incidentId];
        if (mapInstanceRef.current && mapInstanceRef.current.hasLayer(marker)) {
          mapInstanceRef.current.removeLayer(marker);
        }
        delete incidentMarkersRef.current[incidentId];
        console.log('🗑️ Marker d\'incidència eliminat del mapa');
      }
      
      // Actualitzar state eliminant la incidència resolta
      setIncidents(prev => prev.filter(inc => inc.id !== incidentId));
      
      showNotification('✅ Incidència resolta correctament', 'success');
    } catch (error) {
      console.error('Error resolving incident:', error);
      showNotification('Error resolent incidència', 'error');
    }
  };

  const handleLogout = async () => {
    try {
      console.log('🚪 Iniciant logout...');
      
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
      
      // CRIDAR FIREBASE LOGOUT REAL
      await signOut(auth);
      console.log('✅ Firebase signOut cridat');
      
      showNotification('Sessió tancada correctament', 'success');
    } catch (error) {
      console.error('Error signing out:', error);
      showNotification('Error tancant sessió', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{
        background: '#f0f0f3'
      }}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-yellow-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-gray-700">Inicialitzant BikeGPS...</p>
        </div>
      </div>
    );
  }

  // Auth screen amb disseny neomòrfic
  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{
        background: '#f0f0f3'
      }}>
        <div className="w-full max-w-md p-8 rounded-2xl" style={{
          background: '#f0f0f3',
          boxShadow: '8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff'
        }}>
          <h2 className="text-3xl font-bold text-center mb-8">
            <span style={{color: '#ffd02e'}}>Bike</span>
            <span style={{color: '#1a1a1a'}}>GPS</span>
          </h2>

          <div className="flex mb-6 rounded-2xl overflow-hidden" style={{
            background: '#f0f0f3',
            boxShadow: 'inset 4px 4px 8px #d1d1d4, inset -4px -4px 8px #ffffff'
          }}>
            <button
              className={`flex-1 p-3 font-semibold transition-all ${
                authTab === 'login' 
                  ? 'text-gray-800' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
              style={{
                background: authTab === 'login' ? 'linear-gradient(145deg, #ffe347, #e6b800)' : 'transparent'
              }}
              onClick={() => setAuthTab('login')}
            >
              Login
            </button>
            <button
              className={`flex-1 p-3 font-semibold transition-all ${
                authTab === 'register' 
                  ? 'text-gray-800' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
              style={{
                background: authTab === 'register' ? 'linear-gradient(145deg, #ffe347, #e6b800)' : 'transparent'
              }}
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
                  className="w-full p-3 rounded-xl border-none"
                  style={{
                    background: 'transparent',
                    boxShadow: 'inset 4px 4px 8px #d1d1d4, inset -4px -4px 8px #ffffff',
                    outline: 'none'
                  }}
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
                  className="w-full p-3 rounded-xl border-none"
                  style={{
                    background: 'transparent',
                    boxShadow: 'inset 4px 4px 8px #d1d1d4, inset -4px -4px 8px #ffffff',
                    outline: 'none'
                  }}
                />
              </div>
              <button
                type="submit"
                className="w-full font-semibold py-3 px-4 rounded-xl transition-all border-none text-gray-800"
                style={{
                  background: 'linear-gradient(145deg, #ffe347, #e6b800)',
                  boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
                }}
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
                  className="w-full p-3 rounded-xl border-none"
                  style={{
                    background: 'transparent',
                    boxShadow: 'inset 4px 4px 8px #d1d1d4, inset -4px -4px 8px #ffffff',
                    outline: 'none'
                  }}
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
                  className="w-full p-3 rounded-xl border-none"
                  style={{
                    background: 'transparent',
                    boxShadow: 'inset 4px 4px 8px #d1d1d4, inset -4px -4px 8px #ffffff',
                    outline: 'none'
                  }}
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
                  className="w-full p-3 rounded-xl border-none"
                  style={{
                    background: 'transparent',
                    boxShadow: 'inset 4px 4px 8px #d1d1d4, inset -4px -4px 8px #ffffff',
                    outline: 'none'
                  }}
                />
              </div>
              <button
                type="submit"
                className="w-full font-semibold py-3 px-4 rounded-xl transition-all border-none text-gray-800"
                style={{
                  background: 'linear-gradient(145deg, #ffe347, #e6b800)',
                  boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
                }}
              >
                Registrar-se
              </button>
            </form>
          )}
        </div>

        {/* Notification */}
        {notification && (
          <div className={`fixed top-4 right-4 p-4 rounded-xl shadow-lg z-50 max-w-sm transition-all ${
            notification.type === 'error' ? 'text-white' : 
            notification.type === 'success' ? 'text-white' : 
            'text-white'
          }`} style={{
            background: notification.type === 'error' ? 'linear-gradient(145deg, #ff6b6b, #ee5a52)' : 
                       notification.type === 'success' ? 'linear-gradient(145deg, #2ed573, #26d0ce)' : 
                       '#f0f0f3',
            boxShadow: '8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff'
          }}>
            {notification.message}
          </div>
        )}
      </div>
    );
  }

  // Admin Dashboard amb disseny neomòrfic i gestió d'admins
  if (isAdmin) {
    return (
      <div className="min-h-screen" style={{background: '#f0f0f3'}}>
        {/* Header */}
        <header className="sticky top-0 z-50 px-6 py-4" style={{
          background: '#f0f0f3',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">
              <span style={{color: '#ffd02e'}}>BikeGPS</span>
              <span style={{color: '#1a1a1a'}}> Admin</span>
              {isSuperAdmin && <span className="ml-2">👑</span>}
            </h1>
            <div className="flex items-center gap-4">
              {isSuperAdmin && (
                <button
                  onClick={() => setShowAdminManagement(!showAdminManagement)}
                  className="px-4 py-2 rounded-lg font-semibold text-white border-none transition-all"
                  style={{
                    background: 'linear-gradient(145deg, #3742fa, #2f3542)',
                    boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
                  }}
                >
                  👥 Gestió Usuaris
                </button>
              )}
              <span style={{color: '#1a1a1a'}}>
                Hola, {currentUser.displayName || currentUser.email} {isSuperAdmin && '(Super Admin)'}
              </span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg font-semibold text-white border-none transition-all"
                style={{
                  background: 'linear-gradient(145deg, #2a2a2a, #1a1a1a)',
                  boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
                }}
              >
                Sortir
              </button>
            </div>
          </div>
        </header>

        <div className="p-6">
          {/* Admin Management Panel (només SuperAdmin) */}
          {isSuperAdmin && showAdminManagement && (
            <div className="p-6 mb-6 rounded-2xl" style={{
              background: '#f0f0f3',
              boxShadow: '8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff'
            }}>
              <h2 className="text-xl font-bold mb-4 text-gray-800">👑 Gestió d'Administradors</h2>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {allUsers.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Carregant usuaris...</p>
                ) : (
                  allUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-4 rounded-lg" style={{
                      background: '#f0f0f3',
                      boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
                    }}>
                      <div>
                        <strong className="text-gray-800">
                          {user.isSuperAdmin ? '👑 ' : user.isAdmin ? '👑 ' : '👤 '}
                          {user.name || user.email}
                        </strong>
                        <div className="text-gray-500 text-sm">
                          {user.email} 
                          {user.isSuperAdmin ? ' (SuperAdmin)' : user.isAdmin ? ' (Admin)' : ' (Usuari)'}
                        </div>
                      </div>
                      {!user.isSuperAdmin && (
                        <button
                          onClick={() => makeUserAdmin(user.id, !user.isAdmin)}
                          className={`px-4 py-2 rounded-lg font-semibold text-white border-none transition-all ${
                            user.isAdmin ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                          }`}
                          style={{
                            background: user.isAdmin 
                              ? 'linear-gradient(145deg, #ff6b6b, #ee5a52)' 
                              : 'linear-gradient(145deg, #2ed573, #26d0ce)',
                            boxShadow: '2px 2px 4px #d1d1d4, -2px -2px 4px #ffffff'
                          }}
                        >
                          {user.isAdmin ? '❌ Treure Admin' : '✅ Fer Admin'}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Route Creation */}
          <div className="p-6 mb-6 rounded-2xl" style={{
            background: '#f0f0f3',
            boxShadow: '8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff'
          }}>
            <h2 className="text-xl font-bold mb-4 text-gray-800">Crear Nova Ruta (GPX)</h2>
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
                    className="w-full p-3 rounded-xl border-none"
                    style={{
                      background: 'transparent',
                      boxShadow: 'inset 4px 4px 8px #d1d1d4, inset -4px -4px 8px #ffffff',
                      outline: 'none'
                    }}
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
                    className="w-full p-3 rounded-xl border-none"
                    style={{
                      background: 'transparent',
                      boxShadow: 'inset 4px 4px 8px #d1d1d4, inset -4px -4px 8px #ffffff',
                      outline: 'none'
                    }}
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
                  className="w-full p-3 rounded-xl border-none resize-none"
                  style={{
                    background: 'transparent',
                    boxShadow: 'inset 4px 4px 8px #d1d1d4, inset -4px -4px 8px #ffffff',
                    outline: 'none'
                  }}
                />
              </div>
              
              {showUploadProgress && (
                <div className="w-full h-2 rounded-full overflow-hidden" style={{
                  background: '#d1d1d4'
                }}>
                  <div 
                    className="h-full transition-all duration-300 rounded-full"
                    style={{ 
                      width: `${uploadProgress}%`,
                      background: 'linear-gradient(90deg, #ffd02e, #ffeb3b)'
                    }}
                  ></div>
                </div>
              )}
              
              <button
                type="submit"
                disabled={showUploadProgress}
                className="font-semibold py-3 px-6 rounded-xl transition-all border-none text-gray-800 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(145deg, #ffe347, #e6b800)',
                  boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
                }}
              >
                {showUploadProgress ? 'Creant Ruta...' : 'Crear Ruta'}
              </button>
            </form>
          </div>

          {/* Admin Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            {/* Routes List */}
            <div className="p-6 rounded-2xl" style={{
              background: '#f0f0f3',
              boxShadow: '8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff'
            }}>
              <h3 className="text-lg font-bold mb-4 pb-2 border-b-2 border-yellow-400">
                Rutes Disponibles
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {routes.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No hi ha rutes creades</p>
                ) : (
                  routes.map((route) => (
                    <div key={route.id} className="p-4 rounded-lg border-l-4 border-yellow-400 cursor-pointer transition-all hover:transform hover:scale-105" style={{
                      background: '#f0f0f3',
                      boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
                    }}>
                      <h4 className="font-semibold mb-1 text-gray-800">{route.name}</h4>
                      <p className="text-gray-600 text-sm mb-2">{route.description || 'Sense descripció'}</p>
                      {route.gpxFileName && (
                        <p className="text-gray-500 text-xs italic mb-2">📁 {route.gpxFileName}</p>
                      )}
                      {route.pointsCount && (
                        <p className="text-gray-500 text-xs mb-2">📍 {route.pointsCount} punts</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          className="text-white px-3 py-1 rounded text-sm transition-all border-none"
                          style={{
                            background: 'linear-gradient(145deg, #3b82f6, #2563eb)',
                            boxShadow: '2px 2px 4px #d1d1d4, -2px -2px 4px #ffffff'
                          }}
                          onClick={() => selectRoute(route.id, route)}
                        >
                          📍 Seleccionar
                        </button>
                        <button
                          className="text-white px-3 py-1 rounded text-sm transition-all border-none"
                          style={{
                            background: 'linear-gradient(145deg, #ff6b6b, #ee5a52)',
                            boxShadow: '2px 2px 4px #d1d1d4, -2px -2px 4px #ffffff'
                          }}
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
            <div className="p-6 rounded-2xl" style={{
              background: '#f0f0f3',
              boxShadow: '8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff'
            }}>
              <h3 className="text-lg font-bold mb-4 pb-2 border-b-2 border-yellow-400">
                Participants Actius
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {users.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Carregant participants...</p>
                ) : (
                  users.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-3 rounded-lg" style={{
                      background: '#f0f0f3',
                      boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
                    }}>
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
                      <div className={`w-3 h-3 rounded-full ${user.online ? 'bg-green-500' : 'bg-red-500'}`} style={{
                        boxShadow: user.online ? '0 0 10px rgba(46, 213, 115, 0.5)' : '0 0 10px rgba(255, 107, 107, 0.5)'
                      }}></div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Incidents List */}
            <div className="p-6 rounded-2xl" style={{
              background: '#f0f0f3',
              boxShadow: '8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff'
            }}>
              <h3 className="text-lg font-bold mb-4 pb-2 border-b-2 border-red-400">
                Incidències Actives ({incidents.length})
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {incidents.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No hi ha incidències actives</p>
                ) : (
                  incidents.map((incident) => (
                    <div key={incident.id} className="p-4 rounded-lg border-l-4 border-red-400" style={{
                      background: 'linear-gradient(145deg, #fee2e2, #fecaca)',
                      boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
                    }}>
                      <div className="flex justify-between items-start mb-2">
                        <strong className="text-red-600">🚨 {incident.userName}</strong>
                        <button
                          className="text-white px-2 py-1 rounded text-xs transition-all border-none"
                          style={{
                            background: 'linear-gradient(145deg, #2ed573, #26d0ce)',
                            boxShadow: '2px 2px 4px rgba(0,0,0,0.1), -2px -2px 4px rgba(255,255,255,0.1)'
                          }}
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
          <div className="rounded-2xl overflow-hidden mb-6" style={{
            background: '#f0f0f3',
            boxShadow: '8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff'
          }}>
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
          <div className={`fixed top-20 right-4 p-4 rounded-xl shadow-lg z-50 max-w-sm transition-all ${
            notification.type === 'error' ? 'text-white' : 
            notification.type === 'success' ? 'text-white' : 
            'text-white'
          }`} style={{
            background: notification.type === 'error' ? 'linear-gradient(145deg, #ff6b6b, #ee5a52)' : 
                       notification.type === 'success' ? 'linear-gradient(145deg, #2ed573, #26d0ce)' : 
                       '#f0f0f3',
            boxShadow: '8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff'
          }}>
            {notification.message}
          </div>
        )}
      </div>
    );
  }

  // User Dashboard amb disseny neomòrfic
  return (
    <div className="min-h-screen" style={{background: '#f0f0f3'}}>
      {/* Header */}
      <header className="sticky top-0 z-50 px-6 py-4" style={{
        background: '#f0f0f3',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">
            <span style={{color: '#ffd02e'}}>Bike</span>
            <span style={{color: '#1a1a1a'}}>GPS</span>
          </h1>
          <div className="flex items-center gap-4">
            <span style={{color: '#1a1a1a'}}>
              Hola, {currentUser.displayName || currentUser.email}
            </span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg font-semibold text-white border-none transition-all"
              style={{
                background: 'linear-gradient(145deg, #2a2a2a, #1a1a1a)',
                boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
              }}
            >
              Sortir
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 p-6">
        {/* Sidebar - Routes */}
        <div className="lg:col-span-1">
          <div className="p-6 rounded-2xl sticky top-24 mb-6" style={{
            background: '#f0f0f3',
            boxShadow: '8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff'
          }}>
            <h3 className="text-lg font-bold mb-4 pb-2 border-b-2 border-yellow-400">
              Rutes Disponibles
            </h3>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {routes.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Carregant rutes...</p>
              ) : (
                routes.map((route) => (
                  <div 
                    key={route.id} 
                    className={`p-4 rounded-lg border-l-4 cursor-pointer transition-all hover:transform hover:scale-105 ${
                      currentRoute?.id === route.id 
                        ? 'border-yellow-400' 
                        : 'border-yellow-300'
                    }`}
                    style={{
                      background: currentRoute?.id === route.id 
                        ? 'linear-gradient(145deg, #ffe347, #ffd02e)' 
                        : '#f0f0f3',
                      boxShadow: currentRoute?.id === route.id 
                        ? 'inset 4px 4px 8px rgba(0,0,0,0.1), inset -4px -4px 8px rgba(255,255,255,0.1)'
                        : '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
                    }}
                    onClick={() => selectRoute(route.id, route)}
                  >
                    <h4 className="font-semibold mb-1 text-gray-800">{route.name}</h4>
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

          {/* Incidents Panel for Users */}
          {incidents.length > 0 && (
            <div className="p-6 rounded-2xl sticky top-96" style={{
              background: '#f0f0f3',
              boxShadow: '8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff'
            }}>
              <h3 className="text-lg font-bold mb-4 pb-2 border-b-2 border-red-400">
                🚨 Incidències Actives ({incidents.length})
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {incidents.map((incident) => (
                  <div key={incident.id} className="p-3 rounded-lg border-l-4 border-red-400" style={{
                    background: 'linear-gradient(145deg, #fee2e2, #fecaca)',
                    boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
                  }}>
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
          <div className="rounded-2xl overflow-hidden" style={{
            background: '#f0f0f3',
            boxShadow: '8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff'
          }}>
            <div className="relative">
              <div 
                id="map"
                ref={mapRef} 
                className="w-full"
                style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}
              ></div>
              
              {/* Route Progress Indicator */}
              {currentRoute && (
                <div className="absolute top-4 left-4 px-4 py-2 rounded-xl" style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}>
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
                <div className="absolute top-4 right-4 px-4 py-2 rounded-xl" style={{
                  background: 'rgba(255, 71, 87, 0.95)',
                  boxShadow: '0 4px 12px rgba(255, 71, 87, 0.3)'
                }}>
                  <span className="text-white text-sm font-bold">
                    🚨 {incidents.length} Incidència{incidents.length !== 1 ? 's' : ''} activa{incidents.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}

              {/* Emergency Button */}
              <button
                onClick={reportIncident}
                className="fixed bottom-8 right-8 p-4 rounded-full text-white z-50 transition-all transform hover:scale-105 border-none"
                style={{
                  background: 'linear-gradient(145deg, #ff4757, #ff3838)',
                  boxShadow: '8px 8px 16px rgba(255, 71, 87, 0.3), -8px -8px 16px rgba(255, 255, 255, 0.1)',
                  animation: 'pulse 2s infinite'
                }}
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
          notification.type === 'error' ? 'text-white' : 
          notification.type === 'success' ? 'text-white' : 
          'text-white'
        }`} style={{
          background: notification.type === 'error' ? 'linear-gradient(145deg, #ff6b6b, #ee5a52)' : 
                     notification.type === 'success' ? 'linear-gradient(145deg, #2ed573, #26d0ce)' : 
                     '#f0f0f3',
          boxShadow: '8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff'
        }}>
          {notification.message}
        </div>
      )}

      {/* Pulse Animation CSS */}
      <style jsx>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default BikeGPSApp;


