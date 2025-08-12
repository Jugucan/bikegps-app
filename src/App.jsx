import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-rotatedmarker';

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
  const [loading, setLoading] = useState(true);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [routeData, setRouteData] = useState(null);
  const [users, setUsers] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [notification, setNotification] = useState(null);
  const [trackingEnabled, setTrackingEnabled] = useState(false);

  // Refs for Leaflet objects
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const userMarkersRef = useRef({});
  const incidentMarkersRef = useRef({});
  const routePolylineRef = useRef(null);
  const locationWatcherRef = useRef(null);

  // UseEffect for authentication and initial data loading
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setIsAdmin(user.uid === SUPER_ADMIN_UID);
        console.log(`✅ Usuari autenticat: ${user.email} (Admin: ${user.uid === SUPER_ADMIN_UID})`);
        
        // Assegurar que el mapa s'inicialitza un cop l'usuari estigui autenticat
        if (!mapInstanceRef.current) {
            initMap();
        }
      } else {
        setIsAdmin(false);
        console.log('🚫 Usuari desconnectat.');
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (locationWatcherRef.current) {
        navigator.geolocation.clearWatch(locationWatcherRef.current);
      }
    };
  }, []);

  // UseEffect for map and data listeners
  useEffect(() => {
    if (mapInstanceRef.current && currentUser) {
      createCustomIcons();
      const unsubscribeUsers = listenToUsers();
      const unsubscribeIncidents = listenToIncidents();
      fetchRouteData();
      return () => {
        unsubscribeUsers();
        unsubscribeIncidents();
      };
    }
  }, [mapInstanceRef.current, currentUser, isAdmin]);

  const initMap = async () => {
    if (mapRef.current && !mapInstanceRef.current) {
      console.log('🗺️ Inicialitzant el mapa...');

      const map = L.map(mapRef.current, {
        center: [41.3851, 2.1734],
        zoom: 13,
        zoomControl: false,
        attributionControl: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }
  };

  const createCustomIcons = () => {
    if (window.userIcon && window.currentUserIcon && window.incidentIcon) return;
    
    window.userIcon = L.divIcon({
      className: 'custom-icon',
      html: `
        <div style="background-color: #2ED573; color: white; padding: 4px 8px; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); font-size: 10px; font-weight: bold; text-align: center;">🚴</div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    window.currentUserIcon = L.divIcon({
      className: 'custom-icon pulse',
      html: `
        <div style="background-color: #007bff; color: white; padding: 4px 8px; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); font-size: 10px; font-weight: bold; text-align: center;">📍</div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    window.incidentIcon = L.divIcon({
      className: 'custom-icon incident-icon',
      html: `
        <div style="background-color: #FF4757; color: white; padding: 4px 8px; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); font-size: 10px; font-weight: bold; text-align: center;">🚨</div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  };

  const listenToUsers = () => {
    console.log('👂 INICIANT LISTENER PER USUARIS...');
    
    const unsubscribe = onSnapshot(collection(db, 'userLocations'), async (snapshot) => {
      console.log(`🔥 FIREBASE: Rebudes ubicacions d'usuaris`);
      
      const usersData = [];
      const activeUsers = {};
      
      for (const docSnapshot of snapshot.docs) {
        const location = docSnapshot.data();
        const userId = docSnapshot.id;
        const isCurrentUser = userId === currentUser?.uid;

        // Omplir la llista per al panell lateral si és administrador
        if (isAdmin) {
          try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              usersData.push({ id: userId, email: userData.email, ...location });
            }
          } catch (e) {
            console.error(`❌ Error llegint dades d'usuari ${userId}:`, e);
          }
        }

        // Actualitzar o crear marcador
        let marker = userMarkersRef.current[userId];
        if (marker) {
          marker.setLatLng([location.latitude, location.longitude]);
          if (isCurrentUser && location.heading !== null && location.heading !== undefined) {
             marker.setRotation(location.heading);
          }
        } else {
          if (!mapInstanceRef.current || !window.userIcon || !window.currentUserIcon) {
            console.log(`⏳ Esperant que el mapa o les icones estiguin llestes per ${location.userName}...`);
            return;
          }
          const icon = isCurrentUser ? window.currentUserIcon : window.userIcon;
          marker = L.marker([location.latitude, location.longitude], {
            icon: icon,
            rotationAngle: location.heading || 0
          }).addTo(mapInstanceRef.current);
          userMarkersRef.current[userId] = marker;
        }

        // Afegir popup amb el nom d'usuari
        if (marker && !marker.getPopup()) {
          const popupContent = `
            <div style="text-align: center;">
              <h3 style="margin: 0; font-size: 1.1em;">${location.userName}</h3>
              <p style="margin: 0; font-size: 0.9em; color: #555;">Última actualització: ${new Date(location.timestamp?.seconds * 1000).toLocaleTimeString()}</p>
            </div>
          `;
          marker.bindPopup(popupContent, {
            closeButton: false,
            className: 'custom-popup'
          });
        }
        
        // Mantenir el mapa centrat a l'usuari actual
        if (isCurrentUser && trackingEnabled) {
          mapInstanceRef.current.setView([location.latitude, location.longitude]);
        }
        
        // Actualitzar la llista de marcadors actius
        activeUsers[userId] = true;
      }
      
      // Netejar marcadors d'usuaris que ja no estan a la llista
      Object.keys(userMarkersRef.current).forEach(userId => {
        if (!activeUsers[userId]) {
          const marker = userMarkersRef.current[userId];
          if (mapInstanceRef.current.hasLayer(marker)) {
            mapInstanceRef.current.removeLayer(marker);
          }
          delete userMarkersRef.current[userId];
        }
      });

      // Actualitzar l'estat dels usuaris si ets admin
      setUsers(usersData);
      if (isAdmin) {
          console.log(`👑 ADMIN: Llista usuaris actualitzada amb ${usersData.length} usuaris`);
      }
    });

    return unsubscribe;
  };
  
  const listenToIncidents = () => {
    console.log('🚨 INICIANT LISTENER PER INCIDÈNCIES...');
    
    const incidentsQuery = query(collection(db, 'incidents'), where('resolved', '==', false));
    const unsubscribe = onSnapshot(incidentsQuery, (snapshot) => {
      console.log(`🚨 FIREBASE: Rebudes incidències actives`);
      
      const incidentsData = [];
      const activeIncidents = {};

      snapshot.forEach((doc) => {
        const incident = { id: doc.id, ...doc.data() };
        incidentsData.push(incident);
        activeIncidents[incident.id] = true;

        if (!incident.location || !incident.location.latitude || !incident.location.longitude) {
            console.log(`⚠️ Incidència ${incident.id} sense ubicació vàlida:`, incident.location);
            return;
        }

        // Creem o actualitzem el marcador
        let marker = incidentMarkersRef.current[incident.id];
        if (marker) {
          marker.setLatLng([incident.location.latitude, incident.location.longitude]);
        } else {
          const addIncidentMarkerWhenReady = () => {
            if (!mapInstanceRef.current || !window.incidentIcon) {
              setTimeout(addIncidentMarkerWhenReady, 500);
              return;
            }
            try {
              marker = L.marker([incident.location.latitude, incident.location.longitude], {
                icon: window.incidentIcon,
                zIndexOffset: 1000
              }).addTo(mapInstanceRef.current);
              incidentMarkersRef.current[incident.id] = marker;
              marker.bindPopup(`
                <div style="text-align: center;">
                  <h3 style="margin: 0; font-size: 1.1em;">🚨 INCIDÈNCIA</h3>
                  <p style="margin: 0; font-size: 0.9em; color: #555;">Descripció: ${incident.description}</p>
                  <p style="margin: 0; font-size: 0.8em; color: #888;">${new Date(incident.timestamp?.seconds * 1000).toLocaleString()}</p>
                  ${isAdmin ? `<button class="resolve-btn" style="background-color: #2ed573; color: white; border: none; padding: 5px 10px; border-radius: 5px; margin-top: 10px; cursor: pointer;">Resoldre</button>` : ''}
                </div>
              `);
            } catch (error) {
              console.error(`❌ ERROR creant marker d'incidència ${incident.id}:`, error);
            }
          };
          addIncidentMarkerWhenReady();
        }
      });
      
      // Netejar marcadors que ja no estan a la llista
      Object.keys(incidentMarkersRef.current).forEach(incidentId => {
        if (!activeIncidents[incidentId]) {
          const marker = incidentMarkersRef.current[incidentId];
          if (mapInstanceRef.current.hasLayer(marker)) {
            mapInstanceRef.current.removeLayer(marker);
          }
          delete incidentMarkersRef.current[incidentId];
        }
      });

      setIncidents(incidentsData);
      console.log(`🚨 ${incidentsData.length} incidències NO RESOLTES carregades al state`);
    });

    return unsubscribe;
  };

  const fetchRouteData = async () => {
    try {
      const routeDoc = await getDoc(doc(db, 'route', 'main'));
      if (routeDoc.exists()) {
        const route = routeDoc.data();
        setRouteData(route);
        console.log('🗺️ Ruta carregada des de Firebase.');
        
        if (mapInstanceRef.current) {
          drawRoute(route);
        }
      } else {
        console.log('⚠️ No s\'ha trobat la ruta.');
      }
    } catch (e) {
      console.error('❌ Error carregant la ruta:', e);
    }
  };

  const drawRoute = (route) => {
    if (!mapInstanceRef.current) return;

    if (routePolylineRef.current) {
      mapInstanceRef.current.removeLayer(routePolylineRef.current);
    }

    const coordinates = route.geoJSON.geometry.coordinates.map(coord => [coord[1], coord[0]]);
    const polyline = L.polyline(coordinates, { color: '#007bff', weight: 6, opacity: 0.7 }).addTo(mapInstanceRef.current);
    routePolylineRef.current = polyline;
    mapInstanceRef.current.fitBounds(polyline.getBounds());
  };

  // Auth functions
  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      if (e.target.name === 'login') {
        await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password);
        showNotification('Sessió iniciada correctament!', 'success');
      } else {
        await createUserWithEmailAndPassword(auth, loginForm.email, loginForm.password);
        showNotification('Compte creat correctament!', 'success');
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Netejar el mapa en fer logout
      if (mapInstanceRef.current) {
        mapInstanceRef.current.eachLayer(layer => {
          if (layer instanceof L.Marker || layer instanceof L.Polyline) {
            mapInstanceRef.current.removeLayer(layer);
          }
        });
        userMarkersRef.current = {};
        incidentMarkersRef.current = {};
        routePolylineRef.current = null;
      }
      showNotification('Sessió tancada.', 'success');
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  };
  
  // Location tracking functions
  const startLocationTracking = () => {
    if (!currentUser) {
      showNotification('Has d\'estar connectat per iniciar el seguiment.', 'error');
      return;
    }
    
    if (locationWatcherRef.current) {
        navigator.geolocation.clearWatch(locationWatcherRef.current);
    }

    const success = (position) => {
      const { latitude, longitude, heading } = position.coords;
      console.log('📍 Nova posició rebuda:', latitude, longitude, `Heading: ${heading}`);
      updateUserLocation(latitude, longitude, heading);
      showNotification('Posició actualitzada!', 'success');
    };

    const error = (err) => {
      console.warn(`❌ ERROR(${err.code}): ${err.message}`);
      showNotification('Error al obtenir la ubicació. Comprova els permisos.', 'error');
    };

    const options = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    };
    
    locationWatcherRef.current = navigator.geolocation.watchPosition(success, error, options);
    setTrackingEnabled(true);
    showNotification('Seguiment de la ruta iniciat!', 'success');
  };

  const stopLocationTracking = () => {
    if (locationWatcherRef.current) {
      navigator.geolocation.clearWatch(locationWatcherRef.current);
      locationWatcherRef.current = null;
      setTrackingEnabled(false);
      showNotification('Seguiment de la ruta aturat.', 'success');
    }
  };
  
  const updateUserLocation = async (lat, lng, heading = null) => {
    if (!currentUser) return;
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      const userName = userDoc.exists() ? userDoc.data().email.split('@')[0] : 'Usuari anònim';
      
      const userLocationRef = doc(db, 'userLocations', currentUser.uid);
      await setDoc(userLocationRef, {
        userName,
        latitude: lat,
        longitude: lng,
        heading: heading, // Guardar el 'heading' a Firebase
        timestamp: serverTimestamp()
      }, { merge: true });
      
      console.log('✅ Ubicació de l\'usuari actualitzada amb èxit.');
    } catch (error) {
      console.error('❌ Error actualitzant ubicació:', error);
    }
  };
  
  // Incident functions
  const reportIncident = async (description) => {
    if (!currentUser) {
      showNotification('Has d\'estar connectat per reportar una incidència.', 'error');
      return;
    }

    const createIncident = (location) => {
      addDoc(collection(db, 'incidents'), {
        userId: currentUser.uid,
        userName: currentUser.email.split('@')[0],
        description: description,
        timestamp: serverTimestamp(),
        location: location,
        resolved: false
      }).then(() => {
        showNotification('🚨 Incidència reportada amb èxit!', 'success');
        console.log('Incidència guardada a Firebase.');
      }).catch(error => {
        showNotification('❌ Error al reportar la incidència.', 'error');
        console.error('Error afegint document:', error);
      });
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        createIncident({ latitude, longitude });
      },
      (error) => {
        console.warn(`❌ ERROR(${error.code}): ${error.message}`);
        showNotification('No s\'ha pogut obtenir la ubicació. Usant una ubicació simulada.', 'error');
        // Fallback: usar una ubicació predeterminada
        createIncident({ latitude: 41.3851, longitude: 2.1734 });
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  };
  
  const resolveIncident = async (incidentId) => {
    if (!isAdmin) {
      showNotification('Permís denegat.', 'error');
      return;
    }
    
    try {
      const incidentRef = doc(db, 'incidents', incidentId);
      await updateDoc(incidentRef, { resolved: true });
      showNotification('✅ Incidència resolta amb èxit!', 'success');
    } catch (error) {
      showNotification('❌ Error al resoldre la incidència.', 'error');
      console.error('Error actualitzant document:', error);
    }
  };
  
  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
  };

  // UI rendering
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-xl font-semibold">Carregant...</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gray-100 font-sans">
      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(0, 123, 255, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 123, 255, 0); }
        }
        .custom-icon.pulse div {
          animation: pulse 2s infinite;
        }
        .leaflet-container {
          height: 100vh;
          width: 100%;
        }
        .custom-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.2);
          padding: 10px;
        }
        .custom-popup .leaflet-popup-tip {
          background: #fff;
        }
        .resolve-btn {
          cursor: pointer;
        }
      `}</style>
      
      {/* Main Map */}
      <div ref={mapRef} className="leaflet-container" id="map"></div>

      {/* Control Panel */}
      <div className="fixed top-4 left-4 p-4 rounded-xl shadow-lg z-10 w-80 max-w-[calc(100%-2rem)]" style={{
        background: 'linear-gradient(145deg, #f0f0f3, #e0e0e0)',
        boxShadow: '8px 8px 16px #d1d1d4, -8px -8px 16px #ffffff'
      }}>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold" style={{ color: '#007bff' }}>BikeGPS</h1>
          {currentUser && (
            <button onClick={handleLogout} className="text-sm px-3 py-1 rounded-full text-white" style={{
              background: 'linear-gradient(145deg, #ff6b6b, #ee5a52)',
              boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
            }}>Sortir</button>
          )}
        </div>

        {!currentUser ? (
          <form onSubmit={handleAuth} name="login" className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={loginForm.email}
              onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
              className="w-full p-2 rounded-xl text-sm"
              style={{
                background: '#e0e0e0',
                border: 'none',
                boxShadow: 'inset 4px 4px 8px #d1d1d4, inset -4px -4px 8px #ffffff',
                outline: 'none'
              }}
            />
            <input
              type="password"
              placeholder="Contrasenya"
              value={loginForm.password}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              className="w-full p-2 rounded-xl text-sm"
              style={{
                background: '#e0e0e0',
                border: 'none',
                boxShadow: 'inset 4px 4px 8px #d1d1d4, inset -4px -4px 8px #ffffff',
                outline: 'none'
              }}
            />
            <div className="flex space-x-2">
              <button type="submit" className="flex-1 px-4 py-2 rounded-xl text-white font-semibold text-sm" style={{
                background: 'linear-gradient(145deg, #007bff, #0056b3)',
                boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
              }}>
                Entrar
              </button>
              <button
                type="button"
                onClick={(e) => handleAuth({ preventDefault: () => {}, target: { name: 'register' } })}
                className="flex-1 px-4 py-2 rounded-xl text-white font-semibold text-sm"
                style={{
                  background: 'linear-gradient(145deg, #2ed573, #26d0ce)',
                  boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
                }}
              >
                Registrar
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: '#007bff' }}>
              Benvingut, {currentUser.email.split('@')[0]}!
            </h2>
            <div className="flex space-x-2">
              <button onClick={trackingEnabled ? stopLocationTracking : startLocationTracking} className="flex-1 px-4 py-2 rounded-xl text-white font-semibold text-sm" style={{
                background: trackingEnabled ? 'linear-gradient(145deg, #ff6b6b, #ee5a52)' : 'linear-gradient(145deg, #2ed573, #26d0ce)',
                boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
              }}>
                {trackingEnabled ? 'Aturar Seguiment' : 'Iniciar Seguiment'}
              </button>
              <button onClick={() => reportIncident('Problema a la ruta')} className="flex-1 px-4 py-2 rounded-xl text-white font-semibold text-sm" style={{
                background: 'linear-gradient(145deg, #ff4757, #cc3b48)',
                boxShadow: '4px 4px 8px #d1d1d4, -4px -4px 8px #ffffff'
              }}>
                Reportar Incidència
              </button>
            </div>
            
            {/* Active Participants List */}
            {isAdmin && (
              <div className="bg-white p-4 rounded-xl shadow-inner mt-4" style={{ boxShadow: 'inset 2px 2px 5px #babecc, inset -5px -5px 10px #ffffff73' }}>
                <h3 className="font-bold text-gray-700 mb-2">Participants Actius ({users.length})</h3>
                <ul className="space-y-2 max-h-40 overflow-y-auto">
                  {users.length > 0 ? (
                    users.map(user => (
                      <li key={user.id} className="flex items-center space-x-2 text-sm text-gray-600">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <span>{user.email.split('@')[0]}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-gray-400">Carregant participants...</li>
                  )}
                </ul>
              </div>
            )}
            
            {/* Active Incidents List */}
            {isAdmin && (
              <div className="bg-white p-4 rounded-xl shadow-inner mt-4" style={{ boxShadow: 'inset 2px 2px 5px #babecc, inset -5px -5px 10px #ffffff73' }}>
                <h3 className="font-bold text-gray-700 mb-2">Incidències Actives ({incidents.length})</h3>
                <ul className="space-y-2 max-h-40 overflow-y-auto">
                  {incidents.length > 0 ? (
                    incidents.map(incident => (
                      <li key={incident.id} className="text-sm p-2 rounded-lg" style={{ backgroundColor: '#fff5f5', border: '1px solid #ffcccc' }}>
                        <div className="font-bold">{incident.userName}</div>
                        <div className="text-xs text-gray-600">{incident.description}</div>
                        <div className="text-xs text-gray-400 mt-1">{new Date(incident.timestamp?.seconds * 1000).toLocaleString()}</div>
                        <button onClick={() => resolveIncident(incident.id)} className="text-xs mt-2 px-2 py-1 rounded-full text-white" style={{
                          background: 'linear-gradient(145deg, #2ed573, #26d0ce)',
                          boxShadow: '2px 2px 4px #d1d1d4, -2px -2px 4px #ffffff'
                        }}>
                          Resoldre
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-gray-400">No hi ha incidències actives.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
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
};

export default BikeGPSApp;
