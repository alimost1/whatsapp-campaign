import { useState, useEffect, useRef } from 'react';
import api from '../api';
import { Upload, Users, Trash2, Filter, X, Search, Download, Plus, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
  const fileInputRef = useRef(null);

  const ITEMS_PER_PAGE = 25;

  const fetchData = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedGroup) params.append('group', selectedGroup);
      if (searchQuery) params.append('search', searchQuery);
      params.append('page', currentPage);
      params.append('limit', ITEMS_PER_PAGE);
      params.append('sort', sortConfig.key);
      params.append('order', sortConfig.direction);

      const [ctRes, grRes] = await Promise.all([
        api.get(`/contacts?${params.toString()}`),
        api.get('/contacts/groups'),
      ]);
      setContacts(ctRes.data || []);
      setTotalPages(ctRes.totalPages || 1);
      setGroups(grRes.data || []);
    } catch {
      setContacts([]);
      setTotalPages(1);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedGroup, searchQuery, currentPage, sortConfig]);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv'))) {
      setFile(f);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv'))) {
      setFile(f);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append('file', file);
    if (groupName.trim()) formData.append('groupName', groupName.trim());
    try {
      const res = await api.post('/contacts/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(res.data);
      setFile(null);
      setGroupName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchData();
    } catch (err) {
      setImportResult({ error: err.response?.data?.error || 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/contacts/${id}`);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // ignore
    } finally {
      setDeleteId(null);
    }
  };

  const exportContacts = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedGroup) params.append('group', selectedGroup);
      if (searchQuery) params.append('search', searchQuery);
      
      const response = await api.get(`/contacts/export?${params.toString()}`, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `contacts_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
      setImportResult({ error: 'Export failed' });
    }
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const filteredContacts = contacts;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Contacts</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage and organize your WhatsApp contacts</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportContacts}
            disabled={loading || contacts.length === 0}
            className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Import Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 sticky top-24">
            <h2 className="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Upload className="w-4 h-4 text-green-600 dark:text-green-400" />
              Import Contacts
            </h2>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition mb-4 ${
                dragOver ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-slate-300 dark:border-slate-600 hover:border-green-400'
              }`}
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400 dark:text-slate-500" />
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {file ? file.name : 'Drop .xlsx, .xls, or .csv file here, or click to browse'}
              </p>
              {file && (
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="mt-2 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="mb-4">
              <label htmlFor="groupName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Group Name (optional)
              </label>
              <input
                type="text"
                id="groupName"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g., VIP Customers"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Contacts will be assigned to this group</p>
            </div>

            <button
              onClick={handleImport}
              disabled={!file || importing}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-2.5 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Import Contacts
                </>
              )}
            </button>

            {importResult && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${importResult.error ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300' : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'}`}>
                <div className="flex items-center gap-2">
                  {importResult.error ? (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>
                    {importResult.error || `Imported ${importResult.imported} contacts (${importResult.skipped || 0} skipped)`}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Contacts List */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
                All Contacts
                <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                  {contacts.length} / {totalPages > 1 ? '...' : contacts.length}
                </span>
              </h2>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search contacts…"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={selectedGroup}
                    onChange={(e) => { setSelectedGroup(e.target.value); setCurrentPage(1); }}
                    className="text-sm border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">All groups</option>
                    {groups.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  {selectedGroup && (
                    <button
                      onClick={() => { setSelectedGroup(''); setCurrentPage(1); }}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded"
                      aria-label="Clear filter"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-green-600" />
                Loading contacts...
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                <Users className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                <p className="text-slate-600 dark:text-slate-400">No contacts found.</p>
                <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Import an Excel or CSV file to get started.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                        <th className="px-6 py-3 font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('name')}>
                          Name {getSortIcon('name')}
                        </th>
                        <th className="px-6 py-3 font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('phone')}>
                          Phone {getSortIcon('phone')}
                        </th>
                        <th className="px-6 py-3 font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('group_name')}>
                          Group {getSortIcon('group_name')}
                        </th>
                        <th className="px-6 py-3 font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => handleSort('created_at')}>
                          Added {getSortIcon('created_at')}
                        </th>
                        <th className="px-6 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {filteredContacts.map((contact) => (
                        <tr key={contact.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-800 dark:text-white">{contact.name || '-'}</td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-300 font-mono text-xs">{contact.phone}</td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">
                            {contact.group_name ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
                                {contact.group_name}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">
                            {contact.created_at ? new Date(contact.created_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => setDeleteId(contact.id)}
                              className="text-red-400 hover:text-red-600 dark:hover:text-red-400 transition-colors p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                              aria-label="Delete contact"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Page {currentPage} of {totalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirm Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl">
            <h3 id="delete-title" className="font-semibold text-slate-800 dark:text-white mb-2">Delete Contact</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">Are you sure you want to delete this contact? This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}