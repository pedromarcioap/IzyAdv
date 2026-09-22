import React from 'react';
import { FileCheck2, Trash2 } from 'lucide-react';
import { IntakeProtocol } from '../../../types';

const getIntakeStatusBadgeClass = (status: string) => {
  if (status === 'Audiencia Confirmada') return 'bg-emerald-950 text-emerald-300 border border-emerald-800';
  if (status === 'Conflito Verificado') return 'bg-amber-950 text-amber-300 border border-amber-800';
  return 'bg-[#2E0F17] text-[#E8D8CE] border border-[#431520]';
};

interface IntakesTabProps {
  intakes: IntakeProtocol[];
  handleStatusChange: (id: string, newStatus: 'Pendente' | 'Conflito Verificado' | 'Audiencia Confirmada') => void;
  handleDeleteIntake: (id: string) => void;
}

export const IntakesTab: React.FC<IntakesTabProps> = ({
  intakes,
  handleStatusChange,
  handleDeleteIntake,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-[#180A0E] p-4 rounded-xl border border-[#431520] flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileCheck2 className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider font-bold">
              Triagem Sigilosa & Auditoria de Conflitos ({intakes.length})
            </span>
          </div>
          <p className="text-xs text-[#A79388]">
            Protocolação confidencial de consultas jurídicas recebidas pelo portal.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {intakes.length === 0 ? (
          <div className="p-8 text-center bg-[#180A0E] rounded-xl border border-[#431520] text-[#A79388] text-xs font-data-mono">
            Nenhum protocolo confidencial registrado no momento.
          </div>
        ) : (
          intakes.map((intake) => (
            <div
              key={intake.id}
              className="p-4 rounded-xl bg-[#180A0E] border border-[#431520] space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-[#FDF9F3]">{intake.clientName}</span>
                    <span className="text-[10px] font-data-mono text-[#D4AF37] bg-[#240A11] px-1.5 py-0.5 rounded border border-[#431520]">
                      {intake.protocolCode}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#A79388] font-data-mono">{intake.email}</div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    aria-label={`Status do protocolo ${intake.protocolCode}`}
                    value={intake.status}
                    onChange={(e) =>
                      handleStatusChange(
                        intake.id,
                        e.target.value as 'Pendente' | 'Conflito Verificado' | 'Audiencia Confirmada'
                      )
                    }
                    className={`text-[10px] font-bold font-data-mono rounded px-2 py-1 bg-[#0B0305] border cursor-pointer ${getIntakeStatusBadgeClass(
                      intake.status
                    )}`}
                  >
                    <option value="Pendente">Pendente</option>
                    <option value="Conflito Verificado">Conflito Verificado</option>
                    <option value="Audiencia Confirmada">Audiência Confirmada</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => handleDeleteIntake(intake.id)}
                    className="p-1.5 text-rose-400 hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                    title="Excluir Protocolo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="text-xs text-[#E8D8CE] bg-[#0B0305] p-3 rounded border border-[#431520] leading-relaxed">
                {intake.briefSummary}
              </div>

              <div className="flex items-center justify-between text-[10px] font-data-mono text-[#A79388] pt-1">
                <span>Tribunal/Foro: {intake.court || 'NÃO ESPECIFICADO'}</span>
                <span>Data: {intake.submittedAt}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
