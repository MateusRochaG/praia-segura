
import React, { useState, useEffect, useRef } from 'react';
import Navigation from './components/Navigation';
import { Tab, BeachData, RiskLevel, GroundingSource } from './types';
import { identifyBeach, getSafetyAdvice, searchBeach } from './services/geminiService';
import LoadingScreen from './components/LoadingScreen';
import RiskBadge from './components/RiskBadge';
import { 
  MapPin, AlertOctagon, Waves, LifeBuoy, Search, Send, RefreshCw, 
  AlertTriangle, Camera, X, Info, Edit2, LocateFixed, Navigation as NavIcon,
  ShieldAlert, Clock, History, ArrowDown, Mountain, Baby
} from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [beachData, setBeachData] = useState<BeachData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  
  const [showDangerModal, setShowDangerModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{id: string, role: 'user' | 'model', text: string, image?: string, sources?: GroundingSource[]}[]>([
    { id: '0', role: 'model', text: 'Olá! Sou seu assistente de segurança. Tem dúvidas sobre este local? Posso analisar fotos para você.' }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  useEffect(() => {
    if (beachData && beachData.riskLevel === RiskLevel.HIGH) {
      setShowDangerModal(true);
    } else {
      setShowDangerModal(false);
    }
  }, [beachData]);

  const fetchLocationAndBeach = () => {
    setLoading(true);
    setError(null);
    setPermissionDenied(false);
    setIsEditModalOpen(false);
    setBeachData(null); 

    if (!navigator.geolocation) {
      setError("Geolocalização não suportada.");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const data = await identifyBeach(latitude, longitude);
          setBeachData(data);
          setLastUpdate(Date.now());
          setSearchQuery(data.name);
          setError(null);
        } catch (err) {
          setError("Não conseguimos identificar sua praia automaticamente.");
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        setPermissionDenied(true);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    fetchLocationAndBeach();
  }, []);

  const handleManualSearch = async () => {
    if (!searchQuery.trim() || isSearching) return;
    setIsSearching(true);
    setLoading(true);
    setBeachData(null); 

    try {
        const data = await searchBeach(searchQuery);
        setBeachData(data);
        setLastUpdate(Date.now());
        setSearchQuery(data.name);
        setError(null);
        setIsEditModalOpen(false);
    } catch (err) {
        alert("Praia não encontrada. Tente incluir a cidade na busca.");
    } finally {
        setIsSearching(false);
        setLoading(false);
    }
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSelectedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() && !selectedImage) return;
    const currentImage = selectedImage;
    const currentText = chatInput;
    const newUserMsg = { id: Date.now().toString(), role: 'user' as const, text: currentText || "Analise este local.", image: currentImage || undefined };
    setChatMessages(prev => [...prev, newUserMsg]);
    setChatInput("");
    setSelectedImage(null);
    setChatLoading(true);
    try {
        const history = chatMessages.concat(newUserMsg).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
        const advice = await getSafetyAdvice(history, beachData || undefined, currentImage || undefined);
        setChatMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'model', text: advice.text, sources: advice.sources }]);
    } catch (e) {
        setChatMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'model', text: "Erro ao processar." }]);
    } finally {
        setChatLoading(false);
    }
  };

  const openMaps = () => {
    if (beachData?.coordinates) {
        window.open(`https://www.google.com/maps/search/?api=1&query=${beachData.coordinates.lat},${beachData.coordinates.lng}`, '_blank');
    } else if (beachData?.name) {
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(beachData.name + " " + beachData.city)}`, '_blank');
    }
  };

  if (loading) return <LoadingScreen />;

  if (permissionDenied || error || !beachData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-8 text-center bg-sky-50">
        <AlertTriangle size={64} className="text-orange-500 mb-6" />
        <h2 className="text-2xl font-bold mb-2 text-slate-800">Onde você está?</h2>
        <p className="text-slate-600 mb-8 text-sm leading-relaxed">{error || "Precisamos da sua localização para informar os riscos."}</p>
        <div className="w-full max-w-xs space-y-4">
          <button onClick={fetchLocationAndBeach} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-xl flex items-center justify-center gap-3">
            <LocateFixed size={20} /> Ativar GPS
          </button>
          <div className="relative">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Ou digite o nome..." className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl pr-12 text-sm shadow-sm" onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}/>
            <button onClick={handleManualSearch} className="absolute right-3 top-3 p-1.5 bg-blue-50 text-blue-600 rounded-xl">
              {isSearching ? <RefreshCw className="animate-spin" size={20}/> : <Search size={20} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderHome = () => (
    <div key={`${beachData.name}-${lastUpdate}`} className="space-y-6 animate-fade-in pb-24">
      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-5"><Waves size={100} /></div>
        <div className="flex justify-between items-start mb-2 relative z-10">
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Identificação</p>
              <button onClick={() => setIsEditModalOpen(true)} className="bg-slate-50 p-1.5 rounded-full text-slate-400 hover:text-blue-600"><Edit2 size={14} /></button>
            </div>
        </div>
        <h1 className="text-3xl font-black text-slate-900 leading-tight mb-1">{beachData.name}</h1>
        <p className="text-sm font-medium text-slate-500 mb-6 flex items-center gap-1"><MapPin size={14}/> {beachData.city}, {beachData.state}</p>
        <div className="flex items-center justify-between mt-4">
             <RiskBadge level={beachData.riskLevel} large />
             {beachData.distanceToCenter && <span className="text-xs font-bold text-slate-400 flex items-center gap-1"><NavIcon size={12}/> {beachData.distanceToCenter}</span>}
        </div>
      </div>

      <div className={`rounded-2xl p-5 border-l-4 shadow-sm flex items-start gap-4 ${beachData.riskLevel === RiskLevel.HIGH ? 'bg-red-50 border-red-500' : beachData.riskLevel === RiskLevel.MEDIUM ? 'bg-yellow-50 border-yellow-500' : 'bg-blue-50 border-blue-500'}`}>
          <div className={`p-2 rounded-full shrink-0 ${beachData.riskLevel === RiskLevel.HIGH ? 'bg-red-100 text-red-600' : beachData.riskLevel === RiskLevel.MEDIUM ? 'bg-yellow-100 text-yellow-600' : 'bg-blue-100 text-blue-600'}`}><ShieldAlert size={24} /></div>
          <div>
              <h3 className={`font-bold text-sm mb-1 ${beachData.riskLevel === RiskLevel.HIGH ? 'text-red-900' : beachData.riskLevel === RiskLevel.MEDIUM ? 'text-yellow-900' : 'text-blue-900'}`}>Atenção ao Local</h3>
              <p className="text-sm text-slate-700 leading-relaxed font-medium">{beachData.mainWarning}</p>
          </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[8rem] h-full">
              <div className="bg-blue-50 w-9 h-9 rounded-full flex items-center justify-center text-blue-600 mb-2"><Waves size={18} /></div>
              <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Mar</p>
                  <p className="text-xs font-bold text-slate-800 leading-tight">{beachData.seaCharacteristics}</p>
              </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[8rem] h-full">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-2 ${beachData.lifeguardPresence ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}><LifeBuoy size={18} /></div>
              <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Salva-Vidas</p>
                  <p className="text-xs font-bold text-slate-800 leading-tight">{beachData.lifeguardPresence ? 'Monitorado' : 'Sem Posto Fixo'}</p>
              </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[8rem] h-full">
               <div className="bg-indigo-50 w-9 h-9 rounded-full flex items-center justify-center text-indigo-600 mb-2"><ArrowDown size={18} /></div>
              <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Profundidade</p>
                  <p className="text-xs font-bold text-slate-800 leading-tight">{beachData.depthDescription}</p>
              </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[8rem] h-full transition-all duration-500">
               <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-2 ${beachData.childFriendly ? 'bg-pink-50 text-pink-500' : 'bg-orange-50 text-orange-600'}`}><Baby size={18} /></div>
              <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Crianças</p>
                  <p className="text-xs font-bold text-slate-800 leading-tight">{beachData.childFriendly ? 'Indicado' : 'Não Recomendado'}</p>
                  <p className="text-[10px] text-slate-500 leading-tight mt-1 italic animate-pulse-once">{beachData.childFriendlyReason}</p>
              </div>
          </div>
      </div>

      <button onClick={openMaps} className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-center gap-2 text-slate-600 font-bold text-sm shadow-sm hover:bg-slate-50"><MapPin size={18} className="text-blue-500"/> Ver no Mapa</button>
    </div>
  );

  const renderAlerts = () => (
    <div className="space-y-6 animate-fade-in pb-24">
       <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-red-100 text-red-600 rounded-2xl"><AlertTriangle size={28} /></div>
                <div>
                    <h2 className="font-black text-xl text-slate-900">Perigos e Riscos</h2>
                    <p className="text-xs text-slate-500 font-medium">Fique atento aos sinais</p>
                </div>
            </div>
            <div className="space-y-3">
                {beachData.hazards.map((h, i) => (
                    <div key={i} className="flex items-start p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <AlertOctagon size={18} className="text-red-500 mt-0.5 mr-3 shrink-0" /> 
                        <span className="text-slate-700 text-sm font-semibold">{h}</span>
                    </div>
                ))}
            </div>
            <div className="mt-4 p-4 bg-stone-50 rounded-2xl border border-stone-200 flex items-start gap-3">
                 <div className="p-2 bg-stone-200 rounded-full text-stone-600 shrink-0"><Mountain size={20} /></div>
                 <div>
                    <h4 className="text-sm font-bold text-stone-800 mb-1">Pedras e Escorregamento</h4>
                    <p className="text-xs text-stone-600 font-medium leading-relaxed">{beachData.rockRisk || "Sem info específica."}</p>
                 </div>
            </div>
            <div className="mt-6 p-4 bg-orange-50 rounded-2xl border border-orange-100 text-orange-800 text-xs leading-relaxed font-medium flex gap-3">
                <LifeBuoy size={20} className="shrink-0" /> "Na dúvida, não entre. Respeite as bandeiras."
            </div>
       </div>
    </div>
  );

  const renderInfo = () => (
    <div className="space-y-6 animate-fade-in pb-24">
        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-6">
            <h2 className="font-black text-xl text-slate-900 flex items-center gap-2"><Info className="text-blue-500" /> Detalhes</h2>
            <div className="grid grid-cols-1 gap-4">
                <div className="flex gap-4 items-start">
                    <div className="bg-blue-50 p-3 rounded-2xl text-blue-600 shrink-0"><Waves size={24}/></div>
                    <div>
                        <h3 className="font-bold text-slate-900 text-sm">Mar</h3>
                        <p className="text-slate-600 text-sm leading-relaxed mt-1">{beachData.seaCharacteristics}</p>
                    </div>
                </div>
                <div className="flex gap-4 items-start">
                    <div className="bg-purple-50 p-3 rounded-2xl text-purple-600 shrink-0"><Clock size={24}/></div>
                    <div>
                        <h3 className="font-bold text-slate-900 text-sm">Melhor Horário</h3>
                        <p className="text-slate-600 text-sm leading-relaxed mt-1">{beachData.bestTime}</p>
                    </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 flex gap-4 items-start">
                    <div className="bg-slate-100 p-3 rounded-2xl text-slate-600 shrink-0"><History size={24}/></div>
                    <div>
                        <h3 className="font-bold text-slate-900 text-sm">Histórico</h3>
                        <p className="text-slate-600 text-sm leading-relaxed mt-1 bg-slate-50 p-3 rounded-xl">{beachData.accidentHistory}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );

  const renderAssistant = () => (
    <div className="flex flex-col h-[calc(100vh-180px)] bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden animate-fade-in">
        <div className="bg-slate-50 p-4 border-b border-slate-100 flex items-center gap-3">
             <div className="bg-blue-600 p-2 rounded-xl"><Camera size={20} className="text-white" /></div>
             <div><h3 className="font-bold text-slate-800 text-sm">IA Preventiva</h3><p className="text-[10px] text-slate-500 font-medium">Análise em tempo real</p></div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-slate-50/30">
            {chatMessages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.image && <div className="mb-2 max-w-[70%] rounded-2xl overflow-hidden border-4 border-white shadow-lg"><img src={msg.image} className="w-full h-auto" /></div>}
                <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-slate-100 text-slate-700 rounded-bl-none'}`}>{msg.text}</div>
            </div>
            ))}
            {chatLoading && <div className="flex justify-start"><div className="bg-white px-4 py-3 rounded-2xl shadow-sm"><div className="flex space-x-1"><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></div><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></div></div></div></div>}
            <div ref={chatEndRef} />
        </div>
        <div className="p-4 bg-white border-t border-slate-100">
            {selectedImage && <div className="mb-3 relative w-fit"><img src={selectedImage} className="h-16 w-16 object-cover rounded-xl" /><button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"><X size={12} /></button></div>}
            <div className="flex items-center gap-2">
              <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageSelect} />
              <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-slate-100 rounded-2xl text-slate-500"><Camera size={22} /></button>
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Tire sua dúvida..." className="flex-1 bg-slate-100 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              <button onClick={handleSendMessage} disabled={!chatInput && !selectedImage} className="bg-blue-600 text-white p-3 rounded-2xl shadow-lg disabled:opacity-50"><Send size={22} /></button>
            </div>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-safe">
      <header className="bg-white/90 backdrop-blur-xl sticky top-0 z-40 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center text-blue-700 font-black text-xl italic tracking-tighter">PRAIA SEGURA</div>
          <button onClick={fetchLocationAndBeach} className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:text-blue-600"><RefreshCw size={20} /></button>
      </header>

      {showDangerModal && (
          <div className="fixed inset-0 z-[100] bg-red-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border-t-8 border-red-500 animate-slide-up">
                  <div className="flex justify-between items-start mb-4"><div className="bg-red-100 p-3 rounded-full text-red-600"><AlertTriangle size={32} /></div><button onClick={() => setShowDangerModal(false)} className="text-slate-400"><X size={24}/></button></div>
                  <h2 className="text-2xl font-black text-slate-900 mb-2">Atenção Extrema!</h2>
                  <p className="text-slate-600 font-medium mb-4">Você está em uma área de <span className="text-red-600 font-bold">ALTO RISCO</span>.</p>
                  <div className="bg-red-50 p-4 rounded-2xl mb-6"><p className="text-red-800 text-sm font-bold">⚠️ {beachData?.mainWarning}</p></div>
                  <button onClick={() => { setShowDangerModal(false); setActiveTab('alerts'); }} className="w-full bg-red-600 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-red-200">Ver Perigos</button>
              </div>
          </div>
      )}

      <main className="p-6 max-w-md mx-auto">
        {activeTab === 'home' && renderHome()}
        {activeTab === 'alerts' && renderAlerts()}
        {activeTab === 'info' && renderInfo()}
        {activeTab === 'assistant' && renderAssistant()}
      </main>

      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-6 backdrop-blur-sm">
            <div className="bg-white rounded-[2rem] p-6 w-full max-w-sm shadow-2xl relative">
                <button onClick={() => setIsEditModalOpen(false)} className="absolute top-5 right-5 text-slate-400"><X size={20} /></button>
                <h3 className="font-bold text-xl mb-1">Mudar Praia</h3>
                <p className="text-xs text-slate-500 mb-6 font-medium">Digite o nome para análise.</p>
                <div className="space-y-3">
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Ex: Praia Grande - SP" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500" onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}/>
                    <button onClick={handleManualSearch} disabled={isSearching} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg flex justify-center items-center gap-2">{isSearching ? <RefreshCw className="animate-spin" size={20}/> : <Search size={20}/>} Buscar Local</button>
                    <button onClick={fetchLocationAndBeach} className="w-full bg-white border border-slate-200 text-slate-600 py-4 rounded-2xl font-bold mt-2 flex justify-center items-center gap-2"><LocateFixed size={20} /> Usar GPS</button>
                </div>
            </div>
        </div>
      )}
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default App;
