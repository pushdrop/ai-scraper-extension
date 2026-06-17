import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

function Options() {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [status, setStatus] = useState('');
  const [availableModels, setAvailableModels] = useState<{id: string}[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const fetchModels = async (key: string) => {
    if (!key) return;
    setIsLoadingModels(true);
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${key}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        const models = data.data
          .filter((m: any) => m.id.startsWith('gpt') || m.id.startsWith('o1') || m.id.startsWith('o3'))
          .sort((a: any, b: any) => a.id.localeCompare(b.id));
        setAvailableModels(models);
      }
    } catch (e) {
      console.error('Failed to fetch models', e);
    }
    setIsLoadingModels(false);
  };

  useEffect(() => {
    chrome.storage.sync.get(['apiKey', 'model'], (items) => {
      if (typeof items.apiKey === 'string') {
        setApiKey(items.apiKey);
        fetchModels(items.apiKey);
      }
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <select 
            value={model} 
            onChange={(e) => setModel(e.target.value)} 
            style={{ flex: 1, padding: '8px', boxSizing: 'border-box' }}
          >
            {availableModels.length > 0 ? (
              availableModels.map(m => (
                <option key={m.id} value={m.id}>{m.id}</option>
              ))
            ) : (
              <>
                <option value="gpt-4.5-preview">GPT-4.5 Preview</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="o1">o1</option>
                <option value="o1-preview">o1 Preview</option>
                <option value="o1-mini">o1 Mini</option>
                <option value="o3-mini">o3 Mini</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
              </>
            )}
          </select>
          <button
            onClick={() => fetchModels(apiKey)}
            disabled={isLoadingModels || !apiKey}
            style={{ padding: '8px 16px', background: '#e0e0e0', border: '1px solid #ccc', borderRadius: '4px', cursor: (isLoadingModels || !apiKey) ? 'not-allowed' : 'pointer' }}
          >
            {isLoadingModels ? 'Loading...' : 'Fetch'}
          </button>
        </div>
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
