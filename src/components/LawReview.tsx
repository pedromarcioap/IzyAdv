import React, { useState } from 'react';
import { ArrowUpRight, BookOpen, Mail, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import { LawReviewArticle } from '../types';
import { dbInsertSubscriber } from '../lib/supabase';

interface LawReviewProps {
  articles: LawReviewArticle[];
  onSelectArticle: (article: LawReviewArticle) => void;
}

export const LawReview: React.FC<LawReviewProps> = ({
  articles,
  onSelectArticle,
}) => {
  const [activeFilter, setActiveFilter] = useState<'todas' | 'tributario' | 'stf' | 'arbitragem'>('todas');
  const [emailInput, setEmailInput] = useState('');
  const [interestArea, setInterestArea] = useState('Todas as Matérias');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredArticles = articles.filter((article) => {
    if (activeFilter === 'todas') return true;
    return article.category === activeFilter;
  });

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    setIsSubmitting(true);
    await dbInsertSubscriber(emailInput, interestArea);
    setIsSubscribed(true);
    setIsSubmitting(false);
    setEmailInput('');
  };

  return (
    <section
      id="jurisprudencia"
      className="w-full py-24 bg-[#0B0305] border-b border-[#431520]"
    >
      <div className="max-w-[1440px] mx-auto px-4 md:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <span className="font-data-mono text-xs uppercase tracking-[0.2em] text-[#D4AF37] flex items-center gap-2">
              <span className="w-6 h-px bg-[#D4AF37]"></span> Doutrina Publicada • Law Review
            </span>
            <h2 className="font-display-hero text-3xl md:text-5xl font-bold text-[#FDF9F3] mt-2">
              Teses & Análise Dogmática
            </h2>
          </div>

          {/* Tab Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2 bg-[#180A0E] p-1 rounded-lg border border-[#431520]">
            <button
              type="button"
              onClick={() => setActiveFilter('todas')}
              className={`px-3.5 py-1.5 rounded text-xs font-data-mono uppercase tracking-wider transition-all cursor-pointer ${
                activeFilter === 'todas'
                  ? 'bg-[#D4AF37] text-[#0B0305] font-bold shadow-sm'
                  : 'text-[#A79388] hover:text-[#FDF9F3]'
              }`}
            >
              Todas as Teses
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('tributario')}
              className={`px-3.5 py-1.5 rounded text-xs font-data-mono uppercase tracking-wider transition-all cursor-pointer ${
                activeFilter === 'tributario'
                  ? 'bg-[#D4AF37] text-[#0B0305] font-bold shadow-sm'
                  : 'text-[#A79388] hover:text-[#FDF9F3]'
              }`}
            >
              Tributário
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('stf')}
              className={`px-3.5 py-1.5 rounded text-xs font-data-mono uppercase tracking-wider transition-all cursor-pointer ${
                activeFilter === 'stf'
                  ? 'bg-[#D4AF37] text-[#0B0305] font-bold shadow-sm'
                  : 'text-[#A79388] hover:text-[#FDF9F3]'
              }`}
            >
              STF / STJ
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('arbitragem')}
              className={`px-3.5 py-1.5 rounded text-xs font-data-mono uppercase tracking-wider transition-all cursor-pointer ${
                activeFilter === 'arbitragem'
                  ? 'bg-[#D4AF37] text-[#0B0305] font-bold shadow-sm'
                  : 'text-[#A79388] hover:text-[#FDF9F3]'
              }`}
            >
              Arbitragem
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {filteredArticles.map((article) => (
            <article
              key={article.id}
              onClick={() => onSelectArticle(article)}
              className="bg-[#13060A] p-8 rounded-xl border border-[#431520] hover:border-[#C5A880] transition-all flex flex-col justify-between group cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between text-[11px] font-data-mono text-[#8F785A] mb-4">
                  <span className="bg-[#D4AF37]/10 text-[#D4AF37] px-2 py-0.5 rounded border border-[#D4AF37]/20">
                    {article.categoryLabel}
                  </span>
                  <span>{article.readTime}</span>
                </div>

                <h3 className="font-display-hero text-xl font-bold text-[#FDF9F3] group-hover:text-[#C5A880] transition-colors mb-3 leading-snug">
                  {article.title}
                </h3>

                <p className="text-xs text-[#E8D8CE] leading-relaxed font-light mb-6">
                  {article.abstract}
                </p>
              </div>

              <div className="pt-4 border-t border-[#431520] flex items-center justify-between text-xs font-data-mono text-[#A79388]">
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-[#C5A880]" />
                  {article.author}
                </span>
                <ArrowUpRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </article>
          ))}
        </div>

        {/* Newsletter Subscription Capture Footer */}
        <div className="mt-16 bg-gradient-to-b from-[#180A0E] to-[#13060A] p-8 md:p-12 rounded-2xl border border-[#431520] relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.08)_0%,transparent_70%)] pointer-events-none"></div>

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Editorial Context */}
            <div className="lg:col-span-6 space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[#240A11] border border-[#C5A880]/30 text-[11px] font-data-mono text-[#D4AF37] uppercase tracking-wider">
                <Mail className="w-3.5 h-3.5" />
                <span>INFORMATIVO JURÍDICO RESERVADO • CIRCULAR QUINZENAL</span>
              </div>

              <h3 className="font-display-hero text-2xl md:text-3xl font-bold text-[#FDF9F3] leading-tight">
                Receba Atualizações Doutrinárias & Precedentes em Primeira Mão
              </h3>

              <p className="text-xs md:text-sm text-[#E8D8CE] font-light leading-relaxed text-justify">
                Envio selecionado de teses dogmáticas, despachos de repercussão geral, súmulas vinculantes do STF/STJ e laudos comentados de arbitragem internacional diretamente no seu endereço corporativo.
              </p>

              <div className="flex items-center gap-4 text-[11px] font-data-mono text-[#A79388] pt-1">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#C5A880]" />
                  Sigilo Institucional OAB
                </span>
                <span>•</span>
                <span>Sem conteúdo comercial</span>
                <span>•</span>
                <span>Cancelamento a qualquer momento</span>
              </div>
            </div>

            {/* Form Column */}
            <div className="lg:col-span-6">
              {isSubscribed ? (
                <div className="p-6 rounded-xl bg-[#240A11] border border-[#D4AF37]/60 space-y-2 animate-fadeIn">
                  <div className="flex items-center gap-2 text-[#D4AF37] font-bold text-xs font-data-mono">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>ASSINATURA DO INFORMATIVO CONFIRMADA</span>
                  </div>
                  <p className="text-xs text-[#E8D8CE] font-light leading-relaxed">
                    Seu e-mail foi incluído no boletim doutrinário. As próximas circulares com teses e precedentes serão remetidas quinzenalmente sob protocolo de sigilo.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsSubscribed(false)}
                    className="mt-2 text-[11px] font-data-mono text-[#C5A880] hover:text-[#D4AF37] underline cursor-pointer"
                  >
                    Cadastrar outro endereço corporativo
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="space-y-3 bg-[#0B0305]/70 p-6 rounded-xl border border-[#431520]">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-7">
                      <label className="block text-[11px] font-data-mono uppercase text-[#A79388] mb-1">
                        E-mail Corporativo *
                      </label>
                      <input
                        type="email"
                        required
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="jurisprudencia@empresa.com.br"
                        className="w-full bg-[#13060A] border border-[#431520] rounded px-3.5 py-2.5 text-xs text-[#FDF9F3] placeholder:text-[#A79388]/40 focus:border-[#C5A880] focus:outline-none transition-colors font-data-mono"
                      />
                    </div>

                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-data-mono uppercase text-[#A79388] mb-1">
                        Área de Preferência
                      </label>
                      <select
                        value={interestArea}
                        onChange={(e) => setInterestArea(e.target.value)}
                        className="w-full bg-[#13060A] border border-[#431520] rounded px-3 py-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none transition-colors font-data-mono cursor-pointer"
                      >
                        <option value="Todas as Matérias">Todas as Matérias</option>
                        <option value="Tributário & CARF">Tributário & CARF</option>
                        <option value="STF / STJ">STF / STJ</option>
                        <option value="Arbitragem Internacional">Arbitragem Internacional</option>
                        <option value="Societário & M&A">Societário & M&A</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                    <span className="text-[10px] font-data-mono text-[#A79388]">
                      Em conformidade com a LGPD e o Código de Ética da OAB.
                    </span>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full sm:w-auto px-6 py-2.5 rounded bg-gradient-to-r from-[#D4AF37] to-[#C5A880] text-[#0B0305] font-bold text-xs font-data-mono uppercase tracking-wider hover:brightness-110 shadow-[0_0_15px_rgba(212,175,55,0.25)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <span>{isSubmitting ? 'Processando...' : 'Assinar Informativo'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

