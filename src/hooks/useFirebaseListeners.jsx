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
  serverTimestamp,
  limit
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
  const refreshData = async () => {
    console.log('🔄 Forçant refresh manual de dades...');
    
    try {
      // Refrescar usuaris manualment
      if (currentUser) {
        const userLocationsSnapshot = await getDocs(collection(db, 'userLocations'));
        const usersData = [];
        
        userLocationsSnapshot.docs.forEach((docSnap) => {
          const userData = docSnap.data();
          
          if (userData.isOnline && 
              userData.uid !== currentUser.uid && 
              userData.location &&
              userData.lastUpdated) {
            
            const lastUpdate = userData.lastUpdated.toDate();
            const now = new Date();
            const diffMinutes = (now - lastUpdate) / (1000 * 60);
            
            if (diffMinutes <= 5) {
              usersData.push({
                id: docSnap.id,
                ...userData
              });
            }
          }
        });
        
        setUsers(usersData);
        console.log(`🔄 Refresh manual: ${usersData.length} usuaris carregats`);
      }
    } catch (error) {
      console.error('❌ Error en refresh manual:', error);
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
      return;
    }

    // Crear nou marcador amb estil simple
    try {
      const marker = L.marker([userData.location.latitude, userData.location.longitude], {
        icon: L.divIcon({
          className: 'simple-user-marker',
          html: `
            <div style="
              width: 16px; 
              height: 16px; 
              background: #4CAF50; 
              border: 2px solid white; 
              border-radius: 50%; 
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            "></div>
          `,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        })
      });

      marker.bindPopup(
        `👤 ${userData.displayName || userData.email || 'Usuari'}<br>` +
        `📍 Online`
      );

      markerLayerGroupRef.current.addLayer(marker);
      userMarkersRef.current.set(userId, marker);
      
      console.log(`📍 Marcador simple creat per ${userData.displayName || userData.email || userData.uid}`);
    } catch (error) {
      console.warn('⚠️ Error creant marcador usuari:', error);
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

    // Afegir marcadors d'incidencies actives amb estil simple
    incidentsData.forEach(incident => {
      if (incident.location && !incident.resolved) {
        try {
          const marker = L.marker([incident.location.latitude, incident.location.longitude], {
            icon: L.divIcon({
              className: 'simple-incident-marker',
              html: `
                <div style="
                  width: 18px; 
                  height: 18px; 
                  background: #FF5722; 
                  border: 2px solid white; 
                  border-radius: 50%; 
                  display: flex; 
                  align-items: center; 
                  justify-content: center; 
                  font-size: 10px; 
                  color: white;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                ">⚠</div>
              `,
              iconSize: [22, 22],
              iconAnchor: [11, 11]
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
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [mapInstanceRef]);

  // Listener per usuaris connectats - VERSIÓ SIMPLIFICADA SENSE ORDERBY
  useEffect(() => {
    if (!currentUser) {
      clearAllMarkers();
      setUsers([]);
      return;
    }

    console.log('👂 INICIANT LISTENER SIMPLIFICAT PER USUARIS...');
    
    // Query més simple sense orderBy per evitar problemes d'índex
    const usersQuery = query(
      collection(db, 'userLocations'),
      where('isOnline', '==', true),
      limit(50) // Limitem per rendiment
    );
    
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      try {
        const usersData = [];

        snapshot.docs.forEach((docSnap) => {
          const userData = docSnap.data();
          
          if (userData.uid !== currentUser.uid && 
              userData.location &&
              userData.lastUpdated) {
            
            // Verificar activitat recent
            const lastUpdate = userData.lastUpdated.toDate();
            const now = new Date();
            const diffMinutes = (now - lastUpdate) / (1000 * 60);
            
            if (diffMinutes <= 10) { // Ampliem a 10 minuts
              usersData.push({
                id: docSnap.id,
                ...userData
              });
              
              // Gestionar marcador d'usuari
              if (markerLayerGroupRef.current) {
                manageUserMarker(userData);
              }
            }
          }
        });
        
        setUsers(usersData);
        console.log(`👥 ${usersData.length} usuaris actius trobats (simplificat)`);
        
      } catch (error) {
        console.error('❌ Error processant usuaris:', error);
      }
    }, (error) => {
      console.error('❌ Error listener usuaris:', error);
      console.log('🔄 Intentant fallback manual...');
      
      // Fallback manual
      refreshData();
    });

    usersListenerRef.current = unsubscribe;
    
    return () => {
      if (usersListenerRef.current) {
        usersListenerRef.current();
        usersListenerRef.current = null;
      }
    };
  }, [currentUser, mapInstanceRef]);

  // Listener per incidencies - VERSIÓ SIMPLIFICADA
  useEffect(() => {
    if (!currentUser) { // Canviat de !isAdmin a !currentUser
      setIncidents([]);
      return;
    }

    console.log('🚨 INICIANT LISTENER SIMPLIFICAT PER INCIDENCIES...');
    
    // Query simple sense orderBy
    const incidentsQuery = query(
      collection(db, 'incidents'),
      limit(20) // Limitem per rendiment
    );
    
    const unsubscribe = onSnapshot(incidentsQuery, (snapshot) => {
      try {
        let incidentsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Ordenar manualment per timestamp
        incidentsData = incidentsData.sort((a, b) => {
          if (!a.timestamp || !b.timestamp) return 0;
          return b.timestamp.toDate() - a.timestamp.toDate();
        });
        
        setIncidents(incidentsData);
        console.log(`🚨 ${incidentsData.length} incidencies carregades (simplificat)`);
        
        // Gestionar marcadors d'incidencies
        if (markerLayerGroupRef.current) {
          manageIncidentMarkers(incidentsData);
        }
        
      } catch (error) {
        console.error('❌ Error processant incidencies:', error);
      }
    }, (error) => {
      console.error('❌ Error listener incidencies:', error);
      console.log('⚠️ Les incidencies no es poden carregar. Comprova els permisos de Firebase.');
    });

    incidentsListenerRef.current = unsubscribe;
    
    return () => {
      if (incidentsListenerRef.current) {
        incidentsListenerRef.current();
        incidentsListenerRef.current = null;
      }
    };
  }, [currentUser, mapInstanceRef]); // Canviat de isAdmin a currentUser

  // Listener per rutes - VERSIÓ SIMPLIFICADA
  useEffect(() => {
    if (!currentUser) {
      setRoutes([]);
      return;
    }

    console.log('📚 INICIANT LISTENER SIMPLIFICAT PER RUTES...');
    
    // Query simple sense orderBy problemàtic
    const routesQuery = query(
      collection(db, 'routes'),
      where('deleted', '==', false),
      limit(30)
    );
    
    const unsubscribe = onSnapshot(routesQuery, (snapshot) => {
      try {
        let routesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          active: doc.data().active !== false
        }));
        
        // Ordenar manualment per createdAt
        routesData = routesData.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt.toDate() - a.createdAt.toDate();
        });
        
        setRoutes(routesData);
        console.log(`📚 ${routesData.length} rutes carregades (${routesData.filter(r => r.active).length} actives) - simplificat`);
        
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
      if (routesListenerRef.current) routesListenerRef.current();
      if (usersListenerRef.current) usersListenerRef.current();
      if (incidentsListenerRef.current) incidentsListenerRef.current();
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
    refreshData
  };
};
