import React from 'react';
import { X, BookOpen, Scale, ArrowRight } from 'lucide-react';
import { LawReviewArticle } from '../types';

interface ArticleModalProps {
  article: LawReviewArticle | null;
  onClose: () => void;
  onConsultThesis: (articleTitle: string) => void;
}

export const ArticleModal: React.FC<ArticleModalProps> = ({
  article,
  onClose,
  onConsultThesis,
}) => {
  if (!article) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#13060A] border border-[#D4AF37]/50 rounded-2xl max-w-3xl w-full p-8 md:p-10 shadow-2xl relative my-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-6 right-6 text-[#A79388] hover:text-[#FDF9F3] cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-3 text-xs font-data-mono text-[#8F785A] mb-3">
          <span className="bg-[#D4AF37]/10 text-[#D4AF37] px-2.5 py-0.5 rounded border border-[#D4AF37]/20 font-semibold">
            {article.categoryLabel}
          </span>
          <span>{article.readTime}</span>
          <span>•</span>
          <span className="flex items-center gap-1 text-[#E8D8CE]">
            <BookOpen className="w-3.5 h-3.5 text-[#C5A880]" />
            {article.author}
          </span>
        </div>

        <h2 className="font-display-hero text-2xl md:text-3xl font-bold text-[#FDF9F3] mb-6 leading-tight">
          {article.title}
        </h2>

        <div className="border-y border-[#431520] py-4 mb-6 bg-[#0B0305]/50 px-4 rounded">
          <span className="text-[10px] font-data-mono uppercase tracking-widest text-[#D4AF37] block mb-1">
            Síntese Dogmática
          </span>
          <p className="text-xs text-[#E8D8CE] italic leading-relaxed">
            "{article.abstract}"
          </p>
        </div>

        <div className="space-y-4 text-sm text-[#E8D8CE] leading-relaxed font-light mb-8 text-justify">
          {article.fullContent.map((paragraph, idx) => (
            <p key={idx}>{paragraph}</p>
          ))}
        </div>

        {article.keyPrecedents.length > 0 && (
          <div className="bg-[#180A0E] p-5 rounded-lg border border-[#431520] mb-8">
            <span className="text-xs font-data-mono text-[#D4AF37] font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <Scale className="w-4 h-4 text-[#D4AF37]" />
              Precedentes & Súmulas Citadas
            </span>
            <ul className="space-y-2 text-xs font-data-mono text-[#A79388]">
              {article.keyPrecedents.map((prec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[#D4AF37] font-bold">•</span>
                  <span className="text-[#E8D8CE]">{prec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-[#431520]">
          <span className="text-[11px] font-data-mono text-[#A79388]">
            DIREITOS DE REPRODUÇÃO RESERVADOS À BANCA
          </span>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border border-[#431520] text-xs font-data-mono text-[#A79388] hover:text-[#FDF9F3] cursor-pointer"
            >
              Fechar Artigo
            </button>
            <button
              type="button"
              onClick={() => {
                onConsultThesis(article.title);
                onClose();
              }}
              className="px-5 py-2.5 rounded bg-gradient-to-r from-[#D4AF37] to-[#C5A880] text-[#0B0305] text-xs font-data-mono font-bold uppercase tracking-wider hover:brightness-110 flex items-center gap-2 cursor-pointer"
            >
              <span>Consultar Parecer com Autor</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
