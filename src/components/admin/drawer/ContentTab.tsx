import React from 'react';
import { Plus, BookOpen, Building2 } from 'lucide-react';

export interface NewPracticeState {
  title: string;
  category: string;
  description: string;
  leadership: string;
}

export interface NewArticleState {
  title: string;
  category: 'tributario' | 'stf' | 'arbitragem';
  categoryLabel: string;
  readTime: string;
  author: string;
  abstract: string;
}

interface ContentTabProps {
  newPractice: NewPracticeState;
  setNewPractice: React.Dispatch<React.SetStateAction<NewPracticeState>>;
  handleCreatePractice: (e: React.SyntheticEvent<HTMLFormElement>) => void;
  newArticle: NewArticleState;
  setNewArticle: React.Dispatch<React.SetStateAction<NewArticleState>>;
  handleCreateArticle: (e: React.SyntheticEvent<HTMLFormElement>) => void;
}

export const ContentTab: React.FC<ContentTabProps> = ({
  newPractice,
  setNewPractice,
  handleCreatePractice,
  newArticle,
  setNewArticle,
  handleCreateArticle,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-[#180A0E] p-4 rounded-xl border border-[#431520] flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider font-bold">
              Gestão de Conteúdo Institucional & Publicações
            </span>
          </div>
          <p className="text-xs text-[#A79388]">
            Adicione novas áreas de atuação jurisdicional e artigos doutrinários ao portal.
          </p>
        </div>
      </div>

      {/* Form Area Practice */}
      <form onSubmit={handleCreatePractice} className="bg-[#180A0E] p-4 rounded-xl border border-[#431520] space-y-4">
        <div className="flex items-center gap-2 text-xs font-data-mono text-[#D4AF37] uppercase">
          <Building2 className="w-4 h-4" />
          <span>Cadastrar Nova Área de Atuação</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="practice-title-input" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Título da Prática
            </label>
            <input
              id="practice-title-input"
              type="text"
              required
              value={newPractice.title}
              onChange={(e) => setNewPractice({ ...newPractice, title: e.target.value })}
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none"
              placeholder="Ex: Contencioso Tributário de Grande Porte"
            />
          </div>

          <div>
            <label htmlFor="practice-category-input" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Categoria / Rótulo
            </label>
            <input
              id="practice-category-input"
              type="text"
              value={newPractice.category}
              onChange={(e) => setNewPractice({ ...newPractice, category: e.target.value })}
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none"
              placeholder="Ex: TRIBUTÁRIO & FISCAL"
            />
          </div>

          <div>
            <label htmlFor="practice-leadership-input" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Sócio Lança / Liderança
            </label>
            <input
              id="practice-leadership-input"
              type="text"
              value={newPractice.leadership}
              onChange={(e) => setNewPractice({ ...newPractice, leadership: e.target.value })}
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none"
              placeholder="Ex: DR. CARLOS ALBERTO SILVEIRA"
            />
          </div>

          <div>
            <label htmlFor="practice-description-input" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Resumo da Atuação
            </label>
            <input
              id="practice-description-input"
              type="text"
              value={newPractice.description}
              onChange={(e) => setNewPractice({ ...newPractice, description: e.target.value })}
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none"
              placeholder="Defesa em teses de repercussão geral no STF..."
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 bg-[#D4AF37] text-[#0B0305] rounded font-data-mono font-bold text-xs uppercase tracking-wider hover:brightness-110 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Área de Prática</span>
          </button>
        </div>
      </form>

      {/* Form Law Review Article */}
      <form onSubmit={handleCreateArticle} className="bg-[#180A0E] p-4 rounded-xl border border-[#431520] space-y-4">
        <div className="flex items-center gap-2 text-xs font-data-mono text-[#D4AF37] uppercase">
          <BookOpen className="w-4 h-4" />
          <span>Publicar Artigo Doutrinário / Law Review</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor="article-title-input" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Título da Publicação
            </label>
            <input
              id="article-title-input"
              type="text"
              required
              value={newArticle.title}
              onChange={(e) => setNewArticle({ ...newArticle, title: e.target.value })}
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none"
              placeholder="Ex: Impactos da Reforma Tributária nos Agronegócios Exportadores"
            />
          </div>

          <div>
            <label htmlFor="article-category-select" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Área do Direito
            </label>
            <select
              id="article-category-select"
              value={newArticle.category}
              onChange={(e) =>
                setNewArticle({
                  ...newArticle,
                  category: e.target.value as NewArticleState['category'],
                })
              }
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none"
            >
              <option value="tributario">Direito Tributário</option>
              <option value="stf">Cortes Superiores (STF / STJ)</option>
              <option value="arbitragem">Arbitragem Internacional</option>
            </select>
          </div>

          <div>
            <label htmlFor="article-author-input" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Autor / Relator
            </label>
            <input
              id="article-author-input"
              type="text"
              value={newArticle.author}
              onChange={(e) => setNewArticle({ ...newArticle, author: e.target.value })}
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none"
              placeholder="Ex: PROF. DR. MARCOS CARVALHO"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="article-abstract-input" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Ementa / Resumo Doutrinário
            </label>
            <textarea
              id="article-abstract-input"
              rows={3}
              value={newArticle.abstract}
              onChange={(e) => setNewArticle({ ...newArticle, abstract: e.target.value })}
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none"
              placeholder="Análise crítica sobre a imunidade de PIS/COFINS nas receitas de exportação..."
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 bg-[#D4AF37] text-[#0B0305] rounded font-data-mono font-bold text-xs uppercase tracking-wider hover:brightness-110 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Publicar Artigo</span>
          </button>
        </div>
      </form>
    </div>
  );
};
