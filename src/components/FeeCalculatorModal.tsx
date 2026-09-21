import React, { useState } from 'react';
import { Calculator, X, ArrowRight, ShieldAlert } from 'lucide-react';
import { Tooltip, HelpTooltip } from './Tooltip';

interface FeeCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyToBooking: (court: string, summary: string) => void;
}

export const FeeCalculatorModal: React.FC<FeeCalculatorModalProps> = ({
  isOpen,
  onClose,
  onApplyToBooking,
}) => {
  const [instancia, setInstancia] = useState<'stf' | 'arbitragem' | 'tributario'>('stf');
  const [valor, setValor] = useState<'alto' | 'medio' | 'base'>('alto');
  const [urgency, setUrgency] = useState(false);

  if (!isOpen) return null;

  const getResult = () => {
    if (instancia === 'arbitragem') {
      return {
        title: 'Estrutura Horária Internacional + Quota-Litis (Arbitral)',
        prolabore: 'Honorários de abertura e custas da Câmara (ICC/CAM-CCBC)',
        exito: '4% a 8% sobre a adjudicação final ou indenização deferida',
        dedicacao: 'Comitê bilíngue com 2 sócios seniores e árbitro assistente',
        courtName: 'Câmara de Arbitragem ICC Paris',
      };
    } else if (instancia === 'stf') {
      return {
        title: valor === 'alto'
          ? 'Retainer Estratégico + Honorários de Êxito no Julgamento Final'
          : 'Memoriais e Sustentação Dedicada por Sócio Titular',
        prolabore: valor === 'alto' ? 'Pró-labore estruturado por etapas processuais' : 'Pró-labore fixo para admissibilidade e memoriais',
        exito: valor === 'alto' ? '6% a 12% escalonado após trânsito em julgado' : '10% a 15% sobre o proveito econômico obtido',
        dedicacao: 'Despacho individual com ministros relatores e sustentação oral',
        courtName: 'Superior Tribunal de Justiça (STJ)',
      };
    } else {
      return {
        title: 'Pró-labore Fixo + Êxito em Transação Fiscal CARF',
        prolabore: 'Auditoria de créditos e protocolo de impugnação fiscal',
        exito: '5% a 10% sobre a desoneração de contingências fiscais',
        dedicacao: 'Defesa perante Câmaras Ordinárias e Câmara Superior do CARF',
        courtName: 'CARF - Conselho de Recursos Fiscais',
      };
    }
  };

  const result = getResult();

  const handleApply = () => {
    const summary = `Estimativa de honorários gerada: ${result.title}. Faixa: ${
      valor === 'alto' ? 'Acima de R$ 50 Mi' : valor === 'medio' ? 'R$ 10 Mi a R$ 50 Mi' : 'Até R$ 10 Mi'
    }. ${urgency ? 'Urgência peremptória assinalada.' : ''}`;
    onApplyToBooking(result.courtName, summary);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#13060A] border border-[#D4AF37]/50 rounded-2xl max-w-lg w-full p-8 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[#A79388] hover:text-[#FDF9F3] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-[#D4AF37] font-data-mono text-xs mb-2">
          <Calculator className="w-4 h-4" />
          <span>ESTIMADOR DE COMPLEXIDADE & TABELA OAB</span>
          <HelpTooltip
            title="Sobre a Tabela e Parâmetros OAB"
            badge="PARÂMETROS REGULAMENTARES"
            content="Nossas propostas observam os limites éticos do Provimento 94/2000 da OAB, combinando pró-labores iniciais com cláusulas de quota-litis condicionadas ao êxito."
          />
        </div>

        <h3 className="font-display-hero text-2xl font-bold text-[#FDF9F3] mb-2">
          Simulador Pré-Contratual
        </h3>

        <p className="text-xs text-[#A79388] mb-6 leading-relaxed">
          Selecione os parâmetros da demanda para visualizar a metodologia de precificação de pró-labore e taxa de êxito (quota-litis).
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-1">
              Instância do Feito
            </label>
            <select
              value={instancia}
              onChange={(e) => setInstancia(e.target.value as 'stf' | 'arbitragem' | 'tributario')}
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none cursor-pointer"
            >
              <option value="stf">Superior Tribunal de Justiça / STF (Recurso Especial / Extraordinário)</option>
              <option value="arbitragem">Arbitragem Internacional (ICC Paris ou CAM-CCBC)</option>
              <option value="tributario">Contencioso Tributário de Grande Porte (CARF / Tribunais)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-1">
              Faixa de Proveito Econômico Pretendido
            </label>
            <select
              value={valor}
              onChange={(e) => setValor(e.target.value as 'alto' | 'medio' | 'base')}
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none cursor-pointer"
            >
              <option value="alto">Acima de R$ 50 Milhões</option>
              <option value="medio">De R$ 10 a R$ 50 Milhões</option>
              <option value="base">Até R$ 10 Milhões</option>
            </select>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="calc-urgency"
              checked={urgency}
              onChange={(e) => setUrgency(e.target.checked)}
              className="w-4 h-4 rounded bg-[#0B0305] border-[#431520] text-[#D4AF37] focus:ring-0 cursor-pointer"
            />
            <label htmlFor="calc-urgency" className="text-xs text-[#E8D8CE] cursor-pointer flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-[#D4AF37]" />
              Prazo peremptório urgente (menos de 72h para interposição)
            </label>
          </div>

          <div className="bg-[#0B0305] p-4 rounded border border-[#431520] mt-4 space-y-2">
            <div className="text-[10px] font-data-mono text-[#8F785A] uppercase">
              Estrutura Sugerida de Atendimento:
            </div>
            <div className="font-display-hero text-base text-[#D4AF37] font-bold">
              {result.title}
            </div>
            <div className="text-[11px] text-[#E8D8CE] space-y-1 pt-1 border-t border-[#431520]">
              <div>- {result.prolabore}</div>
              <div>- Êxito: {result.exito}</div>
              <div>- Regime: {result.dedicacao}</div>
              {urgency && (
                <div className="text-[#D4AF37] font-medium">- Mobilização imediata do comitê de crise nas primeiras 24 horas</div>
              )}
            </div>
            <p className="text-[10px] text-[#A79388] pt-1">
              Reunião reservada de due diligence obrigatória antes da formalização do mandato.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded border border-[#431520] text-xs font-data-mono text-[#A79388] hover:text-[#FDF9F3] cursor-pointer"
          >
            Fechar
          </button>
          <Tooltip
            title="Migrar para Agendamento"
            position="top"
            badge="AUTOMATIZAÇÃO DE INTAKE"
            content="Preenche automaticamente os dados da estimativa no formulário de solicitação de audiência privada."
          >
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2 rounded bg-[#D4AF37] text-[#0B0305] text-xs font-data-mono font-bold uppercase tracking-wider hover:brightness-110 flex items-center gap-2 cursor-pointer"
            >
              <span>Agendar com Esta Proposta</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
