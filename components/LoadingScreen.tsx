import React from 'react';
import { MapPin } from 'lucide-react';

const LoadingScreen: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-sky-50 p-6 text-center">
      <div className="relative">
        <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-25"></div>
        <div className="bg-white p-4 rounded-full shadow-xl relative z-10">
          <MapPin size={48} className="text-blue-600" />
        </div>
      </div>
      <h2 className="mt-8 text-xl font-bold text-slate-800">Localizando você...</h2>
      <p className="text-slate-500 mt-2 text-sm max-w-xs">
        Estamos identificando a praia mais próxima e analisando os riscos de segurança.
      </p>
    </div>
  );
};

export default LoadingScreen;