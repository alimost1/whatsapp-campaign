import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { APP_VERSION, APP_CODENAME } from '../version';

const VERSIONS = [
  { id: '1', label: 'v1', name: 'Classic', codename: 'athena', path: '' },
  { id: '2', label: 'v2', name: 'Chatbot', codename: 'chatbot', path: '/v2' },
];

/**
 * Top-of-page version badge.
 * Reads the active version from localStorage and renders a dropdown to switch.
 */
export default function VersionBadge() {
  const [active, setActive] = useState(() => {
    // Active version is derived from the URL — v2 routes live under /v2/*
    const p = window.location.pathname;
    return p.startsWith('/v2') ? '2' : '1';
  });
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Keep state in sync if the user navigates with browser back/forward
  useEffect(() => {
    const onPop = () => {
      const p = window.location.pathname;
      setActive(p.startsWith('/v2') ? '2' : '1');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const current = VERSIONS.find((v) => v.id === active) || VERSIONS[0];

  function switchTo(versionId) {
    setOpen(false);
    if (versionId === active) return;
    const target = VERSIONS.find((v) => v.id === versionId);
    if (!target) return;

    // Remember user choice
    localStorage.setItem('preferredVersion', versionId);

    // Translate the current path into the target version's prefix
    let currentPath = window.location.pathname;
    // Strip any existing /v2 prefix
    if (currentPath.startsWith('/v2')) {
      currentPath = currentPath.slice(3) || '/';
    }
    const targetPath = target.path + currentPath;
    setActive(versionId);
    navigate(targetPath);
  }

  return (
    <div className="fixed top-2 right-2 z-50">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow-md transition ${
            active === '2'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
              : 'bg-gray-800 text-white hover:bg-gray-700'
          }`}
          title={`${current.name} (${current.codename})`}
        >
          <span className="font-bold">{current.label}</span>
          <span className="opacity-80">·</span>
          <span className="opacity-80">{current.codename}</span>
          <span className="opacity-60 ml-0.5">▾</span>
        </button>

        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                Switch version
              </div>
              {VERSIONS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => switchTo(v.id)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition flex items-center justify-between ${
                    active === v.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div>
                    <div className="font-semibold text-gray-800">{v.label} — {v.name}</div>
                    <div className="text-xs text-gray-500">{v.codename}</div>
                  </div>
                  {active === v.id && (
                    <span className="text-blue-600 text-xs">●</span>
                  )}
                </button>
              ))}
              <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
                Build: {APP_VERSION}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
