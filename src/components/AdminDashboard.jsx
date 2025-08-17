import React, { useState } from 'react';
import BikeMap from './BikeMap';

const AdminDashboard = ({
  currentUser,
  isSuperAdmin,
  routes = [], // Fallback per evitar errors
  users = [], // Fallback per evitar errors  
  incidents = [], // Fallback per evitar errors
  allUsers = [], // Fallback per evitar errors
  currentRoute,
  showUploadProgress,
  uploadProgress,
  handleCreateRoute,
  selectRoute,
  deleteRoute,
  resolveIncident,
  loadAllUsers,
  makeUserAdmin,
  handleLogout,
  mapInstanceRef,
  userLocation,
  notification,
  refreshData // Afegim aquesta prop que faltava
}) => {
  const [activeTab, setActiveTab] = useState('map');
  const [followUser, setFollowUser] = useState(true);
  const [rotateMap, setRotateMap] = useState(true);

  // Debug: Log de les props rebudes
  console.log('🔍 AdminDashboard props:', {
    routesLength: routes?.length,
    usersLength: users?.length,
    incidentsLength: incidents?.length,
    allUsersLength: allUsers?.length,
    hasRefreshData: !!refreshData
  });

  const TabButton = ({ id, label, icon, count }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        activeTab === id
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {count !== undefined && (
        <span className={`px-2 py-1 rounded-full text-xs ${
          activeTab === id ? 'bg-white text-blue-500' : 'bg-gray-300 text-gray-700'
        }`}>
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen" style={{background: '#f0f0f3'}}>
      <div className="container mx-auto px-4 py-4 max-w-6xl">
        
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold">
                <span style={{color: '#ffd02e'}}>Bike</span>
                <span style={{color: '#1a1a1a'}}>GPS</span>
                <span className="ml-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                  Admin Panel
                </span>
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Benvingut/da, {currentUser?.email}
                {isSuperAdmin && <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">Super Admin</span>}
              </p>
            </div>
            
            <div className="flex gap-2">
              {/* Botó de refresh manual */}
              <button
                onClick={() => {
                  console.log('🔄 Refresh manual des d\'AdminDashboard');
                  if (refreshData) refreshData();
                }}
                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                title="Refrescar dades"
              >
                🔄
              </button>
              
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Tancar Sessió
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex flex-wrap gap-2">
            <TabButton id="map" label="Mapa GPS" icon="🗺️" />
            <TabButton id="routes" label="Gestió Rutes" icon="🛤️" count={routes.length} />
            <TabButton id="users" label="Usuaris" icon="👥" count={users.length} />
            <TabButton id="incidents" label="Incidències" icon="🚨" count={incidents.filter(i => !i.resolved).length} />
            <TabButton id="create" label="Crear Ruta" icon="➕" />
            {isSuperAdmin && (
              <TabButton id="management" label="Administració" icon="⚙️" />
            )}
          </div>
        </div>

        {/* Debug Info (només per desenvolupament) */}
        {import.meta.env.DEV && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm">
            <strong>🐛 Debug Info:</strong> Routes: {routes.length} | Users: {users.length} | Incidents: {incidents.length} | AllUsers: {allUsers.length}
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'map' && (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Mapa de Control</h2>
              
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
              mapHeight="500px"
            />
            
            {/* Map Stats */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-lg font-semibold text-blue-600">{users.length}</div>
                <div className="text-sm text-gray-600">Usuaris actius</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-lg font-semibold text-green-600">{routes.length}</div>
                <div className="text-sm text-gray-600">Rutes disponibles</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-lg font-semibold text-orange-600">
                  {incidents.filter(i => !i.resolved).length}
                </div>
                <div className="text-sm text-gray-600">Incidències obertes</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-lg font-semibold text-purple-600">
                  {userLocation?.accuracy ? `±${Math.round(userLocation.accuracy)}m` : '--'}
                </div>
                <div className="text-sm text-gray-600">Precisió GPS</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'routes' && (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Gestió de Rutes ({routes.length})</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    console.log('🔄 Refrescant rutes...');
                    if (refreshData) refreshData();
                  }}
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  🔄 Actualitzar
                </button>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  ➕ Nova Ruta
                </button>
              </div>
            </div>

            {routes.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">🛤️</div>
                <p className="text-gray-500 mb-2">No hi ha rutes creades</p>
                <p className="text-xs text-gray-400 mb-4">
                  Debug: routes array length = {routes.length}
                </p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  Crear la primera ruta
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {routes.map((route) => (
                  <div key={route.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-medium text-lg">{route.name}</h3>
                      <span className={`px-2 py-1 rounded text-xs ${
                        currentRoute?.id === route.id 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {currentRoute?.id === route.id ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">{route.description}</p>
                    
                    <div className="text-xs text-gray-500 mb-4">
                      <div>📊 {route.pointsCount || route.coordinates?.length || 0} punts GPS</div>
                      <div>📄 {route.gpxFileName || 'Fitxer no especificat'}</div>
                      <div>👤 Creada per: {route.createdByName || route.createdBy || 'Desconegut'}</div>
                      {route.createdAt && (
                        <div>📅 {route.createdAt.toDate?.()?.toLocaleDateString() || 'Data no disponible'}</div>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => selectRoute(route)}
                        className={`flex-1 py-2 px-3 text-sm rounded transition-colors ${
                          currentRoute?.id === route.id
                            ? 'bg-blue-500 text-white'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }`}
                      >
                        {currentRoute?.id === route.id ? '✓ Seleccionada' : 'Seleccionar'}
                      </button>
                      
                      <button
                        onClick={() => {
                          if (confirm(`Eliminar la ruta "${route.name}"?\n\nAquesta acció no es pot desfer.`)) {
                            deleteRoute(route.id);
                          }
                        }}
                        className="p-2 text-red-500 hover:bg-red-100 rounded transition-colors"
                        title="Eliminar ruta"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Usuaris Connectats ({users.length})</h2>
              <button
                onClick={() => {
                  console.log('🔄 Refrescant usuaris...');
                  if (refreshData) refreshData();
                }}
                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                🔄 Actualitzar
              </button>
            </div>
            
            {users.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">👥</div>
                <p className="text-gray-500 mb-2">No hi ha usuaris connectats</p>
                <p className="text-xs text-gray-400 mb-4">
                  Debug: users array length = {users.length}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((user) => (
                  <div key={user.id || user.uid} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-medium">
                          {(user.displayName || user.email)?.charAt(0).toUpperCase() || '?'}
                        </span>
                      </div>
                      
                      <div>
                        <div className="font-medium">{user.displayName || user.email || 'Usuari sense nom'}</div>
                        <div className="text-sm text-gray-500">
                          {user.lastUpdated?.toDate?.()?.toLocaleString() || 
                           user.lastSeen?.toDate?.()?.toLocaleString() || 
                           'Mai connectat'}
                        </div>
                        {user.location && (
                          <div className="text-xs text-gray-400">
                            📍 {user.location.latitude?.toFixed(4)}, {user.location.longitude?.toFixed(4)}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {user.isOnline && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                          Online
                        </span>
                      )}
                      {user.location && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                          GPS Actiu
                        </span>
                      )}
                      {user.isAdmin && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                          Admin
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'incidents' && (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                Gestió d'Incidències ({incidents.filter(i => !i.resolved).length} pendents / {incidents.length} total)
              </h2>
              <button
                onClick={() => {
                  console.log('🔄 Refrescant incidències...');
                  if (refreshData) refreshData();
                }}
                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                🔄 Actualitzar
              </button>
            </div>
            
            {incidents.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">🚨</div>
                <p className="text-gray-500 mb-2">No hi ha incidències reportades</p>
                <p className="text-xs text-gray-400 mb-4">
                  Debug: incidents array length = {incidents.length}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {incidents
                  .sort((a, b) => (a.resolved ? 1 : 0) - (b.resolved ? 1 : 0))
                  .map((incident) => (
                    <div 
                      key={incident.id} 
                      className={`border rounded-lg p-4 ${
                        incident.resolved 
                          ? 'border-green-200 bg-green-50' 
                          : 'border-orange-200 bg-orange-50'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-2xl ${incident.resolved ? '✅' : '🚨'}`} />
                          <div>
                            <h3 className="font-medium">{incident.userName || 'Usuari anònim'}</h3>
                            <span className="text-sm text-gray-500">
                              {incident.timestamp?.toDate?.()?.toLocaleString() || 'Data no disponible'}
                            </span>
                          </div>
                        </div>
                        
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          incident.resolved 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {incident.resolved ? 'Resolta' : 'Pendent'}
                        </span>
                      </div>
                      
                      <p className="text-gray-700 mb-3">{incident.message || 'Sense missatge'}</p>
                      
                      {incident.location && (
                        <div className="text-sm text-gray-500 mb-3">
                          📍 Ubicació: {incident.location.latitude?.toFixed(6)}, {incident.location.longitude?.toFixed(6)}
                          {incident.location.accuracy && (
                            <span> (±{Math.round(incident.location.accuracy)}m)</span>
                          )}
                        </div>
                      )}
                      
                      {!incident.resolved && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => resolveIncident(incident.id)}
                            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                          >
                            ✓ Marcar com resolta
                          </button>
                          
                          {incident.location && (
                            <button
                              onClick={() => {
                                // TODO: Centrar mapa a la ubicació de la incidència
                                setActiveTab('map');
                              }}
                              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                            >
                              📍 Veure al mapa
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'create' && (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-4">Crear Nova Ruta</h2>
            
            <form onSubmit={handleCreateRoute} className="max-w-2xl">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom de la ruta *
                  </label>
                  <input
                    type="text"
                    name="routeName"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: Ruta Costa Brava - Calella a Tossa"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descripció
                  </label>
                  <textarea
                    name="routeDescription"
                    rows="4"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Descripció detallada de la ruta: punts d'interès, dificultat, durada aproximada, etc."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Arxiu GPX *
                  </label>
                  <input
                    type="file"
                    name="gpxFile"
                    accept=".gpx"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Selecciona un fitxer GPX amb el traçat de la ruta. Pots generar-lo amb aplicacions com Strava, Komoot o similar.
                  </p>
                </div>
                
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={showUploadProgress}
                    className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {showUploadProgress ? `Processant... ${uploadProgress}%` : '✓ Crear Ruta'}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setActiveTab('routes')}
                    className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Cancel·lar
                  </button>
                </div>
                
                {showUploadProgress && (
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-green-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
              </div>
            </form>
          </div>
        )}

        {activeTab === 'management' && isSuperAdmin && (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-4">Administració del Sistema</h2>
            
            <div className="space-y-6">
              {/* User Management */}
              <div>
                <h3 className="font-medium mb-3">Gestió d'Usuaris</h3>
                <button
                  onClick={loadAllUsers}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors mb-4"
                >
                  🔄 Carregar tots els usuaris
                </button>
                
                {allUsers.length > 0 && (
                  <div className="space-y-2">
                    {allUsers.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div>
                          <div className="font-medium">{user.email}</div>
                          <div className="text-sm text-gray-500">
                            Registrat: {user.createdAt?.toDate?.()?.toLocaleDateString() || 'Data no disponible'}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {user.isAdmin ? (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                              Admin
                            </span>
                          ) : (
                            <button
                              onClick={() => makeUserAdmin(user.id)}
                              className="px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 transition-colors"
                            >
                              Fer Admin
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* System Stats */}
              <div>
                <h3 className="font-medium mb-3">Estadístiques del Sistema</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{allUsers.length || users.length}</div>
                    <div className="text-sm text-blue-700">Total usuaris registrats</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{routes.length}</div>
                    <div className="text-sm text-green-700">Rutes creades</div>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">{incidents.length}</div>
                    <div className="text-sm text-orange-700">Total incidències</div>
                  </div>
                </div>
              </div>
            </div>
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

export default AdminDashboard;
