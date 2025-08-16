import React, { useState, useEffect } from 'react';
import BikeMap from './BikeMap';

const UserDashboard = ({
  currentUser,
  routes,
  users,
  incidents,
  currentRoute,
  routeProgress,
  isReturning,
  selectRoute,
  reportIncident,
  handleLogout,
  mapInstanceRef,
  userLocation,
  notification
}) => {
  const [activeTab, setActiveTab] = useState('navigation');
  const [followUser, setFollowUser] = useState(true);
  const [rotateMap, setRotateMap] = useState(true);
  const [isTracking, setIsTracking] = useState(false);
  const [sessionStats, setSessionStats] = useState({
    startTime: null,
    distance: 0,
    averageSpeed: 0,
    maxSpeed: 0
  });

  // Tracking de la sessió
  useEffect(() => {
    if (userLocation && !sessionStats.startTime) {
      setSessionStats(prev => ({
        ...prev,
        startTime: new Date()
      }));
      setIsTracking(true);
    }
  }, [userLocation, sessionStats.startTime]);

  // Calcular estadístiques en temps real
  useEffect(() => {
    if (userLocation && userLocation.speed) {
      const speedKmh = userLocation.speed * 3.6;
      
      setSessionStats(prev => ({
        ...prev,
        averageSpeed: speedKmh,
        maxSpeed: Math.max(prev.maxSpeed, speedKmh)
      }));
    }
  }, [userLocation]);

  const TabButton = ({ id, label, icon, active = false, disabled = false }) => (
    <button
      onClick={() => !disabled && setActiveTab(id)}
      disabled={disabled}
      className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-500 text-white'
          : disabled
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      <span className="text-lg">{icon}</span>
      <span>{label}</span>
    </button>
  );

  const formatDuration = (startTime) => {
    if (!startTime) return '00:00:00';
    const diff = new Date() - startTime;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen" style={{background: '#f0f0f3'}}>
      <div className="container mx-auto px-4 py-4 max-w-5xl">
        
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold">
                <span style={{color: '#ffd02e'}}>Bike</span>
                <span style={{color: '#1a1a1a'}}>GPS</span>
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Benvingut/da, {currentUser.email}
                {isTracking && (
                  <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                    📍 En ruta
                  </span>
                )}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Status indicators */}
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-3 h-3 rounded-full ${userLocation ? 'bg-green-400' : 'bg-gray-400'}`} 
                     title={userLocation ? 'GPS actiu' : 'GPS inactiu'}>
                </div>
                <span className="text-gray-600">GPS</span>
              </div>
              
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Sortir
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex flex-wrap gap-2">
            <TabButton id="navigation" label="Navegació" icon="🧭" active={activeTab === 'navigation'} />
            <TabButton id="navigation" label="Navegació" icon="🧭" active={activeTab === 'navigation'} />
            <TabButton id="routes" label="Rutes" icon="🛤️" active={activeTab === 'routes'} />
            <TabButton id="stats" label="Estadístiques" icon="📊" active={activeTab === 'stats'} />
            <TabButton id="incidents" label="Incidències" icon="🚨" active={activeTab === 'incidents'} />
          </div>
        </div>

        {/* Navigation Tab */}
        {activeTab === 'navigation' && (
          <div className="space-y-4">
            
            {/* Current Route Info */}
            {currentRoute && (
              <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-blue-600">{currentRoute.name}</h2>
                    <p className="text-sm text-gray-600">{currentRoute.description}</p>
                  </div>
                  <button
                    onClick={() => selectRoute(null)}
                    className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Sortir de la ruta"
                  >
                    ❌
                  </button>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <div className="text-lg font-semibold text-blue-600">{currentRoute.pointsCount}</div>
                    <div className="text-xs text-blue-700">Punts GPS</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg">
                    <div className="text-lg font-semibold text-green-600">
                      {routeProgress ? `${Math.round(routeProgress.percentage)}%` : '0%'}
                    </div>
                    <div className="text-xs text-green-700">Progrés</div>
                  </div>
                  <div className="bg-orange-50 p-3 rounded-lg">
                    <div className="text-lg font-semibold text-orange-600">
                      {routeProgress ? `${routeProgress.distanceToNext || 0}m` : '--'}
                    </div>
                    <div className="text-xs text-orange-700">Distància</div>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-lg">
                    <div className="text-lg font-semibold text-purple-600">
                      {isReturning ? 'Tornada' : 'Anada'}
                    </div>
                    <div className="text-xs text-purple-700">Direcció</div>
                  </div>
                </div>
              </div>
            )}

            {/* Map Container */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">
                  {currentRoute ? `Navegant: ${currentRoute.name}` : 'Mapa GPS'}
                </h2>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFollowUser(!followUser)}
                    className={`p-2 rounded-lg text-sm transition-colors ${
                      followUser 
                        ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                        : 'bg-gray-100 text-gray-600 border border-gray-300'
                    }`}
                    title={followUser ? 'Desactivar seguiment' : 'Activar seguiment'}
                  >
                    📍
                  </button>
                  
                  <button
                    onClick={() => setRotateMap(!rotateMap)}
                    className={`p-2 rounded-lg text-sm transition-colors ${
                      rotateMap 
                        ? 'bg-green-100 text-green-700 border border-green-300' 
                        : 'bg-gray-100 text-gray-600 border border-gray-300'
                    }`}
                    title={rotateMap ? 'Desactivar rotació' : 'Activar rotació'}
                  >
                    🧭
                  </button>
                </div>
              </div>

              <BikeMap
                mapInstanceRef={mapInstanceRef}
                currentRoute={currentRoute}
                userLocation={userLocation}
                followUser={followUser}
                showUserDirection={rotateMap}
                mapHeight="450px"
              />

              {/* Quick Actions */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={reportIncident}
                  className="flex-1 min-w-[120px] py-3 px-4 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
                >
                  🚨 Reportar Incidència
                </button>
                
                {!currentRoute ? (
                  <button
                    onClick={() => setActiveTab('routes')}
                    className="flex-1 min-w-[120px] py-3 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                  >
                    🛤️ Seleccionar Ruta
                  </button>
                ) : (
                  <button
                    onClick={() => selectRoute(null)}
                    className="flex-1 min-w-[120px] py-3 px-4 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium"
                  >
                    🔄 Finalitzar Ruta
                  </button>
                )}
              </div>
            </div>

            {/* Real-time Stats */}
            {userLocation && (
              <div className="bg-white rounded-lg shadow-sm p-4">
                <h3 className="font-semibold mb-3">Dades en temps real</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {userLocation.speed ? Math.round(userLocation.speed * 3.6) : 0}
                    </div>
                    <div className="text-sm text-gray-600">km/h</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {userLocation.heading ? Math.round(userLocation.heading) : '--'}
                    </div>
                    <div className="text-sm text-gray-600">graus</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      ±{Math.round(userLocation.accuracy)}
                    </div>
                    <div className="text-sm text-gray-600">metres</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {sessionStats.startTime ? formatDuration(sessionStats.startTime) : '--:--:--'}
                    </div>
                    <div className="text-sm text-gray-600">temps</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Routes Tab */}
        {activeTab === 'routes' && (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-4">Rutes Disponibles</h2>
            
            {routes.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">🛤️</div>
                <p className="text-gray-500 mb-2">No hi ha rutes disponibles</p>
                <p className="text-sm text-gray-400">Contacta amb un administrador per afegir rutes.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {routes.map((route) => (
                  <div key={route.id} className={`border rounded-lg p-4 transition-colors cursor-pointer hover:border-blue-300 ${
                    currentRoute?.id === route.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}>
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-medium text-lg">{route.name}</h3>
                      {currentRoute?.id === route.id && (
                        <span className="px-2 py-1 bg-blue-500 text-white rounded text-xs">
                          Activa
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">{route.description}</p>
                    
                    <div className="text-xs text-gray-500 mb-4 space-y-1">
                      <div>📊 {route.pointsCount} punts GPS</div>
                      <div>📄 {route.gpxFileName}</div>
                      {route.createdAt && (
                        <div>📅 Creada: {route.createdAt.toDate?.()?.toLocaleDateString()}</div>
                      )}
                    </div>
                    
                    <button
                      onClick={() => {
                        selectRoute(route);
                        setActiveTab('navigation');
                      }}
                      className={`w-full py-2 px-3 text-sm rounded transition-colors ${
                        currentRoute?.id === route.id
                          ? 'bg-blue-500 text-white'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      }`}
                    >
                      {currentRoute?.id === route.id ? '✓ Ruta Activa' : '🧭 Iniciar Navegació'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            
            {/* Session Stats */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h2 className="text-lg font-semibold mb-4">Sessió Actual</h2>
              
              {sessionStats.startTime ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatDuration(sessionStats.startTime)}
                    </div>
                    <div className="text-sm text-blue-700">Temps total</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {Math.round(sessionStats.distance / 1000 * 100) / 100}
                    </div>
                    <div className="text-sm text-green-700">km recorreguts</div>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {Math.round(sessionStats.averageSpeed)}
                    </div>
                    <div className="text-sm text-orange-700">km/h mitjana</div>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {Math.round(sessionStats.maxSpeed)}
                    </div>
                    <div className="text-sm text-red-700">km/h màxima</div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-4xl mb-2">📊</div>
                  <p className="text-gray-500">Inicia una ruta per veure estadístiques</p>
                </div>
              )}
            </div>

            {/* GPS Status */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h2 className="text-lg font-semibold mb-4">Estat del GPS</h2>
              
              {userLocation ? (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span>Estat:</span>
                    <span className="text-green-600 font-medium">✅ Actiu</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Precisió:</span>
                    <span className="font-medium">±{Math.round(userLocation.accuracy)}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Coordenades:</span>
                    <span className="font-mono text-sm">
                      {userLocation.latitude.toFixed(6)}, {userLocation.longitude.toFixed(6)}
                    </span>
                  </div>
                  {userLocation.heading && (
                    <div className="flex justify-between">
                      <span>Direcció:</span>
                      <span className="font-medium">{Math.round(userLocation.heading)}° (respecte Nord)</span>
                    </div>
                  )}
                  {userLocation.speed !== null && (
                    <div className="flex justify-between">
                      <span>Velocitat:</span>
                      <span className="font-medium">{Math.round(userLocation.speed * 3.6)} km/h</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-4xl mb-2">📍</div>
                  <p className="text-gray-500">Cercant senyal GPS...</p>
                  <p className="text-xs text-gray-400 mt-2">Assegura't que els permisos de geolocalització estan activats</p>
                </div>
              )}
            </div>

            {/* Community Stats */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h2 className="text-lg font-semibold mb-4">Estadístiques de la Comunitat</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{routes.length}</div>
                  <div className="text-sm text-gray-600">Rutes disponibles</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{users.length}</div>
                  <div className="text-sm text-gray-600">Usuaris connectats</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {incidents.filter(i => !i.resolved).length}
                  </div>
                  <div className="text-sm text-gray-600">Incidències obertes</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Incidents Tab */}
        {activeTab === 'incidents' && (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Incidències Reportades</h2>
              <button
                onClick={reportIncident}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                🚨 Reportar Nova
              </button>
            </div>
            
            {incidents.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">🚨</div>
                <p className="text-gray-500 mb-2">No hi ha incidències reportades</p>
                <p className="text-sm text-gray-400">Esperem que tot vagi bé durant les rutes!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {incidents
                  .sort((a, b) => (b.timestamp?.toDate?.() || 0) - (a.timestamp?.toDate?.() || 0))
                  .map((incident) => (
                    <div 
                      key={incident.id} 
                      className={`border rounded-lg p-4 ${
                        incident.resolved 
                          ? 'border-green-200 bg-green-50' 
                          : 'border-orange-200 bg-orange-50'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xl ${incident.resolved ? '✅' : '🚨'}`} />
                          <div>
                            <h3 className="font-medium">{incident.userName}</h3>
                            <span className="text-sm text-gray-500">
                              {incident.timestamp?.toDate?.()?.toLocaleString() || 'Data no disponible'}
                            </span>
                          </div>
                        </div>
                        
                        <span className={`px-2 py-1 rounded text-xs ${
                          incident.resolved 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {incident.resolved ? 'Resolta' : 'Oberta'}
                        </span>
                      </div>
                      
                      <p className="text-gray-700 mb-2">{incident.message}</p>
                      
                      {incident.location && (
                        <p className="text-xs text-gray-500">
                          📍 {incident.location.latitude?.toFixed(6)}, {incident.location.longitude?.toFixed(6)}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Notification system */}
      {notification && (
        <div className={`fixed top-4 right-4 p-4 rounded-lg text-white z-50 max-w-sm shadow-lg ${
          notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          <div className="flex justify-between items-start">
            <div className="flex-1 mr-2">{notification.message}</div>
            <button
              onClick={() => setNotification(null)}
              className="text-white hover:text-gray-200 font-bold text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserDashboard;
