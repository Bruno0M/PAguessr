import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CHAMPIONSHIP_SIZES,
  type ChampionshipSize,
  ROUND_DURATION_MIN_SECONDS,
  ROUND_DURATION_MAX_SECONDS,
  ROUND_DURATION_DEFAULT_SECONDS,
  phasesFor,
  CHAMPIONSHIP_TITLE_MIN_LENGTH,
  CHAMPIONSHIP_TITLE_MAX_LENGTH,
  CHAMPIONSHIP_DESCRIPTION_MAX_LENGTH,
  CHAMPIONSHIP_BANNER_URL_MAX_LENGTH,
  CHAMPIONSHIP_ROUNDS_PER_MATCH_MIN,
  CHAMPIONSHIP_ROUNDS_PER_MATCH_MAX,
  CHAMPIONSHIP_PHASE_INTERVAL_MIN_SECONDS,
  CHAMPIONSHIP_PHASE_INTERVAL_MAX_SECONDS,
  type ChampionshipStatus,
} from '@paguessr/shared';
import {
  getAdminChampionships,
  createAdminChampionship,
  updateAdminChampionship,
  deleteAdminChampionship,
  startAdminChampionship,
  advanceAdminChampionship,
  type AdminChampionship,
  type CreateChampionshipPayload,
  type UpdateChampionshipPayload,
} from '../../api/adminChampionships';
import './AdminChampionshipsPage.css';

export interface AdminChampionshipsPageProps {
  onError?: (err: unknown) => void;
}

const STATUS_LABELS: Record<ChampionshipStatus, string> = {
  inscricoes: 'Inscrições',
  chaveado: 'Chaveado',
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

export function AdminChampionshipsPage({ onError }: AdminChampionshipsPageProps = {}) {
  const [championships, setChampionships] = useState<AdminChampionship[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [selectedChamp, setSelectedChamp] = useState<AdminChampionship | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [maxParticipants, setMaxParticipants] = useState<ChampionshipSize>(8);
  const [roundsPerMatch, setRoundsPerMatch] = useState(5);
  const [roundDurationSeconds, setRoundDurationSeconds] = useState(ROUND_DURATION_DEFAULT_SECONDS);
  const [phaseIntervalSeconds, setPhaseIntervalSeconds] = useState(86400);

  const [champToDelete, setChampToDelete] = useState<AdminChampionship | null>(null);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const formDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  const loadList = useCallback(async () => {
    try {
      setPageError(null);
      const data = await getAdminChampionships();
      setChampionships(data);
    } catch (err: unknown) {
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    const dialog = formDialogRef.current;
    if (!dialog) return;

    if (dialogMode !== null && !dialog.open) {
      dialog.showModal();
    } else if (dialogMode === null && dialog.open) {
      dialog.close();
    }
  }, [dialogMode]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;

    if (champToDelete !== null && !dialog.open) {
      dialog.showModal();
    } else if (champToDelete === null && dialog.open) {
      dialog.close();
    }
  }, [champToDelete]);

  const openCreateDialog = () => {
    setSelectedChamp(null);
    setTitle('');
    setDescription('');
    setBannerUrl('');
    setMaxParticipants(8);
    setRoundsPerMatch(5);
    setRoundDurationSeconds(ROUND_DURATION_DEFAULT_SECONDS);
    setPhaseIntervalSeconds(86400);
    setFormError(null);
    setDialogMode('create');
  };

  const openEditDialog = (champ: AdminChampionship) => {
    setSelectedChamp(champ);
    setTitle(champ.title);
    setDescription(champ.description ?? '');
    setBannerUrl(champ.banner_url ?? '');
    setMaxParticipants(champ.max_participants);
    setRoundsPerMatch(champ.rounds_per_match);
    setRoundDurationSeconds(champ.round_duration_seconds);
    setPhaseIntervalSeconds(champ.phase_interval_seconds);
    setFormError(null);
    setDialogMode('edit');
  };

  const closeFormDialog = () => {
    if (isSubmitting) return;
    setDialogMode(null);
    setSelectedChamp(null);
    setFormError(null);
  };

  const openDeleteDialog = (champ: AdminChampionship) => {
    setChampToDelete(champ);
    setConfirmTitle('');
    setDeleteError(null);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) return;
    setChampToDelete(null);
    setConfirmTitle('');
    setDeleteError(null);
  };

  const handleStart = async (champ: AdminChampionship) => {
    if (champ.status !== 'chaveado') return;
    try {
      setActionLoadingId(champ.id);
      setPageError(null);
      await startAdminChampionship(champ.id);
      await loadList();
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Falha ao iniciar campeonato.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAdvance = async (champ: AdminChampionship) => {
    if (champ.status !== 'em_andamento') return;
    try {
      setActionLoadingId(champ.id);
      setPageError(null);
      await advanceAdminChampionship(champ.id);
      await loadList();
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Falha ao avançar fase.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedTitle = title.trim();
    if (
      trimmedTitle.length < CHAMPIONSHIP_TITLE_MIN_LENGTH ||
      trimmedTitle.length > CHAMPIONSHIP_TITLE_MAX_LENGTH
    ) {
      setFormError(
        `O título deve ter entre ${CHAMPIONSHIP_TITLE_MIN_LENGTH} e ${CHAMPIONSHIP_TITLE_MAX_LENGTH} caracteres.`
      );
      return;
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription.length > CHAMPIONSHIP_DESCRIPTION_MAX_LENGTH) {
      setFormError(
        `A descrição pode ter no máximo ${CHAMPIONSHIP_DESCRIPTION_MAX_LENGTH} caracteres.`
      );
      return;
    }

    const trimmedBanner = bannerUrl.trim();
    if (trimmedBanner) {
      if (trimmedBanner.length > CHAMPIONSHIP_BANNER_URL_MAX_LENGTH) {
        setFormError(
          `A URL do banner pode ter no máximo ${CHAMPIONSHIP_BANNER_URL_MAX_LENGTH} caracteres.`
        );
        return;
      }
      if (!/^https?:\/\//i.test(trimmedBanner)) {
        setFormError('A URL do banner deve começar com http:// ou https://');
        return;
      }
    }

    const participantsCount = selectedChamp?.participant_count ?? selectedChamp?.participants ?? 0;

    if (dialogMode === 'create' || selectedChamp?.status === 'inscricoes') {
      if (!CHAMPIONSHIP_SIZES.includes(maxParticipants)) {
        setFormError('O número de vagas deve ser 4, 8, 16 ou 32.');
        return;
      }
      if (dialogMode === 'edit' && maxParticipants < participantsCount) {
        setFormError(
          `O número de vagas não pode ser menor que o total de inscritos (${participantsCount}).`
        );
        return;
      }
      if (
        roundsPerMatch < CHAMPIONSHIP_ROUNDS_PER_MATCH_MIN ||
        roundsPerMatch > CHAMPIONSHIP_ROUNDS_PER_MATCH_MAX
      ) {
        setFormError(
          `Rodadas por confronto devem ser entre ${CHAMPIONSHIP_ROUNDS_PER_MATCH_MIN} e ${CHAMPIONSHIP_ROUNDS_PER_MATCH_MAX}.`
        );
        return;
      }
      if (
        roundDurationSeconds < ROUND_DURATION_MIN_SECONDS ||
        roundDurationSeconds > ROUND_DURATION_MAX_SECONDS
      ) {
        setFormError(
          `Duração por rodada deve ser entre ${ROUND_DURATION_MIN_SECONDS}s e ${ROUND_DURATION_MAX_SECONDS}s.`
        );
        return;
      }
      if (
        phaseIntervalSeconds < CHAMPIONSHIP_PHASE_INTERVAL_MIN_SECONDS ||
        phaseIntervalSeconds > CHAMPIONSHIP_PHASE_INTERVAL_MAX_SECONDS
      ) {
        setFormError(
          `Intervalo entre fases deve ser entre ${CHAMPIONSHIP_PHASE_INTERVAL_MIN_SECONDS}s e ${CHAMPIONSHIP_PHASE_INTERVAL_MAX_SECONDS}s.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (dialogMode === 'create') {
        const payload: CreateChampionshipPayload = {
          title: trimmedTitle,
          description: trimmedDescription || null,
          banner_url: trimmedBanner || null,
          max_participants: maxParticipants,
          rounds_per_match: roundsPerMatch,
          round_duration_seconds: roundDurationSeconds,
          phase_interval_seconds: phaseIntervalSeconds,
        };
        await createAdminChampionship(payload);
      } else if (selectedChamp) {
        let payload: UpdateChampionshipPayload;
        if (selectedChamp.status === 'inscricoes') {
          payload = {
            title: trimmedTitle,
            description: trimmedDescription || null,
            banner_url: trimmedBanner || null,
            max_participants: maxParticipants,
            rounds_per_match: roundsPerMatch,
            round_duration_seconds: roundDurationSeconds,
            phase_interval_seconds: phaseIntervalSeconds,
          };
        } else {
          payload = {
            title: trimmedTitle,
            description: trimmedDescription || null,
            banner_url: trimmedBanner || null,
          };
        }
        await updateAdminChampionship(selectedChamp.id, payload);
      }
      closeFormDialog();
      await loadList();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Falha ao salvar campeonato.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!champToDelete) return;
    if (champToDelete.status !== 'inscricoes' && confirmTitle !== champToDelete.title) {
      setDeleteError('O título digitado não confere.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteAdminChampionship(champToDelete.id);
      closeDeleteDialog();
      await loadList();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Falha ao excluir campeonato.');
    } finally {
      setIsDeleting(false);
    }
  };

  const isEditing = dialogMode === 'edit';
  const currentStatus = selectedChamp?.status ?? 'inscricoes';
  const isFinalizado = currentStatus === 'finalizado' || currentStatus === 'cancelado';
  const isTitleDescBannerDisabled = isEditing && isFinalizado;
  const isConfigFieldsDisabled = isEditing && currentStatus !== 'inscricoes';
  const currentParticipantsCount =
    selectedChamp?.participant_count ?? selectedChamp?.participants ?? 0;

  return (
    <div className="admin-championships-page">
      <div className="admin-page-header">
        <div className="admin-page-header-info">
          <h1 className="admin-page-title">Campeonatos</h1>
          <p className="admin-page-subtitle">
            Gerencie torneios mata-mata 1v1, configurações e chaveamentos.
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-secondary" onClick={openCreateDialog}>
          + Novo Campeonato
        </button>
      </div>

      {pageError && <div className="admin-dialog-alert admin-dialog-alert-danger">{pageError}</div>}

      {loading ? (
        <div className="admin-status">
          <div className="spinner large"></div>
          <h2 style={{ marginTop: '1rem', fontSize: '1.15rem' }}>Carregando campeonatos...</h2>
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Status</th>
                <th>Vagas</th>
                <th>Fase Atual</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {championships.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="admin-table-empty">
                      <span>Nenhum campeonato criado ainda.</span>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        onClick={openCreateDialog}
                      >
                        Criar o primeiro
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                championships.map((champ) => {
                  const participants = champ.participant_count ?? champ.participants ?? 0;
                  const totalPhases = phasesFor(champ.max_participants);
                  const currentPhase = champ.current_phase ?? champ.currentPhase;

                  let phaseText = '-';
                  if (champ.status === 'em_andamento') {
                    if (currentPhase && currentPhase >= totalPhases) {
                      phaseText = `Final (${currentPhase}/${totalPhases})`;
                    } else {
                      phaseText = `Fase ${currentPhase ?? 1}/${totalPhases}`;
                    }
                  } else if (champ.status === 'finalizado') {
                    phaseText = 'Finalizado';
                  }

                  const isActionBusy = actionLoadingId === champ.id;

                  return (
                    <tr key={champ.id}>
                      <td>
                        <div className="champ-title-cell">
                          <span className="champ-title-text">{champ.title}</span>
                          {champ.description && (
                            <span className="champ-desc-text" title={champ.description}>
                              {champ.description}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`champ-status-badge champ-status-${champ.status}`}>
                          {STATUS_LABELS[champ.status] ?? champ.status}
                        </span>
                      </td>
                      <td>
                        <span className="champ-vagas-pill">
                          <strong>{participants}</strong>/{champ.max_participants}
                        </span>
                      </td>
                      <td>{phaseText}</td>
                      <td>
                        <div className="champ-row-actions">
                          <button
                            type="button"
                            className="admin-action-btn admin-action-start"
                            title={
                              champ.status === 'chaveado'
                                ? 'Dar a largada no campeonato'
                                : 'Só é possível iniciar quando o status for "Chaveado"'
                            }
                            disabled={champ.status !== 'chaveado' || isActionBusy}
                            onClick={() => handleStart(champ)}
                          >
                            {isActionBusy ? '...' : 'Iniciar'}
                          </button>
                          {champ.status === 'em_andamento' && (
                            <button
                              type="button"
                              className="admin-action-btn admin-action-advance"
                              title="Forçar avaliação de avanço de fase"
                              disabled={isActionBusy}
                              onClick={() => handleAdvance(champ)}
                            >
                              Avançar
                            </button>
                          )}
                          <button
                            type="button"
                            className="admin-action-btn admin-btn-secondary"
                            onClick={() => openEditDialog(champ)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="admin-action-btn admin-btn-danger"
                            onClick={() => openDeleteDialog(champ)}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <dialog
        ref={formDialogRef}
        className="admin-dialog"
        aria-labelledby="championship-dialog-title"
        onClose={closeFormDialog}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeFormDialog();
        }}
      >
        <div className="admin-dialog-panel">
          <div className="admin-dialog-header">
            <h2 id="championship-dialog-title">
              {dialogMode === 'create' ? 'Novo Campeonato' : 'Editar Campeonato'}
            </h2>
            <button
              type="button"
              className="admin-dialog-close"
              aria-label="Fechar"
              onClick={closeFormDialog}
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmitForm}>
            <div className="admin-dialog-body">
              {formError && (
                <div className="admin-dialog-alert admin-dialog-alert-danger">{formError}</div>
              )}

              {isEditing && currentStatus !== 'inscricoes' && (
                <div className="admin-dialog-alert admin-dialog-alert-warning">
                  {isFinalizado
                    ? 'Campeonato finalizado/cancelado: nenhum campo pode ser alterado.'
                    : 'Campeonato em andamento ou chaveado: apenas título, descrição e banner podem ser alterados.'}
                </div>
              )}

              <div className="admin-form-group">
                <label htmlFor="champ-title">Título *</label>
                <input
                  id="champ-title"
                  type="text"
                  required
                  disabled={isTitleDescBannerDisabled}
                  minLength={CHAMPIONSHIP_TITLE_MIN_LENGTH}
                  maxLength={CHAMPIONSHIP_TITLE_MAX_LENGTH}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Torneio da Primavera 2026"
                />
                <span className="admin-form-hint">
                  {CHAMPIONSHIP_TITLE_MIN_LENGTH} a {CHAMPIONSHIP_TITLE_MAX_LENGTH} caracteres.
                </span>
              </div>

              <div className="admin-form-group">
                <label htmlFor="champ-desc">Descrição</label>
                <textarea
                  id="champ-desc"
                  rows={3}
                  disabled={isTitleDescBannerDisabled}
                  maxLength={CHAMPIONSHIP_DESCRIPTION_MAX_LENGTH}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detalhes ou regras adicionais sobre o campeonato"
                />
              </div>

              <div className="admin-form-group">
                <label htmlFor="champ-banner">URL do Banner</label>
                <input
                  id="champ-banner"
                  type="url"
                  disabled={isTitleDescBannerDisabled}
                  maxLength={CHAMPIONSHIP_BANNER_URL_MAX_LENGTH}
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  placeholder="https://exemplo.com/banner.jpg"
                />
                <span className="admin-form-hint">URL de imagem externa (opcional).</span>
              </div>

              <div className="admin-form-row">
                <div className="admin-form-group">
                  <label htmlFor="champ-vagas">Vagas (Participantes) *</label>
                  <select
                    id="champ-vagas"
                    disabled={isConfigFieldsDisabled || isFinalizado}
                    value={maxParticipants}
                    onChange={(e) => setMaxParticipants(Number(e.target.value) as ChampionshipSize)}
                  >
                    {CHAMPIONSHIP_SIZES.map((size) => (
                      <option
                        key={size}
                        value={size}
                        disabled={
                          isEditing &&
                          currentStatus === 'inscricoes' &&
                          size < currentParticipantsCount
                        }
                      >
                        {size} jogadores ({phasesFor(size)} fases)
                        {isEditing && size < currentParticipantsCount
                          ? ` - mínimo ${currentParticipantsCount} inscritos`
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-form-group">
                  <label htmlFor="champ-rounds">Locais por Duelo *</label>
                  <input
                    id="champ-rounds"
                    type="number"
                    disabled={isConfigFieldsDisabled || isFinalizado}
                    min={CHAMPIONSHIP_ROUNDS_PER_MATCH_MIN}
                    max={CHAMPIONSHIP_ROUNDS_PER_MATCH_MAX}
                    value={roundsPerMatch}
                    onChange={(e) => setRoundsPerMatch(Number(e.target.value))}
                  />
                  <span className="admin-form-hint">
                    {CHAMPIONSHIP_ROUNDS_PER_MATCH_MIN} a {CHAMPIONSHIP_ROUNDS_PER_MATCH_MAX}{' '}
                    rodadas
                  </span>
                </div>
              </div>

              <div className="admin-form-row">
                <div className="admin-form-group">
                  <label htmlFor="champ-duration">Tempo por Rodada (s) *</label>
                  <input
                    id="champ-duration"
                    type="number"
                    disabled={isConfigFieldsDisabled || isFinalizado}
                    min={ROUND_DURATION_MIN_SECONDS}
                    max={ROUND_DURATION_MAX_SECONDS}
                    value={roundDurationSeconds}
                    onChange={(e) => setRoundDurationSeconds(Number(e.target.value))}
                  />
                  <span className="admin-form-hint">
                    {ROUND_DURATION_MIN_SECONDS}s a {ROUND_DURATION_MAX_SECONDS}s (padrão{' '}
                    {ROUND_DURATION_DEFAULT_SECONDS}s)
                  </span>
                </div>

                <div className="admin-form-group">
                  <label htmlFor="champ-interval">Intervalo entre Fases (s) *</label>
                  <input
                    id="champ-interval"
                    type="number"
                    disabled={isConfigFieldsDisabled || isFinalizado}
                    min={CHAMPIONSHIP_PHASE_INTERVAL_MIN_SECONDS}
                    max={CHAMPIONSHIP_PHASE_INTERVAL_MAX_SECONDS}
                    value={phaseIntervalSeconds}
                    onChange={(e) => setPhaseIntervalSeconds(Number(e.target.value))}
                  />
                  <span className="admin-form-hint">
                    {Math.round(phaseIntervalSeconds / 60)} min (
                    {Math.round((phaseIntervalSeconds / 3600) * 10) / 10}h)
                  </span>
                </div>
              </div>
            </div>

            <div className="admin-dialog-footer">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={closeFormDialog}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="admin-btn admin-btn-secondary"
                disabled={isFinalizado || isSubmitting}
              >
                {isSubmitting
                  ? 'Salvando...'
                  : dialogMode === 'create'
                    ? 'Criar Campeonato'
                    : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      </dialog>

      <dialog
        ref={deleteDialogRef}
        className="admin-dialog admin-dialog-delete"
        aria-labelledby="delete-dialog-title"
        onClose={closeDeleteDialog}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeDeleteDialog();
        }}
      >
        <div className="admin-dialog-panel">
          <div className="admin-dialog-header">
            <h2 id="delete-dialog-title">Excluir Campeonato</h2>
            <button
              type="button"
              className="admin-dialog-close"
              aria-label="Fechar"
              onClick={closeDeleteDialog}
            >
              ×
            </button>
          </div>

          <div className="admin-dialog-body">
            {deleteError && (
              <div className="admin-dialog-alert admin-dialog-alert-danger">{deleteError}</div>
            )}

            {champToDelete && (
              <>
                {champToDelete.status === 'inscricoes' ? (
                  <p>
                    Tem certeza que deseja excluir o campeonato{' '}
                    <strong>"{champToDelete.title}"</strong>? Esta ação é irreversível.
                  </p>
                ) : (
                  <div>
                    <p style={{ color: 'var(--pa-danger, #ef8e73)', fontWeight: 600 }}>
                      Atenção: este campeonato já não está em inscrições (status:{' '}
                      {STATUS_LABELS[champToDelete.status]}).
                    </p>
                    <p style={{ marginTop: '0.5rem' }}>
                      A exclusão apagará todos os confrontos, participantes e histórico associados.
                      Para confirmar, digite exatamente o título do campeonato abaixo:
                    </p>
                    <p style={{ userSelect: 'all', fontWeight: 700, marginTop: '0.25rem' }}>
                      {champToDelete.title}
                    </p>
                    <input
                      type="text"
                      className="admin-confirm-input"
                      style={{ width: '100%' }}
                      placeholder="Digite o título do campeonato"
                      value={confirmTitle}
                      onChange={(e) => setConfirmTitle(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="admin-dialog-footer">
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={closeDeleteDialog}
              disabled={isDeleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-danger"
              disabled={
                isDeleting ||
                (champToDelete?.status !== 'inscricoes' && confirmTitle !== champToDelete?.title)
              }
              onClick={handleDelete}
            >
              {isDeleting ? 'Excluindo...' : 'Excluir Definitivamente'}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
