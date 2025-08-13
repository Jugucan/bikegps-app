// components/AuthScreen.js
import React from 'react';

const AuthScreen = ({ 
  authTab, 
  setAuthTab, 
  handleLogin, 
  handleRegister, 
  notification 
}) => {
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
};

export default AuthScreen;