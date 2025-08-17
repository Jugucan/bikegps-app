import { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../App';

export const useFirebaseListeners = (currentUser, isAdmin, isSuperAdmin, mapInstanceRef) => {
  const [routes, setRoutes] = useState([]);
  const [users, setUsers] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  
  // Refs per evitar loops infinits
  const routesListenerRef = useRef(null);
  const usersListenerRef = useRef(null);
  const incidentsListenerRef = useRef(null);
  
  // Refs per gestionar marcadors
  const userMarkersRef = useRef(new Map());
  const incidentMarkersRef = useRef(new Map());
  const markerLayerGroupRef = useRef(null);

  // Funcio per inicialitzar layer group
  const initializeMarkerLayer = () => {
    if (!mapInstanceRef?.current || markerLayerGroupRef.current) return;
    
    const L = window.L;
    if (!L) return;

    markerLayerGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    console.log('📍 Layer group inicialitzat per marcadors');
  };

  // Funcio per netejar tots els marcadors
  const clearAllMarkers = () => {
    if (markerLayerGroupRef.current) {
      markerLayerGroupRef.current.clearLayers();
      userMarkersRef.current.clear();
      incidentMarkersRef.current.clear();
      console.log('🧹 Tots els marcadors netejats');
    }
  };

  // Funcio per refrescar dades
  const refreshData = () => {
    console.log('🔄 Forçant refresh de tots els listeners...');
    
    // Re-executar listeners si existeixen
    if (currentUser) {
      // Trigger re-execution of useEffects
      setRoutes(prev => [...prev]);
      setUsers(prev => [...prev]);
      if (isAdmin) {
        setIncidents(prev => [...prev]);
      }
    }
  };

  // Funcio per carregar tots els usuaris (nomes super admin)
  const loadAllUsers = async () => {
    if (!isSuperAdmin) return;
    
    try {
      console.log('👥 Carregant tots els usuaris...');
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllUsers(usersData);
      console.log(`✅ ${usersData.length} usuaris carregats`);
    } catch (error) {
      console.error('❌ Error carregant usuaris:', error);
    }
  };

  // Funcio per fer admin a un usuari
  const makeUserAdmin = async (userId) => {
    if (!isSuperAdmin) return;
    
    try {
      console.log(`👑 Fent admin a l'usuari: ${userId}`);
      await setDoc(doc(db, 'admins', userId), {
        uid: userId,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });
      console.log('✅ Usuari fet admin correctament');
      loadAllUsers();
    } catch (error) {
      console.error('❌ Error fent admin:', error);
    }
  };

  // Funcio per eliminar ruta
  const deleteRoute = async (routeId) => {
    if (!isAdmin) return;
    
    try {
      console.log(`🗑️ Eliminant ruta: ${routeId}`);
      await updateDoc(doc(db, 'routes', routeId), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: currentUser.uid
      });
      console.log('✅ Ruta eliminada correctament');
    } catch (error) {
      console.error('❌ Error eliminant ruta:', error);
    }
  };

  // Funcio per resoldre incidencia
  const resolveIncident = async (incidentId) => {
    if (!isAdmin) return;
    
    try {
      console.log(`✅ Resolent incidencia: ${incidentId}`);
      await updateDoc(doc(db, 'incidents', incidentId), {
        resolved: true,
        resolvedAt: serverTimestamp(),
        resolvedBy: currentUser.uid
      });
      console.log('✅ Incidencia resolta');
    } catch (error) {
      console.error('❌ Error resolent incidencia:', error);
    }
  };

  // Funcio per gestionar marcadors d'usuaris
  const manageUserMarker = (userData) => {
    if (!mapInstanceRef?.current || !userData.location || !markerLayerGroupRef.current) return;
    
    const L = window.L;
    if (!L) return;

    const userId = userData.uid;
    let existingMarker = userMarkersRef.current.get(userId);

    // Si existeix, actualitzar posicio
    if (existingMarker) {
      existingMarker.setLatLng([userData.location.latitude, userData.location.longitude]);
      existingMarker.setPopupContent(
        `👤 ${userData.displayName || userData.email || 'Usuari'}<br>` +
        `🕒 ${new Date().toLocaleTimeString()}<br>` +
        `📍 Online`
      );
      return;
    }

    // Crear nou marcador
    try {
      const marker = L.marker([userData.location.latitude, userData.location.longitude], {
        icon: L.divIcon({
          className: 'user-marker-online',
          html: `
            <div class="user-marker-wrapper">
              <div class="user-marker-inner">
                <div class="user-marker-pulse"></div>
                <div class="user-marker-dot"></div>
              </div>
              <div class="user-marker-label">${(userData.displayName || userData.email || 'Usuari').substring(0, 10)}</div>
            </div>
          `,
          iconSize: [40, 50],
          iconAnchor: [20, 45]
        })
      });

      marker.bindPopup(
        `👤 ${userData.displayName || userData.email || 'Usuari'}<br>` +
        `🕒 ${new Date().toLocaleTimeString()}<br>` +
        `📍 Online`
      );

      markerLayerGroupRef.current.addLayer(marker);
      userMarkersRef.current.set(userId, marker);
      
      console.log(`📍 Marcador creat per ${userData.displayName || userData.email || userData.uid}`);
    } catch (error) {
      console.warn('⚠️ Error creant marcador usuari:', error);
    }
  };

  // Funcio per eliminar marcador d'usuari
  const removeUserMarker = (userId) => {
    const marker = userMarkersRef.current.get(userId);
    if (marker && markerLayerGroupRef.current) {
      markerLayerGroupRef.current.removeLayer(marker);
      userMarkersRef.current.delete(userId);
      console.log(`🗑️ Marcador eliminat per usuari ${userId}`);
    }
  };

  // Funcio per gestionar marcadors d'incidencies
  const manageIncidentMarkers = (incidentsData) => {
    if (!mapInstanceRef?.current || !markerLayerGroupRef.current) return;
    
    const L = window.L;
    if (!L) return;

    // Netejar marcadors d'incidencies anteriors
    incidentMarkersRef.current.forEach((marker, incidentId) => {
      markerLayerGroupRef.current.removeLayer(marker);
    });
    incidentMarkersRef.current.clear();

    // Afegir marcadors d'incidencies actives
    incidentsData.forEach(incident => {
      if (incident.location && !incident.resolved) {
        try {
          const marker = L.marker([incident.location.latitude, incident.location.longitude], {
            icon: L.divIcon({
              className: 'incident-marker',
              html: `
                <div class="incident-marker-wrapper">
                  <div class="incident-marker-pulse"></div>
                  <div class="incident-marker-icon">⚠️</div>
                </div>
              `,
              iconSize: [30, 30],
              iconAnchor: [15, 15]
            })
          });

          const timestamp = incident.timestamp?.toDate?.() || new Date();
          marker.bindPopup(
            `🚨 <strong>Incidencia</strong><br>` +
            `👤 ${incident.userName}<br>` +
            `💬 ${incident.message}<br>` +
            `📅 ${timestamp.toLocaleString()}`
          );

          markerLayerGroupRef.current.addLayer(marker);
          incidentMarkersRef.current.set(incident.id, marker);
        } catch (error) {
          console.warn('⚠️ Error creant marcador incidencia:', error);
        }
      }
    });

    console.log(`🚨 ${incidentMarkersRef.current.size} marcadors d'incidencies actualitzats`);
  };

  // Inicialitzar layer group quan el mapa estigui llest
  useEffect(() => {
    if (mapInstanceRef?.current && !markerLayerGroupRef.current) {
      const timer = setTimeout(() => {
        initializeMarkerLayer();
      }, 500); // Petit delay per assegurar que el mapa esta completament carregat
      
      return () => clearTimeout(timer);
    }
  }, [mapInstanceRef]);

  // Listener per usuaris connectats
  useEffect(() => {
    if (!currentUser) {
      clearAllMarkers();
      setUsers([]);
      return;
    }

    console.log('👂 INICIANT LISTENER PER USUARIS...');
    
    const usersQuery = query(
      collection(db, 'userLocations'),
      where('isOnline', '==', true),
      orderBy('lastUpdated', 'desc')
    );
    
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      try {
        const usersData = [];
        const currentActiveUserIds = new Set();

        snapshot.docs.forEach((docSnap) => {
          const userData = docSnap.data();
          
          // Verificar si l'usuari esta online i no es l'usuari actual
          if (userData.uid !== currentUser.uid && 
              userData.location &&
              userData.lastUpdated) {
            
            // Verificar que l'usuari hagi estat actiu en els ultims 5 minuts
            const lastUpdate = userData.lastUpdated.toDate();
            const now = new Date();
            const diffMinutes = (now - lastUpdate) / (1000 * 60);
            
            if (diffMinutes <= 5) {
              usersData.push({
                id: docSnap.id,
                ...userData
              });
              
              currentActiveUserIds.add(userData.uid);
              
              // Gestionar marcador d'usuari
              if (markerLayerGroupRef.current) {
                manageUserMarker(userData);
              }
            }
          }
        });

        // Eliminar marcadors d'usuaris que ja no estan actius
        userMarkersRef.current.forEach((marker, userId) => {
          if (!currentActiveUserIds.has(userId)) {
            removeUserMarker(userId);
          }
        });
        
        setUsers(usersData);
        console.log(`👥 ${usersData.length} usuaris actius trobats`);
        
      } catch (error) {
        console.error('❌ Error processant usuaris:', error);
      }
    }, (error) => {
      console.error('❌ Error listener usuaris:', error);
    });

    usersListenerRef.current = unsubscribe;
    
    return () => {
      if (usersListenerRef.current) {
        usersListenerRef.current();
        usersListenerRef.current = null;
      }
    };
  }, [currentUser, mapInstanceRef]);

  // Listener per incidencies (nomes admins)
  useEffect(() => {
    if (!isAdmin) {
      setIncidents([]);
      // Netejar marcadors d'incidencies si no es admin
      incidentMarkersRef.current.forEach((marker, incidentId) => {
        if (markerLayerGroupRef.current) {
          markerLayerGroupRef.current.removeLayer(marker);
        }
      });
      incidentMarkersRef.current.clear();
      return;
    }

    console.log('🚨 INICIANT LISTENER PER INCIDENCIES...');
    
    const incidentsQuery = query(
      collection(db, 'incidents'),
      orderBy('timestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(incidentsQuery, (snapshot) => {
      try {
        const incidentsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setIncidents(incidentsData);
        console.log(`🚨 ${incidentsData.length} incidencies carregades`);
        
        // Gestionar marcadors d'incidencies
        if (markerLayerGroupRef.current) {
          manageIncidentMarkers(incidentsData);
        }
        
      } catch (error) {
        console.error('❌ Error processant incidencies:', error);
      }
    }, (error) => {
      console.error('❌ Error listener incidencies:', error);
    });

    incidentsListenerRef.current = unsubscribe;
    
    return () => {
      if (incidentsListenerRef.current) {
        incidentsListenerRef.current();
        incidentsListenerRef.current = null;
      }
    };
  }, [isAdmin, mapInstanceRef]);

  // Listener per rutes
  useEffect(() => {
    if (!currentUser) {
      setRoutes([]);
      return;
    }

    console.log('📚 INICIANT LISTENER PER RUTES...');
    
    const routesQuery = query(
      collection(db, 'routes'),
      where('deleted', '==', false),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(routesQuery, (snapshot) => {
      try {
        let routesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // Assegurar que sempre tenim un estat actiu
          active: doc.data().active !== false
        }));
        
        // Ordenar manualment per createdAt si hi ha problemes amb l'index
        routesData = routesData.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt.toDate() - a.createdAt.toDate();
        });
        
        setRoutes(routesData);
        console.log(`📚 ${routesData.length} rutes carregades (${routesData.filter(r => r.active).length} actives)`);
        
      } catch (error) {
        console.error('❌ Error processant rutes:', error);
      }
    }, (error) => {
      console.error('❌ Error listener rutes:', error);
    });

    routesListenerRef.current = unsubscribe;
    
    return () => {
      if (routesListenerRef.current) {
        routesListenerRef.current();
        routesListenerRef.current = null;
      }
    };
  }, [currentUser]);

  // Carregar tots els usuaris si es super admin
  useEffect(() => {
    if (isSuperAdmin) {
      loadAllUsers();
    }
  }, [isSuperAdmin]);

  // Cleanup quan es desmunta el component
  useEffect(() => {
    return () => {
      // Netejar tots els listeners
      if (routesListenerRef.current) {
        routesListenerRef.current();
      }
      if (usersListenerRef.current) {
        usersListenerRef.current();
      }
      if (incidentsListenerRef.current) {
        incidentsListenerRef.current();
      }
      
      // Netejar tots els marcadors
      clearAllMarkers();
    };
  }, []);

  return {
    routes,
    users,
    incidents,
    allUsers,
    loadAllUsers,
    makeUserAdmin,
    deleteRoute,
    resolveIncident,
    refreshData // Afegim la funcio refresh que faltava
  };
};
