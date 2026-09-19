import React, { useState } from 'react';
import { Lock, ShieldCheck, Clock, Send, CheckCircle2 } from 'lucide-react';
import { FirmConfig, IntakeProtocol } from '../types';

interface ConfidentialIntakeProps {
  firmConfig: FirmConfig;
  prefilledCourt?: string;
  prefilledSummary?: string;
  onNewIntake: (intake: IntakeProtocol) => void;
}

export const ConfidentialIntake: React.FC<ConfidentialIntakeProps> = ({
  firmConfig,
  prefilledCourt = '',
  prefilledSummary = '',
  onNewIntake,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    company: '',
    email: '',
    court: prefilledCourt || 'Superior Tribunal de Justiça (STJ)',
    estimatedValue: 'Acima de R$ 50 Milhões',
    summary: prefilledSummary || '',
    agreeTerms: false,
  });

  const [submittedProtocol, setSubmittedProtocol] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const generatedCode = `VL-2025-${Math.floor(1000 + Math.random() * 9000)}`;

    const newProtocol: IntakeProtocol = {
      id: `intake-${Date.now()}`,
      protocolCode: generatedCode,
      clientName: formData.name,
      corporateRole: formData.role,
      groupName: formData.company,
      email: formData.email,
      court: formData.court,
      estimatedValue: formData.estimatedValue,
      briefSummary: formData.summary || 'Síntese confidencial encaminhada via portal.',
      submittedAt: 'Agora mesmo',
      status: 'Pendente',
    };

    setTimeout(() => {
      onNewIntake(newProtocol);
      setSubmittedProtocol(generatedCode);
      setIsSubmitting(false);
    }, 600);
  };

  return (
    <section id="audiencia" className="w-full py-24 bg-[#180A0E] relative">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Security Explanatory Panel */}
          <div className="lg:col-span-5 flex flex-col justify-between">
            <div>
              <span className="font-data-mono text-xs uppercase tracking-[0.2em] text-[#D4AF37] flex items-center gap-2 mb-3">
                <span className="w-6 h-px bg-[#D4AF37]"></span> Protocolo Restrito
              </span>
              <h2 className="font-display-hero text-3xl md:text-5xl font-bold text-[#FDF9F3] mb-6">
                Solicitar Audiência Privada
              </h2>
              <p className="text-[#E8D8CE] text-sm leading-relaxed mb-8 font-light text-justify">
                Para litígios societários, arbitragens iminentes ou demandas que exijam intervenção imediata perante ministros ou relatores. Todas as submissões são submetidas à rigorosa checagem de conflitos de interesse prévia.
              </p>

              {/* Secrecy Guarantee Card */}
              <div className="bg-[#13060A] p-6 rounded-xl border border-[#431520] flex flex-col gap-4 mb-8">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-[#D4AF37] mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold text-[#FDF9F3] uppercase tracking-wide">
                      Acordo de Não-Divulgação Automático
                    </h4>
                    <p className="text-[11px] text-[#A79388] mt-0.5">
                      Sob a proteção de sigilo estrito da Lei Federal 8.906/94 (Estatuto da OAB).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-[#D4AF37] mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold text-[#FDF9F3] uppercase tracking-wide">
                      Conformidade LGPD Soberana
                    </h4>
                    <p className="text-[11px] text-[#A79388] mt-0.5">
                      Servidores com custódia local de chaves assimétricas e exclusão programada de vestígios.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-[#D4AF37] mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold text-[#FDF9F3] uppercase tracking-wide">
                      Triagem em até 4 Horas Úteis
                    </h4>
                    <p className="text-[11px] text-[#A79388] mt-0.5">
                      Retorno prioritário diretamente por um dos sócios diretores.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Direct Contact Footer */}
            <div className="font-data-mono text-xs text-[#A79388] space-y-1">
              <div>
                Sede São Paulo: <span className="text-[#FDF9F3] font-medium">{firmConfig.sedes.sp.phone}</span>
              </div>
              <div>
                Gabinete Brasília: <span className="text-[#FDF9F3] font-medium">{firmConfig.sedes.df.phone}</span>
              </div>
              <div>
                Linha Direta de Sócios: <span className="text-[#C5A880]">{firmConfig.contactEmail}</span>
              </div>
            </div>
          </div>

          {/* Form Column: Monolithic Dark Aesthetic */}
          <div className="lg:col-span-7 bg-[#13060A] p-8 md:p-10 rounded-2xl border border-[#431520] shadow-2xl relative">
            <div className="flex items-center justify-between pb-6 mb-6 border-b border-[#431520]">
              <div>
                <h3 className="font-display-hero text-xl md:text-2xl font-bold text-[#FDF9F3]">
                  Formulário de Abertura & Consulta
                </h3>
                <span className="text-xs text-[#A79388] font-data-mono">
                  CONFIDENTIAL CLIENT INTAKE PROTOCOL
                </span>
              </div>
              <span className="text-xs font-data-mono text-[#D4AF37] bg-[#D4AF37]/10 px-2.5 py-1 rounded border border-[#D4AF37]/20">
                SSL 4096-BIT
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-data-mono uppercase tracking-wider text-[#A79388] mb-1.5">
                    Nome do Solicitante *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex.: Dr. Rodrigo Silveira"
                    className="w-full bg-[#0B0305] border border-[#431520] rounded px-4 py-3 text-sm text-[#FDF9F3] placeholder:text-[#A79388]/40 focus:border-[#C5A880] focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-data-mono uppercase tracking-wider text-[#A79388] mb-1.5">
                    Cargo Corporativo *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder="Ex.: Diretor Jurídico / Conselheiro"
                    className="w-full bg-[#0B0305] border border-[#431520] rounded px-4 py-3 text-sm text-[#FDF9F3] placeholder:text-[#A79388]/40 focus:border-[#C5A880] focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-data-mono uppercase tracking-wider text-[#A79388] mb-1.5">
                    Razão Social do Grupo / Empresa *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    placeholder="Ex.: Concessionária Alvorada S.A."
                    className="w-full bg-[#0B0305] border border-[#431520] rounded px-4 py-3 text-sm text-[#FDF9F3] placeholder:text-[#A79388]/40 focus:border-[#C5A880] focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-data-mono uppercase tracking-wider text-[#A79388] mb-1.5">
                    E-mail Corporativo Restrito *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="rodrigo@alvorada.com.br"
                    className="w-full bg-[#0B0305] border border-[#431520] rounded px-4 py-3 text-sm text-[#FDF9F3] placeholder:text-[#A79388]/40 focus:border-[#C5A880] focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-data-mono uppercase tracking-wider text-[#A79388] mb-1.5">
                    Foro ou Tribunal Relevante
                  </label>
                  <select
                    value={formData.court}
                    onChange={(e) => setFormData({ ...formData, court: e.target.value })}
                    className="w-full bg-[#0B0305] border border-[#431520] rounded px-4 py-3 text-sm text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none transition-colors cursor-pointer"
                  >
                    <option value="Superior Tribunal de Justiça (STJ)">Superior Tribunal de Justiça (STJ)</option>
                    <option value="Supremo Tribunal Federal (STF)">Supremo Tribunal Federal (STF)</option>
                    <option value="Tribunal de Justiça de São Paulo (TJSP)">Tribunal de Justiça de São Paulo (TJSP)</option>
                    <option value="Câmara de Arbitragem ICC Paris">Câmara de Arbitragem ICC Paris</option>
                    <option value="CAM-CCBC Arbitragem">CAM-CCBC Arbitragem</option>
                    <option value="CARF - Conselho de Recursos Fiscais">CARF - Conselho de Recursos Fiscais</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-data-mono uppercase tracking-wider text-[#A79388] mb-1.5">
                    Ordem de Repercussão Estimada
                  </label>
                  <select
                    value={formData.estimatedValue}
                    onChange={(e) => setFormData({ ...formData, estimatedValue: e.target.value })}
                    className="w-full bg-[#0B0305] border border-[#431520] rounded px-4 py-3 text-sm text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none transition-colors cursor-pointer"
                  >
                    <option value="Acima de R$ 50 Milhões">Acima de R$ 50 Milhões</option>
                    <option value="Entre R$ 10 Mi e R$ 50 Milhões">Entre R$ 10 Mi e R$ 50 Milhões</option>
                    <option value="Entre R$ 2 Mi e R$ 10 Milhões">Entre R$ 2 Mi e R$ 10 Milhões</option>
                    <option value="Demanda Institucional sem Valor Econômico Imediato">Demanda Institucional sem Valor Econômico Imediato</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-data-mono uppercase tracking-wider text-[#A79388] mb-1.5">
                  Síntese Prévia da Demanda (Confidencial)
                </label>
                <textarea
                  rows={3}
                  value={formData.summary}
                  onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                  placeholder="Indique brevemente o objeto do recurso, prazos peremptórios iminentes ou eventuais partes contrárias para varredura de impedimentos..."
                  className="w-full bg-[#0B0305] border border-[#431520] rounded px-4 py-3 text-sm text-[#FDF9F3] placeholder:text-[#A79388]/40 focus:border-[#C5A880] focus:outline-none transition-colors resize-none"
                />
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="term-check"
                  required
                  checked={formData.agreeTerms}
                  onChange={(e) => setFormData({ ...formData, agreeTerms: e.target.checked })}
                  className="mt-1 w-4 h-4 rounded bg-[#0B0305] border-[#431520] text-[#D4AF37] focus:ring-0 cursor-pointer"
                />
                <label htmlFor="term-check" className="text-xs text-[#A79388] font-light cursor-pointer select-none">
                  Declaro ter plenos poderes para requerer a consulta institucional e concordo com os termos de sigilo e não-conflito.
                </label>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-[11px] font-data-mono text-[#A79388]">
                  AUDITADO OAB/SP & LGPD
                </span>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-8 py-3.5 rounded bg-gradient-to-r from-[#D4AF37] to-[#C5A880] text-[#0B0305] font-bold text-xs uppercase tracking-widest hover:brightness-110 shadow-[0_0_20px_rgba(212,175,55,0.3)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span>{isSubmitting ? 'Transmitindo...' : 'Transmitir Protocolo Seguro'}</span>
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>

            {submittedProtocol && (
              <div className="mt-6 p-4 rounded bg-[#240A11] border border-[#D4AF37] text-[#FDF9F3] text-xs font-data-mono animate-fadeIn">
                <div className="flex items-center gap-2 text-[#D4AF37] font-bold mb-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>PROTOCOLO CRIPTOGRÁFICO #{submittedProtocol} GERADO COM SUCESSO.</span>
                </div>
                Os dados foram alocados em cofre de dados protegido. O gabinete de sócios entrará em contato via canal seguro em até 4 horas úteis.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
