import React, { useState } from 'react';
import { X, Calendar, Video, Landmark, Check } from 'lucide-react';
import { PartnerDossier } from '../types';

interface PartnerScheduleModalProps {
  partner: PartnerDossier | null;
  onClose: () => void;
  onConfirmSchedule: (partnerName: string, modalType: string) => void;
}

export const PartnerScheduleModal: React.FC<PartnerScheduleModalProps> = ({
  partner,
  onClose,
  onConfirmSchedule,
}) => {
  const [meetingType, setMeetingType] = useState<'presencial' | 'video' | 'despacho'>('video');
  const [selectedSlot, setSelectedSlot] = useState<string>('Terça-feira, 14:30');

  if (!partner) return null;

  const slots = [
    'Terça-feira, 14:30',
    'Quarta-feira, 10:00',
    'Quarta-feira, 16:00',
    'Quinta-feira, 11:30',
  ];

  const handleConfirm = () => {
    const typeLabel =
      meetingType === 'presencial'
        ? 'Reunião Presencial (Sede)'
        : meetingType === 'video'
        ? 'Despacho Telepresencial Criptografado'
        : 'Sustentação / Audiência com Relator';
    onConfirmSchedule(partner.name, `${typeLabel} - Slot: ${selectedSlot}`);
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

        <div className="flex items-center gap-4 pb-5 mb-5 border-b border-[#431520]">
          <img
            src={partner.imageUrl}
            alt={partner.name}
            className="w-16 h-16 rounded-full object-cover border border-[#C5A880]/50"
          />
          <div>
            <span className="text-[10px] font-data-mono text-[#D4AF37] uppercase tracking-wider block">
              {partner.role}
            </span>
            <h3 className="font-display-hero text-xl font-bold text-[#FDF9F3]">
              {partner.name}
            </h3>
            <span className="text-xs text-[#A79388] font-data-mono">{partner.chamber}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-2">
              Modalidade de Audiência
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMeetingType('video')}
                className={`p-3 rounded border text-left text-xs transition-all cursor-pointer ${
                  meetingType === 'video'
                    ? 'border-[#D4AF37] bg-[#240A11] text-[#FDF9F3]'
                    : 'border-[#431520] bg-[#0B0305] text-[#A79388]'
                }`}
              >
                <Video className="w-4 h-4 text-[#D4AF37] mb-1.5" />
                <span className="font-medium block">Telepresencial</span>
                <span className="text-[9px] text-[#A79388]">Criptografia SSL</span>
              </button>

              <button
                type="button"
                onClick={() => setMeetingType('presencial')}
                className={`p-3 rounded border text-left text-xs transition-all cursor-pointer ${
                  meetingType === 'presencial'
                    ? 'border-[#D4AF37] bg-[#240A11] text-[#FDF9F3]'
                    : 'border-[#431520] bg-[#0B0305] text-[#A79388]'
                }`}
              >
                <Landmark className="w-4 h-4 text-[#D4AF37] mb-1.5" />
                <span className="font-medium block">Presencial</span>
                <span className="text-[9px] text-[#A79388]">SP ou Brasília</span>
              </button>

              <button
                type="button"
                onClick={() => setMeetingType('despacho')}
                className={`p-3 rounded border text-left text-xs transition-all cursor-pointer ${
                  meetingType === 'despacho'
                    ? 'border-[#D4AF37] bg-[#240A11] text-[#FDF9F3]'
                    : 'border-[#431520] bg-[#0B0305] text-[#A79388]'
                }`}
              >
                <Calendar className="w-4 h-4 text-[#D4AF37] mb-1.5" />
                <span className="font-medium block">Despacho</span>
                <span className="text-[9px] text-[#A79388]">Cortes Superiores</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-2">
              Horários de Despacho Disponíveis
            </label>
            <div className="grid grid-cols-2 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className={`p-2.5 rounded border text-xs font-data-mono flex items-center justify-between cursor-pointer ${
                    selectedSlot === slot
                      ? 'border-[#D4AF37] bg-[#2E0F17] text-[#D4AF37] font-semibold'
                      : 'border-[#431520] bg-[#0B0305] text-[#E8D8CE] hover:border-[#C5A880]/40'
                  }`}
                >
                  <span>{slot}</span>
                  {selectedSlot === slot && <Check className="w-3.5 h-3.5 text-[#D4AF37]" />}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-[#A79388] leading-relaxed pt-2">
            A confirmação da agenda exige declaração de não-conflito e registro no protocolo institucional.
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded border border-[#431520] text-xs font-data-mono text-[#A79388] hover:text-[#FDF9F3] cursor-pointer"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 rounded bg-gradient-to-r from-[#D4AF37] to-[#C5A880] text-[#0B0305] text-xs font-data-mono font-bold uppercase tracking-wider hover:brightness-110 cursor-pointer"
          >
            Preencher Protocolo de Audiência
          </button>
        </div>
      </div>
    </div>
  );
};
