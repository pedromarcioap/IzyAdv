import React from 'react';
import { UserPlus, ShieldAlert, Trash2, KeyRound, Copy, Check } from 'lucide-react';
import { AdminUser } from '../../../types';

const getUserRoleBadgeClass = (role: string) => {
  if (role === 'Master Admin') return 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/40';
  if (role === 'Sócio Titular') return 'bg-emerald-950/50 text-emerald-300 border-emerald-800';
  return 'bg-[#180A0E] text-[#C5A880] border-[#431520]';
};

export interface NewUserFormState {
  name: string;
  email: string;
  role: 'Master Admin' | 'Sócio Titular' | 'Advogado Associado';
}

interface UsersTabProps {
  isAdmin: boolean;
  isMasterAdmin: boolean;
  userList: AdminUser[];
  currentUser: AdminUser | null;
  newUserForm: NewUserFormState;
  setNewUserForm: React.Dispatch<React.SetStateAction<NewUserFormState>>;
  userLoading: boolean;
  userError: string | null;
  userSuccess: string | null;
  recoveryLink: string | null;
  handleCreateUser: (e: React.SyntheticEvent<HTMLFormElement>) => void;
  handleDeleteUser: (id: string, email: string) => void;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  isAdmin,
  isMasterAdmin,
  userList,
  currentUser,
  newUserForm,
  setNewUserForm,
  userLoading,
  userError,
  userSuccess,
  recoveryLink,
  handleCreateUser,
  handleDeleteUser,
}) => {
  const [copiedLink, setCopiedLink] = React.useState(false);

  const copyRecoveryLink = () => {
    if (recoveryLink) {
      navigator.clipboard.writeText(recoveryLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#180A0E] p-4 rounded-xl border border-[#431520] flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UserPlus className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider font-bold">
              Gestão de Usuários Administradores (RBAC)
            </span>
          </div>
          <p className="text-xs text-[#A79388]">
            Controle de acesso por papel: Master Admin, Sócio Titular e Advogado Associado.
          </p>
        </div>
      </div>

      {!isAdmin && (
        <div className="p-3 bg-amber-950/40 border border-amber-800 text-amber-200 text-xs rounded flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Apenas Sócios Titulares e Master Admins têm acesso às configurações de usuários.</span>
        </div>
      )}

      {isAdmin && (
        <>
          {/* Form Create User */}
          <form onSubmit={handleCreateUser} className="bg-[#180A0E] p-4 rounded-xl border border-[#431520] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider block">
                Provisionar Novo Operador / Sócio
              </span>
              {!isMasterAdmin && (
                <span className="text-[10px] font-data-mono text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded">
                  Exige perfil Master Admin
                </span>
              )}
            </div>

            {userError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-200 text-xs rounded">
                {userError}
              </div>
            )}

            {userSuccess && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs rounded">
                {userSuccess}
              </div>
            )}

            {recoveryLink && (
              <div className="p-3 bg-[#240A11] border border-[#D4AF37]/40 rounded text-xs space-y-2">
                <div className="flex items-center gap-2 text-[#D4AF37] font-bold font-data-mono">
                  <KeyRound className="w-4 h-4 shrink-0" />
                  <span>Link Único de Configuração de Senha</span>
                </div>
                <p className="text-[11px] text-[#A79388] leading-relaxed">
                  Copie e envie o link abaixo para o usuário definir a credencial com segurança. Ele expira em 24h.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    readOnly
                    value={recoveryLink}
                    className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-[11px] font-data-mono text-[#FDF9F3]"
                  />
                  <button
                    type="button"
                    onClick={copyRecoveryLink}
                    className="px-3 py-2 bg-[#D4AF37] text-[#0B0305] rounded font-data-mono font-bold text-xs uppercase flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="user-name-input" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
                  Nome Completo
                </label>
                <input
                  id="user-name-input"
                  type="text"
                  disabled={!isMasterAdmin}
                  value={newUserForm.name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                  className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none disabled:opacity-50"
                  placeholder="Ex: Dra. Ana Paula Mendes"
                />
              </div>

              <div>
                <label htmlFor="user-email-input" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
                  E-mail Institucional
                </label>
                <input
                  id="user-email-input"
                  type="email"
                  disabled={!isMasterAdmin}
                  value={newUserForm.email}
                  onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none disabled:opacity-50"
                  placeholder="ana.mendes@veritas.adv.br"
                />
              </div>

              <div>
                <label htmlFor="user-role-select" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
                  Papel / Nível RBAC
                </label>
                <select
                  id="user-role-select"
                  disabled={!isMasterAdmin}
                  value={newUserForm.role}
                  onChange={(e) =>
                    setNewUserForm({
                      ...newUserForm,
                      role: e.target.value as NewUserFormState['role'],
                    })
                  }
                  className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none disabled:opacity-50"
                >
                  <option value="Advogado Associado">Advogado Associado</option>
                  <option value="Sócio Titular">Sócio Titular</option>
                  <option value="Master Admin">Master Admin</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!isMasterAdmin || userLoading}
                className="px-4 py-2 bg-[#D4AF37] text-[#0B0305] rounded font-data-mono font-bold text-xs uppercase tracking-wider hover:brightness-110 disabled:opacity-50 cursor-pointer"
              >
                {userLoading ? 'Criando Conta...' : 'Criar Conta de Acesso'}
              </button>
            </div>
          </form>

          {/* User List */}
          <div className="space-y-3">
            <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider block">
              Usuários Cadastrados ({userList.length})
            </span>

            <div className="space-y-2">
              {userList.map((user) => {
                const isSelf = currentUser?.id === user.id || currentUser?.email === user.email;
                return (
                  <div
                    key={user.id}
                    className="p-3 rounded-lg bg-[#180A0E] border border-[#431520] flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#FDF9F3]">
                          {user.name || user.email}
                        </span>
                        {isSelf && (
                          <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded font-data-mono">
                            Você
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#A79388] font-data-mono">{user.email}</div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getUserRoleBadgeClass(user.role)}`}>
                        {user.role}
                      </span>

                      {isMasterAdmin && !isSelf && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user.id, user.email)}
                          className="p-1.5 text-rose-400 hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                          title="Remover acesso do usuário"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
