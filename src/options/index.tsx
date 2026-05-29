import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

function Options() {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [status, setStatus] = useState('');

  useEffect(() => {
    chrome.storage.sync.get(['apiKey', 'model'], (items) => {
      if (typeof items.apiKey === 'string') setApiKey(items.apiKey);
      if (typeof items.model === 'string') setModel(items.model);
    });
  }, []);

  const handleSave = () => {
    chrome.storage.sync.set({ apiKey, model }, () => {
      setStatus('Settings saved.');
      setTimeout(() => setStatus(''), 2000);
    });
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif', maxWidth: '400px' }}>
      <h1>Smart Copy Settings</h1>
      
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          OpenAI API Key
        </label>
        <input 
          type="password" 
          value={apiKey} 
          onChange={(e) => setApiKey(e.target.value)} 
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          placeholder="sk-..."
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Model
        </label>
        <input 
          type="text" 
          value={model} 
          onChange={(e) => setModel(e.target.value)} 
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
        />
      </div>

      <button 
        onClick={handleSave}
        style={{ padding: '8px 16px', background: '#0066cc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
      >
        Save Settings
      </button>

      {status && <p style={{ color: 'green', marginTop: '16px' }}>{status}</p>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>,
);
