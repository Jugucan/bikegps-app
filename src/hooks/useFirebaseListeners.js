// hooks/useFirebaseListeners.js
import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where, getDocs, doc, getDoc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import L from 'leaflet';
import { db } from '../App';

export const useFirebaseListeners = (currentUser, isAdmin, isSuperAdmin, mapInstanceRef, currentUserLocationRef) => {
  const [routes, setRoutes] = useState([]);
  const [users, setUsers] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  
  const userMarkersRef = useRef({});
  const incidentMarkersRef = useRef({});
  const listenersRef = useRef({ users: null, incidents: null, routes: null });
  const hasSetInitialLocationRef = useRef(false);
  const lastMapUpdateRef = useRef(0); // Para throttling de actualizaciones del mapa

  const SUPER_ADMIN_UID = 's1UefGdgQphElib4KWmDsQj1uor2';

  // Función para actualizar el mapa con rotación
  const updateMapWithRotation = (lat, lng, heading) => {
    if (!mapInstanceRef.current) return;
    
    const now = Date.now();
    const timeSinceLastUpdate = now - lastMapUpdateRef.current;
    
    // Throttle: actualizar máximo cada 100ms
    if (timeSinceLastUpdate < 100) return;
    lastMapUpdateRef.current = now;
    
    const map = mapInstanceRef.current;
    const currentCenter = map.getCenter();
    const userLatLng = L.latLng(lat, lng);
    
    // Calcular distancia desde el centro
    const distance = currentCenter.distanceTo(userLatLng);
    
    // Si es la primera vez o el usuario está lejos del centro (>50m), centrar y rotar
    if (!hasSetInitialLocationRef.current || distance > 50) {
      console.log('🧭 Centrando y rotando mapa - Distancia:', Math.round(distance), 'm, Rumbo:', heading ? Math.round(heading) + '°' : 'N/A');
      
      // Centrar mapa
      map.panTo(userLatLng, {
        animate: true,
        duration: 0.5
      });
      
      // Rotar mapa si tenemos heading
      if (heading !== null && heading !== undefined && !isNaN(heading)) {
        // Convertir heading de navegación (0° = Norte) a bearing de mapa
        const mapBearing = -heading; // Negativo porque el mapa rota en sentido contrario
        
        map.setBearing(mapBearing);
      }
      
      hasSetInitialLocationRef.current = true;
    }
    // Si está cerca del centro pero tenemos nuevo heading, solo rotar
    else if (heading !== null && heading !== undefined && !isNaN(heading)) {
      const mapBearing = -heading;
      map.setBearing(mapBearing);
    }
  };

  const isUserOnline = (timestamp) => {
    if (!timestamp) return false;
    const now = new Date();
    const lastUpdate = timestamp.toDate();
    return (now - lastUpdate) < 180000; // 3 minutos
  };

  // Listener usuarios con mapa rotativo
  const listenToUsers = () => {
    console.log('👂 INICIANT LISTENER PER USUARIS...');
    
    const unsubscribe = onSnapshot(collection(db, 'userLocations'), async (snapshot) => {
      const usersData = [];
      
      for (const docSnapshot of snapshot.docs) {
        const location = docSnapshot.data();
        const userId = docSnapshot.id;
        const isCurrentUser = userId === currentUser?.uid;
        
        try {
          // Obtenir info admin
          const userDocRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userDocRef);
          const userData = userDoc.exists() ? userDoc.data() : null;
          const userIsAdmin = userData?.isAdmin === true || userId === SUPER_ADMIN_UID;
          
          // Si es el usuario actual, actualizar mapa con rotación
          if (isCurrentUser) {
            currentUserLocationRef.current = {
              lat: location.latitude,
              lng: location.longitude,
              heading: location.heading
            };
            
            // Actualizar mapa con rotación
            updateMapWithRotation(location.latitude, location.longitude, location.heading);
          }

          const userEntry = {
            ...location,
            id: userId,
            isCurrentUser,
            isAdmin: userIsAdmin,
            online: isUserOnline(location.timestamp)
          };
          usersData.push(userEntry);

          // Gestionar markers
          const addMarkerWhenReady = () => {
            if (!mapInstanceRef.current) {
              setTimeout(addMarkerWhenReady, 500);
              return;
            }

            // Eliminar marker anterior
            if (userMarkersRef.current[userId]) {
              if (mapInstanceRef.current.hasLayer(userMarkersRef.current[userId])) {
                mapInstanceRef.current.removeLayer(userMarkersRef.current[userId]);
              }
              delete userMarkersRef.current[userId];
            }

            if (!window.userIcon || !window.currentUserIcon) {
              setTimeout(addMarkerWhenReady, 100);
              return;
            }
            
            const icon = isCurrentUser ? window.currentUserIcon : window.userIcon;
            
            try {
              const marker = L.marker([location.latitude, location.longitude], {
                icon: icon,
                zIndexOffset: isCurrentUser ? 1000 : 0 // Usuario actual siempre encima
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
                  ${location.heading ? `<br><small style="color: #666;">Direcció: ${Math.round(location.heading)}°</small>` : ''}
                </div>
              `);
              
            } catch (error) {
              console.error(`❌ ERROR creant marker per ${location.userName}:`, error);
            }
          };

          addMarkerWhenReady();

        } catch (error) {
          console.error(`Error processant usuari ${userId}:`, error);
        }
      }

      setUsers(usersData);
    });

    return unsubscribe;
  };

  // Listener incidents
  const listenToIncidents = () => {
    console.log('🚨 INICIANT LISTENER PER INCIDÈNCIES...');
    
    const incidentsQuery = query(collection(db, 'incidents'), where('resolved', '==', false));
    const unsubscribe = onSnapshot(incidentsQuery, (snapshot) => {
      const incidentsData = [];
      
      // Netejar markers existents
      Object.keys(incidentMarkersRef.current).forEach(incidentId => {
        const marker = incidentMarkersRef.current[incidentId];
        if (mapInstanceRef.current && marker && mapInstanceRef.current.hasLayer(marker)) {
          mapInstanceRef.current.removeLayer(marker);
        }
        delete incidentMarkersRef.current[incidentId];
      });

      snapshot.forEach((doc) => {
        const incident = { id: doc.id, ...doc.data() };
        incidentsData.push(incident);

        const addIncidentMarkerWhenReady = () => {
          if (!mapInstanceRef.current || !incident.location?.latitude || !incident.location?.longitude) {
            return;
          }

          if (!window.incidentIcon) {
            setTimeout(addIncidentMarkerWhenReady, 100);
            return;
          }

          try {
            const marker = L.marker([incident.location.latitude, incident.location.longitude], {
              icon: window.incidentIcon,
              zIndexOffset: 2000 // Incidents sempre més amunt
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
            
          } catch (error) {
            console.error(`❌ ERROR creant marker d'incidència ${incident.id}:`, error);
          }
        };

        addIncidentMarkerWhenReady();
      });

      setIncidents(incidentsData);
    });

    return unsubscribe;
  };

  // Listener routes
  const listenToRoutes = () => {
    console.log('📚 INICIANT LISTENER PER RUTES...');
    
    const routesQuery = query(collection(db, 'routes'), where('deleted', '!=', true));
    
    const unsubscribe = onSnapshot(routesQuery, (snapshot) => {
      const routesData = [];
      snapshot.forEach((doc) => {
        routesData.push({ id: doc.id, ...doc.data() });
      });
      
      setRoutes(routesData);
    });

    return unsubscribe;
  };

  // Load all users (SuperAdmin only)
  const loadAllUsers = async () => {
    if (!isSuperAdmin) return;
    
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData = [];
      usersSnapshot.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() });
      });
      setAllUsers(usersData);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  // Make user admin (SuperAdmin only)
  const makeUserAdmin = async (userId, makeAdmin = true) => {
    if (!isSuperAdmin) return;
    
    try {
      const userDocRef = doc(db, 'users', userId);
      await updateDoc(userDocRef, {
        isAdmin: makeAdmin
      });
      
      loadAllUsers();
    } catch (error) {
      console.error('Error updating user admin status:', error);
    }
  };

  // Delete route
  const deleteRoute = async (routeId) => {
    if (!window.confirm('Segur que vols eliminar aquesta ruta?')) return;
    
    try {
      const routeDocRef = doc(db, 'routes', routeId);
      await updateDoc(routeDocRef, {
        deleted: true,
        deletedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error deleting route:', error);
    }
  };

  // Resolve incident
  const resolveIncident = async (incidentId) => {
    if (!isAdmin) return;
    
    try {
      const incidentDocRef = doc(db, 'incidents', incidentId);
      await updateDoc(incidentDocRef, {
        resolved: true,
        resolvedBy: currentUser.uid,
        resolvedAt: serverTimestamp()
      });
      
      // Eliminar marker immediatament
      if (incidentMarkersRef.current[incidentId]) {
        const marker = incidentMarkersRef.current[incidentId];
        if (mapInstanceRef.current && mapInstanceRef.current.hasLayer(marker)) {
          mapInstanceRef.current.removeLayer(marker);
        }
        delete incidentMarkersRef.current[incidentId];
      }
      
      setIncidents(prev => prev.filter(inc => inc.id !== incidentId));
    } catch (error) {
      console.error('Error resolving incident:', error);
    }
  };

  // Setup listeners
  useEffect(() => {
    if (!currentUser) {
      // Cleanup listeners
      Object.keys(listenersRef.current).forEach(key => {
        if (listenersRef.current[key]) {
          listenersRef.current[key]();
          listenersRef.current[key] = null;
        }
      });
      return;
    }

    // Start listeners
    if (!listenersRef.current.users) {
      listenersRef.current.users = listenToUsers();
    }
    
    if (!listenersRef.current.incidents) {
      listenersRef.current.incidents = listenToIncidents();
    }

    if (!listenersRef.current.routes) {
      listenersRef.current.routes = listenToRoutes();
    }

    return () => {
      Object.keys(listenersRef.current).forEach(key => {
        if (listenersRef.current[key]) {
          listenersRef.current[key]();
          listenersRef.current[key] = null;
        }
      });
    };
  }, [currentUser]);

  // Load all users for SuperAdmin
  useEffect(() => {
    if (isSuperAdmin) {
      loadAllUsers();
    }
  }, [isSuperAdmin]);

  // Global function for resolving incidents from map
  useEffect(() => {
    window.resolveIncidentFromMap = resolveIncident;
    
    return () => {
      delete window.resolveIncidentFromMap;
    };
  }, [resolveIncident]);

  return {
    routes,
    users,
    incidents,
    allUsers,
    loadAllUsers,
    makeUserAdmin,
    deleteRoute,
    resolveIncident
  };
};