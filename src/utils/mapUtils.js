// utils/mapUtils.js
import L from 'leaflet';

export const createCustomIcons = () => {
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

export const showNotification = (message, type = 'info', setNotification) => {
  setNotification({ message, type });
  setTimeout(() => setNotification(null), 5000);
};

// Extend Leaflet Map with rotation support
L.Map.include({
  setBearing: function(bearing) {
    if (!this._loaded) return this;
    
    bearing = bearing * Math.PI / 180; // Convert to radians
    
    const container = this.getContainer();
    container.style.transform = `rotate(${-bearing}rad)`;
    
    // Counter-rotate the controls and markers to keep them upright
    const controls = container.querySelectorAll('.leaflet-control');
    const markers = container.querySelectorAll('.leaflet-marker-icon');
    
    controls.forEach(control => {
      control.style.transform = `rotate(${bearing}rad)`;
    });
    
    markers.forEach(marker => {
      marker.style.transform = `rotate(${bearing}rad)`;
    });
    
    return this;
  }
});