import React, { useState } from 'react';
import {
  BookOpen,
  FileText,
  Download,
  Search,
  CheckCircle,
  Users,
  Briefcase,
  FileCheck
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ResourceDocument } from '../../types';
import { EditorialSheet } from '../common/EditorialSheet';
import { EditorialButton } from '../common/EditorialButton';

export const ResourceCatalogSheet: React.FC = () => {
  const {
    resources,
    selectedResource,
    resourceCatalogOpen,
    setResourceCatalogOpen,
    openResourceReader,
    closeResourceReader,
    currentRole
  } = useApp();

  const [activeTab, setActiveTab] = useState<'ALL' | 'EMPLOYEE' | 'EMPLOYER'>(
    currentRole === 'EMPLOYER' ? 'EMPLOYER' : 'EMPLOYEE'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);

  const filteredResources = resources.filter(res => {
    if (activeTab === 'EMPLOYEE' && res.targetRole === 'EMPLOYER') return false;
    if (activeTab === 'EMPLOYER' && res.targetRole === 'EMPLOYEE') return false;
    if (selectedCategory !== 'ALL' && res.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        res.title.toLowerCase().includes(q) ||
        res.description.toLowerCase().includes(q) ||
        res.fileName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const categories = Array.from(new Set(resources.map(r => r.category)));

  const handleDownload = (doc: ResourceDocument) => {
    if (!doc.pdfDataUri) {
      setDownloadSuccessToast("Aucun fichier disponible.");
      setTimeout(() => setDownloadSuccessToast(null), 3000);
      return;
    }
    const link = document.createElement('a');
    link.href = doc.pdfDataUri;
    link.download = doc.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloadSuccessToast(`Téléchargement de "${doc.fileName}"`);
    setTimeout(() => setDownloadSuccessToast(null), 3500);
  };

  const handleConsult = (doc: ResourceDocument) => {
    if (doc.pdfDataUri) {
      window.open(doc.pdfDataUri, '_blank');
    } else {
      openResourceReader(doc);
    }
  };

  return (
    <>
      <EditorialSheet
        isOpen={resourceCatalogOpen}
        onClose={() => setResourceCatalogOpen(false)}
        title="Formations & Ressources"
        subtitle="Documents officiels et guides pratiques LE LABEUR"
      >
        <div className="space-y-4 font-operational text-xs">
          <div className="grid grid-cols-3 gap-1 bg-[#17233B]/5 p-1 rounded">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`py-1.5 px-2 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                activeTab === 'ALL'
                  ? 'bg-[#17233B] text-white shadow-xs'
                  : 'text-[#17233B]/70 hover:text-[#17233B]'
              }`}
            >
              Tous ({resources.length})
            </button>
            <button
              onClick={() => setActiveTab('EMPLOYEE')}
              className={`py-1.5 px-2 rounded text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'EMPLOYEE'
                  ? 'bg-[#17233B] text-white shadow-xs'
                  : 'text-[#17233B]/70 hover:text-[#17233B]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Pour Salariés</span>
            </button>
            <button
              onClick={() => setActiveTab('EMPLOYER')}
              className={`py-1.5 px-2 rounded text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'EMPLOYER'
                  ? 'bg-[#17233B] text-white shadow-xs'
                  : 'text-[#17233B]/70 hover:text-[#17233B]'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Pour Employeurs</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-[#17233B]/40 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Rechercher un document..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] placeholder-[#17233B]/40 focus:outline-none focus:border-[#17233B]"
            />
          </div>

          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase font-bold shrink-0 transition-colors cursor-pointer ${
                  selectedCategory === 'ALL'
                    ? 'bg-[#17233B] text-white'
                    : 'bg-white border border-[#17233B]/10 text-[#17233B]/60 hover:text-[#17233B]'
                }`}
              >
                Toutes Catégories
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase font-bold shrink-0 transition-colors cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-[#17233B] text-white'
                      : 'bg-white border border-[#17233B]/10 text-[#17233B]/60 hover:text-[#17233B]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {downloadSuccessToast && (
            <div className="p-2.5 bg-[#1BA64B]/10 border border-[#1BA64B]/30 rounded text-[#1BA64B] text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{downloadSuccessToast}</span>
            </div>
          )}

          <div className="space-y-2.5 pb-6">
            {filteredResources.map(doc => (
              <div
                key={doc.id}
                className="p-3.5 bg-white rounded border border-[#17233B]/10 hover:border-[#17233B]/30 transition-all shadow-xs flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded bg-[#17233B]/5 border border-[#17233B]/10 flex items-center justify-center text-[#17233B] shrink-0 mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono uppercase text-[#340C24] font-bold bg-[#340C24]/5 px-1 rounded">
                          {doc.category}
                        </span>
                        <span className="text-[10px] font-mono text-[#17233B]/50">
                          {doc.targetRole === 'EMPLOYER' ? 'Employeurs' : 'Salariés'}
                        </span>
                      </div>
                      <h4 className="font-editorial text-sm font-bold text-[#17233B] mt-0.5 leading-snug">
                        {doc.title}
                      </h4>
                      <p className="text-[11px] text-[#17233B]/70 mt-1 leading-normal line-clamp-2">
                        {doc.description}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#17233B]/5 text-[11px] text-[#17233B]/60">
                  <span className="font-mono text-[10px]">{doc.fileName}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownload(doc)}
                      className="px-2.5 py-1 rounded bg-[#F3F3EC] hover:bg-[#17233B]/10 text-[#17233B] text-[10px] font-medium flex items-center gap-1 transition-colors tap-feedback cursor-pointer"
                      title="Télécharger le fichier PDF"
                    >
                      <Download className="w-3 h-3" />
                      <span>Télécharger</span>
                    </button>
                    <button
                      onClick={() => handleConsult(doc)}
                      className="px-3 py-1 rounded bg-[#17233B] text-[#F3F3EC] text-[10px] font-medium flex items-center gap-1 hover:bg-[#17233B]/90 transition-colors tap-feedback cursor-pointer"
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>Consulter</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {filteredResources.length === 0 && (
              <div className="p-8 text-center text-[#17233B]/50 bg-white rounded border border-[#17233B]/10">
                <FileCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="font-bold text-xs text-[#17233B]">
                  Aucun document disponible pour le moment.
                </p>
                <p className="text-[11px] text-[#17233B]/60 mt-1">
                  Les guides PDF ajoutés dans src/resources/ apparaîtront automatiquement ici.
                </p>
              </div>
            )}
          </div>
        </div>
      </EditorialSheet>

      {selectedResource && (
        <EditorialSheet
          isOpen={!!selectedResource}
          onClose={closeResourceReader}
          title={selectedResource.title}
          subtitle={`${selectedResource.category} — ${selectedResource.fileName}`}
        >
          <div className="space-y-4 font-operational text-xs">
            <div className="p-3 bg-[#17233B]/5 rounded border border-[#17233B]/10">
              <p className="text-[#17233B] leading-relaxed text-xs">
                {selectedResource.description}
              </p>
              <div className="mt-2 text-[10px] font-mono text-[#17233B]/50 flex items-center justify-between">
                <span>Fichier : {selectedResource.logicalPath}</span>
              </div>
            </div>

            <div>
              <h5 className="font-editorial text-sm font-bold text-[#17233B] mb-2">
                Points Clés
              </h5>
              <div className="space-y-2">
                {selectedResource.summaryPoints.map((pt, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2 bg-white rounded border border-[#17233B]/10">
                    <CheckCircle className="w-3.5 h-3.5 text-[#1BA64B] shrink-0 mt-0.5" />
                    <span className="text-[#17233B]/80 text-[11px] leading-snug">{pt}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <EditorialButton
                variant="primary"
                fullWidth
                onClick={() => handleDownload(selectedResource)}
              >
                <Download className="w-4 h-4 mr-1.5" />
                <span>Télécharger le document</span>
              </EditorialButton>
            </div>
          </div>
        </EditorialSheet>
      )}
    </>
  );
};
